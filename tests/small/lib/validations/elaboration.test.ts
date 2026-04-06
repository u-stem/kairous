import { describe, it, expect } from "vitest";
import { completeElaborationSchema } from "@/lib/validations/elaboration";

const VALID_UUID = "550e8400-e29b-41d4-a716-446655440000";

const validReview = {
  card_id: VALID_UUID,
  rating: 3,
  started_at: "2026-04-06T10:00:00.000Z",
  answered_at: "2026-04-06T10:00:30.000Z",
};

const validElaboration = {
  card_id: VALID_UUID,
  text: "this is my explanation",
};

describe("completeElaborationSchema", () => {
  const valid = {
    sessionId: VALID_UUID,
    reviews: [validReview],
    elaborations: [validElaboration],
    selfRating: 3,
  };

  it("accepts valid data", () => {
    expect(completeElaborationSchema.safeParse(valid).success).toBe(true);
  });

  it("rejects empty reviews", () => {
    expect(completeElaborationSchema.safeParse({ ...valid, reviews: [] }).success).toBe(false);
  });

  it("rejects empty elaborations", () => {
    expect(completeElaborationSchema.safeParse({ ...valid, elaborations: [] }).success).toBe(false);
  });

  it("rejects selfRating 0", () => {
    expect(completeElaborationSchema.safeParse({ ...valid, selfRating: 0 }).success).toBe(false);
  });

  it("rejects selfRating 5", () => {
    expect(completeElaborationSchema.safeParse({ ...valid, selfRating: 5 }).success).toBe(false);
  });

  it("accepts elaboration with empty text", () => {
    const data = { ...valid, elaborations: [{ card_id: VALID_UUID, text: "" }] };
    expect(completeElaborationSchema.safeParse(data).success).toBe(true);
  });

  it("rejects elaboration text over 10000 characters", () => {
    const data = {
      ...valid,
      elaborations: [{ card_id: VALID_UUID, text: "a".repeat(10001) }],
    };
    expect(completeElaborationSchema.safeParse(data).success).toBe(false);
  });

  it("accepts elaboration text at exactly 10000 characters", () => {
    const data = {
      ...valid,
      elaborations: [{ card_id: VALID_UUID, text: "a".repeat(10000) }],
    };
    expect(completeElaborationSchema.safeParse(data).success).toBe(true);
  });

  it("rejects reviews over 20 items", () => {
    const reviews = Array.from({ length: 21 }, () => validReview);
    expect(completeElaborationSchema.safeParse({ ...valid, reviews }).success).toBe(false);
  });

  it("rejects elaborations over 20 items", () => {
    const elaborations = Array.from({ length: 21 }, () => validElaboration);
    expect(completeElaborationSchema.safeParse({ ...valid, elaborations }).success).toBe(false);
  });
});
