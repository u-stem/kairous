import { test, expect } from "@playwright/test";

test("buttons meet 44x44 minimum tap target on materials page", async ({ page }) => {
  await page.goto("/materials");
  await page.waitForLoadState("networkidle");

  // デスクトップ viewport では「新規教材」テキスト付きリンクが表示される
  // (モバイル用 FAB は md:hidden)
  const newMaterialLink = page.getByRole("link", { name: "新規教材" });
  await expect(newMaterialLink).toBeVisible();

  const boundingBox = await newMaterialLink.boundingBox();
  expect(boundingBox).not.toBeNull();
  expect(boundingBox!.width).toBeGreaterThanOrEqual(44);
  expect(boundingBox!.height).toBeGreaterThanOrEqual(44);
});
