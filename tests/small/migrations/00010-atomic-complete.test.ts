import { describe, it, expect } from "vitest";
import { readFileSync } from "fs";
import { resolve } from "path";

const migrationPath = resolve(
  __dirname,
  "../../../supabase/migrations/00010_atomic_complete_session.sql",
);
const sql = readFileSync(migrationPath, "utf-8");

describe("00010_atomic_complete_session migration", () => {
  it("creates complete_session_reviews function", () => {
    expect(sql).toContain("CREATE FUNCTION complete_session_reviews");
  });

  it("accepts p_session_id, p_user_id, p_reviews, p_srs_states parameters", () => {
    expect(sql).toContain("p_session_id UUID");
    expect(sql).toContain("p_user_id UUID");
    expect(sql).toContain("p_reviews JSONB");
    expect(sql).toContain("p_srs_states JSONB");
  });

  it("inserts into card_reviews and upserts srs_states in same function", () => {
    expect(sql).toContain("INSERT INTO card_reviews");
    expect(sql).toContain("INSERT INTO srs_states");
    expect(sql).toContain("ON CONFLICT (card_id, user_id)");
  });

  it("verifies session ownership via user_id check", () => {
    // session の user_id と p_user_id の一致を検証する
    expect(sql).toContain("FROM sessions");
    expect(sql).toContain("user_id = p_user_id");
  });

  it("adds owner check to upsert_daily_log", () => {
    // upsert_daily_log が更新対象の user_id を検証する
    expect(sql).toContain("CREATE OR REPLACE FUNCTION upsert_daily_log");
    expect(sql).toMatch(/subjects.*user_id/);
  });

  it("adds owner check to increment_total_cards", () => {
    expect(sql).toContain("CREATE OR REPLACE FUNCTION increment_total_cards");
    expect(sql).toContain("p_user_id");
  });
});
