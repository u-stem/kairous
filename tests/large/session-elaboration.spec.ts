import { test, expect } from "@playwright/test";
import {
  createTestSubject,
  createTestMaterial,
  createTestCard,
  getMethodIdBySlug,
  linkMaterialMethod,
  cleanupTestData,
} from "./helpers/db";
import { getTestUser } from "./helpers/types";

test.describe("Elaboration セッション", () => {
  let userId: string;
  let materialId: string;

  test.beforeAll(async () => {
    const user = getTestUser();
    userId = user.id;
    const subject = await createTestSubject(userId, `E2E-Elab-${Date.now()}`);
    const material = await createTestMaterial(subject.id, userId, "Elaboration テスト教材");
    materialId = material.id;
    await createTestCard(material.id, "Elab表面1", "Elab裏面1", 0);
    const elabMethodId = await getMethodIdBySlug("elaboration");
    await linkMaterialMethod(material.id, elabMethodId);
  });

  test.afterAll(async () => {
    await cleanupTestData(userId);
  });

  test("記述入力 → 回答確認 → 自己評価 → サマリー", async ({ page }) => {
    await page.goto(`/materials/${materialId}`);

    // seed data の learning_methods.name = "精緻化" に対応するボタンをクリック
    await page.getByRole("button", { name: /精緻化/ }).click();
    await page.waitForURL(/\/session\/[\w-]+$/, { timeout: 10_000 });

    // カード表面が表示されていることを確認し、精緻化テキストを入力
    await expect(page.getByText("Elab表面1")).toBeVisible();
    await page.locator("#elaboration-text").fill("テスト用の精緻化テキスト");
    await page.getByRole("button", { name: "回答を確認" }).click();

    // カード裏面が表示されたことを確認し、カード単位の自己評価を選択
    await expect(page.getByText("Elab裏面1")).toBeVisible();
    await page.getByRole("button", { name: "おおむね理解できた" }).click();

    // レビュー画面: セッション全体の自己評価を選択
    // カード評価とセッション評価で同じ SELF_RATING_LABELS を使うのは異なるページでの操作のため意図的
    await page.waitForURL(/\/session\/[\w-]+\/review/, { timeout: 10_000 });
    await expect(page.getByText("回答数")).toBeVisible();
    await page.getByRole("button", { name: "おおむね理解できた" }).click();

    // サマリー画面: sessions.status = 'completed' の場合のみ表示されるため、
    // この画面が表示されること自体がステータス遷移の検証になる
    await page.waitForURL(/\/session\/[\w-]+\/summary/, { timeout: 10_000 });
    await expect(page.getByText("セッション完了")).toBeVisible();
    await expect(page.getByText("カード数")).toBeVisible();
  });
});
