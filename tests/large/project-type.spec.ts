import { test, expect } from "@playwright/test";
import {
  createTestSubject,
  cleanupTestData,
} from "./helpers/db";
import { getTestUser } from "./helpers/types";

test.describe.serial("project 教材タイプ", () => {
  let userId: string;
  let subjectName: string;

  test.beforeAll(async () => {
    const user = getTestUser();
    userId = user.id;
    subjectName = `E2E-Project-${Date.now()}`;
    await createTestSubject(userId, subjectName);
  });

  test.afterAll(async () => {
    await cleanupTestData(userId);
  });

  test("project 教材を作成してマイルストーンを追加・完了・削除する", async ({ page }) => {
    await page.goto("/materials/new");
    await page.waitForLoadState("networkidle");

    // Step 0: project タイプを選択
    await page.getByTestId("material-type-option-project").click();
    await page.getByRole("button", { name: "次へ" }).click();

    // Step 1: 基本情報 + project 固有フィールド
    await page.locator("#material-title").fill("E2E-ProjectKairous");
    await page.getByRole("combobox").click();
    await page.getByRole("option", { name: subjectName }).click();

    await expect(page.getByTestId("project-deadline-input")).toBeVisible();
    await expect(page.getByTestId("project-unit-label-input")).toBeVisible();
    // unit_label はデフォルト「マイルストーン」のまま

    await page.getByRole("button", { name: "次へ" }).click(); // Step1 → Step1.5
    await page.getByRole("button", { name: "次へ" }).click(); // Step1.5 → Step2

    await page.getByText("自由学習").click();
    await page.getByRole("button", { name: "作成", exact: true }).click();

    await expect(page).toHaveURL(/\/materials\/[0-9a-f-]{36}$/, { timeout: 10_000 });
    await expect(page.getByTestId("project-section")).toBeVisible();
    await expect(page.getByText("まだマイルストーンがありません")).toBeVisible();

    // マイルストーンを追加
    await page.getByTestId("project-name-input").fill("設計完了");
    await page.getByTestId("project-add-button").click();

    await expect(page.getByTestId("project-milestone-0")).toBeVisible({ timeout: 5_000 });
    await expect(page.getByTestId("project-name-0")).toHaveText("設計完了");

    // 完了トグル → 進捗 100%
    await page.getByTestId("project-toggle-0").click();
    await expect(page.getByTestId("project-percent")).toHaveText("100%", { timeout: 5_000 });

    // 削除 → 空メッセージに戻る
    await page.getByTestId("project-delete-0").click();
    await expect(page.getByText("まだマイルストーンがありません")).toBeVisible({ timeout: 5_000 });
  });
});
