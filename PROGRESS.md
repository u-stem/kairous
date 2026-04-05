# Kairous Progress

## Step 0: Dev Infrastructure -- DONE (2026-04-05)

- AGENTS.md: 5つの役割（Developer, Reviewer, PO, Tester, User）
- テスト戦略: Small/Medium/Large の3段階
- カスタムスキル: dev-review, run-tests, check-spec
- lefthook: pre-commit (lint, typecheck, test-small), pre-push (full-check)
- CI: lint-and-typecheck, test-small, test-medium, migration
- Plan: docs/superpowers/plans/2026-04-05-dev-infrastructure.md

## Step 1: Screen Flow Design -- DONE (2026-04-05)

- 12ページ定義、4つの画面遷移フロー
- データモデル変更: sessions.material_id nullable, self_rating, session_materials, daily_logs.method_id
- Spec: docs/superpowers/specs/2026-04-05-screen-flow-design.md

## Step 2: Foundation (Project + DB + Auth + Layout) -- DONE (2026-04-05)

- Next.js 16 + Tailwind CSS 4 + TypeScript 6 初期化
- Supabase: 3 migrations (core domain, session recording, RLS) + seed
- Supabase クライアント (browser/server/middleware) + DB 型生成
- Auth: login/signup (zod バリデーション付き Server Actions)
- Layout: BottomNav (mobile) + Sidebar (PC), 4 プレースホルダーページ
- セ���ュリティ: CSP, env validation, dependency audit, trustedDependencies
- Plan: docs/superpowers/plans/2026-04-05-foundation.md

## Step 3: Core Features (Materials + Sessions + FSRS) -- PENDING

## Step 4: Dashboard & Polish (Stats + Wakeful Rest + Interleaving) -- PENDING
