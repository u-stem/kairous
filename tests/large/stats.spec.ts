import { test, expect } from "@playwright/test";
import {
  adminClient,
  createTestSubject,
  createTestMaterial,
  getMethodIdBySlug,
  linkMaterialMethod,
  cleanupTestData,
} from "./helpers/db";
import { getTestUser } from "./helpers/types";

test.describe("Stats ページ", () => {
  let userId: string;

  test.beforeAll(async () => {
    const user = getTestUser();
    userId = user.id;

    // Stats に表示するデータを作成: subject → material → method link → daily_log
    // sessions テーブルは Stats ページのデータソースではないため省略
    const subject = await createTestSubject(userId, `E2E-Stats-${Date.now()}`);
    const material = await createTestMaterial(subject.id, userId, "Stats テスト教材");
    const srsMethodId = await getMethodIdBySlug("srs");
    await linkMaterialMethod(material.id, srsMethodId);

    // daily_log を作成 (Stats ページのデータソース)
    // テスト固有の subject を使うため UNIQUE 制約に衝突しない
    const today = new Date().toISOString().split("T")[0];
    const { error: logErr } = await adminClient
      .from("daily_logs")
      .insert({
        user_id: userId,
        subject_id: subject.id,
        method_id: srsMethodId,
        log_date: today,
        total_sec: 300,
        cards_reviewed: 5,
        session_count: 1,
      });
    if (logErr) throw new Error(`daily_log insert failed: ${logErr.message}`);
  });

  test.afterAll(async () => {
    await cleanupTestData(userId);
  });

  test("サマリーカードとチャートが表示される", async ({ page }) => {
    await page.goto("/stats");

    // サマリーカード (exact: true で h3「日別学習時間」との部分一致を防ぐ)
    await expect(page.getByText("学習時間", { exact: true })).toBeVisible();
    await expect(page.getByText("セッション", { exact: true })).toBeVisible();
    await expect(page.getByText("レビュー", { exact: true })).toBeVisible();

    // チャートセクション
    await expect(page.getByText("日別学習時間")).toBeVisible();
    await expect(page.getByText("分野別")).toBeVisible();
    await expect(page.getByText("手法別")).toBeVisible();

    // 投入したテストデータの分野名が凡例に表示される
    await expect(page.getByText(/E2E-Stats-/)).toBeVisible();
  });

  test("期間切り替えが機能する", async ({ page }) => {
    await page.goto("/stats");

    // デフォルトは 7日
    await expect(page.getByRole("button", { name: "7日" })).toBeVisible();

    // 30日に切り替え
    await page.getByRole("button", { name: "30日" }).click();
    await page.waitForURL(/period=30/);
    await expect(page.getByText("学習時間", { exact: true })).toBeVisible();

    // 90日に切り替え
    await page.getByRole("button", { name: "90日" }).click();
    await page.waitForURL(/period=90/);
    await expect(page.getByText("学習時間", { exact: true })).toBeVisible();
  });
});
