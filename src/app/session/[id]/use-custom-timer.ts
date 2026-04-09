"use client";

import { useState, useEffect, useRef, useCallback } from "react";

export type CustomTimerState = {
  elapsedSeconds: number;
  remainingSeconds: number | null;
  isRunning: boolean;
  isTargetReached: boolean;
  start: () => void;
  pause: () => void;
};

export function useCustomTimer(targetDurationSec: number | null): CustomTimerState {
  const [elapsedSeconds, setElapsedSeconds] = useState(0);
  const [isRunning, setIsRunning] = useState(false);
  const intervalRef = useRef<ReturnType<typeof setInterval> | null>(null);

  const isTargetReached = targetDurationSec !== null && elapsedSeconds >= targetDurationSec;
  const remainingSeconds =
    targetDurationSec !== null ? Math.max(0, targetDurationSec - elapsedSeconds) : null;

  useEffect(() => {
    if (!isRunning) return;

    intervalRef.current = setInterval(() => {
      setElapsedSeconds((prev) => prev + 1);
    }, 1000);

    return () => {
      if (intervalRef.current) clearInterval(intervalRef.current);
    };
  }, [isRunning]);

  const start = useCallback(() => setIsRunning(true), []);
  const pause = useCallback(() => setIsRunning(false), []);

  return {
    elapsedSeconds,
    remainingSeconds,
    isRunning,
    isTargetReached,
    start,
    pause,
  };
}
