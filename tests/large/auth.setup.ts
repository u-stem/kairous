import { test as setup, expect } from "@playwright/test";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";

const authFile = "tests/large/.auth/user.json";

interface TestUserData {
  id: string;
  email: string;
  password: string;
}

setup("authenticate", async ({ page }) => {
  // global-setup で作成したテストユーザーの認証情報を読む
  const userPath = resolve(__dirname, ".auth", "test-user.json");
  const user = JSON.parse(readFileSync(userPath, "utf-8")) as TestUserData;

  await page.goto("/auth/login");

  await page.getByLabel("メールアドレス").fill(user.email);
  await page.getByLabel("パスワード").fill(user.password);
  await page.getByRole("button", { name: "ログイン" }).click();

  // ホームページにリダイレクトされることを確認
  await expect(page).toHaveURL("/");

  // storageState を保存
  await page.context().storageState({ path: authFile });
});
