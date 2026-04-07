import { test, expect } from "@playwright/test";
import { adminClient } from "./helpers/db";

// 認証テストは未ログイン状態で実行する
test.use({ storageState: { cookies: [], origins: [] } });

test.describe("サインアップ", () => {
  // テスト全体で共有するサインアップ用メールアドレス
  const signupEmail = `e2e-signup-${Date.now()}@kairous.local`;
  const signupPassword = "signup-test-password-123";

  test.afterAll(async () => {
    // サインアップで作成したテストユーザーを削除する
    const { data } = await adminClient.auth.admin.listUsers();
    const user = data.users.find((u) => u.email === signupEmail);
    if (user) {
      await adminClient.auth.admin.deleteUser(user.id);
    }
  });

  test("新規ユーザーがサインアップしてホームに遷移する", async ({ page }) => {
    await page.goto("/auth/signup");

    await page.locator("#displayName").fill("E2E テストユーザー");
    await page.locator("#email").fill(signupEmail);
    await page.locator("#password").fill(signupPassword);
    await page.getByRole("button", { name: "サインアップ" }).click();

    // サーバーアクションのリダイレクト後、ページが完全に読み込まれるまで待つ
    await expect(page).toHaveURL("/", { timeout: 10_000 });
    await page.waitForLoadState("networkidle");
    await expect(page.getByText("今日の学習")).toBeVisible();
  });

  test("バリデーションエラーが表示される", async ({ page }) => {
    await page.goto("/auth/signup");

    await page.locator("#displayName").fill("テスト");
    await page.locator("#email").fill("valid@example.com");
    // Zod の min(8) に引っかかる 7 文字のパスワードを直接セット。
    // ブラウザ側の minLength 属性を回避するため JS で値を注入してから送信する
    await page.locator("#password").evaluate((el) => {
      (el as HTMLInputElement).removeAttribute("minLength");
    });
    await page.locator("#password").fill("7chars!");
    await page.getByRole("button", { name: "サインアップ" }).click();

    // エラーメッセージが表示されることを確認 (text-sm text-red-600)
    await expect(page.locator("p.text-red-600")).toBeVisible();
  });

  test("ログインページへのリンクが機能する", async ({ page }) => {
    await page.goto("/auth/signup");

    await page.getByRole("link", { name: "ログイン" }).click();

    await expect(page).toHaveURL("/auth/login");
  });
});
