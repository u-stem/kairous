"use client";

import { useState, useRef, useCallback } from "react";
import type { CardReview, SessionCard } from "@/lib/types/sessions";

type Progress = {
  current: number;
  total: number;
};

export type SessionPlayerState = {
  currentCard: SessionCard | undefined;
  isFlipped: boolean;
  isComplete: boolean;
  progress: Progress;
  reviews: CardReview[];
  flip: () => void;
  rate: (rating: 1 | 2 | 3 | 4) => void;
};

export function useSessionPlayer(cards: SessionCard[]): SessionPlayerState {
  const [currentIndex, setCurrentIndex] = useState(0);
  const [isFlipped, setIsFlipped] = useState(false);
  const [reviews, setReviews] = useState<CardReview[]>([]);
  // FSRS が応答時間を学習効率の指標として使うため、カード表示時刻を記録する
  const cardStartedAt = useRef(new Date().toISOString());
  // 連打時に stale な closure を参照しないよう ref で最新値を保持する
  const currentIndexRef = useRef(0);

  const currentCard = cards[currentIndex];
  const isComplete = currentIndex >= cards.length;

  const flip = useCallback(() => {
    setIsFlipped(true);
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

      currentIndexRef.current = idx + 1;
      setReviews((prev) => [...prev, review]);
      setCurrentIndex(idx + 1);
      setIsFlipped(false);
      cardStartedAt.current = new Date().toISOString();
    },
    [cards],
  );

  return {
    currentCard,
    isFlipped,
    isComplete,
    progress: { current: Math.min(currentIndex + 1, cards.length), total: cards.length },
    reviews,
    flip,
    rate,
  };
}
