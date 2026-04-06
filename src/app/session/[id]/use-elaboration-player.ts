"use client";

import { useState, useRef, useCallback } from "react";
import type { CardReview, SessionCard } from "@/lib/types/sessions";
import type { ElaborationInput } from "@/lib/validations/elaboration";

type Progress = {
  current: number;
  total: number;
};

export type ElaborationPlayerState = {
  currentCard: SessionCard | undefined;
  isRevealed: boolean;
  isComplete: boolean;
  text: string;
  setText: (text: string) => void;
  reveal: () => void;
  rate: (rating: 1 | 2 | 3 | 4) => void;
  progress: Progress;
  reviews: CardReview[];
  elaborations: ElaborationInput[];
};

export function useElaborationPlayer(cards: SessionCard[]): ElaborationPlayerState {
  const [currentIndex, setCurrentIndex] = useState(0);
  const [isRevealed, setIsRevealed] = useState(false);
  const [text, setText] = useState("");
  const [reviews, setReviews] = useState<CardReview[]>([]);
  const [elaborations, setElaborations] = useState<ElaborationInput[]>([]);
  // rate コールバック内でクロージャの古い値を参照しないよう ref で同期する
  const cardStartedAt = useRef(new Date().toISOString());
  const currentIndexRef = useRef(0);

  const currentCard = cards[currentIndex];
  const isComplete = currentIndex >= cards.length;

  const reveal = useCallback(() => {
    setIsRevealed(true);
  }, []);

  const rate = useCallback(
    (rating: 1 | 2 | 3 | 4) => {
      const idx = currentIndexRef.current;
      if (idx >= cards.length) return;

      const review: CardReview = {
        card_id: cards[idx].id,
        rating,
        started_at: cardStartedAt.current,
        answered_at: new Date().toISOString(),
      };

      const elaboration: ElaborationInput = {
        card_id: cards[idx].id,
        text,
      };

      currentIndexRef.current = idx + 1;
      setReviews((prev) => [...prev, review]);
      setElaborations((prev) => [...prev, elaboration]);
      setCurrentIndex(idx + 1);
      setIsRevealed(false);
      setText("");
      // 次のカードの started_at をリセット
      cardStartedAt.current = new Date().toISOString();
    },
    [cards, text],
  );

  return {
    currentCard,
    isRevealed,
    isComplete,
    text,
    setText,
    reveal,
    rate,
    progress: { current: Math.min(currentIndex + 1, cards.length), total: cards.length },
    reviews,
    elaborations,
  };
}
