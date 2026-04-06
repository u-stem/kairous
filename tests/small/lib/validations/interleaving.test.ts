import { describe, it, expect } from "vitest";
import { createInterleavingSessionSchema } from "@/lib/validations/interleaving";

const VALID_UUID_1 = "550e8400-e29b-41d4-a716-446655440001";
const VALID_UUID_2 = "550e8400-e29b-41d4-a716-446655440002";

describe("createInterleavingSessionSchema", () => {
  it("accepts 2 valid material IDs (lower boundary)", () => {
    const result = createInterleavingSessionSchema.safeParse({
      materialIds: [VALID_UUID_1, VALID_UUID_2],
    });
    expect(result.success).toBe(true);
  });

  it("accepts 10 valid material IDs (upper boundary)", () => {
    const ids = Array.from(
      { length: 10 },
      (_, i) => `550e8400-e29b-41d4-a716-${String(i).padStart(12, "0")}`,
    );
    const result = createInterleavingSessionSchema.safeParse({ materialIds: ids });
    expect(result.success).toBe(true);
  });

  it("rejects 1 material ID (below min)", () => {
    const result = createInterleavingSessionSchema.safeParse({
      materialIds: [VALID_UUID_1],
    });
    expect(result.success).toBe(false);
  });

  it("rejects 11 material IDs (above max)", () => {
    const ids = Array.from(
      { length: 11 },
      (_, i) => `550e8400-e29b-41d4-a716-${String(i).padStart(12, "0")}`,
    );
    const result = createInterleavingSessionSchema.safeParse({ materialIds: ids });
    expect(result.success).toBe(false);
  });

  it("rejects empty array", () => {
    const result = createInterleavingSessionSchema.safeParse({ materialIds: [] });
    expect(result.success).toBe(false);
  });

  it("rejects invalid UUID in array", () => {
    const result = createInterleavingSessionSchema.safeParse({
      materialIds: [VALID_UUID_1, "not-a-uuid"],
    });
    expect(result.success).toBe(false);
  });
});
