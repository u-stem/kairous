import { describe, it, expect } from "vitest";
import { readFileSync } from "fs";
import { resolve } from "path";

// HTML 属性の構造検査は描画不要なソース検査で十分
function readSource(relativePath: string): string {
  return readFileSync(resolve(__dirname, relativePath), "utf-8");
}

function assertAllButtonsHaveType(source: string, fileName: string) {
  const buttonMatches = source.match(/<button[\s\S]*?>/g) ?? [];
  expect(buttonMatches.length).toBeGreaterThan(0);
  for (const match of buttonMatches) {
    expect(match, `${fileName}: button missing type attribute`).toContain("type=");
  }
}

describe("B8: button type attributes", () => {
  it("rest-timer.tsx has type on all buttons", () => {
    assertAllButtonsHaveType(
      readSource("../../../src/app/rest/[id]/rest-timer.tsx"),
      "rest-timer.tsx",
    );
  });

  it("session-player.tsx has type on all buttons", () => {
    assertAllButtonsHaveType(
      readSource("../../../src/app/session/[id]/session-player.tsx"),
      "session-player.tsx",
    );
  });

  it("start-session-button.tsx has type on all buttons", () => {
    assertAllButtonsHaveType(
      readSource("../../../src/components/start-session-button.tsx"),
      "start-session-button.tsx",
    );
  });
});

describe("B10: material detail stats tab placeholder removed", () => {
  it("does not contain '準備中です' text", () => {
    const source = readSource("../../../src/app/(main)/materials/[id]/page.tsx");
    expect(source).not.toContain("準備中です");
  });
});

describe("S15: material detail tab parameter support", () => {
  const source = readSource("../../../src/app/(main)/materials/[id]/page.tsx");

  it("accepts searchParams prop", () => {
    expect(source).toContain("searchParams");
  });

  it("uses tab parameter to set default tab value", () => {
    expect(source).toMatch(/tab\s*===\s*["']cards["']/);
  });
});
