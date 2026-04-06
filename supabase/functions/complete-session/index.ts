import { createClient } from "npm:@supabase/supabase-js@2";
import {
  fsrs,
  createEmptyCard,
  type Grade,
  State,
  type Card as FSRSCard,
} from "npm:ts-fsrs@5.3.2";

// DB の state カラム (text) と FSRS の State enum を相互変換
const FSRS_STATE_MAP: Record<string, State> = {
  New: State.New,
  Learning: State.Learning,
  Review: State.Review,
  Relearning: State.Relearning,
};

const FSRS_STATE_TEXT: Record<number, string> = {
  [State.New]: "New",
  [State.Learning]: "Learning",
  [State.Review]: "Review",
  [State.Relearning]: "Relearning",
};

const JSON_HEADERS = { "Content-Type": "application/json" } as const;

function jsonError(message: string, status: number): Response {
  return new Response(JSON.stringify({ error: message }), {
    status,
    headers: JSON_HEADERS,
  });
}

// --- Input validation ---

function isUUID(value: unknown): value is string {
  return (
    typeof value === "string" &&
    /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(
      value,
    )
  );
}

function isISODatetime(value: unknown): value is string {
  if (typeof value !== "string") return false;
  const d = new Date(value);
  return !isNaN(d.getTime());
}

type ReviewInput = {
  card_id: string;
  rating: 1 | 2 | 3 | 4;
  started_at: string;
  answered_at: string;
};

function validateRequest(body: unknown): {
  ok: true;
  session_id: string;
  reviews: ReviewInput[];
} | { ok: false; message: string } {
  if (!body || typeof body !== "object") {
    return { ok: false, message: "Request body must be a JSON object" };
  }

  const { session_id, reviews } = body as Record<string, unknown>;

  if (!isUUID(session_id)) {
    return { ok: false, message: "session_id must be a valid UUID" };
  }

  if (!Array.isArray(reviews) || reviews.length === 0) {
    return { ok: false, message: "reviews must be a non-empty array" };
  }

  for (let i = 0; i < reviews.length; i++) {
    const r = reviews[i] as Record<string, unknown>;
    if (!isUUID(r.card_id)) {
      return { ok: false, message: `reviews[${i}].card_id must be a valid UUID` };
    }
    if (typeof r.rating !== "number" || ![1, 2, 3, 4].includes(r.rating)) {
      return { ok: false, message: `reviews[${i}].rating must be 1, 2, 3, or 4` };
    }
    if (!isISODatetime(r.started_at)) {
      return { ok: false, message: `reviews[${i}].started_at must be a valid ISO datetime` };
    }
    if (!isISODatetime(r.answered_at)) {
      return { ok: false, message: `reviews[${i}].answered_at must be a valid ISO datetime` };
    }
  }

  return { ok: true, session_id, reviews: reviews as ReviewInput[] };
}

// --- Authorization ---
// Edge Function は Server Action から service_role key 経由で呼ばれる想定。
// Authorization ヘッダーの JWT から user_id を取得し、セッション所有者と照合する。

async function extractUserId(
  req: Request,
  supabase: ReturnType<typeof createClient>,
): Promise<string | null> {
  const authHeader = req.headers.get("Authorization");
  if (!authHeader?.startsWith("Bearer ")) return null;

  const token = authHeader.slice(7);
  const { data } = await supabase.auth.getUser(token);
  return data.user?.id ?? null;
}

Deno.serve(async (req) => {
  // 1. 入力バリデーション
  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return jsonError("Invalid JSON body", 400);
  }

  const validation = validateRequest(body);
  if (!validation.ok) {
    return jsonError(validation.message, 400);
  }

  const { session_id, reviews } = validation;

  const supabase = createClient(
    Deno.env.get("SUPABASE_URL")!,
    Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
  );

  // 2. セッション情報を取得
  const { data: session, error: sessionError } = await supabase
    .from("sessions")
    .select("material_id, method_id, user_id, duration_sec")
    .eq("id", session_id)
    .single();

  if (sessionError || !session) {
    return jsonError("Session not found", 404);
  }

  // 3. 認可チェック: JWT の user_id とセッション所有者が一致すること
  const callerId = await extractUserId(req, supabase);
  // service_role key (Server Action) 経由か、JWT で認証済みのユーザーのみ許可
  const authHeader = req.headers.get("Authorization") ?? "";
  const isServiceRole = authHeader === `Bearer ${Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")}`;

  if (!callerId && !isServiceRole) {
    return jsonError("Authentication required", 401);
  }
  if (callerId && callerId !== session.user_id) {
    return jsonError("Not authorized to complete this session", 403);
  }

  // 4. card_reviews 一括 INSERT
  const reviewRows = reviews.map((r) => ({
    session_id,
    card_id: r.card_id,
    rating: r.rating,
    response_ms:
      new Date(r.answered_at).getTime() - new Date(r.started_at).getTime(),
    reviewed_at: r.answered_at,
  }));

  const { error: reviewError } = await supabase
    .from("card_reviews")
    .insert(reviewRows);

  if (reviewError) {
    return jsonError(
      `card_reviews INSERT failed: ${reviewError.message}`,
      500,
    );
  }

  // 5. 各カードの現在の srs_states を取得
  const cardIds = reviews.map((r) => r.card_id);
  const { data: existingStates } = await supabase
    .from("srs_states")
    .select(
      "id, card_id, stability, difficulty, reps, lapses, due_date, state, last_reviewed_at",
    )
    .eq("user_id", session.user_id)
    .in("card_id", cardIds);

  const stateMap = new Map(
    (existingStates ?? []).map((s: { card_id: string }) => [s.card_id, s]),
  );

  // 6. FSRS-5 計算 + srs_states バッチ upsert
  // セッションあたり最大20枚の N+1 クエリを避け、1回の RPC で原子性とレイテンシを両立する
  const f = fsrs();
  const now = new Date();

  const newStates = reviews.map((review) => {
    const existing = stateMap.get(review.card_id) as
      | {
          id: string;
          stability: number;
          difficulty: number;
          reps: number;
          lapses: number;
          due_date: string;
          state: string;
          last_reviewed_at: string | null;
        }
      | undefined;

    let card: FSRSCard;
    if (existing) {
      const lastReview = existing.last_reviewed_at
        ? new Date(existing.last_reviewed_at)
        : undefined;
      const reviewTime = new Date(review.answered_at);
      card = {
        due: new Date(existing.due_date),
        stability: existing.stability,
        difficulty: existing.difficulty,
        elapsed_days: lastReview
          ? Math.max(
              0,
              Math.floor(
                (reviewTime.getTime() - lastReview.getTime()) / 86400000,
              ),
            )
          : 0,
        scheduled_days: 0,
        learning_steps: 0,
        reps: existing.reps,
        lapses: existing.lapses,
        state: FSRS_STATE_MAP[existing.state] ?? State.New,
        last_review: lastReview,
      };
    } else {
      card = createEmptyCard(new Date(review.answered_at));
    }

    // rating 1-4 は Grade (Again=1, Hard=2, Good=3, Easy=4) と一致
    const scheduling = f.repeat(card, new Date(review.answered_at));
    const result = scheduling[review.rating as Grade];
    const newCard = result.card;

    return {
      card_id: review.card_id,
      user_id: session.user_id,
      stability: newCard.stability,
      difficulty: newCard.difficulty,
      reps: newCard.reps,
      lapses: newCard.lapses,
      due_date: newCard.due.toISOString().split("T")[0],
      state: FSRS_STATE_TEXT[newCard.state] ?? "New",
      last_reviewed_at: review.answered_at,
    };
  });

  const { error: srsError } = await supabase.rpc("batch_upsert_srs_states", {
    p_states: newStates,
  });

  if (srsError) {
    return jsonError(
      `srs_states batch upsert failed: ${srsError.message}`,
      500,
    );
  }

  // 7. daily_logs upsert (wakeful rest = material_id NULL の場合はスキップ)
  if (session.material_id) {
    const { data: material } = await supabase
      .from("materials")
      .select("subject_id")
      .eq("id", session.material_id)
      .single();

    if (material) {
      const logDate = now.toISOString().split("T")[0];

      // PostgreSQL の ON CONFLICT で原子的に upsert（race condition 防止）
      const { error: logError } = await supabase.rpc("upsert_daily_log", {
        p_user_id: session.user_id,
        p_subject_id: material.subject_id,
        p_method_id: session.method_id,
        p_log_date: logDate,
        p_duration_sec: session.duration_sec ?? 0,
        p_cards_reviewed: reviews.length,
      });

      if (logError) {
        return jsonError(
          `daily_logs upsert failed: ${logError.message}`,
          500,
        );
      }
    }
  }

  return new Response(JSON.stringify({ success: true }), {
    headers: JSON_HEADERS,
  });
});
