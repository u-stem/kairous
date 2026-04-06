import { createClient } from "npm:@supabase/supabase-js@2";
import {
  fsrs,
  createEmptyCard,
  type Grade,
  State,
  type Card as FSRSCard,
} from "npm:ts-fsrs@5.3.2";
import { validateRequest } from "./validate.ts";

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

Deno.serve(async (req) => {
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

  const { data: session, error: sessionError } = await supabase
    .from("sessions")
    .select("material_id, method_id, user_id, duration_sec, learning_methods(slug)")
    .eq("id", session_id)
    .single();

  if (sessionError || !session) {
    return jsonError("Session not found", 404);
  }

  // JWT を Supabase Auth で検証し、user_id を取得する
  const authHeader = req.headers.get("Authorization");
  if (!authHeader?.startsWith("Bearer ")) {
    return jsonError("Authorization header is required", 401);
  }
  const { data: authData } = await supabase.auth.getUser(authHeader.slice(7));
  const callerId = authData.user?.id;
  if (!callerId) {
    return jsonError("Invalid or expired token", 401);
  }
  if (callerId !== session.user_id) {
    return jsonError("Not authorized to complete this session", 403);
  }

  const reviewRows = reviews.map((r) => ({
    card_id: r.card_id,
    rating: r.rating,
    response_ms:
      new Date(r.answered_at).getTime() - new Date(r.started_at).getTime(),
    reviewed_at: r.answered_at,
  }));

  const methodSlug = (session.learning_methods as { slug: string } | null)?.slug;
  if (!methodSlug) {
    return jsonError("Session has no associated learning method", 400);
  }

  // SRS のみ FSRS 計算 + srs_states 更新を実行する
  if (methodSlug === "srs") {
    // FSRS の差分計算に前回の状態が必要なため、既存の srs_states を取得する
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

    // N+1 クエリを避けるため、全カードの FSRS 計算を先に行い 1回の RPC でバッチ upsert する
    const f = fsrs();

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

    // card_reviews INSERT と srs_states UPSERT を単一トランザクションで実行
    const { error: completeError } = await supabase.rpc("complete_session_reviews", {
      p_session_id: session_id,
      p_user_id: callerId,
      p_reviews: reviewRows,
      p_srs_states: newStates,
    });

    if (completeError) {
      return jsonError(
        `complete_session_reviews failed: ${completeError.message}`,
        500,
      );
    }
  } else if (methodSlug === "elaboration") {
    // Elaboration は FSRS 計算なし。card_reviews のみ INSERT し daily_logs は後続で記録する
    const { error: completeError } = await supabase.rpc("complete_session_reviews", {
      p_session_id: session_id,
      p_user_id: callerId,
      p_reviews: reviewRows,
      p_srs_states: [],
    });

    if (completeError) {
      return jsonError(
        `complete_session_reviews failed: ${completeError.message}`,
        500,
      );
    }
  } else {
    // interleaving 等が追加された場合はここでハンドリングを追加する
    return jsonError(`Unsupported method: ${methodSlug}`, 400);
  }

  const now = new Date();

  // wakeful rest は教材に紐付かないため daily_logs の対象外
  if (session.material_id) {
    const { data: material } = await supabase
      .from("materials")
      .select("subject_id")
      .eq("id", session.material_id)
      .single();

    if (material) {
      // JST 基準で日付を算出。UTC の toISOString() では JST 23:00 が翌日扱いになる
      // src/lib/constants.ts の JST_OFFSET_MS と同値。Deno 環境のため import 不可
      const JST_OFFSET_MS = 9 * 60 * 60 * 1000;
      const logDate = new Date(now.getTime() + JST_OFFSET_MS)
        .toISOString()
        .split("T")[0];

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
