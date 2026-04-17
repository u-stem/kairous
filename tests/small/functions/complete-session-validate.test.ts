import { describe, it, expect, assert } from "vitest";
import {
  isUUID,
  isISODatetime,
  validateRequest,
} from "../../../supabase/functions/complete-session/validate";

const VALID_UUID = "a0000000-0000-4000-a000-000000000001";
const VALID_UUID_2 = "b0000000-0000-4000-a000-000000000002";

function validReview(overrides?: Record<string, unknown>) {
  return {
    card_id: VALID_UUID,
    rating: 3,
    started_at: "2026-04-05T10:00:00.000Z",
    answered_at: "2026-04-05T10:00:05.000Z",
    ...overrides,
  };
}

describe("isUUID", () => {
  it("accepts valid lowercase UUID", () => {
    expect(isUUID("a0000000-0000-4000-a000-000000000001")).toBe(true);
  });

  it("accepts valid uppercase UUID", () => {
    expect(isUUID("A0000000-0000-4000-A000-000000000001")).toBe(true);
  });

  it("rejects number", () => {
    expect(isUUID(123)).toBe(false);
  });

  it("rejects null", () => {
    expect(isUUID(null)).toBe(false);
  });

  it("rejects undefined", () => {
    expect(isUUID(undefined)).toBe(false);
  });

  it("rejects non-UUID string", () => {
    expect(isUUID("not-a-uuid")).toBe(false);
  });

  it("rejects truncated UUID", () => {
    expect(isUUID("a0000000-0000-4000-a000")).toBe(false);
  });

  it("rejects empty string", () => {
    expect(isUUID("")).toBe(false);
  });
});

describe("isISODatetime", () => {
  it("accepts valid ISO 8601 datetime with UTC Z", () => {
    expect(isISODatetime("2026-04-05T10:00:00.000Z")).toBe(true);
  });

  it("accepts valid ISO 8601 datetime with timezone offset", () => {
    expect(isISODatetime("2026-04-05T10:00:00+09:00")).toBe(true);
  });

  it("accepts valid ISO 8601 datetime without fractional seconds", () => {
    expect(isISODatetime("2026-04-05T10:00:00Z")).toBe(true);
  });

  it("rejects date-only string so FSRS elapsed_days calculation is not skewed", () => {
    expect(isISODatetime("2026-04-05")).toBe(false);
  });

  it("rejects year-only short form so Date constructor fallback is closed", () => {
    expect(isISODatetime("2026")).toBe(false);
  });

  it("rejects datetime without timezone designator", () => {
    expect(isISODatetime("2026-04-05T10:00:00")).toBe(false);
  });

  it("rejects number", () => {
    expect(isISODatetime(123)).toBe(false);
  });

  it("rejects null", () => {
    expect(isISODatetime(null)).toBe(false);
  });

  it("rejects unparseable date strings", () => {
    expect(isISODatetime("not-a-date")).toBe(false);
  });
});

describe("validateRequest", () => {
  it("returns ok for valid input", () => {
    const result = validateRequest({
      session_id: VALID_UUID,
      reviews: [validReview()],
    });

    assert(result.ok);
    expect(result.session_id).toBe(VALID_UUID);
    expect(result.reviews).toHaveLength(1);
  });

  it("rejects null body", () => {
    const result = validateRequest(null);
    expect(result).toEqual({
      ok: false,
      message: "Request body must be a JSON object",
    });
  });

  it("rejects invalid session_id", () => {
    const result = validateRequest({
      session_id: "bad",
      reviews: [validReview()],
    });
    expect(result).toEqual({
      ok: false,
      message: "session_id must be a valid UUID",
    });
  });

  it("rejects empty reviews array", () => {
    const result = validateRequest({
      session_id: VALID_UUID,
      reviews: [],
    });
    expect(result).toEqual({
      ok: false,
      message: "reviews must be a non-empty array",
    });
  });

  it("rejects non-array reviews", () => {
    const result = validateRequest({
      session_id: VALID_UUID,
      reviews: "not-array",
    });
    expect(result).toEqual({
      ok: false,
      message: "reviews must be a non-empty array",
    });
  });

  it("rejects review with invalid card_id", () => {
    const result = validateRequest({
      session_id: VALID_UUID,
      reviews: [validReview({ card_id: "bad" })],
    });
    expect(result).toEqual({
      ok: false,
      message: "reviews[0].card_id must be a valid UUID",
    });
  });

  it("rejects review with invalid rating", () => {
    const result = validateRequest({
      session_id: VALID_UUID,
      reviews: [validReview({ rating: 5 })],
    });
    expect(result).toEqual({
      ok: false,
      message: "reviews[0].rating must be 1, 2, 3, or 4",
    });
  });

  it("rejects review with invalid started_at", () => {
    const result = validateRequest({
      session_id: VALID_UUID,
      reviews: [validReview({ started_at: "bad" })],
    });
    expect(result).toEqual({
      ok: false,
      message: "reviews[0].started_at must be a valid ISO datetime",
    });
  });

  it("rejects review with invalid answered_at", () => {
    const result = validateRequest({
      session_id: VALID_UUID,
      reviews: [validReview({ answered_at: "bad" })],
    });
    expect(result).toEqual({
      ok: false,
      message: "reviews[0].answered_at must be a valid ISO datetime",
    });
  });

  it("rejects duplicate card_id across reviews", () => {
    const result = validateRequest({
      session_id: VALID_UUID,
      reviews: [
        validReview({ card_id: VALID_UUID }),
        validReview({ card_id: VALID_UUID }),
      ],
    });
    expect(result).toEqual({
      ok: false,
      message: "reviews[1].card_id is duplicated",
    });
  });

  it("accepts multiple reviews with distinct card_ids", () => {
    const result = validateRequest({
      session_id: VALID_UUID,
      reviews: [
        validReview({ card_id: VALID_UUID }),
        validReview({ card_id: VALID_UUID_2 }),
      ],
    });
    assert(result.ok);
    expect(result.reviews).toHaveLength(2);
  });

  it("returns empty elaborations when field is omitted", () => {
    const result = validateRequest({
      session_id: VALID_UUID,
      reviews: [validReview()],
    });
    assert(result.ok);
    expect(result.elaborations).toEqual([]);
  });

  it("accepts valid elaborations array", () => {
    const result = validateRequest({
      session_id: VALID_UUID,
      reviews: [validReview()],
      elaborations: [{ card_id: VALID_UUID, text: "関連する知識との結びつき" }],
    });
    assert(result.ok);
    expect(result.elaborations).toEqual([
      { card_id: VALID_UUID, text: "関連する知識との結びつき" },
    ]);
  });

  it("accepts empty elaborations array", () => {
    const result = validateRequest({
      session_id: VALID_UUID,
      reviews: [validReview()],
      elaborations: [],
    });
    assert(result.ok);
    expect(result.elaborations).toEqual([]);
  });

  it("rejects elaborations with invalid card_id", () => {
    const result = validateRequest({
      session_id: VALID_UUID,
      reviews: [validReview()],
      elaborations: [{ card_id: "bad", text: "ok" }],
    });
    expect(result).toEqual({
      ok: false,
      message: "elaborations[0].card_id must be a valid UUID",
    });
  });

  it("rejects elaborations with empty text", () => {
    const result = validateRequest({
      session_id: VALID_UUID,
      reviews: [validReview()],
      elaborations: [{ card_id: VALID_UUID, text: "" }],
    });
    expect(result).toEqual({
      ok: false,
      message: "elaborations[0].text must be a non-empty string",
    });
  });

  it("rejects elaborations with non-string text", () => {
    const result = validateRequest({
      session_id: VALID_UUID,
      reviews: [validReview()],
      elaborations: [{ card_id: VALID_UUID, text: 123 }],
    });
    expect(result).toEqual({
      ok: false,
      message: "elaborations[0].text must be a non-empty string",
    });
  });

  it("rejects elaborations text exceeding 10000 characters", () => {
    const result = validateRequest({
      session_id: VALID_UUID,
      reviews: [validReview()],
      elaborations: [{ card_id: VALID_UUID, text: "a".repeat(10001) }],
    });
    expect(result).toEqual({
      ok: false,
      message: "elaborations[0].text must be at most 10000 characters",
    });
  });

  it("rejects duplicate card_id in elaborations", () => {
    const result = validateRequest({
      session_id: VALID_UUID,
      reviews: [validReview()],
      elaborations: [
        { card_id: VALID_UUID, text: "first" },
        { card_id: VALID_UUID, text: "second" },
      ],
    });
    expect(result).toEqual({
      ok: false,
      message: "elaborations[1].card_id is duplicated",
    });
  });

  it("rejects non-array elaborations", () => {
    const result = validateRequest({
      session_id: VALID_UUID,
      reviews: [validReview()],
      elaborations: "not-array",
    });
    expect(result).toEqual({
      ok: false,
      message: "elaborations must be an array",
    });
  });
});
