# Playwright E2E テスト設計

Epic: #115

## 概要

Playwright を導入し、主要学習フローの E2E テスト (Large テスト) を整備する。Playwright を基盤としつつ、探索的テストでは chrome-devtools MCP を併用するハイブリッド方針。

## 技術方針

### フレームワーク

- Playwright (`@playwright/test`)
- テストファイル: `tests/large/**/*.spec.ts`
- ブラウザ: Chromium (ヘッドレス)。必要に応じて Firefox/WebKit を追加

### 認証戦略

Playwright の `storageState` パターンを採用。

1. `auth.setup.ts` で `adminClient.auth.admin.createUser()` によりテストユーザーを作成 (Medium テストと同じパターン)
2. 作成したユーザーで UI からログインし、`storageState` をファイルに保存 (`tests/large/.auth/user.json`、gitignore 対象)
3. 以降のテストは保存済み storageState を読み込み、認証済み状態で開始
4. サインアップフローは個別テスト (`auth.spec.ts`) として独立実行
5. テスト終了後にテストユーザーを `adminClient.auth.admin.deleteUser()` で削除 (global teardown)

テストユーザーのメールアドレスは `e2e-{timestamp}@kairous.local` の形式で、テスト実行ごとに一意。`email_confirm: true` でメール確認をスキップし、即座にログイン可能な状態で作成する。

### メール確認テスト

サインアップテスト (`auth.spec.ts`) では Supabase ローカルの Inbucket を使用してメール確認フローを検証する。CI の `supabase start` で Inbucket を除外しない。Inbucket REST API (`http://localhost:54324`) でメールを取得し、確認リンクをクリックする。

### テストデータ戦略

service_role キーで DB を直接操作。共通ヘルパーを `tests/shared/` に抽出し、Medium と Large の両方から参照する。

- **セットアップ**: テスト前に `adminClient` で必要なデータを作成
- **クリーンアップ**: テスト後に `cleanupTestData()` で全削除
- **独立性**: 各テストスイートが自分のデータを管理。テスト間の依存なし

共通化の構成:

```
tests/
  shared/
    db.ts          # adminClient 初期化、テストユーザー管理 (process.env から値を取得するのみ)
    helpers.ts     # createTestSubject, createTestMaterial 等のファクトリ関数
  medium/
    setup.ts       # .env.local 読み込み + tests/shared/db.ts を import
    helpers/
      db.ts        # tests/shared/helpers.ts を re-export (既存コードの互換性)
  large/
    ...            # helpers/db.ts で loadEnvLocal() を呼び出し .env.local を読み込み
```

環境変数 (`.env.local`) の読み込み責務は各テスト層に委ねる。`tests/shared/` は `process.env` から値を取得するのみとし、env ファイルの読み込みロジックを含めない。共通の `loadEnvLocal()` 関数を `tests/shared/env.ts` に定義し、Medium は `setup.ts`、Large は `helpers/db.ts` からそれぞれ呼び出す。

### タイマー操作方針

Pomodoro と覚醒的休息のテストでは、Playwright の `page.clock` API で時間を操作する。テスト用の環境変数やスキップ機能は設けず、本番と同じ UI をそのままテストする。

```ts
// タイマーを即座に進める
await page.clock.fastForward(25 * 60 * 1000); // Pomodoro: 25分
await page.clock.fastForward(10 * 60 * 1000); // 覚醒的休息: 10分
```

### ディレクトリ構成

```
tests/large/
  playwright.config.ts       # Playwright 設定 (webServer 含む)
  global-setup.ts            # テストユーザー作成
  global-teardown.ts         # テストユーザー削除
  auth.setup.ts              # ログイン → storageState 保存
  .auth/                     # storageState 保存先 (gitignore 対象)
  helpers/
    db.ts                    # tests/shared を import、Large テスト固有のヘルパー
  auth.spec.ts               # サインアップ・ログイン・ログアウト
  materials.spec.ts          # 教材 CRUD、手法紐付け、カード管理
  session-srs.spec.ts        # SRS セッションフロー
  session-elaboration.spec.ts # Elaboration セッションフロー
  session-pomodoro.spec.ts   # Pomodoro セッションフロー
  session-interleaving.spec.ts # Interleaving セッションフロー
  stats.spec.ts              # Stats ページ表示
  rest.spec.ts               # 覚醒的休息タイマー
```

### Web サーバー設定

`playwright.config.ts` の `webServer` で Next.js サーバーの起動を管理する。CI では本番ビルド (`build && start`) を使い、ローカル開発では dev サーバーを再利用する。

```ts
webServer: {
  command: process.env.CI ? 'bun run build && bun run start' : 'bun run dev',
  port: 3000,
  reuseExistingServer: !process.env.CI,
}
```

### テスト失敗時のデバッグ支援

```ts
// playwright.config.ts
screenshot: 'only-on-failure',
trace: 'retain-on-failure',
```

CI では `actions/upload-artifact` でテスト結果 (`test-results/`) をアーティファクトとして保存する。

### CI 統合

GitHub Actions に `test-large` ジョブを追加。`test-medium` 完了後に実行する。

```yaml
test-large:
  runs-on: ubuntu-latest
  needs: [test-medium]
  steps:
    - checkout
    - setup-bun
    - bun install --frozen-lockfile
    - bunx playwright install --with-deps chromium
    - supabase start (Medium ジョブと異なり inbucket を除外しない。サインアップのメール確認テストに必要)
    - 環境変数設定
    - bun test:large
    - upload-artifact: test-results/ (失敗時のみ)
```

Playwright の `webServer` 設定で Next.js サーバーの起動・停止を自動管理するため、CI yaml での手動管理は不要。

### package.json 変更

```json
"test:large": "playwright test --config tests/large/playwright.config.ts"
```

既存の `test:large` (chrome-devtools MCP の placeholder) を Playwright コマンドに置き換える。chrome-devtools MCP は `test:large` とは別に、手動の探索的テスト用ツールとして引き続き利用する。

### 探索的テスト (chrome-devtools MCP)

`test:large` とは独立した手動テスト。自動テストでカバーしにくいケースを検証:
- レスポンシブデザイン (モバイル/PC 切り替え)
- アニメーション・トランジション
- エッジケースの UI 状態

## PBI 分解

### PBI 1: Playwright 基盤構築

**Why**: E2E テストの実行基盤がないと各フローのテストを書けない。

**受け入れ条件**:
- Playwright がインストールされ、`playwright.config.ts` が設定されている (`webServer` 含む)
- 認証セットアップ (`auth.setup.ts`) が `storageState` を生成する
- テストユーザーの作成・削除が global setup/teardown で管理されている
- DB ヘルパーが `tests/shared/` に抽出され、Medium と Large の両方から利用可能
- CI で `test-large` ジョブが本番ビルドで動作する
- テスト失敗時にスクリーンショット・トレースがアーティファクトとして保存される
- スモークテスト (ログイン → ホームページ表示) が通る
- `bun test:large` でローカル実行できる

**スコープ**:
- `@playwright/test` インストール
- `tests/shared/` に共通ヘルパーを抽出 (既存 Medium テストのリファクタ含む)
- `tests/large/playwright.config.ts` 作成 (`webServer`, `screenshot`, `trace` 設定)
- `tests/large/global-setup.ts`, `tests/large/global-teardown.ts` 作成
- `tests/large/auth.setup.ts` 作成 (storageState)
- `tests/large/helpers/db.ts` 作成
- `.github/workflows/ci.yml` に `test-large` ジョブ追加 (本番ビルド + アーティファクト保存)
- `package.json` の `test:large` スクリプト更新
- `.gitignore` に `tests/large/.auth/` 追加
- スモークテスト 1 件 (ログイン → `/` 表示確認)
- `.claude/rules/testing.md` の Large テスト欄を更新 (「CI post-deploy」→「CI パイプライン内」)

### PBI 2: 認証 + 教材管理フローの E2E

**Why**: 認証と教材管理はアプリの基礎フロー。他のセッション系テストの前提。

**受け入れ条件**:
- サインアップ → Inbucket でメール確認 → ホームへの遷移が検証されている
- ログイン / ログアウトが検証されている
- 教材の作成 → 詳細表示 → 編集 → 削除が検証されている
- 手法の紐付け (material_methods) が検証されている
- カードの追加 → 編集 → 削除が検証されている

**スコープ**:
- `tests/large/auth.spec.ts`
- `tests/large/materials.spec.ts`

### PBI 3: セッション系フローの E2E

**Why**: 学習セッションはアプリのコア機能。4つの手法それぞれのフローを検証する。

**受け入れ条件**:
- SRS: カード表示 → 回答 → 自己評価 → サマリー
- Elaboration: 記述入力 → 自己評価 → サマリー
- Pomodoro: タイマー開始 → `page.clock.fastForward` で時間操作 → 自己評価 → サマリー
- Interleaving: 複数教材のカード → 自己評価 → サマリー
- 各セッションで `sessions.status` が正しく遷移すること

**スコープ**:
- `tests/large/session-srs.spec.ts`
- `tests/large/session-elaboration.spec.ts`
- `tests/large/session-pomodoro.spec.ts`
- `tests/large/session-interleaving.spec.ts`

**分割基準**: PR が 300 行を超える場合、カードベース系 (SRS + Interleaving) とそれ以外 (Elaboration + Pomodoro) に分割する。

### PBI 4: Stats + 覚醒的休息の E2E

**Why**: 統計表示と覚醒的休息は独立した機能。最後にまとめて検証。

**受け入れ条件**:
- Stats ページに学習データが表示される (事前にテストデータを投入)
- 分野別・手法別のフィルタが機能する
- 覚醒的休息: セッションサマリーから起動 → タイマー表示 → `page.clock.fastForward` で時間操作 → 完了

**スコープ**:
- `tests/large/stats.spec.ts`
- `tests/large/rest.spec.ts`

## 依存関係

```
PBI 1 (基盤) → PBI 2 (認証+教材) ┬→ PBI 3 (セッション系)
                                  └→ PBI 4 (Stats+休息)
```

PBI 3 と PBI 4 は PBI 2 完了後に並列実行可能 (独立したファイルのみ変更するため競合なし)。

## 対象外

- Firefox / WebKit での cross-browser テスト (将来の改善)
- Visual regression テスト (screenshot 比較)
- パフォーマンステスト (Lighthouse)
- モバイルデバイスの実機テスト
