import { describe, expect, it } from "vitest";
import { createMethodSchema, updateMethodSchema } from "@/lib/validations/methods";

describe("createMethodSchema", () => {
  const valid = {
    name: "ファインマンテクニック",
    category: "comprehension" as const,
    description: "自分の言葉で説明する",
    default_duration_sec: 1500,
  };

  it("accepts valid input", () => {
    expect(createMethodSchema.safeParse(valid).success).toBe(true);
  });

  it("accepts input without optional fields", () => {
    const result = createMethodSchema.safeParse({
      name: "音読",
      category: "memory",
    });
    expect(result.success).toBe(true);
  });

  it("rejects empty name", () => {
    expect(createMethodSchema.safeParse({ ...valid, name: "" }).success).toBe(false);
  });

  it("rejects name over 50 chars", () => {
    expect(createMethodSchema.safeParse({ ...valid, name: "a".repeat(51) }).success).toBe(false);
  });

  it("rejects invalid category", () => {
    expect(createMethodSchema.safeParse({ ...valid, category: "invalid" }).success).toBe(false);
  });

  it("rejects duration under 60 seconds", () => {
    expect(createMethodSchema.safeParse({ ...valid, default_duration_sec: 30 }).success).toBe(false);
  });

  it("rejects duration over 10800 seconds", () => {
    expect(createMethodSchema.safeParse({ ...valid, default_duration_sec: 20000 }).success).toBe(false);
  });

  it("accepts null duration for stopwatch mode", () => {
    expect(createMethodSchema.safeParse({ ...valid, default_duration_sec: null }).success).toBe(true);
  });

  it("rejects description over 500 chars", () => {
    expect(createMethodSchema.safeParse({ ...valid, description: "a".repeat(501) }).success).toBe(false);
  });
});

describe("updateMethodSchema", () => {
  it("accepts partial update with name only", () => {
    const result = updateMethodSchema.safeParse({ name: "新しい名前" });
    expect(result.success).toBe(true);
  });
});
