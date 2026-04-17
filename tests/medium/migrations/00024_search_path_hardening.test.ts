import { describe, expect, it } from "vitest";
import { getAdminClient } from "../setup";

// 本 migration は ALTER FUNCTION ... SET search_path = public で関数 4 つのハードニングを行う。
// ALTER 自体の成否は migration 適用時 (supabase db reset) にチェックされるため、
// test 側では対象関数が回帰なく動作することを確認し「search_path 固定でロジックが壊れていない」
// ことを担保する。search_path の値を直接検証するには pg_catalog 読み取り用の RPC が必要で、
// 新規マイグレーションを要するため本 PBI のスコープ外とする。

describe("migration 00024: search_path hardening", () => {
  it("search_path ハードニング後も create_card_with_order / increment_total_cards が呼び出し可能", async () => {
    const db = getAdminClient();

    const userEmail = `migration-00024-${Date.now()}@kairous.local`;
    const userResult = await db.auth.admin.createUser({
      email: userEmail,
      password: "test-password-12345",
      email_confirm: true,
    });
    expect(userResult.error).toBeNull();
    const userId = userResult.data.user!.id;

    try {
      const catInsert = await db
        .from("categories")
        .insert({ user_id: userId, name: "migration-00024" })
        .select("id")
        .single();
      expect(catInsert.error).toBeNull();
      const catId = (catInsert.data as { id: string }).id;

      const matInsert = await db
        .from("materials")
        .insert({ user_id: userId, category_id: catId, title: "migration-00024-material" })
        .select("id")
        .single();
      expect(matInsert.error).toBeNull();
      const matId = (matInsert.data as { id: string }).id;

      // create_card_with_order: search_path 固定後も UUID を返すこと
      const cardResult = await db.rpc("create_card_with_order", {
        p_material_id: matId,
        p_front: "migration-00024-front",
        p_back: "migration-00024-back",
      });
      expect(cardResult.error).toBeNull();
      expect(typeof cardResult.data).toBe("string");

      // increment_total_cards: search_path 固定後もエラーなく完了すること。
      // 実際の total_cards 値は 00022 の sync_total_cards trigger で総体的に
      // 上書きされるため値検証は別テスト (tests/medium/migrations/00022_*.test.ts) に任せる。
      const incResult = await db.rpc("increment_total_cards", {
        p_material_id: matId,
        p_delta: 1,
        p_user_id: userId,
      });
      expect(incResult.error).toBeNull();

      // remove_material_method: search_path 固定後も所有者チェックが機能すること。
      // 存在しない method_id を渡し、"method ... not found for material" エラーが出ることで
      // 関数本体が到達していることを確認する (RAISE EXCEPTION 経由の所有者チェックは機能している)。
      const removeResult = await db.rpc("remove_material_method", {
        p_material_id: matId,
        p_method_id: "00000000-0000-0000-0000-000000000000",
        p_user_id: userId,
      });
      expect(removeResult.error).not.toBeNull();
      // 所有者チェックは通過し、次の「手法残数チェック」または「method not found」まで
      // 到達しているはず (materials は空の material_methods 状態)
      expect(removeResult.error?.message).toMatch(/at least one method required|not found/i);
    } finally {
      await db.from("materials").delete().eq("user_id", userId);
      await db.from("categories").delete().eq("user_id", userId);
      await db.auth.admin.deleteUser(userId);
    }
  });
});
