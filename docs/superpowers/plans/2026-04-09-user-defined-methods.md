# User-Defined Methods Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Let users create custom learning methods, attach them to materials, and run timer-based sessions with self-rating.

**Architecture:** Extend the existing `learning_methods` table with `user_id`, `description`, `default_duration_sec` columns. Add a `CustomMethodPlayer` for timer + self-rating sessions. Extend `MethodSelector` with inline CRUD via bottom sheet.

**Tech Stack:** Next.js 16 (App Router), Supabase (PostgreSQL + RLS), Zod, Tailwind CSS, shadcn/ui

**Spec:** `docs/superpowers/specs/2026-04-09-user-defined-methods-design.md`

**Migration number:** 00016

---

## File Map

| Purpose | Path | Action |
|---------|------|--------|
| Migration | `supabase/migrations/00016_user_defined_methods.sql` | Create |
| Method validation | `src/lib/validations/methods.ts` | Create |
| Method CRUD actions | `src/lib/actions/method-commands.ts` | Create |
| Custom player | `src/app/session/[id]/custom-method-player.tsx` | Create |
| Custom timer hook | `src/app/session/[id]/use-custom-timer.ts` | Create |
| Custom session completion | `src/lib/validations/custom-session.ts` | Create |
| Method bottom sheet | `src/components/method-form-sheet.tsx` | Create |
| Constants | `src/lib/constants.ts` | Modify |
| Method selector | `src/components/method-selector.tsx` | Modify |
| Material-methods actions | `src/lib/actions/material-methods.ts` | Modify |
| Session page routing | `src/app/session/[id]/page.tsx` | Modify |
| Session commands | `src/lib/actions/session-commands.ts` | Modify |
| Session summary | `src/app/session/[id]/summary/page.tsx` | Modify |
| DB types (regenerated) | `src/lib/types/database.ts` | Regenerate |
| Small tests (method validation) | `tests/small/validations/methods.test.ts` | Create |
| Small tests (slug generation) | `tests/small/lib/slug.test.ts` | Create |
| Small tests (custom timer) | `tests/small/hooks/use-custom-timer.test.ts` | Create |
| Medium tests (method CRUD) | `tests/medium/actions/method-commands.test.ts` | Create |
| Medium tests (custom session) | `tests/medium/actions/custom-session.test.ts` | Create |
| Medium tests (allowlist) | `tests/medium/actions/material-methods-custom.test.ts` | Create |

---

## Task 1: Database Migration

Add columns to `learning_methods`, enable RLS policies for user-defined methods, add partial unique index.

**Files:**
- Create: `supabase/migrations/00016_user_defined_methods.sql`

- [ ] **Step 1: Write the migration**

```sql
-- ユーザー定義手法のためのカラム追加・RLS ポリシー設定
-- learning_methods は 00001_core_domain.sql で作成済み。is_system カラムも既存

ALTER TABLE learning_methods
  ADD COLUMN user_id UUID REFERENCES auth.users(id),
  ADD COLUMN description TEXT,
  ADD COLUMN default_duration_sec INTEGER CHECK (default_duration_sec >= 60 AND default_duration_sec <= 10800);

-- システム手法は user_id=NULL、ユーザー定義手法は user_id 必須
ALTER TABLE learning_methods
  ADD CONSTRAINT chk_user_method
  CHECK (is_system = true OR user_id IS NOT NULL);

-- 同一ユーザーの手法名重複を防ぐ (システム手法は対象外)
CREATE UNIQUE INDEX uq_user_method_name
  ON learning_methods (user_id, name)
  WHERE is_system = false;

-- 既存ポリシー (00003: "Authenticated users can view methods") は SELECT のみ。
-- ユーザー定義手法の書き込みポリシーを追加する

-- SELECT: 既存ポリシーは USING(true) なのでシステム手法+全ユーザー手法を返す。
-- ユーザー定義手法は自分のものだけ見えるよう、既存ポリシーを置き換える
DROP POLICY "Authenticated users can view methods" ON learning_methods;

CREATE POLICY "Users can view system and own methods"
  ON learning_methods FOR SELECT TO authenticated
  USING (is_system = true OR user_id = auth.uid());

CREATE POLICY "Users can insert own custom methods"
  ON learning_methods FOR INSERT TO authenticated
  WITH CHECK (is_system = false AND user_id = auth.uid());

CREATE POLICY "Users can update own custom methods"
  ON learning_methods FOR UPDATE TO authenticated
  USING (is_system = false AND user_id = auth.uid())
  WITH CHECK (is_system = false AND user_id = auth.uid());

CREATE POLICY "Users can delete own custom methods"
  ON learning_methods FOR DELETE TO authenticated
  USING (is_system = false AND user_id = auth.uid());

-- material_methods の FK に ON DELETE CASCADE を追加
-- (既存 FK には CASCADE がないため、作り直す)
ALTER TABLE material_methods
  DROP CONSTRAINT material_methods_method_id_fkey,
  ADD CONSTRAINT material_methods_method_id_fkey
    FOREIGN KEY (method_id) REFERENCES learning_methods(id) ON DELETE CASCADE;
```

- [ ] **Step 2: Apply migration locally and regenerate types**

Run: `bunx supabase db reset && bunx supabase gen types typescript --local > src/lib/types/database.ts`
Expected: Migration applies without errors. `database.ts` includes `user_id`, `description`, `default_duration_sec` columns in `learning_methods`.

- [ ] **Step 3: Commit**

```bash
git add supabase/migrations/00016_user_defined_methods.sql src/lib/types/database.ts
git commit -m "feat: ユーザー定義手法の migration 追加 (00016)"
```

---

## Task 2: Constants and Validation

Add validation limits, slug generation utility, and Zod schemas for method CRUD.

**Files:**
- Modify: `src/lib/constants.ts`
- Create: `src/lib/validations/methods.ts`
- Create: `tests/small/validations/methods.test.ts`
- Create: `tests/small/lib/slug.test.ts`

- [ ] **Step 1: Write slug generation tests**

```typescript
// tests/small/lib/slug.test.ts
import { describe, expect, it } from "vitest";
import { generateMethodSlug } from "@/lib/utils/slug";

describe("generateMethodSlug", () => {
  it("converts name to snake_case with custom prefix", () => {
    const slug = generateMethodSlug("abc12345", "ファインマンテクニック");
    expect(slug).toBe("custom_abc12345_ファインマンテクニック");
  });

  it("trims whitespace from name", () => {
    const slug = generateMethodSlug("abc12345", "  音読  ");
    expect(slug).toBe("custom_abc12345_音読");
  });

  it("uses first 8 chars of userId", () => {
    const slug = generateMethodSlug("abcdef12-3456-7890-abcd-ef1234567890", "Test");
    expect(slug).toBe("custom_abcdef12_Test");
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `bun test:small tests/small/lib/slug.test.ts`
Expected: FAIL with "Cannot find module"

- [ ] **Step 3: Implement slug generation**

```typescript
// src/lib/utils/slug.ts
export function generateMethodSlug(userId: string, name: string): string {
  const prefix = userId.slice(0, 8);
  const trimmed = name.trim();
  return `custom_${prefix}_${trimmed}`;
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `bun test:small tests/small/lib/slug.test.ts`
Expected: PASS

- [ ] **Step 5: Write method validation tests**

```typescript
// tests/small/validations/methods.test.ts
import { describe, expect, it } from "vitest";
import { createMethodSchema, updateMethodSchema } from "@/lib/validations/methods";

describe("createMethodSchema", () => {
  const valid = {
    name: "ファインマンテクニック",
    category: "comprehension" as const,
    description: "自分の言葉で説明する",
    default_duration_sec: 1500,
  };

  it("accepts valid input", () => {
    expect(createMethodSchema.safeParse(valid).success).toBe(true);
  });

  it("accepts input without optional fields", () => {
    const result = createMethodSchema.safeParse({
      name: "音読",
      category: "memory",
    });
    expect(result.success).toBe(true);
  });

  it("rejects empty name", () => {
    expect(createMethodSchema.safeParse({ ...valid, name: "" }).success).toBe(false);
  });

  it("rejects name over 50 chars", () => {
    expect(createMethodSchema.safeParse({ ...valid, name: "a".repeat(51) }).success).toBe(false);
  });

  it("rejects invalid category", () => {
    expect(createMethodSchema.safeParse({ ...valid, category: "invalid" }).success).toBe(false);
  });

  it("rejects duration under 60 seconds", () => {
    expect(createMethodSchema.safeParse({ ...valid, default_duration_sec: 30 }).success).toBe(false);
  });

  it("rejects duration over 10800 seconds", () => {
    expect(createMethodSchema.safeParse({ ...valid, default_duration_sec: 20000 }).success).toBe(false);
  });

  it("accepts null duration for stopwatch mode", () => {
    expect(createMethodSchema.safeParse({ ...valid, default_duration_sec: null }).success).toBe(true);
  });

  it("rejects description over 500 chars", () => {
    expect(createMethodSchema.safeParse({ ...valid, description: "a".repeat(501) }).success).toBe(false);
  });
});

describe("updateMethodSchema", () => {
  it("accepts partial update with name only", () => {
    const result = updateMethodSchema.safeParse({ name: "新しい名前" });
    expect(result.success).toBe(true);
  });
});
```

- [ ] **Step 6: Run test to verify it fails**

Run: `bun test:small tests/small/validations/methods.test.ts`
Expected: FAIL with "Cannot find module"

- [ ] **Step 7: Add constants and implement validation schemas**

Add to `src/lib/constants.ts` inside `VALIDATION_LIMITS`:

```typescript
METHOD_NAME_MAX: 50,
METHOD_DESCRIPTION_MAX: 500,
METHOD_DURATION_MIN: 60,
METHOD_DURATION_MAX: 10800,
```

Create `src/lib/validations/methods.ts`:

```typescript
import { z } from "zod";
import { VALIDATION_LIMITS } from "@/lib/constants";

const CATEGORIES = ["memory", "comprehension", "focus", "consolidation", "general"] as const;

export const createMethodSchema = z.object({
  name: z
    .string()
    .min(1, "手法名を入力してください")
    .max(VALIDATION_LIMITS.METHOD_NAME_MAX, `手法名は${VALIDATION_LIMITS.METHOD_NAME_MAX}文字以内で入力してください`),
  category: z.enum(CATEGORIES, { message: "カテゴリを選択してください" }),
  description: z
    .string()
    .max(VALIDATION_LIMITS.METHOD_DESCRIPTION_MAX, `説明は${VALIDATION_LIMITS.METHOD_DESCRIPTION_MAX}文字以内で入力してください`)
    .optional(),
  default_duration_sec: z
    .number()
    .int()
    .min(VALIDATION_LIMITS.METHOD_DURATION_MIN, "目標時間は1分以上にしてください")
    .max(VALIDATION_LIMITS.METHOD_DURATION_MAX, "目標時間は180分以内にしてください")
    .nullable()
    .optional(),
});

export const updateMethodSchema = createMethodSchema.partial();

export type CreateMethodInput = z.infer<typeof createMethodSchema>;
export type UpdateMethodInput = z.infer<typeof updateMethodSchema>;
```

- [ ] **Step 8: Run tests to verify they pass**

Run: `bun test:small tests/small/validations/methods.test.ts tests/small/lib/slug.test.ts`
Expected: All PASS

- [ ] **Step 9: Commit**

```bash
git add src/lib/utils/slug.ts src/lib/validations/methods.ts src/lib/constants.ts \
  tests/small/validations/methods.test.ts tests/small/lib/slug.test.ts
git commit -m "feat: ユーザー定義手法のバリデーションスキーマとスラッグ生成"
```

---

## Task 3: Method CRUD Server Actions

Create server actions for creating, updating, and deleting custom methods.

**Files:**
- Create: `src/lib/actions/method-commands.ts`
- Create: `tests/medium/actions/method-commands.test.ts`

- [ ] **Step 1: Write Medium tests for method CRUD**

```typescript
// tests/medium/actions/method-commands.test.ts
import { describe, expect, it, beforeEach } from "vitest";
import { createMethod, updateMethod, deleteMethod } from "@/lib/actions/method-commands";
import { getAdminClient } from "tests/shared/helpers";

// テストユーザーの setup は tests/shared/helpers.ts のパターンに従う
// 各テストで使う testUserId は beforeEach で取得する

describe("createMethod", () => {
  it("creates a custom method with all fields", async () => {
    const result = await createMethod({
      name: "ファインマンテクニック",
      category: "comprehension",
      description: "自分の言葉で説明する",
      default_duration_sec: 1500,
    });
    expect(result.success).toBe(true);
    if (!result.success) return;
    expect(result.data.slug).toContain("custom_");
    expect(result.data.is_system).toBe(false);
  });

  it("creates a stopwatch method when duration is null", async () => {
    const result = await createMethod({
      name: "マインドマップ",
      category: "comprehension",
    });
    expect(result.success).toBe(true);
    if (!result.success) return;
    expect(result.data.default_duration_sec).toBeNull();
  });

  it("rejects duplicate name for same user", async () => {
    await createMethod({ name: "音読", category: "memory" });
    const result = await createMethod({ name: "音読", category: "memory" });
    expect(result.success).toBe(false);
  });
});

describe("updateMethod", () => {
  it("updates name and category", async () => {
    const created = await createMethod({ name: "テスト手法", category: "memory" });
    if (!created.success) throw new Error("setup failed");

    const result = await updateMethod(created.data.id, {
      name: "更新された手法",
      category: "focus",
    });
    expect(result.success).toBe(true);
  });

  it("rejects update of system method", async () => {
    const admin = getAdminClient();
    const { data: srs } = await admin
      .from("learning_methods")
      .select("id")
      .eq("slug", "srs")
      .single();

    const result = await updateMethod(srs!.id, { name: "改名SRS" });
    expect(result.success).toBe(false);
  });
});

describe("deleteMethod", () => {
  it("deletes a custom method with no sessions", async () => {
    const created = await createMethod({ name: "削除用手法", category: "general" });
    if (!created.success) throw new Error("setup failed");

    const result = await deleteMethod(created.data.id);
    expect(result.success).toBe(true);
  });

  it("rejects deletion when sessions exist", async () => {
    // セッション作成後に手法削除を試みる
    const created = await createMethod({ name: "セッションあり", category: "general" });
    if (!created.success) throw new Error("setup failed");

    // セッションを作成 (tests/shared/helpers.ts のファクトリを使用)
    const admin = getAdminClient();
    await admin.from("sessions").insert({
      user_id: /* testUserId */,
      method_id: created.data.id,
      status: "completed",
    });

    const result = await deleteMethod(created.data.id);
    expect(result.success).toBe(false);
    expect(result.error).toContain("セッションが記録されている");
  });

  it("rejects deletion when method is sole method on a material", async () => {
    // 教材の唯一の手法を削除しようとするとエラー
    const created = await createMethod({ name: "唯一の手法", category: "general" });
    if (!created.success) throw new Error("setup failed");

    // 教材を作成し、この手法のみを紐付ける
    // ... setup via helpers

    const result = await deleteMethod(created.data.id);
    expect(result.success).toBe(false);
    expect(result.error).toContain("教材の唯一の手法");
  });
});
```

Note: Medium テストの正確な setup パターンは `tests/shared/helpers.ts` と既存の Medium テスト (`tests/medium/actions/`) を参照して合わせること。上記は検証すべき振る舞いの仕様。

- [ ] **Step 2: Run tests to verify they fail**

Run: `bun test:medium tests/medium/actions/method-commands.test.ts`
Expected: FAIL with "Cannot find module"

- [ ] **Step 3: Implement method CRUD actions**

```typescript
// src/lib/actions/method-commands.ts
"use server";

import { revalidatePath } from "next/cache";
import type { ActionResult } from "@/lib/validations/materials";
import { createMethodSchema, updateMethodSchema } from "@/lib/validations/methods";
import { extractFieldErrors } from "@/lib/validations/materials";
import { ACTION_ERRORS, PG_ERROR_CODES } from "@/lib/constants";
import { requireAuth } from "@/lib/actions/auth-utils";
import { generateMethodSlug } from "@/lib/utils/slug";
import type { Tables } from "@/lib/types/database";

type MethodRow = Tables<"learning_methods">;

export async function createMethod(
  input: unknown,
): Promise<ActionResult<MethodRow>> {
  const parsed = createMethodSchema.safeParse(input);
  if (!parsed.success) {
    return { success: false, error: ACTION_ERRORS.INVALID_INPUT, fieldErrors: extractFieldErrors(parsed.error) };
  }

  const { user, supabase } = await requireAuth();
  const slug = generateMethodSlug(user.id, parsed.data.name);

  const { data, error } = await supabase
    .from("learning_methods")
    .insert({
      slug,
      name: parsed.data.name,
      category: parsed.data.category,
      description: parsed.data.description ?? null,
      default_duration_sec: parsed.data.default_duration_sec ?? null,
      default_config: {},
      is_system: false,
      user_id: user.id,
    })
    .select()
    .single();

  if (error) {
    if (error.code === PG_ERROR_CODES.UNIQUE_VIOLATION) {
      return { success: false, error: "同じ名前の手法が既に存在します" };
    }
    return { success: false, error: ACTION_ERRORS.CREATE_FAILED("学習手法") };
  }

  revalidatePath("/materials");
  return { success: true, data };
}

export async function updateMethod(
  methodId: string,
  input: unknown,
): Promise<ActionResult<MethodRow>> {
  const parsed = updateMethodSchema.safeParse(input);
  if (!parsed.success) {
    return { success: false, error: ACTION_ERRORS.INVALID_INPUT, fieldErrors: extractFieldErrors(parsed.error) };
  }

  const { user, supabase } = await requireAuth();

  // RLS が is_system=false AND user_id=auth.uid() を強制するが、明示的にもチェック
  const updateData: Record<string, unknown> = {};
  if (parsed.data.name !== undefined) {
    updateData.name = parsed.data.name;
    updateData.slug = generateMethodSlug(user.id, parsed.data.name);
  }
  if (parsed.data.category !== undefined) updateData.category = parsed.data.category;
  if (parsed.data.description !== undefined) updateData.description = parsed.data.description;
  if ("default_duration_sec" in parsed.data) updateData.default_duration_sec = parsed.data.default_duration_sec ?? null;

  const { data, error } = await supabase
    .from("learning_methods")
    .update(updateData)
    .eq("id", methodId)
    .eq("is_system", false)
    .eq("user_id", user.id)
    .select()
    .single();

  if (error) {
    if (error.code === PG_ERROR_CODES.UNIQUE_VIOLATION) {
      return { success: false, error: "同じ名前の手法が既に存在します" };
    }
    return { success: false, error: ACTION_ERRORS.UPDATE_FAILED("学習手法") };
  }

  if (!data) {
    return { success: false, error: ACTION_ERRORS.NOT_FOUND("学習手法") };
  }

  revalidatePath("/materials");
  return { success: true, data };
}

export async function deleteMethod(
  methodId: string,
): Promise<ActionResult<undefined>> {
  const { user, supabase } = await requireAuth();

  // セッション履歴があるか確認
  const { count: sessionCount } = await supabase
    .from("sessions")
    .select("id", { count: "exact", head: true })
    .eq("method_id", methodId)
    .eq("user_id", user.id);

  if (sessionCount && sessionCount > 0) {
    return {
      success: false,
      error: "この手法にはセッションが記録されているため削除できません",
    };
  }

  // 教材の唯一の手法になっていないか確認
  // material_methods は CASCADE で消えるため、消すと教材が手法なしになる
  const { data: linkedMaterials } = await supabase
    .from("material_methods")
    .select("material_id")
    .eq("method_id", methodId);

  if (linkedMaterials && linkedMaterials.length > 0) {
    for (const link of linkedMaterials) {
      const { count: methodCount } = await supabase
        .from("material_methods")
        .select("id", { count: "exact", head: true })
        .eq("material_id", link.material_id);

      if (methodCount && methodCount <= 1) {
        return {
          success: false,
          error: "この手法は教材の唯一の手法であるため削除できません。先に教材から手法を外してください",
        };
      }
    }
  }

  // RLS が is_system=false AND user_id=auth.uid() を強制
  const { error } = await supabase
    .from("learning_methods")
    .delete()
    .eq("id", methodId)
    .eq("is_system", false)
    .eq("user_id", user.id);

  if (error) {
    return { success: false, error: ACTION_ERRORS.DELETE_FAILED("学習手法") };
  }

  revalidatePath("/materials");
  return { success: true, data: undefined };
}
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `bun test:medium tests/medium/actions/method-commands.test.ts`
Expected: All PASS

- [ ] **Step 5: Commit**

```bash
git add src/lib/actions/method-commands.ts tests/medium/actions/method-commands.test.ts
git commit -m "feat: ユーザー定義手法の CRUD Server Actions"
```

---

## Task 4: getMethods and Allowlist Changes

Update `getMethods()` to return user's custom methods. Update `addMaterialMethod` to allow custom methods.

**Files:**
- Modify: `src/lib/actions/material-methods.ts`
- Create: `tests/medium/actions/material-methods-custom.test.ts`

- [ ] **Step 1: Write Medium tests for allowlist changes**

```typescript
// tests/medium/actions/material-methods-custom.test.ts
import { describe, expect, it } from "vitest";
import { addMaterialMethod, getMethods } from "@/lib/actions/material-methods";
import { createMethod } from "@/lib/actions/method-commands";

describe("getMethods with custom methods", () => {
  it("returns system methods and user's own custom methods", async () => {
    await createMethod({ name: "テスト手法", category: "memory" });
    const methods = await getMethods();
    const systemMethods = methods.filter((m) => m.is_system);
    const customMethods = methods.filter((m) => !m.is_system);
    expect(systemMethods.length).toBeGreaterThan(0);
    expect(customMethods.length).toBeGreaterThan(0);
  });
});

describe("addMaterialMethod with custom methods", () => {
  it("allows attaching a custom method to a material", async () => {
    // setup: create material and custom method
    const method = await createMethod({ name: "紐付け用", category: "focus" });
    if (!method.success) throw new Error("setup failed");

    // materialId は既存の Medium テスト setup パターンで作成
    const result = await addMaterialMethod(/* materialId */, method.data.id);
    expect(result.success).toBe(true);
  });
});
```

Note: 正確な setup は既存の Medium テストパターンに合わせること。

- [ ] **Step 2: Run tests to verify they fail**

Run: `bun test:medium tests/medium/actions/material-methods-custom.test.ts`
Expected: FAIL

- [ ] **Step 3: Update getMethods to include user's custom methods**

`src/lib/actions/material-methods.ts` の `getMethods()` を変更:

```typescript
export async function getMethods(): Promise<LearningMethod[]> {
  // ユーザー定義手法はRLSで自動フィルタされるため、認証コンテキストが必要
  const { supabase } = await requireAuth();

  const { data } = await supabase
    .from("learning_methods")
    .select("*")
    .order("is_system", { ascending: false })
    .order("category", { ascending: true });

  return data ?? [];
}
```

- [ ] **Step 4: Update addMaterialMethod allowlist**

`src/lib/actions/material-methods.ts` の `addMaterialMethod()` のスラッグチェックを変更:

```typescript
// Before:
if (!(MATERIAL_METHOD_SLUGS as readonly string[]).includes(method.slug)) {
  return { success: false, error: "この学習手法は紐付けできません" };
}

// After: システム手法はスラッグ許可リスト、ユーザー定義手法はオーナーチェック
const { data: methodRow } = await supabase
  .from("learning_methods")
  .select("id, slug, is_system, user_id")
  .eq("id", methodId)
  .single();

if (!methodRow) return { success: false, error: ACTION_ERRORS.NOT_FOUND("学習手法") };

const isAllowedSystem = methodRow.is_system &&
  (MATERIAL_METHOD_SLUGS as readonly string[]).includes(methodRow.slug);
const isOwnCustom = !methodRow.is_system && methodRow.user_id === user.id;

if (!isAllowedSystem && !isOwnCustom) {
  return { success: false, error: "この学習手法は紐付けできません" };
}
```

- [ ] **Step 5: Run tests to verify they pass**

Run: `bun test:medium tests/medium/actions/material-methods-custom.test.ts`
Expected: All PASS

- [ ] **Step 6: Commit**

```bash
git add src/lib/actions/material-methods.ts tests/medium/actions/material-methods-custom.test.ts
git commit -m "feat: getMethods をユーザー定義手法に対応、allowlist を拡張"
```

---

## Task 5: Method Form Bottom Sheet Component

Create the CRUD UI for custom methods as a bottom sheet.

**Files:**
- Create: `src/components/method-form-sheet.tsx`

- [ ] **Step 1: Implement the method form bottom sheet**

```typescript
// src/components/method-form-sheet.tsx
"use client";

import { useState, useTransition } from "react";
import {
  Sheet,
  SheetContent,
  SheetHeader,
  SheetTitle,
} from "@/components/ui/sheet";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { METHOD_CATEGORIES, type MethodCategory } from "@/lib/constants";
import { createMethod, updateMethod, deleteMethod } from "@/lib/actions/method-commands";
import type { LearningMethod } from "@/lib/types/materials";

type Props = {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  method?: LearningMethod | null;
  onSuccess: (method: LearningMethod) => void;
};

const CATEGORIES = Object.entries(METHOD_CATEGORIES) as [MethodCategory, { label: string }][];

export function MethodFormSheet({ open, onOpenChange, method, onSuccess }: Props) {
  const isEdit = !!method;
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const [fieldErrors, setFieldErrors] = useState<Record<string, string[]>>({});

  const [name, setName] = useState(method?.name ?? "");
  const [category, setCategory] = useState<string>(method?.category ?? "general");
  const [description, setDescription] = useState(method?.description ?? "");
  const [durationMin, setDurationMin] = useState<string>(
    method?.default_duration_sec ? String(method.default_duration_sec / 60) : "",
  );

  function handleSubmit() {
    setError(null);
    setFieldErrors({});

    const durationSec = durationMin ? Number(durationMin) * 60 : null;
    const input = {
      name,
      category,
      description: description || undefined,
      default_duration_sec: durationSec,
    };

    startTransition(async () => {
      const result = isEdit
        ? await updateMethod(method!.id, input)
        : await createMethod(input);

      if (result.success) {
        onSuccess(result.data);
        onOpenChange(false);
      } else {
        setError(result.error);
        if ("fieldErrors" in result && result.fieldErrors) {
          setFieldErrors(result.fieldErrors);
        }
      }
    });
  }

  function handleDelete() {
    if (!method) return;
    startTransition(async () => {
      const result = await deleteMethod(method.id);
      if (result.success) {
        onOpenChange(false);
      } else {
        setError(result.error);
      }
    });
  }

  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent side="bottom" className="max-h-[85dvh] overflow-y-auto">
        <SheetHeader>
          <SheetTitle>{isEdit ? "手法を編集" : "新しい手法を作成"}</SheetTitle>
        </SheetHeader>

        <div className="mt-4 flex flex-col gap-4">
          <div>
            <Label htmlFor="method-name">名前 *</Label>
            <Input
              id="method-name"
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="例: ファインマンテクニック"
              maxLength={50}
            />
            {fieldErrors.name && (
              <p className="mt-1 text-xs text-destructive">{fieldErrors.name[0]}</p>
            )}
          </div>

          <div>
            <Label htmlFor="method-category">カテゴリ *</Label>
            <Select value={category} onValueChange={setCategory}>
              <SelectTrigger id="method-category">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {CATEGORIES.map(([key, { label }]) => (
                  <SelectItem key={key} value={key}>{label}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          <div>
            <Label htmlFor="method-description">説明</Label>
            <Textarea
              id="method-description"
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              placeholder="例: 学んだ内容を自分の言葉で説明する"
              maxLength={500}
              rows={3}
            />
          </div>

          <div>
            <Label htmlFor="method-duration">目標時間 (任意)</Label>
            <div className="flex items-center gap-2">
              <Input
                id="method-duration"
                type="number"
                value={durationMin}
                onChange={(e) => setDurationMin(e.target.value)}
                placeholder="25"
                min={1}
                max={180}
                className="w-24"
              />
              <span className="text-sm text-muted-foreground">分</span>
            </div>
            <p className="mt-1 text-xs text-muted-foreground">
              未入力の場合はストップウォッチ式になります
            </p>
          </div>

          {error && <p className="text-sm text-destructive">{error}</p>}

          <Button onClick={handleSubmit} disabled={pending}>
            {isEdit ? "更新" : "作成"}
          </Button>

          {isEdit && (
            <Button
              variant="outline"
              className="text-destructive border-destructive/30"
              onClick={handleDelete}
              disabled={pending}
            >
              この手法を削除
            </Button>
          )}
        </div>
      </SheetContent>
    </Sheet>
  );
}
```

- [ ] **Step 2: Commit**

```bash
git add src/components/method-form-sheet.tsx
git commit -m "feat: 手法作成/編集ボトムシートコンポーネント"
```

---

## Task 6: Extend MethodSelector

Add "create method" button and edit icons for custom methods.

**Files:**
- Modify: `src/components/method-selector.tsx`

- [ ] **Step 1: Update MethodSelector**

`src/components/method-selector.tsx` を全面的に書き換え:

```typescript
"use client";

import { useState, useCallback } from "react";
import { cn } from "@/lib/utils";
import {
  MATERIAL_METHOD_SLUGS,
  METHOD_CATEGORIES,
  METHOD_DESCRIPTIONS,
  getMethodColorClasses,
  type MethodCategory,
} from "@/lib/constants";
import { Checkbox } from "@/components/ui/checkbox";
import { Pencil, Plus } from "lucide-react";
import { MethodFormSheet } from "@/components/method-form-sheet";
import type { LearningMethod } from "@/lib/types/materials";

type Method = {
  id: string;
  slug: string;
  name: string;
  category: string;
  is_system: boolean;
  description?: string | null;
};

type MethodSelectorProps = {
  methods: Method[];
  selected: string[];
  onChange: (selected: string[]) => void;
  onMethodsChange?: () => void;
};

export function MethodSelector({ methods, selected, onChange, onMethodsChange }: MethodSelectorProps) {
  const [sheetOpen, setSheetOpen] = useState(false);
  const [editingMethod, setEditingMethod] = useState<LearningMethod | null>(null);

  // システム手法は MATERIAL_METHOD_SLUGS のみ。カスタム手法は全て表示
  const filteredMethods = methods.filter((m) =>
    m.is_system
      ? (MATERIAL_METHOD_SLUGS as readonly string[]).includes(m.slug)
      : true
  );

  function toggle(id: string) {
    if (selected.includes(id)) {
      onChange(selected.filter((s) => s !== id));
    } else {
      onChange([...selected, id]);
    }
  }

  const handleSuccess = useCallback(() => {
    onMethodsChange?.();
  }, [onMethodsChange]);

  return (
    <>
      <div className="flex flex-col gap-4">
        {(Object.entries(METHOD_CATEGORIES) as [MethodCategory, { label: string; slugs: readonly string[] }][]).map(
          ([category, { label, slugs }]) => {
            const categoryMethods = filteredMethods.filter(
              (m) => m.is_system ? slugs.includes(m.slug) : m.category === category,
            );
            if (categoryMethods.length === 0) return null;

            return (
              <div key={category} className="flex flex-col gap-2">
                <p className="text-xs font-medium text-muted-foreground">{label}</p>
                <div className="flex flex-col gap-1.5">
                  {categoryMethods.map((method) => {
                    const isSelected = selected.includes(method.id);
                    const colors = getMethodColorClasses(method.category);
                    const desc = METHOD_DESCRIPTIONS[method.slug] ?? method.description;

                    return (
                      <label
                        key={method.id}
                        htmlFor={`method-${method.id}`}
                        className={cn(
                          "flex cursor-pointer items-start gap-3 rounded-lg border p-3 transition-colors",
                          isSelected
                            ? `border-current ${colors.light} ${colors.dark}`
                            : "border-border hover:bg-muted/50"
                        )}
                      >
                        <Checkbox
                          id={`method-${method.id}`}
                          checked={isSelected}
                          onCheckedChange={() => toggle(method.id)}
                        />
                        <div className="flex flex-1 flex-col gap-0.5">
                          <span className="text-sm font-medium">{method.name}</span>
                          {desc && (
                            <span className="text-xs text-muted-foreground">{desc}</span>
                          )}
                        </div>
                        {!method.is_system && (
                          <button
                            type="button"
                            onClick={(e) => {
                              e.preventDefault();
                              setEditingMethod(method as LearningMethod);
                              setSheetOpen(true);
                            }}
                            className="shrink-0 p-1 text-muted-foreground hover:text-foreground"
                            aria-label={`${method.name}を編集`}
                          >
                            <Pencil className="h-3.5 w-3.5" />
                          </button>
                        )}
                      </label>
                    );
                  })}
                </div>
              </div>
            );
          }
        )}

        <button
          type="button"
          onClick={() => {
            setEditingMethod(null);
            setSheetOpen(true);
          }}
          className="flex w-full items-center justify-center gap-1.5 rounded-lg border border-dashed border-muted-foreground/30 p-3 text-sm text-muted-foreground hover:bg-muted/50"
        >
          <Plus className="h-4 w-4" />
          手法を作成
        </button>
      </div>

      <MethodFormSheet
        open={sheetOpen}
        onOpenChange={setSheetOpen}
        method={editingMethod}
        onSuccess={handleSuccess}
      />
    </>
  );
}
```

- [ ] **Step 2: Update MethodSelector usage in material creation page**

`src/app/(main)/materials/new/page.tsx` で `MethodSelector` に渡す `methods` prop と `onMethodsChange` コールバックを確認・調整する。`getMethods()` の再取得が必要な場合は `useRouter().refresh()` を呼ぶ。

- [ ] **Step 3: Commit**

```bash
git add src/components/method-selector.tsx
git commit -m "feat: MethodSelector にカスタム手法の作成/編集 UI を追加"
```

---

## Task 7: Custom Timer Hook

Create a timer hook that supports both countdown and stopwatch modes.

**Files:**
- Create: `src/app/session/[id]/use-custom-timer.ts`
- Create: `tests/small/hooks/use-custom-timer.test.ts`

- [ ] **Step 1: Write tests for custom timer hook**

```typescript
// tests/small/hooks/use-custom-timer.test.ts
import { describe, expect, it, vi, beforeEach, afterEach } from "vitest";
import { renderHook, act } from "@testing-library/react";
import { useCustomTimer } from "@/app/session/[id]/use-custom-timer";

describe("useCustomTimer", () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });
  afterEach(() => {
    vi.useRealTimers();
  });

  describe("countdown mode", () => {
    it("counts down from target duration", () => {
      const { result } = renderHook(() => useCustomTimer(300));
      act(() => result.current.start());
      act(() => vi.advanceTimersByTime(1000));
      expect(result.current.elapsedSeconds).toBe(1);
      expect(result.current.remainingSeconds).toBe(299);
    });

    it("marks as target reached when countdown completes", () => {
      const { result } = renderHook(() => useCustomTimer(2));
      act(() => result.current.start());
      act(() => vi.advanceTimersByTime(2000));
      expect(result.current.isTargetReached).toBe(true);
    });
  });

  describe("stopwatch mode", () => {
    it("counts up from zero when no target", () => {
      const { result } = renderHook(() => useCustomTimer(null));
      act(() => result.current.start());
      act(() => vi.advanceTimersByTime(5000));
      expect(result.current.elapsedSeconds).toBe(5);
      expect(result.current.remainingSeconds).toBeNull();
    });
  });

  it("supports pause and resume", () => {
    const { result } = renderHook(() => useCustomTimer(null));
    act(() => result.current.start());
    act(() => vi.advanceTimersByTime(3000));
    act(() => result.current.pause());
    act(() => vi.advanceTimersByTime(5000));
    expect(result.current.elapsedSeconds).toBe(3);
    act(() => result.current.start());
    act(() => vi.advanceTimersByTime(2000));
    expect(result.current.elapsedSeconds).toBe(5);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `bun test:small tests/small/hooks/use-custom-timer.test.ts`
Expected: FAIL with "Cannot find module"

- [ ] **Step 3: Implement custom timer hook**

```typescript
// src/app/session/[id]/use-custom-timer.ts
"use client";

import { useState, useEffect, useRef, useCallback } from "react";

export type CustomTimerState = {
  elapsedSeconds: number;
  remainingSeconds: number | null;
  isRunning: boolean;
  isTargetReached: boolean;
  start: () => void;
  pause: () => void;
};

export function useCustomTimer(targetDurationSec: number | null): CustomTimerState {
  const [elapsedSeconds, setElapsedSeconds] = useState(0);
  const [isRunning, setIsRunning] = useState(false);
  const intervalRef = useRef<ReturnType<typeof setInterval> | null>(null);

  const isTargetReached = targetDurationSec !== null && elapsedSeconds >= targetDurationSec;
  const remainingSeconds = targetDurationSec !== null
    ? Math.max(0, targetDurationSec - elapsedSeconds)
    : null;

  useEffect(() => {
    if (!isRunning) return;

    intervalRef.current = setInterval(() => {
      setElapsedSeconds((prev) => prev + 1);
    }, 1000);

    return () => {
      if (intervalRef.current) clearInterval(intervalRef.current);
    };
  }, [isRunning]);

  const start = useCallback(() => setIsRunning(true), []);
  const pause = useCallback(() => setIsRunning(false), []);

  return {
    elapsedSeconds,
    remainingSeconds,
    isRunning,
    isTargetReached,
    start,
    pause,
  };
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `bun test:small tests/small/hooks/use-custom-timer.test.ts`
Expected: All PASS

- [ ] **Step 5: Commit**

```bash
git add src/app/session/[id]/use-custom-timer.ts tests/small/hooks/use-custom-timer.test.ts
git commit -m "feat: カスタム手法用タイマーフック (カウントダウン/ストップウォッチ)"
```

---

## Task 8: Custom Session Completion Action

Add `completeCustomSession` server action following the Pomodoro completion pattern.

**Files:**
- Create: `src/lib/validations/custom-session.ts`
- Modify: `src/lib/actions/session-commands.ts`
- Create: `tests/medium/actions/custom-session.test.ts`

- [ ] **Step 1: Write validation schema tests**

Add to existing Small tests or create inline validation test. The schema is simple enough to test through the Medium tests.

- [ ] **Step 2: Create validation schema**

```typescript
// src/lib/validations/custom-session.ts
import { z } from "zod";

export const completeCustomSessionSchema = z.object({
  sessionId: z.uuid("無効なセッションIDです"),
  selfRating: z.number().int().min(1, "評価は1以上です").max(4, "評価は4以下です"),
  elapsedSec: z.number().int().min(0),
  targetDurationSec: z.number().int().min(0).nullable(),
});

export type CompleteCustomSessionInput = z.infer<typeof completeCustomSessionSchema>;
```

- [ ] **Step 3: Write Medium tests for custom session completion**

```typescript
// tests/medium/actions/custom-session.test.ts
import { describe, expect, it } from "vitest";
import { completeCustomSession } from "@/lib/actions/session-commands";
import { createSession } from "@/lib/actions/session-commands";
import { createMethod } from "@/lib/actions/method-commands";

describe("completeCustomSession", () => {
  it("completes a custom method session with self-rating", async () => {
    const method = await createMethod({ name: "完了テスト", category: "memory" });
    if (!method.success) throw new Error("setup failed");

    // materialId は Medium テスト setup で作成済みのものを使用
    const session = await createSession(/* materialId */, method.data.id);
    if (!session.success) throw new Error("setup failed");

    const result = await completeCustomSession(
      session.data.id,
      3,
      900,
      1500,
    );
    expect(result.success).toBe(true);
  });

  it("rejects completion of already completed session", async () => {
    // 2回目の完了呼び出しはエラー
    // ... setup omitted, pattern follows completePomodoroSession tests
  });

  it("records daily_log entry", async () => {
    // 完了後に daily_logs にレコードがあることを確認
    // ... setup omitted
  });
});
```

- [ ] **Step 4: Run tests to verify they fail**

Run: `bun test:medium tests/medium/actions/custom-session.test.ts`
Expected: FAIL

- [ ] **Step 5: Implement completeCustomSession**

`src/lib/actions/session-commands.ts` に追加:

```typescript
import { completeCustomSessionSchema } from "@/lib/validations/custom-session";

export async function completeCustomSession(
  sessionId: string,
  selfRating: number,
  elapsedSec: number,
  targetDurationSec: number | null,
): Promise<ActionResult<undefined>> {
  const parsed = completeCustomSessionSchema.safeParse({
    sessionId,
    selfRating,
    elapsedSec,
    targetDurationSec,
  });
  if (!parsed.success) {
    return { success: false, error: ACTION_ERRORS.INVALID_INPUT };
  }

  const { user, supabase } = await requireAuth();

  const { data: session } = await supabase
    .from("sessions")
    .select("id, started_at, status, material_id, method_id")
    .eq("id", parsed.data.sessionId)
    .eq("user_id", user.id)
    .single();

  if (!session) return { success: false, error: ACTION_ERRORS.NOT_FOUND("セッション") };

  if (session.status !== "in_progress") {
    return { success: false, error: ACTION_ERRORS.SESSION_ALREADY_COMPLETED };
  }

  const now = new Date();
  const durationSec = Math.floor(
    (now.getTime() - new Date(session.started_at).getTime()) / 1000,
  );

  const { error: updateError } = await supabase
    .from("sessions")
    .update({
      status: "completed",
      duration_sec: durationSec,
      self_rating: parsed.data.selfRating,
      ended_at: now.toISOString(),
      meta: {
        actual_duration_sec: parsed.data.elapsedSec,
        target_duration_sec: parsed.data.targetDurationSec,
      },
    })
    .eq("id", parsed.data.sessionId);

  if (updateError) {
    return { success: false, error: ACTION_ERRORS.UPDATE_FAILED("セッション") };
  }

  if (session.material_id) {
    const { data: material } = await supabase
      .from("materials")
      .select("subject_id")
      .eq("id", session.material_id)
      .single();

    if (material) {
      const logDate = toJstDateString(new Date());
      await supabase.rpc("upsert_daily_log", {
        p_user_id: user.id,
        p_subject_id: material.subject_id,
        p_method_id: session.method_id,
        p_log_date: logDate,
        p_duration_sec: durationSec,
        p_cards_reviewed: 0,
      });
    }
  }

  revalidatePath("/");
  return { success: true, data: undefined };
}
```

- [ ] **Step 6: Run tests to verify they pass**

Run: `bun test:medium tests/medium/actions/custom-session.test.ts`
Expected: All PASS

- [ ] **Step 7: Commit**

```bash
git add src/lib/validations/custom-session.ts src/lib/actions/session-commands.ts \
  tests/medium/actions/custom-session.test.ts
git commit -m "feat: カスタム手法セッション完了 Server Action"
```

---

## Task 9: CustomMethodPlayer Component

Create the session player for custom methods with timer + self-rating.

**Files:**
- Create: `src/app/session/[id]/custom-method-player.tsx`

- [ ] **Step 1: Implement CustomMethodPlayer**

```typescript
// src/app/session/[id]/custom-method-player.tsx
"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { useCustomTimer } from "./use-custom-timer";
import { completeCustomSession } from "@/lib/actions/session-commands";
import { SELF_RATING_LABELS } from "@/lib/constants";
import { formatDuration } from "@/lib/session-utils";

const RATINGS = [1, 2, 3, 4] as const;

type Props = {
  sessionId: string;
  methodName: string;
  materialTitle: string | null;
  targetDurationSec: number | null;
};

type Phase = "timer" | "rating";

export function CustomMethodPlayer({ sessionId, methodName, materialTitle, targetDurationSec }: Props) {
  const router = useRouter();
  const timer = useCustomTimer(targetDurationSec);
  const [phase, setPhase] = useState<Phase>("timer");
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  // 自動開始
  useState(() => {
    timer.start();
  });

  const radius = 80;
  const circumference = 2 * Math.PI * radius;
  const progress = targetDurationSec
    ? Math.min(timer.elapsedSeconds / targetDurationSec, 1)
    : 0;
  const strokeDashoffset = circumference * (1 - progress);

  function handleFinish() {
    timer.pause();
    setPhase("rating");
  }

  async function handleComplete(selfRating: 1 | 2 | 3 | 4) {
    setSubmitting(true);
    const result = await completeCustomSession(
      sessionId,
      selfRating,
      timer.elapsedSeconds,
      targetDurationSec,
    );
    if (result.success) {
      router.push(`/session/${sessionId}/summary`);
    } else {
      setError(result.error);
      setSubmitting(false);
    }
  }

  const displayTime = targetDurationSec !== null
    ? formatDuration(timer.remainingSeconds ?? 0)
    : formatDuration(timer.elapsedSeconds);

  return (
    <div className="mx-auto flex min-h-dvh max-w-md flex-col items-center justify-center p-4">
      {phase === "timer" && (
        <>
          <p className="mb-1 text-sm font-medium text-muted-foreground">{methodName}</p>
          {materialTitle && (
            <p className="mb-4 text-xs text-muted-foreground">{materialTitle}</p>
          )}

          {targetDurationSec !== null && (
            <svg width="200" height="200" className="-rotate-90">
              <circle cx="100" cy="100" r={radius} fill="none" stroke="currentColor" strokeWidth="8" className="text-muted" />
              <circle cx="100" cy="100" r={radius} fill="none" stroke="currentColor" strokeWidth="8"
                strokeDasharray={circumference} strokeDashoffset={strokeDashoffset} strokeLinecap="round"
                className="text-primary transition-all duration-1000" />
            </svg>
          )}

          <p className="mt-4 text-3xl font-bold tabular-nums">{displayTime}</p>

          {timer.isTargetReached && (
            <p className="mt-2 text-sm font-medium text-green-600 dark:text-green-400">
              目標時間に達しました
            </p>
          )}

          <div className="mt-6 flex gap-3">
            {timer.isRunning ? (
              <button type="button" onClick={timer.pause}
                className="rounded-lg bg-muted px-6 py-3 font-medium hover:bg-muted/80">
                一時停止
              </button>
            ) : (
              <button type="button" onClick={timer.start}
                className="rounded-lg bg-muted px-6 py-3 font-medium hover:bg-muted/80">
                再開
              </button>
            )}
            <button type="button" onClick={handleFinish}
              className="rounded-lg bg-primary px-6 py-3 font-medium text-primary-foreground">
              完了
            </button>
          </div>
        </>
      )}

      {phase === "rating" && (
        <div className="text-center space-y-4">
          <h1 className="text-xl font-semibold">学習の振り返り</h1>
          <p className="text-sm text-muted-foreground">
            {formatDuration(timer.elapsedSeconds)} / {methodName}
          </p>
          <p className="text-sm font-medium">今回の学習はどうでしたか?</p>
          <div className="grid grid-cols-2 gap-2">
            {RATINGS.map((r) => (
              <button key={r} type="button" onClick={() => void handleComplete(r)} disabled={submitting}
                className="rounded-lg border px-4 py-3 text-sm font-medium hover:bg-muted disabled:opacity-50">
                {r}. {SELF_RATING_LABELS[r]}
              </button>
            ))}
          </div>
          {error && <p className="text-sm text-destructive">{error}</p>}
        </div>
      )}
    </div>
  );
}
```

- [ ] **Step 2: Commit**

```bash
git add src/app/session/[id]/custom-method-player.tsx
git commit -m "feat: CustomMethodPlayer コンポーネント (タイマー + 自己評価)"
```

---

## Task 10: Session Page Routing and Summary

Update session page to route custom methods to `CustomMethodPlayer`. Update summary to handle custom method sessions.

**Files:**
- Modify: `src/app/session/[id]/page.tsx`
- Modify: `src/lib/actions/session-queries.ts` (getSessionInfo に手法詳細を追加)
- Modify: `src/app/session/[id]/summary/page.tsx`

- [ ] **Step 1: Extend getSessionInfo to return method details**

`src/lib/actions/session-queries.ts` の `getSessionInfo` を拡張:

```typescript
export type SessionInfo = {
  id: string;
  methodSlug: string;
  materialId: string | null;
  methodName: string;
  materialTitle: string | null;
  defaultDurationSec: number | null;
};
```

SELECT クエリを更新:

```typescript
.select("id, material_id, learning_methods(slug, name, default_duration_sec), materials(title)")
```

返り値を拡張:

```typescript
return {
  id: session.id,
  methodSlug: method.slug,
  materialId: session.material_id,
  methodName: method.name,
  materialTitle: (session.materials as JoinedMaterialTitle | null)?.title ?? null,
  defaultDurationSec: method.default_duration_sec ?? null,
};
```

- [ ] **Step 2: Update session page routing**

`src/app/session/[id]/page.tsx` の switch に default ケースを追加:

```typescript
import { CustomMethodPlayer } from "./custom-method-player";

// ... existing cases ...

default:
  return (
    <CustomMethodPlayer
      sessionId={id}
      methodName={info.methodName}
      materialTitle={info.materialTitle}
      targetDurationSec={info.defaultDurationSec}
    />
  );
```

既存の `default: notFound()` を上記に置き換える。

- [ ] **Step 3: Update summary page to handle custom method sessions**

`src/app/session/[id]/summary/page.tsx` の Pomodoro 分岐の後に custom method 分岐を追加:

```typescript
const isCustomMethod = !["srs", "interleaving", "elaboration", "pomodoro", "wakeful_rest", "free_study"].includes(session.method.slug);
const customMeta = isCustomMethod
  ? (session.meta as { actual_duration_sec?: number; target_duration_sec?: number | null } | null)
  : null;
```

表示部分:

```typescript
{isCustomMethod ? (
  <div className="grid grid-cols-2 gap-4 text-center">
    <div>
      <p className="text-2xl font-bold">
        {formatDuration(customMeta?.actual_duration_sec ?? session.duration_sec)}
      </p>
      <p className="text-sm text-muted-foreground">学習時間</p>
    </div>
    {customMeta?.target_duration_sec && (
      <div>
        <p className="text-2xl font-bold">
          {formatDuration(customMeta.target_duration_sec)}
        </p>
        <p className="text-sm text-muted-foreground">目標時間</p>
      </div>
    )}
  </div>
) : isPomodoro ? (
  // ... existing pomodoro summary
```

- [ ] **Step 4: Commit**

```bash
git add src/app/session/[id]/page.tsx src/lib/actions/session-queries.ts \
  src/app/session/[id]/summary/page.tsx
git commit -m "feat: セッションルーティングとサマリーをカスタム手法に対応"
```

---

## Task 11: Integration Testing (E2E)

Write an E2E test covering the full flow: create method -> attach to material -> run session -> verify summary.

**Files:**
- Create: `tests/large/custom-method.spec.ts`

- [ ] **Step 1: Write E2E test**

```typescript
// tests/large/custom-method.spec.ts
import { test, expect } from "@playwright/test";

test.describe("User-Defined Methods", () => {
  test("create custom method, attach to material, run session", async ({ page }) => {
    // 1. Login (既存の E2E auth helper を使用)
    await page.goto("/");
    // ... login flow

    // 2. Navigate to material creation
    await page.goto("/materials/new");
    await page.waitForLoadState("networkidle");

    // 3. Fill material form (step 1)
    // ... title, subject selection

    // 4. Click "+ 手法を作成" button
    await page.getByRole("button", { name: "手法を作成" }).click();

    // 5. Fill method form in bottom sheet
    await page.getByLabel("名前").fill("テスト手法");
    await page.getByLabel("カテゴリ").click();
    await page.getByRole("option", { name: "集中" }).click();
    await page.getByLabel("目標時間").fill("1");
    await page.getByRole("button", { name: "作成" }).click();

    // 6. Verify custom method appears in selector
    await expect(page.getByText("テスト手法")).toBeVisible();

    // 7. Select the custom method
    await page.getByText("テスト手法").click();

    // 8. Submit material creation
    // ... complete form submission

    // 9. Start session with custom method
    await page.getByTestId("start-session-button").click();

    // 10. Verify timer is shown
    await expect(page.getByText("テスト手法")).toBeVisible();

    // 11. Click "完了" to finish
    await page.getByRole("button", { name: "完了" }).click();

    // 12. Select self-rating
    await page.getByRole("button", { name: /3\. おおむね/ }).click();

    // 13. Verify summary page
    await expect(page.getByText("セッション完了")).toBeVisible();
  });
});
```

Note: 正確なセレクタとフローは既存の E2E テスト (`tests/large/`) のパターンに合わせること。`data-testid` を使用し、CSS クラスセレクタは使わない。

- [ ] **Step 2: Run E2E test**

Run: `bun test:large tests/large/custom-method.spec.ts`
Expected: PASS

- [ ] **Step 3: Commit**

```bash
git add tests/large/custom-method.spec.ts
git commit -m "test: ユーザー定義手法の E2E テスト"
```

---

## Task 12: Documentation and Cleanup

Update CLAUDE.md and related docs. Run full test suite.

**Files:**
- Modify: `CLAUDE.md` (if method classification or data model sections need update)

- [ ] **Step 1: Update CLAUDE.md Method Classification**

Add to the Method Classification section:

```markdown
- **Custom (User-Defined)**: use `sessions.meta` JSONB for `{ actual_duration_sec, target_duration_sec }`. Timer-based with self-rating (1-4).
```

- [ ] **Step 2: Run full test suite**

Run: `bun lint && bun typecheck && bun test:small && bun test:medium`
Expected: All PASS

- [ ] **Step 3: Commit**

```bash
git add CLAUDE.md
git commit -m "docs: CLAUDE.md にユーザー定義手法の分類を追記"
```

- [ ] **Step 4: Run pre-push checks**

Run: `bun lint && bun typecheck && bun test:small && bun test:medium`
Expected: All PASS, ready for PR
