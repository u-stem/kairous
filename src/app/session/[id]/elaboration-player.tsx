"use client";

import { useEffect } from "react";
import { useRouter } from "next/navigation";
import { useElaborationPlayer } from "./use-elaboration-player";
import { SELF_RATING_LABELS, RATING_COLORS, SELF_RATINGS } from "@/lib/constants";
import type { SessionCard } from "@/lib/types/sessions";

type Props = {
  sessionId: string;
  cards: SessionCard[];
};

export function ElaborationPlayer({ sessionId, cards }: Props) {
  const router = useRouter();
  const {
    currentCard,
    isRevealed,
    isComplete,
    text,
    setText,
    reveal,
    rate,
    progress,
    reviews,
    elaborations,
  } = useElaborationPlayer(cards);

  useEffect(() => {
    if (!isComplete) return;
    // review ページで Server Action に渡すため、sessionStorage 経由で引き継ぐ
    sessionStorage.setItem(
      `session-reviews-${sessionId}`,
      JSON.stringify(reviews),
    );
    sessionStorage.setItem(
      `session-elaborations-${sessionId}`,
      JSON.stringify(elaborations),
    );
    router.push(`/session/${sessionId}/review`);
  }, [isComplete, sessionId, reviews, elaborations, router]);

  if (!currentCard) return null;

  return (
    <div className="flex min-h-dvh flex-col">
      <header className="border-b px-4 py-3">
        <p className="text-sm text-muted-foreground">
          {progress.current} / {progress.total}
        </p>
      </header>

      <main className="flex flex-1 flex-col px-4 py-6">
        <div className="mx-auto w-full max-w-lg space-y-4">
          <div className="rounded-lg border p-6" aria-live="polite" aria-atomic="true">
            <p className="sr-only">{isRevealed ? "カード裏面" : "カード表面"}</p>
            <p className="text-lg whitespace-pre-wrap">{currentCard.front}</p>
            {isRevealed && (
              <>
                <hr className="my-4" />
                <p className="text-lg whitespace-pre-wrap">{currentCard.back}</p>
              </>
            )}
          </div>

          {!isRevealed && (
            <div className="space-y-2">
              <label htmlFor="elaboration-text" className="text-sm font-medium text-muted-foreground">
                なぜそうなるか、自分の言葉で説明してください
              </label>
              <textarea
                id="elaboration-text"
                value={text}
                onChange={(e) => setText(e.target.value)}
                className="w-full rounded-lg border bg-background p-3 text-sm focus:outline-none focus:ring-2 focus:ring-primary"
                rows={4}
                placeholder="ここに説明を入力..."
              />
            </div>
          )}
        </div>
      </main>

      <footer className="border-t px-4 py-4">
        {!isRevealed ? (
          <button
            type="button"
            onClick={reveal}
            disabled={text.trim().length === 0}
            className="w-full rounded-lg bg-primary py-3 text-primary-foreground disabled:opacity-50"
          >
            回答を確認
          </button>
        ) : (
          <div className="grid grid-cols-2 gap-2">
            {SELF_RATINGS.map((r) => (
              <button
                key={r}
                type="button"
                onClick={() => rate(r)}
                className={`rounded-lg py-3 text-sm font-medium text-white ${RATING_COLORS[r]}`}
              >
                {SELF_RATING_LABELS[r]}
              </button>
            ))}
          </div>
        )}
      </footer>
    </div>
  );
}
