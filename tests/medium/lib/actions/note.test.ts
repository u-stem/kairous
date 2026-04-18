import { describe, it, expect, beforeAll, afterAll, afterEach } from "vitest";
import { getAdminClient, createTestUser, deleteTestUser } from "../../setup";
import {
  cleanupTestData,
  createTestSubject,
  createTestMaterial,
} from "../../helpers/db";

// Server Action ("use server") は Medium テストから直接呼べないため、
// note 教材の DB 層契約 (user_id フィルタ + meta + completed_units 更新) を
// admin client で直接検証する。UI レベルの統合は Large (E2E) で行う。

const TEST_EMAIL = `note-test-${Date.now()}@kairous.local`;
const OTHER_EMAIL = `note-other-${Date.now()}@kairous.local`;
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

async function setupNoteMaterial(ownerId: string) {
  const category = await createTestSubject(ownerId, "テストノートカテゴリ");
  const material = await createTestMaterial(category.id, ownerId, "note 教材");
  const { error } = await getAdminClient()
    .from("materials")
    .update({
      type: "note",
      meta: {},
      unit_label: "セクション",
    })
    .eq("id", material.id);
  expect(error).toBeNull();
  return material;
}

describe("note stats update (DB contract)", () => {
  it("自分の note 教材の meta と completed_units を更新できる", async () => {
    const material = await setupNoteMaterial(userId);

    const { error } = await getAdminClient()
      .from("materials")
      .update({
        meta: { section_count: 7, word_count: 3500 },
        completed_units: 7,
      })
      .eq("id", material.id)
      .eq("user_id", userId);
    expect(error).toBeNull();

    const { data } = await getAdminClient()
      .from("materials")
      .select("meta, completed_units")
      .eq("id", material.id)
      .single();

    const meta = data?.meta as {
      section_count?: number;
      word_count?: number;
    };
    expect(meta?.section_count).toBe(7);
    expect(meta?.word_count).toBe(3500);
    expect(data?.completed_units).toBe(7);
  });

  it("user_id フィルタで他ユーザーの note 教材は更新されない", async () => {
    const otherMaterial = await setupNoteMaterial(otherUserId);

    const { error } = await getAdminClient()
      .from("materials")
      .update({
        meta: { section_count: 999 },
        completed_units: 999,
      })
      .eq("id", otherMaterial.id)
      .eq("user_id", userId);
    expect(error).toBeNull();

    const { data } = await getAdminClient()
      .from("materials")
      .select("meta, completed_units")
      .eq("id", otherMaterial.id)
      .single();

    const meta = data?.meta as { section_count?: number };
    expect(meta?.section_count).toBeUndefined();
    expect(data?.completed_units).toBe(0);
  });
});
