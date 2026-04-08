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
