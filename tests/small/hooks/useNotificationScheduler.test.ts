import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import {
  calcMsUntilNextFiring,
  shouldShowDelayedNotification,
} from "@/hooks/useNotificationScheduler";
import { NOTIFICATION_DELAY_THRESHOLD_MS } from "@/lib/constants";

describe("calcMsUntilNextFiring", () => {
  // ISO 8601 offset ensures CI (UTC) and local (JST) produce same result
  it("returns positive ms when target time is later today", () => {
    // now = 08:00 JST, target = 10:00 → 2 hours
    const now = new Date("2026-04-09T08:00:00+09:00");
    const result = calcMsUntilNextFiring("10:00", now);
    expect(result).toBe(2 * 60 * 60 * 1000);
  });

  it("returns ms until next day when target time has passed", () => {
    // now = 23:00 JST, target = 08:00 → 9 hours
    const now = new Date("2026-04-09T23:00:00+09:00");
    const result = calcMsUntilNextFiring("08:00", now);
    expect(result).toBe(9 * 60 * 60 * 1000);
  });

  it("returns 24 hours when target time is exactly now", () => {
    const now = new Date("2026-04-09T08:00:00+09:00");
    const result = calcMsUntilNextFiring("08:00", now);
    // 0ms would cause immediate fire loop, so schedule 24h later
    expect(result).toBe(24 * 60 * 60 * 1000);
  });
});

describe("shouldShowDelayedNotification", () => {
  it("returns true when elapsed time is within threshold", () => {
    const scheduledTime = new Date(Date.now() - 10 * 60 * 1000); // 10 min ago
    expect(shouldShowDelayedNotification(scheduledTime)).toBe(true);
  });

  it("returns false when elapsed time exceeds threshold", () => {
    const scheduledTime = new Date(
      Date.now() - NOTIFICATION_DELAY_THRESHOLD_MS - 1000,
    );
    expect(shouldShowDelayedNotification(scheduledTime)).toBe(false);
  });

  it("returns false for future time", () => {
    const scheduledTime = new Date(Date.now() + 60000);
    expect(shouldShowDelayedNotification(scheduledTime)).toBe(false);
  });
});
