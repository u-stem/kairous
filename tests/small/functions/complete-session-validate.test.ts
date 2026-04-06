import { describe, it, expect } from "vitest";
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

  it("rejects non-string values", () => {
    expect(isUUID(123)).toBe(false);
    expect(isUUID(null)).toBe(false);
    expect(isUUID(undefined)).toBe(false);
  });

  it("rejects malformed UUID strings", () => {
    expect(isUUID("not-a-uuid")).toBe(false);
    expect(isUUID("a0000000-0000-4000-a000")).toBe(false);
    expect(isUUID("")).toBe(false);
  });
});

describe("isISODatetime", () => {
  it("accepts valid ISO 8601 datetime", () => {
    expect(isISODatetime("2026-04-05T10:00:00.000Z")).toBe(true);
  });

  it("accepts date-only string", () => {
    expect(isISODatetime("2026-04-05")).toBe(true);
  });

  it("rejects non-string values", () => {
    expect(isISODatetime(123)).toBe(false);
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

    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.session_id).toBe(VALID_UUID);
      expect(result.reviews).toHaveLength(1);
    }
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
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.reviews).toHaveLength(2);
    }
  });
});
