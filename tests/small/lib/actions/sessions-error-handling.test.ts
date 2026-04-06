import { describe, it, expect } from "vitest";
import { readFileSync } from "fs";
import { resolve } from "path";

const sessionsSource = readFileSync(
  resolve(__dirname, "../../../../src/lib/actions/sessions.ts"),
  "utf-8",
);

describe("completeSession compensation error handling (B3)", () => {
  it("captures compensation UPDATE error into a variable", () => {
    // 補償処理の結果を変数に取り、エラー握りつぶしを防ぐ
    expect(sessionsSource).toMatch(/\{\s*error:\s*\w+\s*\}.*=.*await\s+supabase[\s\S]*?status:\s*["']in_progress["']/);
  });

  it("logs compensation failure with console.error", () => {
    // 補償処理失敗時に console.error でログを出力する
    expect(sessionsSource).toContain("compensation");
    expect(sessionsSource).toMatch(/console\.error\([^)]*compensation/);
  });
});

describe("getSession card_reviews ownership filter (S3)", () => {
  it("includes session ownership join in card_reviews query", () => {
    // card_reviews クエリが sessions テーブル経由で所有権を検証する
    expect(sessionsSource).toMatch(/card_reviews[\s\S]*?sessions!inner/);
  });

  it("filters card_reviews by session user_id", () => {
    // sessions.user_id でフィルタし TOCTOU リスクを排除する
    expect(sessionsSource).toContain("sessions.user_id");
  });
});

describe("completeRestSession validation schema (S7)", () => {
  it("uses completeRestSessionSchema instead of z.uuid()", () => {
    // z.uuid() 直接使用ではなく共通スキーマを使う
    expect(sessionsSource).toContain("completeRestSessionSchema");
    // z.uuid().safeParse のような直接呼び出しがないことを確認
    expect(sessionsSource).not.toMatch(/z\.uuid\(\)\.safeParse/);
  });

  it("returns Japanese error message for invalid input", () => {
    // completeRestSession のバリデーションエラーメッセージが日本語
    // "Invalid session ID" ではなく "入力内容を確認してください" を返す
    expect(sessionsSource).not.toContain('"Invalid session ID"');
  });
});
