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
