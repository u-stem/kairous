import { test, expect } from "@playwright/test";
import {
  createTestCategory,
  createTestMaterial,
  createTestCard,
  getMethodIdBySlug,
  linkMaterialMethod,
  createTestSrsState,
  createTestTag,
  addTestTagToMaterial,
  cleanupTestData,
} from "./helpers/db";
import { getTestUser } from "./helpers/types";

test.describe.serial("タグフィルタ", () => {
  let userId: string;
  let tagAId: string;
  let tagBId: string;
  let materialWithBothTagsTitle: string;
  let materialWithTagATitle: string;

  test.beforeAll(async () => {
    const user = getTestUser();
    userId = user.id;
    const ts = Date.now();

    const category = await createTestCategory(userId, `E2E-TagFilter-カテゴリ-${ts}`);

    materialWithBothTagsTitle = `E2E-TagFilter-両方-${ts}`;
    materialWithTagATitle = `E2E-TagFilter-TagAのみ-${ts}`;
    const materialNoTagTitle = `E2E-TagFilter-タグなし-${ts}`;

    const matBoth = await createTestMaterial(category.id, userId, materialWithBothTagsTitle);
    const matA = await createTestMaterial(category.id, userId, materialWithTagATitle);
    await createTestMaterial(category.id, userId, materialNoTagTitle);

    const tagA = await createTestTag(userId, `E2E-TagA-${ts}`, "#f87171");
    const tagB = await createTestTag(userId, `E2E-TagB-${ts}`, "#4ade80");
    tagAId = tagA.id;
    tagBId = tagB.id;

    // matBoth には tagA と tagB を両方付与する
    await addTestTagToMaterial(matBoth.id, tagAId);
    await addTestTagToMaterial(matBoth.id, tagBId);
    // matA には tagA のみ付与する
    await addTestTagToMaterial(matA.id, tagAId);
  });

  test.afterAll(async () => {
    await cleanupTestData(userId);
  });

  test("タグフィルタで AND 絞り込みが機能する", async ({ page }) => {
    await page.goto("/materials");
    await page.waitForLoadState("networkidle");

    // tagA のみ選択した場合: 両方タグの教材と tagA のみの教材が表示される
    await page.getByTestId("tag-filter").getByRole("checkbox", { name: /E2E-TagA/ }).click();
    await expect(page.getByText(materialWithBothTagsTitle)).toBeVisible();
    await expect(page.getByText(materialWithTagATitle)).toBeVisible();

    // tagB も追加選択した場合 (AND): 両方タグの教材のみ表示
    await page.getByTestId("tag-filter").getByRole("checkbox", { name: /E2E-TagB/ }).click();
    await expect(page.getByText(materialWithBothTagsTitle)).toBeVisible();
    await expect(page.getByText(materialWithTagATitle)).not.toBeVisible();

    // フィルタ解除で全教材が再表示される
    await page.getByRole("button", { name: "フィルタ解除" }).click();
    await expect(page.getByText(materialWithBothTagsTitle)).toBeVisible();
    await expect(page.getByText(materialWithTagATitle)).toBeVisible();
  });
});

test.describe.serial("インターリービング タグ絞り込み", () => {
  let userId: string;
  let tagId: string;
  let materialWithTagTitle: string;

  test.beforeAll(async () => {
    const user = getTestUser();
    userId = user.id;
    const ts = Date.now();

    const srsMethodId = await getMethodIdBySlug("srs");
    const yesterday = new Date(Date.now() - 86_400_000).toISOString();

    const category = await createTestCategory(userId, `E2E-ILTag-カテゴリ-${ts}`);
    const tag = await createTestTag(userId, `E2E-ILTag-${ts}`, "#818cf8");
    tagId = tag.id;

    // タグあり教材 2 件: interleaving に必要な最低件数を満たす
    materialWithTagTitle = `E2E-ILTag-教材A-${ts}`;
    const matA = await createTestMaterial(category.id, userId, materialWithTagTitle);
    const cardA = await createTestCard(matA.id, `E2E-ILTag-表面A-${ts}`, "裏面A", 0);
    await linkMaterialMethod(matA.id, srsMethodId);
    await createTestSrsState(cardA.id, userId, yesterday);
    await addTestTagToMaterial(matA.id, tagId);

    const matB = await createTestMaterial(category.id, userId, `E2E-ILTag-教材B-${ts}`);
    const cardB = await createTestCard(matB.id, `E2E-ILTag-表面B-${ts}`, "裏面B", 0);
    await linkMaterialMethod(matB.id, srsMethodId);
    await createTestSrsState(cardB.id, userId, yesterday);
    await addTestTagToMaterial(matB.id, tagId);

    // タグなし教材 (絞り込み確認用): interleaving 対象から外れるべき
    const matC = await createTestMaterial(category.id, userId, `E2E-ILTag-教材C-noTag-${ts}`);
    const cardC = await createTestCard(matC.id, `E2E-ILTag-表面C-noTag-${ts}`, "裏面C", 0);
    await linkMaterialMethod(matC.id, srsMethodId);
    await createTestSrsState(cardC.id, userId, yesterday);
  });

  test.afterAll(async () => {
    await cleanupTestData(userId);
  });

  test("タグ絞り込みでインターリービングセッションが開始できる", async ({ page }) => {
    await page.goto("/");
    await page.waitForLoadState("networkidle");

    // まとめて学習ボタンが表示されることを確認する
    await expect(page.getByRole("button", { name: "まとめて学習" })).toBeVisible();

    // タグで絞り込む
    const tagFilter = page.getByText("タグで絞り込む（任意）");
    if (await tagFilter.isVisible()) {
      await page.getByRole("checkbox", { name: /E2E-ILTag-/ }).first().click();
      // 対象教材件数が表示される
      await expect(page.getByText(/対象: \d+件の教材/)).toBeVisible();
    }

    // セッション開始
    await page.getByRole("button", { name: "まとめて学習" }).click();
    await page.waitForURL(/\/session\/[\w-]+$/, { timeout: 10_000 });

    // セッションページに遷移することを確認する
    await expect(page).toHaveURL(/\/session\/[\w-]+$/);
  });
});
