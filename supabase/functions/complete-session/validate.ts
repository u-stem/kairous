export function isUUID(value: unknown): value is string {
  return (
    typeof value === "string" &&
    /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(
      value,
    )
  );
}

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

type ValidationSuccess = {
  ok: true;
  session_id: string;
  reviews: ReviewInput[];
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

  // 同一 card_id の重複レビューは FSRS 計算の整合性を壊すため拒否する
  const cardIds = new Set<string>();
  for (let i = 0; i < reviews.length; i++) {
    const r = reviews[i] as Record<string, unknown>;
    if (cardIds.has(r.card_id as string)) {
      return { ok: false, message: `reviews[${i}].card_id is duplicated` };
    }
    cardIds.add(r.card_id as string);
  }

  return { ok: true, session_id, reviews: reviews as ReviewInput[] };
}
