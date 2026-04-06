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

  it("does not use x-user-id header for authentication", () => {
    // x-user-id ヘッダーは偽装可能なため廃止。JWT から user_id を取得する
    expect(edgeFunctionSource).not.toContain("x-user-id");
  });

  it("verifies user identity via Supabase Auth JWT", () => {
    // JWT を Supabase Auth サーバーで検証して user_id を取得
    expect(edgeFunctionSource).toContain("auth.getUser");
  });

  it("verifies caller matches session.user_id", () => {
    // 他ユーザーのセッション完了を防止
    expect(edgeFunctionSource).toContain("session.user_id");
  });
});
