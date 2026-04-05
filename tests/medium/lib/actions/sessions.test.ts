import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { adminClient, createTestUser, deleteTestUser } from "../../setup";
import {
  createTestSubject,
  createTestMaterial,
  createTestCard,
  getSrsMethodId,
  linkMaterialMethod,
  createTestSrsState,
  cleanupTestData,
} from "../../helpers/db";

// Server Action (getDueMaterials) は "use server" で直接呼べないため、
// DB レベルで due 判定ロジックの前提条件を検証する統合テスト。
// 実際の Server Action テストは Large テスト (E2E) で行う。

let userId: string;
let srsMethodId: string;

beforeAll(async () => {
  userId = await createTestUser();
  srsMethodId = await getSrsMethodId();
});

afterAll(async () => {
  await cleanupTestData(userId);
  await deleteTestUser(userId);
});

describe("due card counting (DB integration)", () => {
  it("cards without srs_state are counted as due", async () => {
    const subject = await createTestSubject(userId, "数学-due");
    const material = await createTestMaterial(subject.id, userId, "微分積分-due");
    await linkMaterialMethod(material.id, srsMethodId);
    await createTestCard(material.id, "Q1", "A1");

    const today = new Date().toISOString().split("T")[0];
    const { data: allCards } = await adminClient
      .from("cards")
      .select("id")
      .eq("material_id", material.id);

    const cardIds = allCards!.map((c: { id: string }) => c.id);
    const { data: notDueStates } = await adminClient
      .from("srs_states")
      .select("card_id")
      .eq("user_id", userId)
      .gt("due_date", today)
      .in("card_id", cardIds);

    const notDueIds = new Set((notDueStates ?? []).map((s: { card_id: string }) => s.card_id));
    const dueCount = allCards!.filter((c) => !notDueIds.has(c.id)).length;

    expect(dueCount).toBe(1);
  });

  it("cards with future due_date are not counted as due", async () => {
    const subject = await createTestSubject(userId, "英語-future");
    const material = await createTestMaterial(subject.id, userId, "単語帳-future");
    await linkMaterialMethod(material.id, srsMethodId);
    const card = await createTestCard(material.id, "Q-future", "A-future");
    await createTestSrsState(card.id, userId, "2027-04-05", "Review");

    const today = new Date().toISOString().split("T")[0];
    const { data: allCards } = await adminClient
      .from("cards")
      .select("id")
      .eq("material_id", material.id);

    const cardIds = allCards!.map((c: { id: string }) => c.id);
    const { data: notDueStates } = await adminClient
      .from("srs_states")
      .select("card_id")
      .eq("user_id", userId)
      .gt("due_date", today)
      .in("card_id", cardIds);

    const notDueIds = new Set((notDueStates ?? []).map((s: { card_id: string }) => s.card_id));
    const dueCount = allCards!.filter((c) => !notDueIds.has(c.id)).length;

    expect(dueCount).toBe(0);
  });
});
