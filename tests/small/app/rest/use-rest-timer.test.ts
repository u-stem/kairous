import { describe, it, expect, vi, afterEach } from "vitest";
import { renderHook, act } from "@testing-library/react";
import { useRestTimer } from "@/app/rest/[id]/use-rest-timer";

describe("useRestTimer", () => {
  afterEach(() => {
    vi.useRealTimers();
  });

  it("initializes with totalSeconds", () => {
    const { result } = renderHook(() => useRestTimer(600));
    expect(result.current.remainingSeconds).toBe(600);
    expect(result.current.isComplete).toBe(false);
  });

  it("counts down every second", () => {
    vi.useFakeTimers();
    const { result } = renderHook(() => useRestTimer(10));
    act(() => {
      vi.advanceTimersByTime(3000);
    });
    expect(result.current.remainingSeconds).toBe(7);
  });

  it("sets isComplete when reaching 0", () => {
    vi.useFakeTimers();
    const { result } = renderHook(() => useRestTimer(2));
    act(() => {
      vi.advanceTimersByTime(2000);
    });
    expect(result.current.remainingSeconds).toBe(0);
    expect(result.current.isComplete).toBe(true);
  });

  it("progress decreases from 1 to 0", () => {
    vi.useFakeTimers();
    const { result } = renderHook(() => useRestTimer(10));
    expect(result.current.progress).toBe(1);
    act(() => {
      vi.advanceTimersByTime(5000);
    });
    expect(result.current.progress).toBe(0.5);
  });
});
