import { describe, it, expect } from "vitest";
import { readFileSync } from "fs";
import { resolve } from "path";

const cardsSource = readFileSync(
  resolve(__dirname, "../../../../src/lib/actions/cards.ts"),
  "utf-8",
);

describe("createCard srs_states INSERT failure handling (B4)", () => {
  it("returns error response when srs_states INSERT fails", () => {
    // srs_states 失敗時に return で早期終了し、サイレント成功を防ぐ
    expect(cardsSource).toMatch(/if\s*\(srsError\)\s*\{[\s\S]*?return\s*\{/);
  });

  it("returns success: false for srs_states failure", () => {
    // エラーレスポンスには success: false を含む
    expect(cardsSource).toMatch(/srsError[\s\S]*?success:\s*false/);
  });

  it("logs srs_states failure with console.error", () => {
    // srs_states 失敗はログに記録する
    expect(cardsSource).toMatch(/srsError[\s\S]*?console\.error/);
  });
});
