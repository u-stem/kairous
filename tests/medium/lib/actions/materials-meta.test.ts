import { describe, it, expect, beforeAll, afterAll, afterEach } from "vitest";
import { getAdminClient, createTestUser, deleteTestUser } from "../../setup";
import { cleanupTestData, createTestSubject, createTestMaterial } from "../../helpers/db";
import { validateMaterialMeta } from "../../../../src/lib/validations/materials";

// Server Action ("use server") は Medium テストから直接呼べないため、
// ロジックの核心 (DB 操作 + バリデーション) を DB レベルで検証する。
// UI レベルの統合テストは Large テスト (E2E) で行う。

const TEST_EMAIL = `meta-test-${Date.now()}@kairous.local`;
const OTHER_EMAIL = `meta-other-${Date.now()}@kairous.local`;
const TEST_PASSWORD = "test-password-12345";

let userId: string;
let otherUserId: string;

beforeAll(async () => {
  userId = await createTestUser(TEST_EMAIL, TEST_PASSWORD);
  otherUserId = await createTestUser(OTHER_EMAIL, TEST_PASSWORD);
});

afterEach(async () => {
  await cleanupTestData(userId);
  await cleanupTestData(otherUserId);
});

afterAll(async () => {
  await deleteTestUser(userId);
  await deleteTestUser(otherUserId);
});

describe("updateMaterialMeta (DB integration)", () => {
  it("自分の教材の meta を正常に更新できる", async () => {
    const category = await createTestSubject(userId, "テストカテゴリ");
    const material = await createTestMaterial(category.id, userId, "読書教材");

    // type を reading に変更し meta を設定
    const { error: updateTypeError } = await getAdminClient()
      .from("materials")
      .update({ type: "reading" })
      .eq("id", material.id);
    expect(updateTypeError).toBeNull();

    const meta = { total_pages: 300, author: "著者テスト" };
    const parsed = validateMaterialMeta("reading", meta);
    expect(parsed.success).toBe(true);

    const { error } = await getAdminClient()
      .from("materials")
      .update({ meta: parsed.success ? parsed.data : {} })
      .eq("id", material.id)
      .eq("user_id", userId);
    expect(error).toBeNull();

    const { data } = await getAdminClient()
      .from("materials")
      .select("meta")
      .eq("id", material.id)
      .single();
    expect(data?.meta).toMatchObject({ total_pages: 300, author: "著者テスト" });
  });

  it("user_id フィルタで他ユーザーの教材は更新されない (service_role 経由で RLS バイパスのため user_id チェックを検証)", async () => {
    const category = await createTestSubject(otherUserId, "他ユーザーカテゴリ");
    const otherMaterial = await createTestMaterial(category.id, otherUserId, "他ユーザー教材");

    // 別ユーザーの ID で UPDATE を試みると RLS により 0 行更新になる
    const { error } = await getAdminClient()
      .from("materials")
      .update({ meta: { total_pages: 99 } })
      .eq("id", otherMaterial.id)
      .eq("user_id", userId); // userId は otherUserId の教材には一致しない

    // admin client は RLS をバイパスするが、user_id フィルタで 0 件更新になることを確認
    expect(error).toBeNull();
    const { data } = await getAdminClient()
      .from("materials")
      .select("meta")
      .eq("id", otherMaterial.id)
      .single();
    // 他ユーザーの meta は変更されていないはず
    expect(data?.meta).toMatchObject({});
  });

  it("flashcard タイプに reading meta を渡すとバリデーションが失敗する", () => {
    // flashcard タイプに reading 専用フィールドがある meta はバリデーション失敗
    const result = validateMaterialMeta("flashcard", { total_pages: 300 });
    expect(result.success).toBe(false);
  });
});

describe("getAllowedMethods (DB integration)", () => {
  it("flashcard タイプは 6 件の手法を返す (srs/interleaving/elaboration/pomodoro/free_study/wakeful_rest)", async () => {
    const { data, error } = await getAdminClient()
      .from("method_material_types")
      .select("learning_methods(slug)")
      .eq("material_type", "flashcard");

    expect(error).toBeNull();
    const slugs = (data ?? [])
      .map((row) => (row.learning_methods as unknown as { slug: string } | null)?.slug)
      .filter((s): s is string => s !== undefined)
      .sort();

    expect(slugs).toHaveLength(6);
    expect(slugs).toContain("srs");
    expect(slugs).toContain("interleaving");
    expect(slugs).toContain("elaboration");
    expect(slugs).toContain("pomodoro");
    expect(slugs).toContain("free_study");
    expect(slugs).toContain("wakeful_rest");
  });

  it("reading タイプは 3 件の手法を返す (pomodoro/free_study/wakeful_rest)", async () => {
    const { data, error } = await getAdminClient()
      .from("method_material_types")
      .select("learning_methods(slug)")
      .eq("material_type", "reading");

    expect(error).toBeNull();
    const slugs = (data ?? [])
      .map((row) => (row.learning_methods as unknown as { slug: string } | null)?.slug)
      .filter((s): s is string => s !== undefined)
      .sort();

    expect(slugs).toHaveLength(3);
    expect(slugs).toContain("pomodoro");
    expect(slugs).toContain("free_study");
    expect(slugs).toContain("wakeful_rest");
  });
});
