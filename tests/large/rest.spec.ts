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

// src/lib/constants.ts と同じ値 (Playwright は Node.js 環境のため直接 import 不可。変更時は両方を更新する)
const REST_DURATION_SEC = 600;

test.describe("覚醒的休息", () => {
  let userId: string;
  let materialId: string;

  test.beforeAll(async () => {
    const user = getTestUser();
    userId = user.id;
    const subject = await createTestSubject(userId, `E2E-Rest-${Date.now()}`);
    const material = await createTestMaterial(
      subject.id,
      userId,
      "Rest テスト教材",
    );
    materialId = material.id;
    const card = await createTestCard(material.id, "Rest表面", "Rest裏面", 0);
    const srsMethodId = await getMethodIdBySlug("srs");
    await linkMaterialMethod(material.id, srsMethodId);
    // 昨日を期限とすることで due 状態にする
    const yesterday = new Date(Date.now() - 86_400_000).toISOString();
    await createTestSrsState(card.id, userId, yesterday);
  });

  test.afterAll(async () => {
    await cleanupTestData(userId);
  });

  test("セッションサマリーから安静タイマーを起動して完了する", async ({
    page,
  }) => {
    // page.clock は setInterval を差し替えるため、ページ読み込み前に install する
    await page.clock.install();

    // SRS セッションを実行してサマリーに到達する
    await page.goto(`/materials/${materialId}`);
    await page.getByRole("button", { name: /間隔反復/ }).click();
    await page.waitForURL(/\/session\/[\w-]+$/, { timeout: 10_000 });

    // カード1枚を回答
    await expect(page.getByText("Rest表面")).toBeVisible();
    await page.getByRole("button", { name: "めくる" }).click();
    await expect(page.getByText("Rest裏面")).toBeVisible();
    await page.getByRole("button", { name: "正解" }).click();

    // レビュー画面: 自己評価を選択
    await page.waitForURL(/\/session\/[\w-]+\/review/, { timeout: 10_000 });
    await page.getByRole("button", { name: "おおむね理解できた" }).click();

    // サマリー画面に到達
    await page.waitForURL(/\/session\/[\w-]+\/summary/, { timeout: 10_000 });
    await expect(page.getByText("セッション完了")).toBeVisible();

    // 安静タイマーを開始
    await page.getByRole("button", { name: /安静タイマーを開始/ }).click();
    await page.waitForURL(/\/rest\/[\w-]+$/, { timeout: 10_000 });

    // 安静タイマーが表示される
    await expect(page.getByText("安静タイマー")).toBeVisible();

    // 10分 (600秒) を高速化
    // ボタンクリック後の React 状態更新 -> useEffect -> setInterval 登録を待つため
    // 小さなティックを先に実行してからメインの時間を進める
    await page.clock.runFor(1_000);
    await page.clock.runFor((REST_DURATION_SEC - 1) * 1000);
    await expect(page.getByText("安静完了")).toBeVisible({ timeout: 10_000 });
    await expect(page.getByText(/10 分間の安静が完了しました/)).toBeVisible();

    // ホームに戻る
    await page.getByRole("button", { name: "ホームに戻る" }).click();
    await page.waitForURL("/", { timeout: 10_000 });
  });
});
