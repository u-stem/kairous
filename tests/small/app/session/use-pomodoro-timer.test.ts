import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { renderHook, act } from "@testing-library/react";
import { usePomodoroTimer } from "@/app/session/[id]/use-pomodoro-timer";

beforeEach(() => {
  vi.useFakeTimers();
});

afterEach(() => {
  vi.useRealTimers();
});

describe("usePomodoroTimer", () => {
  it("starts in focus phase with full time", () => {
    const { result } = renderHook(() => usePomodoroTimer(10, 5));
    expect(result.current.phase).toBe("focus");
    expect(result.current.remainingSeconds).toBe(10);
    expect(result.current.cycle).toBe(1);
  });

  it("counts down each second during focus", () => {
    const { result } = renderHook(() => usePomodoroTimer(10, 5));
    act(() => { vi.advanceTimersByTime(3000); });
    expect(result.current.remainingSeconds).toBe(7);
  });

  it("transitions to focus_complete when focus timer ends", () => {
    const { result } = renderHook(() => usePomodoroTimer(3, 2));
    act(() => { vi.advanceTimersByTime(3000); });
    expect(result.current.phase).toBe("focus_complete");
    expect(result.current.remainingSeconds).toBe(0);
  });

  it("startBreak transitions to break phase", () => {
    const { result } = renderHook(() => usePomodoroTimer(3, 2));
    act(() => { vi.advanceTimersByTime(3000); });
    act(() => { result.current.startBreak(); });
    expect(result.current.phase).toBe("break");
    expect(result.current.remainingSeconds).toBe(2);
  });

  it("transitions to break_complete when break timer ends", () => {
    const { result } = renderHook(() => usePomodoroTimer(3, 2));
    act(() => { vi.advanceTimersByTime(3000); });
    act(() => { result.current.startBreak(); });
    act(() => { vi.advanceTimersByTime(2000); });
    expect(result.current.phase).toBe("break_complete");
  });

  it("startNextCycle increments cycle and returns to focus", () => {
    const { result } = renderHook(() => usePomodoroTimer(3, 2));
    act(() => { vi.advanceTimersByTime(3000); });
    act(() => { result.current.startBreak(); });
    act(() => { vi.advanceTimersByTime(2000); });
    act(() => { result.current.startNextCycle(); });
    expect(result.current.phase).toBe("focus");
    expect(result.current.cycle).toBe(2);
    expect(result.current.remainingSeconds).toBe(3);
  });

  it("finish marks the session as done", () => {
    const { result } = renderHook(() => usePomodoroTimer(3, 2));
    act(() => { vi.advanceTimersByTime(3000); });
    act(() => { result.current.startBreak(); });
    act(() => { vi.advanceTimersByTime(2000); });
    act(() => { result.current.finish(); });
    expect(result.current.phase).toBe("done");
  });

  it("progress returns correct ratio during focus", () => {
    const { result } = renderHook(() => usePomodoroTimer(10, 5));
    act(() => { vi.advanceTimersByTime(5000); });
    expect(result.current.progress).toBeCloseTo(0.5);
  });

  it("totalBreakSec accumulates across cycles", () => {
    const { result } = renderHook(() => usePomodoroTimer(3, 2));
    // Cycle 1
    act(() => { vi.advanceTimersByTime(3000); });
    act(() => { result.current.startBreak(); });
    act(() => { vi.advanceTimersByTime(2000); });
    act(() => { result.current.startNextCycle(); });
    // Cycle 2
    act(() => { vi.advanceTimersByTime(3000); });
    act(() => { result.current.startBreak(); });
    act(() => { vi.advanceTimersByTime(2000); });
    expect(result.current.totalBreakSec).toBe(4);
  });

  it("totalFocusSec accumulates across cycles", () => {
    const { result } = renderHook(() => usePomodoroTimer(3, 2));
    // Cycle 1
    act(() => { vi.advanceTimersByTime(3000); });
    act(() => { result.current.startBreak(); });
    act(() => { vi.advanceTimersByTime(2000); });
    act(() => { result.current.startNextCycle(); });
    // Cycle 2
    act(() => { vi.advanceTimersByTime(3000); });
    expect(result.current.totalFocusSec).toBe(6);
  });
});
