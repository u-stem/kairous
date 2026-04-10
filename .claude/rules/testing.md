# Test Strategy (Kairous)

汎用テストルールはユーザーレベル rules で定義済み。ここではプロジェクト固有のルールを記載。

## 分類

| 分類 | 配置 | 外部依存 | 実行 |
|------|------|----------|------|
| Small | tests/small/ | なし (全モック) | `bun test:small` (pre-commit) |
| Medium | tests/medium/ | Supabase ローカル | `bun test:medium` (CI) |
| Large | tests/large/ | Playwright + Supabase ローカル | `bun test:large` (CI パイプライン内) |

## ルール

- 新規コードには必ずテストを書く
- テストの分類を間違えない (DB アクセスがあれば Medium、なければ Small)
- Small テストで Supabase クライアントを直接呼ばない (必ずモック)
- Medium テストはテストごとにデータをクリーンアップする
- フレーク (不安定なテスト) を見つけたら即座に修正する
- Large テストは Playwright (`tests/large/*.spec.ts`) で実行する
- テストデータは `tests/shared/helpers.ts` のファクトリ関数で作成し、テスト後にクリーンアップする
- ローカル実行時は Supabase ローカルと dev サーバーが起動していること

## Large テスト (E2E) 固有ルール

- セレクタは `data-testid`、`role`、`label` を使う。CSS クラスセレクタ (`p.truncate.text-sm` 等) は禁止 (UIスタイル変更で壊れる)
- タイマーテスト: `page.clock.install()` はページ読み込み前に実行する
- `page.clock.runFor()` の前に `page.waitForTimeout(200)` で React useEffect チェーン完了を待つ (fake clock は setInterval を制御するが、React の内部スケジューラは実時間で動く)
- CI の production build ではハイドレーション完了前のクリック操作が失敗する場合がある。`waitForLoadState("networkidle")` で待機する
- ヘッドレス Chromium では Notification API の `permission` が `"denied"` 固定になる。`test.use({ permissions: ["notifications"] })` は Chromium の内部状態を変更しない。通知トグル等の UI テストは DB 側で状態を直接設定し、Notification API の動作テストは Small テスト (mock) でカバーする

## テストデータ命名

- テストデータの名前にシステム手法名 (自由学習、ポモドーロ等) を含めない。`getByText` の strict mode violation を防ぐため
- 教材名は手法名と被らない一意な名前にする (例: "E2E-FreeStudy-教材A"、"自由学習テスト教材" は NG)

## タイムゾーン依存テスト

- `setHours()` / `setMinutes()` はローカル TZ で動作する。テストで固定時刻を使う場合は `new Date()` + `setHours()` でローカル TZ 基準の Date を作る (CI の UTC でもローカルの JST でも同じ結果になる)
- `new Date("2026-04-09T08:00:00+09:00")` は特定の瞬間を表す絶対時刻であり、`setHours(10)` のようなローカル TZ 操作と組み合わせると CI (UTC) で結果がずれる
- 日付文字列の比較 (`toISOString().split("T")[0]`) は UTC 基準。JST が必要な場合は `toJstDateString()` を使う
