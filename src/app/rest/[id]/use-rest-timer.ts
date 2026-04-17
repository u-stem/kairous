"use client";

import { useEffect } from "react";
import { useCountdownTimer } from "@/hooks/use-countdown-timer";

export interface RestTimerState {
  remainingSeconds: number;
  isComplete: boolean;
  progress: number;
}

export function useRestTimer(totalSeconds: number): RestTimerState {
  const timer = useCountdownTimer(totalSeconds);
  const { start } = timer;

  // マウント時に自動スタート。useCountdownTimer.start は reference-stable なため
  // 依存配列に入れても実質マウント時の1回だけ発火する
  useEffect(() => {
    start();
  }, [start]);

  return {
    remainingSeconds: timer.remainingSeconds,
    isComplete: timer.isComplete,
    progress: timer.progress,
  };
}
