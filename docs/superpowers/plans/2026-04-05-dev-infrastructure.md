# Kairous 開発基盤計画

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** サブエージェントチーム構成、開発ルール、カスタムスキル、テスト戦略（Small/Medium/Large）を定義し、品質を担保する開発基盤を構築する。

**Architecture:** AGENTS.md でチーム役割を定義。.claude/skills/ にカスタムスキルを配置。テスト戦略は Google Testing Blog の Small/Medium/Large 分類に準拠。

**Tech Stack:** Claude Code (skills, hooks, AGENTS.md), vitest, Supabase CLI (local), chrome-devtools MCP

---

## テスト戦略: Small / Medium / Large

| 分類 | 範囲 | 外部依存 | 実行時間 | 実行タイミング |
|------|------|----------|----------|----------------|
| Small | 単一関数・コンポーネント | なし（全てモック） | <100ms/件 | pre-commit |
| Medium | Server Action + DB | Supabase ローカル | <5s/件 | CI |
| Large | ブラウザ E2E | Supabase + ブラウザ | <30s/件 | CI (post-deploy) |

### Small テスト
- **ツール:** vitest + jsdom + @testing-library/react
- **対象:** React コンポーネント、ユーティリティ関数、型変換、定数
- **ルール:** ネットワーク・DB・ファイルシステムにアクセスしない。Supabase クライアントは必ずモック
- **配置:** `tests/small/`
- **実行:** `bun test:small` (vitest --project small)

### Medium テスト
- **ツール:** vitest + Supabase ローカル（実DB）
- **対象:** Server Actions、RLS ポリシー、Edge Functions、DB操作
- **ルール:** Supabase ローカルに接続。テストごとにトランザクションでロールバック
- **配置:** `tests/medium/`
- **実行:** `bun test:medium` (vitest --project medium)
- **前提:** `bunx supabase start` が実行済み

### Large テスト
- **ツール:** chrome-devtools MCP（ブラウザ操作）
- **対象:** 主要ユーザーフロー（教材追加→セッション→完了）
- **ルール:** dev サーバー + Supabase ローカルが起動済み。テスト用ユーザーを使用
- **配置:** `tests/large/`
- **実行:** `bun test:large` (カスタムスクリプト)
- **対象フロー:**
  1. サインアップ → ログイン → リダイレクト確認
  2. 教材追加 → 手法紐付け → カード追加
  3. 今日タブ → セッション開始 → 自己評価 → サマリー

---

## チーム構成（サブエージェント）

| 役割 | 責務 | サブエージェント種別 | 使用ツール |
|------|------|---------------------|-----------|
| Developer | TDD でコード実装 | worktree agent | Edit, Write, Bash, Grep |
| Reviewer | コードレビュー（品質・セキュリティ） | code-reviewer | Read, Grep, Glob |
| PO (Product Owner) | spec との整合性、ユーザー価値の検証 | general-purpose | Read, spec ファイル参照 |
| Tester | テスト実行・結果分析 | test-runner | Bash, Read |
| User | ブラウザでの操作確認、UX検証 | chrome-devtools MCP | navigate, click, screenshot |

### ワークフロー

```
1. Developer: タスクのコードを TDD で実装（worktree 隔離）
2. Tester: Small テストを実行、結果を報告
3. Reviewer: コードレビュー（品質・セキュリティ・spec 整合性）
4. Developer: レビュー指摘を修正
5. PO: spec との整合性を最終確認
6. User: Large テスト対象のタスクならブラウザで動作確認
7. マージ判定
```

---

## File Structure

```
.claude/
  skills/
    dev-review.md          # 開発者向けセルフレビュースキル
    run-tests.md           # テスト実行スキル（small/medium/large 切り替え）
    check-spec.md          # spec 整合性チェックスキル
AGENTS.md                  # チーム役割定義
tests/
  small/                   # Small テスト（ユニット）
    setup.ts               # jsdom セットアップ
    components/            # コンポーネントテスト
    lib/                   # ユーティリティテスト
  medium/                  # Medium テスト（統合）
    setup.ts               # Supabase ローカル接続セットアップ
    helpers/
      db.ts                # テスト用DB操作ヘルパー
    actions/               # Server Action テスト
    rls/                   # RLS ポリシーテスト
  large/                   # Large テスト（E2E）
    flows/                 # ユーザーフローテスト
vitest.workspace.ts        # ワークスペース設定（small/medium/large）
```

---

### Task 1: AGENTS.md の作成

**Files:**
- Create: `AGENTS.md`

- [ ] **Step 1: AGENTS.md を作成**

```markdown
# Kairous サブエージェントチーム

## 共通ルール

- コメントは日本語で記載する（変数名・関数名は英語。このプロジェクト固有のルール）
- TODO は書かない。今すぐ解消するか、GitHub Issue を作成する
- エラー・警告の握りつぶし禁止（|| true, continue-on-error, 空の catch は使わない）
- ライブラリを活用し自作を最小限にする（zod, date-fns, ts-fsrs, Radix UI, lucide-react）
- 同じロジックが2箇所で重複したら共通化を検討、3箇所なら必須
- 定数は src/lib/constants.ts に集約
- 型定義は src/lib/types/database.ts（自動生成）を single source of truth とする

## Developer（開発者）

### 役割
TDD（Red → Green → Refactor）でコードを実装する。

### ルール
- 新機能はテストから書く。バグ修正は再現テストから書く
- 1テスト1アサーション、テスト内に if/for を書かない、Arrange-Act-Assert
- Small テストはネットワーク・DB アクセス禁止（全てモック）
- Medium テストは Supabase ローカルに接続（実DB）
- コミットは小さく。Conventional Commits: `<type>: <日本語の説明>`
- 実装前に既存コードのパターンを確認する

### 参照ドキュメント
- `CLAUDE.md` -- 技術スタック・設計判断
- `docs/superpowers/specs/` -- 画面フロー設計
- `docs/superpowers/plans/` -- 実装計画

## Reviewer（レビュアー）

### 役割
コードの品質・セキュリティ・spec との整合性をレビューする。

### チェックリスト
- [ ] spec の要件を満たしているか
- [ ] テストが適切か（Small/Medium の分類が正しいか、カバレッジ）
- [ ] セキュリティ: RLS ポリシー漏れ、入力バリデーション、環境変数の露出
- [ ] パフォーマンス: 不要な再レンダリング、N+1 クエリ
- [ ] エラーハンドリング: 握りつぶしがないか、ユーザーへのフィードバック
- [ ] DRY: 重複コードがないか
- [ ] コメント: 日本語か、Why を説明しているか
- [ ] TODO が残っていないか

### 重大度分類
- **重大（必須修正）:** セキュリティ脆弱性、データ不整合、spec 違反
- **警告（推奨修正）:** パフォーマンス、可読性、テスト不足
- **情報（任意）:** スタイル、命名の改善提案

## PO（プロダクトオーナー）

### 役割
ユーザー価値と設計意図の番人。実装が学習科学の根拠に沿っているか検証する。

### チェックリスト
- [ ] 学習科学的根拠（docs/kairous-design.md）に沿った UX か
- [ ] 流暢性の錯覚を防ぐ設計になっているか（自己評価の強制など）
- [ ] material_methods の核心構造が壊れていないか
- [ ] ユーザーの学習体験を損なう妥協がないか
- [ ] モバイルファーストのレスポンシブ設計を維持しているか

## Tester（テスター）

### 役割
テストの実行と結果分析。テストの品質（分類の正しさ、カバレッジ）を監視する。

### ルール
- Small テスト: `bun test:small` -- pre-commit で全件パスすること
- Medium テスト: `bun test:medium` -- CI で全件パスすること
- Large テスト: `bun test:large` -- 主要フローが動作すること
- テスト失敗時はエラーメッセージを分析し、原因を特定して報告する
- テストのフレーク（不安定なテスト）を検出したら即座に報告する

## User（利用者）

### 役割
ブラウザでの動作確認と UX 検証。chrome-devtools MCP を使用。

### 確認項目
- [ ] 画面遷移が spec のフロー通りか
- [ ] モバイル表示（375px）で BottomNav が正しく表示されるか
- [ ] PC 表示（1024px）で Sidebar が正しく表示されるか
- [ ] フォームの入力・送信が正常に動作するか
- [ ] エラー時にユーザーにフィードバックが表示されるか
- [ ] Lighthouse スコア（Performance > 90, Accessibility > 90）
```

- [ ] **Step 2: コミット**

```bash
git add AGENTS.md
git commit -m "docs: AGENTS.md サブエージェントチーム定義"
```

---

### Task 2: テスト基盤の設定

**Files:**
- Create: `vitest.workspace.ts`, `tests/small/setup.ts`, `tests/medium/setup.ts`, `tests/medium/helpers/db.ts`
- Modify: `package.json`

- [ ] **Step 1: vitest ワークスペースを作成**

```ts
// vitest.workspace.ts
import { defineWorkspace } from "vitest/config";

export default defineWorkspace([
  {
    extends: "./vitest.config.ts",
    test: {
      name: "small",
      include: ["tests/small/**/*.test.{ts,tsx}"],
      environment: "jsdom",
      setupFiles: ["./tests/small/setup.ts"],
    },
  },
  {
    extends: "./vitest.config.ts",
    test: {
      name: "medium",
      include: ["tests/medium/**/*.test.{ts,tsx}"],
      environment: "node",
      setupFiles: ["./tests/medium/setup.ts"],
      // Medium テストは並列実行しない（DB状態の競合を防ぐ）
      pool: "forks",
      poolOptions: { forks: { singleFork: true } },
    },
  },
]);
```

- [ ] **Step 2: Small テストのセットアップを作成**

```ts
// tests/small/setup.ts
import "@testing-library/jest-dom/vitest";
```

- [ ] **Step 3: Medium テストのセットアップを作成**

```ts
// tests/medium/setup.ts
import { createClient } from "@supabase/supabase-js";
import type { Database } from "@/lib/types/database";

// Medium テストは Supabase ローカルに接続
const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

if (!supabaseUrl) {
  throw new Error(
    "NEXT_PUBLIC_SUPABASE_URL が未設定。Supabase ローカルが起動しているか確認: bunx supabase start",
  );
}
if (!serviceRoleKey) {
  throw new Error(
    "SUPABASE_SERVICE_ROLE_KEY が未設定。.env.local を確認",
  );
}

// service_role クライアント（RLS バイパス、テストデータ操作用）
export const adminClient = createClient<Database>(supabaseUrl, serviceRoleKey);

// テスト用ユーザーの作成・取得・削除ヘルパー
export async function createTestUser(): Promise<string> {
  const { data, error } = await adminClient.auth.admin.createUser({
    email: `test-${Date.now()}@kairous.local`,
    password: "test-password-12345",
    email_confirm: true,
    user_metadata: { display_name: "Test User" },
  });
  if (error) throw new Error(`テストユーザー作成失敗: ${error.message}`);
  return data.user.id;
}

export async function deleteTestUser(userId: string): Promise<void> {
  const { error } = await adminClient.auth.admin.deleteUser(userId);
  if (error) throw new Error(`テストユーザー削除失敗: ${error.message}`);
}
```

- [ ] **Step 4: Medium テスト用 DB ヘルパーを作成**

```ts
// tests/medium/helpers/db.ts
import { adminClient } from "../setup";

// テストデータ作成ヘルパー
export async function createTestSubject(userId: string, name = "テスト分野") {
  const { data, error } = await adminClient
    .from("subjects")
    .insert({ user_id: userId, name, color: "#6366f1" })
    .select()
    .single();
  if (error) throw new Error(`テスト分野作成失敗: ${error.message}`);
  return data;
}

export async function createTestMaterial(
  subjectId: string,
  userId: string,
  title = "テスト教材",
) {
  const { data, error } = await adminClient
    .from("materials")
    .insert({ subject_id: subjectId, user_id: userId, title })
    .select()
    .single();
  if (error) throw new Error(`テスト教材作成失敗: ${error.message}`);
  return data;
}

// テストデータ全削除（テスト間の独立性を保証）
// 外部キー制約の順序: 子テーブル → 親テーブル
export async function cleanupTestData(userId: string) {
  // user_id を直接持つテーブル
  const userOwnedTables = [
    "daily_logs",
    "sessions",       // card_reviews, session_materials は CASCADE で連鎖削除
    "srs_states",
  ] as const;

  for (const table of userOwnedTables) {
    const { error } = await adminClient.from(table).delete().eq("user_id", userId);
    if (error) throw new Error(`${table} クリーンアップ失敗: ${error.message}`);
  }

  // materials 経由で削除（cards, material_methods は CASCADE で連鎖削除）
  const { error: matErr } = await adminClient
    .from("materials")
    .delete()
    .eq("user_id", userId);
  if (matErr) throw new Error(`materials クリーンアップ失敗: ${matErr.message}`);

  // subjects 削除（materials は上で削除済み）
  const { error: subErr } = await adminClient
    .from("subjects")
    .delete()
    .eq("user_id", userId);
  if (subErr) throw new Error(`subjects クリーンアップ失敗: ${subErr.message}`);
}
```

- [ ] **Step 5: package.json の scripts を更新**

```json
{
  "scripts": {
    "dev": "next dev --turbopack",
    "build": "next build",
    "start": "next start",
    "lint": "next lint",
    "typecheck": "tsc --noEmit",
    "test": "vitest run",
    "test:small": "vitest run --project small",
    "test:medium": "vitest run --project medium",
    "test:large": "echo 'Large テストは chrome-devtools MCP 経由で実行。/run-tests large を使用'",
    "test:watch": "vitest",
    "check": "bun run lint && bun run typecheck && bun test:small",
    "prepare": "lefthook install"
  }
}
```

- [ ] **Step 6: コミット**

```bash
git add vitest.workspace.ts tests/small/setup.ts tests/medium/setup.ts tests/medium/helpers/db.ts package.json
git commit -m "feat: テスト基盤（Small/Medium ワークスペース分離）"
```

---

### Task 3: lefthook をテスト戦略に合わせて更新

**Files:**
- Modify: `lefthook.yml`

- [ ] **Step 1: lefthook.yml を更新**

```yaml
# lefthook.yml
pre-commit:
  parallel: true
  commands:
    lint:
      run: bun run lint --quiet
    typecheck:
      run: bun run typecheck
    test-small:
      # pre-commit では Small テストのみ実行（高速）
      run: bun test:small

pre-push:
  commands:
    full-check:
      # pre-push では Small + Medium テストを実行
      run: bun run lint && bun run typecheck && bun test:small && bun test:medium
```

- [ ] **Step 2: コミット**

```bash
git add lefthook.yml
git commit -m "chore: lefthook を Small/Medium テスト分離に対応"
```

---

### Task 4: CI をテスト戦略に合わせて更新

**Files:**
- Modify: `.github/workflows/ci.yml`

- [ ] **Step 1: ci.yml のテストジョブを Small/Medium に分離**

```yaml
# .github/workflows/ci.yml
name: CI

on:
  push:
    branches: [main]
  pull_request:
    branches: [main]

concurrency:
  group: ${{ github.workflow }}-${{ github.ref }}
  cancel-in-progress: true

permissions:
  contents: read

jobs:
  lint-and-typecheck:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@11bd71901bbe5b1630ceea73d27597364c9af683 # v4.2.2
      - uses: oven-sh/setup-bun@735343b667d3e6f658f44d0eca948eb6282f2b76 # v2.0.2
        with:
          bun-version: latest
      - run: bun install --frozen-lockfile
      - run: bun run lint
      - run: bun run typecheck

  test-small:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@11bd71901bbe5b1630ceea73d27597364c9af683 # v4.2.2
      - uses: oven-sh/setup-bun@735343b667d3e6f658f44d0eca948eb6282f2b76 # v2.0.2
        with:
          bun-version: latest
      - run: bun install --frozen-lockfile
      - run: bun test:small

  test-medium:
    runs-on: ubuntu-latest
    needs: [test-small]
    steps:
      - uses: actions/checkout@11bd71901bbe5b1630ceea73d27597364c9af683 # v4.2.2
      - uses: oven-sh/setup-bun@735343b667d3e6f658f44d0eca948eb6282f2b76 # v2.0.2
        with:
          bun-version: latest
      - uses: supabase/setup-cli@1ef5e2b957e73830008a28dba77c5f30cfcb7fbb # v1.4.2
        with:
          version: latest
      - run: bun install --frozen-lockfile
      - name: Supabase ローカル起動
        run: supabase start -x realtime,storage,imgproxy,inbucket,pgadmin-schema-diff,migra,studio,edge-runtime,logflare,vector,supavisor
      - name: 環境変数を設定
        run: |
          # supabase status の JSON キー名はバージョンで変動するため、個別に取得
          SUPABASE_URL=$(supabase status -o env | grep API_URL | cut -d= -f2-)
          ANON_KEY=$(supabase status -o env | grep ANON_KEY | cut -d= -f2-)
          SERVICE_KEY=$(supabase status -o env | grep SERVICE_ROLE_KEY | cut -d= -f2-)
          echo "NEXT_PUBLIC_SUPABASE_URL=${SUPABASE_URL}" >> $GITHUB_ENV
          echo "NEXT_PUBLIC_SUPABASE_ANON_KEY=${ANON_KEY}" >> $GITHUB_ENV
          echo "SUPABASE_SERVICE_ROLE_KEY=${SERVICE_KEY}" >> $GITHUB_ENV
      - run: bun test:medium

  migration:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@11bd71901bbe5b1630ceea73d27597364c9af683 # v4.2.2
      - uses: supabase/setup-cli@1ef5e2b957e73830008a28dba77c5f30cfcb7fbb # v1.4.2
        with:
          version: latest
      - name: Supabase ローカル起動
        run: supabase start -x realtime,storage,imgproxy,inbucket,pgadmin-schema-diff,migra,studio,edge-runtime,logflare,vector,supavisor
      - name: マイグレーション検証
        run: supabase db lint
```

- [ ] **Step 2: コミット**

```bash
git add .github/workflows/ci.yml
git commit -m "chore: CI を Small/Medium テスト分離に対応"
```

---

### Task 5: カスタムスキルの作成

**Files:**
- Create: `.claude/skills/dev-review.md`, `.claude/skills/run-tests.md`, `.claude/skills/check-spec.md`

- [ ] **Step 1: 開発者セルフレビュースキルを作成**

```markdown
---
name: dev-review
description: 実装完了後のセルフレビューチェックリスト。コミット前に実行する
---

## セルフレビューチェックリスト

コミット前に以下を確認する。

### コード品質
- [ ] TODO が残っていないか（残っていれば Issue 化する）
- [ ] エラー・警告を握りつぶしていないか
- [ ] 重複コードがないか（2箇所で検討、3箇所で必須共通化）
- [ ] コメントは日本語で Why を説明しているか
- [ ] 定数が constants.ts に集約されているか

### セキュリティ
- [ ] 環境変数がクライアントに露出していないか
- [ ] ユーザー入力のバリデーション（zod）が入っているか
- [ ] RLS ポリシーが新規テーブルに定義されているか
- [ ] 生 SQL を使っていないか（Supabase クライアント経由のみ）

### テスト
- [ ] 新機能にテストが書かれているか
- [ ] テストの分類が正しいか（Small: モックのみ / Medium: 実DB）
- [ ] `bun test:small` が全件パスするか

### spec 整合性
- [ ] 実装が spec の要件を満たしているか
- [ ] データモデルの変更が spec と一致しているか
```

- [ ] **Step 2: テスト実行スキルを作成**

```markdown
---
name: run-tests
description: テストを実行して結果を報告する。引数で small/medium/large/all を指定
---

## テスト実行

引数に応じてテストを実行する。

### 実行コマンド

- `small` (デフォルト): `bun test:small`
- `medium`: `bun test:medium` (要: Supabase ローカル起動)
- `large`: `bun test:large` (要: dev サーバー + Supabase ローカル)
- `all`: small → medium の順に実行

### 実行手順

1. 指定されたテストスイートを実行する
2. 結果を解析する:
   - パス件数 / 失敗件数 / スキップ件数
   - 失敗したテストの名前とエラーメッセージ
3. 失敗がある場合:
   - エラーメッセージを分析して原因を特定する
   - 修正方針を提案する
4. 全件パスした場合:
   - 「全件パス」と報告する

### Medium テストの前提条件

Medium テストは Supabase ローカルが起動済みであること。
起動していない場合は以下を実行:

```bash
bunx supabase start
```
```

- [ ] **Step 3: spec 整合性チェックスキルを作成**

```markdown
---
name: check-spec
description: 実装が spec の要件を満たしているか検証する。PO 役のサブエージェントが使用
---

## Spec 整合性チェック

### 手順

1. spec ファイルを読む: `docs/superpowers/specs/2026-04-05-screen-flow-design.md`
2. 現在の実装状態を確認する（ファイル構造、コンポーネント、DB スキーマ）
3. 以下の観点で整合性を検証する:

### チェック項目

#### ページ構成
- [ ] spec のページ一覧（12ページ）が全て実装されているか
- [ ] URL が spec 通りか
- [ ] コンポーネント名が spec 通りか

#### データモデル
- [ ] sessions.material_id が NULL 許容か
- [ ] sessions.self_rating が実装されているか
- [ ] session_materials テーブルが存在するか
- [ ] daily_logs.method_id が追加されているか

#### 画面遷移
- [ ] フローB（通常セッション）の遷移が正しいか
- [ ] フローC（インターリービング）の導線があるか
- [ ] フローD（覚醒的休息）の URL が /rest/[id] か

#### 設計制約
- [ ] material_methods の構造が壊れていないか
- [ ] FSRS がクライアント計算されていないか
- [ ] daily_logs がリアルタイム集計されていないか
- [ ] self_rating が学習系手法で必須になっているか
- [ ] 覚醒的休息が「任意」の起動になっているか

### 報告形式

| カテゴリ | 項目 | 状態 | 備考 |
|----------|------|------|------|
| ページ | / (今日) | OK/NG | ... |
```

- [ ] **Step 4: コミット**

```bash
git add .claude/skills/
git commit -m "feat: カスタムスキル（dev-review, run-tests, check-spec）"
```

---

### Task 6: CLAUDE.md にテスト戦略と開発ルールを追記

**Files:**
- Modify: `CLAUDE.md`

- [ ] **Step 1: CLAUDE.md にテスト戦略セクションを追記**

CLAUDE.md に以下を追加:

```markdown
## Test Strategy (Small / Medium / Large)

| 分類 | 配置 | 外部依存 | 実行 |
|------|------|----------|------|
| Small | tests/small/ | なし（全モック） | `bun test:small` (pre-commit) |
| Medium | tests/medium/ | Supabase ローカル | `bun test:medium` (CI) |
| Large | tests/large/ | ブラウザ + Supabase | `bun test:large` (CI post-deploy) |

### ルール
- 新規コードには必ずテストを書く
- テストの分類を間違えない（DB アクセスがあれば Medium、なければ Small）
- Small テストで Supabase クライアントを直接呼ばない（必ずモック）
- Medium テストはテストごとにデータをクリーンアップする
- フレーク（不安定なテスト）を見つけたら即座に修正する

## Code Quality Rules

- コメントは日本語。Why を書く（What は書かない）
- TODO 禁止。今すぐ解消するか GitHub Issue を作成する
- エラー・警告の握りつぶし禁止
- 同じロジックの重複: 2箇所で検討、3箇所で必須共通化
- 定数は `src/lib/constants.ts` に集約
- 型は `src/lib/types/database.ts`（自動生成）が single source of truth
```

- [ ] **Step 2: コミット**

```bash
git add CLAUDE.md
git commit -m "docs: テスト戦略（Small/Medium/Large）と品質ルールを CLAUDE.md に追記"
```

---

### Task 7: PROGRESS.md を更新

**Files:**
- Modify: `PROGRESS.md`

- [ ] **Step 1: PROGRESS.md を更新**

```markdown
# Kairous Progress

## Step 0: Dev Infrastructure -- DONE (2026-04-05)

- AGENTS.md: 5つの役割（Developer, Reviewer, PO, Tester, User）
- テスト戦略: Small/Medium/Large の3段階
- カスタムスキル: dev-review, run-tests, check-spec
- Plan: docs/superpowers/plans/2026-04-05-dev-infrastructure.md

## Step 1: Screen Flow Design -- DONE (2026-04-05)

- Spec: docs/superpowers/specs/2026-04-05-screen-flow-design.md

## Step 2: Foundation (Project + DB + Auth + Layout) -- PENDING

- Plan: docs/superpowers/plans/2026-04-05-foundation.md

## Step 3: Core Features (Materials + Sessions + FSRS) -- PENDING

## Step 4: Dashboard & Polish (Stats + Wakeful Rest + Interleaving) -- PENDING
```

- [ ] **Step 2: コミット**

```bash
git add PROGRESS.md
git commit -m "docs: PROGRESS.md を Step 0 (Dev Infrastructure) 追加で更新"
```

---

### Task 8: GitHub リポジトリとプロジェクト (PBI管理) のセットアップ

**Files:**
- なし（gh コマンドで GitHub 上に作成）

- [ ] **Step 1: GitHub リポジトリを作成**

```bash
cd /Users/mikiya/ws/kairous
git remote get-url origin 2>/dev/null || gh repo create kairous --private --source=. --push
```

- [ ] **Step 2: GitHub Projects を作成（PBI管理用）**

```bash
gh project create --title "Kairous Product Backlog" --owner @me
```

出力されるプロジェクト番号を控える。

- [ ] **Step 3: PBI の初期アイテムを登録**

```bash
# Sprint 1: Foundation（gh project item-create でドラフトアイテムを作成）
gh project item-create <PROJECT_NUMBER> --owner @me --title "プロジェクトセットアップ（Next.js + Supabase）"
gh project item-create <PROJECT_NUMBER> --owner @me --title "DB マイグレーション（コアドメイン + セッション + RLS）"
gh project item-create <PROJECT_NUMBER> --owner @me --title "learning_methods シードデータ"
gh project item-create <PROJECT_NUMBER> --owner @me --title "Supabase クライアント + Auth middleware"
gh project item-create <PROJECT_NUMBER> --owner @me --title "認証ページ（ログイン・サインアップ）"
gh project item-create <PROJECT_NUMBER> --owner @me --title "ナビゲーション + レイアウト"
gh project item-create <PROJECT_NUMBER> --owner @me --title "セキュリティ基盤（ヘッダー・env・サプライチェーン）"
```

注: ドラフトアイテムは後から GitHub Issue に変換し、実装計画のタスク番号を本文に記載する。

- [ ] **Step 4: コミット不要（GitHub 上の操作のみ）**

---

### Task 9: ブランチ戦略と PR テンプレートの作成

**Files:**
- Create: `.github/pull_request_template.md`, `.github/ISSUE_TEMPLATE/bug.md`, `.github/ISSUE_TEMPLATE/feature.md`

- [ ] **Step 1: PR テンプレートを作成**

```markdown
<!-- .github/pull_request_template.md -->

## 概要

<!-- この PR で何を変更したか、1-3 行で -->

## 変更内容

<!-- 主要な変更点をリストで -->

-

## テスト

- [ ] Small テスト (`bun test:small`) パス
- [ ] Medium テスト (`bun test:medium`) パス（DB 変更がある場合）
- [ ] 手動確認（該当する場合）

## チェックリスト

- [ ] コメントは日本語で Why を説明している
- [ ] TODO が残っていない
- [ ] エラー・警告を握りつぶしていない
- [ ] 重複コードがない
- [ ] spec と整合している

## 関連 Issue

<!-- closes #123 -->
```

- [ ] **Step 2: Issue テンプレート（バグ）を作成**

```markdown
---
name: バグ報告
about: バグの報告
labels: bug
---

## 現象

<!-- 何が起きているか -->

## 再現手順

1.
2.
3.

## 期待する動作

<!-- 本来どうあるべきか -->

## 環境

- ブラウザ:
- デバイス: モバイル / PC
```

- [ ] **Step 3: Issue テンプレート（機能）を作成**

```markdown
---
name: 機能リクエスト
about: 新機能の提案
labels: enhancement
---

## 概要

<!-- 何を実現したいか -->

## 学習科学的根拠

<!-- docs/kairous-design.md のどの知見に基づくか（該当する場合） -->

## 受け入れ条件

- [ ]
```

- [ ] **Step 4: ブランチ保護ルールを設定**

```bash
# main ブランチの保護ルールを設定
OWNER=$(gh repo view --json owner -q .owner.login)
REPO=$(gh repo view --json name -q .name)

gh api "repos/${OWNER}/${REPO}/branches/main/protection" \
  -X PUT \
  --input - <<'EOF'
{
  "required_status_checks": {
    "strict": true,
    "contexts": ["lint-and-typecheck", "test-small", "test-medium", "migration"]
  },
  "enforce_admins": false,
  "required_pull_request_reviews": {
    "required_approving_review_count": 0
  },
  "restrictions": null
}
EOF
```

注: 個人リポジトリでは `required_approving_review_count: 0` とし、セルフレビュー（code-reviewer サブエージェント）で代替する。

- [ ] **Step 5: コミット**

```bash
git add .github/pull_request_template.md .github/ISSUE_TEMPLATE/
git commit -m "chore: PR テンプレート・Issue テンプレート・ブランチ保護"
```

---

### Task 10: スクラムワークフローを AGENTS.md に追記

**Files:**
- Modify: `AGENTS.md`

- [ ] **Step 1: AGENTS.md にスクラムワークフローを追記**

AGENTS.md の末尾に以下を追加:

```markdown
## スクラムワークフロー

### スプリントサイクル

1. **計画（Plan）:** PBI から今スプリントのタスクを選択。GitHub Projects で管理
2. **実装（Dev）:** Developer が TDD で実装（feat/ ブランチ）
3. **レビュー（Review）:** Reviewer + PO がコードレビュー
4. **テスト（Test）:** Tester が Small/Medium テストを実行
5. **確認（User）:** User がブラウザで動作確認（Large テスト対象のみ）
6. **マージ:** CI 全緑 + レビュー完了で main にマージ

### ブランチ戦略

| ブランチ | 用途 | マージ先 |
|----------|------|----------|
| `main` | 常にデプロイ可能 | - |
| `feat/<name>` | 新機能 | main (PR) |
| `fix/<name>` | バグ修正 | main (PR) |

### PR ルール

- PR タイトル: Conventional Commits 形式 (`feat: 認証ページの追加`)
- CI が全て緑であること（lint + typecheck + test-small + test-medium + migration）
- code-reviewer サブエージェントでセルフレビューを実施
- check-spec スキルで spec との整合性を確認
- マージ方法: Squash merge

### PBI 管理

- GitHub Projects で Product Backlog を管理
- 各 PBI は GitHub Issue として作成
- Issue には `bug` / `enhancement` ラベルを付与
- 実装計画（docs/superpowers/plans/）のタスクと PBI を紐付ける
```

- [ ] **Step 2: コミット**

```bash
git add AGENTS.md
git commit -m "docs: スクラムワークフロー・ブランチ戦略・PR ルールを AGENTS.md に追記"
```
