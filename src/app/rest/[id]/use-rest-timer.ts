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

  // マウント時に自動スタート (timer は毎レンダー新しいオブジェクトのため依存配列に入れると無限ループする)
  useEffect(() => {
    timer.start();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  return {
    remainingSeconds: timer.remainingSeconds,
    isComplete: timer.isComplete,
    progress: timer.progress,
  };
}
