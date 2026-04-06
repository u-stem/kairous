"use client";

import { useEffect, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { completeSession, completeElaborationSession } from "@/lib/actions/sessions";
import { SELF_RATING_LABELS } from "@/lib/constants";
import type { CardReview } from "@/lib/types/sessions";
import type { ElaborationInput } from "@/lib/validations/elaboration";

type Props = {
  sessionId: string;
};

const SELF_RATINGS = [1, 2, 3, 4] as const;

export function SessionReview({ sessionId }: Props) {
  const router = useRouter();
  // sessionStorage の値はマウント時に一度だけ読む（ライフサイクル中に変化しない）
  const [{ reviews, elaborations, loaded }] = useState(() => {
    if (typeof window === "undefined") return { reviews: null, elaborations: null, loaded: false };
    const stored = sessionStorage.getItem(`session-reviews-${sessionId}`);
    const storedElaborations = sessionStorage.getItem(`session-elaborations-${sessionId}`);
    return {
      reviews: stored ? (JSON.parse(stored) as CardReview[]) : null,
      elaborations: storedElaborations ? (JSON.parse(storedElaborations) as ElaborationInput[]) : null,
      loaded: true,
    };
  });
  const [isPending, startTransition] = useTransition();

  // sessionStorage にレビューがない場合はセッション画面にリダイレクト
  useEffect(() => {
    if (loaded && !reviews) {
      router.replace(`/session/${sessionId}`);
    }
  }, [loaded, reviews, sessionId, router]);

  if (!reviews) {
    return (
      <div className="flex min-h-dvh items-center justify-center">
        <p className="text-muted-foreground">読み込み中...</p>
      </div>
    );
  }

  const correctCount = reviews.filter((r) => r.rating >= 3).length;

  function handleRate(selfRating: 1 | 2 | 3 | 4) {
    if (!reviews) return;
    startTransition(async () => {
      let result;
      // Elaboration セッションは elaborations データが存在するため専用 Action を使う
      if (elaborations) {
        result = await completeElaborationSession(sessionId, reviews, elaborations, selfRating);
      } else {
        result = await completeSession(sessionId, reviews, selfRating);
      }
      if (result.success) {
        sessionStorage.removeItem(`session-reviews-${sessionId}`);
        sessionStorage.removeItem(`session-elaborations-${sessionId}`);
        router.push(`/session/${sessionId}/summary`);
      }
    });
  }

  return (
    <div className="flex min-h-dvh flex-col items-center justify-center px-4">
      <div className="w-full max-w-lg space-y-8">
        {elaborations ? (
          <div className="text-center space-y-2">
            <p className="text-4xl font-bold">{reviews.length}</p>
            <p className="text-muted-foreground">回答数</p>
          </div>
        ) : (
          <div className="text-center space-y-2">
            <p className="text-4xl font-bold">
              {correctCount} / {reviews.length}
            </p>
            <p className="text-muted-foreground">正解数</p>
          </div>
        )}

        <div className="space-y-3">
          <p className="text-center font-medium">
            今回の学習はどうでしたか?
          </p>
          {SELF_RATINGS.map((r) => (
            <button
              key={r}
              type="button"
              disabled={isPending}
              onClick={() => handleRate(r)}
              className="w-full rounded-lg border px-4 py-3 text-left transition-colors hover:bg-accent disabled:opacity-50"
            >
              {SELF_RATING_LABELS[r]}
            </button>
          ))}
        </div>
      </div>
    </div>
  );
}
