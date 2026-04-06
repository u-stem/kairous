"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { usePomodoroTimer } from "./use-pomodoro-timer";
import { completePomodoroSession } from "@/lib/actions/sessions";
import { POMODORO_FOCUS_SEC, POMODORO_BREAK_SEC, SELF_RATING_LABELS } from "@/lib/constants";
import { formatDuration } from "@/lib/session-utils";

const RATINGS = [1, 2, 3, 4] as const;

export function PomodoroPlayer({ sessionId }: { sessionId: string }) {
  const router = useRouter();
  const timer = usePomodoroTimer(POMODORO_FOCUS_SEC, POMODORO_BREAK_SEC);
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  const radius = 80;
  const circumference = 2 * Math.PI * radius;
  const strokeDashoffset = circumference * (1 - timer.remainingRatio);

  async function handleComplete(selfRating: 1 | 2 | 3 | 4) {
    setSubmitting(true);
    const result = await completePomodoroSession(
      sessionId,
      selfRating,
      timer.cycle,
      timer.totalFocusSec,
      timer.totalBreakSec,
    );
    if (result.success) {
      router.push(`/session/${sessionId}/summary`);
    } else {
      setError(result.error);
      setSubmitting(false);
    }
  }

  return (
    <div className="mx-auto flex min-h-dvh max-w-md flex-col items-center justify-center p-4">
      {timer.phase === "focus" && (
        <>
          <p className="mb-2 text-sm font-medium text-muted-foreground">
            サイクル {timer.cycle} - 集中
          </p>
          <svg width="200" height="200" className="-rotate-90">
            <circle cx="100" cy="100" r={radius} fill="none" stroke="currentColor" strokeWidth="8" className="text-muted" />
            <circle cx="100" cy="100" r={radius} fill="none" stroke="currentColor" strokeWidth="8"
              strokeDasharray={circumference} strokeDashoffset={strokeDashoffset} strokeLinecap="round"
              className="text-primary transition-all duration-1000" />
          </svg>
          <p className="mt-4 text-3xl font-bold tabular-nums">{formatDuration(timer.remainingSeconds)}</p>
          <p className="mt-2 text-sm text-muted-foreground">集中タイマー</p>
        </>
      )}

      {timer.phase === "focus_complete" && (
        <div className="text-center space-y-4">
          <h1 className="text-xl font-semibold">集中完了</h1>
          <p className="text-sm text-muted-foreground">お疲れさまでした。休憩を取りましょう。</p>
          <button type="button" onClick={timer.startBreak}
            className="rounded-lg bg-primary px-6 py-3 font-medium text-primary-foreground">
            {`${POMODORO_BREAK_SEC / 60}分休憩を開始`}
          </button>
        </div>
      )}

      {timer.phase === "break" && (
        <>
          <p className="mb-2 text-sm font-medium text-muted-foreground">
            サイクル {timer.cycle} - 休憩
          </p>
          <svg width="200" height="200" className="-rotate-90">
            <circle cx="100" cy="100" r={radius} fill="none" stroke="currentColor" strokeWidth="8" className="text-muted" />
            <circle cx="100" cy="100" r={radius} fill="none" stroke="currentColor" strokeWidth="8"
              strokeDasharray={circumference} strokeDashoffset={strokeDashoffset} strokeLinecap="round"
              className="text-primary transition-all duration-1000" />
          </svg>
          <p className="mt-4 text-3xl font-bold tabular-nums">{formatDuration(timer.remainingSeconds)}</p>
          <p className="mt-2 text-sm text-muted-foreground">休憩タイマー</p>
        </>
      )}

      {timer.phase === "break_complete" && (
        <div className="text-center space-y-4">
          <h1 className="text-xl font-semibold">休憩完了</h1>
          <p className="text-sm text-muted-foreground">
            {timer.cycle} サイクル完了。続けますか?
          </p>
          <div className="flex gap-3 justify-center">
            <button type="button" onClick={timer.startNextCycle}
              className="rounded-lg bg-primary px-6 py-3 font-medium text-primary-foreground">
              もう1サイクル
            </button>
            <button type="button" onClick={timer.finish}
              className="rounded-lg bg-muted px-6 py-3 font-medium hover:bg-muted/80">
              終了する
            </button>
          </div>
        </div>
      )}

      {timer.phase === "done" && (
        <div className="text-center space-y-4">
          <h1 className="text-xl font-semibold">学習の振り返り</h1>
          <p className="text-sm text-muted-foreground">
            {timer.cycle} サイクル / {formatDuration(timer.totalFocusSec)} 集中
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
