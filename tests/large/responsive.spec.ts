import { readdirSync, statSync } from "node:fs";
import { join, relative } from "node:path";
import { test, expect, type Page } from "@playwright/test";
import {
  createTestSubject,
  createTestMaterial,
  getMethodIdBySlug,
  linkMaterialMethod,
  cleanupTestData,
} from "./helpers/db";
import { getTestUser } from "./helpers/types";

// 主要画面で横スクロールが発生しないことを自動検知する。
// src/app/**/page.tsx を起動時に走査して静的ルートを自動列挙するため、
// 新しい画面を追加しても手動で検証対象に追加する必要がない。
// 動的ルート (`[id]` 等) と認証不要な (auth)/auth/* は EXCLUDED_PATTERNS で
// クロールから除外し、動的ルートは後続の describe で個別テストする。

const APP_DIR = join(process.cwd(), "src/app");

function listAppRoutes(): string[] {
  const routes: string[] = [];
  function walk(dir: string) {
    for (const entry of readdirSync(dir)) {
      const full = join(dir, entry);
      if (statSync(full).isDirectory()) {
        walk(full);
      } else if (entry === "page.tsx") {
        const rel = relative(APP_DIR, full).replace(/\/page\.tsx$/, "");
        const url = "/" + rel
          // Route Group `(main)` は URL に現れない
          .split("/")
          .filter((seg) => !seg.startsWith("(") || !seg.endsWith(")"))
          .join("/");
        routes.push(url === "/" ? "/" : url.replace(/\/$/, ""));
      }
    }
  }
  walk(APP_DIR);
  return routes;
}

// 認証導線・セッション進行中前提のルートは存在条件が異なるためクロールから除外する。
// 動的ルート (`[id]`) は後段で個別に ID 置換してテストする。
const EXCLUDED_PATTERNS: RegExp[] = [
  /^\/auth\//, // 認証前のページ (ログイン/サインアップ)
  /\[.+?\]/, // 動的ルートはまとめて除外し、個別テストでカバー
];

function isStaticAuthenticatedRoute(url: string): boolean {
  return !EXCLUDED_PATTERNS.some((p) => p.test(url));
}

async function assertNoHorizontalScroll(page: Page, label: string) {
  const { scrollWidth, clientWidth } = await page.evaluate(() => ({
    scrollWidth: document.documentElement.scrollWidth,
    clientWidth: document.documentElement.clientWidth,
  }));
  // サブピクセル丸め誤差を 1px まで許容する
  expect(scrollWidth, `${label} で横スクロールが発生`).toBeLessThanOrEqual(
    clientWidth + 1,
  );
}

const STATIC_ROUTES = listAppRoutes().filter(isStaticAuthenticatedRoute);

test.describe("レスポンシブ自動検知: iPhone SE (375x667) 静的ルート", () => {
  // devices["iPhone SE"] をそのまま spread すると defaultBrowserType (webkit)
  // が describe スコープで指定できず Playwright がエラーを投げるため、viewport
  // 等のランタイム設定のみを明示的に指定する (browser はプロジェクト設定の
  // Chromium を使う)。
  test.use({
    viewport: { width: 375, height: 667 },
    isMobile: true,
    hasTouch: true,
    deviceScaleFactor: 2,
  });

  for (const route of STATIC_ROUTES) {
    test(`${route} で横スクロールなし`, async ({ page }) => {
      await page.goto(route);
      await page.waitForLoadState("networkidle");
      await assertNoHorizontalScroll(page, route);
    });
  }
});

test.describe.serial("レスポンシブ: iPhone SE で動的ルート (教材詳細)", () => {
  // devices["iPhone SE"] をそのまま spread すると defaultBrowserType (webkit)
  // が describe スコープで指定できず Playwright がエラーを投げるため、viewport
  // 等のランタイム設定のみを明示的に指定する (browser はプロジェクト設定の
  // Chromium を使う)。
  test.use({
    viewport: { width: 375, height: 667 },
    isMobile: true,
    hasTouch: true,
    deviceScaleFactor: 2,
  });

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

  test("教材詳細 (grid-cols-3 stats) で横スクロールなし", async ({ page }) => {
    await page.goto(`/materials/${materialId}`);
    await page.waitForLoadState("networkidle");
    await assertNoHorizontalScroll(page, `/materials/${materialId}`);
  });

  test("教材編集ページで横スクロールなし", async ({ page }) => {
    await page.goto(`/materials/${materialId}/edit`);
    await page.waitForLoadState("networkidle");
    await assertNoHorizontalScroll(page, `/materials/${materialId}/edit`);
  });
});

test.describe("レスポンシブ: Desktop (1280x800) でコンテナが max-w を超えない", () => {
  test.use({ viewport: { width: 1280, height: 800 } });

  test("Today 画面の中央寄せコンテナが max-w-2xl (672px) 以内", async ({ page }) => {
    await page.goto("/");
    await page.waitForLoadState("networkidle");
    const container = page.getByTestId("today-container");
    await expect(container).toBeVisible();
    const width = await container.evaluate(
      (el) => el.getBoundingClientRect().width,
    );
    expect(width).toBeGreaterThan(0);
    expect(width).toBeLessThanOrEqual(672);
  });
});
