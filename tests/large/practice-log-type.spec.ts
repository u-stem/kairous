import { test, expect } from "@playwright/test";
import {
  createTestSubject,
  cleanupTestData,
} from "./helpers/db";
import { getTestUser } from "./helpers/types";

test.describe.serial("practice_log 教材タイプ", () => {
  let userId: string;
  let subjectName: string;

  test.beforeAll(async () => {
    const user = getTestUser();
    userId = user.id;
    subjectName = `E2E-PracticeLog-${Date.now()}`;
    await createTestSubject(userId, subjectName);
  });

  test.afterAll(async () => {
    await cleanupTestData(userId);
  });

  test("practice_log 教材を作成してエントリを追加・削除する", async ({ page }) => {
    await page.goto("/materials/new");

    // Step 0: practice_log タイプを選択
    await page.getByTestId("material-type-option-practice_log").click();
    await page.getByRole("button", { name: "次へ" }).click();

    // Step 1: 基本情報 + practice_log 固有フィールド
    await page.locator("#material-title").fill("E2E-PracticeLogSong");
    await page.getByRole("combobox").click();
    await page.getByRole("option", { name: subjectName }).click();

    await expect(page.getByTestId("practice-log-schema-reps")).toBeVisible();
    await expect(page.getByTestId("practice-log-unit-label-input")).toBeVisible();
    // デフォルトが reps のため再クリックは不要
    await page.getByTestId("practice-log-unit-label-input").fill("回");

    await page.getByRole("button", { name: "次へ" }).click(); // Step1 → Step1.5
    await page.getByRole("button", { name: "次へ" }).click(); // Step1.5 → Step2

    // Step 2: practice_log 対応の手法 (pomodoro / free_study) を選択
    await page.getByText("自由学習").click();
    await page.getByRole("button", { name: "作成", exact: true }).click();

    await expect(page).toHaveURL(/\/materials\/[0-9a-f-]{36}$/, { timeout: 10_000 });
    await expect(page.getByTestId("material-title")).toHaveText("E2E-PracticeLogSong");

    // practice_log セクションが表示される
    await expect(page.getByTestId("practice-log-section")).toBeVisible();

    // エントリ追加: date はデフォルト (今日)、value=10
    await page.getByTestId("practice-log-value-input").fill("10");
    await page.getByTestId("practice-log-note-input").fill("初練習");
    await page.getByTestId("practice-log-add-button").click();

    // 一覧にエントリ (index 0) が表示される
    await expect(page.getByTestId("practice-log-entry-0")).toBeVisible({
      timeout: 5_000,
    });
    await expect(page.getByTestId("practice-log-entry-0")).toContainText("10 回");
    await expect(page.getByTestId("practice-log-entry-0")).toContainText("初練習");

    // 削除
    await page.getByTestId("practice-log-delete-0").click();
    await expect(page.getByTestId("practice-log-entry-0")).toBeHidden({
      timeout: 5_000,
    });
    await expect(page.getByText("まだエントリがありません")).toBeVisible();
  });
});
