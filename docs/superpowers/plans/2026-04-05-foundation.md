# Kairous Foundation Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Next.js 16 プロジェクトの初期化、Supabase DB マイグレーション、シードデータ投入、認証、レスポンシブレイアウトを構築し、アプリの土台を完成させる。

**Architecture:** Next.js 16 App Router でページルーティング。Supabase でAuth/DB/Edge Functions。auth/ ディレクトリと (main) Route Group でレイアウトを分離。認証状態は Supabase SSR middleware で管理。

**Tech Stack:** Next.js 16, React 19, TypeScript 6, Tailwind CSS 4, Supabase (supabase-js 2.x, ssr 0.10.x), bun

---

## File Structure

```
kairous/
  src/
    app/
      layout.tsx                          # Root layout (HTML, fonts, Supabase provider)
      auth/
        login/page.tsx                    # /auth/login
        signup/page.tsx                   # /auth/signup
        layout.tsx                        # Auth layout (centered, no nav)
      (main)/
        layout.tsx                        # Main layout (BottomNav/Sidebar + auth guard)
        page.tsx                          # Today page (placeholder)
        materials/page.tsx                # Materials list (placeholder)
        stats/page.tsx                    # Stats (placeholder)
        profile/page.tsx                  # Profile (placeholder)
    components/
      navigation/
        bottom-nav.tsx                    # Mobile bottom navigation
        sidebar.tsx                       # Desktop sidebar
        nav-items.ts                      # Shared nav item definitions
      ui/
        button.tsx                        # Basic button component
        input.tsx                         # Basic input component
    lib/
      supabase/
        client.ts                         # Browser Supabase client
        server.ts                         # Server-side Supabase client
        middleware.ts                     # Auth session refresh logic
      types/
        database.ts                       # Generated DB types
  middleware.ts                           # Next.js middleware (auth redirect)
  supabase/
    migrations/
      00001_core_domain.sql               # subjects, materials, learning_methods, material_methods, cards
      00002_session_recording.sql          # sessions, session_materials, card_reviews, srs_states, daily_logs
      00003_rls_policies.sql              # RLS policies for all tables
    seed.sql                              # learning_methods seed data
  tests/
    small/
      components/
        navigation/
          bottom-nav.test.tsx             # BottomNav tests (Small)
          sidebar.test.tsx                # Sidebar tests (Small)
      app/
        auth/
          login.test.tsx                  # Login page tests (Small)
```

---

### Task 1: Next.js プロジェクト初期化

**Files:**
- Create: `package.json`, `tsconfig.json`, `next.config.ts`, `src/app/layout.tsx`, `src/app/page.tsx`

- [ ] **Step 1: Next.js プロジェクトを作成**

```bash
cd /Users/mikiya/ws/kairous
bunx create-next-app@latest . --typescript --tailwind --eslint --app --src-dir --import-alias "@/*" --turbopack --yes
```

Expected: プロジェクトファイルが生成される。既存の docs/, CLAUDE.md 等は保持される。

- [ ] **Step 2: 不要なボイラープレートを削除**

`src/app/page.tsx` のデフォルト内容を最小限に置き換え:

```tsx
export default function Home() {
  return (
    <main>
      <h1>Kairous</h1>
    </main>
  );
}
```

`src/app/globals.css` を Tailwind 4 の最小構成に:

```css
@import "tailwindcss";
```

- [ ] **Step 3: dev サーバーが起動することを確認**

```bash
cd /Users/mikiya/ws/kairous
bun dev &
sleep 3
curl -s -o /dev/null -w "%{http_code}" http://localhost:3000
kill %1
```

Expected: `200`

- [ ] **Step 4: .gitignore を更新**

既存の `.gitignore` に以下を追記（create-next-app が生成した内容とマージ）:

```
.superpowers/
.env
.env.local
```

- [ ] **Step 5: コミット**

```bash
git init
git add -A
git commit -m "chore: Next.js 16 プロジェクト初期化"
```

---

### Task 2: Supabase CLI セットアップ

**Files:**
- Create: `supabase/config.toml`

- [ ] **Step 1: Supabase CLI をインストール**

```bash
bun add -D supabase
```

- [ ] **Step 2: Supabase プロジェクトを初期化**

```bash
bunx supabase init
```

Expected: `supabase/config.toml` が生成される。

- [ ] **Step 3: ローカル Supabase を起動して確認**

```bash
bunx supabase start
```

Expected: `supabase start` がローカルの Supabase スタック（DB, Auth, Storage 等）を起動し、API URL と anon key が出力される。

- [ ] **Step 4: .env.local を作成**

`supabase start` の出力から値を取得して `.env.local` を作成:

```
NEXT_PUBLIC_SUPABASE_URL=http://127.0.0.1:54321
NEXT_PUBLIC_SUPABASE_ANON_KEY=<supabase start で出力された anon key>
SUPABASE_SERVICE_ROLE_KEY=<supabase start で出力された service_role key>
```

- [ ] **Step 5: コミット**

```bash
git add supabase/config.toml
git commit -m "chore: Supabase CLI セットアップ"
```

`.env.local` はコミットしない。

---

### Task 3: コアドメインテーブルのマイグレーション

**Files:**
- Create: `supabase/migrations/00001_core_domain.sql`

- [ ] **Step 1: マイグレーションファイルを作成**

```sql
-- supabase/migrations/00001_core_domain.sql

-- プロフィール (auth.users の拡張)
CREATE TABLE profiles (
  id UUID PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  display_name TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Subjects (分野: 英語, 数学, プログラミング...)
CREATE TABLE subjects (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  color TEXT NOT NULL DEFAULT '#6366f1',
  display_order INT NOT NULL DEFAULT 0,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- 手法マスタ
CREATE TABLE learning_methods (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  slug TEXT NOT NULL UNIQUE,
  name TEXT NOT NULL,
  category TEXT NOT NULL CHECK (category IN ('memory', 'comprehension', 'focus', 'consolidation', 'general')),
  default_config JSONB NOT NULL DEFAULT '{}',
  is_system BOOLEAN NOT NULL DEFAULT true,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- 教材
CREATE TABLE materials (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  subject_id UUID NOT NULL REFERENCES subjects(id) ON DELETE CASCADE,
  user_id UUID NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
  title TEXT NOT NULL,
  description TEXT,
  source_type TEXT,
  total_cards INT NOT NULL DEFAULT 0,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- 教材 x 手法の中間テーブル（設計の核心）
CREATE TABLE material_methods (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  material_id UUID NOT NULL REFERENCES materials(id) ON DELETE CASCADE,
  method_id UUID NOT NULL REFERENCES learning_methods(id),
  config JSONB NOT NULL DEFAULT '{}',
  is_active BOOLEAN NOT NULL DEFAULT true,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE(material_id, method_id)
);

-- カード（SRS等で使用）
CREATE TABLE cards (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  material_id UUID NOT NULL REFERENCES materials(id) ON DELETE CASCADE,
  front TEXT NOT NULL,
  back TEXT NOT NULL,
  card_type TEXT NOT NULL DEFAULT 'basic',
  display_order INT NOT NULL DEFAULT 0,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- インデックス
CREATE INDEX idx_subjects_user_id ON subjects(user_id);
CREATE INDEX idx_materials_subject_id ON materials(subject_id);
CREATE INDEX idx_materials_user_id ON materials(user_id);
CREATE INDEX idx_material_methods_material_id ON material_methods(material_id);
CREATE INDEX idx_cards_material_id ON cards(material_id);
```

- [ ] **Step 2: マイグレーションを実行**

```bash
bunx supabase db reset
```

Expected: `Applying migration 00001_core_domain.sql...done` のようなメッセージ。

- [ ] **Step 3: テーブルの存在を確認**

```bash
bunx supabase db lint
```

Expected: RLS が未設定のためセキュリティ警告が出る可能性があるが、構文エラーがなければ OK。RLS は Task 5 で適用する。

- [ ] **Step 4: コミット**

```bash
git add supabase/migrations/00001_core_domain.sql
git commit -m "feat: コアドメインテーブルのマイグレーション"
```

---

### Task 4: セッション・記録系テーブルのマイグレーション

**Files:**
- Create: `supabase/migrations/00002_session_recording.sql`

- [ ] **Step 1: マイグレーションファイルを作成**

```sql
-- supabase/migrations/00002_session_recording.sql

-- 学習セッション
CREATE TABLE sessions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
  material_id UUID REFERENCES materials(id),  -- インターリービング時は NULL
  method_id UUID NOT NULL REFERENCES learning_methods(id),
  duration_sec INT NOT NULL DEFAULT 0,
  status TEXT NOT NULL DEFAULT 'in_progress'
    CHECK (status IN ('in_progress', 'completed', 'abandoned')),
  self_rating INT CHECK (self_rating >= 1 AND self_rating <= 4),  -- wakeful_rest/free_study では NULL
  meta JSONB NOT NULL DEFAULT '{}',
  started_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  ended_at TIMESTAMPTZ
);

-- セッション x 教材（インターリービング用）
CREATE TABLE session_materials (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  session_id UUID NOT NULL REFERENCES sessions(id) ON DELETE CASCADE,
  material_id UUID NOT NULL REFERENCES materials(id),
  UNIQUE(session_id, material_id)
);

-- カード回答ログ
CREATE TABLE card_reviews (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  session_id UUID NOT NULL REFERENCES sessions(id) ON DELETE CASCADE,
  card_id UUID NOT NULL REFERENCES cards(id),
  rating INT NOT NULL CHECK (rating >= 1 AND rating <= 4),
  response_ms INT NOT NULL DEFAULT 0,
  reviewed_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- FSRS アルゴリズム状態（カード x ユーザーごと）
CREATE TABLE srs_states (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  card_id UUID NOT NULL REFERENCES cards(id) ON DELETE CASCADE,
  user_id UUID NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
  stability REAL NOT NULL DEFAULT 0,
  difficulty REAL NOT NULL DEFAULT 0,
  reps INT NOT NULL DEFAULT 0,
  lapses INT NOT NULL DEFAULT 0,
  due_date DATE NOT NULL DEFAULT CURRENT_DATE,
  last_reviewed_at TIMESTAMPTZ,
  UNIQUE(card_id, user_id)
);

-- 日次集計（ユーザー x 分野 x 手法 x 日付）
CREATE TABLE daily_logs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
  subject_id UUID NOT NULL REFERENCES subjects(id) ON DELETE CASCADE,
  method_id UUID NOT NULL REFERENCES learning_methods(id),
  log_date DATE NOT NULL DEFAULT CURRENT_DATE,
  total_sec INT NOT NULL DEFAULT 0,
  session_count INT NOT NULL DEFAULT 0,
  cards_reviewed INT NOT NULL DEFAULT 0,
  UNIQUE(user_id, subject_id, method_id, log_date)
);

-- インデックス
CREATE INDEX idx_sessions_user_id ON sessions(user_id);
CREATE INDEX idx_sessions_material_id ON sessions(material_id);
CREATE INDEX idx_session_materials_session_id ON session_materials(session_id);
CREATE INDEX idx_card_reviews_session_id ON card_reviews(session_id);
CREATE INDEX idx_card_reviews_card_id ON card_reviews(card_id);
CREATE INDEX idx_srs_states_user_due ON srs_states(user_id, due_date);
CREATE INDEX idx_daily_logs_user_date ON daily_logs(user_id, log_date);
```

- [ ] **Step 2: マイグレーションを実行**

```bash
bunx supabase db reset
```

Expected: 2つのマイグレーションが順に適用される。

- [ ] **Step 3: コミット**

```bash
git add supabase/migrations/00002_session_recording.sql
git commit -m "feat: セッション・記録系テーブルのマイグレーション"
```

---

### Task 5: RLS ポリシーのマイグレーション

**Files:**
- Create: `supabase/migrations/00003_rls_policies.sql`

- [ ] **Step 1: RLS ポリシーを作成**

```sql
-- supabase/migrations/00003_rls_policies.sql

-- 全テーブルで RLS を有効化
ALTER TABLE profiles ENABLE ROW LEVEL SECURITY;
ALTER TABLE subjects ENABLE ROW LEVEL SECURITY;
ALTER TABLE materials ENABLE ROW LEVEL SECURITY;
ALTER TABLE learning_methods ENABLE ROW LEVEL SECURITY;
ALTER TABLE material_methods ENABLE ROW LEVEL SECURITY;
ALTER TABLE cards ENABLE ROW LEVEL SECURITY;
ALTER TABLE sessions ENABLE ROW LEVEL SECURITY;
ALTER TABLE session_materials ENABLE ROW LEVEL SECURITY;
ALTER TABLE card_reviews ENABLE ROW LEVEL SECURITY;
ALTER TABLE srs_states ENABLE ROW LEVEL SECURITY;
ALTER TABLE daily_logs ENABLE ROW LEVEL SECURITY;

-- Profiles: users can only access their own profile
CREATE POLICY "Users can view own profile"
  ON profiles FOR SELECT USING (auth.uid() = id);
CREATE POLICY "Users can update own profile"
  ON profiles FOR UPDATE USING (auth.uid() = id);
CREATE POLICY "Users can insert own profile"
  ON profiles FOR INSERT WITH CHECK (auth.uid() = id);

-- Subjects: users can only access their own subjects
CREATE POLICY "Users can manage own subjects"
  ON subjects FOR ALL USING (auth.uid() = user_id);

-- Learning Methods: system methods are readable by all authenticated users
CREATE POLICY "Authenticated users can view methods"
  ON learning_methods FOR SELECT TO authenticated USING (true);

-- Materials: users can only access their own materials
CREATE POLICY "Users can manage own materials"
  ON materials FOR ALL USING (auth.uid() = user_id);

-- Material Methods: access through material ownership
CREATE POLICY "Users can manage own material methods"
  ON material_methods FOR ALL
  USING (
    EXISTS (
      SELECT 1 FROM materials WHERE materials.id = material_methods.material_id AND materials.user_id = auth.uid()
    )
  );

-- Cards: access through material ownership
CREATE POLICY "Users can manage own cards"
  ON cards FOR ALL
  USING (
    EXISTS (
      SELECT 1 FROM materials WHERE materials.id = cards.material_id AND materials.user_id = auth.uid()
    )
  );

-- Sessions: users can only access their own sessions
CREATE POLICY "Users can manage own sessions"
  ON sessions FOR ALL USING (auth.uid() = user_id);

-- Session Materials: access through session ownership
CREATE POLICY "Users can manage own session materials"
  ON session_materials FOR ALL
  USING (
    EXISTS (
      SELECT 1 FROM sessions WHERE sessions.id = session_materials.session_id AND sessions.user_id = auth.uid()
    )
  );

-- Card Reviews: access through session ownership
CREATE POLICY "Users can manage own card reviews"
  ON card_reviews FOR ALL
  USING (
    EXISTS (
      SELECT 1 FROM sessions WHERE sessions.id = card_reviews.session_id AND sessions.user_id = auth.uid()
    )
  );

-- SRS States: users can only access their own states
CREATE POLICY "Users can manage own srs states"
  ON srs_states FOR ALL USING (auth.uid() = user_id);

-- Daily Logs: users can only access their own logs
CREATE POLICY "Users can manage own daily logs"
  ON daily_logs FOR ALL USING (auth.uid() = user_id);

-- サインアップ時にプロフィールを自動作成
CREATE OR REPLACE FUNCTION handle_new_user()
RETURNS TRIGGER AS $$
BEGIN
  INSERT INTO profiles (id, display_name)
  VALUES (NEW.id, NEW.raw_user_meta_data->>'display_name');
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

CREATE TRIGGER on_auth_user_created
  AFTER INSERT ON auth.users
  FOR EACH ROW EXECUTE FUNCTION handle_new_user();
```

- [ ] **Step 2: マイグレーションを実行して検証**

```bash
bunx supabase db reset
```

Expected: 3つのマイグレーションが順に適用される。

- [ ] **Step 3: コミット**

```bash
git add supabase/migrations/00003_rls_policies.sql
git commit -m "feat: RLS ポリシーとプロフィール自動作成トリガー"
```

---

### Task 6: learning_methods シードデータ

**Files:**
- Create: `supabase/seed.sql`

- [ ] **Step 1: シードデータを作成**

```sql
-- supabase/seed.sql

INSERT INTO learning_methods (slug, name, category, default_config, is_system) VALUES
  ('srs', '間隔反復 (FSRS)', 'memory', '{"initial_stability": 1.0, "initial_difficulty": 5.0}', true),
  ('active_recall', 'アクティブリコール', 'memory', '{}', true),
  ('interleaving', 'インターリービング', 'comprehension', '{"shuffle": true}', true),
  ('elaboration', '精緻化', 'comprehension', '{}', true),
  ('pomodoro', 'ポモドーロ', 'focus', '{"work_minutes": 25, "break_minutes": 5}', true),
  ('wakeful_rest', '覚醒的休息', 'consolidation', '{"default_minutes": 10}', true),
  ('free_study', '自由学習', 'general', '{}', true);
```

- [ ] **Step 2: シードを実行して確認**

```bash
bunx supabase db reset
```

`supabase db reset` はマイグレーション適用後に `seed.sql` を自動実行する。

確認:

```bash
bunx supabase db lint
```

Expected: エラーなし。

- [ ] **Step 3: コミット**

```bash
git add supabase/seed.sql
git commit -m "feat: learning_methods シードデータ（7手法）"
```

---

### Task 7: Supabase クライアントライブラリのセットアップ

**Files:**
- Create: `src/lib/supabase/client.ts`, `src/lib/supabase/server.ts`, `src/lib/supabase/middleware.ts`, `src/lib/types/database.ts`

- [ ] **Step 1: 依存パッケージをインストール**

```bash
bun add @supabase/supabase-js @supabase/ssr
```

- [ ] **Step 2: DB型を生成**

前提: ローカル Supabase が起動済みであること（Task 2 Step 3）。停止している場合は `bunx supabase start` を先に実行。

```bash
bunx supabase gen types typescript --local > src/lib/types/database.ts
```

Expected: `database.ts` にテーブルごとの型定義が生成される。

- [ ] **Step 3: ブラウザ用クライアントを作成**

```ts
// src/lib/supabase/client.ts
import { createBrowserClient } from "@supabase/ssr";
import type { Database } from "@/lib/types/database";

export function createClient() {
  return createBrowserClient<Database>(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
  );
}
```

- [ ] **Step 4: サーバー用クライアントを作成**

```ts
// src/lib/supabase/server.ts
import { createServerClient } from "@supabase/ssr";
import { cookies } from "next/headers";
import type { Database } from "@/lib/types/database";

export async function createClient() {
  const cookieStore = await cookies();

  return createServerClient<Database>(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        getAll() {
          return cookieStore.getAll();
        },
        setAll(cookiesToSet) {
          for (const { name, value, options } of cookiesToSet) {
            cookieStore.set(name, value, options);
          }
        },
      },
    },
  );
}
```

- [ ] **Step 5: middleware ヘルパーを作成**

```ts
// src/lib/supabase/middleware.ts
import { createServerClient } from "@supabase/ssr";
import { NextResponse, type NextRequest } from "next/server";

export async function updateSession(request: NextRequest) {
  let supabaseResponse = NextResponse.next({ request });

  const supabase = createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        getAll() {
          return request.cookies.getAll();
        },
        setAll(cookiesToSet) {
          for (const { name, value } of cookiesToSet) {
            request.cookies.set(name, value);
          }
          supabaseResponse = NextResponse.next({ request });
          for (const { name, value, options } of cookiesToSet) {
            supabaseResponse.cookies.set(name, value, options);
          }
        },
      },
    },
  );

  const {
    data: { user },
  } = await supabase.auth.getUser();

  // 未認証ユーザーをログインページにリダイレクト（認証ページ自体は除外）
  const isAuthPage = request.nextUrl.pathname.startsWith("/auth");
  if (!user && !isAuthPage) {
    const url = request.nextUrl.clone();
    url.pathname = "/auth/login";
    return NextResponse.redirect(url);
  }

  // 認証済みユーザーを認証ページからリダイレクト
  if (user && isAuthPage) {
    const url = request.nextUrl.clone();
    url.pathname = "/";
    return NextResponse.redirect(url);
  }

  return supabaseResponse;
}
```

- [ ] **Step 6: Next.js middleware を作成**

```ts
// src/middleware.ts
import { updateSession } from "@/lib/supabase/middleware";
import type { NextRequest } from "next/server";

export async function middleware(request: NextRequest) {
  return await updateSession(request);
}

export const config = {
  matcher: [
    // 静的ファイルと _next 内部ファイルを除外
    "/((?!_next/static|_next/image|favicon.ico|.*\\.(?:svg|png|jpg|jpeg|gif|webp)$).*)",
  ],
};
```

- [ ] **Step 7: コミット**

```bash
git add src/lib/ src/middleware.ts
git commit -m "feat: Supabase クライアント・middleware セットアップ"
```

---

### Task 8: 認証ページ（ログイン・サインアップ）

**Files:**
- Create: `src/app/auth/layout.tsx`, `src/app/auth/login/page.tsx`, `src/app/auth/signup/page.tsx`, `src/app/auth/login/actions.ts`, `src/app/auth/signup/actions.ts`

- [ ] **Step 1: テストファイルを作成**

```bash
bun add -D vitest @vitejs/plugin-react-swc jsdom @testing-library/react @testing-library/jest-dom
```

`vitest.config.ts` を作成:

```ts
// vitest.config.ts
import { defineConfig } from "vitest/config";
import react from "@vitejs/plugin-react-swc";
import { resolve } from "path";

export default defineConfig({
  plugins: [react()],
  test: {
    environment: "jsdom",
    setupFiles: ["./tests/setup.ts"],
    include: ["tests/**/*.test.{ts,tsx}"],
  },
  resolve: {
    alias: {
      "@": resolve(__dirname, "./src"),
    },
  },
});
```

`tests/setup.ts` を作成:

```ts
// tests/setup.ts
import "@testing-library/jest-dom/vitest";
```

`package.json` の scripts に追加:

```json
{
  "scripts": {
    "test": "vitest run",
    "test:watch": "vitest"
  }
}
```

- [ ] **Step 2: ログインページのテストを作成**

```tsx
// tests/small/app/auth/login.test.tsx
import { render, screen } from "@testing-library/react";
import { describe, it, expect, vi } from "vitest";

vi.mock("@/app/auth/login/actions", () => ({
  login: vi.fn(),
}));

import LoginPage from "@/app/auth/login/page";

describe("LoginPage", () => {
  it("renders email and password inputs and submit button", () => {
    render(<LoginPage />);
    expect(screen.getByLabelText("メールアドレス")).toBeInTheDocument();
    expect(screen.getByLabelText("パスワード")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "ログイン" })).toBeInTheDocument();
  });
});
```

- [ ] **Step 3: テストが失敗することを確認**

```bash
bun test:small -- tests/small/app/auth/login.test.tsx
```

Expected: FAIL (LoginPage not found)

- [ ] **Step 4: 認証レイアウトを作成**

```tsx
// src/app/auth/layout.tsx
export default function AuthLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <div className="flex min-h-dvh items-center justify-center bg-gray-50 p-4">
      <div className="w-full max-w-sm">{children}</div>
    </div>
  );
}
```

- [ ] **Step 5: ログイン Server Action を作成**

```ts
// src/app/auth/login/actions.ts
"use server";

import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";

export async function login(formData: FormData) {
  const supabase = await createClient();

  const { error } = await supabase.auth.signInWithPassword({
    email: formData.get("email") as string,
    password: formData.get("password") as string,
  });

  if (error) {
    return { error: error.message };
  }

  redirect("/");
}
```

- [ ] **Step 6: ログインページを作成**

```tsx
// src/app/auth/login/page.tsx
"use client";

import { useState } from "react";
import { login } from "./actions";
import Link from "next/link";

export default function LoginPage() {
  const [error, setError] = useState<string | null>(null);

  async function handleSubmit(formData: FormData) {
    const result = await login(formData);
    if (result?.error) {
      setError(result.error);
    }
  }

  return (
    <div>
      <h1 className="mb-6 text-center text-2xl font-bold">Kairous</h1>
      <form action={handleSubmit} className="space-y-4">
        <div>
          <label htmlFor="email" className="block text-sm font-medium">
            メールアドレス
          </label>
          <input
            id="email"
            name="email"
            type="email"
            required
            className="mt-1 block w-full rounded-md border px-3 py-2"
          />
        </div>
        <div>
          <label htmlFor="password" className="block text-sm font-medium">
            パスワード
          </label>
          <input
            id="password"
            name="password"
            type="password"
            required
            className="mt-1 block w-full rounded-md border px-3 py-2"
          />
        </div>
        {error && <p className="text-sm text-red-600">{error}</p>}
        <button
          type="submit"
          className="w-full rounded-md bg-indigo-600 px-4 py-2 text-white hover:bg-indigo-700"
        >
          ログイン
        </button>
      </form>
      <p className="mt-4 text-center text-sm">
        アカウントをお持ちでない方は{" "}
        <Link href="/auth/signup" className="text-indigo-600 hover:underline">
          サインアップ
        </Link>
      </p>
    </div>
  );
}
```

- [ ] **Step 7: テストが通ることを確認**

```bash
bun test:small -- tests/small/app/auth/login.test.tsx
```

Expected: PASS

- [ ] **Step 8: サインアップの Server Action を作成**

```ts
// src/app/auth/signup/actions.ts
"use server";

import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";

export async function signup(formData: FormData) {
  const supabase = await createClient();

  const { error } = await supabase.auth.signUp({
    email: formData.get("email") as string,
    password: formData.get("password") as string,
    options: {
      data: {
        display_name: formData.get("displayName") as string,
      },
    },
  });

  if (error) {
    return { error: error.message };
  }

  redirect("/");
}
```

- [ ] **Step 9: サインアップページを作成**

```tsx
// src/app/auth/signup/page.tsx
"use client";

import { useState } from "react";
import { signup } from "./actions";
import Link from "next/link";

export default function SignupPage() {
  const [error, setError] = useState<string | null>(null);

  async function handleSubmit(formData: FormData) {
    const result = await signup(formData);
    if (result?.error) {
      setError(result.error);
    }
  }

  return (
    <div>
      <h1 className="mb-6 text-center text-2xl font-bold">Kairous</h1>
      <form action={handleSubmit} className="space-y-4">
        <div>
          <label htmlFor="displayName" className="block text-sm font-medium">
            表示名
          </label>
          <input
            id="displayName"
            name="displayName"
            type="text"
            required
            className="mt-1 block w-full rounded-md border px-3 py-2"
          />
        </div>
        <div>
          <label htmlFor="email" className="block text-sm font-medium">
            メールアドレス
          </label>
          <input
            id="email"
            name="email"
            type="email"
            required
            className="mt-1 block w-full rounded-md border px-3 py-2"
          />
        </div>
        <div>
          <label htmlFor="password" className="block text-sm font-medium">
            パスワード
          </label>
          <input
            id="password"
            name="password"
            type="password"
            required
            minLength={8}
            className="mt-1 block w-full rounded-md border px-3 py-2"
          />
        </div>
        {error && <p className="text-sm text-red-600">{error}</p>}
        <button
          type="submit"
          className="w-full rounded-md bg-indigo-600 px-4 py-2 text-white hover:bg-indigo-700"
        >
          サインアップ
        </button>
      </form>
      <p className="mt-4 text-center text-sm">
        アカウントをお持ちの方は{" "}
        <Link href="/auth/login" className="text-indigo-600 hover:underline">
          ログイン
        </Link>
      </p>
    </div>
  );
}
```

- [ ] **Step 10: コミット**

```bash
git add src/app/auth/ vitest.config.ts tests/small/ package.json
git commit -m "feat: 認証ページ（ログイン・サインアップ）"
```

---

### Task 9: ナビゲーションコンポーネント

**Files:**
- Create: `src/components/navigation/nav-items.ts`, `src/components/navigation/bottom-nav.tsx`, `src/components/navigation/sidebar.tsx`
- Test: `tests/components/navigation/bottom-nav.test.tsx`, `tests/components/navigation/sidebar.test.tsx`

- [ ] **Step 1: BottomNav のテストを作成**

```tsx
// tests/small/components/navigation/bottom-nav.test.tsx
import { render, screen } from "@testing-library/react";
import { describe, it, expect, vi } from "vitest";
import { BottomNav } from "@/components/navigation/bottom-nav";

vi.mock("next/navigation", () => ({
  usePathname: () => "/",
}));

describe("BottomNav", () => {
  it("renders 4 navigation items", () => {
    render(<BottomNav />);
    expect(screen.getByText("今日")).toBeInTheDocument();
    expect(screen.getByText("教材")).toBeInTheDocument();
    expect(screen.getByText("統計")).toBeInTheDocument();
    expect(screen.getByText("設定")).toBeInTheDocument();
  });
});
```

- [ ] **Step 2: テストが失敗することを確認**

```bash
bun test:small -- tests/small/components/navigation/bottom-nav.test.tsx
```

Expected: FAIL

- [ ] **Step 3: ナビゲーション項目の定義を作成**

```ts
// src/components/navigation/nav-items.ts
export const navItems = [
  { href: "/", label: "今日", icon: "calendar" },
  { href: "/materials", label: "教材", icon: "book" },
  { href: "/stats", label: "統計", icon: "chart" },
  { href: "/profile", label: "設定", icon: "settings" },
] as const;

// SVG path data for each icon
export const iconPaths: Record<string, string> = {
  calendar:
    "M8 7V3m8 4V3m-9 8h10M5 21h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v12a2 2 0 002 2z",
  book: "M12 6.253v13m0-13C10.832 5.477 9.246 5 7.5 5S4.168 5.477 3 6.253v13C4.168 18.477 5.754 18 7.5 18s3.332.477 4.5 1.253m0-13C13.168 5.477 14.754 5 16.5 5c1.747 0 3.332.477 4.5 1.253v13C19.832 18.477 18.247 18 16.5 18c-1.746 0-3.332.477-4.5 1.253",
  chart:
    "M9 19v-6a2 2 0 00-2-2H5a2 2 0 00-2 2v6a2 2 0 002 2h2a2 2 0 002-2zm0 0V9a2 2 0 012-2h2a2 2 0 012 2v10m-6 0a2 2 0 002 2h2a2 2 0 002-2m0 0V5a2 2 0 012-2h2a2 2 0 012 2v14a2 2 0 01-2 2h-2a2 2 0 01-2-2z",
  settings:
    "M10.325 4.317c.426-1.756 2.924-1.756 3.35 0a1.724 1.724 0 002.573 1.066c1.543-.94 3.31.826 2.37 2.37a1.724 1.724 0 001.066 2.573c1.756.426 1.756 2.924 0 3.35a1.724 1.724 0 00-1.066 2.573c.94 1.543-.826 3.31-2.37 2.37a1.724 1.724 0 00-2.573 1.066c-.426 1.756-2.924 1.756-3.35 0a1.724 1.724 0 00-2.573-1.066c-1.543.94-3.31-.826-2.37-2.37a1.724 1.724 0 00-1.066-2.573c-1.756-.426-1.756-2.924 0-3.35a1.724 1.724 0 001.066-2.573c-.94-1.543.826-3.31 2.37-2.37.996.608 2.296.07 2.572-1.065z M15 12a3 3 0 11-6 0 3 3 0 016 0z",
};
```

- [ ] **Step 4: BottomNav コンポーネントを作成**

```tsx
// src/components/navigation/bottom-nav.tsx
"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { navItems, iconPaths } from "./nav-items";

export function BottomNav() {
  const pathname = usePathname();

  return (
    <nav className="fixed bottom-0 left-0 right-0 border-t bg-white md:hidden">
      <ul className="flex justify-around">
        {navItems.map((item) => {
          const isActive =
            item.href === "/"
              ? pathname === "/"
              : pathname.startsWith(item.href);

          return (
            <li key={item.href}>
              <Link
                href={item.href}
                className={`flex flex-col items-center gap-1 px-3 py-2 text-xs ${
                  isActive
                    ? "text-indigo-600"
                    : "text-gray-500 hover:text-gray-900"
                }`}
              >
                <svg
                  className="h-6 w-6"
                  fill="none"
                  viewBox="0 0 24 24"
                  strokeWidth={1.5}
                  stroke="currentColor"
                >
                  <path
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    d={iconPaths[item.icon]}
                  />
                </svg>
                <span>{item.label}</span>
              </Link>
            </li>
          );
        })}
      </ul>
    </nav>
  );
}
```

- [ ] **Step 5: テストが通ることを確認**

```bash
bun test:small -- tests/small/components/navigation/bottom-nav.test.tsx
```

Expected: PASS

- [ ] **Step 6: Sidebar のテストを作成**

```tsx
// tests/small/components/navigation/sidebar.test.tsx
import { render, screen } from "@testing-library/react";
import { describe, it, expect, vi } from "vitest";
import { Sidebar } from "@/components/navigation/sidebar";

vi.mock("next/navigation", () => ({
  usePathname: () => "/",
}));

describe("Sidebar", () => {
  it("renders Kairous brand and 4 navigation items", () => {
    render(<Sidebar />);
    expect(screen.getByText("Kairous")).toBeInTheDocument();
    expect(screen.getByText("今日")).toBeInTheDocument();
    expect(screen.getByText("教材")).toBeInTheDocument();
    expect(screen.getByText("統計")).toBeInTheDocument();
    expect(screen.getByText("設定")).toBeInTheDocument();
  });
});
```

- [ ] **Step 7: テストが失敗することを確認**

```bash
bun test:small -- tests/small/components/navigation/sidebar.test.tsx
```

Expected: FAIL

- [ ] **Step 8: Sidebar コンポーネントを作成**

```tsx
// src/components/navigation/sidebar.tsx
"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { navItems, iconPaths } from "./nav-items";

export function Sidebar() {
  const pathname = usePathname();

  return (
    <aside className="hidden h-dvh w-56 shrink-0 border-r bg-white md:block">
      <div className="p-4">
        <h1 className="text-xl font-bold">Kairous</h1>
      </div>
      <nav>
        <ul className="space-y-1 px-2">
          {navItems.map((item) => {
            const isActive =
              item.href === "/"
                ? pathname === "/"
                : pathname.startsWith(item.href);

            return (
              <li key={item.href}>
                <Link
                  href={item.href}
                  className={`flex items-center gap-3 rounded-md px-3 py-2 text-sm ${
                    isActive
                      ? "bg-indigo-50 text-indigo-600"
                      : "text-gray-700 hover:bg-gray-50"
                  }`}
                >
                  <svg
                    className="h-5 w-5"
                    fill="none"
                    viewBox="0 0 24 24"
                    strokeWidth={1.5}
                    stroke="currentColor"
                  >
                    <path
                      strokeLinecap="round"
                      strokeLinejoin="round"
                      d={iconPaths[item.icon]}
                    />
                  </svg>
                  <span>{item.label}</span>
                </Link>
              </li>
            );
          })}
        </ul>
      </nav>
    </aside>
  );
}
```

- [ ] **Step 9: テストが通ることを確認**

```bash
bun test:small -- tests/small/components/navigation/sidebar.test.tsx
```

Expected: PASS

- [ ] **Step 10: コミット**

```bash
git add src/components/navigation/ tests/small/components/navigation/
git commit -m "feat: BottomNav・Sidebar ナビゲーションコンポーネント"
```

---

### Task 10: メインレイアウトとプレースホルダーページ

**Files:**
- Create: `src/app/(main)/layout.tsx`, `src/app/(main)/page.tsx`, `src/app/(main)/materials/page.tsx`, `src/app/(main)/stats/page.tsx`, `src/app/(main)/profile/page.tsx`
- Modify: `src/app/layout.tsx` (root layout)

- [ ] **Step 1: Root layout を更新**

```tsx
// src/app/layout.tsx
import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "Kairous",
  description: "Learn smarter with science-backed methods",
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="ja">
      <body className="bg-gray-50 text-gray-900 antialiased">{children}</body>
    </html>
  );
}
```

- [ ] **Step 2: メインレイアウトを作成（BottomNav + Sidebar）**

```tsx
// src/app/(main)/layout.tsx
import { BottomNav } from "@/components/navigation/bottom-nav";
import { Sidebar } from "@/components/navigation/sidebar";

export default function MainLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <div className="flex min-h-dvh">
      <Sidebar />
      <main className="flex-1 pb-16 md:pb-0">{children}</main>
      <BottomNav />
    </div>
  );
}
```

- [ ] **Step 3: 今日ページ（プレースホルダー）を作成**

```tsx
// src/app/(main)/page.tsx
export default function TodayPage() {
  return (
    <div className="p-4">
      <h2 className="text-lg font-bold">今日</h2>
      <p className="mt-2 text-gray-500">due のある教材がここに表示されます</p>
    </div>
  );
}
```

- [ ] **Step 4: 残りのプレースホルダーページを作成**

```tsx
// src/app/(main)/materials/page.tsx
export default function MaterialsPage() {
  return (
    <div className="p-4">
      <h2 className="text-lg font-bold">教材</h2>
      <p className="mt-2 text-gray-500">教材一覧がここに表示されます</p>
    </div>
  );
}
```

```tsx
// src/app/(main)/stats/page.tsx
export default function StatsPage() {
  return (
    <div className="p-4">
      <h2 className="text-lg font-bold">統計</h2>
      <p className="mt-2 text-gray-500">学習統計がここに表示されます</p>
    </div>
  );
}
```

```ts
// src/app/(main)/profile/actions.ts
"use server";

import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";

export async function signOut() {
  const supabase = await createClient();
  const { error } = await supabase.auth.signOut();
  if (error) {
    return { error: error.message };
  }
  redirect("/auth/login");
}
```

```tsx
// src/app/(main)/profile/page.tsx
import { createClient } from "@/lib/supabase/server";
import { signOut } from "./actions";

export default async function ProfilePage() {
  const supabase = await createClient();

  const {
    data: { user },
  } = await supabase.auth.getUser();

  return (
    <div className="p-4">
      <h2 className="text-lg font-bold">設定</h2>
      <div className="mt-4 space-y-4">
        <p className="text-sm text-gray-500">{user?.email}</p>
        <form action={signOut}>
          <button
            type="submit"
            className="rounded-md bg-gray-200 px-4 py-2 text-sm hover:bg-gray-300"
          >
            ログアウト
          </button>
        </form>
      </div>
    </div>
  );
}
```

- [ ] **Step 5: 旧 src/app/page.tsx を削除**

`src/app/page.tsx` は `(main)/page.tsx` に移動したため削除する。

```bash
git rm src/app/page.tsx
```

- [ ] **Step 6: dev サーバーで動作確認**

```bash
bun dev
```

ブラウザで `http://localhost:3000` にアクセス。未認証状態なので `/auth/login` にリダイレクトされるはず。

- [ ] **Step 7: 全テストを実行**

```bash
bun test:small
```

Expected: 全 Small テスト PASS

- [ ] **Step 8: コミット**

```bash
git add src/app/ tests/
git commit -m "feat: メインレイアウト（BottomNav/Sidebar）とプレースホルダーページ"
```

---

### Task 11: PROGRESS.md を更新

**Files:**
- Modify: `PROGRESS.md`

- [ ] **Step 1: PROGRESS.md を更新**

```markdown
# Kairous Progress

## Step 1: Screen Flow Design -- DONE (2026-04-05)

- Spec: docs/superpowers/specs/2026-04-05-screen-flow-design.md

## Step 2: Foundation (Project + DB + Auth + Layout) -- DONE

- Next.js 16 + Tailwind 4 + TypeScript 6 project initialized
- Supabase: 3 migrations (core domain, session recording, RLS)
- 7 learning methods seeded
- Auth: login/signup with Supabase Auth
- Layout: BottomNav (mobile) + Sidebar (PC), 4 placeholder pages
- Plan: docs/superpowers/plans/2026-04-05-foundation.md

## Step 3: Core Features (Materials + Sessions + FSRS) -- PENDING

## Step 4: Dashboard & Polish (Stats + Wakeful Rest + Interleaving) -- PENDING
```

- [ ] **Step 2: コミット**

```bash
git add PROGRESS.md
git commit -m "docs: PROGRESS.md を Step 2 完了で更新"
```

---

### Task 12: Lefthook（Git Hooks）セットアップ

> 注: dev-infrastructure 計画の Task 3 で Small/Medium 対応版に更新される。ここでは初期セットアップのみ。

**Files:**
- Create: `lefthook.yml`

- [ ] **Step 1: lefthook をインストール**

```bash
bun add -D lefthook
```

- [ ] **Step 2: lefthook.yml を作成**

```yaml
# lefthook.yml
pre-commit:
  parallel: true
  commands:
    lint:
      run: bun run lint --quiet
    typecheck:
      run: bun run typecheck
    test:
      run: bun test

pre-push:
  commands:
    full-check:
      run: bun run lint && bun run typecheck && bun test
```

- [ ] **Step 3: lefthook をインストール（git hooks 登録）**

```bash
bunx lefthook install
```

Expected: `.git/hooks/pre-commit` と `.git/hooks/pre-push` が生成される。

- [ ] **Step 4: package.json の scripts を更新**

`package.json` の scripts に以下を追加:

```json
{
  "scripts": {
    "dev": "next dev --turbopack",
    "build": "next build",
    "start": "next start",
    "lint": "next lint",
    "typecheck": "tsc --noEmit",
    "test": "vitest run",
    "test:watch": "vitest",
    "check": "bun run lint && bun run typecheck && bun test:small",
    "prepare": "lefthook install"
  }
}
```

`prepare` スクリプトにより `bun install` 時に lefthook が自動登録される。

- [ ] **Step 5: 動作確認**

```bash
bun run check
```

Expected: lint, typecheck, test が全て PASS。

- [ ] **Step 6: コミット**

```bash
git add lefthook.yml package.json
git commit -m "chore: lefthook セットアップ（pre-commit: lint/typecheck/test）"
```

---

### Task 13: GitHub Actions CI

> 注: dev-infrastructure 計画の Task 4 で Small/Medium 分離版に更新される。ここでは初期セットアップのみ。

**Files:**
- Create: `.github/workflows/ci.yml`

- [ ] **Step 1: CI ワークフローを作成**

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

jobs:
  check:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4

      - uses: oven-sh/setup-bun@v2
        with:
          bun-version: latest

      - name: Install dependencies
        run: bun install --frozen-lockfile

      - name: Lint
        run: bun run lint

      - name: Type check
        run: bun run typecheck

      - name: Test
        run: bun test

  migration:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4

      - uses: supabase/setup-cli@v1
        with:
          version: latest

      - name: Start Supabase
        run: supabase start -x realtime,storage,imgproxy,inbucket,pgadmin-schema-diff,migra,studio,edge-runtime,logflare,vector,supavisor

      - name: Verify migrations
        run: supabase db lint
```

- [ ] **Step 2: コミット**

```bash
git add .github/workflows/ci.yml
git commit -m "chore: GitHub Actions CI（lint/typecheck/test/migration）"
```

---

### Task 14: 運用ルールの定義

**Files:**
- Modify: `CLAUDE.md`

- [ ] **Step 1: CLAUDE.md にブランチ戦略と運用ルールを追記**

CLAUDE.md の末尾に以下を追加:

```markdown
## Branch Strategy

- `main`: 常にデプロイ可能な状態
- `feat/<name>`: 機能開発ブランチ（main から分岐、PR でマージ）
- `fix/<name>`: バグ修正ブランチ

## CI / Quality Gate

- pre-commit (lefthook): lint + typecheck + test
- pre-push (lefthook): full check (lint + typecheck + test)
- GitHub Actions: push to main / PR で自動実行
- Migration check: Supabase CLI で migration lint

## Commit Rules

Conventional Commits: `<type>: <日本語の説明>`

| type | 用途 |
|------|------|
| feat | 新機能 |
| fix | バグ修正 |
| docs | ドキュメント |
| refactor | リファクタリング |
| test | テスト |
| chore | ビルド、CI |

## PR Rules

- PR タイトルは Conventional Commits 形式
- CI が全て緑であること
- self-review を実施してからマージ
```

- [ ] **Step 2: コミット**

```bash
git add CLAUDE.md
git commit -m "docs: ブランチ戦略・CI・運用ルールを CLAUDE.md に追記"
```

---

### Task 15: セキュリティヘッダーと環境変数バリデーション

**Files:**
- Create: `src/lib/env.ts`
- Modify: `next.config.ts`

- [ ] **Step 1: 環境変数のバリデーションモジュールを作成**

起動時に必須環境変数が設定されていなければ即座に失敗させる。

```ts
// src/lib/env.ts

// NEXT_PUBLIC_ 変数はリテラル文字列で参照する必要がある
// （Next.js がビルド時にインライン化するため、動的キーアクセスはクライアントで失敗する）
export const env = {
  NEXT_PUBLIC_SUPABASE_URL:
    process.env.NEXT_PUBLIC_SUPABASE_URL ??
    (() => { throw new Error("Missing NEXT_PUBLIC_SUPABASE_URL"); })(),
  NEXT_PUBLIC_SUPABASE_ANON_KEY:
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY ??
    (() => { throw new Error("Missing NEXT_PUBLIC_SUPABASE_ANON_KEY"); })(),
} as const;

// サーバー専用環境変数 — Server Components / Actions / Middleware からのみ import すること
function requireServerEnv(key: string): string {
  if (typeof window !== "undefined") {
    throw new Error(`Server-only env '${key}' accessed on client`);
  }
  const value = process.env[key];
  if (!value) {
    throw new Error(`Missing required environment variable: ${key}`);
  }
  return value;
}

export const serverEnv = {
  get SUPABASE_SERVICE_ROLE_KEY() {
    return requireServerEnv("SUPABASE_SERVICE_ROLE_KEY");
  },
} as const;
```

- [ ] **Step 2: next.config.ts にセキュリティヘッダーを追加**

```ts
// next.config.ts
import type { NextConfig } from "next";

const securityHeaders = [
  {
    key: "X-DNS-Prefetch-Control",
    value: "on",
  },
  {
    key: "X-Frame-Options",
    value: "SAMEORIGIN",
  },
  {
    key: "X-Content-Type-Options",
    value: "nosniff",
  },
  {
    key: "Referrer-Policy",
    value: "strict-origin-when-cross-origin",
  },
  {
    key: "Permissions-Policy",
    value: "camera=(), microphone=(), geolocation=()",
  },
  {
    key: "Content-Security-Policy",
    value: [
      "default-src 'self'",
      // 開発環境: Turbopack HMR に unsafe-eval が必要。本番では除外
      process.env.NODE_ENV === "development"
        ? "script-src 'self' 'unsafe-inline' 'unsafe-eval'"
        : "script-src 'self' 'unsafe-inline'",
      "style-src 'self' 'unsafe-inline'",
      `connect-src 'self' ${process.env.NEXT_PUBLIC_SUPABASE_URL || "https://*.supabase.co"}`,
      "img-src 'self' data: blob:",
      "font-src 'self'",
      "frame-ancestors 'none'",
    ].join("; "),
  },
];

const nextConfig: NextConfig = {
  async headers() {
    return [
      {
        source: "/(.*)",
        headers: securityHeaders,
      },
    ];
  },
};

export default nextConfig;
```

- [ ] **Step 3: コミット**

```bash
git add src/lib/env.ts next.config.ts
git commit -m "feat: セキュリティヘッダーと環境変数バリデーション"
```

---

### Task 16: サプライチェーン攻撃対策

**Files:**
- Modify: `.github/workflows/ci.yml`, `lefthook.yml`
- Create: `.github/workflows/dependency-audit.yml`

- [ ] **Step 1: 依存パッケージ監査の定期実行ワークフローを作成**

```yaml
# .github/workflows/dependency-audit.yml
name: Dependency Audit

on:
  schedule:
    # Weekly on Monday 09:00 JST (00:00 UTC)
    - cron: "0 0 * * 1"
  pull_request:
    paths:
      - "package.json"
      - "bun.lock"

jobs:
  audit:
    runs-on: ubuntu-latest
    permissions:
      issues: write
    steps:
      - uses: actions/checkout@11bd71901bbe5b1630ceea73d27597364c9af683 # v4.2.2

      - uses: oven-sh/setup-bun@735343b667d3e6f658f44d0eca948eb6282f2b76 # v2.0.2
        with:
          bun-version: latest

      - name: Install dependencies
        run: bun install --frozen-lockfile

      - name: Audit dependencies
        run: |
          # bun に audit コマンドがないため npm audit を使用
          npm install --package-lock-only --ignore-scripts 2>/dev/null
          npm audit --audit-level=moderate
```

- [ ] **Step 2: ci.yml を SHA 固定版に更新**

Task 13 で作成した `ci.yml` を、actions の SHA ハッシュ固定 + permissions 明示版に全体更新する:

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
  check:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@11bd71901bbe5b1630ceea73d27597364c9af683 # v4.2.2

      - uses: oven-sh/setup-bun@735343b667d3e6f658f44d0eca948eb6282f2b76 # v2.0.2
        with:
          bun-version: latest

      - name: Install dependencies
        run: bun install --frozen-lockfile

      - name: Lint
        run: bun run lint

      - name: Type check
        run: bun run typecheck

      - name: Test
        run: bun test

  migration:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@11bd71901bbe5b1630ceea73d27597364c9af683 # v4.2.2

      - uses: supabase/setup-cli@1ef5e2b957e73830008a28dba77c5f30cfcb7fbb # v1.4.2
        with:
          version: latest

      - name: Start Supabase
        run: supabase start -x realtime,storage,imgproxy,inbucket,pgadmin-schema-diff,migra,studio,edge-runtime,logflare,vector,supavisor

      - name: Verify migrations
        run: supabase db lint
```

- [ ] **Step 3: trustedDependencies でスクリプト実行を制限**

bun はデフォルトで依存パッケージの postinstall スクリプトを実行しない。`trustedDependencies` に明示的にリストしたパッケージのみ許可する。`package.json` に以下を追加:

```json
{
  "trustedDependencies": [
    "lefthook",
    "supabase"
  ]
}
```

- [ ] **Step 4: コミット**

```bash
git add .github/workflows/ package.json
git commit -m "chore: サプライチェーン攻撃対策（lockfile強制・依存監査・SHA固定・スクリプト制限）"
```

---

### Task 17: セキュリティルールを CLAUDE.md に追記

**Files:**
- Modify: `CLAUDE.md`

- [ ] **Step 1: CLAUDE.md にセキュリティセクションを追記**

CLAUDE.md の末尾に以下を追加:

```markdown
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
```

- [ ] **Step 2: CLAUDE.md にライブラリ活用と共通化の方針を追記**

CLAUDE.md に以下を追加:

```markdown
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
```

- [ ] **Step 3: コミット**

```bash
git add CLAUDE.md
git commit -m "docs: セキュリティルール・ライブラリ活用方針を CLAUDE.md に追記"
```
