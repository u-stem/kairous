import { test, expect } from "@playwright/test";

test("authenticated user sees today page", async ({ page }) => {
  await page.goto("/");

  // ホームページのタイトルが表示される
  await expect(page.getByText("今日の学習")).toBeVisible();
});
