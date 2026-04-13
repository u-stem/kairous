export function isUUID(value: unknown): value is string {
  return (
    typeof value === "string" &&
    /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(
      value,
    )
  );
}

// Date コンストラクタに丸投げするため "2026" 等の短縮形も通過する。
// Edge Function は内部 API 用途で呼び出し元が ISO 文字列を送る前提のため許容する。
export function isISODatetime(value: unknown): value is string {
  if (typeof value !== "string") return false;
  const d = new Date(value);
  return !isNaN(d.getTime());
}

export type ReviewInput = {
  card_id: string;
  rating: 1 | 2 | 3 | 4;
  started_at: string;
  answered_at: string;
};

export type ElaborationInput = {
  card_id: string;
  text: string;
};

// 精緻化テキストの DB 負荷を避けるため上限を設ける
// src/lib/constants.ts の VALIDATION_LIMITS.ELABORATION_TEXT_MAX と同値。Deno 環境のため import 不可
const ELABORATION_TEXT_MAX = 10000;

type ValidationSuccess = {
  ok: true;
  session_id: string;
  reviews: ReviewInput[];
  elaborations: ElaborationInput[];
};

type ValidationFailure = {
  ok: false;
  message: string;
};

export type ValidationResult = ValidationSuccess | ValidationFailure;

export function validateRequest(body: unknown): ValidationResult {
  if (!body || typeof body !== "object") {
    return { ok: false, message: "Request body must be a JSON object" };
  }

  const { session_id, reviews, elaborations } = body as Record<string, unknown>;

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

  // 同一 card_id の重複レビューは FSRS 計算の整合性を壊すため拒否する
  const cardIds = new Set<string>();
  for (let i = 0; i < reviews.length; i++) {
    const r = reviews[i] as Record<string, unknown>;
    if (cardIds.has(r.card_id as string)) {
      return { ok: false, message: `reviews[${i}].card_id is duplicated` };
    }
    cardIds.add(r.card_id as string);
  }

  // elaborations は optional。Elaboration 以外のメソッドは空配列を送る (省略可、null も許容)
  const validatedElaborations: ElaborationInput[] = [];
  if (elaborations !== undefined && elaborations !== null) {
    if (!Array.isArray(elaborations)) {
      return { ok: false, message: "elaborations must be an array" };
    }
    const elaborationCardIds = new Set<string>();
    for (let i = 0; i < elaborations.length; i++) {
      const e = elaborations[i] as Record<string, unknown>;
      if (!isUUID(e.card_id)) {
        return { ok: false, message: `elaborations[${i}].card_id must be a valid UUID` };
      }
      if (typeof e.text !== "string" || e.text.length === 0) {
        return { ok: false, message: `elaborations[${i}].text must be a non-empty string` };
      }
      if (e.text.length > ELABORATION_TEXT_MAX) {
        return {
          ok: false,
          message: `elaborations[${i}].text must be at most ${ELABORATION_TEXT_MAX} characters`,
        };
      }
      // 同一カードの elaboration が複数渡されると card_elaborations に重複行が作られ、
      // 履歴表示で「同じ時刻に同じ内容の記述が 2 件」のような異常表示になる
      if (elaborationCardIds.has(e.card_id as string)) {
        return { ok: false, message: `elaborations[${i}].card_id is duplicated` };
      }
      elaborationCardIds.add(e.card_id as string);
      validatedElaborations.push({ card_id: e.card_id as string, text: e.text });
    }
  }

  return {
    ok: true,
    session_id,
    reviews: reviews as ReviewInput[],
    elaborations: validatedElaborations,
  };
}
