import { describe, expect, it, vi, beforeEach, afterEach } from "vitest";
import { renderHook, act } from "@testing-library/react";
import { useCustomTimer } from "@/app/session/[id]/use-custom-timer";

describe("useCustomTimer", () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });
  afterEach(() => {
    vi.useRealTimers();
  });

  describe("countdown mode", () => {
    it("counts down from target duration", () => {
      const { result } = renderHook(() => useCustomTimer(300));
      act(() => {
        result.current.start();
      });
      act(() => {
        vi.advanceTimersByTime(1000);
      });
      expect(result.current.elapsedSeconds).toBe(1);
      expect(result.current.remainingSeconds).toBe(299);
    });

    it("marks as target reached when countdown completes", () => {
      const { result } = renderHook(() => useCustomTimer(2));
      act(() => {
        result.current.start();
      });
      act(() => {
        vi.advanceTimersByTime(2000);
      });
      expect(result.current.isTargetReached).toBe(true);
    });

    it("continues counting after target reached", () => {
      const { result } = renderHook(() => useCustomTimer(2));
      act(() => {
        result.current.start();
      });
      act(() => {
        vi.advanceTimersByTime(3000);
      });
      expect(result.current.elapsedSeconds).toBe(3);
      expect(result.current.remainingSeconds).toBe(0);
      expect(result.current.isTargetReached).toBe(true);
    });
  });

  describe("stopwatch mode", () => {
    it("counts up from zero when no target", () => {
      const { result } = renderHook(() => useCustomTimer(null));
      act(() => {
        result.current.start();
      });
      act(() => {
        vi.advanceTimersByTime(5000);
      });
      expect(result.current.elapsedSeconds).toBe(5);
      expect(result.current.remainingSeconds).toBeNull();
    });

    it("isTargetReached is always false in stopwatch mode", () => {
      const { result } = renderHook(() => useCustomTimer(null));
      act(() => {
        result.current.start();
      });
      act(() => {
        vi.advanceTimersByTime(10000);
      });
      expect(result.current.isTargetReached).toBe(false);
    });
  });

  it("supports pause and resume", () => {
    const { result } = renderHook(() => useCustomTimer(null));
    act(() => {
      result.current.start();
    });
    act(() => {
      vi.advanceTimersByTime(3000);
    });
    act(() => {
      result.current.pause();
    });
    act(() => {
      vi.advanceTimersByTime(5000);
    });
    expect(result.current.elapsedSeconds).toBe(3);
    act(() => {
      result.current.start();
    });
    act(() => {
      vi.advanceTimersByTime(2000);
    });
    expect(result.current.elapsedSeconds).toBe(5);
  });

  it("is not running initially", () => {
    const { result } = renderHook(() => useCustomTimer(300));
    expect(result.current.isRunning).toBe(false);
    expect(result.current.elapsedSeconds).toBe(0);
  });
});
