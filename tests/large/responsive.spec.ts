import { test, expect, devices, type Page } from "@playwright/test";
import {
  createTestSubject,
  createTestMaterial,
  getMethodIdBySlug,
  linkMaterialMethod,
  cleanupTestData,
} from "./helpers/db";
import { getTestUser } from "./helpers/types";

// 375x667 (iPhone SE) で主要画面に横スクロールが発生しないことを保証する。
// grid-cols-3/4 + 長い日本語値 (例: "約2ヶ月前", "1時間20分") を text-2xl のまま
// SP に配信すると横あふれするため、回帰検出として常設する。
async function assertNoHorizontalScroll(page: Page) {
  const { scrollWidth, clientWidth } = await page.evaluate(() => ({
    scrollWidth: document.documentElement.scrollWidth,
    clientWidth: document.documentElement.clientWidth,
  }));
  // サブピクセル丸め誤差を 1px まで許容する
  expect(scrollWidth).toBeLessThanOrEqual(clientWidth + 1);
}

test.describe.serial("レスポンシブ: iPhone SE (375x667) で横スクロールなし", () => {
  test.use({ ...devices["iPhone SE"] });

  let userId: string;
  let materialId: string;

  test.beforeAll(async () => {
    userId = getTestUser().id;
    const subject = await createTestSubject(userId, `E2E-Responsive-${Date.now()}`);
    const material = await createTestMaterial(
      subject.id,
      userId,
      "レスポンシブ検証用教材",
    );
    materialId = material.id;
    const pomodoroMethodId = await getMethodIdBySlug("pomodoro");
    await linkMaterialMethod(material.id, pomodoroMethodId);
  });

  test.afterAll(async () => {
    await cleanupTestData(userId);
  });

  test("Today 画面で横スクロールが発生しない", async ({ page }) => {
    await page.goto("/");
    await page.waitForLoadState("networkidle");
    await assertNoHorizontalScroll(page);
  });

  test("Materials 一覧で横スクロールが発生しない", async ({ page }) => {
    await page.goto("/materials");
    await page.waitForLoadState("networkidle");
    await assertNoHorizontalScroll(page);
  });

  test("Materials 詳細 (grid-cols-3 stats) で横スクロールが発生しない", async ({
    page,
  }) => {
    await page.goto(`/materials/${materialId}`);
    await page.waitForLoadState("networkidle");
    await assertNoHorizontalScroll(page);
  });

  test("Stats 画面で横スクロールが発生しない", async ({ page }) => {
    await page.goto("/stats");
    await page.waitForLoadState("networkidle");
    await assertNoHorizontalScroll(page);
  });

  test("Profile 画面で横スクロールが発生しない", async ({ page }) => {
    await page.goto("/profile");
    await page.waitForLoadState("networkidle");
    await assertNoHorizontalScroll(page);
  });
});

test.describe("レスポンシブ: Desktop (1280x800) でコンテナが max-w を超えない", () => {
  test.use({ viewport: { width: 1280, height: 800 } });

  test("Today 画面の中央寄せコンテナが max-w-2xl (672px) 以内", async ({ page }) => {
    await page.goto("/");
    await page.waitForLoadState("networkidle");
    const h1 = page.getByRole("heading", { name: "今日の学習" });
    await expect(h1).toBeVisible();
    const width = await h1.evaluate((el) => {
      const container = el.closest("div[class*='max-w']");
      return container?.getBoundingClientRect().width ?? 0;
    });
    expect(width).toBeGreaterThan(0);
    expect(width).toBeLessThanOrEqual(672);
  });
});
