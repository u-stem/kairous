import { describe, it, expect } from "vitest";
import {
  formatStudyTime,
  calcChangeRate,
  aggregateDaily,
  aggregateByKey,
} from "@/lib/utils/stats";

describe("formatStudyTime", () => {
  it("formats seconds under 60 min as Xm", () => {
    expect(formatStudyTime(1800)).toBe("30m");
  });

  it("formats seconds over 60 min as X.Xh", () => {
    expect(formatStudyTime(5400)).toBe("1.5h");
  });

  it("formats 0 seconds as 0m", () => {
    expect(formatStudyTime(0)).toBe("0m");
  });

  it("rounds hours to one decimal", () => {
    expect(formatStudyTime(7500)).toBe("2.1h");
  });

  it("formats exactly 60 min as 1h", () => {
    expect(formatStudyTime(3600)).toBe("1h");
  });

  it("formats 3599 sec (rounds to 60m) as 1h", () => {
    expect(formatStudyTime(3599)).toBe("1h");
  });
});

describe("calcChangeRate", () => {
  it("returns percentage change", () => {
    expect(calcChangeRate(120, 100)).toBe(20);
  });

  it("returns 0 when previous is 0 and current is 0", () => {
    expect(calcChangeRate(0, 0)).toBe(0);
  });

  it("returns 100 when previous is 0 and current is positive", () => {
    expect(calcChangeRate(50, 0)).toBe(100);
  });

  it("returns negative for decrease", () => {
    expect(calcChangeRate(80, 100)).toBe(-20);
  });
});

describe("aggregateDaily", () => {
  it("aggregates rows by log_date", () => {
    const rows = [
      { log_date: "2026-04-01", total_sec: 100, session_count: 1, cards_reviewed: 5, subject_id: "s1", method_id: "m1" },
      { log_date: "2026-04-01", total_sec: 200, session_count: 2, cards_reviewed: 10, subject_id: "s2", method_id: "m1" },
      { log_date: "2026-04-02", total_sec: 300, session_count: 1, cards_reviewed: 8, subject_id: "s1", method_id: "m1" },
    ];
    const result = aggregateDaily(rows);
    expect(result).toEqual([
      { date: "2026-04-01", totalSec: 300, sessionCount: 3 },
      { date: "2026-04-02", totalSec: 300, sessionCount: 1 },
    ]);
  });

  it("returns empty array for empty input", () => {
    expect(aggregateDaily([])).toEqual([]);
  });
});

describe("aggregateByKey", () => {
  it("aggregates rows by specified key with name lookup", () => {
    const rows = [
      { log_date: "2026-04-01", total_sec: 100, session_count: 1, cards_reviewed: 5, subject_id: "s1", method_id: "m1" },
      { log_date: "2026-04-02", total_sec: 200, session_count: 2, cards_reviewed: 10, subject_id: "s1", method_id: "m1" },
      { log_date: "2026-04-01", total_sec: 150, session_count: 1, cards_reviewed: 7, subject_id: "s2", method_id: "m2" },
    ];
    const names = new Map([["s1", "English"], ["s2", "Math"]]);
    const result = aggregateByKey(rows, "subject_id", names);
    expect(result).toEqual([
      { id: "s1", name: "English", totalSec: 300, sessionCount: 3, cardsReviewed: 15 },
      { id: "s2", name: "Math", totalSec: 150, sessionCount: 1, cardsReviewed: 7 },
    ]);
  });

  it("sorts by totalSec descending", () => {
    const rows = [
      { log_date: "2026-04-01", total_sec: 100, session_count: 1, cards_reviewed: 5, subject_id: "s1", method_id: "m1" },
      { log_date: "2026-04-01", total_sec: 500, session_count: 3, cards_reviewed: 20, subject_id: "s2", method_id: "m1" },
    ];
    const names = new Map([["s1", "A"], ["s2", "B"]]);
    const result = aggregateByKey(rows, "subject_id", names);
    expect(result[0].id).toBe("s2");
  });
});
