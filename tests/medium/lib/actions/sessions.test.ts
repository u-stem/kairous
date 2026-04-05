import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { adminClient, createTestUser, deleteTestUser } from "../../setup";
import {
  createTestSubject,
  createTestMaterial,
  createTestCard,
  getSrsMethodId,
  linkMaterialMethod,
  createTestSrsState,
  createTestSession,
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

describe("createSession (DB integration)", () => {
  it("inserts session with in_progress status", async () => {
    const subject = await createTestSubject(userId, "物理-session");
    const material = await createTestMaterial(subject.id, userId, "力学-session");

    const result = await adminClient
      .from("sessions")
      .insert({
        user_id: userId,
        material_id: material.id,
        method_id: srsMethodId,
        status: "in_progress",
      })
      .select()
      .single();

    expect(result.error).toBeNull();
    const session = result.data as { status: string; material_id: string };
    expect(session.status).toBe("in_progress");
    expect(session.material_id).toBe(material.id);
  });
});

describe("getSessionCards (DB integration)", () => {
  it("returns only due cards up to SESSION_MAX_CARDS limit", async () => {
    const subject = await createTestSubject(userId, "化学-cards");
    const material = await createTestMaterial(subject.id, userId, "有機化学-cards");
    await linkMaterialMethod(material.id, srsMethodId);

    const cards = [];
    for (let i = 0; i < 25; i++) {
      cards.push(await createTestCard(material.id, `Q${i}`, `A${i}`, i));
    }

    // 5 枚は due_date を未来に設定
    for (let i = 0; i < 5; i++) {
      await createTestSrsState(cards[i].id, userId, "2027-01-01", "Review");
    }

    const today = new Date().toISOString().split("T")[0];
    const cardIds = cards.map((c) => c.id);

    const { data: notDueStates } = await adminClient
      .from("srs_states")
      .select("card_id")
      .eq("user_id", userId)
      .gt("due_date", today)
      .in("card_id", cardIds);

    const notDueIds = new Set((notDueStates ?? []).map((s: { card_id: string }) => s.card_id));
    const dueCards = cards
      .filter((c) => !notDueIds.has(c.id))
      .slice(0, 20);

    expect(dueCards.length).toBe(20);
  });
});
