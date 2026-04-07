# Playwright 基盤構築 実装計画

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Playwright E2E テスト基盤を構築し、スモークテストが CI で動作する状態にする

**Architecture:** Playwright を `tests/large/` に配置。認証は `storageState` パターンで global-setup でユーザー作成、auth.setup でログイン状態保存、global-teardown でクリーンアップ。DB ヘルパーは `tests/shared/` に抽出し Medium/Large で共有。CI は `test-medium` の後に `test-large` ジョブを実行。

**Tech Stack:** Playwright, Next.js 16, Supabase, GitHub Actions

**Spec:** `docs/superpowers/specs/2026-04-07-playwright-e2e-design.md`
**PBI:** Epic #115 の PBI 1

---

## ファイル構成

| 操作 | ファイル | 責務 |
|------|---------|------|
| Create | `tests/shared/db.ts` | adminClient 初期化、テストユーザー CRUD |
| Create | `tests/shared/helpers.ts` | テストデータファクトリ (subject, material, card 等) |
| Modify | `tests/medium/setup.ts` | `tests/shared/db.ts` を import に変更 |
| Modify | `tests/medium/helpers/db.ts` | `tests/shared/helpers.ts` を re-export に変更 |
| Create | `tests/large/playwright.config.ts` | Playwright 設定 (webServer, screenshot, trace) |
| Create | `tests/large/global-setup.ts` | テストユーザー作成、userId をファイルに書き出し |
| Create | `tests/large/global-teardown.ts` | テストユーザー削除 |
| Create | `tests/large/auth.setup.ts` | UI ログイン → storageState 保存 |
| Create | `tests/large/helpers/db.ts` | shared を import + Large テスト固有ヘルパー |
| Create | `tests/large/smoke.spec.ts` | スモークテスト (認証済みでホーム表示確認) |
| Modify | `package.json` | `test:large` スクリプト更新、`@playwright/test` 追加 |
| Modify | `.gitignore` | `tests/large/.auth/` 追加 |
| Modify | `.github/workflows/ci.yml` | `test-large` ジョブ追加 |
| Modify | `.claude/rules/testing.md` | Large テスト欄を更新 |
| Modify | `lefthook.yml` | pre-push に test:large 追加検討 (後述: 追加しない) |

---

### Task 1: Playwright インストールと package.json 更新

**Files:**
- Modify: `package.json`

- [ ] **Step 1: Playwright をインストール**

```bash
cd /Users/mikiya/ws/kairous && bun add -D @playwright/test
```

- [ ] **Step 2: Chromium ブラウザをインストール**

```bash
cd /Users/mikiya/ws/kairous && bunx playwright install chromium
```

- [ ] **Step 3: `test:large` スクリプトを更新**

`package.json` の `test:large` を変更:

```json
"test:large": "playwright test --config tests/large/playwright.config.ts"
```

- [ ] **Step 4: コミット**

```bash
git add package.json bun.lock
git commit -m "chore: Playwright インストール、test:large スクリプト更新"
```

---

### Task 2: DB ヘルパーを `tests/shared/` に抽出

**Files:**
- Create: `tests/shared/db.ts`
- Create: `tests/shared/helpers.ts`
- Modify: `tests/medium/setup.ts`
- Modify: `tests/medium/helpers/db.ts`

- [ ] **Step 1: `tests/shared/db.ts` を作成**

`process.env` から値を取得するのみ。env ファイルの読み込みロジックは含めない。

```ts
import { createClient } from "@supabase/supabase-js";

function getRequiredEnv(key: string): string {
  const value = process.env[key];
  if (!value) {
    throw new Error(`${key} が未設定。.env.local または CI 環境変数を確認`);
  }
  return value;
}

export function createAdminClient() {
  return createClient(
    getRequiredEnv("NEXT_PUBLIC_SUPABASE_URL"),
    getRequiredEnv("SUPABASE_SERVICE_ROLE_KEY"),
  );
}

export const adminClient = createAdminClient();

export async function createTestUser(
  email = `test-${Date.now()}@kairous.local`,
  password = "test-password-12345",
): Promise<{ id: string; email: string; password: string }> {
  const { data, error } = await adminClient.auth.admin.createUser({
    email,
    password,
    email_confirm: true,
    user_metadata: { display_name: "Test User" },
  });
  if (error) throw new Error(`テストユーザー作成失敗: ${error.message}`);
  return { id: data.user.id, email, password };
}

export async function deleteTestUser(userId: string): Promise<void> {
  const { error } = await adminClient.auth.admin.deleteUser(userId);
  if (error) throw new Error(`テストユーザー削除失敗: ${error.message}`);
}

export async function createUserClient(email: string, password: string) {
  const anonKey = getRequiredEnv("NEXT_PUBLIC_SUPABASE_ANON_KEY");
  const supabaseUrl = getRequiredEnv("NEXT_PUBLIC_SUPABASE_URL");
  const client = createClient(supabaseUrl, anonKey);
  const { error } = await client.auth.signInWithPassword({ email, password });
  if (error) throw new Error(`サインイン失敗: ${error.message}`);
  return client;
}
```

- [ ] **Step 2: `tests/shared/helpers.ts` を作成**

既存の `tests/medium/helpers/db.ts` からファクトリ関数を移動。

```ts
import { adminClient } from "./db";

export async function createTestSubject(userId: string, name = "テスト分野") {
  const result = await adminClient
    .from("subjects")
    .insert({ user_id: userId, name, color: "#6366f1" })
    .select()
    .single();
  if (result.error) throw new Error(`テスト分野作成失敗: ${result.error.message}`);
  return result.data as { id: string; name: string; color: string; user_id: string };
}

export async function createTestMaterial(
  subjectId: string,
  userId: string,
  title = "テスト教材",
) {
  const result = await adminClient
    .from("materials")
    .insert({ subject_id: subjectId, user_id: userId, title })
    .select()
    .single();
  if (result.error) throw new Error(`テスト教材作成失敗: ${result.error.message}`);
  return result.data as { id: string; title: string; subject_id: string; user_id: string };
}

export async function createTestCard(
  materialId: string,
  front = "テスト表面",
  back = "テスト裏面",
  displayOrder = 0,
) {
  const result = await adminClient
    .from("cards")
    .insert({ material_id: materialId, front, back, display_order: displayOrder })
    .select()
    .single();
  if (result.error) throw new Error(`テストカード作成失敗: ${result.error.message}`);
  return result.data as { id: string; material_id: string; front: string; back: string; display_order: number };
}

export async function getSrsMethodId(): Promise<string> {
  const { data } = await adminClient
    .from("learning_methods")
    .select("id")
    .eq("slug", "srs")
    .single();
  if (!data) throw new Error("SRS method not found in seed data");
  return data.id as string;
}

export async function getWakefulRestMethodId(): Promise<string> {
  const { data } = await adminClient
    .from("learning_methods")
    .select("id")
    .eq("slug", "wakeful_rest")
    .single();
  if (!data) throw new Error("wakeful_rest method not found in seed data");
  return data.id as string;
}

export async function linkMaterialMethod(materialId: string, methodId: string) {
  const { error } = await adminClient
    .from("material_methods")
    .insert({ material_id: materialId, method_id: methodId });
  if (error) throw new Error(`material_methods 紐付け失敗: ${error.message}`);
}

export async function createTestSrsState(
  cardId: string,
  userId: string,
  dueDate: string,
  state = "New",
) {
  const { error } = await adminClient
    .from("srs_states")
    .insert({
      card_id: cardId,
      user_id: userId,
      due_date: dueDate,
      state,
      stability: 1.0,
      difficulty: 5.0,
    });
  if (error) throw new Error(`テスト srs_state 作成失敗: ${error.message}`);
}

export async function createTestSession(
  userId: string,
  materialId: string,
  methodId: string,
  status = "in_progress",
) {
  const result = await adminClient
    .from("sessions")
    .insert({ user_id: userId, material_id: materialId, method_id: methodId, status })
    .select()
    .single();
  if (result.error) throw new Error(`テストセッション作成失敗: ${result.error.message}`);
  return result.data as { id: string; user_id: string; material_id: string; method_id: string; status: string; started_at: string };
}

export async function cleanupTestData(userId: string) {
  const userOwnedTables = [
    "daily_logs",
    "sessions",
    "srs_states",
  ] as const;

  for (const table of userOwnedTables) {
    const { error } = await adminClient.from(table).delete().eq("user_id", userId);
    if (error) throw new Error(`${table} クリーンアップ失敗: ${error.message}`);
  }

  const { error: matErr } = await adminClient
    .from("materials")
    .delete()
    .eq("user_id", userId);
  if (matErr) throw new Error(`materials クリーンアップ失敗: ${matErr.message}`);

  const { error: subErr } = await adminClient
    .from("subjects")
    .delete()
    .eq("user_id", userId);
  if (subErr) throw new Error(`subjects クリーンアップ失敗: ${subErr.message}`);
}
```

- [ ] **Step 3: `tests/medium/setup.ts` を更新**

env 読み込みロジックは残し、`adminClient` と `createTestUser` 等を `tests/shared/db.ts` から re-export する形に変更。

```ts
import { readFileSync } from "node:fs";
import { resolve } from "node:path";

// .env.local から環境変数を読み込む (vitest は Next.js の env 自動読み込みを持たないため)
const envPath = resolve(process.cwd(), ".env.local");
try {
  const envContent = readFileSync(envPath, "utf-8");
  for (const line of envContent.split("\n")) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith("#")) continue;
    const eqIndex = trimmed.indexOf("=");
    if (eqIndex === -1) continue;
    const key = trimmed.slice(0, eqIndex);
    const value = trimmed.slice(eqIndex + 1).replace(/^["']|["']$/g, "");
    if (!process.env[key]) {
      process.env[key] = value;
    }
  }
} catch {
  // .env.local がない場合は環境変数が既に設定されている前提
}

// shared ヘルパーを re-export
export { adminClient, createTestUser, deleteTestUser, createUserClient } from "../shared/db";
```

- [ ] **Step 4: `tests/medium/helpers/db.ts` を更新**

既存のファクトリ関数を `tests/shared/helpers.ts` から re-export。

```ts
export {
  createTestSubject,
  createTestMaterial,
  createTestCard,
  getSrsMethodId,
  getWakefulRestMethodId,
  linkMaterialMethod,
  createTestSrsState,
  createTestSession,
  cleanupTestData,
} from "../../shared/helpers";
```

- [ ] **Step 5: Medium テストが引き続き通ることを確認**

```bash
cd /Users/mikiya/ws/kairous && bun test:medium
```

Expected: 全テスト PASS (既存の動作が壊れていないこと)

- [ ] **Step 6: コミット**

```bash
git add tests/shared/db.ts tests/shared/helpers.ts tests/medium/setup.ts tests/medium/helpers/db.ts
git commit -m "refactor: DB ヘルパーを tests/shared/ に抽出"
```

---

### Task 3: Playwright config と .gitignore

**Files:**
- Create: `tests/large/playwright.config.ts`
- Modify: `.gitignore`

- [ ] **Step 1: `tests/large/playwright.config.ts` を作成**

```ts
import { defineConfig, devices } from "@playwright/test";

export default defineConfig({
  testDir: ".",
  fullyParallel: true,
  forbidOnly: !!process.env.CI,
  retries: process.env.CI ? 2 : 0,
  workers: process.env.CI ? 1 : undefined,
  reporter: process.env.CI ? "github" : "html",

  use: {
    baseURL: "http://localhost:3000",
    screenshot: "only-on-failure",
    trace: "retain-on-failure",
  },

  projects: [
    {
      name: "setup",
      testMatch: /auth\.setup\.ts/,
    },
    {
      name: "chromium",
      use: {
        ...devices["Desktop Chrome"],
        storageState: "tests/large/.auth/user.json",
      },
      dependencies: ["setup"],
    },
  ],

  webServer: {
    command: process.env.CI ? "bun run build && bun run start" : "bun run dev",
    port: 3000,
    reuseExistingServer: !process.env.CI,
  },
});
```

- [ ] **Step 2: `.gitignore` に `tests/large/.auth/` を追加**

`.gitignore` の末尾に追加:

```
# Playwright
tests/large/.auth/
test-results/
playwright-report/
```

- [ ] **Step 3: コミット**

```bash
git add tests/large/playwright.config.ts .gitignore
git commit -m "chore: Playwright config と .gitignore 設定"
```

---

### Task 4: Global setup / teardown

**Files:**
- Create: `tests/large/global-setup.ts`
- Create: `tests/large/global-teardown.ts`
- Create: `tests/large/helpers/db.ts`

- [ ] **Step 1: `tests/large/helpers/db.ts` を作成**

Playwright テストから使う DB ヘルパー。`.env.local` の読み込みは `playwright.config.ts` の dotenv 機能ではなく、ここで明示的に行う (Playwright の global-setup は config の use 設定とは独立して動くため)。

```ts
import { readFileSync } from "node:fs";
import { resolve } from "node:path";

// .env.local から環境変数を読み込む
const envPath = resolve(process.cwd(), ".env.local");
try {
  const envContent = readFileSync(envPath, "utf-8");
  for (const line of envContent.split("\n")) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith("#")) continue;
    const eqIndex = trimmed.indexOf("=");
    if (eqIndex === -1) continue;
    const key = trimmed.slice(0, eqIndex);
    const value = trimmed.slice(eqIndex + 1).replace(/^["']|["']$/g, "");
    if (!process.env[key]) {
      process.env[key] = value;
    }
  }
} catch {
  // .env.local がない場合は環境変数が既に設定されている前提 (CI)
}

export { adminClient, createTestUser, deleteTestUser } from "../../shared/db";
export {
  createTestSubject,
  createTestMaterial,
  createTestCard,
  getSrsMethodId,
  getWakefulRestMethodId,
  linkMaterialMethod,
  createTestSrsState,
  createTestSession,
  cleanupTestData,
} from "../../shared/helpers";
```

- [ ] **Step 2: `tests/large/global-setup.ts` を作成**

テストユーザーを作成し、認証情報をファイルに書き出す。`auth.setup.ts` がこのファイルを読んでログインする。

```ts
import { writeFileSync, mkdirSync } from "node:fs";
import { resolve } from "node:path";
import { createTestUser } from "./helpers/db";

async function globalSetup() {
  const user = await createTestUser(
    `e2e-${Date.now()}@kairous.local`,
    "e2e-test-password-12345",
  );

  // auth.setup.ts と global-teardown.ts で使うためファイルに保存
  const authDir = resolve(__dirname, ".auth");
  mkdirSync(authDir, { recursive: true });
  writeFileSync(
    resolve(authDir, "test-user.json"),
    JSON.stringify(user),
  );
}

export default globalSetup;
```

- [ ] **Step 3: `tests/large/global-teardown.ts` を作成**

テストユーザーを削除する。

```ts
import { readFileSync, rmSync } from "node:fs";
import { resolve } from "node:path";
import { deleteTestUser } from "./helpers/db";

async function globalTeardown() {
  const userPath = resolve(__dirname, ".auth", "test-user.json");
  try {
    const user = JSON.parse(readFileSync(userPath, "utf-8"));
    await deleteTestUser(user.id);
  } catch {
    // ファイルがない場合はスキップ (テストが途中で失敗した可能性)
  }
}

export default globalTeardown;
```

- [ ] **Step 4: `playwright.config.ts` に global setup/teardown を追加**

`tests/large/playwright.config.ts` の `defineConfig` に追加:

```ts
  globalSetup: "./global-setup",
  globalTeardown: "./global-teardown",
```

`defineConfig({` の直後、`testDir` の前に追加する。Playwright は相対パスを config ファイルからの相対として解決するため、`require.resolve` は不要。

- [ ] **Step 5: コミット**

```bash
git add tests/large/helpers/db.ts tests/large/global-setup.ts tests/large/global-teardown.ts tests/large/playwright.config.ts
git commit -m "feat: Playwright global setup/teardown でテストユーザー管理"
```

---

### Task 5: Auth setup (storageState)

**Files:**
- Create: `tests/large/auth.setup.ts`

- [ ] **Step 1: `tests/large/auth.setup.ts` を作成**

UI からログインし、storageState を保存する。

```ts
import { test as setup, expect } from "@playwright/test";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";

const authFile = "tests/large/.auth/user.json";

setup("authenticate", async ({ page }) => {
  // global-setup で作成したテストユーザーの認証情報を読む
  const userPath = resolve(__dirname, ".auth", "test-user.json");
  const user = JSON.parse(readFileSync(userPath, "utf-8"));

  await page.goto("/auth/login");

  await page.getByLabel("メールアドレス").fill(user.email);
  await page.getByLabel("パスワード").fill(user.password);
  await page.getByRole("button", { name: "ログイン" }).click();

  // ホームページにリダイレクトされることを確認
  await expect(page).toHaveURL("/");

  // storageState を保存
  await page.context().storageState({ path: authFile });
});
```

- [ ] **Step 2: コミット**

```bash
git add tests/large/auth.setup.ts
git commit -m "feat: auth.setup.ts で storageState を保存"
```

---

### Task 6: スモークテスト

**Files:**
- Create: `tests/large/smoke.spec.ts`

- [ ] **Step 1: スモークテストを作成**

認証済み状態でホームページが表示されることを確認する。

```ts
import { test, expect } from "@playwright/test";

test("authenticated user sees today page", async ({ page }) => {
  await page.goto("/");

  // ホームページのタイトルが表示される
  await expect(page.getByText("今日の学習")).toBeVisible();
});
```

- [ ] **Step 2: ローカルで Supabase を起動 (未起動の場合)**

```bash
cd /Users/mikiya/ws/kairous && bunx supabase start -x realtime,storage,imgproxy,pgadmin-schema-diff,migra,studio,logflare,vector,supavisor
```

- [ ] **Step 3: テスト実行**

```bash
cd /Users/mikiya/ws/kairous && bun test:large
```

Expected: 1 test passed (smoke テスト)

login フォームのラベルが `メールアドレス` と一致しない場合は、`auth.setup.ts` のセレクタを実際のラベルに合わせて修正する。`page.getByLabel` は `<label>` の `for` 属性と `<input>` の `id` で紐づく。ラベルがない場合は `page.locator("#email")` にフォールバックする。

- [ ] **Step 4: コミット**

```bash
git add tests/large/smoke.spec.ts
git commit -m "test: Playwright スモークテスト追加"
```

---

### Task 7: CI ジョブ追加

**Files:**
- Modify: `.github/workflows/ci.yml`

- [ ] **Step 1: `test-large` ジョブを追加**

`.github/workflows/ci.yml` の末尾 (migration ジョブの後) に追加:

```yaml

  test-large:
    runs-on: ubuntu-latest
    needs: [test-medium]
    steps:
      - uses: actions/checkout@de0fac2e4500dabe0009e67214ff5f5447ce83dd # v6.0.2
      - uses: oven-sh/setup-bun@0c5077e51419868618aeaa5fe8019c62421857d6 # v2.2.0
        with:
          bun-version: "1.3.2"
      - uses: supabase/setup-cli@b60b5899c73b63a2d2d651b1e90db8d4c9392f51 # v1.6.0
        with:
          version: "2.76.7"
      - run: bun install --frozen-lockfile
      - name: Playwright ブラウザインストール
        run: bunx playwright install --with-deps chromium
      - name: Supabase ローカル起動 (Inbucket 含む)
        run: supabase start -x realtime,storage,imgproxy,pgadmin-schema-diff,migra,studio,logflare,vector,supavisor
      - name: 環境変数を設定
        run: |
          eval $(supabase status -o env | grep -E '^(API_URL|ANON_KEY|SERVICE_ROLE_KEY)=')
          echo "NEXT_PUBLIC_SUPABASE_URL=${API_URL}" >> $GITHUB_ENV
          echo "NEXT_PUBLIC_SUPABASE_ANON_KEY=${ANON_KEY}" >> $GITHUB_ENV
          echo "SUPABASE_SERVICE_ROLE_KEY=${SERVICE_ROLE_KEY}" >> $GITHUB_ENV
      - run: bun test:large
      - uses: actions/upload-artifact@ea165f8d65b6e75b540449e92b4886f43607fa02 # v4.6.2
        if: ${{ !cancelled() }}
        with:
          name: playwright-report
          path: |
            playwright-report/
            test-results/
          retention-days: 7
```

注意: `actions/upload-artifact` の SHA は v4.6.2 のもの。実装時に最新の SHA を確認すること。

- [ ] **Step 2: コミット**

```bash
git add .github/workflows/ci.yml
git commit -m "ci: Playwright E2E テストジョブを追加"
```

---

### Task 8: ドキュメント更新

**Files:**
- Modify: `.claude/rules/testing.md`

- [ ] **Step 1: `.claude/rules/testing.md` の Large テスト欄を更新**

現在:

```
| Large | tests/large/ | ブラウザ + Supabase | `bun test:large` (CI post-deploy) |
```

変更後:

```
| Large | tests/large/ | Playwright + Supabase ローカル | `bun test:large` (CI パイプライン内) |
```

- [ ] **Step 2: ルールセクションに Large テストの注意事項を追加**

`## ルール` セクションの末尾に追加:

```
- Large テストは Playwright (`tests/large/*.spec.ts`) で実行する
- テストデータは `tests/shared/helpers.ts` のファクトリ関数で作成し、テスト後にクリーンアップする
- ローカル実行時は Supabase ローカルと dev サーバーが起動していること
```

- [ ] **Step 3: コミット**

```bash
git add .claude/rules/testing.md
git commit -m "docs: Large テストの記述を Playwright に更新"
```

---

## 補足事項

### lefthook (pre-push) について

`lefthook.yml` の pre-push に `test:large` は追加しない。E2E テストは実行時間が長く (ブラウザ起動 + Next.js ビルド)、push のたびに実行するとフィードバックループが遅くなる。CI の `test-large` ジョブで品質を担保する。

### login フォームのセレクタ

現在の login ページ (`src/app/auth/login/page.tsx`) には `<label>` タグの `htmlFor` 属性で `id="email"`, `id="password"` と紐づいている。`page.getByLabel("メールアドレス")` が動作しない場合は、実際のラベルテキストを確認して修正する。ラベルがない場合は `page.locator("#email")` を使う。

### `__dirname` の互換性

Playwright は Node.js で実行されるため `__dirname` が利用可能。ESM の場合は `import.meta.dirname` (Node.js 21+) を使う。bun は両方サポートしている。
