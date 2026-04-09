"use client";

import { useEffect, useRef, useCallback } from "react";
import { NOTIFICATION_DELAY_THRESHOLD_MS } from "@/lib/constants";
import type { NotificationMessageType } from "@/lib/constants";

type Schedule = {
  id: string;
  enabled: boolean;
  time: string; // "HH:MM" or "HH:MM:SS"
  message_type: NotificationMessageType;
  label: string;
};

// Exported for testing - pure functions
export function calcMsUntilNextFiring(time: string, now: Date): number {
  const [hours, minutes] = time.split(":").map(Number);
  const target = new Date(now);
  target.setHours(hours, minutes, 0, 0);

  let ms = target.getTime() - now.getTime();
  if (ms <= 0) {
    ms += 24 * 60 * 60 * 1000;
  }
  return ms;
}

export function shouldShowDelayedNotification(scheduledTime: Date): boolean {
  const elapsed = Date.now() - scheduledTime.getTime();
  return elapsed > 0 && elapsed <= NOTIFICATION_DELAY_THRESHOLD_MS;
}

export function useNotificationScheduler(params: {
  schedules: Schedule[];
  enabled: boolean;
  onFire: (schedule: Schedule) => void;
}) {
  const { schedules, enabled, onFire } = params;
  const timersRef = useRef<Map<string, ReturnType<typeof setTimeout>>>(
    new Map(),
  );
  // onFire を ref で保持し、effect の再実行なしに最新値を参照する
  const onFireRef = useRef(onFire);
  useEffect(() => {
    onFireRef.current = onFire;
  });

  const clearAllTimers = useCallback(() => {
    for (const timer of timersRef.current.values()) {
      clearTimeout(timer);
    }
    timersRef.current.clear();
  }, []);

  useEffect(() => {
    clearAllTimers();

    if (!enabled) return;

    // 再帰的な再スケジュールのため effect スコープ内でローカル関数を定義する
    function scheduleTimer(schedule: Schedule) {
      const ms = calcMsUntilNextFiring(schedule.time, new Date());
      const timer = setTimeout(() => {
        onFireRef.current(schedule);
        // 翌日の同時刻に再スケジュール
        scheduleTimer(schedule);
      }, ms);
      timersRef.current.set(schedule.id, timer);
    }

    const activeSchedules = schedules.filter((s) => s.enabled);
    for (const schedule of activeSchedules) {
      scheduleTimer(schedule);
    }

    return clearAllTimers;
  }, [schedules, enabled, clearAllTimers]);

  // タブがフォアグラウンドに戻ったとき、スリープ中に発火すべき通知を補完する
  useEffect(() => {
    if (!enabled) return;

    const handleVisibilityChange = () => {
      if (document.visibilityState === "visible") {
        const now = new Date();
        const activeSchedules = schedules.filter((s) => s.enabled);

        for (const schedule of activeSchedules) {
          const [hours, minutes] = schedule.time.split(":").map(Number);
          const scheduledToday = new Date(now);
          scheduledToday.setHours(hours, minutes, 0, 0);

          if (shouldShowDelayedNotification(scheduledToday)) {
            onFireRef.current(schedule);
          }
        }

        // タイマーをリセットして正確な次回発火時刻に合わせる
        clearAllTimers();

        function scheduleTimer(schedule: Schedule) {
          const ms = calcMsUntilNextFiring(schedule.time, new Date());
          const timer = setTimeout(() => {
            onFireRef.current(schedule);
            scheduleTimer(schedule);
          }, ms);
          timersRef.current.set(schedule.id, timer);
        }

        for (const schedule of activeSchedules) {
          scheduleTimer(schedule);
        }
      }
    };

    document.addEventListener("visibilitychange", handleVisibilityChange);
    return () => {
      document.removeEventListener("visibilitychange", handleVisibilityChange);
    };
  }, [schedules, enabled, clearAllTimers]);
}
