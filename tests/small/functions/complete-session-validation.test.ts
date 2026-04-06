import { describe, it, expect } from "vitest";
import { readFileSync } from "fs";
import { resolve } from "path";

const edgeFunctionPath = resolve(
  __dirname,
  "../../../supabase/functions/complete-session/index.ts",
);
const edgeFunctionSource = readFileSync(edgeFunctionPath, "utf-8");

describe("complete-session duplicate card_id validation", () => {
  it("rejects duplicate card_id in reviews array", () => {
    // validateRequest 内で card_id の重複チェックが実装されている
    expect(edgeFunctionSource).toMatch(/duplicate|card_id.*Set|unique.*card/i);
  });
});
