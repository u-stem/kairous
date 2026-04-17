"use client";

import { useState, useEffect } from "react";
import { useRouter } from "next/navigation";
import { useCustomTimer } from "./use-custom-timer";
import { completeCustomSession } from "@/lib/actions/session-commands";
import { SELF_RATING_LABELS, SELF_RATINGS } from "@/lib/constants";
import { formatDuration } from "@/lib/session-utils";
import { Button } from "@/components/ui/button";

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
  const { start } = timer;
  const [phase, setPhase] = useState<Phase>("timer");
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  // start は useCustomTimer が reference-stable で返すためマウント時の 1 回のみ発火する
  useEffect(() => {
    start();
  }, [start]);

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
            // 達成状態の緑色。デザイントークンに success 色が未定義のため、
            // 当面は Tailwind の意味論的プリセット (green-600/400) を使用する。
            // 専用トークンを追加する場合は globals.css に --success を定義し、ここも text-success に統一する
            <p className="mt-2 text-sm font-medium text-green-600 dark:text-green-400">
              目標時間に達しました
            </p>
          )}

          <div className="mt-6 flex gap-3">
            {timer.isRunning ? (
              <Button variant="outline" type="button" onClick={timer.pause}>
                一時停止
              </Button>
            ) : (
              <Button variant="outline" type="button" onClick={timer.start}>
                再開
              </Button>
            )}
            <Button type="button" onClick={handleFinish}>
              完了
            </Button>
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
            {SELF_RATINGS.map((r) => (
              <Button key={r} variant="outline" type="button" onClick={() => void handleComplete(r)} disabled={submitting}>
                {r}. {SELF_RATING_LABELS[r]}
              </Button>
            ))}
          </div>
          {error && <p className="text-sm text-destructive">{error}</p>}
        </div>
      )}
    </div>
  );
}
