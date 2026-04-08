# Stats + Wakeful Rest E2E Tests Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Stats ページと覚醒的休息 (Wakeful Rest) の E2E テストを追加する

**Architecture:** Stats テストは事前にテストデータ (session + daily_logs) を adminClient で投入し、ページ表示と期間切り替えを検証する。Rest テストは SRS セッション完了後のサマリーから覚醒的休息を起動し、`page.clock` でタイマーを高速化する。`playwright.config.ts` で `workers: 1` のため全テスト直列実行、データ競合なし。

**Tech Stack:** Playwright, Supabase adminClient, page.clock (Rest timer), Recharts (Stats charts)

---

## File Structure

```
tests/large/
  stats.spec.ts       # Create: Stats ページ E2E
  rest.spec.ts         # Create: 覚醒的休息 E2E
```

## UI フロー概要

### Stats

```
/stats (デフォルト period=7)
  サマリーカード: 学習時間, セッション, レビュー
  日別学習時間 チャート (Recharts BarChart)
  分野別 ドーナツチャート
  手法別 ドーナツチャート
  期間切り替え: "7日" / "30日" / "90日" ボタン
```

### Wakeful Rest

```
SRS セッション完了 → /session/[id]/summary
  → "安静タイマーを開始 (10分)" ボタン → createRestSession
→ /rest/[id] (RestTimer)
  SVG 円形プログレス + 残時間表示 + "安静タイマー" ラベル
  → page.clock で 10分 (REST_DURATION_SEC=600) を高速化
  → "安静完了" + "10 分間の安静が完了しました" + "ホームに戻る"
```

---

## Task 1: Stats ページ E2E テスト

**Files:**
- Create: `tests/large/stats.spec.ts`

**テストデータ:**
Stats ページは `getStats(period)` で取得したデータを表示する。テストデータとして completed セッション + daily_logs を投入する必要がある。

ただし、SRS セッション E2E テスト (session-srs.spec.ts) が先に実行されるため、そこで作成されたセッションの daily_logs が既に存在する可能性がある。Stats テストは独自のデータを作成し、afterAll でクリーンアップする。

Stats ページに表示されるデータは `daily_logs` テーブルに依存する。直接 daily_logs を insert するのが最もシンプル。

- [ ] **Step 1: stats.spec.ts を作成**

```typescript
// tests/large/stats.spec.ts
import { test, expect } from "@playwright/test";
import {
  adminClient,
  createTestSubject,
  createTestMaterial,
  getMethodIdBySlug,
  linkMaterialMethod,
  cleanupTestData,
} from "./helpers/db";
import { getTestUser } from "./helpers/types";

test.describe("Stats ページ", () => {
  let userId: string;

  test.beforeAll(async () => {
    const user = getTestUser();
    userId = user.id;

    // Stats に表示するデータを作成: subject → material → method link → daily_log
    // sessions テーブルは Stats ページのデータソースではないため省略
    const subject = await createTestSubject(userId, `E2E-Stats-${Date.now()}`);
    const material = await createTestMaterial(subject.id, userId, "Stats テスト教材");
    const srsMethodId = await getMethodIdBySlug("srs");
    await linkMaterialMethod(material.id, srsMethodId);

    // daily_log を作成 (Stats ページのデータソース)
    // テスト固有の subject を使うため UNIQUE(user_id, subject_id, method_id, log_date) 制約に衝突しない
    const today = new Date().toISOString().split("T")[0];
    const { error: logErr } = await adminClient
      .from("daily_logs")
      .insert({
        user_id: userId,
        subject_id: subject.id,
        method_id: srsMethodId,
        log_date: today,
        total_sec: 300,
        cards_reviewed: 5,
        session_count: 1,
      });
    if (logErr) throw new Error(`daily_log insert failed: ${logErr.message}`);
  });

  test.afterAll(async () => {
    await cleanupTestData(userId);
  });

  test("サマリーカードとチャートが表示される", async ({ page }) => {
    await page.goto("/stats");

    // サマリーカード
    await expect(page.getByText("学習時間")).toBeVisible();
    await expect(page.getByText("セッション")).toBeVisible();
    await expect(page.getByText("レビュー")).toBeVisible();

    // チャートセクション
    await expect(page.getByText("日別学習時間")).toBeVisible();
    await expect(page.getByText("分野別")).toBeVisible();
    await expect(page.getByText("手法別")).toBeVisible();

    // 投入したテストデータの分野名が凡例に表示される
    await expect(page.getByText(/E2E-Stats-/)).toBeVisible();
  });

  test("期間切り替えが機能する", async ({ page }) => {
    await page.goto("/stats");

    // デフォルトは 7日
    await expect(page.getByRole("button", { name: "7日" })).toBeVisible();

    // 30日に切り替え
    await page.getByRole("button", { name: "30日" }).click();
    await page.waitForURL(/period=30/);
    await expect(page.getByText("学習時間")).toBeVisible();

    // 90日に切り替え
    await page.getByRole("button", { name: "90日" }).click();
    await page.waitForURL(/period=90/);
    await expect(page.getByText("学習時間")).toBeVisible();
  });
});
```

- [ ] **Step 2: テスト実行**

Run: `bun test:large -- --grep "Stats ページ"`
Expected: PASS

- [ ] **Step 3: コミット**

```bash
git add tests/large/stats.spec.ts
git commit -m "test: Stats ページ E2E テスト追加"
```

---

## Task 2: 覚醒的休息 E2E テスト

**Files:**
- Create: `tests/large/rest.spec.ts`

**テストデータ:**
覚醒的休息は「セッション完了後のサマリーから起動」するフロー。SRS セッションを完了してサマリーページに遷移してから "安静タイマーを開始 (10分)" ボタンをクリックする。

前提:
- SRS セッション用のデータ (subject, material, card, SRS method, SRS state) が必要
- セッション完了後に /session/[id]/summary から /rest/[id] に遷移

RestTimer は `useCountdownTimer` (setInterval 1000ms) を使用。
REST_DURATION_SEC = 600 (10分)。
PBI 3 の Pomodoro テストで `page.clock.runFor` が有効なことを確認済み。

- [ ] **Step 1: rest.spec.ts を作成**

```typescript
// tests/large/rest.spec.ts
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
    const material = await createTestMaterial(subject.id, userId, "Rest テスト教材");
    materialId = material.id;
    const card = await createTestCard(material.id, "Rest表面", "Rest裏面", 0);
    const srsMethodId = await getMethodIdBySlug("srs");
    await linkMaterialMethod(material.id, srsMethodId);
    const yesterday = new Date(Date.now() - 86_400_000).toISOString();
    await createTestSrsState(card.id, userId, yesterday);
  });

  test.afterAll(async () => {
    await cleanupTestData(userId);
  });

  test("セッションサマリーから安静タイマーを起動して完了する", async ({ page }) => {
    // page.clock を install してタイマーを制御可能にする
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

    // Review → self-rating
    await page.waitForURL(/\/session\/[\w-]+\/review/, { timeout: 10_000 });
    await page.getByRole("button", { name: "おおむね理解できた" }).click();

    // Summary ページに到達
    await page.waitForURL(/\/session\/[\w-]+\/summary/, { timeout: 10_000 });
    await expect(page.getByText("セッション完了")).toBeVisible();

    // 安静タイマーを開始
    await page.getByRole("button", { name: /安静タイマーを開始/ }).click();
    await page.waitForURL(/\/rest\/[\w-]+$/, { timeout: 10_000 });

    // 安静タイマーが表示される
    await expect(page.getByText("安静タイマー")).toBeVisible();

    // 10分 (600秒) を高速化
    // ボタンクリック後の React 状態更新を待つため 2 段階で進める
    await page.clock.runFor(1_000);
    await page.clock.runFor((REST_DURATION_SEC - 1) * 1000);
    await expect(page.getByText("安静完了")).toBeVisible({ timeout: 10_000 });
    await expect(page.getByText(/10 分間の安静が完了しました/)).toBeVisible();

    // ホームに戻る
    await page.getByRole("button", { name: "ホームに戻る" }).click();
    await page.waitForURL("/", { timeout: 10_000 });
  });
});
```

- [ ] **Step 2: テスト実行**

Run: `bun test:large -- --grep "覚醒的休息"`
Expected: PASS

Note: Rest テストは SRS セッション完了を前提とするため、Edge Function が動作する必要がある。verify_jwt = false の設定が config.toml に反映されていること。

- [ ] **Step 3: コミット**

```bash
git add tests/large/rest.spec.ts
git commit -m "test: 覚醒的休息 E2E テスト追加"
```

---

## Troubleshooting

### Stats ページでデータが表示されない

`getStats(period)` は `daily_logs` テーブルから集計する。テストデータの `log_date` が指定期間内 (デフォルト 7 日) であることを確認。

### 安静タイマーが完了しない

Pomodoro と同じく `useCountdownTimer` (setInterval 1000ms) を使用。`page.clock.runFor` で 600 回のティックを処理する。タイムアウトする場合は timeout を増やすか、小刻みに runFor を実行。

### "安静タイマーを開始" ボタンが表示されない

`summary-actions.tsx` で `SummaryActions` コンポーネントが常にこのボタンを表示する。表示されない場合はサマリーページへの遷移が失敗している可能性。
