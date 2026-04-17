import { describe, it, expect, beforeAll, afterAll, afterEach } from "vitest";
import { getAdminClient, createTestUser, deleteTestUser } from "../../setup";
import {
  cleanupTestData,
  createTestSubject,
  createTestMaterial,
} from "../../helpers/db";

// Server Action ("use server") は Medium テストから直接呼べないため、
// practice_log 教材の DB 層契約 (user_id フィルタ + meta.entries/completed_units 更新) を
// admin client で直接検証する。UI レベルの統合は Large (E2E) で行う。

const TEST_EMAIL = `practice-log-test-${Date.now()}@kairous.local`;
const OTHER_EMAIL = `practice-log-other-${Date.now()}@kairous.local`;
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

async function setupPracticeLogMaterial(ownerId: string) {
  const category = await createTestSubject(ownerId, "テスト練習カテゴリ");
  const material = await createTestMaterial(category.id, ownerId, "練習ログ教材");
  const { error } = await getAdminClient()
    .from("materials")
    .update({
      type: "practice_log",
      meta: { entry_schema: "reps", entries: [] },
      unit_label: "回",
    })
    .eq("id", material.id);
  expect(error).toBeNull();
  return material;
}

describe("practice_log entries update (DB contract)", () => {
  it("自分の practice_log 教材の meta.entries と completed_units を更新できる", async () => {
    const material = await setupPracticeLogMaterial(userId);

    const entries = [
      { date: "2026-04-18", value: 30, note: "朝練" },
      { date: "2026-04-19", value: 45 },
    ];

    const { error } = await getAdminClient()
      .from("materials")
      .update({
        meta: { entry_schema: "reps", entries },
        completed_units: entries.length,
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
      entries?: Array<{ date: string; value: number; note?: string }>;
    };
    expect(meta?.entries?.length).toBe(2);
    expect(meta?.entries?.[0]?.value).toBe(30);
    expect(data?.completed_units).toBe(2);
  });

  it("user_id フィルタで他ユーザーの practice_log 教材は更新されない", async () => {
    const otherMaterial = await setupPracticeLogMaterial(otherUserId);

    // userId で UPDATE しても other の教材には影響しない
    const { error } = await getAdminClient()
      .from("materials")
      .update({
        meta: {
          entry_schema: "reps",
          entries: [{ date: "2026-04-18", value: 999 }],
        },
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

    const meta = data?.meta as { entries?: unknown[] };
    expect(meta?.entries?.length ?? 0).toBe(0);
    expect(data?.completed_units).toBe(0);
  });

  it("エントリ削除で meta.entries と completed_units が同期更新される", async () => {
    const material = await setupPracticeLogMaterial(userId);
    const initial = [
      { date: "2026-04-18", value: 30 },
      { date: "2026-04-19", value: 45 },
      { date: "2026-04-20", value: 60 },
    ];

    const { error: insertError } = await getAdminClient()
      .from("materials")
      .update({
        meta: { entry_schema: "reps", entries: initial },
        completed_units: initial.length,
      })
      .eq("id", material.id);
    expect(insertError).toBeNull();

    // インデックス 1 を削除
    const nextEntries = initial.filter((_, i) => i !== 1);
    const { error: deleteError } = await getAdminClient()
      .from("materials")
      .update({
        meta: { entry_schema: "reps", entries: nextEntries },
        completed_units: nextEntries.length,
      })
      .eq("id", material.id)
      .eq("user_id", userId);
    expect(deleteError).toBeNull();

    const { data } = await getAdminClient()
      .from("materials")
      .select("meta, completed_units")
      .eq("id", material.id)
      .single();

    const meta = data?.meta as {
      entries?: Array<{ date: string; value: number }>;
    };
    expect(meta?.entries?.length).toBe(2);
    expect(meta?.entries?.[0]?.value).toBe(30);
    expect(meta?.entries?.[1]?.value).toBe(60);
    expect(data?.completed_units).toBe(2);
  });
});
