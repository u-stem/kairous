# Kairous

学習科学に基づく複数手法を組み合わせた学習管理Webアプリ。

## Tech Stack

- Next.js 16 (App Router) / TypeScript 6 / Tailwind CSS 4
- Supabase (Auth / PostgreSQL / Edge Functions / Realtime)
- Vercel deploy
- Package manager: bun

## Directory Structure

```
src/
  app/              # App Router pages
    auth/           # /auth/login, /auth/signup
    (main)/         # BottomNav/Sidebar layout (route group, URL has no prefix)
      page.tsx      # Today (/)
      materials/    # /materials, /materials/[id]
      stats/        # /stats
      profile/      # /profile
    session/        # /session/[id], /session/[id]/review, /session/[id]/summary
    rest/           # /rest/[id] (wakeful rest timer)
  components/       # Shared UI components
  lib/              # Utilities, Supabase client, types
supabase/
  migrations/       # SQL migrations
  functions/        # Edge Functions (FSRS, daily_logs upsert)
  seed.sql          # learning_methods seed data
```

## Commands

```bash
bun dev            # dev server
bun build          # production build
bun lint           # lint
bun typecheck      # type check
bun test           # test
```

## Design Decisions

### Core Invariants

- **material_methods** is the core junction table. Never break the 1-material-to-many-methods structure.
- **FSRS computation** runs on Supabase Edge Functions only. No client-side calculation.
- **daily_logs** are upserted by Edge Function on session end. No real-time aggregation.
- **self_rating (1-4)** is mandatory for learning methods (SRS, active_recall, interleaving, elaboration, pomodoro). NULL for wakeful_rest and free_study.
- **Wakeful Rest** timer is optional, launched from session summary. Independent session at `/rest/[id]`.
- **RLS** enabled on all tables. Edge Functions use service_role key to bypass.
- **sessions.status**: 'in_progress' | 'completed' | 'abandoned'.

### Data Model Changes (from kairous_design.md)

- `sessions.material_id`: nullable (for interleaving sessions)
- `sessions.self_rating`: added (INT 1-4, NULLable — NULL for wakeful_rest/free_study)
- `sessions.status`: clarified ('in_progress' | 'completed' | 'abandoned')
- `session_materials`: new table (interleaving multi-material support)
- `daily_logs.method_id`: added (enables per-method stats)

### Method Classification

- **Card-based** (SRS, Active Recall, Interleaving): use `card_reviews` table
- **Time/text-based** (Pomodoro, Elaboration, Free Study): use `sessions.meta` JSONB only
- **Consolidation** (Wakeful Rest): independent session with `meta.parent_session_id`

### When in Doubt

Follow learning science evidence from `kairous_design.md`. Specifically:
- Spacing effect > massed practice
- Active recall > passive review
- Desirable difficulty > easy fluency
- If a UX choice conflicts with learning science, learning science wins.

## Specs

- [Screen Flow Design](docs/superpowers/specs/2026-04-05-screen-flow-design.md)

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

- コメントは��本語。Why を書く（What は書かない）
- TODO 禁止。今すぐ解消するか GitHub Issue を作成する
- エラー・警告の握りつぶし禁止
- 同じロジックの重複: 2箇所で検討、3箇所で必須共通化
- 定数は `src/lib/constants.ts` に集約
- 型は `src/lib/types/database.ts`（自動生成）が single source of truth

## Security

### Environment Variables
- `.env.local` は gitignore 済み。コミット禁止
- `SUPABASE_SERVICE_ROLE_KEY` はサーバーサイド専用。クライアントに露出させない
- `src/lib/env.ts` で起動時バリデーション。未設定なら即座に失敗

### Supabase RLS
- 全テーブルに RLS が有効。新テーブル追加時は必ず RLS ポリシーを定義する
- Edge Functions は `service_role` key を使い RLS をバイパスする
- RLS ポリシーのテストは migration job (CI) で検証

### Supply Chain
- `bun install --frozen-lockfile` を CI で強制。lockfile と一致しないインストールは失敗する
- GitHub Actions は SHA ハッシュで固定（タグ差し替え攻撃の防止）
- `trustedDependencies` で postinstall 実行を明示的にホワイトリスト化
- 依存パッケージの監査は週次 + PR 時に自動実行

### Headers
- CSP, X-Frame-Options, X-Content-Type-Options 等を next.config.ts で設定
- `frame-ancestors 'none'` でクリックジャッキング防止
- `connect-src` は Supabase URL のみ許可

### Input Validation
- ユーザー入力は Server Action / Edge Function の入口でバリデーション
- SQL は Supabase クライアント経由（パラメータバインド）。生SQL禁止
- JSONB の meta フィールドはスキーマレスだが、書き込み時に型チェックする

## Library Policy

### Use Libraries Over Custom Code
- バリデーション: zod（Server Action / Edge Function の入力スキーマ定義）
- 日付操作: date-fns（軽量、tree-shakeable）
- UI: 必要に応じて Radix UI primitives（BottomSheet, Dialog 等のアクセシブルなプリミティブ）
- FSRS: ts-fsrs（FSRS-5アルゴリズムの参照実装。自作しない）
- アイコン: lucide-react（一貫したアイコンセット）
- 自作するのは、既存ライブラリがないか、ドメイン固有のロジックのみ

### Code Reuse & Constants
- 同じ概念の値は定数として `src/lib/constants.ts` に集約する
- 学習手法のスラッグは `src/lib/constants.ts` で union type + 定数オブジェクトとして定義
- 同じようなロジックが2箇所に出現したら共通化を検討する（3箇所なら必須）
- Supabase クライアント生成は `src/lib/supabase/` の関数のみを使用。各ファイルで直接 `createClient` しない
- 型定義は `src/lib/types/database.ts`（自動生成）をsingle source of truthとする。手動の型定義で上書きしない
