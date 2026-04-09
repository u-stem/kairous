import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import {
  calcMsUntilNextFiring,
  shouldShowDelayedNotification,
} from "@/hooks/useNotificationScheduler";
import { NOTIFICATION_DELAY_THRESHOLD_MS } from "@/lib/constants";

describe("calcMsUntilNextFiring", () => {
  // calcMsUntilNextFiring は setHours でローカル TZ の時刻を設定するため、
  // テストもローカル TZ 基準の Date を使い TZ 非依存にする
  it("returns positive ms when target time is later today", () => {
    const now = new Date();
    now.setHours(8, 0, 0, 0);
    const result = calcMsUntilNextFiring("10:00", now);
    expect(result).toBe(2 * 60 * 60 * 1000);
  });

  it("returns ms until next day when target time has passed", () => {
    const now = new Date();
    now.setHours(23, 0, 0, 0);
    const result = calcMsUntilNextFiring("08:00", now);
    expect(result).toBe(9 * 60 * 60 * 1000);
  });

  it("returns 24 hours when target time is exactly now", () => {
    const now = new Date();
    now.setHours(8, 0, 0, 0);
    const result = calcMsUntilNextFiring("08:00", now);
    // 0ms なら即発火ループになるので、24時間後にスケジュール
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
