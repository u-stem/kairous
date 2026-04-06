import { describe, it, expect } from "vitest";
import { readFileSync } from "fs";
import { resolve } from "path";

const edgeFunctionPath = resolve(
  __dirname,
  "../../../supabase/functions/complete-session/index.ts",
);
const edgeFunctionSource = readFileSync(edgeFunctionPath, "utf-8");

describe("complete-session atomic write (card_reviews + srs_states)", () => {
  it("calls single atomic RPC instead of separate INSERT and batch_upsert", () => {
    // card_reviews INSERT と srs_states upsert が単一の RPC で実行される
    expect(edgeFunctionSource).toContain('.rpc("complete_session_reviews"');
  });

  it("does not INSERT card_reviews directly from Edge Function", () => {
    // Edge Function 側での直接 INSERT は原子性を壊す
    expect(edgeFunctionSource).not.toMatch(/from\("card_reviews"\)\s*\n\s*\.insert\(/);
  });

  it("does not call batch_upsert_srs_states separately", () => {
    // 旧 RPC は新しい原子的 RPC に統合される
    expect(edgeFunctionSource).not.toContain('.rpc("batch_upsert_srs_states"');
  });
});
