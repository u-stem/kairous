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
  // カード表示開始時刻を記録し、回答までの所要時間を算出する
  const cardStartedAt = useRef(new Date().toISOString());

  const currentCard = cards[currentIndex];
  const isComplete = currentIndex >= cards.length;

  const flip = useCallback(() => {
    setIsFlipped(true);
  }, []);

  const rate = useCallback(
    (rating: 1 | 2 | 3 | 4) => {
      const review: CardReview = {
        card_id: cards[currentIndex].id,
        rating,
        started_at: cardStartedAt.current,
        answered_at: new Date().toISOString(),
      };

      setReviews((prev) => [...prev, review]);
      setCurrentIndex((prev) => prev + 1);
      setIsFlipped(false);
      cardStartedAt.current = new Date().toISOString();
    },
    [cards, currentIndex],
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
