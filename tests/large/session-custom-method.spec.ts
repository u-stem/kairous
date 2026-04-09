import { test, expect } from "@playwright/test";
import {
  createTestSubject,
  createTestMaterial,
  linkMaterialMethod,
  cleanupTestData,
  getAdminClient,
} from "./helpers/db";
import { getTestUser } from "./helpers/types";
import { cleanupCustomMethods } from "../shared/helpers";

test.describe("カスタム手法セッション", () => {
  let userId: string;
  let materialId: string;

  test.beforeAll(async () => {
    const user = getTestUser();
    userId = user.id;

    // カスタム手法を DB 直接作成 (Server Action は cookie が必要なため)
    const methodResult = await getAdminClient()
      .from("learning_methods")
      .insert({
        slug: `custom_e2etest_音読`,
        name: "音読",
        category: "memory",
        description: "声に出して記憶を強化",
        default_duration_sec: 60,
        default_config: {},
        is_system: false,
        user_id: userId,
      })
      .select("id")
      .single();

    if (methodResult.error) throw new Error(`カスタム手法作成失敗: ${methodResult.error.message}`);
    const customMethodId = methodResult.data.id as string;

    const subject = await createTestSubject(userId, `E2E-Custom-${Date.now()}`);
    const material = await createTestMaterial(subject.id, userId, "カスタム手法テスト教材");
    materialId = material.id;
    await linkMaterialMethod(material.id, customMethodId);
  });

  test.afterAll(async () => {
    await cleanupTestData(userId);
    await cleanupCustomMethods(userId);
  });

  test("タイマー → 完了 → 自己評価 → サマリー", async ({ page }) => {
    // page.clock は setInterval を差し替えるため、ページ読み込み前に install する
    await page.clock.install();

    await page.goto(`/materials/${materialId}`);
    await page.waitForLoadState("networkidle");

    // 手法が1つの場合は StartSessionButton (手法名ラベル)、
    // 複数の場合は MethodSelectList (手法名のボタン) が表示される
    await page.getByRole("button", { name: /音読/ }).click();
    await page.waitForURL(/\/session\/[\w-]+$/, { timeout: 10_000 });

    // タイマーフェーズ: カスタム手法名が表示される
    await expect(page.getByText("音読")).toBeVisible();

    // React useEffect チェーン (マウント → timer.start → setInterval) が
    // 完了するのを待ってから fake clock を進める
    await page.waitForTimeout(200);

    // 目標時間 (60秒) まで時間を進める
    await page.clock.runFor(60 * 1000);

    // 目標時間到達メッセージが表示されることを確認
    await expect(page.getByText("目標時間に達しました")).toBeVisible({ timeout: 10_000 });

    // 完了ボタンをクリックして評価フェーズへ移行
    await page.getByRole("button", { name: "完了" }).click();

    // 自己評価画面
    await expect(page.getByText("学習の振り返り")).toBeVisible();
    await page.getByRole("button", { name: /おおむね理解できた/ }).click();

    // サマリー画面: sessions.status = 'completed' の場合のみ表示されるため、
    // この画面が表示されること自体がステータス遷移の検証になる
    await page.waitForURL(/\/session\/[\w-]+\/summary/, { timeout: 10_000 });
    await expect(page.getByText("セッション完了")).toBeVisible();
    await expect(page.getByText("学習時間")).toBeVisible();
  });
});
