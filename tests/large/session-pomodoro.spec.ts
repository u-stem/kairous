import { test, expect } from "@playwright/test";
import {
  createTestSubject,
  createTestMaterial,
  getMethodIdBySlug,
  linkMaterialMethod,
  cleanupTestData,
} from "./helpers/db";
import { getTestUser } from "./helpers/types";

// src/lib/constants.ts と同じ値
const POMODORO_FOCUS_SEC = 1500;
const POMODORO_BREAK_SEC = 300;

test.describe("Pomodoro セッション", () => {
  let userId: string;
  let materialId: string;

  test.beforeAll(async () => {
    const user = getTestUser();
    userId = user.id;
    const subject = await createTestSubject(userId, `E2E-Pomo-${Date.now()}`);
    const material = await createTestMaterial(
      subject.id,
      userId,
      "Pomodoro テスト教材",
    );
    materialId = material.id;
    const pomodoroMethodId = await getMethodIdBySlug("pomodoro");
    await linkMaterialMethod(material.id, pomodoroMethodId);
  });

  test.afterAll(async () => {
    await cleanupTestData(userId);
  });

  test("タイマー → 休憩 → 終了 → 自己評価 → サマリー", async ({ page }) => {
    // page.clock は setInterval を差し替えるため、ページ読み込み前に install する
    await page.clock.install();

    await page.goto(`/materials/${materialId}`);

    // seed data の learning_methods.name = "ポモドーロ" に対応するボタンをクリック
    await page.getByRole("button", { name: /ポモドーロ/ }).click();
    await page.waitForURL(/\/session\/[\w-]+$/, { timeout: 10_000 });

    // Focus phase: タイマーが表示される
    await expect(page.getByText("集中タイマー")).toBeVisible();

    // Focus 完了まで時間を進める
    // runFor は全ての setInterval ティックを忠実に実行する (fastForward は間引く)
    await page.clock.runFor(POMODORO_FOCUS_SEC * 1000);
    await expect(page.getByText("集中完了")).toBeVisible({ timeout: 5_000 });

    // 休憩開始
    await page.getByRole("button", { name: /休憩を開始/ }).click();
    await expect(page.getByText("休憩タイマー")).toBeVisible();

    // Break 完了まで時間を進める
    await page.clock.runFor(POMODORO_BREAK_SEC * 1000);
    await expect(page.getByText("休憩完了")).toBeVisible({ timeout: 5_000 });

    // 終了する
    await page.getByRole("button", { name: "終了する" }).click();

    // Self-rating (inline in PomodoroPlayer, phase="done")
    // Pomodoro のボタンテキストは "{r}. {SELF_RATING_LABELS[r]}" 形式
    await expect(page.getByText("学習の振り返り")).toBeVisible();
    await page.getByRole("button", { name: /おおむね理解できた/ }).click();

    // サマリー画面: sessions.status = 'completed' の場合のみ表示されるため、
    // この画面が表示されること自体がステータス遷移の検証になる
    await page.waitForURL(/\/session\/[\w-]+\/summary/, { timeout: 10_000 });
    await expect(page.getByText("セッション完了")).toBeVisible();
    await expect(page.getByText("サイクル数")).toBeVisible();
    await expect(page.getByText("集中時間")).toBeVisible();
  });
});
