import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { test, expect } from "@playwright/test";
import { createTestSubject, cleanupTestData } from "./helpers/db";
import type { TestUserData } from "./helpers/types";

function getTestUser(): TestUserData {
  const userPath = resolve(__dirname, ".auth", "test-user.json");
  return JSON.parse(readFileSync(userPath, "utf-8")) as TestUserData;
}

test.describe.serial("教材 CRUD", () => {
  let userId: string;
  let subjectName: string;

  test.beforeAll(async () => {
    const user = getTestUser();
    userId = user.id;
    // テストごとに一意な科目名を使い、他のテストデータと衝突しない
    subjectName = `E2E科目-${Date.now()}`;
    await createTestSubject(userId, subjectName);
  });

  test.afterAll(async () => {
    await cleanupTestData(userId);
  });

  test("教材を作成して詳細ページに遷移する", async ({ page }) => {
    await page.goto("/materials/new");

    // Step 1: 基本情報を入力する
    await page.locator("#material-title").fill("E2Eテスト教材");
    await page.locator("#material-description").fill("E2Eテスト用の教材です");

    // 科目セレクター (Base UI の combobox) を開いて選択する
    await page.getByRole("combobox").click();
    await page.getByRole("option", { name: subjectName }).click();

    await page.getByRole("button", { name: "次へ" }).click();

    // Step 2: 手法を選択する (ポモドーロは time-based なので "作成" ボタンが表示される)
    await page.getByText("ポモドーロ").click();
    await page.getByRole("button", { name: "作成" }).click();

    // 作成後は /materials/{uuid} にリダイレクトされる
    await expect(page).toHaveURL(/\/materials\/[0-9a-f-]{36}$/, {
      timeout: 10_000,
    });
    // サイトタイトル "Kairous" の h1 と教材タイトルの h1 が共存するため truncate クラスで絞り込む
    await expect(page.locator("h1.truncate")).toHaveText("E2Eテスト教材");
  });

  test("教材を編集して詳細ページに戻る", async ({ page }) => {
    await page.goto("/materials");

    // 一覧から教材リンクをクリックして詳細へ遷移する
    await page.getByRole("link", { name: "E2Eテスト教材" }).click();
    await page.getByRole("link", { name: "編集" }).click();

    // タイトルを変更して保存する
    await page.locator("#title").clear();
    await page.locator("#title").fill("E2Eテスト教材（編集済み）");
    await page.getByRole("button", { name: "保存" }).click();

    // 保存後は /materials/{uuid} (編集ページではない) にリダイレクトされる
    await expect(page).toHaveURL(/\/materials\/[0-9a-f-]{36}$/, {
      timeout: 10_000,
    });
    await expect(page.locator("h1.truncate")).toHaveText("E2Eテスト教材（編集済み）");
  });

  test("教材を削除して一覧ページに戻る", async ({ page }) => {
    await page.goto("/materials");

    // 編集済みの教材を選択して削除する
    await page.getByRole("link", { name: "E2Eテスト教材（編集済み）" }).click();
    // 詳細ページへの遷移を待つ
    await page.waitForURL(/\/materials\/[0-9a-f-]{36}$/, { timeout: 10_000 });
    await page.getByRole("link", { name: "編集" }).click();
    // 編集ページへの遷移を待つ
    await page.waitForURL(/\/materials\/[0-9a-f-]{36}\/edit$/, {
      timeout: 10_000,
    });

    await page.getByRole("button", { name: "削除" }).click();

    // 確認ダイアログで削除を実行する
    await page.getByRole("button", { name: "削除する" }).click();

    // 削除後は /materials にリダイレクトされる
    await expect(page).toHaveURL("/materials", { timeout: 10_000 });

    // 削除した教材が一覧に表示されていないことを確認する
    await expect(
      page.getByText("E2Eテスト教材（編集済み）")
    ).not.toBeVisible();
  });
});
