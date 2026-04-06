import { describe, it, expect } from "vitest";
import { renderHook, act } from "@testing-library/react";
import { useElaborationPlayer } from "@/app/session/[id]/use-elaboration-player";
import type { SessionCard } from "@/lib/types/sessions";

const cards: SessionCard[] = [
  { id: "card-1", front: "Q1", back: "A1", display_order: 1 },
  { id: "card-2", front: "Q2", back: "A2", display_order: 2 },
];

describe("useElaborationPlayer", () => {
  it("starts with first card, not revealed, empty text", () => {
    const { result } = renderHook(() => useElaborationPlayer(cards));
    expect(result.current.currentCard?.id).toBe("card-1");
    expect(result.current.isRevealed).toBe(false);
    expect(result.current.text).toBe("");
  });

  it("setText updates the current elaboration text", () => {
    const { result } = renderHook(() => useElaborationPlayer(cards));
    act(() => result.current.setText("my explanation"));
    expect(result.current.text).toBe("my explanation");
  });

  it("reveal shows the back of the card", () => {
    const { result } = renderHook(() => useElaborationPlayer(cards));
    act(() => result.current.setText("explanation"));
    act(() => result.current.reveal());
    expect(result.current.isRevealed).toBe(true);
  });

  it("rate advances to next card and resets state", () => {
    const { result } = renderHook(() => useElaborationPlayer(cards));
    act(() => result.current.setText("explanation"));
    act(() => result.current.reveal());
    act(() => result.current.rate(3));
    expect(result.current.currentCard?.id).toBe("card-2");
    expect(result.current.isRevealed).toBe(false);
    expect(result.current.text).toBe("");
  });

  it("records review with card_id, rating, and timestamps", () => {
    const { result } = renderHook(() => useElaborationPlayer(cards));
    act(() => result.current.setText("explanation"));
    act(() => result.current.reveal());
    act(() => result.current.rate(3));
    expect(result.current.reviews).toHaveLength(1);
    expect(result.current.reviews[0].card_id).toBe("card-1");
    expect(result.current.reviews[0].rating).toBe(3);
  });

  it("records elaboration text per card", () => {
    const { result } = renderHook(() => useElaborationPlayer(cards));
    act(() => result.current.setText("first explanation"));
    act(() => result.current.reveal());
    act(() => result.current.rate(3));
    expect(result.current.elaborations).toHaveLength(1);
    expect(result.current.elaborations[0]).toEqual({
      card_id: "card-1",
      text: "first explanation",
    });
  });

  it("isComplete becomes true after all cards are rated", () => {
    const { result } = renderHook(() => useElaborationPlayer(cards));
    act(() => result.current.setText("e1"));
    act(() => result.current.reveal());
    act(() => result.current.rate(3));
    act(() => result.current.setText("e2"));
    act(() => result.current.reveal());
    act(() => result.current.rate(4));
    expect(result.current.isComplete).toBe(true);
    expect(result.current.reviews).toHaveLength(2);
    expect(result.current.elaborations).toHaveLength(2);
  });

  it("progress shows current/total correctly", () => {
    const { result } = renderHook(() => useElaborationPlayer(cards));
    expect(result.current.progress).toEqual({ current: 1, total: 2 });
    act(() => result.current.setText("e1"));
    act(() => result.current.reveal());
    act(() => result.current.rate(3));
    expect(result.current.progress).toEqual({ current: 2, total: 2 });
  });
});
