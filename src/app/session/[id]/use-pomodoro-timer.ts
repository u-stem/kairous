"use client";

import { useState, useCallback, useEffect, useRef } from "react";
import { useCountdownTimer } from "@/hooks/use-countdown-timer";

type Phase = "focus" | "focus_complete" | "break" | "break_complete" | "done";

export type PomodoroTimerState = {
  phase: Phase;
  remainingSeconds: number;
  remainingRatio: number;
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
  const [cycle, setCycle] = useState(1);
  const [totalFocusSec, setTotalFocusSec] = useState(0);
  const [totalBreakSec, setTotalBreakSec] = useState(0);
  // フェーズごとの duration を state で管理し、useCountdownTimer に渡す
  const [currentDuration, setCurrentDuration] = useState(focusSec);

  const timer = useCountdownTimer(currentDuration);

  const isTimerActive = phase === "focus" || phase === "break";
  const remainingRatio = isTimerActive ? timer.progress : 0;

  // 初回マウント時に自動スタート (timer は毎レンダー新しいオブジェクトのため依存配列に入れると無限ループする)
  useEffect(() => {
    timer.start();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // currentDuration が変わったとき（フェーズ切り替え後）にリセットして即スタートする
  // reset() 後に start() を呼ぶと isComplete が古い値のため、restartWith で一括処理する
  // 初回マウントは除外する（初回は上の effect で start するため）
  const isFirstDurationChangeRef = useRef(true);
  useEffect(() => {
    if (isFirstDurationChangeRef.current) {
      isFirstDurationChangeRef.current = false;
      return;
    }
    timer.restartWith(currentDuration);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [currentDuration]);

  // タイマー完了時にフェーズ遷移
  // isComplete が false→true に変化したタイミングのみ発火するよう prev 値で判定する
  const prevIsCompleteRef = useRef(false);
  useEffect(() => {
    const wasComplete = prevIsCompleteRef.current;
    prevIsCompleteRef.current = timer.isComplete;

    // false→true の遷移（タイマーが完了した瞬間）のみフェーズを進める
    if (!wasComplete && timer.isComplete) {
      if (phase === "focus") {
        setTotalFocusSec((t) => t + focusSec);
        setPhase("focus_complete");
      } else if (phase === "break") {
        setTotalBreakSec((t) => t + breakSec);
        setPhase("break_complete");
      }
    }
  }, [timer.isComplete, phase, focusSec, breakSec]);

  const startBreak = useCallback(() => {
    setPhase("break");
    setCurrentDuration(breakSec);
  }, [breakSec]);

  const startNextCycle = useCallback(() => {
    setCycle((c) => c + 1);
    setPhase("focus");
    setCurrentDuration(focusSec);
  }, [focusSec]);

  const finish = useCallback(() => {
    setPhase("done");
  }, []);

  return {
    phase,
    remainingSeconds: timer.remainingSeconds,
    remainingRatio,
    cycle,
    totalFocusSec,
    totalBreakSec,
    startBreak,
    startNextCycle,
    finish,
  };
}
