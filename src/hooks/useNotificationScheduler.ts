"use client";

import { useEffect, useRef, useCallback } from "react";
import { NOTIFICATION_DELAY_THRESHOLD_MS } from "@/lib/constants";
import type { NotificationSchedule } from "@/lib/types/notification";

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
  schedules: NotificationSchedule[];
  enabled: boolean;
  onFire: (schedule: NotificationSchedule) => void;
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

  // 同日の同スケジュールを重複発火しないよう記録する (key: schedule.id, value: "YYYY-MM-DD")
  const firedTodayRef = useRef<Map<string, string>>(new Map());

  const clearAllTimers = useCallback(() => {
    for (const timer of timersRef.current.values()) {
      clearTimeout(timer);
    }
    timersRef.current.clear();
  }, []);

  // 再帰呼び出しのため ref で保持する (useCallback だと自己参照で lint エラーになる)
  const scheduleTimerRef = useRef<(schedule: NotificationSchedule) => void>(
    () => {},
  );
  useEffect(() => {
    scheduleTimerRef.current = (schedule: NotificationSchedule) => {
      const ms = calcMsUntilNextFiring(schedule.time, new Date());
      const timer = setTimeout(() => {
        onFireRef.current(schedule);
        const todayStr = new Date().toISOString().split("T")[0];
        firedTodayRef.current.set(schedule.id, todayStr);
        // 翌日の同時刻に再スケジュール
        scheduleTimerRef.current(schedule);
      }, ms);
      timersRef.current.set(schedule.id, timer);
    };
  });

  useEffect(() => {
    clearAllTimers();

    if (!enabled) return;

    const activeSchedules = schedules.filter((s) => s.enabled);
    for (const schedule of activeSchedules) {
      scheduleTimerRef.current(schedule);
    }

    return clearAllTimers;
  }, [schedules, enabled, clearAllTimers]);

  // タブがフォアグラウンドに戻ったとき、スリープ中に発火すべき通知を補完する
  useEffect(() => {
    if (!enabled) return;

    const handleVisibilityChange = () => {
      if (document.visibilityState === "visible") {
        const now = new Date();
        const todayStr = now.toISOString().split("T")[0];
        const activeSchedules = schedules.filter((s) => s.enabled);

        for (const schedule of activeSchedules) {
          // 同日の同スケジュールは再発火しない
          const lastFired = firedTodayRef.current.get(schedule.id);
          if (lastFired === todayStr) continue;

          const [hours, minutes] = schedule.time.split(":").map(Number);
          const scheduledToday = new Date(now);
          scheduledToday.setHours(hours, minutes, 0, 0);

          if (shouldShowDelayedNotification(scheduledToday)) {
            firedTodayRef.current.set(schedule.id, todayStr);
            onFireRef.current(schedule);
          }
        }

        // タイマーをリセットして正確な次回発火時刻に合わせる
        clearAllTimers();
        for (const schedule of activeSchedules) {
          scheduleTimerRef.current(schedule);
        }
      }
    };

    document.addEventListener("visibilitychange", handleVisibilityChange);
    return () => {
      document.removeEventListener("visibilitychange", handleVisibilityChange);
    };
  }, [schedules, enabled, clearAllTimers]);
}
