import { test, expect } from "@playwright/test";
import { createTestSubject, cleanupTestData } from "./helpers/db";
import { getTestUser } from "./helpers/types";
import type { TestUserData } from "./helpers/types";

test.describe.serial("教材 CRUD", () => {
  let userId: string;
  let subjectName: string;

  test.beforeAll(async () => {
    const user = getTestUser();
    userId = user.id;
    // テストごとに一意な科目名を使い、他のテストデータと衝突しない
    subjectName = `E2E科目-${Date.now()}`;
    await createTestSubject(userId, subjectName);
  });

  test.afterAll(async () => {
    await cleanupTestData(userId);
  });

  test("教材を作成して詳細ページに遷移する", async ({ page }) => {
    await page.goto("/materials/new");

    // Step 1: 基本情報を入力する
    await page.locator("#material-title").fill("E2Eテスト教材");
    await page.locator("#material-description").fill("E2Eテスト用の教材です");

    // 科目セレクター (Base UI の combobox) を開いて選択する
    await page.getByRole("combobox").click();
    await page.getByRole("option", { name: subjectName }).click();

    await page.getByRole("button", { name: "次へ" }).click();

    // Step 2: 手法を選択する (ポモドーロは time-based なので "作成" ボタンが表示される)
    await page.getByText("ポモドーロ").click();
    await page.getByRole("button", { name: "作成" }).click();

    // 作成後は /materials/{uuid} にリダイレクトされる
    await expect(page).toHaveURL(/\/materials\/[0-9a-f-]{36}$/, {
      timeout: 10_000,
    });
    // サイトタイトル "Kairous" の h1 と教材タイトルの h1 が共存するため truncate クラスで絞り込む
    await expect(page.locator("h1.truncate")).toHaveText("E2Eテスト教材");
  });

  test("教材を編集して詳細ページに戻る", async ({ page }) => {
    await page.goto("/materials");

    // 一覧から教材リンクをクリックして詳細へ遷移する
    await page.getByRole("link", { name: "E2Eテスト教材" }).click();
    await page.waitForURL(/\/materials\/[0-9a-f-]{36}$/, { timeout: 10_000 });
    await page.getByRole("link", { name: "編集" }).click();

    // タイトルを変更して保存する
    await page.locator("#title").clear();
    await page.locator("#title").fill("E2Eテスト教材（編集済み）");
    await page.getByRole("button", { name: "保存" }).click();

    // 保存後は /materials/{uuid} (編集ページではない) にリダイレクトされる
    await expect(page).toHaveURL(/\/materials\/[0-9a-f-]{36}$/, {
      timeout: 10_000,
    });
    await expect(page.locator("h1.truncate")).toHaveText("E2Eテスト教材（編集済み）");
  });

  test("教材を削除して一覧ページに戻る", async ({ page }) => {
    await page.goto("/materials");

    // 編集済みの教材を選択して削除する
    await page.getByRole("link", { name: "E2Eテスト教材（編集済み）" }).click();
    // 詳細ページへの遷移を待つ
    await page.waitForURL(/\/materials\/[0-9a-f-]{36}$/, { timeout: 10_000 });
    await page.getByRole("link", { name: "編集" }).click();
    // 編集ページへの遷移を待つ
    await page.waitForURL(/\/materials\/[0-9a-f-]{36}\/edit$/, {
      timeout: 10_000,
    });

    await page.getByRole("button", { name: "削除" }).click();

    // 確認ダイアログで削除を実行する
    await page.getByRole("button", { name: "削除する" }).click();

    // 削除後は /materials にリダイレクトされる
    await expect(page).toHaveURL("/materials", { timeout: 10_000 });

    // 削除した教材が一覧に表示されていないことを確認する
    await expect(
      page.getByText("E2Eテスト教材（編集済み）")
    ).not.toBeVisible();
  });
});

test.describe("手法紐付け", () => {
  let userId: string;
  let subjectName: string;

  test.beforeAll(async () => {
    const user = getTestUser();
    userId = user.id;
    // テストごとに一意な科目名を使い、他のテストデータと衝突しない
    subjectName = `E2E手法科目-${Date.now()}`;
    await createTestSubject(userId, subjectName);
  });

  test.afterAll(async () => {
    await cleanupTestData(userId);
  });


  test("教材の手法を追加・削除できる", async ({ page }) => {
    // 1. ポモドーロのみで教材を作成する
    await page.goto("/materials/new");
    await page.locator("#material-title").fill("手法テスト教材");
    await page.getByRole("combobox").click();
    await page.getByRole("option", { name: subjectName }).click();
    await page.getByRole("button", { name: "次へ" }).click();
    await page.getByText("ポモドーロ").click();
    await page.getByRole("button", { name: "作成" }).click();
    await expect(page).toHaveURL(/\/materials\/[0-9a-f-]{36}$/, {
      timeout: 10_000,
    });

    // 2. ポモドーロチップが表示されていることを確認する
    // MethodChip は span でレンダリングされるため span に絞り込む
    await expect(page.locator("span").filter({ hasText: "ポモドーロ" }).first()).toBeVisible();

    // 3. 手法シートを開いて間隔反復 (FSRS) を追加する
    // MaterialMethodSheet のトリガーは Plus アイコン + "手法" テキストを持つボタン
    await page.getByRole("button", { name: "手法" }).click();
    // シートが表示されるまで待つ
    await expect(page.getByText("学習手法を管理")).toBeVisible({
      timeout: 5_000,
    });
    // シート内のチェックリストから間隔反復 (FSRS) をクリックして選択する
    // getByText は詳細ページのチップと被る可能性があるため SheetContent 内に絞り込む
    await page.locator('[role="dialog"]').getByText("間隔反復 (FSRS)").click();
    await page.getByRole("button", { name: "保存" }).click();
    // 非同期保存が完了してシートが閉じるまで待つ (transition の完了を待つため長めに設定)
    await expect(page.getByText("学習手法を管理")).not.toBeVisible({
      timeout: 15_000,
    });

    // 4. 間隔反復 (FSRS) チップが表示されていることを確認する
    // MethodChip は span でレンダリングされるため span に絞り込む
    await expect(page.locator("span").filter({ hasText: "間隔反復 (FSRS)" })).toBeVisible();

    // 5. 手法シートを再度開いて間隔反復 (FSRS) を削除する
    await page.getByRole("button", { name: "手法" }).click();
    await expect(page.getByText("学習手法を管理")).toBeVisible({
      timeout: 5_000,
    });
    await page.locator('[role="dialog"]').getByText("間隔反復 (FSRS)").click();
    await page.getByRole("button", { name: "保存" }).click();
    await expect(page.getByText("学習手法を管理")).not.toBeVisible({
      timeout: 15_000,
    });

    // 6. 間隔反復 (FSRS) チップが消え、ポモドーロが残っていることを確認する
    await expect(page.locator("span").filter({ hasText: "間隔反復 (FSRS)" })).not.toBeVisible();
    await expect(page.locator("span").filter({ hasText: "ポモドーロ" }).first()).toBeVisible();
  });
});

test.describe("カード管理", () => {
  let userId: string;
  let subjectName: string;

  test.beforeAll(async () => {
    const user = getTestUser();
    userId = user.id;
    // テストごとに一意な科目名を使い、他のテストデータと衝突しない
    subjectName = `E2Eカード科目-${Date.now()}`;
    await createTestSubject(userId, subjectName);
  });

  test.afterAll(async () => {
    await cleanupTestData(userId);
  });

  test("カードを追加・編集・削除できる", async ({ page }) => {
    // === ウィザードで SRS 手法 + 初期カード 1 枚の教材を作成する ===
    await page.goto("/materials/new");

    // Step 1: タイトルと科目を入力する
    await page.locator("#material-title").fill("カードテスト教材");
    await page.getByRole("combobox").click();
    await page.getByRole("option", { name: subjectName }).click();
    await page.getByRole("button", { name: "次へ" }).click();

    // Step 2: 間隔反復 (FSRS) を選択するとカード入力ステップが出現する
    await page.getByText("間隔反復 (FSRS)").click();
    await page.getByRole("button", { name: "次へ" }).click();

    // Step 3: カード「apple / りんご」を追加する
    await page.locator("#card-front").fill("apple");
    await page.locator("#card-back").fill("りんご");
    await page.getByRole("button", { name: "追加" }).click();

    // 完了ボタンのテキストは「完了（N枚のカード）」と動的に変わるため正規表現で一致させる
    await page.getByRole("button", { name: /^完了/ }).click();

    // 作成後は /materials/{uuid} にリダイレクトされる
    await expect(page).toHaveURL(/\/materials\/[0-9a-f-]{36}$/, {
      timeout: 10_000,
    });

    // === カードタブに切り替えて初期カードを確認する ===
    await page.getByRole("tab", { name: /カード/ }).click();
    await expect(page.locator("p.truncate.text-sm.font-medium").filter({ hasText: "apple" })).toBeVisible();

    // === カード追加ページでカード「banana / バナナ」を追加する ===
    await page.getByRole("link", { name: "カードを追加" }).click();
    await expect(page).toHaveURL(/\/materials\/[0-9a-f-]{36}\/cards\/new$/, {
      timeout: 10_000,
    });

    await page.locator("#card-front").fill("banana");
    await page.locator("#card-back").fill("バナナ");
    await page.getByRole("button", { name: "追加" }).click();

    // 成功フィードバック（N枚のカードを追加しました）が表示されるのを待つ
    await expect(page.locator("p").filter({ hasText: /枚のカードを追加しました/ })).toBeVisible({
      timeout: 5_000,
    });

    // 完了ボタンで教材詳細ページへ戻る（?tab=cards 付きで遷移する）
    await page.getByRole("button", { name: "完了" }).click();
    await expect(page).toHaveURL(/\/materials\/[0-9a-f-]{36}(\?tab=cards)?$/, {
      timeout: 10_000,
    });

    // カードタブを再度クリックしてリストを表示する（URL にタブ指定がない場合の保険）
    await page.getByRole("tab", { name: /カード/ }).click();
    await expect(page.locator("p.truncate.text-sm.font-medium").filter({ hasText: "banana" })).toBeVisible();

    // === banana カードを編集する ===
    // banana カードの行を特定して編集リンクをクリックする
    const bananaRow = page
      .locator("div.flex.items-start.gap-3.rounded-lg")
      .filter({ has: page.locator("p.truncate.text-sm.font-medium", { hasText: "banana" }) });
    await bananaRow.getByRole("link", { name: "カードを編集" }).click();

    await expect(page).toHaveURL(/\/materials\/[0-9a-f-]{36}\/cards\/[0-9a-f-]{36}\/edit$/, {
      timeout: 10_000,
    });

    // 表面テキストを変更して保存する
    await page.locator("#card-front").clear();
    await page.locator("#card-front").fill("banana (updated)");
    await page.getByRole("button", { name: "保存" }).click();

    // 保存後は教材詳細ページへ戻る
    await expect(page).toHaveURL(/\/materials\/[0-9a-f-]{36}(\?tab=cards)?$/, {
      timeout: 10_000,
    });

    // カードタブを開いて更新後のテキストを確認する
    await page.getByRole("tab", { name: /カード/ }).click();
    await expect(page.locator("p.truncate.text-sm.font-medium").filter({ hasText: "banana (updated)" })).toBeVisible();

    // === banana (updated) カードを削除する ===
    const updatedBananaRow = page
      .locator("div.flex.items-start.gap-3.rounded-lg")
      .filter({ has: page.locator("p.truncate.text-sm.font-medium", { hasText: "banana (updated)" }) });
    await updatedBananaRow.getByRole("button", { name: "カードを削除" }).click();

    // 削除確認ダイアログで「削除する」ボタンをクリックする
    await page.getByRole("button", { name: "削除する" }).click();

    // 削除されたカードが消え、apple カードは残っていることを確認する
    await expect(page.locator("p.truncate.text-sm.font-medium").filter({ hasText: "banana (updated)" })).not.toBeVisible({
      timeout: 5_000,
    });
    await expect(page.locator("p.truncate.text-sm.font-medium").filter({ hasText: "apple" })).toBeVisible();
  });
});
