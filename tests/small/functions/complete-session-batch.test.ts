import { describe, it, expect } from "vitest";
import { readFileSync } from "fs";
import { resolve } from "path";

const edgeFunctionPath = resolve(
  __dirname,
  "../../../supabase/functions/complete-session/index.ts",
);
const edgeFunctionSource = readFileSync(edgeFunctionPath, "utf-8");

const migrationPath = resolve(
  __dirname,
  "../../../supabase/migrations/00008_batch_upsert_srs_states.sql",
);
const migrationSource = readFileSync(migrationPath, "utf-8");

describe("srs_states batch upsert (performance improvement)", () => {
  it("Edge Function calls complete_session_reviews RPC for atomic batch write", () => {
    // card_reviews + srs_states を原子的に処理する RPC を呼び出す
    expect(edgeFunctionSource).toContain('.rpc("complete_session_reviews"');

    // ループ内の個別 UPDATE/INSERT パターンが存在しない
    expect(edgeFunctionSource).not.toMatch(
      /from\("srs_states"\)\s*\n\s*\.update\(/,
    );
    expect(edgeFunctionSource).not.toMatch(
      /from\("srs_states"\)\s*\n\s*\.insert\(newState\)/,
    );
  });

  it("Edge Function passes p_srs_states parameter as JSONB array to atomic RPC", () => {
    expect(edgeFunctionSource).toContain("p_srs_states");
  });

  it("RPC migration uses ON CONFLICT (card_id, user_id) for atomic batch upsert", () => {
    // srs_states の UNIQUE 制約は (card_id, user_id) の複合キー
    expect(migrationSource).toContain("ON CONFLICT (card_id, user_id)");
  });

  it("RPC migration accepts JSONB array parameter p_states", () => {
    expect(migrationSource).toContain("p_states JSONB");
  });

  it("RPC migration inserts all required srs_states columns", () => {
    // 必要なカラムが全て含まれている
    expect(migrationSource).toContain("card_id");
    expect(migrationSource).toContain("user_id");
    expect(migrationSource).toContain("stability");
    expect(migrationSource).toContain("difficulty");
    expect(migrationSource).toContain("due_date");
    expect(migrationSource).toContain("state");
    expect(migrationSource).toContain("reps");
    expect(migrationSource).toContain("lapses");
  });

  it("RPC migration updates existing rows on conflict", () => {
    // 競合時に DO UPDATE で既存行を更新する
    expect(migrationSource).toContain("DO UPDATE SET");
  });
});
