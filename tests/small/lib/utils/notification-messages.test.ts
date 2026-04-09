import { describe, it, expect } from "vitest";
import {
  buildDueTodayMessage,
  buildReviewAndPreviewMessage,
} from "@/lib/utils/notification-messages";

describe("buildDueTodayMessage", () => {
  it("returns due card count with single subject", () => {
    const result = buildDueTodayMessage([{ subject: "数学", count: 5 }]);
    expect(result.title).toBe("今日の復習: 5枚");
    expect(result.body).toBe("数学 5枚");
  });

  it("returns due card count with two subjects", () => {
    const result = buildDueTodayMessage([
      { subject: "数学", count: 5 },
      { subject: "英語", count: 7 },
    ]);
    expect(result.title).toBe("今日の復習: 12枚");
    expect(result.body).toBe("数学 5枚 / 英語 7枚");
  });

  it("truncates to top 2 subjects when 3 or more", () => {
    const result = buildDueTodayMessage([
      { subject: "数学", count: 5 },
      { subject: "英語", count: 7 },
      { subject: "物理", count: 3 },
    ]);
    expect(result.title).toBe("今日の復習: 15枚");
    expect(result.body).toBe("数学 5枚 / 英語 7枚 ほか1科目");
  });

  it("truncates to top 2 subjects when 4 or more", () => {
    const result = buildDueTodayMessage([
      { subject: "数学", count: 5 },
      { subject: "英語", count: 7 },
      { subject: "物理", count: 3 },
      { subject: "化学", count: 2 },
    ]);
    expect(result.body).toBe("数学 5枚 / 英語 7枚 ほか2科目");
  });

  it("returns no-due message when empty", () => {
    const result = buildDueTodayMessage([]);
    expect(result.title).toBe("今日の復習はありません");
    expect(result.body).toBe("新しい教材を追加してみませんか?");
  });
});

describe("buildReviewAndPreviewMessage", () => {
  it("returns review and preview with sessions completed", () => {
    const result = buildReviewAndPreviewMessage({
      sessionsToday: 3,
      dueTomorrow: [
        { subject: "数学", count: 5 },
        { subject: "英語", count: 7 },
      ],
    });
    expect(result.title).toBe("今日は 3セッション完了!");
    expect(result.body).toBe("明日は 数学 5枚 / 英語 7枚 が待っています");
  });

  it("falls back to due-only message when no sessions today", () => {
    const result = buildReviewAndPreviewMessage({
      sessionsToday: 0,
      dueTomorrow: [
        { subject: "数学", count: 5 },
        { subject: "英語", count: 7 },
      ],
    });
    expect(result.title).toBe("明日の復習: 12枚");
    expect(result.body).toBe("数学 5枚 / 英語 7枚");
  });

  it("truncates subjects in preview when 3 or more", () => {
    const result = buildReviewAndPreviewMessage({
      sessionsToday: 2,
      dueTomorrow: [
        { subject: "数学", count: 5 },
        { subject: "英語", count: 7 },
        { subject: "物理", count: 3 },
      ],
    });
    expect(result.body).toBe("明日は 数学 5枚 / 英語 7枚 ほか1科目 が待っています");
  });

  it("handles no due cards tomorrow", () => {
    const result = buildReviewAndPreviewMessage({
      sessionsToday: 2,
      dueTomorrow: [],
    });
    expect(result.title).toBe("今日は 2セッション完了!");
    expect(result.body).toBe("明日の復習はありません");
  });

  it("handles no sessions and no due cards", () => {
    const result = buildReviewAndPreviewMessage({
      sessionsToday: 0,
      dueTomorrow: [],
    });
    expect(result.title).toBe("今日はまだセッションがありません");
    expect(result.body).toBe("明日の復習はありません");
  });
});
