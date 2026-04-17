import { test, expect } from "@playwright/test";
import {
  createTestSubject,
  cleanupTestData,
} from "./helpers/db";
import { getTestUser } from "./helpers/types";

test.describe.serial("reading 教材タイプ", () => {
  let userId: string;
  let subjectName: string;

  test.beforeAll(async () => {
    const user = getTestUser();
    userId = user.id;
    subjectName = `E2E-Reading-${Date.now()}`;
    await createTestSubject(userId, subjectName);
  });

  test.afterAll(async () => {
    await cleanupTestData(userId);
  });

  test("reading 教材を作成して詳細ページで読書進捗を更新する", async ({ page }) => {
    await page.goto("/materials/new");

    // Step 0: reading タイプを選択
    await page.getByRole("button", { name: "読書" }).click();
    await page.getByRole("button", { name: "次へ" }).click();

    // Step 1: 基本情報 + reading 固有フィールド
    await page.locator("#material-title").fill("E2E-ReadingBook");
    await page.getByRole("combobox").click();
    await page.getByRole("option", { name: subjectName }).click();

    // reading 固有フィールドが表示されることを確認
    await expect(page.getByTestId("reading-total-pages-input")).toBeVisible();
    await expect(page.getByTestId("reading-unit-label-input")).toBeVisible();

    await page.getByTestId("reading-total-pages-input").fill("300");
    // unit_label はデフォルト「ページ」のまま

    await page.getByRole("button", { name: "次へ" }).click(); // Step1 → Step1.5
    await page.getByRole("button", { name: "次へ" }).click(); // Step1.5 → Step2

    // Step 2: 手法は reading 対応の pomodoro / free_study / wakeful_rest のみ絞り込まれる
    await page.getByText("ポモドーロ").click();
    await page.getByRole("button", { name: "作成", exact: true }).click();

    await expect(page).toHaveURL(/\/materials\/[0-9a-f-]{36}$/, { timeout: 10_000 });
    await expect(page.getByTestId("material-title")).toHaveText("E2E-ReadingBook");

    // reading セクションが表示される
    await expect(page.getByTestId("reading-section")).toBeVisible();
    await expect(page.getByTestId("reading-progress-label")).toContainText("0 / 300");
    await expect(page.getByTestId("reading-progress-percent")).toContainText("0%");

    // 進捗を 100 ページに更新
    await page.getByTestId("reading-pages-input").fill("100");
    await page.getByTestId("reading-update-button").click();

    // 進捗表示が反映される (revalidatePath で再フェッチ)
    await expect(page.getByTestId("reading-progress-label")).toContainText("100 / 300", {
      timeout: 5_000,
    });
    await expect(page.getByTestId("reading-progress-percent")).toContainText("33%");
  });

  test("total_pages を超える入力はエラー表示される", async ({ page }) => {
    await page.goto("/materials");
    await page.waitForLoadState("networkidle");
    await page.getByRole("link", { name: "E2E-ReadingBook" }).click();
    await page.waitForURL(/\/materials\/[0-9a-f-]{36}$/, { timeout: 10_000 });
    await page.waitForLoadState("networkidle");

    await page.getByTestId("reading-pages-input").fill("500");
    await page.getByTestId("reading-update-button").click();

    await expect(page.getByTestId("reading-error")).toContainText("300");
  });
});
