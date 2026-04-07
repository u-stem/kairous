"use client";

import { useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { useRestTimer } from "./use-rest-timer";
import { completeRestSession } from "@/lib/actions/session-commands";
import { REST_DURATION_SEC } from "@/lib/constants";
import { formatDuration } from "@/lib/session-utils";

export function RestTimer({ sessionId }: { sessionId: string }) {
  const router = useRouter();
  const { remainingSeconds, isComplete, progress } = useRestTimer(REST_DURATION_SEC);
  const completedRef = useRef(false);
  const [completionError, setCompletionError] = useState(false);

  useEffect(() => {
    if (isComplete && !completedRef.current) {
      completedRef.current = true;
      completeRestSession(sessionId)
        .then((result) => {
          if (!result.success) setCompletionError(true);
        })
        .catch(() => {
          setCompletionError(true);
        });
    }
  }, [isComplete, sessionId]);

  // 円形プログレスの SVG パラメータ
  const radius = 80;
  const circumference = 2 * Math.PI * radius;
  const strokeDashoffset = circumference * (1 - progress);

  return (
    <div className="mx-auto flex min-h-dvh max-w-md flex-col items-center justify-center p-4">
      {!isComplete ? (
        <>
          <svg width="200" height="200" className="-rotate-90">
            <circle
              cx="100"
              cy="100"
              r={radius}
              fill="none"
              stroke="currentColor"
              strokeWidth="8"
              className="text-muted"
            />
            <circle
              cx="100"
              cy="100"
              r={radius}
              fill="none"
              stroke="currentColor"
              strokeWidth="8"
              strokeDasharray={circumference}
              strokeDashoffset={strokeDashoffset}
              strokeLinecap="round"
              className="text-primary transition-all duration-1000"
            />
          </svg>
          <p className="mt-4 text-3xl font-bold tabular-nums">
            {formatDuration(remainingSeconds)}
          </p>
          <p className="mt-2 text-sm text-muted-foreground">安静タイマー</p>
        </>
      ) : (
        <div className="text-center">
          <svg className="mx-auto mb-2 h-8 w-8 text-primary" fill="none" viewBox="0 0 24 24" strokeWidth={2} stroke="currentColor" aria-hidden="true">
            <path strokeLinecap="round" strokeLinejoin="round" d="M4.5 12.75l6 6 9-13.5" />
          </svg>
          <h1 className="text-xl font-semibold">安静完了</h1>
          <p className="mt-2 text-sm text-muted-foreground">
            {Math.floor(REST_DURATION_SEC / 60)} 分間の安静が完了しました
          </p>
          {completionError && (
            <p className="mt-2 text-sm text-destructive">
              セッションの保存に失敗しました。ホームに戻ってください。
            </p>
          )}
          <button
            type="button"
            onClick={() => router.push("/")}
            className="mt-6 rounded-lg bg-muted px-6 py-3 font-medium hover:bg-muted/80"
          >
            ホームに戻る
          </button>
        </div>
      )}
    </div>
  );
}
