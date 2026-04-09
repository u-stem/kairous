import { describe, it, expect } from "vitest";
import {
  createNotificationScheduleSchema,
  updateNotificationScheduleSchema,
} from "@/lib/validations/notifications";

describe("createNotificationScheduleSchema", () => {
  it("accepts valid input with due_today type", () => {
    const result = createNotificationScheduleSchema.safeParse({
      label: "朝の通知",
      time: "08:00",
      message_type: "due_today",
    });
    expect(result.success).toBe(true);
  });

  it("accepts valid input with review_and_preview type", () => {
    const result = createNotificationScheduleSchema.safeParse({
      label: "夜の通知",
      time: "22:00",
      message_type: "review_and_preview",
    });
    expect(result.success).toBe(true);
  });

  it("rejects empty label", () => {
    const result = createNotificationScheduleSchema.safeParse({
      label: "",
      time: "08:00",
      message_type: "due_today",
    });
    expect(result.success).toBe(false);
  });

  it("rejects invalid time format", () => {
    const result = createNotificationScheduleSchema.safeParse({
      label: "朝の通知",
      time: "25:00",
      message_type: "due_today",
    });
    expect(result.success).toBe(false);
  });

  it("rejects invalid message_type", () => {
    const result = createNotificationScheduleSchema.safeParse({
      label: "朝の通知",
      time: "08:00",
      message_type: "invalid",
    });
    expect(result.success).toBe(false);
  });

  it("rejects label exceeding max length", () => {
    const result = createNotificationScheduleSchema.safeParse({
      label: "a".repeat(101),
      time: "08:00",
      message_type: "due_today",
    });
    expect(result.success).toBe(false);
  });
});

describe("updateNotificationScheduleSchema", () => {
  it("accepts partial update with only label", () => {
    const result = updateNotificationScheduleSchema.safeParse({
      id: "550e8400-e29b-41d4-a716-446655440000",
      label: "新しいラベル",
    });
    expect(result.success).toBe(true);
  });

  it("accepts partial update with only enabled", () => {
    const result = updateNotificationScheduleSchema.safeParse({
      id: "550e8400-e29b-41d4-a716-446655440000",
      enabled: false,
    });
    expect(result.success).toBe(true);
  });

  it("rejects missing id", () => {
    const result = updateNotificationScheduleSchema.safeParse({
      label: "新しいラベル",
    });
    expect(result.success).toBe(false);
  });
});
