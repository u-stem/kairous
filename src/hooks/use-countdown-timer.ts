"use client";

import { useState, useEffect, useRef, useCallback } from "react";

export type CountdownState = {
  remainingSeconds: number;
  progress: number;
  isRunning: boolean;
  isComplete: boolean;
  start: () => void;
  pause: () => void;
  reset: () => void;
  /** フェーズ切り替え時に新しい秒数でリセットしてスタートする */
  restartWith: (seconds: number) => void;
};

export function useCountdownTimer(totalSeconds: number): CountdownState {
  const [remainingSeconds, setRemainingSeconds] = useState(totalSeconds);
  const [isRunning, setIsRunning] = useState(false);
  // progress 計算に使う duration を内部 state として持つ
  // これにより外部から totalSeconds が変わったときに progress が正しく追従する
  const [durationForProgress, setDurationForProgress] = useState(totalSeconds);
  const intervalRef = useRef<ReturnType<typeof setInterval> | null>(null);
  // totalSeconds の最新値を ref で保持し、reset 時に正しい初期値を参照する
  const totalSecondsRef = useRef(totalSeconds);
  useEffect(() => {
    totalSecondsRef.current = totalSeconds;
  });

  const isComplete = remainingSeconds <= 0;
  const progress = durationForProgress > 0 ? remainingSeconds / durationForProgress : 0;

  useEffect(() => {
    if (!isRunning || isComplete) return;

    intervalRef.current = setInterval(() => {
      setRemainingSeconds((prev) => {
        const next = prev - 1;
        if (next <= 0) {
          if (intervalRef.current) clearInterval(intervalRef.current);
          setIsRunning(false);
          return 0;
        }
        return next;
      });
    }, 1000);

    return () => {
      if (intervalRef.current) clearInterval(intervalRef.current);
    };
  }, [isRunning, isComplete]);

  const start = useCallback(() => {
    if (!isComplete) setIsRunning(true);
  }, [isComplete]);

  const pause = useCallback(() => {
    setIsRunning(false);
  }, []);

  const reset = useCallback(() => {
    const seconds = totalSecondsRef.current;
    setIsRunning(false);
    setRemainingSeconds(seconds);
    setDurationForProgress(seconds);
  }, []);

  // フェーズ切り替え時に使う: 新しい秒数でリセットして即スタート
  // reset() + start() を別々に呼ぶと start() 時点で isComplete が古い値のため使えない
  const restartWith = useCallback((seconds: number) => {
    totalSecondsRef.current = seconds;
    setRemainingSeconds(seconds);
    setDurationForProgress(seconds);
    setIsRunning(true);
  }, []);

  return { remainingSeconds, progress, isRunning, isComplete, start, pause, reset, restartWith };
}
