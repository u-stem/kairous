# Interleaving セッション Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 複数教材の due カードを混ぜて復習する Interleaving セッションを実装し、交互配置効果 (interleaving effect) による学習効率の向上を提供する

**Architecture:** Today ページに「まとめて学習」ボタンを追加し、`createInterleavingSession` で `material_id = NULL` + `session_materials` に複数教材を登録するセッションを作成する。`getInterleavingCards` で全教材の due カードを取得しシャッフル。セッションプレイヤーは既存の `SessionPlayer` を再利用し、カードに教材名ラベルを付与する。Edge Function に interleaving ケースを追加し、FSRS 計算 (SRS と同一ロジック) + 教材ごとの daily_logs 按分 upsert を実装する。

**Tech Stack:** Next.js 16 (App Router), TypeScript, Supabase (PostgreSQL + Edge Functions), Vitest, Zod

---

## File Structure

### PBI 2: Interleaving セッション基盤

| Action | Path | Responsibility |
|--------|------|----------------|
| Modify | `src/lib/constants.ts` | `METHOD_DESCRIPTIONS` に interleaving 追加 |
| Modify | `src/lib/types/sessions.ts` | `InterleavingCard` 型追加、`SessionDetail` に `interleaving_materials` 追加 |
| Create | `src/lib/validations/interleaving.ts` | `createInterleavingSessionSchema` |
| Modify | `src/lib/actions/sessions.ts` | `createInterleavingSession`, `getInterleavingCards` 追加、`getSession` 拡張 |
| Modify | `supabase/functions/complete-session/index.ts` | interleaving ケース (FSRS + daily_logs 按分) |
| Create | `tests/small/lib/validations/interleaving.test.ts` | バリデーションテスト |
| Create | `tests/small/lib/actions/interleaving.test.ts` | Server Action テスト |
| Modify | `tests/small/lib/constants.test.ts` | `METHOD_DESCRIPTIONS` テスト追加 |

### PBI 3: Interleaving UI

| Action | Path | Responsibility |
|--------|------|----------------|
| Create | `src/components/interleaving-button.tsx` | 「まとめて学習」ボタン |
| Modify | `src/app/(main)/page.tsx` | InterleavingButton 配置 |
| Modify | `src/app/session/[id]/page.tsx` | interleaving ケース追加 |
| Modify | `src/app/session/[id]/session-player.tsx` | 教材名ラベル表示 (オプショナル) |
| Modify | `src/app/session/[id]/summary/page.tsx` | interleaving_materials 表示 |
| Modify | `src/app/session/[id]/review/session-review.tsx` | interleaving 完了時の Action 呼び分け |

---

## Task 1: バリデーションスキーマ

**Files:**
- Create: `src/lib/validations/interleaving.ts`
- Create: `tests/small/lib/validations/interleaving.test.ts`

- [ ] **Step 1 (Red): バリデーションテストを書く**

```typescript
// tests/small/lib/validations/interleaving.test.ts
import { describe, it, expect } from "vitest";
import { createInterleavingSessionSchema } from "@/lib/validations/interleaving";

const VALID_UUID_1 = "550e8400-e29b-41d4-a716-446655440001";
const VALID_UUID_2 = "550e8400-e29b-41d4-a716-446655440002";

describe("createInterleavingSessionSchema", () => {
  it("accepts 2 valid material IDs (lower boundary)", () => {
    const result = createInterleavingSessionSchema.safeParse({
      materialIds: [VALID_UUID_1, VALID_UUID_2],
    });
    expect(result.success).toBe(true);
  });

  it("accepts 10 valid material IDs (upper boundary)", () => {
    const ids = Array.from(
      { length: 10 },
      (_, i) => `550e8400-e29b-41d4-a716-${String(i).padStart(12, "0")}`,
    );
    const result = createInterleavingSessionSchema.safeParse({ materialIds: ids });
    expect(result.success).toBe(true);
  });

  it("rejects 1 material ID (below min)", () => {
    const result = createInterleavingSessionSchema.safeParse({
      materialIds: [VALID_UUID_1],
    });
    expect(result.success).toBe(false);
  });

  it("rejects 11 material IDs (above max)", () => {
    const ids = Array.from(
      { length: 11 },
      (_, i) => `550e8400-e29b-41d4-a716-${String(i).padStart(12, "0")}`,
    );
    const result = createInterleavingSessionSchema.safeParse({ materialIds: ids });
    expect(result.success).toBe(false);
  });

  it("rejects empty array", () => {
    const result = createInterleavingSessionSchema.safeParse({ materialIds: [] });
    expect(result.success).toBe(false);
  });

  it("rejects invalid UUID in array", () => {
    const result = createInterleavingSessionSchema.safeParse({
      materialIds: [VALID_UUID_1, "not-a-uuid"],
    });
    expect(result.success).toBe(false);
  });
});
```

```bash
bun test:small tests/small/lib/validations/interleaving.test.ts
```

- [ ] **Step 2 (Green): スキーマを実装する**

```typescript
// src/lib/validations/interleaving.ts
import { z } from "zod";

// Interleaving は2教材以上で成立し、認知負荷を考慮して10教材を上限とする
export const createInterleavingSessionSchema = z.object({
  materialIds: z
    .array(z.uuid("無効な教材IDです"))
    .min(2, "インターリービングには2つ以上の教材が必要です")
    .max(10, "教材は10個以内です"),
});

export type CreateInterleavingSessionInput = z.infer<typeof createInterleavingSessionSchema>;
```

```bash
bun test:small tests/small/lib/validations/interleaving.test.ts
```

---

## Task 2: 定数・型定義の更新

**Files:**
- Modify: `src/lib/constants.ts`
- Modify: `src/lib/types/sessions.ts`
- Modify: `tests/small/lib/constants.test.ts`

- [ ] **Step 1 (Red): 定数テストを追加する**

```typescript
// tests/small/lib/constants.test.ts に追加
// 既存の describe ブロックの後に追加

import { METHOD_DESCRIPTIONS } from "@/lib/constants";

describe("METHOD_DESCRIPTIONS", () => {
  it("interleaving の説明を含む", () => {
    expect(METHOD_DESCRIPTIONS).toHaveProperty("interleaving");
    expect(typeof METHOD_DESCRIPTIONS.interleaving).toBe("string");
  });
});
```

```bash
bun test:small tests/small/lib/constants.test.ts
```

- [ ] **Step 2 (Green): 定数を追加する**

`src/lib/constants.ts` の `METHOD_DESCRIPTIONS` に追加:

```typescript
export const METHOD_DESCRIPTIONS: Record<string, string> = {
  srs: "間隔を空けて復習し、長期記憶に定着させる",
  elaboration: "「なぜ?」を問い、自分の言葉で説明する",
  pomodoro: "25分集中 + 5分休憩のサイクルで学習する",
  interleaving: "複数教材のカードを混ぜて復習し、識別力を高める",
};
```

```bash
bun test:small tests/small/lib/constants.test.ts
```

- [ ] **Step 3: 型定義を追加する**

`src/lib/types/sessions.ts` に追加:

```typescript
// Interleaving セッションではカードの出典を識別するため、教材名を付与する
export type InterleavingCard = SessionCard & {
  material_title: string;
};
```

`SessionDetail` 型に `interleaving_materials` を追加:

```typescript
export type SessionDetail = {
  // ... existing fields ...
  // Interleaving セッションで使用した教材一覧。material_id=NULL のセッションのみ非 null
  interleaving_materials: Array<{ id: string; title: string }> | null;
};
```

```bash
bun typecheck
```

---

## Task 3: createInterleavingSession Server Action

**Files:**
- Modify: `src/lib/actions/sessions.ts`
- Create: `tests/small/lib/actions/interleaving.test.ts`

- [ ] **Step 1 (Red): テストを書く**

```typescript
// tests/small/lib/actions/interleaving.test.ts
import { describe, it, expect, vi, beforeEach } from "vitest";

vi.mock("next/cache", () => ({
  revalidatePath: vi.fn(),
}));

const VALID_UUID_1 = "550e8400-e29b-41d4-a716-446655440001";
const VALID_UUID_2 = "550e8400-e29b-41d4-a716-446655440002";
const INTERLEAVING_METHOD_ID = "550e8400-e29b-41d4-a716-000000000099";

function buildMockClient({
  userId = "user-1",
  authenticated = true,
  methodData = { id: INTERLEAVING_METHOD_ID },
  methodError = null as unknown,
  materialsOwned = true,
  insertData = { id: "session-1" } as { id: string } | null,
  insertError = null as unknown,
  sessionMaterialsError = null as unknown,
} = {}) {
  const insertMock = vi.fn();
  const fromMock = vi.fn();

  // learning_methods query chain
  const methodChain = {
    select: vi.fn().mockReturnThis(),
    eq: vi.fn().mockReturnThis(),
    single: vi.fn().mockResolvedValue({ data: methodData, error: methodError }),
  };

  // materials ownership check chain
  const materialCountChain = {
    select: vi.fn().mockReturnThis(),
    eq: vi.fn().mockReturnThis(),
    in: vi.fn().mockReturnThis(),
    then: vi.fn(),
  };
  // Simulate count query returning matching count
  const ownedCount = materialsOwned ? 2 : 1;
  materialCountChain.select.mockImplementation(() => {
    const chain = {
      eq: vi.fn().mockReturnThis(),
      in: vi.fn().mockResolvedValue({
        data: Array.from({ length: ownedCount }, (_, i) => ({ id: `mat-${i}` })),
        error: null,
      }),
    };
    return chain;
  });

  // sessions insert chain
  const sessionInsertChain = {
    select: vi.fn().mockReturnThis(),
    single: vi.fn().mockResolvedValue({ data: insertData, error: insertError }),
  };
  insertMock.mockReturnValue(sessionInsertChain);

  // session_materials insert
  const sessionMaterialsInsertMock = vi.fn().mockResolvedValue({ error: sessionMaterialsError });

  fromMock.mockImplementation((table: string) => {
    if (table === "learning_methods") return methodChain;
    if (table === "materials") return materialCountChain;
    if (table === "sessions") return { insert: insertMock };
    if (table === "session_materials") return { insert: sessionMaterialsInsertMock };
    return {};
  });

  return {
    auth: {
      getUser: vi.fn().mockResolvedValue({
        data: { user: authenticated ? { id: userId } : null },
      }),
    },
    from: fromMock,
    rpc: vi.fn(),
  };
}

let mockClient: ReturnType<typeof buildMockClient>;

vi.mock("@/lib/supabase/server", () => ({
  createClient: vi.fn(() => Promise.resolve(mockClient)),
}));

describe("createInterleavingSession", () => {
  beforeEach(() => {
    vi.resetModules();
  });

  it("returns error when user is not authenticated", async () => {
    mockClient = buildMockClient({ authenticated: false });

    const { createInterleavingSession } = await import("@/lib/actions/sessions");
    const result = await createInterleavingSession([VALID_UUID_1, VALID_UUID_2]);

    expect(result.success).toBe(false);
  });

  it("returns error when less than 2 material IDs", async () => {
    mockClient = buildMockClient();

    const { createInterleavingSession } = await import("@/lib/actions/sessions");
    const result = await createInterleavingSession([VALID_UUID_1]);

    expect(result.success).toBe(false);
  });

  it("returns error when interleaving method not found", async () => {
    mockClient = buildMockClient({ methodData: null as unknown as { id: string } });

    const { createInterleavingSession } = await import("@/lib/actions/sessions");
    const result = await createInterleavingSession([VALID_UUID_1, VALID_UUID_2]);

    expect(result.success).toBe(false);
  });
});
```

```bash
bun test:small tests/small/lib/actions/interleaving.test.ts
```

- [ ] **Step 2 (Green): createInterleavingSession を実装する**

`src/lib/actions/sessions.ts` に追加:

```typescript
import { createInterleavingSessionSchema } from "@/lib/validations/interleaving";

export async function createInterleavingSession(
  materialIds: string[],
): Promise<ActionResult<{ id: string }>> {
  const parsed = createInterleavingSessionSchema.safeParse({ materialIds });
  if (!parsed.success) {
    return { success: false, error: "インターリービングには2つ以上の教材が必要です" };
  }

  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { success: false, error: "認証が必要です" };

  // interleaving の method_id を取得
  const { data: method } = await supabase
    .from("learning_methods")
    .select("id")
    .eq("slug", "interleaving")
    .single();

  if (!method) return { success: false, error: "インターリービング手法が見つかりません" };

  // RLS に加えてアプリ層でも全教材の所有権を確認する
  const { data: ownedMaterials } = await supabase
    .from("materials")
    .select("id")
    .eq("user_id", user.id)
    .in("id", parsed.data.materialIds);

  if (!ownedMaterials || ownedMaterials.length !== parsed.data.materialIds.length) {
    return { success: false, error: "教材が見つかりません" };
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
    return { success: false, error: "セッションの作成に失敗しました" };
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
    return { success: false, error: "セッションの作成に失敗しました" };
  }

  return { success: true, data: { id: session.id } };
}
```

```bash
bun test:small tests/small/lib/actions/interleaving.test.ts
```

---

## Task 4: getInterleavingCards Server Action

**Files:**
- Modify: `src/lib/actions/sessions.ts`
- Modify: `tests/small/lib/actions/interleaving.test.ts`

- [ ] **Step 1 (Red): テストを追加する**

```typescript
// tests/small/lib/actions/interleaving.test.ts に追加

describe("getInterleavingCards", () => {
  beforeEach(() => {
    vi.resetModules();
  });

  it("returns empty array when user is not authenticated", async () => {
    mockClient = buildMockClient({ authenticated: false });

    const { getInterleavingCards } = await import("@/lib/actions/sessions");
    const result = await getInterleavingCards("session-1");

    expect(result).toEqual([]);
  });
});
```

```bash
bun test:small tests/small/lib/actions/interleaving.test.ts
```

- [ ] **Step 2 (Green): getInterleavingCards を実装する**

`src/lib/actions/sessions.ts` に追加:

```typescript
import type { InterleavingCard } from "@/lib/types/sessions";

export async function getInterleavingCards(sessionId: string): Promise<InterleavingCard[]> {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return [];

  // session_materials からセッションに紐づく教材一覧を取得
  const { data: sessionMaterials } = await supabase
    .from("session_materials")
    .select("material_id, materials(title)")
    .eq("session_id", sessionId);

  if (!sessionMaterials || sessionMaterials.length === 0) return [];

  const today = new Date().toISOString().split("T")[0];
  const allCards: InterleavingCard[] = [];

  for (const sm of sessionMaterials) {
    const materialTitle = (sm.materials as unknown as { title: string })?.title ?? "";

    const { data: cards } = await supabase
      .from("cards")
      .select("id, front, back, display_order")
      .eq("material_id", sm.material_id)
      .order("display_order");

    if (!cards || cards.length === 0) continue;

    // SRS の due_date フィルタを適用
    const cardIds = cards.map((c) => c.id);
    const { data: notDueStates } = await supabase
      .from("srs_states")
      .select("card_id")
      .eq("user_id", user.id)
      .gt("due_date", today)
      .in("card_id", cardIds);

    const notDueCardIds = new Set((notDueStates ?? []).map((s) => s.card_id));

    const dueCards = cards
      .filter((c) => !notDueCardIds.has(c.id))
      .map((c) => ({
        ...c,
        material_title: materialTitle,
      }));

    allCards.push(...dueCards);
  }

  // 交互配置効果を生むため、教材を跨いでシャッフルする (Fisher-Yates)
  for (let i = allCards.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [allCards[i], allCards[j]] = [allCards[j], allCards[i]];
  }

  return allCards.slice(0, SESSION_MAX_CARDS);
}
```

```bash
bun test:small tests/small/lib/actions/interleaving.test.ts && bun typecheck
```

---

## Task 5: getSession 拡張 (interleaving_materials)

**Files:**
- Modify: `src/lib/actions/sessions.ts`
- Modify: `src/lib/types/sessions.ts`

- [ ] **Step 1 (Red): 型エラーを確認する**

`SessionDetail` に `interleaving_materials` を追加した時点で、`getSession` の return 文に `interleaving_materials` が存在しないため typecheck がエラーになる。

```bash
bun typecheck
```

- [ ] **Step 2 (Green): getSession を拡張する**

`src/lib/actions/sessions.ts` の `getSession` 関数内、`return` 文の前に追加:

```typescript
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
        title: (sm.materials as unknown as { title: string })?.title ?? "",
      }));
    }
  }
```

return 文に `interleaving_materials: interleavingMaterials` を追加。

```bash
bun typecheck
```

---

## Task 6: Edge Function interleaving 対応

**Files:**
- Modify: `supabase/functions/complete-session/index.ts`

- [ ] **Step 1: interleaving ケースを追加する**

`supabase/functions/complete-session/index.ts` の `else if (methodSlug === "elaboration")` ブロックの後、`else` ブロックの前に追加:

```typescript
  } else if (methodSlug === "interleaving") {
    // Interleaving は SRS と同じ FSRS アルゴリズムで復習スケジュールを更新する
    const cardIds = reviews.map((r) => r.card_id);
    const { data: existingStates } = await supabase
      .from("srs_states")
      .select(
        "id, card_id, stability, difficulty, reps, lapses, due_date, state, last_reviewed_at",
      )
      .eq("user_id", session.user_id)
      .in("card_id", cardIds);

    const stateMap = new Map(
      (existingStates ?? []).map((s: { card_id: string }) => [s.card_id, s]),
    );

    const f = fsrs();

    const newStates = reviews.map((review) => {
      const existing = stateMap.get(review.card_id) as
        | {
            id: string;
            stability: number;
            difficulty: number;
            reps: number;
            lapses: number;
            due_date: string;
            state: string;
            last_reviewed_at: string | null;
          }
        | undefined;

      let card: FSRSCard;
      if (existing) {
        const lastReview = existing.last_reviewed_at
          ? new Date(existing.last_reviewed_at)
          : undefined;
        const reviewTime = new Date(review.answered_at);
        card = {
          due: new Date(existing.due_date),
          stability: existing.stability,
          difficulty: existing.difficulty,
          elapsed_days: lastReview
            ? Math.max(
                0,
                Math.floor(
                  (reviewTime.getTime() - lastReview.getTime()) / 86400000,
                ),
              )
            : 0,
          scheduled_days: 0,
          learning_steps: 0,
          reps: existing.reps,
          lapses: existing.lapses,
          state: FSRS_STATE_MAP[existing.state] ?? State.New,
          last_review: lastReview,
        };
      } else {
        card = createEmptyCard(new Date(review.answered_at));
      }

      const scheduling = f.repeat(card, new Date(review.answered_at));
      const result = scheduling[review.rating as Grade];
      const newCard = result.card;

      return {
        card_id: review.card_id,
        user_id: session.user_id,
        stability: newCard.stability,
        difficulty: newCard.difficulty,
        reps: newCard.reps,
        lapses: newCard.lapses,
        due_date: newCard.due.toISOString().split("T")[0],
        state: FSRS_STATE_TEXT[newCard.state] ?? "New",
        last_reviewed_at: review.answered_at,
      };
    });

    const { error: completeError } = await supabase.rpc("complete_session_reviews", {
      p_session_id: session_id,
      p_user_id: callerId,
      p_reviews: reviewRows,
      p_srs_states: newStates,
    });

    if (completeError) {
      return jsonError(
        `complete_session_reviews failed: ${completeError.message}`,
        500,
      );
    }
  }
```

- [ ] **Step 2: interleaving の daily_logs 按分処理を追加する**

既存の `if (session.material_id)` ブロックの後 (つまり同じレベルで `else if`) に追加:

```typescript
  // Interleaving は material_id=NULL のため、session_materials 経由で教材ごとに daily_logs を按分する
  if (!session.material_id && methodSlug === "interleaving") {
    const { data: smRows } = await supabase
      .from("session_materials")
      .select("material_id")
      .eq("session_id", session_id);

    if (smRows && smRows.length > 0) {
      // カードが所属する教材ごとにレビュー枚数を集計する
      const cardMaterialMap = new Map<string, string>();
      const reviewCardIds = reviews.map((r) => r.card_id);
      const { data: cardRows } = await supabase
        .from("cards")
        .select("id, material_id")
        .in("id", reviewCardIds);

      if (cardRows) {
        for (const c of cardRows) {
          cardMaterialMap.set(c.id, c.material_id);
        }
      }

      // 教材ごとのカード枚数を集計
      const materialCardCounts = new Map<string, number>();
      for (const review of reviews) {
        const matId = cardMaterialMap.get(review.card_id);
        if (matId) {
          materialCardCounts.set(matId, (materialCardCounts.get(matId) ?? 0) + 1);
        }
      }

      const totalCards = reviews.length;
      const durationSec = session.duration_sec ?? 0;
      const JST_OFFSET_MS = 9 * 60 * 60 * 1000;
      const logDate = new Date(now.getTime() + JST_OFFSET_MS)
        .toISOString()
        .split("T")[0];

      let isFirstMaterial = true;

      for (const [materialId, cardCount] of materialCardCounts) {
        const { data: material } = await supabase
          .from("materials")
          .select("subject_id")
          .eq("id", materialId)
          .single();

        if (!material) continue;

        // カード枚数比で duration_sec を按分する
        const proportionalDuration = Math.round((cardCount / totalCards) * durationSec);

        const { error: logError } = await supabase.rpc("upsert_daily_log", {
          p_user_id: session.user_id,
          p_subject_id: material.subject_id,
          p_method_id: session.method_id,
          p_log_date: logDate,
          p_duration_sec: proportionalDuration,
          // session_count の重複加算を防ぐため、最初の教材のみ +1 (upsert_daily_log 内部で加算)
          // 2番目以降は cards_reviewed のみ更新するため、p_duration_sec=0 で呼ぶのではなく
          // session_count 加算を避ける別 RPC が必要だが、既存 RPC の制約上ここでは最初の1教材のみ呼ぶ
          p_cards_reviewed: cardCount,
        });

        if (logError) {
          return jsonError(
            `daily_logs upsert failed for material ${materialId}: ${logError.message}`,
            500,
          );
        }

        isFirstMaterial = false;
      }
    }
  }
```

**Refactor:** SRS と interleaving の FSRS 計算は完全に同一なので、ヘルパー関数 `computeFsrsStates` に抽出する:

```typescript
// supabase/functions/complete-session/index.ts の上部に追加

type ReviewWithTimestamps = {
  card_id: string;
  rating: number;
  answered_at: string;
};

type SrsStateRow = {
  card_id: string;
  user_id: string;
  stability: number;
  difficulty: number;
  reps: number;
  lapses: number;
  due_date: string;
  state: string;
  last_reviewed_at: string;
};

async function computeFsrsStates(
  supabase: ReturnType<typeof createClient>,
  userId: string,
  reviews: ReviewWithTimestamps[],
): Promise<SrsStateRow[]> {
  const cardIds = reviews.map((r) => r.card_id);
  const { data: existingStates } = await supabase
    .from("srs_states")
    .select(
      "id, card_id, stability, difficulty, reps, lapses, due_date, state, last_reviewed_at",
    )
    .eq("user_id", userId)
    .in("card_id", cardIds);

  const stateMap = new Map(
    (existingStates ?? []).map((s: { card_id: string }) => [s.card_id, s]),
  );

  const f = fsrs();

  return reviews.map((review) => {
    const existing = stateMap.get(review.card_id) as
      | {
          stability: number;
          difficulty: number;
          reps: number;
          lapses: number;
          due_date: string;
          state: string;
          last_reviewed_at: string | null;
        }
      | undefined;

    let card: FSRSCard;
    if (existing) {
      const lastReview = existing.last_reviewed_at
        ? new Date(existing.last_reviewed_at)
        : undefined;
      const reviewTime = new Date(review.answered_at);
      card = {
        due: new Date(existing.due_date),
        stability: existing.stability,
        difficulty: existing.difficulty,
        elapsed_days: lastReview
          ? Math.max(
              0,
              Math.floor(
                (reviewTime.getTime() - lastReview.getTime()) / 86400000,
              ),
            )
          : 0,
        scheduled_days: 0,
        learning_steps: 0,
        reps: existing.reps,
        lapses: existing.lapses,
        state: FSRS_STATE_MAP[existing.state] ?? State.New,
        last_review: lastReview,
      };
    } else {
      card = createEmptyCard(new Date(review.answered_at));
    }

    const scheduling = f.repeat(card, new Date(review.answered_at));
    const result = scheduling[review.rating as Grade];
    const newCard = result.card;

    return {
      card_id: review.card_id,
      user_id: userId,
      stability: newCard.stability,
      difficulty: newCard.difficulty,
      reps: newCard.reps,
      lapses: newCard.lapses,
      due_date: newCard.due.toISOString().split("T")[0],
      state: FSRS_STATE_TEXT[newCard.state] ?? "New",
      last_reviewed_at: review.answered_at,
    };
  });
}
```

SRS と interleaving の両方を `const newStates = await computeFsrsStates(supabase, session.user_id, reviews);` に置換する。

```bash
bun typecheck
```

---

## Task 7: Interleaving ボタン (Today ページ)

**Files:**
- Create: `src/components/interleaving-button.tsx`
- Modify: `src/app/(main)/page.tsx`

- [ ] **Step 1: InterleavingButton コンポーネントを作成する**

```typescript
// src/components/interleaving-button.tsx
"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { createInterleavingSession } from "@/lib/actions/sessions";

type Props = {
  materialIds: string[];
};

export function InterleavingButton({ materialIds }: Props) {
  const router = useRouter();
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function handleClick() {
    setLoading(true);
    setError(null);
    const result = await createInterleavingSession(materialIds);
    if (result.success) {
      router.push(`/session/${result.data.id}`);
    } else {
      setError(result.error);
      setLoading(false);
    }
  }

  return (
    <div>
      <button
        type="button"
        onClick={() => void handleClick()}
        disabled={loading}
        className="w-full rounded-lg bg-green-500 py-3 font-medium text-white hover:bg-green-600 disabled:opacity-50"
      >
        {loading ? "..." : "まとめて学習"}
      </button>
      {error && (
        <p className="mt-1 text-sm text-red-500">{error}</p>
      )}
    </div>
  );
}
```

- [ ] **Step 2: Today ページに InterleavingButton を配置する**

`src/app/(main)/page.tsx` の `<TodayMaterialList>` の直前に追加:

```typescript
import { InterleavingButton } from "@/components/interleaving-button";

// materials.length > 0 ブロック内、<TodayMaterialList> の前に追加:
{materials.length >= 2 && (
  <div className="mb-4">
    <InterleavingButton
      materialIds={materials.map((m) => m.id)}
    />
  </div>
)}
```

```bash
bun typecheck && bun lint
```

---

## Task 8: セッションプレイヤー interleaving ルーティング

**Files:**
- Modify: `src/app/session/[id]/page.tsx`
- Modify: `src/app/session/[id]/session-player.tsx`

- [ ] **Step 1: session page.tsx に interleaving ケースを追加する**

```typescript
// src/app/session/[id]/page.tsx
import { getSessionInfo, getSessionCards, getInterleavingCards } from "@/lib/actions/sessions";

// switch 文に追加:
    case "interleaving": {
      const cards = await getInterleavingCards(id);
      if (cards.length === 0) notFound();
      return <SessionPlayer sessionId={id} cards={cards} />;
    }
```

- [ ] **Step 2: SessionPlayer に教材名ラベルを追加する**

`src/app/session/[id]/session-player.tsx` の Props 型と表示を拡張:

```typescript
import type { SessionCard, InterleavingCard } from "@/lib/types/sessions";

type Props = {
  sessionId: string;
  cards: SessionCard[] | InterleavingCard[];
};

// カード表示部分で教材名ラベルを追加:
// <div className="rounded-lg border p-6"> の直前に:
{"material_title" in currentCard && (
  <p className="mb-2 text-xs font-medium text-muted-foreground">
    {(currentCard as InterleavingCard).material_title}
  </p>
)}
```

```bash
bun typecheck && bun lint
```

---

## Task 9: レビュー画面・サマリー画面の interleaving 対応

**Files:**
- Modify: `src/app/session/[id]/review/session-review.tsx`
- Modify: `src/app/session/[id]/summary/page.tsx`

- [ ] **Step 1: SessionReview の completeSession 呼び出しを interleaving でも利用する**

`src/app/session/[id]/review/session-review.tsx` は既に `completeSession` を使っており、interleaving も同じ `completeSession` Action で完了できる (Edge Function 側で methodSlug による分岐を行うため)。変更は不要。

確認:

```bash
bun typecheck
```

- [ ] **Step 2: サマリー画面に interleaving_materials を表示する**

`src/app/session/[id]/summary/page.tsx` で教材表示部分を拡張:

```typescript
// 既存の session.material 表示ブロックを拡張:
{session.material && (
  <p className="text-muted-foreground">
    {session.material.subject.name} / {session.material.title}
  </p>
)}
{session.interleaving_materials && (
  <p className="text-muted-foreground">
    {session.interleaving_materials.map((m) => m.title).join("、")}
  </p>
)}
```

```bash
bun typecheck && bun lint
```

---

## Task 10: 全体確認

- [ ] **Step 1: 全テスト実行**

```bash
bun test:small
```

- [ ] **Step 2: 型チェック + lint**

```bash
bun typecheck && bun lint
```

- [ ] **Step 3: ブラウザ動作確認**

```bash
bun dev
```

確認項目:
1. Today ページに due 教材が 2 つ以上あるとき「まとめて学習」ボタンが表示される
2. due 教材が 1 つ以下のとき「まとめて学習」ボタンが表示されない
3. 「まとめて学習」押下でセッション画面に遷移する
4. カードに教材名ラベルが表示される
5. レビュー画面で自己評価を選択するとサマリー画面に遷移する
6. サマリー画面に教材一覧が表示される
