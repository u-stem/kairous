import { test, expect } from "@playwright/test";
import { createTestSubject, cleanupTestData } from "./helpers/db";
import { getTestUser } from "./helpers/types";

// Base UI の Dialog / Sheet が FloatingFocusManager によって focus trap と return focus を
// ネイティブで実装していることを検証する。ラッパーに補修は追加していないため、プリミティブの
// 挙動が退行していないことを E2E で継続的に確認する。
test.describe.serial("Dialog / Sheet a11y", () => {
  let userId: string;
  let subjectName: string;
  const materialTitle = "E2E-a11y-教材";

  test.beforeAll(async () => {
    const user = getTestUser();
    userId = user.id;
    subjectName = `E2E-a11y科目-${Date.now()}`;
    await createTestSubject(userId, subjectName);
  });

  test.afterAll(async () => {
    await cleanupTestData(userId);
  });

  test("Dialog: focus trap, Escape close, focus restore", async ({ page }) => {
    // SRS 教材 + カード 1 枚を UI から作成する (削除ダイアログを使うため)
    await page.goto("/materials/new");

    // Step 0: flashcard を選択（デフォルトのまま次へ）
    await page.getByRole("button", { name: "次へ" }).click(); // Step0 → Step1

    // Step 1: 基本情報を入力する
    await page.locator("#material-title").fill(materialTitle);
    await page.getByRole("combobox").click();
    await page.getByRole("option", { name: subjectName }).click();
    await page.getByRole("button", { name: "次へ" }).click(); // Step1 → Step1.5 (タグ)
    await page.getByRole("button", { name: "次へ" }).click(); // Step1.5 (タグ未入力) → Step2

    await page.getByText("間隔反復 (FSRS)").click();
    await page.getByRole("button", { name: "次へ" }).click();

    await page.locator("#card-front").fill("focus-trap");
    await page.locator("#card-back").fill("a11y");
    await page.getByRole("button", { name: "追加" }).click();
    await page.getByRole("button", { name: /^完了/ }).click();

    await expect(page).toHaveURL(/\/materials\/[0-9a-f-]{36}$/, {
      timeout: 10_000,
    });

    // カードタブを開き削除ボタンを取得する
    await page.getByRole("tab", { name: /カード/ }).click();
    const deleteButton = page.getByRole("button", { name: "カードを削除" }).first();
    await expect(deleteButton).toBeVisible();

    await deleteButton.focus();
    await deleteButton.click();

    // Dialog が表示されるまで待つ (Next.js dev overlay の role=dialog と区別するため
    // accessible name "カードを削除しますか？" で絞り込む)
    const dialog = page.getByRole("dialog", { name: "カードを削除しますか？" });
    await expect(dialog).toBeVisible();

    // 1. 開時に focus が Dialog 内部へ移動していること
    // dialog locator (accessible な role+name) を evaluate に渡し、
    // 実装詳細の data-slot 属性に依存しないで判定する
    await expect
      .poll(() => dialog.evaluate((el) => el.contains(document.activeElement)))
      .toBe(true);

    // 2. Tab で focus が Dialog 内に trap されること
    // FloatingFocusManager は Dialog 前後に FocusGuard span を挿入し、Tab で guard に
    // 到達した瞬間に handler で focus を Dialog 内へ戻す。guard フォーカス直後ではなく
    // 安定した状態で判定するため、Tab 後にブラウザのフォーカスイベント処理を待機する。
    for (let i = 0; i < 5; i++) {
      await page.keyboard.press("Tab");
      await expect
        .poll(() => dialog.evaluate((el) => el.contains(document.activeElement)))
        .toBe(true);
    }

    // 3. Escape で Dialog が閉じること
    await page.keyboard.press("Escape");
    await expect(dialog).not.toBeVisible();

    // 4. 閉時に focus がトリガー要素 (削除ボタン) に戻ること
    // Dialog が閉じた後もカードは削除されていない (「削除する」を押していないため)
    await expect(deleteButton).toBeFocused();
  });

  test("Sheet: focus trap, Escape close, focus restore", async ({ page }) => {
    await page.goto("/materials");
    await page.waitForLoadState("networkidle");
    await page.getByRole("link", { name: materialTitle }).click();
    await page.waitForURL(/\/materials\/[0-9a-f-]{36}$/, { timeout: 10_000 });
    await page.waitForLoadState("networkidle");

    // 手法シートのトリガーボタン
    const trigger = page.getByRole("button", { name: "手法" });
    await trigger.focus();
    await trigger.click();

    // Sheet も role="dialog" でレンダリングされる (Next.js dev overlay と区別するため
    // accessible name で絞り込む)
    const sheet = page.getByRole("dialog", { name: "学習手法を管理" });
    await expect(sheet).toBeVisible();

    // 1. 開時に focus が Sheet 内部へ移動していること
    await expect
      .poll(() => sheet.evaluate((el) => el.contains(document.activeElement)))
      .toBe(true);

    // 2. Tab で focus が Sheet 内に trap されること (Dialog と同じく FocusGuard 考慮)
    for (let i = 0; i < 5; i++) {
      await page.keyboard.press("Tab");
      await expect
        .poll(() => sheet.evaluate((el) => el.contains(document.activeElement)))
        .toBe(true);
    }

    // 3. Escape で Sheet が閉じること
    await page.keyboard.press("Escape");
    await expect(sheet).not.toBeVisible();

    // 4. 閉時に focus がトリガー要素に戻ること
    await expect(trigger).toBeFocused();
  });
});
