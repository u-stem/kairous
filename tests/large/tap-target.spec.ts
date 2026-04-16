import { test, expect } from "@playwright/test";
import { createTestSubject, cleanupTestData } from "./helpers/db";
import { getTestUser } from "./helpers/types";

test.describe.serial("タップターゲット (WCAG 2.5.5)", () => {
  let userId: string;

  test.beforeAll(async () => {
    userId = getTestUser().id;
    await createTestSubject(userId, `TapTarget-${Date.now()}`);
  });

  test.afterAll(async () => {
    await cleanupTestData(userId);
  });

  test("icon variant ボタンのタップ領域が 44×44px 以上ある", async ({ page }) => {
    // CategorySelector の「カテゴリを追加」ボタンは size="icon" の代表例
    await page.goto("/materials/new");
    await page.waitForLoadState("networkidle");

    // Step 0: flashcard を選択（デフォルトのまま次へ）して Step1 へ進む
    await page.getByRole("button", { name: "次へ" }).click(); // Step0 → Step1

    const addCategoryButton = page.getByRole("button", { name: "カテゴリを追加" });
    await expect(addCategoryButton).toBeVisible();

    // ::after 疑似要素によるタップ領域を含む実効範囲を測定する
    // 視覚ボックス size-8 (32px) + ::after の -inset-1.5 (6px) × 2 = 44px
    const tapArea = await addCategoryButton.evaluate((el) => {
      const rect = el.getBoundingClientRect();
      const after = window.getComputedStyle(el, "::after");
      // ::after の top/right/bottom/left が負の値で絶対配置される
      const insetTop = Math.abs(parseFloat(after.top) || 0);
      const insetRight = Math.abs(parseFloat(after.right) || 0);
      const insetBottom = Math.abs(parseFloat(after.bottom) || 0);
      const insetLeft = Math.abs(parseFloat(after.left) || 0);
      return {
        width: rect.width + insetLeft + insetRight,
        height: rect.height + insetTop + insetBottom,
      };
    });

    expect(tapArea.width).toBeGreaterThanOrEqual(44);
    expect(tapArea.height).toBeGreaterThanOrEqual(44);
  });
});
