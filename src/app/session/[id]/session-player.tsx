"use client";

import { useEffect } from "react";
import { useRouter } from "next/navigation";
import { useSessionPlayer } from "./use-session-player";
import { RATING_LABELS, RATING_COLORS } from "@/lib/constants";
import type { SessionCard } from "@/lib/types/sessions";

type Props = {
  sessionId: string;
  cards: SessionCard[];
};

const RATINGS = [1, 2, 3, 4] as const;

export function SessionPlayer({ sessionId, cards }: Props) {
  const router = useRouter();
  const { currentCard, isFlipped, isComplete, progress, reviews, flip, rate } =
    useSessionPlayer(cards);

  // 全カード回答完了時、レビューを sessionStorage に保存してレビュー画面へ遷移
  useEffect(() => {
    if (!isComplete) return;
    sessionStorage.setItem(
      `session-reviews-${sessionId}`,
      JSON.stringify(reviews),
    );
    router.push(`/session/${sessionId}/review`);
  }, [isComplete, sessionId, reviews, router]);

  if (!currentCard) return null;

  return (
    <div className="flex min-h-dvh flex-col">
      <header className="border-b px-4 py-3">
        <p className="text-sm text-muted-foreground">
          {progress.current} / {progress.total}
        </p>
      </header>

      <main className="flex flex-1 flex-col items-center justify-center px-4">
        <div className="w-full max-w-lg space-y-4">
          <div className="rounded-lg border p-6">
            <p className="text-lg whitespace-pre-wrap">{currentCard.front}</p>
            {isFlipped && (
              <>
                <hr className="my-4" />
                <p className="text-lg whitespace-pre-wrap">{currentCard.back}</p>
              </>
            )}
          </div>
        </div>
      </main>

      <footer className="border-t px-4 py-4">
        {!isFlipped ? (
          <button
            type="button"
            onClick={flip}
            className="w-full rounded-lg bg-primary py-3 text-primary-foreground"
          >
            めくる
          </button>
        ) : (
          <div className="grid grid-cols-4 gap-2">
            {RATINGS.map((r) => (
              <button
                key={r}
                type="button"
                onClick={() => rate(r)}
                className={`rounded-lg py-3 text-sm font-medium text-white ${RATING_COLORS[r]}`}
              >
                {RATING_LABELS[r]}
              </button>
            ))}
          </div>
        )}
      </footer>
    </div>
  );
}
