import { describe, it, expect } from "vitest";
import {
  createSessionSchema,
  completeSessionSchema,
  createRestSessionSchema,
  cardReviewSchema,
} from "@/lib/validations/sessions";

const VALID_UUID = "550e8400-e29b-41d4-a716-446655440000";

const validReview = {
  card_id: VALID_UUID,
  rating: 3,
  started_at: "2026-04-05T10:00:00.000Z",
  answered_at: "2026-04-05T10:00:05.000Z",
};

describe("cardReviewSchema", () => {
  it("accepts a valid review", () => {
    expect(cardReviewSchema.safeParse(validReview).success).toBe(true);
  });

  it("accepts rating 1 (lower boundary)", () => {
    expect(cardReviewSchema.safeParse({ ...validReview, rating: 1 }).success).toBe(true);
  });

  it("accepts rating 4 (upper boundary)", () => {
    expect(cardReviewSchema.safeParse({ ...validReview, rating: 4 }).success).toBe(true);
  });

  it("rejects rating 0", () => {
    expect(cardReviewSchema.safeParse({ ...validReview, rating: 0 }).success).toBe(false);
  });

  it("rejects rating 5", () => {
    expect(cardReviewSchema.safeParse({ ...validReview, rating: 5 }).success).toBe(false);
  });

  it("rejects invalid card_id", () => {
    expect(cardReviewSchema.safeParse({ ...validReview, card_id: "bad" }).success).toBe(false);
  });

  it("rejects invalid ISO datetime for started_at", () => {
    expect(cardReviewSchema.safeParse({ ...validReview, started_at: "not-a-date" }).success).toBe(false);
  });
});

describe("createSessionSchema", () => {
  it("accepts valid data", () => {
    const result = createSessionSchema.safeParse({
      materialId: VALID_UUID,
      methodId: VALID_UUID,
    });
    expect(result.success).toBe(true);
  });

  it("rejects invalid materialId", () => {
    const result = createSessionSchema.safeParse({
      materialId: "bad",
      methodId: VALID_UUID,
    });
    expect(result.success).toBe(false);
  });

  it("rejects invalid methodId", () => {
    const result = createSessionSchema.safeParse({
      materialId: VALID_UUID,
      methodId: "bad",
    });
    expect(result.success).toBe(false);
  });
});

describe("completeSessionSchema", () => {
  const valid = {
    sessionId: VALID_UUID,
    reviews: [validReview],
    selfRating: 3,
  };

  it("accepts valid data", () => {
    expect(completeSessionSchema.safeParse(valid).success).toBe(true);
  });

  it("rejects empty reviews", () => {
    expect(completeSessionSchema.safeParse({ ...valid, reviews: [] }).success).toBe(false);
  });

  it("rejects selfRating 0", () => {
    expect(completeSessionSchema.safeParse({ ...valid, selfRating: 0 }).success).toBe(false);
  });

  it("rejects selfRating 5", () => {
    expect(completeSessionSchema.safeParse({ ...valid, selfRating: 5 }).success).toBe(false);
  });

  it("rejects reviews with invalid nested card_id", () => {
    const badReview = { ...validReview, card_id: "bad" };
    expect(completeSessionSchema.safeParse({ ...valid, reviews: [badReview] }).success).toBe(false);
  });
});

describe("createRestSessionSchema", () => {
  it("accepts valid parentSessionId", () => {
    expect(createRestSessionSchema.safeParse({ parentSessionId: VALID_UUID }).success).toBe(true);
  });

  it("rejects invalid parentSessionId", () => {
    expect(createRestSessionSchema.safeParse({ parentSessionId: "bad" }).success).toBe(false);
  });
});
