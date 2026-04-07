# Session Actions リファクタリング実装計画

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** `sessions.ts` (708行) を queries/commands に分割し、`requireAuth()` で認証チェックの型安全性を向上させる

**Architecture:** `auth-utils.ts` に `requireAuth()` を追加し、未認証時は `redirect("/auth/login")` で型レベルで `User` を保証する。`sessions.ts` は `session-queries.ts` と `session-commands.ts` に分割し、`sessions.ts` を re-export バレルとして残すことで既存インポートを破壊しない。

**Tech Stack:** Next.js 16 (App Router), TypeScript, Supabase, Vitest

---

## File Structure

| ファイル | 操作 | 責務 |
|---------|------|------|
| `src/lib/actions/auth-utils.ts` | Modify | `requireAuth()` 追加、`AuthenticatedContext` 型エクスポート |
| `src/lib/actions/session-queries.ts` | Create | 読み取り系: getSessionInfo, getDueMaterials, getSessionCards, getSession, getInterleavingCards |
| `src/lib/actions/session-commands.ts` | Create | 書き込み系: createSession, completeSession, createRestSession, completeElaborationSession, completePomodoroSession, completeRestSession, createInterleavingSession |
| `src/lib/actions/sessions.ts` | Modify | re-export バレルに変換 (既存インポート互換) |
| `tests/small/lib/actions/auth-utils.test.ts` | Create | requireAuth のテスト |
| `tests/small/lib/actions/sessions.test.ts` | Modify | インポートパスを session-queries に変更 |
| `tests/small/lib/actions/sessions-error-handling.test.ts` | Modify | インポートパスを session-commands に変更 |

## 設計判断

### `requireAuth()` の認証失敗時の振る舞い

`redirect("/auth/login")` を使用する。理由:

1. Next.js の `redirect()` は内部的に例外を throw するため、戻り値の型が `never` になる。これにより `requireAuth()` の戻り値は常に `{ user: User; supabase: ... }` (null 不可) となる
2. Server Actions 内での `redirect()` は Next.js が適切にハンドルし、クライアント側でナビゲーションが発生する
3. 未認証ユーザーに対して `ACTION_ERRORS.UNAUTHENTICATED` エラーを返すより、ログインページへリダイレクトする方が UX として正しい
4. 既存コードで `materials.ts`, `subjects.ts`, `stats.ts` が既にこのパターンを採用しており、統一される

### re-export バレルの採用

`sessions.ts` を re-export バレルとして残す。理由:

1. 10 ファイルからインポートされており、全変更は不要なリスクを増やす
2. `"use server"` は re-export ファイルにも必要だが、Next.js はこれを正しくハンドルする
3. 将来的にインポートパスを個別ファイルに移行する場合も段階的に行える

### `getAuthenticatedUser()` の廃止タイミング

今回は `requireAuth()` を追加し、`sessions.ts` 内の関数を移行する。他のファイル (`materials.ts`, `cards.ts` 等) は今回のスコープ外。`getAuthenticatedUser()` は deprecated コメントを付けて残し、全ファイル移行後に削除する。

---

### Task 1: `requireAuth()` の追加

**Files:**
- Modify: `src/lib/actions/auth-utils.ts`
- Create: `tests/small/lib/actions/auth-utils.test.ts`

- [ ] **Step 1: `requireAuth` のテストを書く**

`tests/small/lib/actions/auth-utils.test.ts`:

```typescript
import { describe, it, expect, vi, beforeEach } from "vitest";

// redirect は内部的に throw するため、モックでも throw させる
const redirectMock = vi.fn().mockImplementation(() => {
  throw new Error("NEXT_REDIRECT");
});
vi.mock("next/navigation", () => ({
  redirect: redirectMock,
}));

const mockGetUser = vi.fn();
vi.mock("@/lib/supabase/server", () => ({
  createClient: vi.fn(() =>
    Promise.resolve({
      auth: { getUser: mockGetUser },
    }),
  ),
}));

import { requireAuth } from "@/lib/actions/auth-utils";

describe("requireAuth", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("returns user and supabase when authenticated", async () => {
    const fakeUser = { id: "user-1", email: "test@example.com" };
    mockGetUser.mockResolvedValue({ data: { user: fakeUser } });

    const result = await requireAuth();

    expect(result.user).toEqual(fakeUser);
    expect(result.supabase).toBeDefined();
  });

  it("redirects to login when not authenticated", async () => {
    mockGetUser.mockResolvedValue({ data: { user: null } });

    await expect(requireAuth()).rejects.toThrow("NEXT_REDIRECT");
    expect(redirectMock).toHaveBeenCalledWith("/auth/login");
  });
});
```

- [ ] **Step 2: テストが失敗することを確認**

Run: `bun test:small tests/small/lib/actions/auth-utils.test.ts`
Expected: FAIL (`requireAuth` is not exported)

- [ ] **Step 3: `requireAuth()` を実装**

`src/lib/actions/auth-utils.ts` を以下に変更:

```typescript
import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import type { User } from "@supabase/supabase-js";

type SupabaseClient = Awaited<ReturnType<typeof createClient>>;

export type AuthenticatedContext = {
  user: User;
  supabase: SupabaseClient;
};

// 未認証時は /auth/login にリダイレクトし、戻り値で user: User を保証する
export async function requireAuth(): Promise<AuthenticatedContext> {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/auth/login");
  return { user, supabase };
}

// @deprecated requireAuth() を使用すること。全ファイル移行後に削除する
type AuthResult = {
  user: User | null;
  supabase: SupabaseClient;
};

export async function getAuthenticatedUser(): Promise<AuthResult> {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  return { user, supabase };
}
```

- [ ] **Step 4: テストが通ることを確認**

Run: `bun test:small tests/small/lib/actions/auth-utils.test.ts`
Expected: PASS (2 tests)

- [ ] **Step 5: コミット**

```bash
git add src/lib/actions/auth-utils.ts tests/small/lib/actions/auth-utils.test.ts
git commit -m "feat: requireAuth() で認証チェックの型安全性を向上"
```

---

### Task 2: `session-queries.ts` の作成

**Files:**
- Create: `src/lib/actions/session-queries.ts`
- Modify: `tests/small/lib/actions/sessions.test.ts`

- [ ] **Step 1: `session-queries.ts` を作成**

`sessions.ts` から以下を移動:
- 型定義: `DueMaterialRow`, `InterleavingCardRow`, `JoinedMethod`, `JoinedMethodWithName`, `JoinedMaterial`, `JoinedMaterialTitle`, `SessionInfo`
- 関数: `getSessionInfo`, `getDueMaterials`, `getSessionCards`, `getSession`, `getInterleavingCards`

`src/lib/actions/session-queries.ts`:

```typescript
"use server";

import { requireAuth } from "@/lib/actions/auth-utils";
import type { DueMaterial, SessionCard, InterleavingCard, SessionDetail } from "@/lib/types/sessions";
import { SESSION_MAX_CARDS } from "@/lib/constants";
import { toJstDateString } from "@/lib/utils/date";

// RPC 戻り値の行型: database.ts の自動生成型と同期する。IDE の型推論補助のため明示的に定義する
type DueMaterialRow = {
  due_count: number;
  material_id: string;
  method_id: string;
  method_name: string;
  method_slug: string;
  subject_color: string;
  subject_id: string;
  subject_name: string;
  title: string;
};
type InterleavingCardRow = {
  back: string;
  card_id: string;
  display_order: number;
  front: string;
  material_title: string;
};

// Supabase JOIN 結果の型: SDK は joined テーブルを unknown として推論するため名前付き型で上書きする
type JoinedMethod = { slug: string };
type JoinedMethodWithName = { slug: string; name: string };
type JoinedMaterial = { id: string; title: string; subjects: { name: string } };
type JoinedMaterialTitle = { title: string };

export type SessionInfo = {
  id: string;
  methodSlug: string;
  materialId: string | null;
};

export async function getSessionInfo(sessionId: string): Promise<SessionInfo | null> {
  const { user, supabase } = await requireAuth();

  const { data: session } = await supabase
    .from("sessions")
    .select("id, material_id, learning_methods(slug)")
    .eq("id", sessionId)
    .eq("user_id", user.id)
    .eq("status", "in_progress")
    .single();

  if (!session) return null;

  const method = session.learning_methods as JoinedMethod | null;

  // method が null になるのは learning_methods が削除された孤立データのみ
  // notFound() でハンドルするため、呼び出し元に null を返す
  if (!method?.slug) return null;

  return {
    id: session.id,
    methodSlug: method.slug,
    materialId: session.material_id,
  };
}

export async function getDueMaterials(): Promise<DueMaterial[]> {
  const { user, supabase } = await requireAuth();

  // N+1 回避: materials→cards→srs_states の3クエリを RPC で1クエリに集約
  const today = toJstDateString(new Date());
  const { data: rows, error } = await supabase.rpc("get_due_materials", {
    p_user_id: user.id,
    p_today: today,
  });

  if (error) {
    console.error("getDueMaterials RPC failed:", error.message);
    return [];
  }

  if (!rows || rows.length === 0) return [];

  return rows.map((row: DueMaterialRow) => ({
    id: row.material_id,
    title: row.title,
    subject: {
      id: row.subject_id,
      name: row.subject_name,
      color: row.subject_color,
    },
    srs_method_id: row.method_id,
    due_count: Number(row.due_count),
  }));
}

export async function getSessionCards(sessionId: string, methodSlug?: string): Promise<SessionCard[]> {
  const { user, supabase } = await requireAuth();

  // RLS に加えてアプリ層でも所有者を確認し、RLS 緩和時の誤操作を防ぐ
  const { data: session } = await supabase
    .from("sessions")
    .select("material_id")
    .eq("id", sessionId)
    .eq("user_id", user.id)
    .single();

  if (!session?.material_id) return [];

  const today = toJstDateString(new Date());

  const { data: allCards } = await supabase
    .from("cards")
    .select("id, front, back, display_order")
    .eq("material_id", session.material_id)
    .order("display_order");

  if (!allCards || allCards.length === 0) return [];

  // Elaboration は SRS スケジュールに依存しないため、全カードを対象にする
  if (methodSlug && methodSlug !== "srs") {
    return allCards.slice(0, SESSION_MAX_CARDS);
  }

  // SRS: 復習予定がまだ先のカードはセッション対象外にする
  const cardIds = allCards.map((c) => c.id);
  const { data: notDueStates } = await supabase
    .from("srs_states")
    .select("card_id")
    .eq("user_id", user.id)
    .gt("due_date", today)
    .in("card_id", cardIds);

  const notDueCardIds = new Set((notDueStates ?? []).map((s) => s.card_id));

  return allCards
    .filter((c) => !notDueCardIds.has(c.id))
    .slice(0, SESSION_MAX_CARDS);
}

export async function getSession(sessionId: string): Promise<SessionDetail | null> {
  const { user, supabase } = await requireAuth();

  const { data: session } = await supabase
    .from("sessions")
    .select(`
      id, method_id, status, duration_sec, self_rating, started_at, ended_at, meta,
      materials(id, title, subjects(name)),
      learning_methods(slug, name)
    `)
    .eq("id", sessionId)
    .eq("user_id", user.id)
    .single();

  if (!session) return null;

  // 上の session クエリで所有権を検証済みだが、TOCTOU の多重防御として card_reviews 側でも検証する
  const { data: reviews } = await supabase
    .from("card_reviews")
    .select("card_id, rating, response_ms, cards(front, back), sessions!inner(user_id)")
    .eq("session_id", sessionId)
    .eq("sessions.user_id", user.id);

  // サマリー画面で「続けて学習」の判断材料を表示するため、残りの due 数を算出する
  let remainingDueCount = 0;
  const mat = session.materials as JoinedMaterial | null;

  // Interleaving セッションは material_id=NULL のため、session_materials から教材一覧を取得
  let interleavingMaterials: Array<{ id: string; title: string }> | null = null;
  if (!mat) {
    const { data: smRows } = await supabase
      .from("session_materials")
      .select("material_id, materials(title)")
      .eq("session_id", sessionId);

    if (smRows && smRows.length > 0) {
      interleavingMaterials = smRows.map((sm) => ({
        id: sm.material_id,
        title: (sm.materials as JoinedMaterialTitle | null)?.title ?? "",
      }));
    }
  }

  if (mat) {
    const today = toJstDateString(new Date());

    const { data: allCards } = await supabase
      .from("cards")
      .select("id")
      .eq("material_id", mat.id);

    if (allCards && allCards.length > 0) {
      const cardIds = allCards.map((c: { id: string }) => c.id);
      const { data: notDueStates } = await supabase
        .from("srs_states")
        .select("card_id")
        .eq("user_id", user.id)
        .gt("due_date", today)
        .in("card_id", cardIds);

      const notDueCardIds = new Set(
        (notDueStates ?? []).map((s: { card_id: string }) => s.card_id),
      );
      const reviewedCardIds = new Set(
        (reviews ?? []).map((r: { card_id: string }) => r.card_id),
      );
      remainingDueCount = allCards.filter(
        (c: { id: string }) => !notDueCardIds.has(c.id) && !reviewedCardIds.has(c.id),
      ).length;
    }
  }

  const method = session.learning_methods as JoinedMethodWithName;

  return {
    id: session.id,
    material: mat
      ? { id: mat.id, title: mat.title, subject: { name: mat.subjects.name } }
      : null,
    method,
    method_id: session.method_id,
    status: session.status as "in_progress" | "completed" | "abandoned",
    duration_sec: session.duration_sec,
    self_rating: session.self_rating as 1 | 2 | 3 | 4 | null,
    started_at: session.started_at,
    ended_at: session.ended_at,
    card_reviews: (reviews ?? []).map((r: {
      card_id: string;
      rating: number;
      response_ms: number;
      cards: unknown;
      sessions: unknown;
    }) => ({
      card_id: r.card_id,
      rating: r.rating,
      response_ms: r.response_ms,
      card: r.cards as { front: string; back: string },
    })),
    remaining_due_count: remainingDueCount,
    meta: session.meta as Record<string, unknown> | null,
    interleaving_materials: interleavingMaterials,
  };
}

export async function getInterleavingCards(sessionId: string): Promise<InterleavingCard[]> {
  const { user, supabase } = await requireAuth();

  // RLS に加えてアプリ層でも所有者を確認し、RLS 緩和時の誤操作を防ぐ
  const { data: session } = await supabase
    .from("sessions")
    .select("id")
    .eq("id", sessionId)
    .eq("user_id", user.id)
    .single();

  if (!session) return [];

  // 全教材の due cards を RPC 1 回で取得し、N+1 クエリを回避する
  const today = toJstDateString(new Date());
  const { data: rpcCards, error: rpcError } = await supabase.rpc("get_interleaving_due_cards", {
    p_session_id: sessionId,
    p_user_id: user.id,
    p_today: today,
  });

  if (rpcError) {
    console.error("getInterleavingCards RPC failed:", rpcError.message);
    return [];
  }

  const allCards: InterleavingCard[] = (rpcCards ?? []).map((c: InterleavingCardRow) => ({
    id: c.card_id,
    front: c.front,
    back: c.back,
    display_order: c.display_order,
    material_title: c.material_title,
  }));

  // 交互配置効果を生むため、教材を跨いでシャッフルする (Fisher-Yates)
  for (let i = allCards.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [allCards[i], allCards[j]] = [allCards[j], allCards[i]];
  }

  return allCards.slice(0, SESSION_MAX_CARDS);
}
```

- [ ] **Step 2: 既存テスト `sessions.test.ts` のインポートを更新**

`tests/small/lib/actions/sessions.test.ts` のインポートを `@/lib/actions/session-queries` に変更。テストは `getDueMaterials` をテストしているため、queries ファイルからインポートする。

`sessions.test.ts` の先頭のインポートブロック (モック設定後):

```typescript
// 変更前
import { getDueMaterials } from "@/lib/actions/sessions";

// 変更後
import { getDueMaterials } from "@/lib/actions/session-queries";
```

注意: `getDueMaterials` は `requireAuth()` を使うようになるため、モックの `getUser` が `null` を返した場合の振る舞いが変わる (redirect が throw される)。テスト内の認証モックが user を返していることを確認する。

- [ ] **Step 3: テストが通ることを確認**

Run: `bun test:small tests/small/lib/actions/sessions.test.ts`
Expected: PASS

- [ ] **Step 4: コミット**

```bash
git add src/lib/actions/session-queries.ts tests/small/lib/actions/sessions.test.ts
git commit -m "refactor: session-queries.ts に読み取り系関数を分離"
```

---

### Task 3: `session-commands.ts` の作成

**Files:**
- Create: `src/lib/actions/session-commands.ts`
- Modify: `tests/small/lib/actions/sessions-error-handling.test.ts`

- [ ] **Step 1: `session-commands.ts` を作成**

`sessions.ts` から以下を移動:
- 関数: `createSession`, `completeSession`, `createRestSession`, `completeElaborationSession`, `completePomodoroSession`, `completeRestSession`, `createInterleavingSession`

`src/lib/actions/session-commands.ts`:

```typescript
"use server";

import { revalidatePath } from "next/cache";
import {
  createSessionSchema,
  completeSessionSchema,
  createRestSessionSchema,
  completeRestSessionSchema,
  extractFieldErrors,
} from "@/lib/validations/sessions";
import {
  completeElaborationSchema,
  type ElaborationInput,
} from "@/lib/validations/elaboration";
import { createInterleavingSessionSchema } from "@/lib/validations/interleaving";
import type { ActionResult } from "@/lib/validations/materials";
import type { CardReview } from "@/lib/types/sessions";
import { SESSION_MAX_CARDS, REST_DURATION_SEC, ACTION_ERRORS } from "@/lib/constants";
import { completePomodoroSchema } from "@/lib/validations/pomodoro";
import { requireAuth } from "@/lib/actions/auth-utils";
import { invokeCompleteSession } from "@/lib/actions/session-compensation";
import { toJstDateString } from "@/lib/utils/date";

// Supabase JOIN 結果の型
type JoinedMethod = { slug: string };

export async function createSession(
  materialId: string,
  methodId: string,
): Promise<ActionResult<{ id: string }>> {
  const parsed = createSessionSchema.safeParse({ materialId, methodId });
  if (!parsed.success) {
    return {
      success: false,
      error: ACTION_ERRORS.INVALID_INPUT,
      fieldErrors: extractFieldErrors(parsed.error),
    };
  }

  const { user, supabase } = await requireAuth();

  // RLS に加えてアプリ層でも所有者を確認し、RLS 緩和時の誤操作を防ぐ
  const { data: material } = await supabase
    .from("materials")
    .select("id")
    .eq("id", parsed.data.materialId)
    .eq("user_id", user.id)
    .single();

  if (!material) return { success: false, error: ACTION_ERRORS.NOT_FOUND("教材") };

  const { data: session, error } = await supabase
    .from("sessions")
    .insert({
      material_id: parsed.data.materialId,
      method_id: parsed.data.methodId,
      user_id: user.id,
      status: "in_progress",
    })
    .select("id")
    .single();

  if (error) return { success: false, error: ACTION_ERRORS.CREATE_FAILED("セッション") };

  return { success: true, data: { id: session.id } };
}

export async function completeSession(
  sessionId: string,
  reviews: CardReview[],
  selfRating: number,
): Promise<ActionResult<undefined>> {
  const parsed = completeSessionSchema.safeParse({ sessionId, reviews, selfRating });
  if (!parsed.success) {
    return { success: false, error: ACTION_ERRORS.INVALID_INPUT };
  }

  const { user, supabase } = await requireAuth();

  // RLS に加えてアプリ層でも所有者と status を確認し、二重完了を防ぐ
  const { data: session } = await supabase
    .from("sessions")
    .select("id, started_at, status")
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
    })
    .eq("id", parsed.data.sessionId);

  if (updateError) return { success: false, error: ACTION_ERRORS.UPDATE_FAILED("セッション") };

  // FSRS 計算と統計更新を原子的に実行するため、Edge Function に処理を委譲する。
  // supabase.functions.invoke はユーザーの JWT を Authorization ヘッダーに自動付与する
  const fnResult = await invokeCompleteSession(
    supabase,
    parsed.data.sessionId,
    { session_id: parsed.data.sessionId, reviews: parsed.data.reviews },
  );
  if (!fnResult.ok) return { success: false, error: fnResult.error };

  revalidatePath("/");
  return { success: true, data: undefined };
}

export async function createRestSession(
  parentSessionId: string,
): Promise<ActionResult<{ id: string }>> {
  const parsed = createRestSessionSchema.safeParse({ parentSessionId });
  if (!parsed.success) {
    return { success: false, error: ACTION_ERRORS.INVALID_INPUT };
  }

  const { user, supabase } = await requireAuth();

  // RLS に加えてアプリ層でも所有者を確認し、他ユーザーのセッションへの紐付けを防ぐ
  const { data: parentSession } = await supabase
    .from("sessions")
    .select("id")
    .eq("id", parsed.data.parentSessionId)
    .eq("user_id", user.id)
    .single();

  if (!parentSession) return { success: false, error: ACTION_ERRORS.NOT_FOUND("セッション") };

  const { data: restMethod } = await supabase
    .from("learning_methods")
    .select("id")
    .eq("slug", "wakeful_rest")
    .single();

  if (!restMethod) return { success: false, error: ACTION_ERRORS.NOT_FOUND("安静タイマー手法") };

  const { data: session, error } = await supabase
    .from("sessions")
    .insert({
      user_id: user.id,
      method_id: restMethod.id,
      status: "in_progress",
      meta: { parent_session_id: parsed.data.parentSessionId },
    })
    .select("id")
    .single();

  if (error) return { success: false, error: ACTION_ERRORS.CREATE_FAILED("安静セッション") };

  return { success: true, data: { id: session.id } };
}

export async function completeElaborationSession(
  sessionId: string,
  reviews: CardReview[],
  elaborations: ElaborationInput[],
  selfRating: number,
): Promise<ActionResult<undefined>> {
  const parsed = completeElaborationSchema.safeParse({ sessionId, reviews, elaborations, selfRating });
  if (!parsed.success) {
    return { success: false, error: ACTION_ERRORS.INVALID_INPUT };
  }

  const { user, supabase } = await requireAuth();

  // RLS に加えてアプリ層でも所有者と status を確認し、二重完了を防ぐ
  const { data: session } = await supabase
    .from("sessions")
    .select("id, started_at, status")
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

  // elaborations を meta に保存し、セッションを完了する
  const { error: updateError } = await supabase
    .from("sessions")
    .update({
      status: "completed",
      duration_sec: durationSec,
      self_rating: parsed.data.selfRating,
      ended_at: now.toISOString(),
      meta: { elaborations: parsed.data.elaborations },
    })
    .eq("id", parsed.data.sessionId);

  if (updateError) return { success: false, error: ACTION_ERRORS.UPDATE_FAILED("セッション") };

  // Edge Function で card_reviews + daily_logs を記録 (FSRS はスキップ)
  // meta: null を extraCompensationFields に渡すのは、失敗時に完了前に保存した elaborations を破棄するため
  const fnResult = await invokeCompleteSession(
    supabase,
    parsed.data.sessionId,
    { session_id: parsed.data.sessionId, reviews: parsed.data.reviews },
    { meta: null },
  );
  if (!fnResult.ok) return { success: false, error: fnResult.error };

  revalidatePath("/");
  return { success: true, data: undefined };
}

export async function completePomodoroSession(
  sessionId: string,
  selfRating: number,
  pomodorosCompleted: number,
  totalFocusSec: number,
  totalBreakSec: number,
): Promise<ActionResult<undefined>> {
  const parsed = completePomodoroSchema.safeParse({
    sessionId,
    selfRating,
    pomodorosCompleted,
    totalFocusSec,
    totalBreakSec,
  });
  if (!parsed.success) {
    return { success: false, error: ACTION_ERRORS.INVALID_INPUT };
  }

  const { user, supabase } = await requireAuth();

  // RLS に加えてアプリ層でも所有者と status を確認し、二重完了を防ぐ
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

  // クライアント値は表示用 meta にのみ使用し、duration_sec は改ざん耐性のためサーバー側で計算する
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
        pomodoros_completed: parsed.data.pomodorosCompleted,
        total_focus_sec: parsed.data.totalFocusSec,
        total_break_sec: parsed.data.totalBreakSec,
      },
    })
    .eq("id", parsed.data.sessionId);

  if (updateError) return { success: false, error: ACTION_ERRORS.UPDATE_FAILED("セッション") };

  // Pomodoro は card_reviews がないため Edge Function を呼ばず、直接 daily_logs を記録する
  if (session.material_id) {
    const { data: material } = await supabase
      .from("materials")
      .select("subject_id")
      .eq("id", session.material_id)
      .single();

    if (material) {
      const logDate = toJstDateString(new Date());

      const { error: logError } = await supabase.rpc("upsert_daily_log", {
        p_user_id: user.id,
        p_subject_id: material.subject_id,
        p_method_id: session.method_id,
        p_log_date: logDate,
        p_duration_sec: durationSec,
        p_cards_reviewed: 0,
      });
      if (logError) {
        // daily_log 失敗はセッション完了をブロックしないが、データ欠損を追跡するためログに記録する
        console.error(
          `completePomodoroSession daily_log upsert failed for session ${parsed.data.sessionId}:`,
          logError,
        );
      }
    }
  }

  revalidatePath("/");
  return { success: true, data: undefined };
}

export async function completeRestSession(
  sessionId: string,
): Promise<ActionResult<undefined>> {
  const parsed = completeRestSessionSchema.safeParse({ sessionId });
  if (!parsed.success) {
    return { success: false, error: ACTION_ERRORS.INVALID_INPUT };
  }

  const { user, supabase } = await requireAuth();

  // 所有者・進行中・安静セッションの3条件を同時に検証し、不正な完了を防ぐ
  const { data: session } = await supabase
    .from("sessions")
    .select("id, learning_methods!inner(slug)")
    .eq("id", parsed.data.sessionId)
    .eq("user_id", user.id)
    .eq("status", "in_progress")
    .single();

  if (!session) return { success: false, error: ACTION_ERRORS.NOT_FOUND("セッション") };

  const method = session.learning_methods as JoinedMethod;
  if (method.slug !== "wakeful_rest") {
    return { success: false, error: "安静セッションではありません" };
  }

  const { error } = await supabase
    .from("sessions")
    .update({
      status: "completed",
      duration_sec: REST_DURATION_SEC,
      ended_at: new Date().toISOString(),
    })
    .eq("id", parsed.data.sessionId);

  if (error) return { success: false, error: ACTION_ERRORS.UPDATE_FAILED("セッション") };

  revalidatePath("/");
  return { success: true, data: undefined };
}

export async function createInterleavingSession(
  materialIds: string[],
): Promise<ActionResult<{ id: string }>> {
  const parsed = createInterleavingSessionSchema.safeParse({ materialIds });
  if (!parsed.success) {
    return { success: false, error: "インターリービングには2つ以上の教材が必要です" };
  }

  const { user, supabase } = await requireAuth();

  // interleaving の method_id を取得
  const { data: method } = await supabase
    .from("learning_methods")
    .select("id")
    .eq("slug", "interleaving")
    .single();

  if (!method) return { success: false, error: ACTION_ERRORS.NOT_FOUND("インターリービング手法") };

  // RLS に加えてアプリ層でも全教材の所有権を確認する
  const { data: ownedMaterials } = await supabase
    .from("materials")
    .select("id")
    .eq("user_id", user.id)
    .in("id", parsed.data.materialIds);

  if (!ownedMaterials || ownedMaterials.length !== parsed.data.materialIds.length) {
    return { success: false, error: ACTION_ERRORS.NOT_FOUND("教材") };
  }

  // material_id = NULL で interleaving セッションを作成
  const { data: session, error: sessionError } = await supabase
    .from("sessions")
    .insert({
      user_id: user.id,
      method_id: method.id,
      status: "in_progress",
    })
    .select("id")
    .single();

  if (sessionError || !session) {
    return { success: false, error: ACTION_ERRORS.CREATE_FAILED("セッション") };
  }

  // session_materials に対象教材を一括登録
  const sessionMaterialRows = parsed.data.materialIds.map((mid) => ({
    session_id: session.id,
    material_id: mid,
  }));

  const { error: smError } = await supabase
    .from("session_materials")
    .insert(sessionMaterialRows);

  if (smError) {
    // session_materials 挿入に失敗した場合、セッションを放棄状態にする
    await supabase
      .from("sessions")
      .update({ status: "abandoned" })
      .eq("id", session.id);
    return { success: false, error: ACTION_ERRORS.CREATE_FAILED("セッション") };
  }

  return { success: true, data: { id: session.id } };
}
```

- [ ] **Step 2: 既存テスト `sessions-error-handling.test.ts` のインポートを更新**

`tests/small/lib/actions/sessions-error-handling.test.ts` のインポートを `@/lib/actions/session-commands` に変更。テスト対象関数 (createSession, completeSession 等) は commands ファイルに移動しているため。

注意: テスト内の認証モックが `getUser` で `user: null` を返すケースがある場合、`requireAuth()` は redirect を throw するため、テストの期待値を更新する必要がある。具体的には:
- `getUser` が `null` → `redirect` が throw される → テストは `NEXT_REDIRECT` エラーを期待する

- [ ] **Step 3: テストが通ることを確認**

Run: `bun test:small tests/small/lib/actions/sessions-error-handling.test.ts`
Expected: PASS

- [ ] **Step 4: コミット**

```bash
git add src/lib/actions/session-commands.ts tests/small/lib/actions/sessions-error-handling.test.ts
git commit -m "refactor: session-commands.ts に書き込み系関数を分離"
```

---

### Task 4: `sessions.ts` を re-export バレルに変換

**Files:**
- Modify: `src/lib/actions/sessions.ts`

- [ ] **Step 1: `sessions.ts` を re-export バレルに変換**

`src/lib/actions/sessions.ts` を以下に置き換え:

```typescript
"use server";

// re-export バレル: 既存のインポートパスとの互換性を維持する
// 新規コードでは session-queries.ts / session-commands.ts から直接インポートすること
export {
  getSessionInfo,
  getDueMaterials,
  getSessionCards,
  getSession,
  getInterleavingCards,
} from "@/lib/actions/session-queries";
export type { SessionInfo } from "@/lib/actions/session-queries";

export {
  createSession,
  completeSession,
  createRestSession,
  completeElaborationSession,
  completePomodoroSession,
  completeRestSession,
  createInterleavingSession,
} from "@/lib/actions/session-commands";
```

- [ ] **Step 2: 全テストが通ることを確認**

Run: `bun test:small`
Expected: ALL PASS

- [ ] **Step 3: 型チェックと lint が通ることを確認**

Run: `bun typecheck && bun lint`
Expected: エラーなし

- [ ] **Step 4: コミット**

```bash
git add src/lib/actions/sessions.ts
git commit -m "refactor: sessions.ts を re-export バレルに変換"
```

---

### Task 5: 最終検証

- [ ] **Step 1: 全テスト実行**

Run: `bun test:small && bun test:medium`
Expected: ALL PASS

- [ ] **Step 2: ビルド確認**

Run: `bun build`
Expected: ビルド成功

- [ ] **Step 3: 行数確認**

`wc -l` で各ファイルの行数を確認:
- `session-queries.ts`: ~250 行 (300 行以下)
- `session-commands.ts`: ~350 行 (許容範囲。さらなる分割は現時点では不要)
- `sessions.ts`: ~20 行 (re-export のみ)

- [ ] **Step 4: コミットなし (検証のみ)**
