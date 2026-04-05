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
  // service_role key (Server Action 経由) の場合は JWT 検証をスキップ
  const callerId = await extractUserId(req, supabase);
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

  // 6. FSRS-5 計算 + srs_states 更新
  const f = fsrs();
  const now = new Date();

  for (const review of reviews) {
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
      card = {
        due: new Date(existing.due_date),
        stability: existing.stability,
        difficulty: existing.difficulty,
        elapsed_days: lastReview
          ? Math.max(
              0,
              Math.floor(
                (now.getTime() - lastReview.getTime()) / 86400000,
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
      card = createEmptyCard(now);
    }

    // rating 1-4 は Grade (Again=1, Hard=2, Good=3, Easy=4) と一致
    const scheduling = f.repeat(card, now);
    const result = scheduling[review.rating as Grade];
    const newCard = result.card;

    const newState = {
      card_id: review.card_id,
      user_id: session.user_id,
      stability: newCard.stability,
      difficulty: newCard.difficulty,
      reps: newCard.reps,
      lapses: newCard.lapses,
      due_date: newCard.due.toISOString().split("T")[0],
      state: FSRS_STATE_TEXT[newCard.state] ?? "New",
      last_reviewed_at: now.toISOString(),
    };

    if (existing) {
      const { error } = await supabase
        .from("srs_states")
        .update(newState)
        .eq("id", existing.id);
      if (error) {
        return jsonError(
          `srs_states UPDATE failed: ${error.message}`,
          500,
        );
      }
    } else {
      const { error } = await supabase.from("srs_states").insert(newState);
      if (error) {
        return jsonError(
          `srs_states INSERT failed: ${error.message}`,
          500,
        );
      }
    }
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

      const { data: existingLog } = await supabase
        .from("daily_logs")
        .select("id, total_sec, session_count, cards_reviewed")
        .eq("user_id", session.user_id)
        .eq("subject_id", material.subject_id)
        .eq("method_id", session.method_id)
        .eq("log_date", logDate)
        .single();

      if (existingLog) {
        const { error: logError } = await supabase
          .from("daily_logs")
          .update({
            total_sec: existingLog.total_sec + (session.duration_sec ?? 0),
            session_count: existingLog.session_count + 1,
            cards_reviewed: existingLog.cards_reviewed + reviews.length,
          })
          .eq("id", existingLog.id);
        if (logError) {
          return jsonError(
            `daily_logs UPDATE failed: ${logError.message}`,
            500,
          );
        }
      } else {
        const { error: logError } = await supabase
          .from("daily_logs")
          .insert({
            user_id: session.user_id,
            subject_id: material.subject_id,
            method_id: session.method_id,
            log_date: logDate,
            total_sec: session.duration_sec ?? 0,
            session_count: 1,
            cards_reviewed: reviews.length,
          });
        if (logError) {
          return jsonError(
            `daily_logs INSERT failed: ${logError.message}`,
            500,
          );
        }
      }
    }
  }

  return new Response(JSON.stringify({ success: true }), {
    headers: JSON_HEADERS,
  });
});
