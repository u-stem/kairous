"use client";

import { useState, useEffect } from "react";
import { useRouter } from "next/navigation";
import { useCustomTimer } from "./use-custom-timer";
import { completeCustomSession } from "@/lib/actions/session-commands";
import { SELF_RATING_LABELS } from "@/lib/constants";
import { formatDuration } from "@/lib/session-utils";

const RATINGS = [1, 2, 3, 4] as const;

type Props = {
  sessionId: string;
  methodName: string;
  materialTitle: string | null;
  targetDurationSec: number | null;
};

type Phase = "timer" | "rating";

export function CustomMethodPlayer({ sessionId, methodName, materialTitle, targetDurationSec }: Props) {
  const router = useRouter();
  const timer = useCustomTimer(targetDurationSec);
  const [phase, setPhase] = useState<Phase>("timer");
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  // マウント時に自動開始
  useEffect(() => {
    timer.start();
    // eslint-disable-next-line react-hooks/exhaustive-deps -- mount only
  }, []);

  const radius = 80;
  const circumference = 2 * Math.PI * radius;
  const progress = targetDurationSec
    ? Math.min(timer.elapsedSeconds / targetDurationSec, 1)
    : 0;
  const strokeDashoffset = circumference * (1 - progress);

  function handleFinish() {
    timer.pause();
    setPhase("rating");
  }

  async function handleComplete(selfRating: 1 | 2 | 3 | 4) {
    setSubmitting(true);
    const result = await completeCustomSession(
      sessionId,
      selfRating,
      timer.elapsedSeconds,
      targetDurationSec,
    );
    if (result.success) {
      router.push(`/session/${sessionId}/summary`);
    } else {
      setError(result.error);
      setSubmitting(false);
    }
  }

  const displayTime = targetDurationSec !== null
    ? formatDuration(timer.remainingSeconds ?? 0)
    : formatDuration(timer.elapsedSeconds);

  return (
    <div className="mx-auto flex min-h-dvh max-w-md flex-col items-center justify-center p-4">
      {phase === "timer" && (
        <>
          <p className="mb-1 text-sm font-medium text-muted-foreground">{methodName}</p>
          {materialTitle && (
            <p className="mb-4 text-xs text-muted-foreground">{materialTitle}</p>
          )}

          {targetDurationSec !== null && (
            <svg width="200" height="200" className="-rotate-90">
              <circle cx="100" cy="100" r={radius} fill="none" stroke="currentColor" strokeWidth="8" className="text-muted" />
              <circle cx="100" cy="100" r={radius} fill="none" stroke="currentColor" strokeWidth="8"
                strokeDasharray={circumference} strokeDashoffset={strokeDashoffset} strokeLinecap="round"
                className="text-primary transition-all duration-1000" />
            </svg>
          )}

          <p className="mt-4 text-3xl font-bold tabular-nums">{displayTime}</p>

          {timer.isTargetReached && (
            <p className="mt-2 text-sm font-medium text-green-600 dark:text-green-400">
              目標時間に達しました
            </p>
          )}

          <div className="mt-6 flex gap-3">
            {timer.isRunning ? (
              <button type="button" onClick={timer.pause}
                className="rounded-lg bg-muted px-6 py-3 font-medium hover:bg-muted/80">
                一時停止
              </button>
            ) : (
              <button type="button" onClick={timer.start}
                className="rounded-lg bg-muted px-6 py-3 font-medium hover:bg-muted/80">
                再開
              </button>
            )}
            <button type="button" onClick={handleFinish}
              className="rounded-lg bg-primary px-6 py-3 font-medium text-primary-foreground">
              完了
            </button>
          </div>
        </>
      )}

      {phase === "rating" && (
        <div className="text-center space-y-4">
          <h1 className="text-xl font-semibold">学習の振り返り</h1>
          <p className="text-sm text-muted-foreground">
            {formatDuration(timer.elapsedSeconds)} / {methodName}
          </p>
          <p className="text-sm font-medium">今回の学習はどうでしたか?</p>
          <div className="grid grid-cols-2 gap-2">
            {RATINGS.map((r) => (
              <button key={r} type="button" onClick={() => void handleComplete(r)} disabled={submitting}
                className="rounded-lg border px-4 py-3 text-sm font-medium hover:bg-muted disabled:opacity-50">
                {r}. {SELF_RATING_LABELS[r]}
              </button>
            ))}
          </div>
          {error && <p className="text-sm text-destructive">{error}</p>}
        </div>
      )}
    </div>
  );
}
