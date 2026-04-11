import { describe, it, expect } from "vitest";
import { calculateStreak } from "@/lib/utils/streak";

describe("calculateStreak", () => {
  it("returns streak 0 when dates is empty", () => {
    expect(calculateStreak([], "2026-04-11")).toEqual({
      currentStreak: 0,
      longestStreak: 0,
      isActiveToday: false,
    });
  });

  it("returns streak 1 when only today is present", () => {
    expect(calculateStreak(["2026-04-11"], "2026-04-11")).toEqual({
      currentStreak: 1,
      longestStreak: 1,
      isActiveToday: true,
    });
  });

  it("returns streak 3 when today and two consecutive previous days are present", () => {
    expect(
      calculateStreak(["2026-04-11", "2026-04-10", "2026-04-09"], "2026-04-11")
    ).toEqual({
      currentStreak: 3,
      longestStreak: 3,
      isActiveToday: true,
    });
  });

  it("returns streak 2 when yesterday and day before exist but today does not", () => {
    // 今日はまだ学習していないが streak は維持される
    expect(
      calculateStreak(["2026-04-10", "2026-04-09"], "2026-04-11")
    ).toEqual({
      currentStreak: 2,
      longestStreak: 2,
      isActiveToday: false,
    });
  });

  it("returns streak 1 when today exists but yesterday is missing", () => {
    // 昨日が欠けているので streak は今日の1日のみ
    expect(
      calculateStreak(["2026-04-11", "2026-04-08"], "2026-04-11")
    ).toEqual({
      currentStreak: 1,
      longestStreak: 1,
      isActiveToday: true,
    });
  });

  it("returns current streak less than longest streak when recent streak is broken", () => {
    // 過去に3日連続があるが現在は1日だけ
    const dates = [
      "2026-04-11",
      "2026-04-05",
      "2026-04-04",
      "2026-04-03",
    ];
    const result = calculateStreak(dates, "2026-04-11");
    expect(result).toEqual({
      currentStreak: 1,
      longestStreak: 3,
      isActiveToday: true,
    });
  });

  it("returns streak 1 when only yesterday is present", () => {
    // 昨日のみ学習済み、今日はまだ → streak 維持
    expect(calculateStreak(["2026-04-10"], "2026-04-11")).toEqual({
      currentStreak: 1,
      longestStreak: 1,
      isActiveToday: false,
    });
  });

  it("returns streak 0 when neither today nor yesterday is present", () => {
    // 2日以上前に途切れているので currentStreak は 0
    const dates = ["2026-04-09", "2026-04-08"];
    expect(calculateStreak(dates, "2026-04-11")).toEqual({
      currentStreak: 0,
      longestStreak: 2,
      isActiveToday: false,
    });
  });
});
