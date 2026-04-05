# 教材管理 (Materials) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 教材の CRUD、学習手法の紐付け、カード管理を実装し、Kairous の Core Features 第1サブプロジェクトを完成させる

**Architecture:** shadcn/ui + Radix UI をベースに、Server Actions (zod validation) → Supabase Server Client (RLS) → PostgreSQL のデータフロー。next-themes でダーク/ライトモード対応。ドメインコンポーネントは `src/components/` に、shadcn/ui プリミティブは `src/components/ui/` に配置。

**Tech Stack:** Next.js 16 (App Router), TypeScript, Tailwind CSS 4, shadcn/ui, Radix UI, next-themes, lucide-react, sonner, date-fns, zod, Supabase, vitest + testing-library

---

## File Structure

```
src/
  app/
    layout.tsx                              # MODIFY: ThemeProvider wrapper
    globals.css                             # MODIFY: shadcn/ui CSS variables
    (main)/
      materials/
        page.tsx                            # REPLACE: materials list page
        loading.tsx                         # CREATE: shimmer skeleton
        new/
          page.tsx                          # CREATE: 3-step wizard
        [id]/
          page.tsx                          # CREATE: material detail (tabs)
          loading.tsx                       # CREATE: shimmer skeleton
          edit/
            page.tsx                        # CREATE: material edit form
          cards/
            new/
              page.tsx                      # CREATE: card add
            [cardId]/
              edit/
                page.tsx                    # CREATE: card edit
  components/
    ui/                                     # CREATE via shadcn CLI: button, input, textarea, label, select, checkbox, tabs, card, badge, sheet, dialog, separator, scroll-area, skeleton, sonner
    material-card.tsx                       # CREATE: material list card
    method-chip.tsx                         # CREATE: method badge
    method-selector.tsx                     # CREATE: method checkbox list
    subject-selector.tsx                    # CREATE: subject dropdown + dialog
    card-editor.tsx                         # CREATE: card front/back form
    search-bar.tsx                          # CREATE: debounced search
    empty-state.tsx                         # CREATE: empty state display
    theme-toggle.tsx                        # CREATE: theme switcher
    theme-provider.tsx                      # CREATE: next-themes provider
  lib/
    actions/
      subjects.ts                           # CREATE: subject CRUD
      materials.ts                          # CREATE: material CRUD
      cards.ts                              # CREATE: card CRUD
      material-methods.ts                   # CREATE: method binding
    constants.ts                            # CREATE: method slugs, categories, colors
    validations/
      materials.ts                          # CREATE: zod schemas
    types/
      materials.ts                          # CREATE: MaterialWithMethods, MaterialDetail
tests/
  small/
    lib/
      constants.test.ts                     # CREATE: constants tests
      validations/
        materials.test.ts                   # CREATE: zod schema tests
    components/
      method-chip.test.tsx                  # CREATE
      method-selector.test.tsx              # CREATE
      empty-state.test.tsx                  # CREATE
      search-bar.test.tsx                   # CREATE
      card-editor.test.tsx                  # CREATE
  medium/
    lib/actions/
      subjects.test.ts                      # CREATE
      materials.test.ts                     # CREATE
      cards.test.ts                         # CREATE
      material-methods.test.ts              # CREATE
```

---

### Task 1: shadcn/ui 初期化 + テーマシステム

**Files:**
- Modify: `src/app/globals.css`
- Modify: `src/app/layout.tsx`
- Modify: `src/app/(main)/layout.tsx`
- Create: `src/components/theme-provider.tsx`
- Create: `src/components/theme-toggle.tsx`
- Create: `src/components/ui/` (shadcn CLI で生成)
- Modify: `package.json`
- Create: `src/lib/utils.ts`
- Test: `tests/small/components/theme-toggle.test.tsx`

- [ ] **Step 1: shadcn/ui を初期化**

Run: `cd /Users/mikiya/ws/kairous && bunx shadcn@latest init`

CLI のプロンプトに以下で回答:
- Style: New York
- Base color: Neutral
- CSS variables: yes

これにより `components.json`, `src/lib/utils.ts`, `src/app/globals.css` の CSS variables が生成される。

- [ ] **Step 2: globals.css のダークモード対応を確認・調整**

shadcn init が生成した `globals.css` に `:root` と `.dark` の CSS 変数が含まれていることを確認。Tailwind CSS 4 の `@import "tailwindcss"` が保持されていることを確認。

shadcn/ui init 後の `globals.css` は以下の構成になるはず:

```css
@import "tailwindcss";

@layer base {
  :root {
    --background: 0 0% 100%;
    --foreground: 240 10% 3.9%;
    --card: 0 0% 100%;
    --card-foreground: 240 10% 3.9%;
    --popover: 0 0% 100%;
    --popover-foreground: 240 10% 3.9%;
    --primary: 240 5.9% 10%;
    --primary-foreground: 0 0% 98%;
    --secondary: 240 4.8% 95.9%;
    --secondary-foreground: 240 5.9% 10%;
    --muted: 240 4.8% 95.9%;
    --muted-foreground: 240 3.8% 46.1%;
    --accent: 240 4.8% 95.9%;
    --accent-foreground: 240 5.9% 10%;
    --destructive: 0 84.2% 60.2%;
    --destructive-foreground: 0 0% 98%;
    --border: 240 5.9% 90%;
    --input: 240 5.9% 90%;
    --ring: 240 5.9% 10%;
    --radius: 0.5rem;
  }

  .dark {
    --background: 240 10% 3.9%;
    --foreground: 0 0% 98%;
    --card: 240 10% 3.9%;
    --card-foreground: 0 0% 98%;
    --popover: 240 10% 3.9%;
    --popover-foreground: 0 0% 98%;
    --primary: 0 0% 98%;
    --primary-foreground: 240 5.9% 10%;
    --secondary: 240 3.7% 15.9%;
    --secondary-foreground: 0 0% 98%;
    --muted: 240 3.7% 15.9%;
    --muted-foreground: 240 5% 64.9%;
    --accent: 240 3.7% 15.9%;
    --accent-foreground: 0 0% 98%;
    --destructive: 0 62.8% 30.6%;
    --destructive-foreground: 0 0% 98%;
    --border: 240 3.7% 15.9%;
    --input: 240 3.7% 15.9%;
    --ring: 240 4.9% 83.9%;
  }
}

@layer base {
  * {
    @apply border-border;
  }
  body {
    @apply bg-background text-foreground;
  }
}
```

生成結果を確認し、足りない変数があれば追加する。

- [ ] **Step 3: 依存パッケージをインストール**

Run: `cd /Users/mikiya/ws/kairous && bun add next-themes@0.4.6 lucide-react@0.515.0 sonner@2.0.3 date-fns@4.1.0`

- [ ] **Step 4: shadcn/ui コンポーネントを一括追加**

Run:
```bash
cd /Users/mikiya/ws/kairous
bunx shadcn@latest add button input textarea label select checkbox tabs card badge sheet dialog separator scroll-area skeleton sonner
```

これで `src/components/ui/` に各コンポーネントが生成される。

- [ ] **Step 5: ThemeProvider を作成**

```tsx
// src/components/theme-provider.tsx
"use client";

import { ThemeProvider as NextThemesProvider } from "next-themes";

export function ThemeProvider({ children }: { children: React.ReactNode }) {
  return (
    <NextThemesProvider
      attribute="class"
      defaultTheme="system"
      enableSystem
      disableTransitionOnChange
    >
      {children}
    </NextThemesProvider>
  );
}
```

- [ ] **Step 6: ThemeToggle を作成**

```tsx
// src/components/theme-toggle.tsx
"use client";

import { useTheme } from "next-themes";
import { useEffect, useState } from "react";
import { Monitor, Moon, Sun } from "lucide-react";

const themes = [
  { value: "system", label: "システム", Icon: Monitor },
  { value: "light", label: "ライト", Icon: Sun },
  { value: "dark", label: "ダーク", Icon: Moon },
] as const;

export function ThemeToggle() {
  const { theme, setTheme } = useTheme();
  const [mounted, setMounted] = useState(false);

  // next-themes はクライアント側でのみ動作するため、hydration mismatch を防ぐ
  useEffect(() => {
    setMounted(true);
  }, []);

  if (!mounted) {
    return <div className="h-9" aria-hidden />;
  }

  return (
    <div className="flex gap-1 rounded-lg bg-muted p-1">
      {themes.map(({ value, label, Icon }) => (
        <button
          key={value}
          onClick={() => setTheme(value)}
          className={`flex items-center gap-1.5 rounded-md px-3 py-1.5 text-sm transition-colors ${
            theme === value
              ? "bg-background text-foreground shadow-sm"
              : "text-muted-foreground hover:text-foreground"
          }`}
          aria-label={`${label}テーマに切り替え`}
        >
          <Icon className="h-4 w-4" />
          <span className="hidden sm:inline">{label}</span>
        </button>
      ))}
    </div>
  );
}
```

- [ ] **Step 7: Root Layout に ThemeProvider を追加**

`src/app/layout.tsx` を修正:

```tsx
// src/app/layout.tsx
import type { Metadata } from "next";
import { ThemeProvider } from "@/components/theme-provider";
import { Toaster } from "@/components/ui/sonner";
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
    <html lang="ja" suppressHydrationWarning>
      <body className="bg-background text-foreground antialiased">
        <ThemeProvider>
          {children}
          <Toaster />
        </ThemeProvider>
      </body>
    </html>
  );
}
```

- [ ] **Step 8: Sidebar / BottomNav をテーマ対応に更新**

`src/components/navigation/sidebar.tsx` のハードコードされた色を shadcn/ui トークンに更新:

```tsx
// aside の className を更新
// before: "hidden h-dvh w-56 shrink-0 border-r bg-white md:block"
// after:  "hidden h-dvh w-56 shrink-0 border-r bg-card md:block"

// isActive の className を更新
// before: "bg-indigo-50 text-indigo-600"
// after:  "bg-primary/10 text-primary"

// inactive の className を更新
// before: "text-gray-700 hover:bg-gray-50"
// after:  "text-muted-foreground hover:bg-muted"
```

`src/components/navigation/bottom-nav.tsx` も同様に更新する（ハードコードされた色をテーマトークンに変換）。

- [ ] **Step 9: ThemeToggle のテストを書く**

```tsx
// tests/small/components/theme-toggle.test.tsx
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";
import { ThemeToggle } from "@/components/theme-toggle";

// next-themes をモック
const mockSetTheme = vi.fn();
vi.mock("next-themes", () => ({
  useTheme: () => ({ theme: "system", setTheme: mockSetTheme }),
}));

describe("ThemeToggle", () => {
  it("renders three theme options after mount", () => {
    render(<ThemeToggle />);

    expect(screen.getByLabelText("システムテーマに切り替え")).toBeInTheDocument();
    expect(screen.getByLabelText("ライトテーマに切り替え")).toBeInTheDocument();
    expect(screen.getByLabelText("ダークテーマに切り替え")).toBeInTheDocument();
  });

  it("calls setTheme when clicking a theme option", async () => {
    const user = userEvent.setup();
    render(<ThemeToggle />);

    await user.click(screen.getByLabelText("ダークテーマに切り替え"));

    expect(mockSetTheme).toHaveBeenCalledWith("dark");
  });
});
```

- [ ] **Step 10: テスト実行**

Run: `cd /Users/mikiya/ws/kairous && bun test:small -- --run tests/small/components/theme-toggle.test.tsx`
Expected: PASS

- [ ] **Step 11: 型チェック + lint**

Run: `cd /Users/mikiya/ws/kairous && bun run typecheck && bun run lint`
Expected: エラーなし

- [ ] **Step 12: コミット**

```bash
cd /Users/mikiya/ws/kairous
git add src/components/ui/ src/components/theme-provider.tsx src/components/theme-toggle.tsx src/app/layout.tsx src/app/globals.css src/lib/utils.ts components.json package.json bun.lock src/components/navigation/ tests/small/components/theme-toggle.test.tsx
git commit -m "feat: shadcn/ui init + theme system (dark/light/system)"
```

---

### Task 2: 定数・バリデーション・型定義

**Files:**
- Create: `src/lib/constants.ts`
- Create: `src/lib/validations/materials.ts`
- Create: `src/lib/types/materials.ts`
- Test: `tests/small/lib/constants.test.ts`
- Test: `tests/small/lib/validations/materials.test.ts`

- [ ] **Step 1: constants のテストを書く**

```ts
// tests/small/lib/constants.test.ts
import { describe, expect, it } from "vitest";
import {
  MATERIAL_METHOD_SLUGS,
  METHOD_CATEGORIES,
  getMethodColorClasses,
} from "@/lib/constants";

describe("MATERIAL_METHOD_SLUGS", () => {
  it("contains only methods that can be bound to materials", () => {
    expect(MATERIAL_METHOD_SLUGS).toEqual([
      "srs",
      "active_recall",
      "elaboration",
      "pomodoro",
    ]);
  });
});

describe("METHOD_CATEGORIES", () => {
  it("maps each category to label and slugs", () => {
    expect(METHOD_CATEGORIES.memory.label).toBe("記憶");
    expect(METHOD_CATEGORIES.memory.slugs).toContain("srs");
    expect(METHOD_CATEGORIES.memory.slugs).toContain("active_recall");
  });
});

describe("getMethodColorClasses", () => {
  it("returns indigo classes for memory category", () => {
    const colors = getMethodColorClasses("memory");
    expect(colors.light).toBe("bg-indigo-50 text-indigo-600");
    expect(colors.dark).toBe("dark:bg-indigo-950 dark:text-indigo-400");
  });

  it("returns green classes for comprehension category", () => {
    const colors = getMethodColorClasses("comprehension");
    expect(colors.light).toBe("bg-green-50 text-green-600");
  });

  it("returns amber classes for focus category", () => {
    const colors = getMethodColorClasses("focus");
    expect(colors.light).toBe("bg-amber-50 text-amber-600");
  });

  it("returns purple classes for consolidation category", () => {
    const colors = getMethodColorClasses("consolidation");
    expect(colors.light).toBe("bg-purple-50 text-purple-600");
  });

  it("returns gray classes for general category", () => {
    const colors = getMethodColorClasses("general");
    expect(colors.light).toBe("bg-gray-100 text-gray-600");
  });

  it("returns gray classes for unknown category", () => {
    const colors = getMethodColorClasses("unknown");
    expect(colors.light).toBe("bg-gray-100 text-gray-600");
  });
});
```

- [ ] **Step 2: テスト実行して失敗を確認**

Run: `cd /Users/mikiya/ws/kairous && bun test:small -- --run tests/small/lib/constants.test.ts`
Expected: FAIL — モジュールが存在しない

- [ ] **Step 3: constants.ts を実装**

```ts
// src/lib/constants.ts

// 教材に紐付け可能な手法（ウィザード Step 2 で表示）
// interleaving, wakeful_rest, free_study はセッション時のみ選択可能
export const MATERIAL_METHOD_SLUGS = [
  "srs",
  "active_recall",
  "elaboration",
  "pomodoro",
] as const;

export type MaterialMethodSlug = (typeof MATERIAL_METHOD_SLUGS)[number];

// カードベース手法: カードタブ・Step 3 を表示する判定に使用
export const CARD_BASED_SLUGS = ["srs", "active_recall"] as const;

export type MethodCategory =
  | "memory"
  | "comprehension"
  | "focus"
  | "consolidation"
  | "general";

export const METHOD_CATEGORIES: Record<
  MethodCategory,
  { label: string; slugs: string[] }
> = {
  memory: { label: "記憶", slugs: ["srs", "active_recall"] },
  comprehension: { label: "理解", slugs: ["interleaving", "elaboration"] },
  focus: { label: "集中", slugs: ["pomodoro"] },
  consolidation: { label: "統合", slugs: ["wakeful_rest"] },
  general: { label: "汎用", slugs: ["free_study"] },
};

// 手法ごとの1行説明（ウィザード Step 2 で表示）
export const METHOD_DESCRIPTIONS: Record<string, string> = {
  srs: "間隔を空けて復習し、長期記憶に定着させる",
  active_recall: "カードを見て能動的に思い出す練習をする",
  elaboration: "「なぜ?」を問い、自分の言葉で説明する",
  pomodoro: "25分集中 + 5分休憩のサイクルで学習する",
};

type MethodColors = {
  light: string;
  dark: string;
};

const CATEGORY_COLORS: Record<MethodCategory, MethodColors> = {
  memory: {
    light: "bg-indigo-50 text-indigo-600",
    dark: "dark:bg-indigo-950 dark:text-indigo-400",
  },
  comprehension: {
    light: "bg-green-50 text-green-600",
    dark: "dark:bg-green-950 dark:text-green-400",
  },
  focus: {
    light: "bg-amber-50 text-amber-600",
    dark: "dark:bg-amber-950 dark:text-amber-400",
  },
  consolidation: {
    light: "bg-purple-50 text-purple-600",
    dark: "dark:bg-purple-950 dark:text-purple-400",
  },
  general: {
    light: "bg-gray-100 text-gray-600",
    dark: "dark:bg-gray-800 dark:text-gray-400",
  },
};

export function getMethodColorClasses(category: string): MethodColors {
  return (
    CATEGORY_COLORS[category as MethodCategory] ?? CATEGORY_COLORS.general
  );
}

// srs_states 初期化のデフォルト値
export const SRS_DEFAULTS = {
  stability: 1.0,
  difficulty: 5.0,
} as const;
```

- [ ] **Step 4: テスト実行して成功を確認**

Run: `cd /Users/mikiya/ws/kairous && bun test:small -- --run tests/small/lib/constants.test.ts`
Expected: PASS

- [ ] **Step 5: validations のテストを書く**

```ts
// tests/small/lib/validations/materials.test.ts
import { describe, expect, it } from "vitest";
import {
  createMaterialSchema,
  updateMaterialSchema,
  createSubjectSchema,
  cardSchema,
} from "@/lib/validations/materials";

describe("createMaterialSchema", () => {
  it("accepts valid material data", () => {
    const result = createMaterialSchema.safeParse({
      title: "英単語 TOEIC 600",
      subject_id: "550e8400-e29b-41d4-a716-446655440000",
      method_ids: ["550e8400-e29b-41d4-a716-446655440001"],
    });
    expect(result.success).toBe(true);
  });

  it("rejects empty title", () => {
    const result = createMaterialSchema.safeParse({
      title: "",
      subject_id: "550e8400-e29b-41d4-a716-446655440000",
      method_ids: ["550e8400-e29b-41d4-a716-446655440001"],
    });
    expect(result.success).toBe(false);
  });

  it("rejects title over 200 chars", () => {
    const result = createMaterialSchema.safeParse({
      title: "a".repeat(201),
      subject_id: "550e8400-e29b-41d4-a716-446655440000",
      method_ids: ["550e8400-e29b-41d4-a716-446655440001"],
    });
    expect(result.success).toBe(false);
  });

  it("rejects empty method_ids", () => {
    const result = createMaterialSchema.safeParse({
      title: "Test",
      subject_id: "550e8400-e29b-41d4-a716-446655440000",
      method_ids: [],
    });
    expect(result.success).toBe(false);
  });

  it("accepts optional description", () => {
    const result = createMaterialSchema.safeParse({
      title: "Test",
      description: "Some description",
      subject_id: "550e8400-e29b-41d4-a716-446655440000",
      method_ids: ["550e8400-e29b-41d4-a716-446655440001"],
    });
    expect(result.success).toBe(true);
  });

  it("rejects invalid subject_id format", () => {
    const result = createMaterialSchema.safeParse({
      title: "Test",
      subject_id: "not-a-uuid",
      method_ids: ["550e8400-e29b-41d4-a716-446655440001"],
    });
    expect(result.success).toBe(false);
  });
});

describe("updateMaterialSchema", () => {
  it("accepts valid update data with subject_id", () => {
    const result = updateMaterialSchema.safeParse({
      title: "Updated",
      subject_id: "550e8400-e29b-41d4-a716-446655440000",
    });
    expect(result.success).toBe(true);
  });
});

describe("createSubjectSchema", () => {
  it("accepts valid subject name", () => {
    const result = createSubjectSchema.safeParse({ name: "英語" });
    expect(result.success).toBe(true);
  });

  it("rejects empty name", () => {
    const result = createSubjectSchema.safeParse({ name: "" });
    expect(result.success).toBe(false);
  });

  it("rejects name over 100 chars", () => {
    const result = createSubjectSchema.safeParse({ name: "a".repeat(101) });
    expect(result.success).toBe(false);
  });
});

describe("cardSchema", () => {
  it("accepts valid card data", () => {
    const result = cardSchema.safeParse({
      front: "What is 2+2?",
      back: "4",
    });
    expect(result.success).toBe(true);
  });

  it("rejects empty front", () => {
    const result = cardSchema.safeParse({ front: "", back: "answer" });
    expect(result.success).toBe(false);
  });

  it("rejects front over 5000 chars", () => {
    const result = cardSchema.safeParse({
      front: "a".repeat(5001),
      back: "answer",
    });
    expect(result.success).toBe(false);
  });
});
```

- [ ] **Step 6: テスト実行して失敗を確認**

Run: `cd /Users/mikiya/ws/kairous && bun test:small -- --run tests/small/lib/validations/materials.test.ts`
Expected: FAIL

- [ ] **Step 7: validations を実装**

```ts
// src/lib/validations/materials.ts
import { z } from "zod";

export const createSubjectSchema = z.object({
  name: z.string().min(1, "科目名を入力してください").max(100, "100文字以内で入力してください"),
});

export const createMaterialSchema = z.object({
  title: z.string().min(1, "タイトルを入力してください").max(200, "200文字以内で入力してください"),
  description: z.string().optional(),
  subject_id: z.string().uuid("科目を選択してください"),
  method_ids: z.array(z.string().uuid()).min(1, "学習手法を1つ以上選択してください"),
});

export const updateMaterialSchema = z.object({
  title: z.string().min(1, "タイトルを入力してください").max(200, "200文字以内で入力してください"),
  description: z.string().optional(),
  subject_id: z.string().uuid("科目を選択してください"),
});

export const cardSchema = z.object({
  front: z.string().min(1, "表面を入力してください").max(5000, "5000文字以内で入力してください"),
  back: z.string().min(1, "裏面を入力してください").max(5000, "5000文字以内で入力してください"),
});

// Server Action からの戻り値型
export type ActionResult<T = void> =
  | { success: true; data: T }
  | { success: false; error: string; fieldErrors?: Record<string, string[]> };
```

- [ ] **Step 8: テスト実行して成功を確認**

Run: `cd /Users/mikiya/ws/kairous && bun test:small -- --run tests/small/lib/validations/materials.test.ts`
Expected: PASS

- [ ] **Step 9: 型定義を作成**

```ts
// src/lib/types/materials.ts
import type { Tables } from "./database";

export type Subject = Tables<"subjects">;
export type Material = Tables<"materials">;
export type Card = Tables<"cards">;
export type LearningMethod = Tables<"learning_methods">;
export type MaterialMethod = Tables<"material_methods">;

export type MaterialWithMethods = {
  id: string;
  title: string;
  description: string | null;
  subject_id: string;
  subject: { id: string; name: string; color: string };
  total_cards: number;
  due_count: number;
  methods: { id: string; slug: string; name: string; category: string }[];
  created_at: string;
};

export type MaterialDetail = MaterialWithMethods & {
  recent_sessions: {
    id: string;
    method: { slug: string; name: string };
    duration_sec: number;
    self_rating: number | null;
    started_at: string;
  }[];
  accuracy_rate: number | null;
};
```

- [ ] **Step 10: 型チェック**

Run: `cd /Users/mikiya/ws/kairous && bun run typecheck`
Expected: エラーなし

- [ ] **Step 11: コミット**

```bash
cd /Users/mikiya/ws/kairous
git add src/lib/constants.ts src/lib/validations/materials.ts src/lib/types/materials.ts tests/small/lib/
git commit -m "feat: constants, validations, and type definitions for materials"
```

---

### Task 3: Server Actions — 科目 + 教材 CRUD

**Files:**
- Create: `src/lib/actions/subjects.ts`
- Create: `src/lib/actions/materials.ts`
- Test: `tests/medium/lib/actions/subjects.test.ts`
- Test: `tests/medium/lib/actions/materials.test.ts`

- [ ] **Step 1: subjects Server Action のテストを書く**

```ts
// tests/medium/lib/actions/subjects.test.ts
import { describe, expect, it, beforeEach } from "vitest";
import { createClient } from "@supabase/supabase-js";
import type { Database } from "@/lib/types/database";

// Medium テストでは実際の Supabase ローカルインスタンスを使用
// RLS をバイパスするため service_role key を使用
const supabase = createClient<Database>(
  process.env.SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!,
);

// テスト用ユーザー ID（seed or 前テストで作成）
const TEST_USER_ID = "00000000-0000-0000-0000-000000000001";

describe("subjects actions (direct DB)", () => {
  beforeEach(async () => {
    // テスト用データをクリーンアップ
    await supabase.from("subjects").delete().eq("user_id", TEST_USER_ID);
  });

  it("creates a subject with default color and display_order", async () => {
    const { data, error } = await supabase
      .from("subjects")
      .insert({ name: "英語", user_id: TEST_USER_ID })
      .select()
      .single();

    expect(error).toBeNull();
    expect(data).toMatchObject({
      name: "英語",
      user_id: TEST_USER_ID,
    });
    expect(data!.color).toBeTruthy();
    expect(data!.display_order).toBeDefined();
  });

  it("lists subjects for a user ordered by display_order", async () => {
    await supabase.from("subjects").insert([
      { name: "数学", user_id: TEST_USER_ID, display_order: 2 },
      { name: "英語", user_id: TEST_USER_ID, display_order: 1 },
    ]);

    const { data } = await supabase
      .from("subjects")
      .select("*")
      .eq("user_id", TEST_USER_ID)
      .order("display_order");

    expect(data).toHaveLength(2);
    expect(data![0].name).toBe("英語");
    expect(data![1].name).toBe("数学");
  });
});
```

NOTE: Medium テストの `tests/medium/setup.ts` にテスト用ユーザーの作成やDB接続設定を追加する必要がある。サブエージェントは既存の `tests/medium/setup.ts` を確認して適宜修正すること。

- [ ] **Step 2: subjects Server Action を実装**

```ts
// src/lib/actions/subjects.ts
"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { createSubjectSchema } from "@/lib/validations/materials";
import type { ActionResult } from "@/lib/validations/materials";
import type { Subject } from "@/lib/types/materials";

export async function createSubject(
  formData: FormData,
): Promise<ActionResult<{ id: string; name: string }>> {
  const parsed = createSubjectSchema.safeParse({
    name: formData.get("name"),
  });

  if (!parsed.success) {
    return {
      success: false,
      error: "入力内容を確認してください",
      fieldErrors: parsed.error.flatten().fieldErrors,
    };
  }

  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    return { success: false, error: "認証が必要です" };
  }

  const { data, error } = await supabase
    .from("subjects")
    .insert({ name: parsed.data.name, user_id: user.id })
    .select("id, name")
    .single();

  if (error) {
    return { success: false, error: "科目の作成に失敗しました" };
  }

  revalidatePath("/materials");
  return { success: true, data };
}

export async function getSubjects(): Promise<Subject[]> {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) return [];

  const { data } = await supabase
    .from("subjects")
    .select("*")
    .eq("user_id", user.id)
    .order("display_order");

  return data ?? [];
}
```

- [ ] **Step 3: materials Server Action のテストを書く**

```ts
// tests/medium/lib/actions/materials.test.ts
import { describe, expect, it, beforeEach } from "vitest";
import { createClient } from "@supabase/supabase-js";
import type { Database } from "@/lib/types/database";

const supabase = createClient<Database>(
  process.env.SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!,
);

const TEST_USER_ID = "00000000-0000-0000-0000-000000000001";
let testSubjectId: string;
let testMethodIds: string[];

describe("materials actions (direct DB)", () => {
  beforeEach(async () => {
    // クリーンアップ（依存順序に注意）
    await supabase.from("material_methods").delete().neq("id", "");
    await supabase.from("cards").delete().neq("id", "");
    await supabase.from("materials").delete().eq("user_id", TEST_USER_ID);
    await supabase.from("subjects").delete().eq("user_id", TEST_USER_ID);

    // テスト用科目を作成
    const { data: subject } = await supabase
      .from("subjects")
      .insert({ name: "英語", user_id: TEST_USER_ID })
      .select("id")
      .single();
    testSubjectId = subject!.id;

    // 手法 ID を取得
    const { data: methods } = await supabase
      .from("learning_methods")
      .select("id, slug")
      .in("slug", ["srs", "active_recall"]);
    testMethodIds = methods!.map((m) => m.id);
  });

  it("creates material with material_methods in batch", async () => {
    // 教材を作成
    const { data: material } = await supabase
      .from("materials")
      .insert({
        title: "英単語 TOEIC 600",
        subject_id: testSubjectId,
        user_id: TEST_USER_ID,
      })
      .select("id")
      .single();

    // material_methods を一括作成
    const methodRows = testMethodIds.map((methodId) => ({
      material_id: material!.id,
      method_id: methodId,
    }));
    const { error } = await supabase.from("material_methods").insert(methodRows);

    expect(error).toBeNull();

    // material_methods が正しく作成されたか確認
    const { data: mm } = await supabase
      .from("material_methods")
      .select("method_id")
      .eq("material_id", material!.id);

    expect(mm).toHaveLength(2);
  });

  it("gets materials with subject and methods joined", async () => {
    const { data: material } = await supabase
      .from("materials")
      .insert({
        title: "英文法 基礎",
        subject_id: testSubjectId,
        user_id: TEST_USER_ID,
      })
      .select("id")
      .single();

    await supabase.from("material_methods").insert(
      testMethodIds.map((methodId) => ({
        material_id: material!.id,
        method_id: methodId,
      })),
    );

    // JOIN クエリ
    const { data } = await supabase
      .from("materials")
      .select(`
        id, title, description, subject_id, total_cards, created_at,
        subjects!inner(id, name, color),
        material_methods(
          learning_methods(id, slug, name, category)
        )
      `)
      .eq("user_id", TEST_USER_ID)
      .order("created_at", { ascending: false });

    expect(data).toHaveLength(1);
    expect(data![0].title).toBe("英文法 基礎");
    expect(data![0].subjects).toBeDefined();
  });

  it("deletes material cascading to material_methods", async () => {
    const { data: material } = await supabase
      .from("materials")
      .insert({
        title: "削除テスト",
        subject_id: testSubjectId,
        user_id: TEST_USER_ID,
      })
      .select("id")
      .single();

    await supabase.from("material_methods").insert({
      material_id: material!.id,
      method_id: testMethodIds[0],
    });

    // 教材を削除
    await supabase.from("materials").delete().eq("id", material!.id);

    // material_methods も削除されているか確認
    const { data: mm } = await supabase
      .from("material_methods")
      .select("id")
      .eq("material_id", material!.id);

    expect(mm).toHaveLength(0);
  });
});
```

- [ ] **Step 4: materials Server Action を実装**

```ts
// src/lib/actions/materials.ts
"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { createMaterialSchema, updateMaterialSchema } from "@/lib/validations/materials";
import type { ActionResult } from "@/lib/validations/materials";
import type { MaterialWithMethods, MaterialDetail } from "@/lib/types/materials";

export async function createMaterial(
  formData: FormData,
): Promise<ActionResult<{ id: string }>> {
  const parsed = createMaterialSchema.safeParse({
    title: formData.get("title"),
    description: formData.get("description") || undefined,
    subject_id: formData.get("subject_id"),
    method_ids: JSON.parse(formData.get("method_ids") as string ?? "[]"),
  });

  if (!parsed.success) {
    return {
      success: false,
      error: "入力内容を確認してください",
      fieldErrors: parsed.error.flatten().fieldErrors,
    };
  }

  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    return { success: false, error: "認証が必要です" };
  }

  // 教材を作成
  const { data: material, error: materialError } = await supabase
    .from("materials")
    .insert({
      title: parsed.data.title,
      description: parsed.data.description ?? null,
      subject_id: parsed.data.subject_id,
      user_id: user.id,
    })
    .select("id")
    .single();

  if (materialError) {
    return { success: false, error: "教材の作成に失敗しました" };
  }

  // material_methods を一括作成
  const methodRows = parsed.data.method_ids.map((methodId) => ({
    material_id: material.id,
    method_id: methodId,
  }));

  const { error: mmError } = await supabase
    .from("material_methods")
    .insert(methodRows);

  if (mmError) {
    // 教材は作成済みだが手法紐付けに失敗。教材を削除してロールバック
    await supabase.from("materials").delete().eq("id", material.id);
    return { success: false, error: "学習手法の紐付けに失敗しました" };
  }

  revalidatePath("/materials");
  return { success: true, data: { id: material.id } };
}

export async function getMaterials(
  subjectId?: string,
): Promise<MaterialWithMethods[]> {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) return [];

  let query = supabase
    .from("materials")
    .select(`
      id, title, description, subject_id, total_cards, created_at,
      subjects!inner(id, name, color),
      material_methods(
        learning_methods(id, slug, name, category)
      )
    `)
    .eq("user_id", user.id)
    .order("created_at", { ascending: false });

  if (subjectId) {
    query = query.eq("subject_id", subjectId);
  }

  const { data } = await query;

  if (!data) return [];

  // due_count を取得するため srs_states を別クエリで集計
  const materialIds = data.map((m) => m.id);
  const today = new Date().toISOString().split("T")[0];

  const { data: dueCounts } = await supabase
    .from("srs_states")
    .select("card_id, cards!inner(material_id)")
    .eq("user_id", user.id)
    .lte("due_date", today)
    .in("cards.material_id", materialIds);

  // material_id ごとの due count を集計
  const dueMap = new Map<string, number>();
  if (dueCounts) {
    for (const row of dueCounts) {
      const materialId = (row.cards as unknown as { material_id: string }).material_id;
      dueMap.set(materialId, (dueMap.get(materialId) ?? 0) + 1);
    }
  }

  return data.map((m) => ({
    id: m.id,
    title: m.title,
    description: m.description,
    subject_id: m.subject_id,
    subject: m.subjects as unknown as { id: string; name: string; color: string },
    total_cards: m.total_cards,
    due_count: dueMap.get(m.id) ?? 0,
    methods: (m.material_methods ?? []).map((mm: Record<string, unknown>) => {
      const lm = mm.learning_methods as { id: string; slug: string; name: string; category: string };
      return { id: lm.id, slug: lm.slug, name: lm.name, category: lm.category };
    }),
    created_at: m.created_at,
  }));
}

export async function getMaterial(id: string): Promise<MaterialDetail | null> {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) return null;

  const { data: material } = await supabase
    .from("materials")
    .select(`
      id, title, description, subject_id, total_cards, created_at,
      subjects!inner(id, name, color),
      material_methods(
        learning_methods(id, slug, name, category)
      )
    `)
    .eq("id", id)
    .eq("user_id", user.id)
    .single();

  if (!material) return null;

  // due_count
  const today = new Date().toISOString().split("T")[0];
  const { count: dueCount } = await supabase
    .from("srs_states")
    .select("id", { count: "exact", head: true })
    .eq("user_id", user.id)
    .lte("due_date", today)
    .in(
      "card_id",
      (
        await supabase
          .from("cards")
          .select("id")
          .eq("material_id", id)
      ).data?.map((c) => c.id) ?? [],
    );

  // recent_sessions (最新5件)
  const { data: sessions } = await supabase
    .from("sessions")
    .select(`
      id, duration_sec, self_rating, started_at,
      learning_methods(slug, name)
    `)
    .eq("material_id", id)
    .eq("user_id", user.id)
    .order("started_at", { ascending: false })
    .limit(5);

  // accuracy_rate
  const cardIds = (
    await supabase.from("cards").select("id").eq("material_id", id)
  ).data?.map((c) => c.id) ?? [];

  let accuracyRate: number | null = null;
  if (cardIds.length > 0) {
    const { count: totalReviews } = await supabase
      .from("card_reviews")
      .select("id", { count: "exact", head: true })
      .in("card_id", cardIds);

    if (totalReviews && totalReviews > 0) {
      const { count: correctReviews } = await supabase
        .from("card_reviews")
        .select("id", { count: "exact", head: true })
        .in("card_id", cardIds)
        .gte("rating", 3);

      accuracyRate = (correctReviews ?? 0) / totalReviews;
    }
  }

  return {
    id: material.id,
    title: material.title,
    description: material.description,
    subject_id: material.subject_id,
    subject: material.subjects as unknown as { id: string; name: string; color: string },
    total_cards: material.total_cards,
    due_count: dueCount ?? 0,
    methods: (material.material_methods ?? []).map((mm: Record<string, unknown>) => {
      const lm = mm.learning_methods as { id: string; slug: string; name: string; category: string };
      return { id: lm.id, slug: lm.slug, name: lm.name, category: lm.category };
    }),
    created_at: material.created_at,
    recent_sessions: (sessions ?? []).map((s) => ({
      id: s.id,
      method: s.learning_methods as unknown as { slug: string; name: string },
      duration_sec: s.duration_sec,
      self_rating: s.self_rating,
      started_at: s.started_at,
    })),
    accuracy_rate: accuracyRate,
  };
}

export async function updateMaterial(
  id: string,
  formData: FormData,
): Promise<ActionResult> {
  const parsed = updateMaterialSchema.safeParse({
    title: formData.get("title"),
    description: formData.get("description") || undefined,
    subject_id: formData.get("subject_id"),
  });

  if (!parsed.success) {
    return {
      success: false,
      error: "入力内容を確認してください",
      fieldErrors: parsed.error.flatten().fieldErrors,
    };
  }

  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    return { success: false, error: "認証が必要です" };
  }

  const { error } = await supabase
    .from("materials")
    .update({
      title: parsed.data.title,
      description: parsed.data.description ?? null,
      subject_id: parsed.data.subject_id,
    })
    .eq("id", id)
    .eq("user_id", user.id);

  if (error) {
    return { success: false, error: "教材の更新に失敗しました" };
  }

  revalidatePath(`/materials/${id}`);
  revalidatePath("/materials");
  return { success: true, data: undefined };
}

export async function deleteMaterial(id: string): Promise<ActionResult> {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    return { success: false, error: "認証が必要です" };
  }

  const { error } = await supabase
    .from("materials")
    .delete()
    .eq("id", id)
    .eq("user_id", user.id);

  if (error) {
    return { success: false, error: "教材の削除に失敗しました" };
  }

  revalidatePath("/materials");
  return { success: true, data: undefined };
}
```

- [ ] **Step 5: 型チェック**

Run: `cd /Users/mikiya/ws/kairous && bun run typecheck`
Expected: エラーなし

- [ ] **Step 6: Medium テスト実行**

Run: `cd /Users/mikiya/ws/kairous && bun test:medium -- --run tests/medium/lib/actions/subjects.test.ts tests/medium/lib/actions/materials.test.ts`
Expected: PASS (Supabase ローカルインスタンスが起動中であること)

- [ ] **Step 7: コミット**

```bash
cd /Users/mikiya/ws/kairous
git add src/lib/actions/subjects.ts src/lib/actions/materials.ts tests/medium/lib/actions/
git commit -m "feat: Server Actions for subjects and materials CRUD"
```

---

### Task 4: Server Actions — カード + 手法紐付け

**Files:**
- Create: `src/lib/actions/cards.ts`
- Create: `src/lib/actions/material-methods.ts`
- Test: `tests/medium/lib/actions/cards.test.ts`
- Test: `tests/medium/lib/actions/material-methods.test.ts`

- [ ] **Step 1: cards Server Action のテストを書く**

```ts
// tests/medium/lib/actions/cards.test.ts
import { describe, expect, it, beforeEach } from "vitest";
import { createClient } from "@supabase/supabase-js";
import type { Database } from "@/lib/types/database";
import { SRS_DEFAULTS } from "@/lib/constants";

const supabase = createClient<Database>(
  process.env.SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!,
);

const TEST_USER_ID = "00000000-0000-0000-0000-000000000001";
let testSubjectId: string;
let testMaterialId: string;
let srsMethodId: string;

describe("cards actions (direct DB)", () => {
  beforeEach(async () => {
    // クリーンアップ
    await supabase.from("srs_states").delete().eq("user_id", TEST_USER_ID);
    await supabase.from("card_reviews").delete().neq("id", "");
    await supabase.from("cards").delete().neq("id", "");
    await supabase.from("material_methods").delete().neq("id", "");
    await supabase.from("materials").delete().eq("user_id", TEST_USER_ID);
    await supabase.from("subjects").delete().eq("user_id", TEST_USER_ID);

    // テストデータ作成
    const { data: subject } = await supabase
      .from("subjects")
      .insert({ name: "英語", user_id: TEST_USER_ID })
      .select("id")
      .single();
    testSubjectId = subject!.id;

    const { data: material } = await supabase
      .from("materials")
      .insert({
        title: "英単語",
        subject_id: testSubjectId,
        user_id: TEST_USER_ID,
      })
      .select("id")
      .single();
    testMaterialId = material!.id;

    const { data: srsMethod } = await supabase
      .from("learning_methods")
      .select("id")
      .eq("slug", "srs")
      .single();
    srsMethodId = srsMethod!.id;

    // SRS 手法を紐付け
    await supabase.from("material_methods").insert({
      material_id: testMaterialId,
      method_id: srsMethodId,
    });
  });

  it("creates card and auto-initializes srs_states", async () => {
    // カードを作成
    const { data: card } = await supabase
      .from("cards")
      .insert({
        material_id: testMaterialId,
        front: "apple",
        back: "りんご",
      })
      .select("id")
      .single();

    // total_cards をインクリメント
    await supabase.rpc("increment_total_cards" as never, {
      material_id_param: testMaterialId,
    } as never).catch(() => {
      // RPC がなければ手動で更新
    });
    await supabase
      .from("materials")
      .update({ total_cards: 1 })
      .eq("id", testMaterialId);

    // srs_states を手動で作成（Server Action でやる処理のシミュレーション）
    const { data: srsMethod } = await supabase
      .from("learning_methods")
      .select("default_config")
      .eq("slug", "srs")
      .single();

    const config = srsMethod!.default_config as Record<string, number>;
    const { error: srsError } = await supabase.from("srs_states").insert({
      card_id: card!.id,
      user_id: TEST_USER_ID,
      stability: config.initial_stability ?? SRS_DEFAULTS.stability,
      difficulty: config.initial_difficulty ?? SRS_DEFAULTS.difficulty,
      due_date: new Date().toISOString().split("T")[0],
      reps: 0,
      lapses: 0,
    });

    expect(srsError).toBeNull();

    // srs_states が作成されたか確認
    const { data: srsState } = await supabase
      .from("srs_states")
      .select("*")
      .eq("card_id", card!.id)
      .single();

    expect(srsState).toBeDefined();
    expect(srsState!.stability).toBe(config.initial_stability ?? SRS_DEFAULTS.stability);
    expect(srsState!.difficulty).toBe(config.initial_difficulty ?? SRS_DEFAULTS.difficulty);
    expect(srsState!.reps).toBe(0);
  });

  it("deletes card and cascades to srs_states", async () => {
    const { data: card } = await supabase
      .from("cards")
      .insert({
        material_id: testMaterialId,
        front: "dog",
        back: "犬",
      })
      .select("id")
      .single();

    await supabase.from("srs_states").insert({
      card_id: card!.id,
      user_id: TEST_USER_ID,
      stability: SRS_DEFAULTS.stability,
      difficulty: SRS_DEFAULTS.difficulty,
      due_date: new Date().toISOString().split("T")[0],
    });

    // カードを削除
    await supabase.from("cards").delete().eq("id", card!.id);

    // srs_states もカスケード削除されたか確認
    const { data: srsState } = await supabase
      .from("srs_states")
      .select("id")
      .eq("card_id", card!.id);

    expect(srsState).toHaveLength(0);
  });
});
```

- [ ] **Step 2: cards Server Action を実装**

```ts
// src/lib/actions/cards.ts
"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { cardSchema } from "@/lib/validations/materials";
import type { ActionResult } from "@/lib/validations/materials";
import type { Card } from "@/lib/types/materials";
import { SRS_DEFAULTS, CARD_BASED_SLUGS } from "@/lib/constants";

export async function createCard(
  materialId: string,
  formData: FormData,
): Promise<ActionResult<{ id: string }>> {
  const parsed = cardSchema.safeParse({
    front: formData.get("front"),
    back: formData.get("back"),
  });

  if (!parsed.success) {
    return {
      success: false,
      error: "入力内容を確認してください",
      fieldErrors: parsed.error.flatten().fieldErrors,
    };
  }

  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    return { success: false, error: "認証が必要です" };
  }

  // 教材の所有者確認
  const { data: material } = await supabase
    .from("materials")
    .select("id, total_cards")
    .eq("id", materialId)
    .eq("user_id", user.id)
    .single();

  if (!material) {
    return { success: false, error: "教材が見つかりません" };
  }

  // カードを作成
  const { data: card, error: cardError } = await supabase
    .from("cards")
    .insert({
      material_id: materialId,
      front: parsed.data.front,
      back: parsed.data.back,
      display_order: material.total_cards,
    })
    .select("id")
    .single();

  if (cardError) {
    return { success: false, error: "カードの作成に失敗しました" };
  }

  // total_cards をインクリメント
  await supabase
    .from("materials")
    .update({ total_cards: material.total_cards + 1 })
    .eq("id", materialId);

  // SRS 手法が紐付いていれば srs_states を初期化
  const { data: materialMethods } = await supabase
    .from("material_methods")
    .select("learning_methods(slug, default_config)")
    .eq("material_id", materialId);

  const hasSrs = materialMethods?.some((mm) => {
    const lm = mm.learning_methods as unknown as { slug: string };
    return CARD_BASED_SLUGS.includes(lm.slug as typeof CARD_BASED_SLUGS[number]);
  });

  if (hasSrs) {
    // SRS の default_config を取得
    const srsMethod = materialMethods?.find((mm) => {
      const lm = mm.learning_methods as unknown as { slug: string };
      return lm.slug === "srs";
    });

    const config = srsMethod
      ? (
          (srsMethod.learning_methods as unknown as { default_config: Record<string, number> })
            .default_config
        )
      : {};

    await supabase.from("srs_states").insert({
      card_id: card.id,
      user_id: user.id,
      stability: config.initial_stability ?? SRS_DEFAULTS.stability,
      difficulty: config.initial_difficulty ?? SRS_DEFAULTS.difficulty,
      due_date: new Date().toISOString().split("T")[0],
      reps: 0,
      lapses: 0,
    });
  }

  revalidatePath(`/materials/${materialId}`);
  return { success: true, data: { id: card.id } };
}

export async function getCards(materialId: string): Promise<Card[]> {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) return [];

  // 教材の所有者確認（RLS があるが明示的に確認）
  const { data: material } = await supabase
    .from("materials")
    .select("id")
    .eq("id", materialId)
    .eq("user_id", user.id)
    .single();

  if (!material) return [];

  const { data } = await supabase
    .from("cards")
    .select("*")
    .eq("material_id", materialId)
    .order("display_order");

  return data ?? [];
}

export async function updateCard(
  id: string,
  formData: FormData,
): Promise<ActionResult> {
  const parsed = cardSchema.safeParse({
    front: formData.get("front"),
    back: formData.get("back"),
  });

  if (!parsed.success) {
    return {
      success: false,
      error: "入力内容を確認してください",
      fieldErrors: parsed.error.flatten().fieldErrors,
    };
  }

  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    return { success: false, error: "認証が必要です" };
  }

  // カードの所有者確認（materials 経由）
  const { data: card } = await supabase
    .from("cards")
    .select("id, material_id, materials!inner(user_id)")
    .eq("id", id)
    .single();

  if (!card) {
    return { success: false, error: "カードが見つかりません" };
  }

  const materialUserId = (card.materials as unknown as { user_id: string }).user_id;
  if (materialUserId !== user.id) {
    return { success: false, error: "カードが見つかりません" };
  }

  const { error } = await supabase
    .from("cards")
    .update({ front: parsed.data.front, back: parsed.data.back })
    .eq("id", id);

  if (error) {
    return { success: false, error: "カードの更新に失敗しました" };
  }

  revalidatePath(`/materials/${card.material_id}`);
  return { success: true, data: undefined };
}

export async function deleteCard(id: string): Promise<ActionResult> {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    return { success: false, error: "認証が必要です" };
  }

  // カードの所有者確認 + material_id 取得
  const { data: card } = await supabase
    .from("cards")
    .select("id, material_id, materials!inner(user_id, total_cards)")
    .eq("id", id)
    .single();

  if (!card) {
    return { success: false, error: "カードが見つかりません" };
  }

  const materialData = card.materials as unknown as { user_id: string; total_cards: number };
  if (materialData.user_id !== user.id) {
    return { success: false, error: "カードが見つかりません" };
  }

  // srs_states と card_reviews は CASCADE で自動削除
  const { error } = await supabase.from("cards").delete().eq("id", id);

  if (error) {
    return { success: false, error: "カードの削除に失敗しました" };
  }

  // total_cards をデクリメント
  await supabase
    .from("materials")
    .update({ total_cards: Math.max(0, materialData.total_cards - 1) })
    .eq("id", card.material_id);

  revalidatePath(`/materials/${card.material_id}`);
  return { success: true, data: undefined };
}
```

- [ ] **Step 3: material-methods Server Action のテストを書く**

```ts
// tests/medium/lib/actions/material-methods.test.ts
import { describe, expect, it, beforeEach } from "vitest";
import { createClient } from "@supabase/supabase-js";
import type { Database } from "@/lib/types/database";

const supabase = createClient<Database>(
  process.env.SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!,
);

const TEST_USER_ID = "00000000-0000-0000-0000-000000000001";
let testMaterialId: string;
let elaborationMethodId: string;

describe("material-methods actions (direct DB)", () => {
  beforeEach(async () => {
    await supabase.from("material_methods").delete().neq("id", "");
    await supabase.from("cards").delete().neq("id", "");
    await supabase.from("materials").delete().eq("user_id", TEST_USER_ID);
    await supabase.from("subjects").delete().eq("user_id", TEST_USER_ID);

    const { data: subject } = await supabase
      .from("subjects")
      .insert({ name: "英語", user_id: TEST_USER_ID })
      .select("id")
      .single();

    const { data: material } = await supabase
      .from("materials")
      .insert({
        title: "英単語",
        subject_id: subject!.id,
        user_id: TEST_USER_ID,
      })
      .select("id")
      .single();
    testMaterialId = material!.id;

    const { data: method } = await supabase
      .from("learning_methods")
      .select("id")
      .eq("slug", "elaboration")
      .single();
    elaborationMethodId = method!.id;
  });

  it("adds a method to material", async () => {
    const { error } = await supabase.from("material_methods").insert({
      material_id: testMaterialId,
      method_id: elaborationMethodId,
    });

    expect(error).toBeNull();

    const { data } = await supabase
      .from("material_methods")
      .select("method_id")
      .eq("material_id", testMaterialId);

    expect(data).toHaveLength(1);
  });

  it("removes a method from material", async () => {
    await supabase.from("material_methods").insert({
      material_id: testMaterialId,
      method_id: elaborationMethodId,
    });

    const { error } = await supabase
      .from("material_methods")
      .delete()
      .eq("material_id", testMaterialId)
      .eq("method_id", elaborationMethodId);

    expect(error).toBeNull();

    const { data } = await supabase
      .from("material_methods")
      .select("id")
      .eq("material_id", testMaterialId);

    expect(data).toHaveLength(0);
  });

  it("rejects duplicate material-method binding", async () => {
    await supabase.from("material_methods").insert({
      material_id: testMaterialId,
      method_id: elaborationMethodId,
    });

    const { error } = await supabase.from("material_methods").insert({
      material_id: testMaterialId,
      method_id: elaborationMethodId,
    });

    // unique constraint violation
    expect(error).not.toBeNull();
  });
});
```

- [ ] **Step 4: material-methods Server Action を実装**

```ts
// src/lib/actions/material-methods.ts
"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import type { ActionResult } from "@/lib/validations/materials";
import type { LearningMethod } from "@/lib/types/materials";
import { MATERIAL_METHOD_SLUGS } from "@/lib/constants";

export async function addMaterialMethod(
  materialId: string,
  methodId: string,
  config?: Record<string, unknown>,
): Promise<ActionResult> {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    return { success: false, error: "認証が必要です" };
  }

  // 教材の所有者確認
  const { data: material } = await supabase
    .from("materials")
    .select("id")
    .eq("id", materialId)
    .eq("user_id", user.id)
    .single();

  if (!material) {
    return { success: false, error: "教材が見つかりません" };
  }

  // 手法がmaterial紐付け可能か確認
  const { data: method } = await supabase
    .from("learning_methods")
    .select("slug")
    .eq("id", methodId)
    .single();

  if (!method || !MATERIAL_METHOD_SLUGS.includes(method.slug as typeof MATERIAL_METHOD_SLUGS[number])) {
    return { success: false, error: "この手法は教材に紐付けできません" };
  }

  const { error } = await supabase.from("material_methods").insert({
    material_id: materialId,
    method_id: methodId,
    config: config ?? {},
  });

  if (error) {
    // unique constraint violation の場合
    if (error.code === "23505") {
      return { success: false, error: "この手法は既に紐付けされています" };
    }
    return { success: false, error: "手法の紐付けに失敗しました" };
  }

  revalidatePath(`/materials/${materialId}`);
  return { success: true, data: undefined };
}

export async function removeMaterialMethod(
  materialId: string,
  methodId: string,
): Promise<ActionResult> {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    return { success: false, error: "認証が必要です" };
  }

  // 教材の所有者確認
  const { data: material } = await supabase
    .from("materials")
    .select("id")
    .eq("id", materialId)
    .eq("user_id", user.id)
    .single();

  if (!material) {
    return { success: false, error: "教材が見つかりません" };
  }

  // 最後の手法を削除しようとしていないか確認
  const { count } = await supabase
    .from("material_methods")
    .select("id", { count: "exact", head: true })
    .eq("material_id", materialId);

  if (count !== null && count <= 1) {
    return { success: false, error: "最低1つの学習手法が必要です" };
  }

  const { error } = await supabase
    .from("material_methods")
    .delete()
    .eq("material_id", materialId)
    .eq("method_id", methodId);

  if (error) {
    return { success: false, error: "手法の解除に失敗しました" };
  }

  revalidatePath(`/materials/${materialId}`);
  return { success: true, data: undefined };
}

export async function getMethods(): Promise<LearningMethod[]> {
  const supabase = await createClient();

  const { data } = await supabase
    .from("learning_methods")
    .select("*")
    .order("category");

  return data ?? [];
}
```

- [ ] **Step 5: 型チェック**

Run: `cd /Users/mikiya/ws/kairous && bun run typecheck`
Expected: エラーなし

- [ ] **Step 6: Medium テスト実行**

Run: `cd /Users/mikiya/ws/kairous && bun test:medium -- --run tests/medium/lib/actions/cards.test.ts tests/medium/lib/actions/material-methods.test.ts`
Expected: PASS

- [ ] **Step 7: コミット**

```bash
cd /Users/mikiya/ws/kairous
git add src/lib/actions/cards.ts src/lib/actions/material-methods.ts tests/medium/lib/actions/cards.test.ts tests/medium/lib/actions/material-methods.test.ts
git commit -m "feat: Server Actions for cards and material-methods CRUD"
```

---

### Task 5: ドメインコンポーネント

**Files:**
- Create: `src/components/material-card.tsx`
- Create: `src/components/method-chip.tsx`
- Create: `src/components/method-selector.tsx`
- Create: `src/components/subject-selector.tsx`
- Create: `src/components/card-editor.tsx`
- Create: `src/components/search-bar.tsx`
- Create: `src/components/empty-state.tsx`
- Test: `tests/small/components/method-chip.test.tsx`
- Test: `tests/small/components/method-selector.test.tsx`
- Test: `tests/small/components/empty-state.test.tsx`
- Test: `tests/small/components/search-bar.test.tsx`
- Test: `tests/small/components/card-editor.test.tsx`

- [ ] **Step 1: MethodChip のテストを書く**

```tsx
// tests/small/components/method-chip.test.tsx
import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { MethodChip } from "@/components/method-chip";

describe("MethodChip", () => {
  it("renders method name", () => {
    render(
      <MethodChip method={{ id: "1", slug: "srs", name: "間隔反復 (FSRS)", category: "memory" }} />,
    );
    expect(screen.getByText("間隔反復 (FSRS)")).toBeInTheDocument();
  });

  it("applies indigo classes for memory category", () => {
    render(
      <MethodChip method={{ id: "1", slug: "srs", name: "SRS", category: "memory" }} />,
    );
    const chip = screen.getByText("SRS");
    expect(chip.className).toContain("bg-indigo-50");
    expect(chip.className).toContain("text-indigo-600");
  });

  it("applies green classes for comprehension category", () => {
    render(
      <MethodChip method={{ id: "1", slug: "elaboration", name: "精緻化", category: "comprehension" }} />,
    );
    const chip = screen.getByText("精緻化");
    expect(chip.className).toContain("bg-green-50");
  });
});
```

- [ ] **Step 2: テスト実行して失敗を確認**

Run: `cd /Users/mikiya/ws/kairous && bun test:small -- --run tests/small/components/method-chip.test.tsx`
Expected: FAIL

- [ ] **Step 3: MethodChip を実装**

```tsx
// src/components/method-chip.tsx
import { getMethodColorClasses } from "@/lib/constants";

type MethodChipProps = {
  method: { id: string; slug: string; name: string; category: string };
  removable?: boolean;
  onRemove?: () => void;
};

export function MethodChip({ method, removable, onRemove }: MethodChipProps) {
  const colors = getMethodColorClasses(method.category);

  return (
    <span
      className={`inline-flex items-center gap-1 rounded-full px-2.5 py-0.5 text-xs font-medium ${colors.light} ${colors.dark}`}
    >
      {method.name}
      {removable && onRemove && (
        <button
          onClick={onRemove}
          className="ml-0.5 inline-flex h-3.5 w-3.5 items-center justify-center rounded-full hover:bg-black/10 dark:hover:bg-white/10"
          aria-label={`${method.name}を解除`}
        >
          <span aria-hidden className="text-[10px] leading-none">&times;</span>
        </button>
      )}
    </span>
  );
}
```

- [ ] **Step 4: テスト実行して成功を確認**

Run: `cd /Users/mikiya/ws/kairous && bun test:small -- --run tests/small/components/method-chip.test.tsx`
Expected: PASS

- [ ] **Step 5: EmptyState のテストを書く**

```tsx
// tests/small/components/empty-state.test.tsx
import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { EmptyState } from "@/components/empty-state";

describe("EmptyState", () => {
  it("renders title and description", () => {
    render(
      <EmptyState
        title="教材がありません"
        description="最初の教材を追加しましょう"
      />,
    );
    expect(screen.getByText("教材がありません")).toBeInTheDocument();
    expect(screen.getByText("最初の教材を追加しましょう")).toBeInTheDocument();
  });

  it("renders action button when provided", () => {
    render(
      <EmptyState
        title="教材がありません"
        description="最初の教材を追加しましょう"
        action={{ label: "教材を追加", href: "/materials/new" }}
      />,
    );
    expect(screen.getByRole("link", { name: "教材を追加" })).toHaveAttribute(
      "href",
      "/materials/new",
    );
  });
});
```

- [ ] **Step 6: EmptyState を実装**

```tsx
// src/components/empty-state.tsx
import Link from "next/link";
import type { LucideIcon } from "lucide-react";
import { BookOpen } from "lucide-react";
import { Button } from "@/components/ui/button";

type EmptyStateProps = {
  icon?: LucideIcon;
  title: string;
  description: string;
  action?: { label: string; href: string };
};

export function EmptyState({
  icon: Icon = BookOpen,
  title,
  description,
  action,
}: EmptyStateProps) {
  return (
    <div className="flex flex-col items-center justify-center py-12 text-center">
      <div className="mb-4 rounded-full bg-muted p-3">
        <Icon className="h-6 w-6 text-muted-foreground" />
      </div>
      <h3 className="mb-1 text-sm font-medium">{title}</h3>
      <p className="mb-4 text-sm text-muted-foreground">{description}</p>
      {action && (
        <Button asChild>
          <Link href={action.href}>{action.label}</Link>
        </Button>
      )}
    </div>
  );
}
```

- [ ] **Step 7: テスト実行して成功を確認**

Run: `cd /Users/mikiya/ws/kairous && bun test:small -- --run tests/small/components/empty-state.test.tsx`
Expected: PASS

- [ ] **Step 8: SearchBar のテストを書く**

```tsx
// tests/small/components/search-bar.test.tsx
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";
import { SearchBar } from "@/components/search-bar";

describe("SearchBar", () => {
  it("renders with placeholder", () => {
    render(<SearchBar onSearch={vi.fn()} placeholder="教材を検索..." />);
    expect(screen.getByPlaceholderText("教材を検索...")).toBeInTheDocument();
  });

  it("calls onSearch with debounced value", async () => {
    vi.useFakeTimers();
    const onSearch = vi.fn();
    const user = userEvent.setup({ advanceTimers: vi.advanceTimersByTime });

    render(<SearchBar onSearch={onSearch} placeholder="検索" />);

    await user.type(screen.getByPlaceholderText("検索"), "英語");

    // 300ms 経過前はコールされない
    expect(onSearch).not.toHaveBeenCalledWith("英語");

    // 300ms 経過後にコールされる
    vi.advanceTimersByTime(300);
    expect(onSearch).toHaveBeenCalledWith("英語");

    vi.useRealTimers();
  });
});
```

- [ ] **Step 9: SearchBar を実装**

```tsx
// src/components/search-bar.tsx
"use client";

import { useEffect, useRef, useState } from "react";
import { Search } from "lucide-react";
import { Input } from "@/components/ui/input";

type SearchBarProps = {
  onSearch: (query: string) => void;
  placeholder?: string;
};

const DEBOUNCE_MS = 300;

export function SearchBar({ onSearch, placeholder = "検索..." }: SearchBarProps) {
  const [value, setValue] = useState("");
  const timerRef = useRef<ReturnType<typeof setTimeout>>(null);

  useEffect(() => {
    if (timerRef.current) {
      clearTimeout(timerRef.current);
    }

    timerRef.current = setTimeout(() => {
      onSearch(value);
    }, DEBOUNCE_MS);

    return () => {
      if (timerRef.current) {
        clearTimeout(timerRef.current);
      }
    };
  }, [value, onSearch]);

  return (
    <div className="relative">
      <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
      <Input
        value={value}
        onChange={(e) => setValue(e.target.value)}
        placeholder={placeholder}
        className="pl-9"
      />
    </div>
  );
}
```

- [ ] **Step 10: テスト実行して成功を確認**

Run: `cd /Users/mikiya/ws/kairous && bun test:small -- --run tests/small/components/search-bar.test.tsx`
Expected: PASS

- [ ] **Step 11: CardEditor のテストを書く**

```tsx
// tests/small/components/card-editor.test.tsx
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";
import { CardEditor } from "@/components/card-editor";

describe("CardEditor", () => {
  it("renders front and back inputs", () => {
    render(<CardEditor onSubmit={vi.fn()} />);
    expect(screen.getByLabelText("表面")).toBeInTheDocument();
    expect(screen.getByLabelText("裏面")).toBeInTheDocument();
  });

  it("shows validation errors for empty submission", async () => {
    const user = userEvent.setup();
    const onSubmit = vi.fn();

    render(<CardEditor onSubmit={onSubmit} />);

    await user.click(screen.getByRole("button", { name: "追加" }));

    expect(onSubmit).not.toHaveBeenCalled();
    expect(screen.getByText("表面を入力してください")).toBeInTheDocument();
  });

  it("calls onSubmit with valid data", async () => {
    const user = userEvent.setup();
    const onSubmit = vi.fn();

    render(<CardEditor onSubmit={onSubmit} />);

    await user.type(screen.getByLabelText("表面"), "apple");
    await user.type(screen.getByLabelText("裏面"), "りんご");
    await user.click(screen.getByRole("button", { name: "追加" }));

    expect(onSubmit).toHaveBeenCalledWith({ front: "apple", back: "りんご" });
  });

  it("populates default values when provided", () => {
    render(
      <CardEditor
        defaultValues={{ front: "dog", back: "犬" }}
        onSubmit={vi.fn()}
        submitLabel="保存"
      />,
    );
    expect(screen.getByLabelText("表面")).toHaveValue("dog");
    expect(screen.getByLabelText("裏面")).toHaveValue("犬");
    expect(screen.getByRole("button", { name: "保存" })).toBeInTheDocument();
  });
});
```

- [ ] **Step 12: CardEditor を実装**

```tsx
// src/components/card-editor.tsx
"use client";

import { useRef, useState } from "react";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { Button } from "@/components/ui/button";
import { cardSchema } from "@/lib/validations/materials";

type CardEditorProps = {
  defaultValues?: { front: string; back: string };
  onSubmit: (data: { front: string; back: string }) => void;
  submitLabel?: string;
  loading?: boolean;
};

export function CardEditor({
  defaultValues,
  onSubmit,
  submitLabel = "追加",
  loading = false,
}: CardEditorProps) {
  const [front, setFront] = useState(defaultValues?.front ?? "");
  const [back, setBack] = useState(defaultValues?.back ?? "");
  const [errors, setErrors] = useState<Record<string, string>>({});
  const frontRef = useRef<HTMLInputElement>(null);

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setErrors({});

    const result = cardSchema.safeParse({ front, back });
    if (!result.success) {
      const fieldErrors = result.error.flatten().fieldErrors;
      setErrors({
        front: fieldErrors.front?.[0] ?? "",
        back: fieldErrors.back?.[0] ?? "",
      });
      return;
    }

    onSubmit(result.data);

    // 連続追加モード: default values がない場合はフォームをクリア
    if (!defaultValues) {
      setFront("");
      setBack("");
      frontRef.current?.focus();
    }
  }

  return (
    <form onSubmit={handleSubmit} className="space-y-4">
      <div className="space-y-2">
        <Label htmlFor="card-front">表面</Label>
        <Input
          id="card-front"
          ref={frontRef}
          value={front}
          onChange={(e) => setFront(e.target.value)}
          placeholder="問題や用語を入力"
        />
        {errors.front && (
          <p className="text-sm text-destructive">{errors.front}</p>
        )}
      </div>
      <div className="space-y-2">
        <Label htmlFor="card-back">裏面</Label>
        <Textarea
          id="card-back"
          value={back}
          onChange={(e) => setBack(e.target.value)}
          placeholder="答えや説明を入力"
          rows={3}
        />
        {errors.back && (
          <p className="text-sm text-destructive">{errors.back}</p>
        )}
      </div>
      <Button type="submit" disabled={loading}>
        {submitLabel}
      </Button>
    </form>
  );
}
```

- [ ] **Step 13: テスト実行して成功を確認**

Run: `cd /Users/mikiya/ws/kairous && bun test:small -- --run tests/small/components/card-editor.test.tsx`
Expected: PASS

- [ ] **Step 14: MethodSelector のテストを書く**

```tsx
// tests/small/components/method-selector.test.tsx
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";
import { MethodSelector } from "@/components/method-selector";

const methods = [
  { id: "1", slug: "srs", name: "間隔反復 (FSRS)", category: "memory" },
  { id: "2", slug: "active_recall", name: "アクティブリコール", category: "memory" },
  { id: "3", slug: "elaboration", name: "精緻化", category: "comprehension" },
  { id: "4", slug: "pomodoro", name: "ポモドーロ", category: "focus" },
];

describe("MethodSelector", () => {
  it("renders methods grouped by category", () => {
    render(
      <MethodSelector
        methods={methods}
        selected={[]}
        onChange={vi.fn()}
      />,
    );
    expect(screen.getByText("記憶")).toBeInTheDocument();
    expect(screen.getByText("理解")).toBeInTheDocument();
    expect(screen.getByText("集中")).toBeInTheDocument();
    expect(screen.getByText("間隔反復 (FSRS)")).toBeInTheDocument();
  });

  it("toggles selection on click", async () => {
    const user = userEvent.setup();
    const onChange = vi.fn();

    render(
      <MethodSelector
        methods={methods}
        selected={[]}
        onChange={onChange}
      />,
    );

    await user.click(screen.getByText("間隔反復 (FSRS)"));
    expect(onChange).toHaveBeenCalledWith(["1"]);
  });

  it("deselects on second click", async () => {
    const user = userEvent.setup();
    const onChange = vi.fn();

    render(
      <MethodSelector
        methods={methods}
        selected={["1"]}
        onChange={onChange}
      />,
    );

    await user.click(screen.getByText("間隔反復 (FSRS)"));
    expect(onChange).toHaveBeenCalledWith([]);
  });
});
```

- [ ] **Step 15: MethodSelector を実装**

```tsx
// src/components/method-selector.tsx
"use client";

import { METHOD_CATEGORIES, METHOD_DESCRIPTIONS, MATERIAL_METHOD_SLUGS } from "@/lib/constants";
import type { MethodCategory } from "@/lib/constants";
import { Checkbox } from "@/components/ui/checkbox";
import { getMethodColorClasses } from "@/lib/constants";

type Method = { id: string; slug: string; name: string; category: string };

type MethodSelectorProps = {
  methods: Method[];
  selected: string[];
  onChange: (selected: string[]) => void;
};

export function MethodSelector({ methods, selected, onChange }: MethodSelectorProps) {
  // 教材に紐付け可能な手法のみ表示
  const bindableMethods = methods.filter((m) =>
    MATERIAL_METHOD_SLUGS.includes(m.slug as typeof MATERIAL_METHOD_SLUGS[number]),
  );

  // カテゴリ別にグルーピング
  const grouped = new Map<string, Method[]>();
  for (const method of bindableMethods) {
    const list = grouped.get(method.category) ?? [];
    list.push(method);
    grouped.set(method.category, list);
  }

  function toggle(methodId: string) {
    if (selected.includes(methodId)) {
      onChange(selected.filter((id) => id !== methodId));
    } else {
      onChange([...selected, methodId]);
    }
  }

  return (
    <div className="space-y-6">
      {Array.from(grouped.entries()).map(([category, categoryMethods]) => {
        const colors = getMethodColorClasses(category);
        const label = METHOD_CATEGORIES[category as MethodCategory]?.label ?? category;

        return (
          <div key={category}>
            <h4 className="mb-3 text-sm font-medium text-muted-foreground">{label}</h4>
            <div className="space-y-2">
              {categoryMethods.map((method) => {
                const isSelected = selected.includes(method.id);
                return (
                  <label
                    key={method.id}
                    className={`flex cursor-pointer items-start gap-3 rounded-lg border p-3 transition-colors ${
                      isSelected
                        ? `border-primary/50 ${colors.light} ${colors.dark}`
                        : "border-border hover:bg-muted/50"
                    }`}
                  >
                    <Checkbox
                      checked={isSelected}
                      onCheckedChange={() => toggle(method.id)}
                      className="mt-0.5"
                    />
                    <div className="flex-1">
                      <div className="text-sm font-medium">{method.name}</div>
                      {METHOD_DESCRIPTIONS[method.slug] && (
                        <div className="mt-0.5 text-xs text-muted-foreground">
                          {METHOD_DESCRIPTIONS[method.slug]}
                        </div>
                      )}
                    </div>
                  </label>
                );
              })}
            </div>
          </div>
        );
      })}
    </div>
  );
}
```

- [ ] **Step 16: テスト実行して成功を確認**

Run: `cd /Users/mikiya/ws/kairous && bun test:small -- --run tests/small/components/method-selector.test.tsx`
Expected: PASS

- [ ] **Step 17: SubjectSelector を実装**

```tsx
// src/components/subject-selector.tsx
"use client";

import { useState } from "react";
import { Plus } from "lucide-react";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import type { Subject } from "@/lib/types/materials";

type SubjectSelectorProps = {
  subjects: Subject[];
  value: string;
  onChange: (value: string) => void;
  onCreateSubject: (name: string) => Promise<{ id: string; name: string } | null>;
};

export function SubjectSelector({
  subjects,
  value,
  onChange,
  onCreateSubject,
}: SubjectSelectorProps) {
  const [dialogOpen, setDialogOpen] = useState(false);
  const [newName, setNewName] = useState("");
  const [creating, setCreating] = useState(false);
  const [error, setError] = useState("");

  async function handleCreate() {
    if (!newName.trim()) {
      setError("科目名を入力してください");
      return;
    }

    setCreating(true);
    setError("");

    const result = await onCreateSubject(newName.trim());
    setCreating(false);

    if (result) {
      onChange(result.id);
      setNewName("");
      setDialogOpen(false);
    } else {
      setError("科目の作成に失敗しました");
    }
  }

  return (
    <div className="flex gap-2">
      <Select value={value} onValueChange={onChange}>
        <SelectTrigger className="flex-1">
          <SelectValue placeholder="科目を選択" />
        </SelectTrigger>
        <SelectContent>
          {subjects.map((subject) => (
            <SelectItem key={subject.id} value={subject.id}>
              {subject.name}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>

      <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
        <DialogTrigger asChild>
          <Button variant="outline" size="icon" aria-label="新規科目を追加">
            <Plus className="h-4 w-4" />
          </Button>
        </DialogTrigger>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>新規科目</DialogTitle>
          </DialogHeader>
          <div className="space-y-4">
            <div className="space-y-2">
              <Label htmlFor="subject-name">科目名</Label>
              <Input
                id="subject-name"
                value={newName}
                onChange={(e) => setNewName(e.target.value)}
                placeholder="例: 英語"
                onKeyDown={(e) => {
                  if (e.key === "Enter") {
                    e.preventDefault();
                    handleCreate();
                  }
                }}
              />
              {error && <p className="text-sm text-destructive">{error}</p>}
            </div>
            <Button onClick={handleCreate} disabled={creating} className="w-full">
              {creating ? "作成中..." : "作成"}
            </Button>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}
```

- [ ] **Step 18: MaterialCard を実装**

```tsx
// src/components/material-card.tsx
import Link from "next/link";
import { MethodChip } from "@/components/method-chip";
import type { MaterialWithMethods } from "@/lib/types/materials";
import { CARD_BASED_SLUGS } from "@/lib/constants";

type MaterialCardProps = {
  material: MaterialWithMethods;
};

export function MaterialCard({ material }: MaterialCardProps) {
  const hasCardMethods = material.methods.some((m) =>
    CARD_BASED_SLUGS.includes(m.slug as typeof CARD_BASED_SLUGS[number]),
  );

  return (
    <Link
      href={`/materials/${material.id}`}
      className="block rounded-xl border bg-card p-3 transition-colors hover:bg-muted/50"
    >
      <div className="flex items-start justify-between">
        <div className="flex-1 min-w-0">
          <div className="truncate text-sm font-semibold">{material.title}</div>
          <div className="mt-0.5 text-xs text-muted-foreground">
            {hasCardMethods
              ? `${material.total_cards}枚`
              : "セッション学習"}
          </div>
        </div>
        {material.due_count > 0 && (
          <div className="flex items-center gap-1 shrink-0">
            <div className="h-2 w-2 rounded-full bg-amber-500" />
            <span className="text-xs font-semibold text-amber-500">
              {material.due_count}
            </span>
          </div>
        )}
        {material.due_count === 0 && hasCardMethods && material.total_cards > 0 && (
          <div className="h-2 w-2 rounded-full bg-green-500 shrink-0" />
        )}
      </div>
      {material.methods.length > 0 && (
        <div className="mt-2 flex flex-wrap gap-1">
          {material.methods.map((method) => (
            <MethodChip key={method.id} method={method} />
          ))}
        </div>
      )}
    </Link>
  );
}
```

- [ ] **Step 19: 全 Small テスト実行**

Run: `cd /Users/mikiya/ws/kairous && bun test:small`
Expected: 全 PASS

- [ ] **Step 20: 型チェック + lint**

Run: `cd /Users/mikiya/ws/kairous && bun run typecheck && bun run lint`
Expected: エラーなし

- [ ] **Step 21: コミット**

```bash
cd /Users/mikiya/ws/kairous
git add src/components/material-card.tsx src/components/method-chip.tsx src/components/method-selector.tsx src/components/subject-selector.tsx src/components/card-editor.tsx src/components/search-bar.tsx src/components/empty-state.tsx tests/small/components/
git commit -m "feat: domain components for materials (MethodChip, CardEditor, SearchBar, etc)"
```

---

### Task 6: 教材一覧ページ + loading skeleton

**Files:**
- Replace: `src/app/(main)/materials/page.tsx`
- Create: `src/app/(main)/materials/loading.tsx`
- Test: コンポーネント単体テストは Task 5 で完了。ページ統合は Medium テストで確認

- [ ] **Step 1: loading.tsx を作成**

```tsx
// src/app/(main)/materials/loading.tsx
import { Skeleton } from "@/components/ui/skeleton";

export default function MaterialsLoading() {
  return (
    <div className="mx-auto max-w-4xl p-4 md:p-6">
      {/* 検索バーのスケルトン */}
      <div className="mb-6 flex items-center justify-between gap-4">
        <Skeleton className="h-10 flex-1" />
        <Skeleton className="hidden h-10 w-28 md:block" />
      </div>

      {/* 科目セクション x 2 */}
      {[1, 2].map((section) => (
        <div key={section} className="mb-6">
          <div className="mb-3 flex items-center justify-between">
            <Skeleton className="h-4 w-16" />
            <Skeleton className="h-3 w-12" />
          </div>
          <div className="grid gap-2 md:grid-cols-2">
            {[1, 2, 3].map((card) => (
              <div key={card} className="rounded-xl border p-3">
                <div className="flex items-start justify-between">
                  <div className="flex-1">
                    <Skeleton className="mb-1 h-4 w-32" />
                    <Skeleton className="h-3 w-20" />
                  </div>
                  <Skeleton className="h-2 w-2 rounded-full" />
                </div>
                <div className="mt-2 flex gap-1">
                  <Skeleton className="h-5 w-14 rounded-full" />
                  <Skeleton className="h-5 w-12 rounded-full" />
                </div>
              </div>
            ))}
          </div>
        </div>
      ))}
    </div>
  );
}
```

- [ ] **Step 2: materials page を実装**

```tsx
// src/app/(main)/materials/page.tsx
import { Plus } from "lucide-react";
import Link from "next/link";
import { getMaterials } from "@/lib/actions/materials";
import { MaterialCard } from "@/components/material-card";
import { EmptyState } from "@/components/empty-state";
import { Button } from "@/components/ui/button";
import { MaterialsSearch } from "./materials-search";

export default async function MaterialsPage() {
  const materials = await getMaterials();

  if (materials.length === 0) {
    return (
      <div className="mx-auto max-w-4xl p-4 md:p-6">
        <EmptyState
          title="教材がありません"
          description="最初の教材を追加しましょう"
          action={{ label: "教材を追加", href: "/materials/new" }}
        />
      </div>
    );
  }

  // 科目別にグルーピング
  const grouped = new Map<string, { subject: { id: string; name: string; color: string }; materials: typeof materials }>();
  for (const material of materials) {
    const key = material.subject_id;
    if (!grouped.has(key)) {
      grouped.set(key, { subject: material.subject, materials: [] });
    }
    grouped.get(key)!.materials.push(material);
  }

  return (
    <div className="mx-auto max-w-4xl p-4 md:p-6">
      {/* ヘッダー */}
      <div className="mb-6 flex items-center justify-between gap-4">
        <MaterialsSearch />
        <Button asChild className="hidden md:inline-flex">
          <Link href="/materials/new">
            <Plus className="mr-1.5 h-4 w-4" />
            新規教材
          </Link>
        </Button>
      </div>

      {/* 科目別セクション */}
      {Array.from(grouped.entries()).map(([subjectId, { subject, materials: subjectMaterials }]) => (
        <section key={subjectId} className="mb-6">
          <div className="mb-3 flex items-center justify-between">
            <h2 className="text-xs font-bold uppercase text-muted-foreground">
              {subject.name}
            </h2>
            <span className="text-xs text-muted-foreground">
              {subjectMaterials.length} 教材
            </span>
          </div>
          <div className="grid gap-2 md:grid-cols-2">
            {subjectMaterials.map((material) => (
              <MaterialCard key={material.id} material={material} />
            ))}
          </div>
        </section>
      ))}

      {/* Mobile FAB */}
      <div className="fixed bottom-20 right-4 md:hidden">
        <Button asChild size="icon" className="h-12 w-12 rounded-full shadow-lg">
          <Link href="/materials/new" aria-label="新規教材を追加">
            <Plus className="h-6 w-6" />
          </Link>
        </Button>
      </div>
    </div>
  );
}
```

- [ ] **Step 3: MaterialsSearch クライアントコンポーネントを作成**

```tsx
// src/app/(main)/materials/materials-search.tsx
"use client";

import { useRouter, useSearchParams } from "next/navigation";
import { useCallback } from "react";
import { SearchBar } from "@/components/search-bar";

export function MaterialsSearch() {
  const router = useRouter();
  const searchParams = useSearchParams();

  const handleSearch = useCallback(
    (query: string) => {
      const params = new URLSearchParams(searchParams.toString());
      if (query) {
        params.set("q", query);
      } else {
        params.delete("q");
      }
      router.replace(`/materials?${params.toString()}`);
    },
    [router, searchParams],
  );

  return <SearchBar onSearch={handleSearch} placeholder="教材を検索..." />;
}
```

NOTE: 検索クエリ `q` パラメータを `getMaterials` で使うためには、`page.tsx` で searchParams を受け取り、Server Action にフィルタリングロジックを追加する必要がある。サブエージェントは `getMaterials` にタイトル検索パラメータを追加し、`page.tsx` の Props で `searchParams` を受け取るよう修正すること。

`getMaterials` に `search` パラメータを追加:

```ts
// src/lib/actions/materials.ts の getMaterials を修正
export async function getMaterials(
  options?: { subjectId?: string; search?: string },
): Promise<MaterialWithMethods[]> {
  // ... existing code ...
  let query = supabase
    .from("materials")
    .select(/* ... */)
    .eq("user_id", user.id)
    .order("created_at", { ascending: false });

  if (options?.subjectId) {
    query = query.eq("subject_id", options.subjectId);
  }

  if (options?.search) {
    query = query.ilike("title", `%${options.search}%`);
  }
  // ...
}
```

`page.tsx` を修正して searchParams を受け取る:

```tsx
// src/app/(main)/materials/page.tsx の Props を修正
export default async function MaterialsPage({
  searchParams,
}: {
  searchParams: Promise<{ q?: string }>;
}) {
  const params = await searchParams;
  const materials = await getMaterials({ search: params.q });
  // ... rest of the page
}
```

- [ ] **Step 4: 型チェック + lint**

Run: `cd /Users/mikiya/ws/kairous && bun run typecheck && bun run lint`
Expected: エラーなし

- [ ] **Step 5: コミット**

```bash
cd /Users/mikiya/ws/kairous
git add src/app/\(main\)/materials/
git commit -m "feat: materials list page with subject grouping, search, and loading skeleton"
```

---

### Task 7: 教材作成ウィザード (3 steps)

**Files:**
- Create: `src/app/(main)/materials/new/page.tsx`

- [ ] **Step 1: ウィザードページを実装**

```tsx
// src/app/(main)/materials/new/page.tsx
import { getSubjects } from "@/lib/actions/subjects";
import { getMethods } from "@/lib/actions/material-methods";
import { MaterialWizard } from "./material-wizard";

export default async function NewMaterialPage() {
  const [subjects, methods] = await Promise.all([getSubjects(), getMethods()]);

  return (
    <div className="mx-auto max-w-2xl p-4 md:p-6">
      <h1 className="mb-6 text-lg font-bold">教材を作成</h1>
      <MaterialWizard subjects={subjects} methods={methods} />
    </div>
  );
}
```

- [ ] **Step 2: MaterialWizard クライアントコンポーネントを作成**

```tsx
// src/app/(main)/materials/new/material-wizard.tsx
"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Loader2 } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { SubjectSelector } from "@/components/subject-selector";
import { MethodSelector } from "@/components/method-selector";
import { CardEditor } from "@/components/card-editor";
import { createMaterial } from "@/lib/actions/materials";
import { createCard } from "@/lib/actions/cards";
import { createSubject } from "@/lib/actions/subjects";
import { CARD_BASED_SLUGS, MATERIAL_METHOD_SLUGS } from "@/lib/constants";
import type { Subject, LearningMethod } from "@/lib/types/materials";

type WizardCard = { front: string; back: string };

type MaterialWizardProps = {
  subjects: Subject[];
  methods: LearningMethod[];
};

const TOTAL_STEPS = 3;

export function MaterialWizard({ subjects: initialSubjects, methods }: MaterialWizardProps) {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();

  // State
  const [step, setStep] = useState(1);
  const [subjects, setSubjects] = useState(initialSubjects);

  // Step 1
  const [title, setTitle] = useState("");
  const [description, setDescription] = useState("");
  const [subjectId, setSubjectId] = useState("");
  const [step1Errors, setStep1Errors] = useState<Record<string, string>>({});

  // Step 2
  const [selectedMethodIds, setSelectedMethodIds] = useState<string[]>([]);
  const [step2Error, setStep2Error] = useState("");

  // Step 3
  const [cards, setCards] = useState<WizardCard[]>([]);

  // 教材に紐付け可能な手法のみ
  const bindableMethods = methods.filter((m) =>
    MATERIAL_METHOD_SLUGS.includes(m.slug as typeof MATERIAL_METHOD_SLUGS[number]),
  );

  // カードベース手法が選択されているか
  const hasCardMethods = selectedMethodIds.some((id) => {
    const method = methods.find((m) => m.id === id);
    return method && CARD_BASED_SLUGS.includes(method.slug as typeof CARD_BASED_SLUGS[number]);
  });

  // Step 3 をスキップするか
  const skipStep3 = !hasCardMethods;

  function validateStep1(): boolean {
    const errors: Record<string, string> = {};
    if (!title.trim()) errors.title = "タイトルを入力してください";
    if (title.length > 200) errors.title = "200文字以内で入力してください";
    if (!subjectId) errors.subject_id = "科目を選択してください";
    setStep1Errors(errors);
    return Object.keys(errors).length === 0;
  }

  function handleNext() {
    if (step === 1) {
      if (!validateStep1()) return;
      setStep(2);
    } else if (step === 2) {
      if (selectedMethodIds.length === 0) {
        setStep2Error("学習手法を1つ以上選択してください");
        return;
      }
      setStep2Error("");
      if (skipStep3) {
        handleSubmit();
      } else {
        setStep(3);
      }
    }
  }

  function handleBack() {
    if (step > 1) setStep(step - 1);
  }

  function handleAddCard(data: { front: string; back: string }) {
    setCards((prev) => [...prev, data]);
  }

  function handleRemoveCard(index: number) {
    setCards((prev) => prev.filter((_, i) => i !== index));
  }

  async function handleCreateSubject(name: string): Promise<{ id: string; name: string } | null> {
    const formData = new FormData();
    formData.set("name", name);

    const result = await createSubject(formData);
    if (result.success) {
      // ローカルの科目リストを更新
      setSubjects((prev) => [...prev, { ...result.data, color: "#6b7280", display_order: prev.length, user_id: "", created_at: "" } as Subject]);
      return result.data;
    }
    return null;
  }

  function handleSubmit() {
    startTransition(async () => {
      const formData = new FormData();
      formData.set("title", title);
      if (description) formData.set("description", description);
      formData.set("subject_id", subjectId);
      formData.set("method_ids", JSON.stringify(selectedMethodIds));

      const result = await createMaterial(formData);

      if (!result.success) {
        toast.error(result.error);
        return;
      }

      // カードを順番に作成
      for (const card of cards) {
        const cardFormData = new FormData();
        cardFormData.set("front", card.front);
        cardFormData.set("back", card.back);

        const cardResult = await createCard(result.data.id, cardFormData);
        if (!cardResult.success) {
          toast.error(`カード作成に失敗: ${cardResult.error}`);
        }
      }

      router.push(`/materials/${result.data.id}`);
    });
  }

  const effectiveSteps = skipStep3 ? 2 : TOTAL_STEPS;

  return (
    <div>
      {/* プログレスバー */}
      <div className="mb-8 flex gap-2">
        {Array.from({ length: effectiveSteps }).map((_, i) => (
          <div
            key={i}
            className={`h-1.5 flex-1 rounded-full transition-colors ${
              i < step ? "bg-primary" : "bg-muted"
            }`}
          />
        ))}
      </div>

      {/* Step 1: 基本情報 */}
      {step === 1 && (
        <div className="space-y-4">
          <h2 className="text-base font-semibold">基本情報</h2>
          <div className="space-y-2">
            <Label htmlFor="title">タイトル</Label>
            <Input
              id="title"
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              placeholder="例: 英単語 TOEIC 600"
            />
            {step1Errors.title && (
              <p className="text-sm text-destructive">{step1Errors.title}</p>
            )}
          </div>
          <div className="space-y-2">
            <Label htmlFor="description">説明（任意）</Label>
            <Textarea
              id="description"
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              placeholder="この教材の説明"
              rows={3}
            />
          </div>
          <div className="space-y-2">
            <Label>科目</Label>
            <SubjectSelector
              subjects={subjects}
              value={subjectId}
              onChange={setSubjectId}
              onCreateSubject={handleCreateSubject}
            />
            {step1Errors.subject_id && (
              <p className="text-sm text-destructive">{step1Errors.subject_id}</p>
            )}
          </div>
        </div>
      )}

      {/* Step 2: 学習手法の選択 */}
      {step === 2 && (
        <div className="space-y-4">
          <h2 className="text-base font-semibold">学習手法を選択</h2>
          <p className="text-sm text-muted-foreground">
            この教材で使う学習手法を1つ以上選んでください
          </p>
          <MethodSelector
            methods={bindableMethods}
            selected={selectedMethodIds}
            onChange={setSelectedMethodIds}
          />
          {step2Error && (
            <p className="text-sm text-destructive">{step2Error}</p>
          )}
        </div>
      )}

      {/* Step 3: カード追加 */}
      {step === 3 && (
        <div className="space-y-4">
          <h2 className="text-base font-semibold">カードを追加</h2>
          <p className="text-sm text-muted-foreground">
            あとから追加・編集もできます
          </p>

          {/* 追加済みカードリスト */}
          {cards.length > 0 && (
            <div className="space-y-2">
              {cards.map((card, index) => (
                <div
                  key={index}
                  className="flex items-center justify-between rounded-lg border p-3"
                >
                  <div className="min-w-0 flex-1">
                    <div className="truncate text-sm font-medium">{card.front}</div>
                    <div className="truncate text-xs text-muted-foreground">{card.back}</div>
                  </div>
                  <button
                    onClick={() => handleRemoveCard(index)}
                    className="ml-2 text-sm text-destructive hover:underline"
                  >
                    削除
                  </button>
                </div>
              ))}
            </div>
          )}

          <CardEditor onSubmit={handleAddCard} />
        </div>
      )}

      {/* ナビゲーションボタン */}
      <div className="mt-8 flex justify-between">
        {step > 1 ? (
          <Button variant="outline" onClick={handleBack} disabled={isPending}>
            戻る
          </Button>
        ) : (
          <div />
        )}

        {step === 3 ? (
          <Button onClick={handleSubmit} disabled={isPending}>
            {isPending && <Loader2 className="mr-1.5 h-4 w-4 animate-spin" />}
            完了（{cards.length}枚のカード）
          </Button>
        ) : (
          <Button onClick={handleNext} disabled={isPending}>
            {isPending && <Loader2 className="mr-1.5 h-4 w-4 animate-spin" />}
            {step === 2 && skipStep3 ? "作成" : "次へ"}
          </Button>
        )}
      </div>
    </div>
  );
}
```

- [ ] **Step 3: 型チェック + lint**

Run: `cd /Users/mikiya/ws/kairous && bun run typecheck && bun run lint`
Expected: エラーなし

- [ ] **Step 4: コミット**

```bash
cd /Users/mikiya/ws/kairous
git add src/app/\(main\)/materials/new/
git commit -m "feat: material creation wizard (3-step with conditional card step)"
```

---

### Task 8: 教材詳細ページ (タブ式)

**Files:**
- Create: `src/app/(main)/materials/[id]/page.tsx`
- Create: `src/app/(main)/materials/[id]/loading.tsx`

- [ ] **Step 1: loading.tsx を作成**

```tsx
// src/app/(main)/materials/[id]/loading.tsx
import { Skeleton } from "@/components/ui/skeleton";

export default function MaterialDetailLoading() {
  return (
    <div className="mx-auto max-w-4xl p-4 md:p-6">
      {/* ヘッダー */}
      <div className="mb-6">
        <Skeleton className="mb-1 h-6 w-48" />
        <Skeleton className="h-4 w-24" />
        <div className="mt-3 flex gap-2">
          <Skeleton className="h-6 w-16 rounded-full" />
          <Skeleton className="h-6 w-20 rounded-full" />
        </div>
      </div>

      {/* タブ */}
      <div className="mb-4 flex gap-4 border-b">
        <Skeleton className="h-8 w-16" />
        <Skeleton className="h-8 w-16" />
        <Skeleton className="h-8 w-16" />
      </div>

      {/* コンテンツ */}
      <div className="grid gap-4 md:grid-cols-3">
        <Skeleton className="h-20 rounded-xl" />
        <Skeleton className="h-20 rounded-xl" />
        <Skeleton className="h-20 rounded-xl" />
      </div>
    </div>
  );
}
```

- [ ] **Step 2: material detail ページを実装**

```tsx
// src/app/(main)/materials/[id]/page.tsx
import { notFound } from "next/navigation";
import Link from "next/link";
import { Pencil, Plus } from "lucide-react";
import { formatDistanceToNow } from "date-fns";
import { ja } from "date-fns/locale";
import { getMaterial } from "@/lib/actions/materials";
import { getCards } from "@/lib/actions/cards";
import { MethodChip } from "@/components/method-chip";
import { EmptyState } from "@/components/empty-state";
import { Button } from "@/components/ui/button";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Separator } from "@/components/ui/separator";
import { MaterialMethodSheet } from "./material-method-sheet";
import { CardListItem } from "./card-list-item";

export default async function MaterialDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const [material, cards] = await Promise.all([
    getMaterial(id),
    getCards(id),
  ]);

  if (!material) {
    notFound();
  }

  return (
    <div className="mx-auto max-w-4xl p-4 md:p-6">
      {/* ヘッダー */}
      <div className="mb-6">
        <div className="flex items-start justify-between">
          <div>
            <h1 className="text-lg font-bold">{material.title}</h1>
            <p className="text-sm text-muted-foreground">{material.subject.name}</p>
          </div>
          <Button variant="outline" size="sm" asChild>
            <Link href={`/materials/${id}/edit`}>
              <Pencil className="mr-1.5 h-3.5 w-3.5" />
              編集
            </Link>
          </Button>
        </div>
        {material.description && (
          <p className="mt-2 text-sm text-muted-foreground">{material.description}</p>
        )}
        <div className="mt-3 flex flex-wrap items-center gap-1.5">
          {material.methods.map((method) => (
            <MethodChip key={method.id} method={method} />
          ))}
          <MaterialMethodSheet materialId={id} currentMethods={material.methods} />
        </div>
      </div>

      {/* タブ */}
      <Tabs defaultValue="overview">
        <TabsList>
          <TabsTrigger value="overview">概要</TabsTrigger>
          <TabsTrigger value="cards">カード ({cards.length})</TabsTrigger>
          <TabsTrigger value="stats">統計</TabsTrigger>
        </TabsList>

        {/* 概要タブ */}
        <TabsContent value="overview" className="mt-4 space-y-6">
          {/* クイック統計 */}
          <div className="grid gap-3 sm:grid-cols-3">
            <Card>
              <CardHeader className="p-4 pb-2">
                <CardTitle className="text-xs font-medium text-muted-foreground">
                  本日 due
                </CardTitle>
              </CardHeader>
              <CardContent className="p-4 pt-0">
                <div className="text-2xl font-bold">{material.due_count}</div>
              </CardContent>
            </Card>
            <Card>
              <CardHeader className="p-4 pb-2">
                <CardTitle className="text-xs font-medium text-muted-foreground">
                  総カード数
                </CardTitle>
              </CardHeader>
              <CardContent className="p-4 pt-0">
                <div className="text-2xl font-bold">{material.total_cards}</div>
              </CardContent>
            </Card>
            <Card>
              <CardHeader className="p-4 pb-2">
                <CardTitle className="text-xs font-medium text-muted-foreground">
                  正答率
                </CardTitle>
              </CardHeader>
              <CardContent className="p-4 pt-0">
                <div className="text-2xl font-bold">
                  {material.accuracy_rate !== null
                    ? `${Math.round(material.accuracy_rate * 100)}%`
                    : "---"}
                </div>
              </CardContent>
            </Card>
          </div>

          {/* 最近のセッション */}
          <div>
            <h3 className="mb-3 text-sm font-semibold">最近のセッション</h3>
            {material.recent_sessions.length === 0 ? (
              <p className="text-sm text-muted-foreground">まだセッションはありません</p>
            ) : (
              <div className="space-y-2">
                {material.recent_sessions.map((session) => (
                  <div
                    key={session.id}
                    className="flex items-center justify-between rounded-lg border p-3"
                  >
                    <div>
                      <div className="text-sm font-medium">{session.method.name}</div>
                      <div className="text-xs text-muted-foreground">
                        {Math.floor(session.duration_sec / 60)}分
                        {session.self_rating !== null && ` / 評価: ${session.self_rating}`}
                      </div>
                    </div>
                    <div className="text-xs text-muted-foreground">
                      {formatDistanceToNow(new Date(session.started_at), {
                        addSuffix: true,
                        locale: ja,
                      })}
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        </TabsContent>

        {/* カードタブ */}
        <TabsContent value="cards" className="mt-4">
          <div className="mb-4 flex justify-end">
            <Button asChild size="sm">
              <Link href={`/materials/${id}/cards/new`}>
                <Plus className="mr-1.5 h-3.5 w-3.5" />
                新規カード
              </Link>
            </Button>
          </div>
          {cards.length === 0 ? (
            <EmptyState
              title="カードがありません"
              description="カードを追加して学習を始めましょう"
              action={{ label: "カードを追加", href: `/materials/${id}/cards/new` }}
            />
          ) : (
            <div className="space-y-2">
              {cards.map((card) => (
                <CardListItem
                  key={card.id}
                  card={card}
                  materialId={id}
                />
              ))}
            </div>
          )}
        </TabsContent>

        {/* 統計タブ */}
        <TabsContent value="stats" className="mt-4">
          <div className="flex flex-col items-center justify-center py-12 text-center">
            <p className="text-sm text-muted-foreground">統計機能は準備中です</p>
          </div>
        </TabsContent>
      </Tabs>
    </div>
  );
}
```

- [ ] **Step 3: CardListItem コンポーネントを作成**

```tsx
// src/app/(main)/materials/[id]/card-list-item.tsx
"use client";

import Link from "next/link";
import { useTransition } from "react";
import { Loader2, Pencil, Trash2 } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
  DialogClose,
} from "@/components/ui/dialog";
import { deleteCard } from "@/lib/actions/cards";
import type { Card } from "@/lib/types/materials";

type CardListItemProps = {
  card: Card;
  materialId: string;
};

export function CardListItem({ card, materialId }: CardListItemProps) {
  const [isPending, startTransition] = useTransition();

  function handleDelete() {
    startTransition(async () => {
      const result = await deleteCard(card.id);
      if (!result.success) {
        toast.error(result.error);
      }
    });
  }

  return (
    <div className="flex items-center justify-between rounded-lg border p-3">
      <Link
        href={`/materials/${materialId}/cards/${card.id}/edit`}
        className="min-w-0 flex-1"
      >
        <div className="truncate text-sm font-medium">{card.front}</div>
        <div className="truncate text-xs text-muted-foreground">{card.back}</div>
      </Link>
      <div className="ml-2 flex shrink-0 gap-1">
        <Button variant="ghost" size="icon" asChild className="h-8 w-8">
          <Link href={`/materials/${materialId}/cards/${card.id}/edit`}>
            <Pencil className="h-3.5 w-3.5" />
          </Link>
        </Button>
        <Dialog>
          <DialogTrigger asChild>
            <Button variant="ghost" size="icon" className="h-8 w-8 text-destructive">
              <Trash2 className="h-3.5 w-3.5" />
            </Button>
          </DialogTrigger>
          <DialogContent>
            <DialogHeader>
              <DialogTitle>カードを削除</DialogTitle>
            </DialogHeader>
            <p className="text-sm text-muted-foreground">
              このカードと関連する学習履歴（SRS状態、レビュー記録）が全て削除されます。この操作は元に戻せません。
            </p>
            <div className="flex justify-end gap-2">
              <DialogClose asChild>
                <Button variant="outline">キャンセル</Button>
              </DialogClose>
              <Button variant="destructive" onClick={handleDelete} disabled={isPending}>
                {isPending && <Loader2 className="mr-1.5 h-4 w-4 animate-spin" />}
                削除
              </Button>
            </div>
          </DialogContent>
        </Dialog>
      </div>
    </div>
  );
}
```

- [ ] **Step 4: MaterialMethodSheet コンポーネントを作成**

```tsx
// src/app/(main)/materials/[id]/material-method-sheet.tsx
"use client";

import { useEffect, useState, useTransition } from "react";
import { Plus, Loader2 } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import {
  Sheet,
  SheetContent,
  SheetHeader,
  SheetTitle,
  SheetTrigger,
} from "@/components/ui/sheet";
import { MethodSelector } from "@/components/method-selector";
import { addMaterialMethod, removeMaterialMethod, getMethods } from "@/lib/actions/material-methods";
import type { LearningMethod } from "@/lib/types/materials";

type MaterialMethodSheetProps = {
  materialId: string;
  currentMethods: { id: string; slug: string; name: string; category: string }[];
};

export function MaterialMethodSheet({ materialId, currentMethods }: MaterialMethodSheetProps) {
  const [open, setOpen] = useState(false);
  const [allMethods, setAllMethods] = useState<LearningMethod[]>([]);
  const [selectedIds, setSelectedIds] = useState<string[]>([]);
  const [isPending, startTransition] = useTransition();

  // Sheet が開いたときに全手法を取得
  useEffect(() => {
    if (open) {
      getMethods().then(setAllMethods);
      setSelectedIds(currentMethods.map((m) => m.id));
    }
  }, [open, currentMethods]);

  function handleSave() {
    startTransition(async () => {
      const currentIds = new Set(currentMethods.map((m) => m.id));
      const newIds = new Set(selectedIds);

      // 追加
      for (const id of newIds) {
        if (!currentIds.has(id)) {
          const result = await addMaterialMethod(materialId, id);
          if (!result.success) {
            toast.error(result.error);
            return;
          }
        }
      }

      // 削除
      for (const id of currentIds) {
        if (!newIds.has(id)) {
          const result = await removeMaterialMethod(materialId, id);
          if (!result.success) {
            toast.error(result.error);
            return;
          }
        }
      }

      setOpen(false);
    });
  }

  return (
    <Sheet open={open} onOpenChange={setOpen}>
      <SheetTrigger asChild>
        <Button variant="outline" size="sm" className="h-6 px-2">
          <Plus className="mr-1 h-3 w-3" />
          手法
        </Button>
      </SheetTrigger>
      <SheetContent side="bottom" className="max-h-[80vh] overflow-y-auto sm:max-h-none sm:w-[400px]">
        <SheetHeader>
          <SheetTitle>学習手法を管理</SheetTitle>
        </SheetHeader>
        <div className="mt-4">
          <MethodSelector
            methods={allMethods}
            selected={selectedIds}
            onChange={setSelectedIds}
          />
          <div className="mt-6 flex justify-end">
            <Button onClick={handleSave} disabled={isPending || selectedIds.length === 0}>
              {isPending && <Loader2 className="mr-1.5 h-4 w-4 animate-spin" />}
              保存
            </Button>
          </div>
        </div>
      </SheetContent>
    </Sheet>
  );
}
```

- [ ] **Step 5: 型チェック + lint**

Run: `cd /Users/mikiya/ws/kairous && bun run typecheck && bun run lint`
Expected: エラーなし

- [ ] **Step 6: コミット**

```bash
cd /Users/mikiya/ws/kairous
git add src/app/\(main\)/materials/\[id\]/
git commit -m "feat: material detail page with tabs (overview, cards, stats)"
```

---

### Task 9: 教材編集 + 削除

**Files:**
- Create: `src/app/(main)/materials/[id]/edit/page.tsx`

- [ ] **Step 1: edit ページを実装**

```tsx
// src/app/(main)/materials/[id]/edit/page.tsx
import { notFound } from "next/navigation";
import { getMaterial } from "@/lib/actions/materials";
import { getSubjects } from "@/lib/actions/subjects";
import { MaterialEditForm } from "./material-edit-form";

export default async function MaterialEditPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const [material, subjects] = await Promise.all([
    getMaterial(id),
    getSubjects(),
  ]);

  if (!material) {
    notFound();
  }

  return (
    <div className="mx-auto max-w-2xl p-4 md:p-6">
      <h1 className="mb-6 text-lg font-bold">教材を編集</h1>
      <MaterialEditForm
        material={material}
        subjects={subjects}
      />
    </div>
  );
}
```

- [ ] **Step 2: MaterialEditForm クライアントコンポーネントを作成**

```tsx
// src/app/(main)/materials/[id]/edit/material-edit-form.tsx
"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Loader2 } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { SubjectSelector } from "@/components/subject-selector";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
  DialogClose,
} from "@/components/ui/dialog";
import { updateMaterial, deleteMaterial } from "@/lib/actions/materials";
import { createSubject } from "@/lib/actions/subjects";
import type { MaterialDetail, Subject } from "@/lib/types/materials";

type MaterialEditFormProps = {
  material: MaterialDetail;
  subjects: Subject[];
};

export function MaterialEditForm({ material, subjects: initialSubjects }: MaterialEditFormProps) {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();
  const [isDeleting, startDeleteTransition] = useTransition();

  const [title, setTitle] = useState(material.title);
  const [description, setDescription] = useState(material.description ?? "");
  const [subjectId, setSubjectId] = useState(material.subject_id);
  const [subjects, setSubjects] = useState(initialSubjects);
  const [errors, setErrors] = useState<Record<string, string>>({});

  async function handleCreateSubject(name: string): Promise<{ id: string; name: string } | null> {
    const formData = new FormData();
    formData.set("name", name);

    const result = await createSubject(formData);
    if (result.success) {
      setSubjects((prev) => [...prev, { ...result.data, color: "#6b7280", display_order: prev.length, user_id: "", created_at: "" } as Subject]);
      return result.data;
    }
    return null;
  }

  function handleSave() {
    setErrors({});
    if (!title.trim()) {
      setErrors({ title: "タイトルを入力してください" });
      return;
    }

    startTransition(async () => {
      const formData = new FormData();
      formData.set("title", title);
      formData.set("description", description);
      formData.set("subject_id", subjectId);

      const result = await updateMaterial(material.id, formData);

      if (!result.success) {
        toast.error(result.error);
        if (result.fieldErrors) {
          const mapped: Record<string, string> = {};
          for (const [key, msgs] of Object.entries(result.fieldErrors)) {
            if (msgs?.[0]) mapped[key] = msgs[0];
          }
          setErrors(mapped);
        }
        return;
      }

      router.push(`/materials/${material.id}`);
    });
  }

  function handleDelete() {
    startDeleteTransition(async () => {
      const result = await deleteMaterial(material.id);

      if (!result.success) {
        toast.error(result.error);
        return;
      }

      router.push("/materials");
    });
  }

  return (
    <div className="space-y-6">
      <div className="space-y-4">
        <div className="space-y-2">
          <Label htmlFor="edit-title">タイトル</Label>
          <Input
            id="edit-title"
            value={title}
            onChange={(e) => setTitle(e.target.value)}
          />
          {errors.title && (
            <p className="text-sm text-destructive">{errors.title}</p>
          )}
        </div>
        <div className="space-y-2">
          <Label htmlFor="edit-description">説明（任意）</Label>
          <Textarea
            id="edit-description"
            value={description}
            onChange={(e) => setDescription(e.target.value)}
            rows={3}
          />
        </div>
        <div className="space-y-2">
          <Label>科目</Label>
          <SubjectSelector
            subjects={subjects}
            value={subjectId}
            onChange={setSubjectId}
            onCreateSubject={handleCreateSubject}
          />
        </div>
      </div>

      <div className="flex items-center justify-between">
        <Dialog>
          <DialogTrigger asChild>
            <Button variant="destructive" size="sm">
              削除
            </Button>
          </DialogTrigger>
          <DialogContent>
            <DialogHeader>
              <DialogTitle>教材を削除</DialogTitle>
            </DialogHeader>
            <p className="text-sm text-muted-foreground">
              この教材と関連する全てのカード・セッション記録が削除されます。この操作は元に戻せません。
            </p>
            <div className="flex justify-end gap-2">
              <DialogClose asChild>
                <Button variant="outline">キャンセル</Button>
              </DialogClose>
              <Button variant="destructive" onClick={handleDelete} disabled={isDeleting}>
                {isDeleting && <Loader2 className="mr-1.5 h-4 w-4 animate-spin" />}
                削除する
              </Button>
            </div>
          </DialogContent>
        </Dialog>

        <div className="flex gap-2">
          <Button
            variant="outline"
            onClick={() => router.push(`/materials/${material.id}`)}
          >
            キャンセル
          </Button>
          <Button onClick={handleSave} disabled={isPending}>
            {isPending && <Loader2 className="mr-1.5 h-4 w-4 animate-spin" />}
            保存
          </Button>
        </div>
      </div>
    </div>
  );
}
```

- [ ] **Step 3: 型チェック + lint**

Run: `cd /Users/mikiya/ws/kairous && bun run typecheck && bun run lint`
Expected: エラーなし

- [ ] **Step 4: コミット**

```bash
cd /Users/mikiya/ws/kairous
git add src/app/\(main\)/materials/\[id\]/edit/
git commit -m "feat: material edit page with delete confirmation"
```

---

### Task 10: カード追加 + 編集ページ

**Files:**
- Create: `src/app/(main)/materials/[id]/cards/new/page.tsx`
- Create: `src/app/(main)/materials/[id]/cards/[cardId]/edit/page.tsx`

- [ ] **Step 1: カード追加ページを実装**

```tsx
// src/app/(main)/materials/[id]/cards/new/page.tsx
import { notFound } from "next/navigation";
import { getMaterial } from "@/lib/actions/materials";
import { CardAddForm } from "./card-add-form";

export default async function NewCardPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const material = await getMaterial(id);

  if (!material) {
    notFound();
  }

  return (
    <div className="mx-auto max-w-2xl p-4 md:p-6">
      <h1 className="mb-1 text-lg font-bold">カードを追加</h1>
      <p className="mb-6 text-sm text-muted-foreground">{material.title}</p>
      <CardAddForm materialId={id} />
    </div>
  );
}
```

- [ ] **Step 2: CardAddForm クライアントコンポーネントを作成**

```tsx
// src/app/(main)/materials/[id]/cards/new/card-add-form.tsx
"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { CardEditor } from "@/components/card-editor";
import { Button } from "@/components/ui/button";
import { createCard } from "@/lib/actions/cards";

type CardAddFormProps = {
  materialId: string;
};

export function CardAddForm({ materialId }: CardAddFormProps) {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();
  const [addedCount, setAddedCount] = useState(0);

  function handleSubmit(data: { front: string; back: string }) {
    startTransition(async () => {
      const formData = new FormData();
      formData.set("front", data.front);
      formData.set("back", data.back);

      const result = await createCard(materialId, formData);
      if (!result.success) {
        toast.error(result.error);
        return;
      }

      setAddedCount((prev) => prev + 1);
      toast.success("カードを追加しました");
    });
  }

  return (
    <div>
      <CardEditor onSubmit={handleSubmit} loading={isPending} />
      {addedCount > 0 && (
        <p className="mt-4 text-sm text-muted-foreground">
          {addedCount}枚のカードを追加しました
        </p>
      )}
      <div className="mt-6">
        <Button
          variant="outline"
          onClick={() => router.push(`/materials/${materialId}?tab=cards`)}
        >
          完了
        </Button>
      </div>
    </div>
  );
}
```

- [ ] **Step 3: カード編集ページを実装**

```tsx
// src/app/(main)/materials/[id]/cards/[cardId]/edit/page.tsx
import { notFound } from "next/navigation";
import { getCards } from "@/lib/actions/cards";
import { CardEditForm } from "./card-edit-form";

export default async function EditCardPage({
  params,
}: {
  params: Promise<{ id: string; cardId: string }>;
}) {
  const { id, cardId } = await params;
  const cards = await getCards(id);
  const card = cards.find((c) => c.id === cardId);

  if (!card) {
    notFound();
  }

  return (
    <div className="mx-auto max-w-2xl p-4 md:p-6">
      <h1 className="mb-6 text-lg font-bold">カードを編集</h1>
      <CardEditForm card={card} materialId={id} />
    </div>
  );
}
```

- [ ] **Step 4: CardEditForm クライアントコンポーネントを作成**

```tsx
// src/app/(main)/materials/[id]/cards/[cardId]/edit/card-edit-form.tsx
"use client";

import { useTransition } from "react";
import { useRouter } from "next/navigation";
import { Loader2 } from "lucide-react";
import { toast } from "sonner";
import { CardEditor } from "@/components/card-editor";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
  DialogClose,
} from "@/components/ui/dialog";
import { updateCard, deleteCard } from "@/lib/actions/cards";
import type { Card } from "@/lib/types/materials";

type CardEditFormProps = {
  card: Card;
  materialId: string;
};

export function CardEditForm({ card, materialId }: CardEditFormProps) {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();
  const [isDeleting, startDeleteTransition] = useTransition();

  function handleSave(data: { front: string; back: string }) {
    startTransition(async () => {
      const formData = new FormData();
      formData.set("front", data.front);
      formData.set("back", data.back);

      const result = await updateCard(card.id, formData);
      if (!result.success) {
        toast.error(result.error);
        return;
      }

      router.push(`/materials/${materialId}?tab=cards`);
    });
  }

  function handleDelete() {
    startDeleteTransition(async () => {
      const result = await deleteCard(card.id);
      if (!result.success) {
        toast.error(result.error);
        return;
      }

      router.push(`/materials/${materialId}?tab=cards`);
    });
  }

  return (
    <div>
      <CardEditor
        defaultValues={{ front: card.front, back: card.back }}
        onSubmit={handleSave}
        submitLabel="保存"
        loading={isPending}
      />

      <div className="mt-6 flex items-center justify-between">
        <Dialog>
          <DialogTrigger asChild>
            <Button variant="destructive" size="sm">
              削除
            </Button>
          </DialogTrigger>
          <DialogContent>
            <DialogHeader>
              <DialogTitle>カードを削除</DialogTitle>
            </DialogHeader>
            <p className="text-sm text-muted-foreground">
              このカードと関連する学習履歴（SRS状態、レビュー記録）が全て削除されます。この操作は元に戻せません。
            </p>
            <div className="flex justify-end gap-2">
              <DialogClose asChild>
                <Button variant="outline">キャンセル</Button>
              </DialogClose>
              <Button variant="destructive" onClick={handleDelete} disabled={isDeleting}>
                {isDeleting && <Loader2 className="mr-1.5 h-4 w-4 animate-spin" />}
                削除
              </Button>
            </div>
          </DialogContent>
        </Dialog>

        <Button
          variant="outline"
          onClick={() => router.push(`/materials/${materialId}?tab=cards`)}
        >
          キャンセル
        </Button>
      </div>
    </div>
  );
}
```

- [ ] **Step 5: 型チェック + lint**

Run: `cd /Users/mikiya/ws/kairous && bun run typecheck && bun run lint`
Expected: エラーなし

- [ ] **Step 6: 全テスト実行**

Run: `cd /Users/mikiya/ws/kairous && bun test:small`
Expected: 全 PASS

- [ ] **Step 7: コミット**

```bash
cd /Users/mikiya/ws/kairous
git add src/app/\(main\)/materials/\[id\]/cards/
git commit -m "feat: card add and edit pages with delete confirmation"
```
