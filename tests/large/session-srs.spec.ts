import { test, expect } from "@playwright/test";
import {
  createTestSubject,
  createTestMaterial,
  createTestCard,
  getMethodIdBySlug,
  linkMaterialMethod,
  createTestSrsState,
  cleanupTestData,
} from "./helpers/db";
import { getTestUser } from "./helpers/types";

test.describe("SRS セッション", () => {
  let userId: string;
  let materialId: string;

  test.beforeAll(async () => {
    const user = getTestUser();
    userId = user.id;
    const subject = await createTestSubject(userId, `E2E-SRS-${Date.now()}`);
    const material = await createTestMaterial(subject.id, userId, "SRS テスト教材");
    materialId = material.id;
    const card1 = await createTestCard(material.id, "SRS表面1", "SRS裏面1", 0);
    const card2 = await createTestCard(material.id, "SRS表面2", "SRS裏面2", 1);
    const srsMethodId = await getMethodIdBySlug("srs");
    await linkMaterialMethod(material.id, srsMethodId);
    // 昨日を期限とすることで due 状態にする
    const yesterday = new Date(Date.now() - 86_400_000).toISOString();
    await createTestSrsState(card1.id, userId, yesterday);
    await createTestSrsState(card2.id, userId, yesterday);
  });

  test.afterAll(async () => {
    await cleanupTestData(userId);
  });

  test("カード表示 → 回答 → 自己評価 → サマリー", async ({ page }) => {
    await page.goto(`/materials/${materialId}`);

    // 手法が1つのみの場合、概要タブに StartSessionButton が表示される
    // ラベル = "間隔反復 (FSRS) (2枚)" (due_count > 0 の場合)
    await page.getByRole("button", { name: /間隔反復/ }).click();
    await page.waitForURL(/\/session\/[\w-]+$/, { timeout: 10_000 });

    // Card 1: めくって正解を選択
    await expect(page.getByText("SRS表面1")).toBeVisible();
    await page.getByRole("button", { name: "めくる" }).click();
    await expect(page.getByText("SRS裏面1")).toBeVisible();
    await page.getByRole("button", { name: "正解" }).click();

    // Card 2: めくって正解を選択
    await expect(page.getByText("SRS表面2")).toBeVisible();
    await page.getByRole("button", { name: "めくる" }).click();
    await expect(page.getByText("SRS裏面2")).toBeVisible();
    await page.getByRole("button", { name: "正解" }).click();

    // レビュー画面: 自己評価を選択
    await page.waitForURL(/\/session\/[\w-]+\/review/, { timeout: 10_000 });
    await expect(page.getByText("正解数")).toBeVisible();
    await page.getByRole("button", { name: "おおむね理解できた" }).click();

    // サマリー画面: sessions.status = 'completed' の場合のみ表示されるため、
    // この画面が表示されること自体がステータス遷移の検証になる
    await page.waitForURL(/\/session\/[\w-]+\/summary/, { timeout: 10_000 });
    await expect(page.getByText("セッション完了")).toBeVisible();
    await expect(page.getByText("カード数")).toBeVisible();
    await expect(page.getByText("正答率")).toBeVisible();
  });
});
