# Security (Kairous)

汎用セキュリティルールはユーザーレベル rules で定義済み。ここではプロジェクト固有のルールを記載。

## Environment Variables

- `.env.local` は gitignore 済み。コミット禁止
- `SUPABASE_SERVICE_ROLE_KEY` はサーバーサイド専用。クライアントに露出させない
- `src/lib/env.ts` で起動時バリデーション。未設定なら即座に失敗

## Supabase RLS

- 全テーブルに RLS が有効。新テーブル追加時は必ず RLS ポリシーを定義する
- Edge Functions は `service_role` key を使い RLS をバイパスする
- RLS ポリシーのテストは migration job (CI) で検証

## Supply Chain

- `bun install --frozen-lockfile` を CI で強制。lockfile と一致しないインストールは失敗する
- GitHub Actions は SHA ハッシュで固定 (タグ差し替え攻撃の防止)
- `trustedDependencies` で postinstall 実行を明示的にホワイトリスト化
- 依存パッケージの監査は週次 + PR 時に自動実行

## Headers

- 静的ヘッダー (X-Frame-Options, X-Content-Type-Options 等) は `next.config.ts` で設定
- CSP は `src/middleware.ts` で nonce ベースで動的生成 (`src/lib/csp.ts`)
- `frame-ancestors 'none'` でクリックジャッキング防止
- `connect-src` は Supabase URL のみ許可

## Input Validation

- ユーザー入力は Server Action / Edge Function の入口でバリデーション
- SQL は Supabase クライアント経由 (パラメータバインド)。生SQL禁止
- JSONB の meta フィールドはスキーマレスだが、書き込み時に型チェックする
