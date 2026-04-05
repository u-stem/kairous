"use client";

import { useEffect, useSyncExternalStore, useTransition } from "react";
import { useRouter } from "next/navigation";
import { completeSession } from "@/lib/actions/sessions";
import { SELF_RATING_LABELS } from "@/lib/constants";
import type { CardReview } from "@/lib/types/sessions";

type Props = {
  sessionId: string;
};

const SELF_RATINGS = [1, 2, 3, 4] as const;

// sessionStorage は React 外部のストアなので useSyncExternalStore で同期する
function useSessionReviews(sessionId: string): CardReview[] | null {
  const key = `session-reviews-${sessionId}`;
  return useSyncExternalStore(
    // sessionStorage には変更イベントがないため subscribe は noop
    () => () => {},
    () => {
      const stored = sessionStorage.getItem(key);
      return stored ? (JSON.parse(stored) as CardReview[]) : null;
    },
    () => null,
  );
}

export function SessionReview({ sessionId }: Props) {
  const router = useRouter();
  const reviews = useSessionReviews(sessionId);
  const [isPending, startTransition] = useTransition();

  // sessionStorage にレビューがない場合はセッション画面にリダイレクト
  useEffect(() => {
    if (reviews === null) {
      const stored = sessionStorage.getItem(`session-reviews-${sessionId}`);
      if (!stored) {
        router.replace(`/session/${sessionId}`);
      }
    }
  }, [reviews, sessionId, router]);

  if (!reviews) {
    return (
      <div className="flex min-h-dvh items-center justify-center">
        <p className="text-muted-foreground">読み込み中...</p>
      </div>
    );
  }

  const correctCount = reviews.filter((r) => r.rating >= 3).length;

  function handleRate(selfRating: 1 | 2 | 3 | 4) {
    startTransition(async () => {
      const result = await completeSession(sessionId, reviews!, selfRating);
      if (result.success) {
        sessionStorage.removeItem(`session-reviews-${sessionId}`);
        router.push(`/session/${sessionId}/summary`);
      }
    });
  }

  return (
    <div className="flex min-h-dvh flex-col items-center justify-center px-4">
      <div className="w-full max-w-lg space-y-8">
        <div className="text-center space-y-2">
          <p className="text-4xl font-bold">
            {correctCount} / {reviews.length}
          </p>
          <p className="text-muted-foreground">正解数</p>
        </div>

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
