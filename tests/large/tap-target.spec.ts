import { test, expect } from "@playwright/test";

test("buttons have 44x44 minimum tap target", async ({ page }) => {
  await page.goto("/materials");
  await page.waitForLoadState("networkidle");

  const newButton = page.getByRole("link", { name: "新規作成" });
  const boundingBox = await newButton.boundingBox();
  expect(boundingBox!.width).toBeGreaterThanOrEqual(44);
  expect(boundingBox!.height).toBeGreaterThanOrEqual(44);
});
