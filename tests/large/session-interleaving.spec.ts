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

test.describe("Interleaving セッション", () => {
  let userId: string;

  test.beforeAll(async () => {
    const user = getTestUser();
    userId = user.id;

    const srsMethodId = await getMethodIdBySlug("srs");

    // Material A: 別の subject に属するカードを用意して interleaving の多教材条件を満たす
    const subjectA = await createTestSubject(userId, `E2E-IntA-${Date.now()}`);
    const materialA = await createTestMaterial(subjectA.id, userId, "Interleaving教材A");
    const cardA = await createTestCard(materialA.id, "IL表面A", "IL裏面A", 0);
    await linkMaterialMethod(materialA.id, srsMethodId);
    // 昨日を期限とすることで due 状態にする
    const yesterday = new Date(Date.now() - 86_400_000).toISOString();
    await createTestSrsState(cardA.id, userId, yesterday);

    // Material B: getDueMaterials() が 2 件以上を返すために別の教材も用意する
    const subjectB = await createTestSubject(userId, `E2E-IntB-${Date.now()}`);
    const materialB = await createTestMaterial(subjectB.id, userId, "Interleaving教材B");
    const cardB = await createTestCard(materialB.id, "IL表面B", "IL裏面B", 0);
    await linkMaterialMethod(materialB.id, srsMethodId);
    await createTestSrsState(cardB.id, userId, yesterday);
  });

  test.afterAll(async () => {
    await cleanupTestData(userId);
  });

  test("複数教材カード → 回答 → 自己評価 → サマリー", async ({ page }) => {
    // Today ページで InterleavingButton ("まとめて学習") が表示されるのは
    // getDueMaterials() が 2 件以上の教材を返す場合のみ
    await page.goto("/");
    await expect(page.getByText("まとめて学習")).toBeVisible();
    await page.getByRole("button", { name: "まとめて学習" }).click();
    await page.waitForURL(/\/session\/[\w-]+$/, { timeout: 10_000 });

    // Card 1: Interleaving 固有の教材名ラベルが表示されることを確認してから回答
    await expect(page.getByText(/Interleaving教材[AB]/)).toBeVisible();
    await expect(page.getByText(/IL表面[AB]/)).toBeVisible();
    await page.getByRole("button", { name: "めくる" }).click();
    await expect(page.getByText(/IL裏面[AB]/)).toBeVisible();
    await page.getByRole("button", { name: "正解" }).click();

    // Card 2: カード順はシャッフルされるため正規表現で両教材に対応
    await expect(page.getByText(/IL表面[AB]/)).toBeVisible();
    await page.getByRole("button", { name: "めくる" }).click();
    await expect(page.getByText(/IL裏面[AB]/)).toBeVisible();
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
  });
});
