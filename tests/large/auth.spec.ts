import { test, expect } from "@playwright/test";
import { getAdminClient } from "./helpers/db";
import { E2E_PASSWORD, getAuthTestUser } from "./helpers/types";
import type { TestUserData } from "./helpers/types";

// 認証テストは未ログイン状態で実行する
test.use({ storageState: { cookies: [], origins: [] } });

test.describe("サインアップ", () => {
  // リトライ時もファイル再読み込みで新しい UUID が生成され、前回分の afterAll 漏れを防ぐ
  const signupEmail = `e2e-signup-${crypto.randomUUID()}@kairous.local`;
  const signupPassword = "signup-test-password-123";

  test.afterAll(async () => {
    // サインアップで作成したテストユーザーを削除する
    const { data } = await getAdminClient().auth.admin.listUsers();
    const user = data.users.find((u) => u.email === signupEmail);
    if (user) {
      await getAdminClient().auth.admin.deleteUser(user.id);
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

    // エラーメッセージの可視性は data-testid で特定する (CSS クラス変更耐性)
    await expect(page.getByTestId("auth-error")).toBeVisible();
  });

  test("ログインページへのリンクが機能する", async ({ page }) => {
    await page.goto("/auth/signup");

    await page.getByRole("link", { name: "ログイン" }).click();

    await expect(page).toHaveURL("/auth/login");
  });
});

test.describe("ログイン", () => {
  let testUser: TestUserData;

  test.beforeAll(() => {
    // chromium 共有ユーザーを避け、auth-tests 専用ユーザーを使う (#242)。
    // ログアウト等が shared storageState のセッションを破壊しないようにするため
    testUser = getAuthTestUser();
  });

  test("既存ユーザーがログインしてホームに遷移する", async ({ page }) => {
    await page.goto("/auth/login");

    await page.locator("#email").fill(testUser.email);
    await page.locator("#password").fill(E2E_PASSWORD);
    await page.getByRole("button", { name: "ログイン" }).click();

    await expect(page).toHaveURL("/", { timeout: 10_000 });
    await expect(page.getByText("今日の学習")).toBeVisible();
  });

  test("間違ったパスワードでエラーが表示される", async ({ page }) => {
    await page.goto("/auth/login");

    await page.locator("#email").fill(testUser.email);
    await page.locator("#password").fill("wrong-password-99999");
    await page.getByRole("button", { name: "ログイン" }).click();

    await expect(page.getByTestId("auth-error")).toBeVisible();
  });

  test("サインアップページへのリンクが機能する", async ({ page }) => {
    await page.goto("/auth/login");

    await page.getByRole("link", { name: "サインアップ" }).click();

    await expect(page).toHaveURL("/auth/signup");
  });
});

test.describe("ログアウト", () => {
  let testUser: TestUserData;

  test.beforeAll(() => {
    // chromium 共有ユーザーを避け、auth-tests 専用ユーザーを使う (#242)。
    // ログアウト等が shared storageState のセッションを破壊しないようにするため
    testUser = getAuthTestUser();
  });

  test("ログイン後にログアウトするとログインページに遷移する", async ({
    page,
  }) => {
    // まずログインする
    await page.goto("/auth/login");
    await page.locator("#email").fill(testUser.email);
    await page.locator("#password").fill(E2E_PASSWORD);
    await page.getByRole("button", { name: "ログイン" }).click();
    await expect(page).toHaveURL("/", { timeout: 10_000 });

    // プロフィールページへ遷移してログアウトする
    await page.goto("/profile");
    await page.getByRole("button", { name: "ログアウト" }).click();

    // ログインページへリダイレクトされることを確認
    await expect(page).toHaveURL("/auth/login", { timeout: 10_000 });
  });
});
