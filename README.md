# Kairous

学習科学に基づく複数手法を組み合わせた学習管理 Web アプリ。

Spacing effect, active recall, desirable difficulty などのエビデンスに基づき、SRS / アクティブリコール / 精緻化 / ポモドーロ / インターリービングを1つのアプリに統合する。

## 技術スタック

- **フロントエンド:** Next.js 16 (App Router) / TypeScript / Tailwind CSS 4
- **UI:** shadcn/ui (base-nova) / lucide-react
- **バックエンド:** Supabase (Auth / PostgreSQL / Edge Functions)
- **デプロイ:** Vercel
- **パッケージマネージャ:** bun

## セットアップ

```bash
# 依存関係のインストール
bun install

# Supabase ローカル起動
supabase start

# 環境変数を設定
cp .env.local.example .env.local
# .env.local を編集して supabase status の出力値を記入

# 開発サーバー起動
bun dev
```

## コマンド

```bash
bun dev            # 開発サーバー
bun build          # 本番ビルド
bun lint           # ESLint
bun typecheck      # TypeScript 型チェック
bun test:small     # Small テスト (モックのみ、高速)
bun test:medium    # Medium テスト (Supabase ローカル)
bun check          # lint + typecheck + test:small
```

## ディレクトリ構成

```
src/
  app/              # App Router ページ
    auth/           # /auth/login, /auth/signup
    (main)/         # BottomNav/Sidebar レイアウト
      page.tsx      # Today (/)
      materials/    # /materials, /materials/[id], /materials/new
      stats/        # /stats
      profile/      # /profile
    session/        # /session/[id]
    rest/           # /rest/[id] (安静タイマー)
  components/
    ui/             # shadcn/ui プリミティブ
    navigation/     # BottomNav, Sidebar
    *.tsx           # ドメインコンポーネント
  lib/
    actions/        # Server Actions
    supabase/       # Supabase クライアント
    types/          # 型定義 (database.ts は自動生成)
    validations/    # zod スキーマ
    constants.ts    # 共有定数
supabase/
  migrations/       # SQL マイグレーション
  functions/        # Edge Functions
  seed.sql          # シードデータ
docs/
  review-guide.md   # PR レビュー規約
  superpowers/
    specs/          # 設計仕様書
    plans/          # 実装計画
```

## テスト戦略

| 分類 | 配置 | 外部依存 | 実行タイミング |
|------|------|----------|---------------|
| Small | tests/small/ | なし (全モック) | pre-commit |
| Medium | tests/medium/ | Supabase ローカル | CI |
| Large | tests/large/ | ブラウザ + Supabase | CI post-deploy |

## 開発ガイド

- [PR レビューガイド](docs/review-guide.md) -- レビューコメントのプレフィックスルールと LGTM 要件
- [Issue 管理ガイド](docs/issue-guide.md) -- ラベル付与ルールとトリアージ方針
- CLAUDE.md -- AI 協働開発のルールと制約

## ライセンス

Private
