import { describe, it, expect } from "vitest";
import { completePomodoroSchema } from "@/lib/validations/pomodoro";

const VALID_UUID = "550e8400-e29b-41d4-a716-446655440000";

describe("completePomodoroSchema", () => {
  const valid = {
    sessionId: VALID_UUID,
    selfRating: 3,
    pomodorosCompleted: 2,
    totalFocusSec: 3000,
    totalBreakSec: 600,
  };

  it("accepts valid data", () => {
    expect(completePomodoroSchema.safeParse(valid).success).toBe(true);
  });

  it("rejects pomodorosCompleted 0", () => {
    expect(completePomodoroSchema.safeParse({ ...valid, pomodorosCompleted: 0 }).success).toBe(false);
  });

  it("rejects negative totalFocusSec", () => {
    expect(completePomodoroSchema.safeParse({ ...valid, totalFocusSec: -1 }).success).toBe(false);
  });

  it("rejects selfRating 0", () => {
    expect(completePomodoroSchema.safeParse({ ...valid, selfRating: 0 }).success).toBe(false);
  });

  it("rejects selfRating 5", () => {
    expect(completePomodoroSchema.safeParse({ ...valid, selfRating: 5 }).success).toBe(false);
  });
});
