"use client";

import { useState, useEffect, useRef } from "react";

interface RestTimerState {
  remainingSeconds: number;
  isComplete: boolean;
  progress: number;
}

export function useRestTimer(totalSeconds: number): RestTimerState {
  const [remainingSeconds, setRemainingSeconds] = useState(totalSeconds);
  const intervalRef = useRef<ReturnType<typeof setInterval> | null>(null);

  const isComplete = remainingSeconds <= 0;
  const progress = remainingSeconds / totalSeconds;

  useEffect(() => {
    if (isComplete) return;

    intervalRef.current = setInterval(() => {
      setRemainingSeconds((prev) => {
        const next = prev - 1;
        if (next <= 0) {
          if (intervalRef.current) clearInterval(intervalRef.current);
          return 0;
        }
        return next;
      });
    }, 1000);

    return () => {
      if (intervalRef.current) clearInterval(intervalRef.current);
    };
  }, [isComplete]);

  return { remainingSeconds, isComplete, progress };
}
