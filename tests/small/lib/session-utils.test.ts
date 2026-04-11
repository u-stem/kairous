import { describe, it, expect } from "vitest";
import {
  calculateAccuracyRate,
  formatDuration,
  formatDurationHuman,
  calculateResponseMs,
  countByRating,
} from "@/lib/session-utils";

describe("calculateAccuracyRate", () => {
  it("returns ratio of rating >= 3 as correct", () => {
    const reviews = [{ rating: 1 }, { rating: 2 }, { rating: 3 }, { rating: 4 }];
    expect(calculateAccuracyRate(reviews)).toBe(0.5);
  });

  it("returns 0 for empty array", () => {
    expect(calculateAccuracyRate([])).toBe(0);
  });

  it("returns 1 when all correct", () => {
    expect(calculateAccuracyRate([{ rating: 3 }, { rating: 4 }])).toBe(1);
  });

  it("returns 0 when all incorrect", () => {
    expect(calculateAccuracyRate([{ rating: 1 }, { rating: 2 }])).toBe(0);
  });
});

describe("formatDuration", () => {
  it("formats seconds as m:ss", () => {
    expect(formatDuration(272)).toBe("4:32");
  });

  it("formats 0 seconds as 0:00", () => {
    expect(formatDuration(0)).toBe("0:00");
  });

  it("zero-pads single-digit seconds", () => {
    expect(formatDuration(65)).toBe("1:05");
  });

  it("formats 60 seconds as 1:00", () => {
    expect(formatDuration(60)).toBe("1:00");
  });
});

describe("formatDurationHuman", () => {
  it("returns 0秒 for 0", () => {
    expect(formatDurationHuman(0)).toBe("0秒");
  });

  it("returns seconds for under 1 minute", () => {
    expect(formatDurationHuman(30)).toBe("30秒");
  });

  it("returns minutes for 60+ seconds", () => {
    expect(formatDurationHuman(60)).toBe("1分");
  });

  it("truncates partial minutes", () => {
    expect(formatDurationHuman(90)).toBe("1分");
  });

  it("returns hours and minutes for 3600+ seconds", () => {
    expect(formatDurationHuman(3661)).toBe("1時間1分");
  });

  it("omits minutes when exactly on the hour", () => {
    expect(formatDurationHuman(3600)).toBe("1時間");
  });
});

describe("calculateResponseMs", () => {
  it("returns millisecond diff between two ISO strings", () => {
    expect(calculateResponseMs(
      "2026-04-05T10:00:00.000Z",
      "2026-04-05T10:00:05.000Z",
    )).toBe(5000);
  });

  it("returns 0 for same timestamps", () => {
    expect(calculateResponseMs(
      "2026-04-05T10:00:00.000Z",
      "2026-04-05T10:00:00.000Z",
    )).toBe(0);
  });
});

describe("countByRating", () => {
  it("counts reviews by rating", () => {
    const reviews = [{ rating: 1 }, { rating: 3 }, { rating: 3 }, { rating: 4 }];
    expect(countByRating(reviews)).toEqual({ 1: 1, 2: 0, 3: 2, 4: 1 });
  });

  it("returns all zeros for empty array", () => {
    expect(countByRating([])).toEqual({ 1: 0, 2: 0, 3: 0, 4: 0 });
  });
});
