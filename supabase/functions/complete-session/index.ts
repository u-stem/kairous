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

type ReviewWithTimestamps = {
  card_id: string;
  rating: number;
  answered_at: string;
};

type SrsStateRow = {
  card_id: string;
  user_id: string;
  stability: number;
  difficulty: number;
  reps: number;
  lapses: number;
  due_date: string;
  state: string;
  last_reviewed_at: string;
};

// SRS と interleaving で同一の FSRS 計算ロジックを共有するため抽出
async function computeFsrsStates(
  supabase: ReturnType<typeof createClient>,
  userId: string,
  reviews: ReviewWithTimestamps[],
): Promise<SrsStateRow[]> {
  const cardIds = reviews.map((r) => r.card_id);
  const { data: existingStates } = await supabase
    .from("srs_states")
    .select(
      "id, card_id, stability, difficulty, reps, lapses, due_date, state, last_reviewed_at",
    )
    .eq("user_id", userId)
    .in("card_id", cardIds);

  const stateMap = new Map(
    (existingStates ?? []).map((s: { card_id: string }) => [s.card_id, s]),
  );

  const f = fsrs();

  return reviews.map((review) => {
    const existing = stateMap.get(review.card_id) as
      | {
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

    const scheduling = f.repeat(card, new Date(review.answered_at));
    const result = scheduling[review.rating as Grade];
    const newCard = result.card;

    return {
      card_id: review.card_id,
      user_id: userId,
      stability: newCard.stability,
      difficulty: newCard.difficulty,
      reps: newCard.reps,
      lapses: newCard.lapses,
      due_date: newCard.due.toISOString().split("T")[0],
      state: FSRS_STATE_TEXT[newCard.state] ?? "New",
      last_reviewed_at: review.answered_at,
    };
  });
}

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

  const { session_id, reviews, elaborations } = validation;

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

  // SRS と interleaving は同じ FSRS アルゴリズムで srs_states を更新する
  if (methodSlug === "srs" || methodSlug === "interleaving") {
    // N+1 クエリを避けるため、全カードの FSRS 計算を先に行い 1回の RPC でバッチ upsert する
    const newStates = await computeFsrsStates(supabase, session.user_id, reviews);

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
    // Elaboration は FSRS 計算なし。card_reviews と card_elaborations を
    // 同一トランザクションで INSERT し partial success を防ぐ
    const { error: completeError } = await supabase.rpc("complete_session_reviews", {
      p_session_id: session_id,
      p_user_id: callerId,
      p_reviews: reviewRows,
      p_srs_states: [],
      p_elaborations: elaborations,
    });

    if (completeError) {
      return jsonError(
        `complete_session_reviews failed: ${completeError.message}`,
        500,
      );
    }
  } else {
    return jsonError(`Unsupported method: ${methodSlug}`, 400);
  }

  const now = new Date();
  // JST 基準で日付を算出。UTC の toISOString() では JST 23:00 が翌日扱いになる
  // src/lib/constants.ts の JST_OFFSET_MS と同値。Deno 環境のため import 不可
  const JST_OFFSET_MS = 9 * 60 * 60 * 1000;
  const logDate = new Date(now.getTime() + JST_OFFSET_MS).toISOString().split("T")[0];

  // wakeful rest は教材に紐付かないため daily_logs の対象外
  if (session.material_id) {
    const { data: material } = await supabase
      .from("materials")
      .select("subject_id")
      .eq("id", session.material_id)
      .single();

    if (material) {
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

  // Interleaving は material_id=NULL のため、session_materials 経由で教材ごとに daily_logs を按分する
  if (!session.material_id && methodSlug === "interleaving") {
    const { data: smRows } = await supabase
      .from("session_materials")
      .select("material_id")
      .eq("session_id", session_id);

    if (smRows && smRows.length > 0) {
      // カードが所属する教材ごとにレビュー枚数を集計する
      const cardMaterialMap = new Map<string, string>();
      const reviewCardIds = reviews.map((r) => r.card_id);
      const { data: cardRows } = await supabase
        .from("cards")
        .select("id, material_id")
        .in("id", reviewCardIds);

      if (cardRows) {
        for (const c of cardRows) {
          cardMaterialMap.set(c.id, c.material_id);
        }
      }

      // 教材ごとのカード枚数を集計
      const materialCardCounts = new Map<string, number>();
      for (const review of reviews) {
        const matId = cardMaterialMap.get(review.card_id);
        if (matId) {
          materialCardCounts.set(matId, (materialCardCounts.get(matId) ?? 0) + 1);
        }
      }

      const totalCards = reviews.length;
      const durationSec = session.duration_sec ?? 0;

      // 最初の教材のみ session_count=1、それ以降は 0 を渡して 1 セッション分だけ加算する
      let isFirstMaterial = true;

      for (const [materialId, cardCount] of materialCardCounts) {
        const { data: material } = await supabase
          .from("materials")
          .select("subject_id")
          .eq("id", materialId)
          .single();

        if (!material) continue;

        // カード枚数比で duration_sec を按分する
        const proportionalDuration = Math.round((cardCount / totalCards) * durationSec);

        const { error: logError } = await supabase.rpc("upsert_daily_log", {
          p_user_id: session.user_id,
          p_subject_id: material.subject_id,
          p_method_id: session.method_id,
          p_log_date: logDate,
          p_duration_sec: proportionalDuration,
          p_cards_reviewed: cardCount,
          p_session_count: isFirstMaterial ? 1 : 0,
        });

        if (logError) {
          return jsonError(
            `daily_logs upsert failed for material ${materialId}: ${logError.message}`,
            500,
          );
        }

        isFirstMaterial = false;
      }
    }
  }

  return new Response(JSON.stringify({ success: true }), {
    headers: JSON_HEADERS,
  });
});
