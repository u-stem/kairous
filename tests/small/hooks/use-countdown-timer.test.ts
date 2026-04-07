import { renderHook, act } from "@testing-library/react";
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { useCountdownTimer } from "@/hooks/use-countdown-timer";

describe("useCountdownTimer", () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });
  afterEach(() => {
    vi.useRealTimers();
  });

  it("initializes with correct state", () => {
    const { result } = renderHook(() => useCountdownTimer(60));
    expect(result.current.remainingSeconds).toBe(60);
    expect(result.current.progress).toBe(1);
    expect(result.current.isRunning).toBe(false);
    expect(result.current.isComplete).toBe(false);
  });

  it("counts down after start", () => {
    const { result } = renderHook(() => useCountdownTimer(10));
    act(() => {
      result.current.start();
    });
    expect(result.current.isRunning).toBe(true);
    act(() => {
      vi.advanceTimersByTime(3000);
    });
    expect(result.current.remainingSeconds).toBe(7);
    expect(result.current.progress).toBeCloseTo(0.7);
  });

  it("stops at zero and sets isComplete", () => {
    const { result } = renderHook(() => useCountdownTimer(3));
    act(() => {
      result.current.start();
    });
    act(() => {
      vi.advanceTimersByTime(3000);
    });
    expect(result.current.remainingSeconds).toBe(0);
    expect(result.current.isComplete).toBe(true);
    expect(result.current.isRunning).toBe(false);
  });

  it("pauses the countdown", () => {
    const { result } = renderHook(() => useCountdownTimer(10));
    act(() => {
      result.current.start();
    });
    act(() => {
      vi.advanceTimersByTime(2000);
    });
    act(() => {
      result.current.pause();
    });
    expect(result.current.isRunning).toBe(false);
    expect(result.current.remainingSeconds).toBe(8);
    act(() => {
      vi.advanceTimersByTime(3000);
    });
    expect(result.current.remainingSeconds).toBe(8);
  });

  it("resets to initial state", () => {
    const { result } = renderHook(() => useCountdownTimer(10));
    act(() => {
      result.current.start();
    });
    act(() => {
      vi.advanceTimersByTime(5000);
    });
    act(() => {
      result.current.reset();
    });
    expect(result.current.remainingSeconds).toBe(10);
    expect(result.current.isRunning).toBe(false);
    expect(result.current.isComplete).toBe(false);
  });
});
