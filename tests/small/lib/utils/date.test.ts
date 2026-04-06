import { describe, it, expect } from "vitest";
import { toJstDateString } from "@/lib/utils/date";

describe("toJstDateString", () => {
  it("returns JST date when UTC is 14:00 (JST 23:00 same day)", () => {
    // 2026-04-06T14:00:00Z = 2026-04-06T23:00:00+09:00
    const date = new Date("2026-04-06T14:00:00Z");
    expect(toJstDateString(date)).toBe("2026-04-06");
  });

  it("returns next JST date when UTC is 15:00 (JST 0:00 next day)", () => {
    // 2026-04-06T15:00:00Z = 2026-04-07T00:00:00+09:00
    const date = new Date("2026-04-06T15:00:00Z");
    expect(toJstDateString(date)).toBe("2026-04-07");
  });

  it("returns JST date for midday UTC (JST 21:00)", () => {
    // 2026-04-06T12:00:00Z = 2026-04-06T21:00:00+09:00
    const date = new Date("2026-04-06T12:00:00Z");
    expect(toJstDateString(date)).toBe("2026-04-06");
  });

  it("returns previous JST date boundary correctly for UTC midnight", () => {
    // 2026-04-06T00:00:00Z = 2026-04-06T09:00:00+09:00
    const date = new Date("2026-04-06T00:00:00Z");
    expect(toJstDateString(date)).toBe("2026-04-06");
  });

  it("returns correct JST date for late UTC evening (JST next morning)", () => {
    // 2026-04-06T23:00:00Z = 2026-04-07T08:00:00+09:00
    const date = new Date("2026-04-06T23:00:00Z");
    expect(toJstDateString(date)).toBe("2026-04-07");
  });
});
