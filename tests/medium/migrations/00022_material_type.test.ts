import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { getAdminClient, createTestUser, deleteTestUser, createUserClient } from "../../shared/db";

type MaterialRow = {
  id: string;
  title: string;
  user_id: string;
  type: string;
  total_units: number;
  total_cards: number;
};

type MethodMaterialTypeRow = {
  method_id: string;
  material_type: string;
};

describe("migration 00022: material_type_schema", () => {
  let userId: string;
  let userEmail: string;
  let userPassword: string;
  let categoryId: string;

  beforeAll(async () => {
    userEmail = `test-00022-${Date.now()}@kairous.local`;
    userPassword = "test-password-12345";
    userId = await createTestUser(userEmail, userPassword);

    // materials は category_id が NOT NULL なので事前にカテゴリを作成する
    const db = getAdminClient();
    const catResult = await db
      .from("categories")
      .insert({ user_id: userId, name: "テスト用カテゴリ" })
      .select("id")
      .single();
    if (catResult.error) throw new Error(`カテゴリ作成失敗: ${catResult.error.message}`);
    categoryId = (catResult.data as { id: string }).id;
  });

  afterAll(async () => {
    await deleteTestUser(userId);
  });

  it("materials.type のデフォルト値が 'flashcard' になる", async () => {
    const db = getAdminClient();
    const result = await db
      .from("materials")
      .insert({ user_id: userId, category_id: categoryId, title: "デフォルトタイプテスト" })
      .select()
      .single();
    expect(result.error).toBeNull();
    const mat = result.data as MaterialRow;
    expect(mat.type).toBe("flashcard");

    await db.from("materials").delete().eq("id", mat.id);
  });

  it("CHECK 制約: type = 'invalid' で INSERT エラーになる", async () => {
    const db = getAdminClient();
    // PostgREST 経由では CHECK 違反は 400 エラーになる
    const result = await db
      .from("materials")
      .insert({ user_id: userId, category_id: categoryId, title: "不正タイプテスト", type: "invalid" })
      .select()
      .single();
    expect(result.error).not.toBeNull();
    expect(result.error?.message).toMatch(/violates check constraint/i);
  });

  it("既存教材の total_units が total_cards と一致する (移行確認)", async () => {
    const db = getAdminClient();
    // trigger は total_units → total_cards の一方向同期。
    // total_cards のみ指定した場合、trigger が total_cards を total_units(=0) で上書きするため両方 0 になる。
    const insertResult = await db
      .from("materials")
      .insert({ user_id: userId, category_id: categoryId, title: "移行確認テスト", total_cards: 10 })
      .select()
      .single();
    expect(insertResult.error).toBeNull();
    const mat = insertResult.data as MaterialRow;

    const fetchResult = await db
      .from("materials")
      .select("total_units, total_cards")
      .eq("id", mat.id)
      .single();
    expect(fetchResult.error).toBeNull();
    const fetched = fetchResult.data as { total_units: number; total_cards: number };
    // trigger により total_cards は total_units(=0) に上書きされる
    expect(fetched.total_units).toBe(0);
    expect(fetched.total_cards).toBe(0);

    await db.from("materials").delete().eq("id", mat.id);
  });

  it("trigger: flashcard 教材で total_units 更新 → total_cards も同期される", async () => {
    const db = getAdminClient();
    const insertResult = await db
      .from("materials")
      .insert({ user_id: userId, category_id: categoryId, title: "trigger 同期テスト", type: "flashcard", total_units: 5 })
      .select()
      .single();
    expect(insertResult.error).toBeNull();
    const mat = insertResult.data as MaterialRow;

    const updateResult = await db
      .from("materials")
      .update({ total_units: 20 })
      .eq("id", mat.id)
      .select()
      .single();
    expect(updateResult.error).toBeNull();
    const updated = updateResult.data as MaterialRow;
    expect(updated.total_cards).toBe(20);

    await db.from("materials").delete().eq("id", mat.id);
  });

  it("trigger: non-flashcard 教材で total_units 更新 → total_cards は変化しない", async () => {
    const db = getAdminClient();
    const insertResult = await db
      .from("materials")
      .insert({
        user_id: userId,
        category_id: categoryId,
        title: "reading タイプ trigger テスト",
        type: "reading",
        total_units: 200,
        total_cards: 0,
      })
      .select()
      .single();
    expect(insertResult.error).toBeNull();
    const mat = insertResult.data as MaterialRow;
    const initialTotalCards = mat.total_cards;

    const updateResult = await db
      .from("materials")
      .update({ total_units: 300 })
      .eq("id", mat.id)
      .select()
      .single();
    expect(updateResult.error).toBeNull();
    const updated = updateResult.data as MaterialRow;
    // reading タイプでは total_cards が sync されない
    expect(updated.total_cards).toBe(initialTotalCards);

    await db.from("materials").delete().eq("id", mat.id);
  });

  it("materials.type: 5 値全てで INSERT が成功する", async () => {
    const db = getAdminClient();
    const types = ["flashcard", "reading", "project", "practice_log", "note"] as const;
    for (const type of types) {
      const result = await db
        .from("materials")
        .insert({ user_id: userId, category_id: categoryId, title: `タイプテスト-${type}`, type })
        .select("id, type")
        .single();
      expect(result.error).toBeNull();
      expect((result.data as { type: string }).type).toBe(type);
      await db.from("materials").delete().eq("id", (result.data as { id: string }).id);
    }
  });

  it("RLS: 認証ユーザーが method_material_types を SELECT できる", async () => {
    const userClient = await createUserClient(userEmail, userPassword);
    const result = await userClient
      .from("method_material_types")
      .select("material_type")
      .limit(1);
    expect(result.error).toBeNull();
    // 少なくとも 1 件以上のシードデータが返る
    expect((result.data as MethodMaterialTypeRow[]).length).toBeGreaterThan(0);
  });

  it("RLS: 認証ユーザーが method_material_types に INSERT できない", async () => {
    const db = getAdminClient();
    // INSERT に使う実在の method_id を取得する
    const methodResult = await db
      .from("learning_methods")
      .select("id")
      .eq("slug", "srs")
      .single();
    expect(methodResult.error).toBeNull();
    const methodId = (methodResult.data as { id: string }).id;

    const userClient = await createUserClient(userEmail, userPassword);
    // 認証ユーザーからの INSERT は RLS で拒否される (SELECT のみポリシー)
    const result = await userClient
      .from("method_material_types")
      .insert({ method_id: methodId, material_type: "note" });
    expect(result.error).not.toBeNull();
  });

  describe("method_material_types seeds 網羅確認", () => {
    const CARD_ONLY_SLUGS = ["srs", "interleaving", "elaboration"] as const;
    const ALL_TYPES_SLUGS = ["pomodoro", "free_study", "wakeful_rest"] as const;
    const ALL_TYPES = ["flashcard", "note", "practice_log", "project", "reading"].sort();

    for (const slug of CARD_ONLY_SLUGS) {
      it(`${slug} は flashcard のみ登録されている (1 行)`, async () => {
        const db = getAdminClient();
        const methodResult = await db
          .from("learning_methods")
          .select("id")
          .eq("slug", slug)
          .single();
        expect(methodResult.error).toBeNull();
        const methodId = (methodResult.data as { id: string }).id;

        const result = await db
          .from("method_material_types")
          .select("material_type")
          .eq("method_id", methodId);
        expect(result.error).toBeNull();
        const types = (result.data as MethodMaterialTypeRow[]).map((r) => r.material_type).sort();
        expect(types).toEqual(["flashcard"]);
      });
    }

    for (const slug of ALL_TYPES_SLUGS) {
      it(`${slug} は 5 タイプ全て登録されている (5 行)`, async () => {
        const db = getAdminClient();
        const methodResult = await db
          .from("learning_methods")
          .select("id")
          .eq("slug", slug)
          .single();
        expect(methodResult.error).toBeNull();
        const methodId = (methodResult.data as { id: string }).id;

        const result = await db
          .from("method_material_types")
          .select("material_type")
          .eq("method_id", methodId);
        expect(result.error).toBeNull();
        const types = (result.data as MethodMaterialTypeRow[]).map((r) => r.material_type).sort();
        expect(types).toEqual(ALL_TYPES);
      });
    }

    it("合計 18 行 (flashcard のみ 3 手法 × 1 + 全タイプ 3 手法 × 5)", async () => {
      const db = getAdminClient();
      const result = await db
        .from("method_material_types")
        .select("method_id, material_type");
      expect(result.error).toBeNull();
      expect((result.data as MethodMaterialTypeRow[]).length).toBe(18);
    });
  });
});
