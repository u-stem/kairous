import { test, expect } from "@playwright/test";
import { getAdminClient } from "./helpers/db";
import { getTestUser } from "./helpers/types";
import type { TestUserData } from "./helpers/types";

// ヘッドレス Chromium では Notification.permission が "denied" になるため、
// テスト用に通知権限を付与する
test.use({
  permissions: ["notifications"],
});

test.describe.serial("通知設定", () => {
  let user: TestUserData;

  test.beforeAll(async () => {
    user = getTestUser();
    // notification_enabled をリセット
    await getAdminClient()
      .from("profiles")
      .update({ notification_enabled: false })
      .eq("id", user.id);
    // 既存スケジュールを削除
    await getAdminClient()
      .from("notification_schedules")
      .delete()
      .eq("user_id", user.id);
  });

  test.afterAll(async () => {
    // 元に戻す
    await getAdminClient()
      .from("profiles")
      .update({ notification_enabled: false })
      .eq("id", user.id);
    await getAdminClient()
      .from("notification_schedules")
      .delete()
      .eq("user_id", user.id);
  });

  test("プロフィールから通知設定に遷移する", async ({ page }) => {
    await page.goto("/profile");
    await page.waitForLoadState("networkidle");

    await page.getByTestId("notification-settings-link").click();
    await page.waitForURL("/profile/notifications");

    await expect(page.getByText("通知設定")).toBeVisible();
  });

  test("マスタートグルを ON にするとデフォルトスケジュールが作成される", async ({
    page,
  }) => {
    await page.goto("/profile/notifications");
    await page.waitForLoadState("networkidle");

    // マスタートグルを ON にする
    await page.getByTestId("notification-master-toggle").click();

    // ページがリロードされスケジュール一覧が表示される
    await expect(page.getByTestId("schedule-list")).toBeVisible({ timeout: 10000 });
    await expect(page.getByText("朝の通知")).toBeVisible();
    await expect(page.getByText("夜の通知")).toBeVisible();
  });

  test("通知スケジュールを追加する", async ({ page }) => {
    await page.goto("/profile/notifications");
    await page.waitForLoadState("networkidle");

    // フォームに入力
    await page.getByTestId("schedule-label-input").fill("昼の通知");
    await page.getByTestId("schedule-time-input").fill("12:00");
    await page.getByTestId("schedule-save-button").click();

    // 追加されたスケジュールが表示される
    await expect(page.getByText("昼の通知")).toBeVisible({ timeout: 10000 });
  });

  test("通知スケジュールを削除する", async ({ page }) => {
    await page.goto("/profile/notifications");
    await page.waitForLoadState("networkidle");

    // 削除ボタンの数を取得
    const deleteButtons = page.locator("[data-testid^='schedule-delete-']");
    const countBefore = await deleteButtons.count();
    expect(countBefore).toBeGreaterThan(0);

    // 最初のスケジュールの削除ボタンをクリック
    await deleteButtons.first().click();

    // 1件減ったことを確認
    await expect(deleteButtons).toHaveCount(countBefore - 1, { timeout: 10000 });
  });

  test("設定に戻るリンクが動作する", async ({ page }) => {
    await page.goto("/profile/notifications");
    await page.waitForLoadState("networkidle");

    await page.getByTestId("back-to-profile").click();
    await page.waitForURL("/profile");
  });
});
