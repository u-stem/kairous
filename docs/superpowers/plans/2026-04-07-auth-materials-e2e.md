# 認証 + 教材管理フローの E2E テスト 実装計画

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 認証フロー (サインアップ・ログイン・ログアウト) と教材管理フロー (CRUD・手法紐付け・カード管理) の Playwright E2E テストを実装する。

**Architecture:** PBI 1 で構築した Playwright 基盤 (storageState、global-setup/teardown、shared helpers) の上に、`auth.spec.ts` と `materials.spec.ts` の 2 ファイルを追加する。認証テストは storageState を使わず独自のブラウザコンテキストで実行。教材テストは storageState の認証済みユーザーで実行する。

**Tech Stack:** Playwright 1.59.1, Supabase local (Auth + PostgreSQL), Next.js 16

**Note:** 設計仕様書ではサインアップテストに Inbucket (メール確認フロー) を含める予定だったが、現在のアプリコードは `enable_confirmations = false` で auth callback ルートも未実装のため、メール確認テストは対象外とする。将来 email confirmation を有効化する際に別 PBI で対応する。

---

## ファイル構成

| 操作 | パス | 責務 |
|------|------|------|
| Create | `tests/large/auth.spec.ts` | サインアップ・ログイン・ログアウトの E2E テスト |
| Create | `tests/large/materials.spec.ts` | 教材 CRUD・手法紐付け・カード CRUD の E2E テスト |
| Modify | `tests/large/helpers/db.ts` | `getMethodIdBySlug` ヘルパーを追加 |
| Modify | `tests/shared/helpers.ts` | `getMethodIdBySlug` ファクトリ関数を追加 |

---

## コンテキスト: 既存基盤

以下は PBI 1 で構築済み。各タスクで参照する。

- **storageState**: `tests/large/.auth/user.json` に認証済みセッションが保存されている。`chromium` プロジェクトのテストはこれを自動で読み込む
- **テストユーザー**: global-setup で作成、global-teardown で削除。メール `e2e-{timestamp}@kairous.local`、パスワード `e2e-test-password-12345`
- **helpers/types.ts**: `TestUserData`, `E2E_PASSWORD`, `STORAGE_STATE_PATH` を export
- **helpers/db.ts**: `loadEnvLocal()` + shared から re-export (`adminClient`, `createTestUser`, `deleteTestUser`, `cleanupTestData` 等)
- **playwright.config.ts**: `webServer` で Next.js サーバーを自動起動。`chromium` プロジェクトは `setup` (auth.setup.ts) に依存

## コンテキスト: UI セレクタ

### サインアップ (`/auth/signup`)
- 表示名: `#displayName`
- メール: `#email`
- パスワード: `#password`
- 送信: `button` with text `サインアップ`
- エラー: `p.text-sm.text-red-600`
- ログインリンク: `a` with text `ログイン`

### ログイン (`/auth/login`)
- メール: `#email`
- パスワード: `#password`
- 送信: `button` with text `ログイン`
- エラー: `p.text-sm.text-red-600`

### プロフィール (`/profile`)
- ログアウト: `button` with text `ログアウト`

### 教材作成ウィザード (`/materials/new`)
- Step 1: タイトル `#material-title`, 説明 `#material-description`, 科目 `button:has-text("科目を選択")`, 次へ `button:has-text("次へ")`
- Step 2: 手法チェックボックス `#method-{id}`, 次へ/作成 `button:has-text("次へ")` or `button:has-text("作成")`
- Step 3: カード表面 `#card-front`, 裏面 `#card-back`, 追加 `button:has-text("追加")`, 完了 `button:has-text("完了")`

### 教材詳細 (`/materials/[id]`)
- タイトル: `h1`
- 編集リンク: `a:has-text("編集")`
- 手法チップ: `MethodChip` コンポーネント
- 手法管理: `MaterialMethodSheet` コンポーネント (Plus アイコンのボタン)
- タブ: `button[role="tab"]:has-text("概要")`, `button[role="tab"]:has-text("カード")`, `button[role="tab"]:has-text("統計")`
- カード追加: `a:has-text("カードを追加")`

### 教材編集 (`/materials/[id]/edit`)
- タイトル: `#title`
- 説明: `#description`
- 保存: `button:has-text("保存")`
- 削除: `button:has-text("削除")` → ダイアログ → `button:has-text("削除する")`

### カード操作
- カード編集: `a[aria-label="カードを編集"]`
- カード削除: `button[aria-label="カードを削除"]` → ダイアログ → `button:has-text("削除する")`
- CardEditor: 表面 `#card-front`, 裏面 `#card-back`, 保存 `button:has-text("保存")`

---

### Task 1: getMethodIdBySlug ヘルパーの追加

**Files:**
- Modify: `tests/shared/helpers.ts`
- Modify: `tests/large/helpers/db.ts`

材料テストで手法 ID を slug から取得する汎用ヘルパーが必要。既存の `getSrsMethodId` / `getWakefulRestMethodId` を汎用化する。

- [ ] **Step 1: `tests/shared/helpers.ts` に `getMethodIdBySlug` を追加**

`getSrsMethodId` と `getWakefulRestMethodId` の下に追加:

```typescript
export async function getMethodIdBySlug(slug: string): Promise<string> {
  const { data } = await adminClient
    .from("learning_methods")
    .select("id")
    .eq("slug", slug)
    .single();
  if (!data) throw new Error(`learning_methods に slug="${slug}" が見つからない`);
  return data.id as string;
}
```

- [ ] **Step 2: `tests/large/helpers/db.ts` に re-export を追加**

```typescript
export {
  createTestSubject,
  createTestMaterial,
  createTestCard,
  getSrsMethodId,
  getWakefulRestMethodId,
  getMethodIdBySlug,       // 追加
  linkMaterialMethod,
  createTestSrsState,
  createTestSession,
  cleanupTestData,
} from "../../shared/helpers";
```

- [ ] **Step 3: 動作確認**

Run: `bun typecheck`
Expected: PASS (型エラーなし)

- [ ] **Step 4: コミット**

```bash
git add tests/shared/helpers.ts tests/large/helpers/db.ts
git commit -m "feat: getMethodIdBySlug ヘルパーを追加"
```

---

### Task 2: auth.spec.ts — サインアップテスト

**Files:**
- Create: `tests/large/auth.spec.ts`

サインアップは storageState を使わない独自コンテキストで実行する。`chromium` プロジェクトの storageState と競合しないよう `test.use({ storageState: { cookies: [], origins: [] } })` で未認証状態にする。

サインアップテストでは新規ユーザーを作成するため、テスト後に admin API で削除する。

- [ ] **Step 1: `tests/large/auth.spec.ts` を作成**

```typescript
import { test, expect } from "@playwright/test";
import { adminClient } from "./helpers/db";

// 認証テストは未認証状態で実行する
test.use({ storageState: { cookies: [], origins: [] } });

test.describe("サインアップ", () => {
  const testEmail = `e2e-signup-${Date.now()}@kairous.local`;
  const testPassword = "signup-test-password-123";

  test.afterAll(async () => {
    // テストで作成したユーザーを削除
    const { data } = await adminClient.auth.admin.listUsers();
    const user = data.users.find((u) => u.email === testEmail);
    if (user) {
      await adminClient.auth.admin.deleteUser(user.id);
    }
  });

  test("新規ユーザーがサインアップしてホームに遷移する", async ({ page }) => {
    await page.goto("/auth/signup");

    await page.locator("#displayName").fill("テストユーザー");
    await page.locator("#email").fill(testEmail);
    await page.locator("#password").fill(testPassword);
    await page.getByRole("button", { name: "サインアップ" }).click();

    // サインアップ成功後、ホームにリダイレクトされる
    await expect(page).toHaveURL("/");
    await expect(page.getByText("今日の学習")).toBeVisible();
  });

  test("バリデーションエラーが表示される", async ({ page }) => {
    await page.goto("/auth/signup");

    // 空のまま送信 (HTML5 required が効くため、displayName を埋めてパスワードを短くする)
    await page.locator("#displayName").fill("テスト");
    await page.locator("#email").fill("invalid-email");
    await page.locator("#password").fill("short");
    await page.getByRole("button", { name: "サインアップ" }).click();

    // Server Action のバリデーションエラー
    await expect(page.locator(".text-red-600")).toBeVisible();
  });

  test("ログインページへのリンクが機能する", async ({ page }) => {
    await page.goto("/auth/signup");
    await page.getByRole("link", { name: "ログイン" }).click();
    await expect(page).toHaveURL("/auth/login");
  });
});
```

- [ ] **Step 2: テスト実行**

Run: `bun test:large -- --grep "サインアップ"`
Expected: 3 tests PASS

- [ ] **Step 3: コミット**

```bash
git add tests/large/auth.spec.ts
git commit -m "test: サインアップ E2E テストを追加"
```

---

### Task 3: auth.spec.ts — ログイン・ログアウトテスト

**Files:**
- Modify: `tests/large/auth.spec.ts`

ログインテストも未認証状態で実行。global-setup で作成済みのテストユーザー (storageState 用) の認証情報を使ってログインする。ログアウトテストはログイン後にプロフィールページから実行する。

- [ ] **Step 1: ログイン・ログアウトテストを `auth.spec.ts` に追加**

ファイル末尾に以下を追加:

```typescript
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { E2E_PASSWORD } from "./helpers/types";
import type { TestUserData } from "./helpers/types";

// ファイル先頭の import を整理して上記を含める (既存の import の後に追加)
```

実際にはファイル先頭の import ブロックを以下のように更新:

```typescript
import { test, expect } from "@playwright/test";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { adminClient } from "./helpers/db";
import { E2E_PASSWORD } from "./helpers/types";
import type { TestUserData } from "./helpers/types";
```

ファイル末尾に以下を追加:

```typescript
test.describe("ログイン", () => {
  // global-setup で作成済みのテストユーザーを使用
  let testUser: TestUserData;

  test.beforeAll(() => {
    const userPath = resolve(__dirname, ".auth", "test-user.json");
    testUser = JSON.parse(readFileSync(userPath, "utf-8")) as TestUserData;
  });

  test("既存ユーザーがログインしてホームに遷移する", async ({ page }) => {
    await page.goto("/auth/login");

    await page.locator("#email").fill(testUser.email);
    await page.locator("#password").fill(E2E_PASSWORD);
    await page.getByRole("button", { name: "ログイン" }).click();

    await expect(page).toHaveURL("/");
    await expect(page.getByText("今日の学習")).toBeVisible();
  });

  test("間違ったパスワードでエラーが表示される", async ({ page }) => {
    await page.goto("/auth/login");

    await page.locator("#email").fill(testUser.email);
    await page.locator("#password").fill("wrong-password-999");
    await page.getByRole("button", { name: "ログイン" }).click();

    await expect(page.locator(".text-red-600")).toBeVisible();
  });

  test("サインアップページへのリンクが機能する", async ({ page }) => {
    await page.goto("/auth/login");
    await page.getByRole("link", { name: "サインアップ" }).click();
    await expect(page).toHaveURL("/auth/signup");
  });
});

test.describe("ログアウト", () => {
  let testUser: TestUserData;

  test.beforeAll(() => {
    const userPath = resolve(__dirname, ".auth", "test-user.json");
    testUser = JSON.parse(readFileSync(userPath, "utf-8")) as TestUserData;
  });

  test("ログイン後にログアウトするとログインページに遷移する", async ({ page }) => {
    // まずログイン
    await page.goto("/auth/login");
    await page.locator("#email").fill(testUser.email);
    await page.locator("#password").fill(E2E_PASSWORD);
    await page.getByRole("button", { name: "ログイン" }).click();
    await expect(page).toHaveURL("/");

    // プロフィールページに移動してログアウト
    await page.goto("/profile");
    await page.getByRole("button", { name: "ログアウト" }).click();

    // ログインページにリダイレクト
    await expect(page).toHaveURL("/auth/login");
  });
});
```

- [ ] **Step 2: テスト実行**

Run: `bun test:large -- --grep "ログイン|ログアウト"`
Expected: 4 tests PASS

- [ ] **Step 3: コミット**

```bash
git add tests/large/auth.spec.ts
git commit -m "test: ログイン・ログアウト E2E テストを追加"
```

---

### Task 4: materials.spec.ts — 教材 CRUD テスト

**Files:**
- Create: `tests/large/materials.spec.ts`

教材の作成 → 詳細表示 → 編集 → 削除の一連のフローをテストする。storageState の認証済みユーザーを使用する (`chromium` プロジェクトのデフォルト)。

教材作成には科目が必要。テストデータとして adminClient で科目を事前作成する。

- [ ] **Step 1: `tests/large/materials.spec.ts` を作成**

```typescript
import { test, expect } from "@playwright/test";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import {
  createTestSubject,
  cleanupTestData,
} from "./helpers/db";
import type { TestUserData } from "./helpers/types";

// global-setup で作成済みのテストユーザー ID を取得
function getTestUser(): TestUserData {
  const userPath = resolve(__dirname, ".auth", "test-user.json");
  return JSON.parse(readFileSync(userPath, "utf-8")) as TestUserData;
}

test.describe("教材 CRUD", () => {
  let userId: string;
  let subjectName: string;

  test.beforeAll(async () => {
    const user = getTestUser();
    userId = user.id;
    // テスト用の科目を作成
    subjectName = `E2E科目-${Date.now()}`;
    await createTestSubject(userId, subjectName);
  });

  test.afterAll(async () => {
    await cleanupTestData(userId);
  });

  test("教材を作成して詳細ページに遷移する", async ({ page }) => {
    await page.goto("/materials/new");

    // Step 1: 基本情報
    await page.locator("#material-title").fill("E2Eテスト教材");
    await page.locator("#material-description").fill("E2Eテスト用の教材です");

    // 科目を選択
    await page.getByRole("combobox").click();
    await page.getByRole("option", { name: subjectName }).click();

    await page.getByRole("button", { name: "次へ" }).click();

    // Step 2: 手法選択 (ポモドーロを選択 — カードベースでないのでStep3スキップ)
    await page.getByText("ポモドーロ").click();
    await page.getByRole("button", { name: "作成" }).click();

    // 教材詳細ページに遷移
    await expect(page).toHaveURL(/\/materials\/[a-f0-9-]+$/);
    await expect(page.locator("h1")).toHaveText("E2Eテスト教材");
  });

  test("教材を編集して詳細ページに戻る", async ({ page }) => {
    // 教材一覧から教材を見つけてクリック
    await page.goto("/materials");
    await page.getByRole("link", { name: "E2Eテスト教材" }).click();
    await expect(page).toHaveURL(/\/materials\/[a-f0-9-]+$/);

    // 編集ページに遷移
    await page.getByRole("link", { name: "編集" }).click();
    await expect(page).toHaveURL(/\/materials\/[a-f0-9-]+\/edit$/);

    // タイトルを変更して保存
    await page.locator("#title").clear();
    await page.locator("#title").fill("E2Eテスト教材（編集済み）");
    await page.getByRole("button", { name: "保存" }).click();

    // 詳細ページに戻り、変更が反映されている
    await expect(page).toHaveURL(/\/materials\/[a-f0-9-]+$/);
    await expect(page.locator("h1")).toHaveText("E2Eテスト教材（編集済み）");
  });

  test("教材を削除して一覧ページに戻る", async ({ page }) => {
    // 教材一覧から教材を見つけて編集ページへ
    await page.goto("/materials");
    await page.getByRole("link", { name: "E2Eテスト教材（編集済み）" }).click();
    await page.getByRole("link", { name: "編集" }).click();

    // 削除ダイアログを開いて削除
    await page.getByRole("button", { name: "削除" }).click();
    await page.getByRole("button", { name: "削除する" }).click();

    // 一覧ページに戻る
    await expect(page).toHaveURL("/materials");

    // 削除した教材が一覧に表示されないことを確認
    await expect(page.getByText("E2Eテスト教材（編集済み）")).not.toBeVisible();
  });
});
```

- [ ] **Step 2: テスト実行**

Run: `bun test:large -- --grep "教材 CRUD"`
Expected: 3 tests PASS

- [ ] **Step 3: コミット**

```bash
git add tests/large/materials.spec.ts
git commit -m "test: 教材 CRUD E2E テストを追加"
```

---

### Task 5: materials.spec.ts — 手法紐付けテスト

**Files:**
- Modify: `tests/large/materials.spec.ts`

教材詳細ページの手法管理シート (`MaterialMethodSheet`) を使って手法を追加・削除するテスト。

先に教材を作成 (ポモドーロのみ) → 手法シートで SRS を追加 → SRS チップが表示される → SRS を削除 → チップが消える。

- [ ] **Step 1: 手法紐付けテストを `materials.spec.ts` に追加**

ファイル末尾 (`test.describe("教材 CRUD")` の閉じ括弧の後) に追加:

```typescript
test.describe("手法紐付け", () => {
  let userId: string;
  let subjectName: string;

  test.beforeAll(async () => {
    const user = getTestUser();
    userId = user.id;
    subjectName = `E2E手法科目-${Date.now()}`;
    await createTestSubject(userId, subjectName);
  });

  test.afterAll(async () => {
    await cleanupTestData(userId);
  });

  test("教材の手法を追加・削除できる", async ({ page }) => {
    // 教材を作成 (ポモドーロのみ)
    await page.goto("/materials/new");
    await page.locator("#material-title").fill("手法テスト教材");
    await page.getByRole("combobox").click();
    await page.getByRole("option", { name: subjectName }).click();
    await page.getByRole("button", { name: "次へ" }).click();
    await page.getByText("ポモドーロ").click();
    await page.getByRole("button", { name: "作成" }).click();
    await expect(page).toHaveURL(/\/materials\/[a-f0-9-]+$/);

    // 手法チップにポモドーロが表示されていることを確認
    await expect(page.getByText("ポモドーロ")).toBeVisible();

    // 手法管理シートを開く (Plus アイコンのボタン)
    await page.locator("button:has(svg.lucide-plus)").click();

    // 間隔反復 (SRS) を追加
    await page.getByText("間隔反復 (FSRS)").click();
    await page.getByRole("button", { name: "保存" }).click();

    // SRS の手法チップが表示される
    await expect(page.getByText("間隔反復 (FSRS)")).toBeVisible();

    // 手法管理シートを再度開いて SRS を外す
    await page.locator("button:has(svg.lucide-plus)").click();
    await page.getByText("間隔反復 (FSRS)").click();
    await page.getByRole("button", { name: "保存" }).click();

    // SRS チップが消える (ポモドーロのみ残る)
    await expect(page.getByText("間隔反復 (FSRS)")).not.toBeVisible();
    await expect(page.getByText("ポモドーロ")).toBeVisible();
  });
});
```

- [ ] **Step 2: テスト実行**

Run: `bun test:large -- --grep "手法紐付け"`
Expected: 1 test PASS

- [ ] **Step 3: コミット**

```bash
git add tests/large/materials.spec.ts
git commit -m "test: 手法紐付け E2E テストを追加"
```

---

### Task 6: materials.spec.ts — カード CRUD テスト

**Files:**
- Modify: `tests/large/materials.spec.ts`

教材のカードタブからカードを追加 → 編集 → 削除するテスト。カードベース手法 (SRS) を持つ教材を事前に作成する。

- [ ] **Step 1: カード CRUD テストを `materials.spec.ts` に追加**

ファイル末尾に追加:

```typescript
test.describe("カード管理", () => {
  let userId: string;
  let subjectName: string;

  test.beforeAll(async () => {
    const user = getTestUser();
    userId = user.id;
    subjectName = `E2Eカード科目-${Date.now()}`;
    await createTestSubject(userId, subjectName);
  });

  test.afterAll(async () => {
    await cleanupTestData(userId);
  });

  test("カードを追加・編集・削除できる", async ({ page }) => {
    // カードベース手法 (SRS) を持つ教材を作成
    await page.goto("/materials/new");
    await page.locator("#material-title").fill("カードテスト教材");
    await page.getByRole("combobox").click();
    await page.getByRole("option", { name: subjectName }).click();
    await page.getByRole("button", { name: "次へ" }).click();
    await page.getByText("間隔反復 (FSRS)").click();
    await page.getByRole("button", { name: "次へ" }).click();

    // Step 3 でカードを1枚追加してウィザードを完了
    await page.locator("#card-front").fill("apple");
    await page.locator("#card-back").fill("りんご");
    await page.getByRole("button", { name: "追加" }).click();
    await page.getByRole("button", { name: /完了/ }).click();

    // 教材詳細ページに遷移
    await expect(page).toHaveURL(/\/materials\/[a-f0-9-]+$/);

    // カードタブに切り替え
    await page.getByRole("tab", { name: /カード/ }).click();

    // ウィザードで追加したカードが表示されている
    await expect(page.getByText("apple")).toBeVisible();

    // --- カードを追加 ---
    await page.getByRole("link", { name: "カードを追加" }).click();
    await expect(page).toHaveURL(/\/cards\/new$/);

    await page.locator("#card-front").fill("banana");
    await page.locator("#card-back").fill("バナナ");
    await page.getByRole("button", { name: "追加" }).click();

    // 追加成功のフィードバックを待つ
    await expect(page.getByText("1枚のカードを追加しました")).toBeVisible();

    // 教材詳細ページに戻る
    await page.getByRole("link", { name: "完了" }).click();
    await page.getByRole("tab", { name: /カード/ }).click();
    await expect(page.getByText("banana")).toBeVisible();

    // --- カードを編集 ---
    // banana カードの編集ボタンをクリック
    const bananaCard = page.locator("div").filter({ hasText: /^banana/ }).first();
    await bananaCard.getByRole("link", { name: "カードを編集" }).click();
    await expect(page).toHaveURL(/\/cards\/[a-f0-9-]+\/edit$/);

    await page.locator("#card-front").clear();
    await page.locator("#card-front").fill("banana (updated)");
    await page.getByRole("button", { name: "保存" }).click();

    // 教材詳細ページに戻る
    await expect(page).toHaveURL(/\/materials\/[a-f0-9-]+/);
    await page.getByRole("tab", { name: /カード/ }).click();
    await expect(page.getByText("banana (updated)")).toBeVisible();

    // --- カードを削除 ---
    const updatedCard = page.locator("div").filter({ hasText: /^banana \(updated\)/ }).first();
    await updatedCard.getByRole("button", { name: "カードを削除" }).click();

    // 削除確認ダイアログ
    await page.getByRole("button", { name: "削除する" }).click();

    // カードが削除されたことを確認
    await expect(page.getByText("banana (updated)")).not.toBeVisible();
    // apple は残っている
    await expect(page.getByText("apple")).toBeVisible();
  });
});
```

- [ ] **Step 2: テスト実行**

Run: `bun test:large -- --grep "カード管理"`
Expected: 1 test PASS

- [ ] **Step 3: コミット**

```bash
git add tests/large/materials.spec.ts
git commit -m "test: カード CRUD E2E テストを追加"
```

---

### Task 7: 全テスト実行 + CI 確認

**Files:** なし (実行のみ)

- [ ] **Step 1: 全 E2E テストをローカルで実行**

Run: `bun test:large`
Expected: smoke.spec.ts (1) + auth.spec.ts (7) + materials.spec.ts (5) = 全テスト PASS

- [ ] **Step 2: lint + typecheck**

Run: `bun run lint && bun run typecheck`
Expected: PASS

- [ ] **Step 3: Issue #123 のサブタスクを作成**

```bash
# auth.spec.ts サブタスク
gh issue create --title "auth.spec.ts: サインアップ・ログイン・ログアウト E2E テスト" \
  --body "Parent: #123" --label "区分: サブタスク" --milestone "Milestone 5"

# materials.spec.ts サブタスク
gh issue create --title "materials.spec.ts: 教材 CRUD・手法紐付け・カード管理 E2E テスト" \
  --body "Parent: #123" --label "区分: サブタスク" --milestone "Milestone 5"
```

---

## 備考

### 設計仕様書との差分

- **Inbucket メール確認テスト**: 対象外。`enable_confirmations = false` かつ auth callback ルート未実装のため。将来 email confirmation を有効化する際に別 PBI で対応する
- **smoke.spec.ts の削除**: PBI 1 で作成した smoke.spec.ts は `auth.spec.ts` のサインアップ・ログインテストがスモークテストの役割を兼ねるため、削除しても良いが、残しておいても害はない。本 PBI では残す

### テスト間の独立性

- `auth.spec.ts` のサインアップテストは独自ユーザーを作成・削除する (`afterAll`)
- `auth.spec.ts` のログイン・ログアウトテストは global-setup のユーザーを使う (読み取りのみ)
- `materials.spec.ts` の各 `describe` ブロックは独自の科目・教材を作成し、`afterAll` で `cleanupTestData` する
- テスト間のデータ依存はない

### セレクタの注意点

- `SubjectSelector` はドロップダウン UI。`getByRole("combobox")` でトリガー、`getByRole("option")` で選択
- `MethodSelector` のチェックボックスは `#method-{methodId}` 形式だが、ID は動的 (UUID)。テキスト (`getByText`) で手法名を選択する方が安定
- `MaterialMethodSheet` の開閉ボタンは Plus アイコン。`button:has(svg.lucide-plus)` で特定
- 教材詳細のカードリストでは、カード表面テキストで特定し、隣接する操作ボタンを取得する
