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
  "../../../supabase/migrations/00006_upsert_daily_log.sql",
);
const migrationSource = readFileSync(migrationPath, "utf-8");

describe("daily_logs upsert (race condition prevention)", () => {
  it("Edge Function calls upsert_daily_log RPC instead of SELECT->UPDATE/INSERT", () => {
    // RPC 呼び出しが存在する
    expect(edgeFunctionSource).toContain('.rpc("upsert_daily_log"');

    // 非原子的な SELECT->UPDATE パターンが存在しない
    expect(edgeFunctionSource).not.toMatch(
      /from\("daily_logs"\)\s*\n\s*\.select\(/,
    );
    expect(edgeFunctionSource).not.toMatch(
      /from\("daily_logs"\)\s*\n\s*\.update\(/,
    );
    expect(edgeFunctionSource).not.toMatch(
      /from\("daily_logs"\)\s*\n\s*\.insert\(/,
    );
  });

  it("RPC migration uses ON CONFLICT for atomic upsert", () => {
    expect(migrationSource).toContain(
      "ON CONFLICT (user_id, subject_id, method_id, log_date)",
    );
  });

  it("RPC migration increments existing values instead of overwriting", () => {
    // total_sec, session_count, cards_reviewed が加算される
    expect(migrationSource).toContain(
      "daily_logs.total_sec + EXCLUDED.total_sec",
    );
    expect(migrationSource).toContain("daily_logs.session_count + 1");
    expect(migrationSource).toContain(
      "daily_logs.cards_reviewed + EXCLUDED.cards_reviewed",
    );
  });

  it("Edge Function passes required parameters to upsert_daily_log RPC", () => {
    // RPC に渡すパラメータ名が含まれている
    expect(edgeFunctionSource).toContain("p_user_id");
    expect(edgeFunctionSource).toContain("p_subject_id");
    expect(edgeFunctionSource).toContain("p_method_id");
    expect(edgeFunctionSource).toContain("p_log_date");
    expect(edgeFunctionSource).toContain("p_duration_sec");
    expect(edgeFunctionSource).toContain("p_cards_reviewed");
  });
});
