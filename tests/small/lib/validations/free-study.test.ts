import { describe, it, expect } from "vitest";
import { completeFreeStudySchema } from "@/lib/validations/free-study";

describe("completeFreeStudySchema", () => {
  it("accepts valid input", () => {
    const result = completeFreeStudySchema.safeParse({
      sessionId: "550e8400-e29b-41d4-a716-446655440000",
      elapsedSec: 300,
    });
    expect(result.success).toBe(true);
  });

  it("rejects invalid session ID", () => {
    const result = completeFreeStudySchema.safeParse({
      sessionId: "not-a-uuid",
      elapsedSec: 300,
    });
    expect(result.success).toBe(false);
  });

  it("rejects negative elapsed seconds", () => {
    const result = completeFreeStudySchema.safeParse({
      sessionId: "550e8400-e29b-41d4-a716-446655440000",
      elapsedSec: -1,
    });
    expect(result.success).toBe(false);
  });

  it("does not require selfRating", () => {
    const result = completeFreeStudySchema.safeParse({
      sessionId: "550e8400-e29b-41d4-a716-446655440000",
      elapsedSec: 120,
    });
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data).not.toHaveProperty("selfRating");
    }
  });
});
