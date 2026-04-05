import { describe, it, expect } from "vitest";
import { renderHook, act } from "@testing-library/react";
import { useSessionPlayer } from "@/app/session/[id]/use-session-player";
import type { SessionCard } from "@/lib/types/sessions";

const cards: SessionCard[] = [
  { id: "card-1", front: "Q1", back: "A1", display_order: 0 },
  { id: "card-2", front: "Q2", back: "A2", display_order: 1 },
];

describe("useSessionPlayer", () => {
  it("shows first card face-up in initial state", () => {
    const { result } = renderHook(() => useSessionPlayer(cards));
    expect(result.current.currentCard?.id).toBe("card-1");
    expect(result.current.isFlipped).toBe(false);
    expect(result.current.isComplete).toBe(false);
    expect(result.current.progress).toEqual({ current: 1, total: 2 });
  });

  it("flips card on flip()", () => {
    const { result } = renderHook(() => useSessionPlayer(cards));
    act(() => result.current.flip());
    expect(result.current.isFlipped).toBe(true);
  });

  it("advances to next card and records review on rate()", () => {
    const { result } = renderHook(() => useSessionPlayer(cards));
    act(() => result.current.flip());
    act(() => result.current.rate(3));
    expect(result.current.currentCard?.id).toBe("card-2");
    expect(result.current.isFlipped).toBe(false);
    expect(result.current.reviews).toHaveLength(1);
    expect(result.current.reviews[0].card_id).toBe("card-1");
    expect(result.current.reviews[0].rating).toBe(3);
  });

  it("sets isComplete to true after all cards are rated", () => {
    const { result } = renderHook(() => useSessionPlayer(cards));
    act(() => result.current.flip());
    act(() => result.current.rate(3));
    act(() => result.current.flip());
    act(() => result.current.rate(4));
    expect(result.current.isComplete).toBe(true);
    expect(result.current.reviews).toHaveLength(2);
  });

  it("includes started_at and answered_at in reviews", () => {
    const { result } = renderHook(() => useSessionPlayer(cards));
    act(() => result.current.flip());
    act(() => result.current.rate(3));
    const review = result.current.reviews[0];
    expect(review.started_at).toBeTruthy();
    expect(review.answered_at).toBeTruthy();
    expect(new Date(review.answered_at).getTime()).toBeGreaterThanOrEqual(
      new Date(review.started_at).getTime(),
    );
  });
});
