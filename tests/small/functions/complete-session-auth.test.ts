import { describe, it, expect } from "vitest";
import { readFileSync } from "fs";
import { resolve } from "path";

const edgeFunctionPath = resolve(
  __dirname,
  "../../../supabase/functions/complete-session/index.ts",
);
const edgeFunctionSource = readFileSync(edgeFunctionPath, "utf-8");

describe("complete-session auth model (JWT only)", () => {
  it("does not compare Authorization header with service_role key for auth", () => {
    // service_role key との文字列比較は timing attack のリスクがあるため廃止
    // createClient での使用は DB 操作に必要なため許容する
    expect(edgeFunctionSource).not.toContain("isServiceRole");
    expect(edgeFunctionSource).not.toMatch(/authHeader.*SERVICE_ROLE/);
  });

  it("extracts user_id from x-user-id header set by Server Action", () => {
    // Server Action が JWT から取得した user_id を x-user-id ヘッダーで渡す
    expect(edgeFunctionSource).toContain("x-user-id");
  });

  it("verifies x-user-id matches session.user_id", () => {
    // 他ユーザーのセッション完了を防止
    expect(edgeFunctionSource).toContain("session.user_id");
  });
});
