import { describe, it, expect, beforeAll, afterAll, afterEach } from "vitest";
import { getAdminClient, createTestUser, deleteTestUser, createUserClient } from "../../setup";
import { cleanupNotificationSchedules } from "../../helpers/db";
import type { Database } from "../../../../src/lib/types/database";

type NotificationScheduleRow = Database["public"]["Tables"]["notification_schedules"]["Row"];

const TEST_EMAIL = `notif-test-${Date.now()}@kairous.local`;
const OTHER_EMAIL = `notif-other-${Date.now()}@kairous.local`;
const TEST_PASSWORD = "test-password-12345";

let userId: string;
let otherUserId: string;

beforeAll(async () => {
  userId = await createTestUser(TEST_EMAIL, TEST_PASSWORD);
  otherUserId = await createTestUser(OTHER_EMAIL, TEST_PASSWORD);
});

afterEach(async () => {
  await cleanupNotificationSchedules(userId);
  await cleanupNotificationSchedules(otherUserId);
  // テスト間の状態リセット
  await getAdminClient()
    .from("profiles")
    .update({ notification_enabled: false })
    .eq("id", userId);
  await getAdminClient()
    .from("profiles")
    .update({ notification_enabled: false })
    .eq("id", otherUserId);
});

afterAll(async () => {
  await deleteTestUser(userId);
  await deleteTestUser(otherUserId);
});

describe("notification_schedules CRUD", () => {
  it("creates a schedule for user", async () => {
    const { data, error } = await getAdminClient()
      .from("notification_schedules")
      .insert({
        user_id: userId,
        label: "朝の通知",
        time: "08:00",
        message_type: "due_today",
      })
      .select()
      .single<NotificationScheduleRow>();

    expect(error).toBeNull();
    expect(data?.label).toBe("朝の通知");
    expect(data?.enabled).toBe(true);
  });

  it("rejects invalid message_type via CHECK constraint", async () => {
    const { error } = await getAdminClient()
      .from("notification_schedules")
      .insert({
        user_id: userId,
        label: "テスト",
        time: "08:00",
        message_type: "invalid_type",
      });

    expect(error).not.toBeNull();
  });
});

describe("notification_schedules RLS", () => {
  it("user cannot read other user schedules", async () => {
    // 管理者権限で他ユーザーのスケジュールを作成
    await getAdminClient().from("notification_schedules").insert({
      user_id: otherUserId,
      label: "他ユーザーの通知",
      time: "09:00",
      message_type: "due_today",
    });

    // userId のクライアントからは他ユーザーのデータが見えないことを確認
    const userClient = await createUserClient(TEST_EMAIL, TEST_PASSWORD);
    const { data } = await userClient
      .from("notification_schedules")
      .select("*");

    expect(data).toHaveLength(0);
  });
});

describe("notification_schedules max count", () => {
  it("inserts MAX_NOTIFICATION_SCHEDULES (10) schedules successfully", async () => {
    const inserts = Array.from({ length: 10 }, (_, i) => ({
      user_id: userId,
      label: `通知 ${i}`,
      time: `${String(i).padStart(2, "0")}:00`,
      message_type: "due_today",
    }));
    const { error } = await getAdminClient()
      .from("notification_schedules")
      .insert(inserts);

    expect(error).toBeNull();

    // DB レベルでは上限制約がないため、件数の正確性のみ検証する。
    // 上限チェックはアプリケーション層 (Server Action) で実施される
    const { count } = await getAdminClient()
      .from("notification_schedules")
      .select("*", { count: "exact", head: true })
      .eq("user_id", userId);

    expect(count).toBe(10);
  });
});

describe("profiles.notification_enabled RLS", () => {
  it("user cannot update other user notification_enabled", async () => {
    const userClient = await createUserClient(TEST_EMAIL, TEST_PASSWORD);

    // RLS の WITH CHECK により他ユーザーの更新はブロックされる
    await userClient
      .from("profiles")
      .update({ notification_enabled: true })
      .eq("id", otherUserId);

    // 他ユーザーの値が false のままであることを確認
    const { data: otherProfile } = await getAdminClient()
      .from("profiles")
      .select("notification_enabled")
      .eq("id", otherUserId)
      .single();

    expect(otherProfile?.notification_enabled).toBe(false);
  });
});

describe("get_due_counts_by_subject RPC", () => {
  it("returns due counts grouped by subject, including unstudied cards", async () => {
    const admin = getAdminClient();

    // 2科目・2教材・各2カード。A は SRS state あり (future due で除外されるはず)、
    // B は SRS state なし (未学習 = due 扱い)
    const subARes = await admin
      .from("categories")
      .insert({ user_id: userId, name: "数学", color: "#1976d2" })
      .select("id")
      .single<{ id: string }>();
    const subAId = subARes.data!.id;
    const subBRes = await admin
      .from("categories")
      .insert({ user_id: userId, name: "英語", color: "#388e3c" })
      .select("id")
      .single<{ id: string }>();
    const subBId = subBRes.data!.id;

    const matARes = await admin
      .from("materials")
      .insert({ user_id: userId, category_id: subAId, title: "math-material" })
      .select("id")
      .single<{ id: string }>();
    const matAId = matARes.data!.id;
    const matBRes = await admin
      .from("materials")
      .insert({ user_id: userId, category_id: subBId, title: "english-material" })
      .select("id")
      .single<{ id: string }>();
    const matBId = matBRes.data!.id;

    const cardsARes = await admin
      .from("cards")
      .insert([
        { material_id: matAId, front: "Q1", back: "A1", display_order: 0 },
        { material_id: matAId, front: "Q2", back: "A2", display_order: 1 },
      ])
      .select("id")
      .overrideTypes<{ id: string }[], { merge: false }>();
    const cardAIds = cardsARes.data!.map((c) => c.id);
    await admin
      .from("cards")
      .insert([
        { material_id: matBId, front: "Q3", back: "A3", display_order: 0 },
        { material_id: matBId, front: "Q4", back: "A4", display_order: 1 },
      ]);

    // math のカード 1 件だけ past-due、もう 1 件は future-due にする
    const target = "2026-04-15";
    await admin.from("srs_states").insert([
      {
        card_id: cardAIds[0],
        user_id: userId,
        stability: 1,
        difficulty: 5,
        reps: 1,
        lapses: 0,
        state: "Review",
        due_date: "2026-04-10", // past: due 扱い
        last_reviewed_at: "2026-04-09T00:00:00Z",
      },
      {
        card_id: cardAIds[1],
        user_id: userId,
        stability: 1,
        difficulty: 5,
        reps: 1,
        lapses: 0,
        state: "Review",
        due_date: "2026-04-20", // future: 除外
        last_reviewed_at: "2026-04-09T00:00:00Z",
      },
    ]);

    const rpcRes = await admin.rpc("get_due_counts_by_subject", {
      p_user_id: userId,
      p_target_date: target,
    });

    expect(rpcRes.error).toBeNull();
    // 数学: 1 件 (past-due のみ)、英語: 2 件 (未学習 2 件)
    expect(rpcRes.data).toEqual(
      expect.arrayContaining([
        { subject_name: "数学", due_count: 1 },
        { subject_name: "英語", due_count: 2 },
      ]),
    );

    // 後続テストに影響させないため削除
    await admin.from("categories").delete().eq("user_id", userId);
  });
});
