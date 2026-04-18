import { describe, it, expect } from "vitest";
import { ja } from "date-fns/locale";
import { toJstDateString, formatDateString } from "@/lib/utils/date";

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

describe("formatDateString", () => {
  it("YYYY-MM-DD を local TZ として解釈し pattern で format する", () => {
    // `new Date("2026-05-01")` が UTC 扱いで JST 4/30 になる問題を parseISO で回避 (#330)
    expect(formatDateString("2026-05-01")).toBe("2026/5/1");
  });

  it("pattern 未指定時は yyyy/M/d デフォルトを使う", () => {
    expect(formatDateString("2026-12-09")).toBe("2026/12/9");
  });

  it("pattern 指定で任意書式に整形できる", () => {
    expect(formatDateString("2026-05-01", "yyyy-MM-dd")).toBe("2026-05-01");
  });

  it("locale 未指定時は英語 locale で曜日が出力される", () => {
    // locale ありとの対比を self-documenting にするためのベースライン
    expect(formatDateString("2026-05-01", "M/d (E)")).toBe("5/1 (Fri)");
  });

  it("locale 指定で曜日を日本語に整形できる (daily-chart 等の集約先)", () => {
    expect(formatDateString("2026-05-01", "M/d (E)", { locale: ja })).toBe(
      "5/1 (金)",
    );
  });
});
