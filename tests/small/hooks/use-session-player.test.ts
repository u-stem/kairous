import { describe, it, expect } from "vitest";
import { renderHook, act } from "@testing-library/react";
import { useSessionPlayer } from "@/app/session/[id]/use-session-player";

const MOCK_CARDS = [
  { id: "card-1", front: "Q1", back: "A1", display_order: 0 },
  { id: "card-2", front: "Q2", back: "A2", display_order: 1 },
  { id: "card-3", front: "Q3", back: "A3", display_order: 2 },
];

describe("useSessionPlayer", () => {
  it("starts at first card with progress 1/total", () => {
    const { result } = renderHook(() => useSessionPlayer(MOCK_CARDS));

    expect(result.current.currentCard?.id).toBe("card-1");
    expect(result.current.isFlipped).toBe(false);
    expect(result.current.isComplete).toBe(false);
    expect(result.current.progress).toEqual({ current: 1, total: 3 });
  });

  it("flip reveals the answer", () => {
    const { result } = renderHook(() => useSessionPlayer(MOCK_CARDS));

    act(() => result.current.flip());

    expect(result.current.isFlipped).toBe(true);
  });

  it("rate advances to next card and records review", () => {
    const { result } = renderHook(() => useSessionPlayer(MOCK_CARDS));

    act(() => result.current.flip());
    act(() => result.current.rate(3));

    expect(result.current.currentCard?.id).toBe("card-2");
    expect(result.current.isFlipped).toBe(false);
    expect(result.current.reviews).toHaveLength(1);
    expect(result.current.reviews[0].card_id).toBe("card-1");
    expect(result.current.reviews[0].rating).toBe(3);
  });

  it("completes after rating all cards", () => {
    const { result } = renderHook(() => useSessionPlayer(MOCK_CARDS));

    for (let i = 0; i < 3; i++) {
      act(() => result.current.flip());
      act(() => result.current.rate(3));
    }

    expect(result.current.isComplete).toBe(true);
    expect(result.current.reviews).toHaveLength(3);
    expect(result.current.reviews.map((r) => r.card_id)).toEqual([
      "card-1",
      "card-2",
      "card-3",
    ]);
  });

  it("rapid rate calls record correct card_ids without stale closure", () => {
    const { result } = renderHook(() => useSessionPlayer(MOCK_CARDS));

    // 連打シナリオ: flip + rate を同一 act で実行
    act(() => {
      result.current.flip();
      result.current.rate(3);
    });
    act(() => {
      result.current.flip();
      result.current.rate(2);
    });

    expect(result.current.reviews).toHaveLength(2);
    expect(result.current.reviews[0].card_id).toBe("card-1");
    expect(result.current.reviews[1].card_id).toBe("card-2");
  });

  it("ignores rate calls after all cards are completed", () => {
    const { result } = renderHook(() => useSessionPlayer(MOCK_CARDS));

    for (let i = 0; i < 3; i++) {
      act(() => result.current.flip());
      act(() => result.current.rate(3));
    }

    // 完了後の追加 rate は無視される
    act(() => result.current.rate(4));

    expect(result.current.reviews).toHaveLength(3);
    expect(result.current.isComplete).toBe(true);
  });

  it("records started_at and answered_at timestamps in reviews", () => {
    const { result } = renderHook(() => useSessionPlayer(MOCK_CARDS));

    act(() => result.current.flip());
    act(() => result.current.rate(3));

    const review = result.current.reviews[0];
    expect(review.started_at).toBeDefined();
    expect(review.answered_at).toBeDefined();
    expect(new Date(review.started_at).getTime()).toBeLessThanOrEqual(
      new Date(review.answered_at).getTime(),
    );
  });
});
