import { describe, it, expect } from "vitest";
import { readFileSync } from "fs";
import { resolve } from "path";

const sql = readFileSync(
  resolve(__dirname, "../../../supabase/migrations/00013_get_interleaving_due_cards.sql"),
  "utf-8",
);

describe("00013_get_interleaving_due_cards migration", () => {
  it("creates get_interleaving_due_cards function", () => {
    expect(sql).toContain("CREATE FUNCTION get_interleaving_due_cards");
  });

  it("accepts p_session_id, p_user_id, p_today parameters", () => {
    expect(sql).toContain("p_session_id UUID");
    expect(sql).toContain("p_user_id UUID");
    expect(sql).toContain("p_today DATE");
  });

  it("joins session_materials with cards and materials", () => {
    expect(sql).toContain("FROM session_materials sm");
    expect(sql).toContain("INNER JOIN materials m ON m.id = sm.material_id");
    expect(sql).toContain("INNER JOIN cards c ON c.material_id = m.id");
  });

  it("filters by due_date using LEFT JOIN with srs_states", () => {
    expect(sql).toContain("LEFT JOIN srs_states ss ON ss.card_id = c.id AND ss.user_id = p_user_id");
    expect(sql).toContain("ss.card_id IS NULL OR ss.due_date <= p_today");
  });

  it("returns material_title for each card", () => {
    expect(sql).toContain("m.title AS material_title");
  });
});
