import { describe, it, expect, beforeAll, afterAll, afterEach } from "vitest";
import { getAdminClient, createTestUser, deleteTestUser } from "../../setup";
import {
  cleanupTestData,
  createTestSubject,
  createTestMaterial,
} from "../../helpers/db";

// Server Action ("use server") は Medium テストから直接呼べないため、
// updatePageProgress の DB 層契約 (user_id フィルタ + completed_units 更新) を
// admin client で直接検証する。UI レベルの統合は Large (E2E) で行う。

const TEST_EMAIL = `reading-test-${Date.now()}@kairous.local`;
const OTHER_EMAIL = `reading-other-${Date.now()}@kairous.local`;
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

async function setupReadingMaterial(ownerId: string, totalPages = 300) {
  const category = await createTestSubject(ownerId, "テスト書籍カテゴリ");
  const material = await createTestMaterial(category.id, ownerId, "reading 教材");
  const { error } = await getAdminClient()
    .from("materials")
    .update({
      type: "reading",
      meta: { total_pages: totalPages },
      total_units: totalPages,
      unit_label: "ページ",
    })
    .eq("id", material.id);
  expect(error).toBeNull();
  return material;
}

describe("reading progress update (DB contract)", () => {
  it("自分の reading 教材の completed_units を更新できる", async () => {
    const material = await setupReadingMaterial(userId);

    const { error } = await getAdminClient()
      .from("materials")
      .update({ completed_units: 120 })
      .eq("id", material.id)
      .eq("user_id", userId);
    expect(error).toBeNull();

    const { data } = await getAdminClient()
      .from("materials")
      .select("completed_units")
      .eq("id", material.id)
      .single();
    expect(data?.completed_units).toBe(120);
  });

  it("user_id フィルタで他ユーザーの教材は更新されない", async () => {
    const otherMaterial = await setupReadingMaterial(otherUserId);

    // userId で UPDATE しても other の教材には影響しない
    const { error } = await getAdminClient()
      .from("materials")
      .update({ completed_units: 999 })
      .eq("id", otherMaterial.id)
      .eq("user_id", userId);
    expect(error).toBeNull();

    const { data } = await getAdminClient()
      .from("materials")
      .select("completed_units")
      .eq("id", otherMaterial.id)
      .single();
    // 他ユーザーの completed_units は変更されない (初期値のまま)
    expect(data?.completed_units).toBe(0);
  });

  it("completed_units はデフォルト 0 で、明示的に更新すると反映される", async () => {
    const material = await setupReadingMaterial(userId);

    const { data: initial } = await getAdminClient()
      .from("materials")
      .select("completed_units")
      .eq("id", material.id)
      .single();
    expect(initial?.completed_units).toBe(0);

    const { error } = await getAdminClient()
      .from("materials")
      .update({ completed_units: 50 })
      .eq("id", material.id)
      .eq("user_id", userId);
    expect(error).toBeNull();

    const { data: updated } = await getAdminClient()
      .from("materials")
      .select("completed_units")
      .eq("id", material.id)
      .single();
    expect(updated?.completed_units).toBe(50);
  });
});
