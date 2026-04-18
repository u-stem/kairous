import { describe, it, expect, beforeAll, afterAll, afterEach } from "vitest";
import { getAdminClient, createTestUser, deleteTestUser } from "../../setup";
import {
  cleanupTestData,
  createTestSubject,
  createTestMaterial,
} from "../../helpers/db";

// Server Action ("use server") は Medium テストから直接呼べないため
// (requireAuth が Auth セッションを要求する)、project 教材の DB 層契約
// (user_id フィルタ + meta.milestones / completed_units 更新) を
// admin client で直接検証する。UI レベルの統合は Large (E2E) で行う。

const TEST_EMAIL = `project-test-${Date.now()}@kairous.local`;
const OTHER_EMAIL = `project-other-${Date.now()}@kairous.local`;
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

async function setupProjectMaterial(ownerId: string) {
  const category = await createTestSubject(ownerId, "テストプロジェクトカテゴリ");
  const material = await createTestMaterial(category.id, ownerId, "project 教材");
  const { error } = await getAdminClient()
    .from("materials")
    .update({
      type: "project",
      meta: { milestones: [] },
      unit_label: "マイルストーン",
    })
    .eq("id", material.id);
  expect(error).toBeNull();
  return material;
}

describe("project milestones update (DB contract)", () => {
  it("自分の project 教材の meta.milestones と completed_units を更新できる", async () => {
    const material = await setupProjectMaterial(userId);

    const milestones = [
      { name: "設計完了", done: true, date: "2026-04-10" },
      { name: "実装完了", done: false },
    ];
    const completedCount = milestones.filter((m) => m.done).length;

    const { error } = await getAdminClient()
      .from("materials")
      .update({
        meta: { milestones },
        completed_units: completedCount,
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
      milestones?: Array<{ name: string; done: boolean }>;
    };
    expect(meta?.milestones?.length).toBe(2);
    expect(meta?.milestones?.[0]?.name).toBe("設計完了");
    expect(data?.completed_units).toBe(1);
  });

  it("user_id フィルタで他ユーザーの project 教材は更新されない", async () => {
    const otherMaterial = await setupProjectMaterial(otherUserId);

    const { error } = await getAdminClient()
      .from("materials")
      .update({
        meta: { milestones: [{ name: "不正", done: true }] },
        completed_units: 1,
      })
      .eq("id", otherMaterial.id)
      .eq("user_id", userId);
    expect(error).toBeNull();

    const { data } = await getAdminClient()
      .from("materials")
      .select("meta, completed_units")
      .eq("id", otherMaterial.id)
      .single();

    const meta = data?.meta as { milestones?: unknown[] };
    expect(meta?.milestones?.length ?? 0).toBe(0);
    expect(data?.completed_units).toBe(0);
  });
});
