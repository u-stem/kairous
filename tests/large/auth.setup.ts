import { test as setup, expect } from "@playwright/test";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { E2E_PASSWORD, STORAGE_STATE_PATH } from "./helpers/types";
import type { TestUserData } from "./helpers/types";

setup("authenticate", async ({ page }) => {
  // global-setup で作成したテストユーザーの認証情報を読む
  const userPath = resolve(__dirname, ".auth", "test-user.json");
  let user: TestUserData;
  try {
    user = JSON.parse(readFileSync(userPath, "utf-8")) as TestUserData;
  } catch {
    throw new Error(`test-user.json が見つかりません。global-setup が成功しているか確認: ${userPath}`);
  }

  await page.goto("/auth/login");

  await page.getByLabel("メールアドレス").fill(user.email);
  await page.getByLabel("パスワード").fill(E2E_PASSWORD);
  await page.getByRole("button", { name: "ログイン" }).click();

  // ホームページにリダイレクトされることを確認
  await expect(page).toHaveURL("/");

  // storageState を保存
  await page.context().storageState({ path: STORAGE_STATE_PATH });
});
