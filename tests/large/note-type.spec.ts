import { test, expect } from "@playwright/test";
import {
  createTestSubject,
  cleanupTestData,
} from "./helpers/db";
import { getTestUser } from "./helpers/types";

test.describe.serial("note 教材タイプ", () => {
  let userId: string;
  let subjectName: string;

  test.beforeAll(async () => {
    const user = getTestUser();
    userId = user.id;
    subjectName = `E2E-Note-${Date.now()}`;
    await createTestSubject(userId, subjectName);
  });

  test.afterAll(async () => {
    await cleanupTestData(userId);
  });

  test("note 教材を作成して section_count / word_count を更新する", async ({ page }) => {
    await page.goto("/materials/new");
    // CI の production build ではハイドレーション完了前のクリックが失敗することがある
    await page.waitForLoadState("networkidle");

    // Step 0: note タイプを選択
    await page.getByTestId("material-type-option-note").click();
    await page.getByRole("button", { name: "次へ" }).click();

    // Step 1: 基本情報 + note 固有フィールド (unit_label)
    await page.locator("#material-title").fill("E2E-NoteBook");
    await page.getByRole("combobox").click();
    await page.getByRole("option", { name: subjectName }).click();

    await expect(page.getByTestId("note-unit-label-input")).toBeVisible();
    // デフォルト「セクション」のまま進める

    await page.getByRole("button", { name: "次へ" }).click(); // Step1 → Step1.5
    await page.getByRole("button", { name: "次へ" }).click(); // Step1.5 → Step2

    // Step 2: note 対応の手法 (自由学習) を選択
    await page.getByText("自由学習").click();
    await page.getByRole("button", { name: "作成", exact: true }).click();

    await expect(page).toHaveURL(/\/materials\/[0-9a-f-]{36}$/, { timeout: 10_000 });
    await expect(page.getByTestId("material-title")).toHaveText("E2E-NoteBook");

    // note セクションが表示される (初期値は 0 / 0)
    await expect(page.getByTestId("note-section")).toBeVisible();
    await expect(page.getByTestId("note-section-count")).toHaveText("0");
    await expect(page.getByTestId("note-word-count")).toHaveText("0");

    // section=5 / word=1200 に更新
    await page.getByTestId("note-section-input").fill("5");
    await page.getByTestId("note-word-input").fill("1200");
    await page.getByTestId("note-update-button").click();

    await expect(page.getByTestId("note-section-count")).toHaveText("5", {
      timeout: 5_000,
    });
    await expect(page.getByTestId("note-word-count")).toHaveText("1200");
    // 1200 / 10000 = 12% (基準値は MaterialNoteSection の WORD_COUNT_SCALE=10000 に依存)
    await expect(page.getByTestId("note-word-percent")).toHaveText("12%");
  });
});
