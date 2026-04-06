"use client";

import { useState, useEffect, useRef, useCallback } from "react";

type Phase = "focus" | "focus_complete" | "break" | "break_complete" | "done";

export type PomodoroTimerState = {
  phase: Phase;
  remainingSeconds: number;
  progress: number;
  cycle: number;
  totalFocusSec: number;
  totalBreakSec: number;
  startBreak: () => void;
  startNextCycle: () => void;
  finish: () => void;
};

export function usePomodoroTimer(
  focusSec: number,
  breakSec: number,
): PomodoroTimerState {
  const [phase, setPhase] = useState<Phase>("focus");
  const [remainingSeconds, setRemainingSeconds] = useState(focusSec);
  const [cycle, setCycle] = useState(1);
  const [totalFocusSec, setTotalFocusSec] = useState(0);
  const [totalBreakSec, setTotalBreakSec] = useState(0);
  const intervalRef = useRef<ReturnType<typeof setInterval> | null>(null);

  const isTimerActive = phase === "focus" || phase === "break";
  const currentPhaseDuration = phase === "break" ? breakSec : focusSec;
  const progress = isTimerActive ? remainingSeconds / currentPhaseDuration : 0;

  useEffect(() => {
    if (!isTimerActive) return;

    intervalRef.current = setInterval(() => {
      setRemainingSeconds((prev) => {
        const next = prev - 1;
        if (next <= 0) {
          if (intervalRef.current) clearInterval(intervalRef.current);
          if (phase === "focus") {
            setTotalFocusSec((t) => t + focusSec);
            setPhase("focus_complete");
          } else {
            setTotalBreakSec((t) => t + breakSec);
            setPhase("break_complete");
          }
          return 0;
        }
        return next;
      });
    }, 1000);

    return () => {
      if (intervalRef.current) clearInterval(intervalRef.current);
    };
  }, [isTimerActive, phase, focusSec, breakSec]);

  const startBreak = useCallback(() => {
    setPhase("break");
    setRemainingSeconds(breakSec);
  }, [breakSec]);

  const startNextCycle = useCallback(() => {
    setCycle((c) => c + 1);
    setPhase("focus");
    setRemainingSeconds(focusSec);
  }, [focusSec]);

  const finish = useCallback(() => {
    setPhase("done");
  }, []);

  return {
    phase,
    remainingSeconds,
    progress,
    cycle,
    totalFocusSec,
    totalBreakSec,
    startBreak,
    startNextCycle,
    finish,
  };
}
