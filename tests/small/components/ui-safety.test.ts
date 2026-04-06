import { describe, it, expect } from "vitest";
import { readFileSync } from "fs";
import { resolve } from "path";

// UI コンポーネントの HTML 属性はレンダリングなしでも構造検査できる
const restTimerSource = readFileSync(
  resolve(__dirname, "../../../src/app/rest/[id]/rest-timer.tsx"),
  "utf-8",
);
const sessionPlayerSource = readFileSync(
  resolve(__dirname, "../../../src/app/session/[id]/session-player.tsx"),
  "utf-8",
);
const startSessionButtonSource = readFileSync(
  resolve(__dirname, "../../../src/components/start-session-button.tsx"),
  "utf-8",
);
const materialDetailSource = readFileSync(
  resolve(__dirname, "../../../src/app/(main)/materials/[id]/page.tsx"),
  "utf-8",
);

describe("B8: button type attributes", () => {
  it("rest-timer.tsx has type='button' on all buttons", () => {
    // form 外でも type 属性を明示し、意図しない submit を防ぐ
    const buttonMatches = restTimerSource.match(/<button[\s\S]*?>/g) ?? [];
    for (const match of buttonMatches) {
      expect(match).toContain("type=");
    }
  });

  it("session-player.tsx has type='button' on all buttons", () => {
    const buttonMatches = sessionPlayerSource.match(/<button[\s\S]*?>/g) ?? [];
    for (const match of buttonMatches) {
      expect(match).toContain("type=");
    }
  });
});

describe("B9: useSessionPlayer stale closure prevention", () => {
  const hookSource = readFileSync(
    resolve(__dirname, "../../../src/app/session/[id]/use-session-player.ts"),
    "utf-8",
  );

  it("uses ref for currentIndex to avoid stale closure", () => {
    expect(hookSource).toContain("currentIndexRef");
  });

  it("rate callback does not depend on currentIndex state", () => {
    // useCallback の依存配列に currentIndex が含まれていないことを確認
    // [cards, currentIndex] → [cards] に変更されている
    const rateCallbackMatch = hookSource.match(
      /const rate = useCallback\([\s\S]*?\[(.*?)\]/,
    );
    expect(rateCallbackMatch).not.toBeNull();
    expect(rateCallbackMatch![1]).not.toContain("currentIndex");
  });

  it("guards against out-of-bounds access on rapid clicks", () => {
    // idx >= cards.length で早期リターンし、配列外アクセスを防ぐ
    expect(hookSource).toMatch(/idx\s*>=\s*cards\.length/);
  });
});

describe("B10: material detail stats tab placeholder removed", () => {
  it("does not contain '準備中です' text", () => {
    expect(materialDetailSource).not.toContain("準備中です");
  });
});

describe("S14: start-session-button error feedback", () => {
  it("has error state for displaying failure messages", () => {
    expect(startSessionButtonSource).toContain("setError");
  });

  it("renders error text when present", () => {
    expect(startSessionButtonSource).toMatch(/error[\s\S]*?text-red/);
  });
});

describe("S15: material detail tab parameter support", () => {
  it("accepts searchParams prop", () => {
    expect(materialDetailSource).toContain("searchParams");
  });

  it("uses tab parameter to set default tab value", () => {
    // ?tab=cards でカードタブが初期表示される
    expect(materialDetailSource).toMatch(/tab\s*===\s*["']cards["']/);
  });
});
