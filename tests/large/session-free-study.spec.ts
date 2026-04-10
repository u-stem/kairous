import { test, expect } from "@playwright/test";
import {
  createTestSubject,
  createTestMaterial,
  linkMaterialMethod,
  cleanupTestData,
  getMethodIdBySlug,
} from "./helpers/db";
import { getTestUser } from "./helpers/types";

test.describe("Free Study セッション", () => {
  let userId: string;
  let materialId: string;

  test.beforeAll(async () => {
    const user = getTestUser();
    userId = user.id;

    const methodId = await getMethodIdBySlug("free_study");
    const subject = await createTestSubject(
      userId,
      `E2E-FreeStudy-${Date.now()}`
    );
    const material = await createTestMaterial(
      subject.id,
      userId,
      "自由学習テスト教材"
    );
    materialId = material.id;
    await linkMaterialMethod(material.id, methodId);
  });

  test.afterAll(async () => {
    await cleanupTestData(userId);
  });

  test("タイマー → 完了 → サマリー (評価なし)", async ({ page }) => {
    // page.clock は setInterval を差し替えるため、ページ読み込み前に install する
    await page.clock.install();

    await page.goto(`/materials/${materialId}`);
    await page.waitForLoadState("networkidle");

    // free_study の表示名は "自由学習" (DB seeds の learning_methods.name)
    await page.getByRole("button", { name: /自由学習/ }).click();
    await page.waitForURL(/\/session\/[\w-]+$/, { timeout: 10_000 });

    // タイマーフェーズ: 手法名が表示される
    await expect(page.getByText("自由学習")).toBeVisible();

    // React useEffect チェーン (マウント → timer.start → setInterval) が
    // 完了するのを待ってから fake clock を進める
    await page.waitForTimeout(200);

    // 5秒分時間を進める (free study はカウントアップのみ)
    await page.clock.runFor(5 * 1000);

    // 完了ボタンをクリック → 評価フェーズなしで直接サマリーへ
    await page.getByRole("button", { name: "完了" }).click();

    // サマリー画面: sessions.status = 'completed' の場合のみ表示されるため、
    // この画面が表示されること自体がステータス遷移の検証になる
    await page.waitForURL(/\/session\/[\w-]+\/summary/, { timeout: 10_000 });
    await expect(page.getByText("セッション完了")).toBeVisible();
    await expect(page.getByText("学習時間")).toBeVisible();
  });
});
