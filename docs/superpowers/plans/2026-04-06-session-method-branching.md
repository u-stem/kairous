# セッション手法分岐 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** ウィザードで選択した手法 (SRS / Elaboration / Pomodoro) ごとに適切なセッション体験を提供する

**Architecture:** Active Recall を SRS に統合後、session page.tsx の Server Component で method.slug を取得し、対応する Client Component (CardSessionPlayer / ElaborationPlayer / PomodoroPlayer) に分岐する。Elaboration は既存のカード + テキスト入力、Pomodoro は円形プログレスタイマーで実装。Edge Function は method.slug で FSRS 計算の要否を判定する。

**Tech Stack:** Next.js 16 (App Router), TypeScript, Supabase (PostgreSQL + Edge Functions), Vitest, Zod

---

## File Structure

### PBI 1: Active Recall 統合 + 分岐ルーター

| Action | Path | Responsibility |
|--------|------|----------------|
| Modify | `supabase/seeds/01_master.sql` | active_recall を seed から削除 |
| Create | `supabase/migrations/00012_remove_active_recall.sql` | active_recall → srs マイグレーション |
| Modify | `src/lib/constants.ts` | MATERIAL_METHOD_SLUGS, CARD_BASED_SLUGS, METHOD_CATEGORIES, METHOD_DESCRIPTIONS から active_recall 削除 |
| Modify | `src/app/session/[id]/page.tsx` | method.slug 取得 + コンポーネント分岐ルーター |
| Modify | `src/lib/actions/sessions.ts` | getSessionCards に method slug 情報を追加 |
| Modify | `tests/small/lib/constants.test.ts` | CARD_BASED_SLUGS テスト更新 |

### PBI 2: Elaboration セッション

| Action | Path | Responsibility |
|--------|------|----------------|
| Create | `src/app/session/[id]/use-elaboration-player.ts` | Elaboration 用状態管理 hook |
| Create | `src/app/session/[id]/elaboration-player.tsx` | Elaboration 用 UI コンポーネント |
| Create | `src/lib/validations/elaboration.ts` | Elaboration 完了用バリデーションスキーマ |
| Modify | `src/lib/actions/sessions.ts` | completeElaborationSession アクション追加 |
| Modify | `supabase/functions/complete-session/index.ts` | method.slug による FSRS スキップ分岐 |
| Create | `tests/small/app/session/use-elaboration-player.test.ts` | hook テスト |
| Create | `tests/small/lib/validations/elaboration.test.ts` | バリデーションテスト |

### PBI 3: Pomodoro セッション

| Action | Path | Responsibility |
|--------|------|----------------|
| Create | `src/app/session/[id]/use-pomodoro-timer.ts` | Pomodoro タイマー + サイクル管理 hook |
| Create | `src/app/session/[id]/pomodoro-player.tsx` | Pomodoro 用 UI コンポーネント |
| Create | `src/lib/validations/pomodoro.ts` | Pomodoro 完了用バリデーションスキーマ |
| Modify | `src/lib/actions/sessions.ts` | completePomodoroSession アクション追加 |
| Modify | `src/lib/constants.ts` | POMODORO_FOCUS_SEC, POMODORO_BREAK_SEC 定数追加 |
| Create | `tests/small/app/session/use-pomodoro-timer.test.ts` | hook テスト |
| Create | `tests/small/lib/validations/pomodoro.test.ts` | バリデーションテスト |

### PBI 4: 教材詳細の手法選択 UI

| Action | Path | Responsibility |
|--------|------|----------------|
| Create | `src/components/method-select-list.tsx` | 手法カード一覧 + セッション開始 |
| Modify | `src/app/(main)/materials/[id]/page.tsx` | StartSessionButton → MethodSelectList に置換 |
| Modify | `src/lib/constants.ts` | METHOD_DESCRIPTIONS に elaboration/pomodoro の説明追加 |

---

## Task 1: Active Recall 削除マイグレーション

**Files:**
- Create: `supabase/migrations/00012_remove_active_recall.sql`
- Modify: `supabase/seeds/01_master.sql`

- [ ] **Step 1: マイグレーション SQL を作成**

```sql
-- supabase/migrations/00012_remove_active_recall.sql
-- active_recall を srs に統合し、learning_methods から完全削除する

DO $$
DECLARE
  v_srs_id UUID;
  v_ar_id UUID;
BEGIN
  SELECT id INTO v_srs_id FROM learning_methods WHERE slug = 'srs';
  SELECT id INTO v_ar_id FROM learning_methods WHERE slug = 'active_recall';

  -- active_recall を参照している material_methods を srs に移行
  -- ON CONFLICT: 同一教材に srs と active_recall 両方ある場合は active_recall 側を削除
  DELETE FROM material_methods
  WHERE method_id = v_ar_id
    AND material_id IN (
      SELECT material_id FROM material_methods WHERE method_id = v_srs_id
    );

  UPDATE material_methods SET method_id = v_srs_id WHERE method_id = v_ar_id;

  -- sessions, daily_logs の method_id も移行
  UPDATE sessions SET method_id = v_srs_id WHERE method_id = v_ar_id;
  UPDATE daily_logs SET method_id = v_srs_id WHERE method_id = v_ar_id;

  -- learning_methods から active_recall を削除
  DELETE FROM learning_methods WHERE slug = 'active_recall';
END;
$$;
```

- [ ] **Step 2: seed データから active_recall を削除**

`supabase/seeds/01_master.sql` を以下に変更:

```sql
-- Master data: learning methods
INSERT INTO learning_methods (slug, name, category, default_config, is_system) VALUES
  ('srs', '間隔反復 (FSRS)', 'memory', '{"initial_stability": 1.0, "initial_difficulty": 5.0}', true),
  ('interleaving', 'インターリービング', 'comprehension', '{"shuffle": true}', true),
  ('elaboration', '精緻化', 'comprehension', '{}', true),
  ('pomodoro', 'ポモドーロ', 'focus', '{"work_minutes": 25, "break_minutes": 5}', true),
  ('wakeful_rest', '覚醒的休息', 'consolidation', '{"default_minutes": 10}', true),
  ('free_study', '自由学習', 'general', '{}', true)
ON CONFLICT (slug) DO NOTHING;
```

- [ ] **Step 3: コミット**

```bash
git add supabase/migrations/00012_remove_active_recall.sql supabase/seeds/01_master.sql
git commit -m "fix: active_recall を srs に統合するマイグレーション (#00012)"
```

---

## Task 2: constants.ts から active_recall を削除

**Files:**
- Modify: `src/lib/constants.ts`
- Modify: `tests/small/lib/constants.test.ts`

- [ ] **Step 1: テストを修正 (Red)**

`tests/small/lib/constants.test.ts` の既存テストを更新:

```typescript
// MATERIAL_METHOD_SLUGS テスト: active_recall を削除、3 手法に変更
describe("MATERIAL_METHOD_SLUGS", () => {
  it("ウィザードで選択可能な学習手法スラッグを含む", () => {
    expect(MATERIAL_METHOD_SLUGS).toContain("srs");
    expect(MATERIAL_METHOD_SLUGS).toContain("elaboration");
    expect(MATERIAL_METHOD_SLUGS).toContain("pomodoro");
  });

  it("3つの手法のみ含む", () => {
    expect(MATERIAL_METHOD_SLUGS).toHaveLength(3);
  });
});

// CARD_BASED_SLUGS テスト: active_recall を削除、2 手法に変更
describe("CARD_BASED_SLUGS", () => {
  it("srs を含む", () => {
    expect(CARD_BASED_SLUGS).toContain("srs");
  });

  it("interleaving を含む", () => {
    expect(CARD_BASED_SLUGS).toContain("interleaving");
  });

  it("2 つの手法のみ含む", () => {
    expect(CARD_BASED_SLUGS).toHaveLength(2);
  });
});

// METHOD_CATEGORIES テスト: memory カテゴリから active_recall を削除
it("memoryカテゴリにsrsが含まれる", () => {
  expect(METHOD_CATEGORIES.memory.slugs).toContain("srs");
  expect(METHOD_CATEGORIES.memory.slugs).toHaveLength(1);
});
```

- [ ] **Step 2: テスト実行で失敗を確認**

Run: `bun test:small tests/small/lib/constants.test.ts`
Expected: FAIL (MATERIAL_METHOD_SLUGS has 4 items, CARD_BASED_SLUGS has 3 items)

- [ ] **Step 3: constants.ts を修正**

`src/lib/constants.ts` の変更:

```typescript
// MATERIAL_METHOD_SLUGS: active_recall を削除
export const MATERIAL_METHOD_SLUGS = [
  "srs",
  "elaboration",
  "pomodoro",
] as const;

// CARD_BASED_SLUGS: active_recall を削除
export const CARD_BASED_SLUGS = ["srs", "interleaving"] as const;

// METHOD_CATEGORIES.memory: active_recall を削除
memory: {
  label: "記憶",
  slugs: ["srs"],
},

// METHOD_DESCRIPTIONS: active_recall を削除
export const METHOD_DESCRIPTIONS: Record<string, string> = {
  srs: "間隔を空けて復習し、長期記憶に定着させる",
  elaboration: "「なぜ?」を問い、自分の言葉で説明する",
  pomodoro: "25分集中 + 5分休憩のサイクルで学習する",
};
```

- [ ] **Step 4: テスト実行で成功を確認**

Run: `bun test:small tests/small/lib/constants.test.ts`
Expected: PASS

- [ ] **Step 5: コミット**

```bash
git add src/lib/constants.ts tests/small/lib/constants.test.ts
git commit -m "refactor: constants から active_recall を削除"
```

---

## Task 3: セッションページに method.slug 分岐ルーターを実装

**Files:**
- Modify: `src/app/session/[id]/page.tsx`
- Modify: `src/lib/actions/sessions.ts` (getSessionInfo 追加)
- Create: `src/lib/types/sessions.ts` に SessionInfo 型追加

- [ ] **Step 1: getSessionInfo アクションを追加**

`src/lib/actions/sessions.ts` に追加:

```typescript
export type SessionInfo = {
  id: string;
  methodSlug: string;
  materialId: string | null;
};

export async function getSessionInfo(sessionId: string): Promise<SessionInfo | null> {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return null;

  const { data: session } = await supabase
    .from("sessions")
    .select("id, material_id, learning_methods(slug)")
    .eq("id", sessionId)
    .eq("user_id", user.id)
    .eq("status", "in_progress")
    .single();

  if (!session) return null;

  const method = session.learning_methods as unknown as { slug: string } | null;

  return {
    id: session.id,
    methodSlug: method?.slug ?? "srs",
    materialId: session.material_id,
  };
}
```

- [ ] **Step 2: session page.tsx を分岐ルーターに変更**

`src/app/session/[id]/page.tsx`:

```typescript
import { notFound } from "next/navigation";
import { getSessionInfo, getSessionCards } from "@/lib/actions/sessions";
import { SessionPlayer } from "./session-player";

type Props = {
  params: Promise<{ id: string }>;
};

export default async function SessionPage({ params }: Props) {
  const { id } = await params;
  const info = await getSessionInfo(id);

  if (!info) {
    notFound();
  }

  switch (info.methodSlug) {
    case "pomodoro":
      // PBI 3 で PomodoroPlayer を実装後に動的 import に置換する
      return <p>Pomodoro session (coming soon)</p>;

    case "elaboration": {
      // PBI 2 で ElaborationPlayer を実装後に動的 import に置換する
      const cards = await getSessionCards(id);
      if (cards.length === 0) notFound();
      return <p>Elaboration session (coming soon)</p>;
    }

    default: {
      // SRS (default) — 既存の CardSessionPlayer
      const cards = await getSessionCards(id);
      if (cards.length === 0) notFound();
      return <SessionPlayer sessionId={id} cards={cards} />;
    }
  }
}
```

- [ ] **Step 3: テスト実行**

Run: `bun typecheck && bun test:small`
Expected: PASS

- [ ] **Step 4: コミット**

```bash
git add src/app/session/\[id\]/page.tsx src/lib/actions/sessions.ts
git commit -m "feat: セッションページに method.slug 分岐ルーターを実装"
```

---

## Task 4: Elaboration hook (use-elaboration-player)

**Files:**
- Create: `src/app/session/[id]/use-elaboration-player.ts`
- Create: `tests/small/app/session/use-elaboration-player.test.ts`

- [ ] **Step 1: テストを作成 (Red)**

`tests/small/app/session/use-elaboration-player.test.ts`:

```typescript
import { describe, it, expect } from "vitest";
import { renderHook, act } from "@testing-library/react";
import { useElaborationPlayer } from "@/app/session/[id]/use-elaboration-player";
import type { SessionCard } from "@/lib/types/sessions";

const cards: SessionCard[] = [
  { id: "card-1", front: "Q1", back: "A1", display_order: 1 },
  { id: "card-2", front: "Q2", back: "A2", display_order: 2 },
];

describe("useElaborationPlayer", () => {
  it("starts with first card, not revealed, empty text", () => {
    const { result } = renderHook(() => useElaborationPlayer(cards));
    expect(result.current.currentCard?.id).toBe("card-1");
    expect(result.current.isRevealed).toBe(false);
    expect(result.current.text).toBe("");
  });

  it("setText updates the current elaboration text", () => {
    const { result } = renderHook(() => useElaborationPlayer(cards));
    act(() => result.current.setText("my explanation"));
    expect(result.current.text).toBe("my explanation");
  });

  it("reveal shows the back of the card", () => {
    const { result } = renderHook(() => useElaborationPlayer(cards));
    act(() => result.current.setText("explanation"));
    act(() => result.current.reveal());
    expect(result.current.isRevealed).toBe(true);
  });

  it("rate advances to next card and resets state", () => {
    const { result } = renderHook(() => useElaborationPlayer(cards));
    act(() => result.current.setText("explanation"));
    act(() => result.current.reveal());
    act(() => result.current.rate(3));
    expect(result.current.currentCard?.id).toBe("card-2");
    expect(result.current.isRevealed).toBe(false);
    expect(result.current.text).toBe("");
  });

  it("records review with card_id, rating, and timestamps", () => {
    const { result } = renderHook(() => useElaborationPlayer(cards));
    act(() => result.current.setText("explanation"));
    act(() => result.current.reveal());
    act(() => result.current.rate(3));
    expect(result.current.reviews).toHaveLength(1);
    expect(result.current.reviews[0].card_id).toBe("card-1");
    expect(result.current.reviews[0].rating).toBe(3);
  });

  it("records elaboration text per card", () => {
    const { result } = renderHook(() => useElaborationPlayer(cards));
    act(() => result.current.setText("first explanation"));
    act(() => result.current.reveal());
    act(() => result.current.rate(3));
    expect(result.current.elaborations).toHaveLength(1);
    expect(result.current.elaborations[0]).toEqual({
      card_id: "card-1",
      text: "first explanation",
    });
  });

  it("isComplete becomes true after all cards are rated", () => {
    const { result } = renderHook(() => useElaborationPlayer(cards));
    // Card 1
    act(() => result.current.setText("e1"));
    act(() => result.current.reveal());
    act(() => result.current.rate(3));
    // Card 2
    act(() => result.current.setText("e2"));
    act(() => result.current.reveal());
    act(() => result.current.rate(4));
    expect(result.current.isComplete).toBe(true);
    expect(result.current.reviews).toHaveLength(2);
    expect(result.current.elaborations).toHaveLength(2);
  });

  it("progress shows current/total correctly", () => {
    const { result } = renderHook(() => useElaborationPlayer(cards));
    expect(result.current.progress).toEqual({ current: 1, total: 2 });
    act(() => result.current.setText("e1"));
    act(() => result.current.reveal());
    act(() => result.current.rate(3));
    expect(result.current.progress).toEqual({ current: 2, total: 2 });
  });
});
```

- [ ] **Step 2: テスト実行で失敗を確認**

Run: `bun test:small tests/small/app/session/use-elaboration-player.test.ts`
Expected: FAIL (module not found)

- [ ] **Step 3: hook を実装**

`src/app/session/[id]/use-elaboration-player.ts`:

```typescript
"use client";

import { useState, useRef, useCallback } from "react";
import type { CardReview, SessionCard } from "@/lib/types/sessions";

type Elaboration = {
  card_id: string;
  text: string;
};

type Progress = {
  current: number;
  total: number;
};

export type ElaborationPlayerState = {
  currentCard: SessionCard | undefined;
  isRevealed: boolean;
  isComplete: boolean;
  text: string;
  setText: (text: string) => void;
  reveal: () => void;
  rate: (rating: 1 | 2 | 3 | 4) => void;
  progress: Progress;
  reviews: CardReview[];
  elaborations: Elaboration[];
};

export function useElaborationPlayer(cards: SessionCard[]): ElaborationPlayerState {
  const [currentIndex, setCurrentIndex] = useState(0);
  const [isRevealed, setIsRevealed] = useState(false);
  const [text, setText] = useState("");
  const [reviews, setReviews] = useState<CardReview[]>([]);
  const [elaborations, setElaborations] = useState<Elaboration[]>([]);
  const cardStartedAt = useRef(new Date().toISOString());
  const currentIndexRef = useRef(0);

  const currentCard = cards[currentIndex];
  const isComplete = currentIndex >= cards.length;

  const reveal = useCallback(() => {
    setIsRevealed(true);
  }, []);

  const rate = useCallback(
    (rating: 1 | 2 | 3 | 4) => {
      const idx = currentIndexRef.current;
      if (idx >= cards.length) return;

      const review: CardReview = {
        card_id: cards[idx].id,
        rating,
        started_at: cardStartedAt.current,
        answered_at: new Date().toISOString(),
      };

      const elaboration: Elaboration = {
        card_id: cards[idx].id,
        text,
      };

      currentIndexRef.current = idx + 1;
      setReviews((prev) => [...prev, review]);
      setElaborations((prev) => [...prev, elaboration]);
      setCurrentIndex(idx + 1);
      setIsRevealed(false);
      setText("");
      cardStartedAt.current = new Date().toISOString();
    },
    [cards, text],
  );

  return {
    currentCard,
    isRevealed,
    isComplete,
    text,
    setText,
    reveal,
    rate,
    progress: { current: Math.min(currentIndex + 1, cards.length), total: cards.length },
    reviews,
    elaborations,
  };
}
```

- [ ] **Step 4: テスト実行で成功を確認**

Run: `bun test:small tests/small/app/session/use-elaboration-player.test.ts`
Expected: PASS (8 tests)

- [ ] **Step 5: コミット**

```bash
git add src/app/session/\[id\]/use-elaboration-player.ts tests/small/app/session/use-elaboration-player.test.ts
git commit -m "feat: useElaborationPlayer hook を実装"
```

---

## Task 5: Elaboration UI コンポーネント + バリデーション + Server Action

**Files:**
- Create: `src/app/session/[id]/elaboration-player.tsx`
- Create: `src/lib/validations/elaboration.ts`
- Create: `tests/small/lib/validations/elaboration.test.ts`
- Modify: `src/lib/actions/sessions.ts`
- Modify: `src/app/session/[id]/page.tsx`

- [ ] **Step 1: バリデーションスキーマのテストを作成 (Red)**

`tests/small/lib/validations/elaboration.test.ts`:

```typescript
import { describe, it, expect } from "vitest";
import { completeElaborationSchema } from "@/lib/validations/elaboration";

const VALID_UUID = "550e8400-e29b-41d4-a716-446655440000";

const validReview = {
  card_id: VALID_UUID,
  rating: 3,
  started_at: "2026-04-06T10:00:00.000Z",
  answered_at: "2026-04-06T10:00:30.000Z",
};

const validElaboration = {
  card_id: VALID_UUID,
  text: "this is my explanation",
};

describe("completeElaborationSchema", () => {
  const valid = {
    sessionId: VALID_UUID,
    reviews: [validReview],
    elaborations: [validElaboration],
    selfRating: 3,
  };

  it("accepts valid data", () => {
    expect(completeElaborationSchema.safeParse(valid).success).toBe(true);
  });

  it("rejects empty reviews", () => {
    expect(completeElaborationSchema.safeParse({ ...valid, reviews: [] }).success).toBe(false);
  });

  it("rejects empty elaborations", () => {
    expect(completeElaborationSchema.safeParse({ ...valid, elaborations: [] }).success).toBe(false);
  });

  it("rejects selfRating 0", () => {
    expect(completeElaborationSchema.safeParse({ ...valid, selfRating: 0 }).success).toBe(false);
  });

  it("rejects selfRating 5", () => {
    expect(completeElaborationSchema.safeParse({ ...valid, selfRating: 5 }).success).toBe(false);
  });

  it("accepts elaboration with empty text", () => {
    const data = { ...valid, elaborations: [{ card_id: VALID_UUID, text: "" }] };
    expect(completeElaborationSchema.safeParse(data).success).toBe(true);
  });
});
```

- [ ] **Step 2: テスト実行で失敗を確認**

Run: `bun test:small tests/small/lib/validations/elaboration.test.ts`
Expected: FAIL (module not found)

- [ ] **Step 3: バリデーションスキーマを実装**

`src/lib/validations/elaboration.ts`:

```typescript
import { z } from "zod";
import { cardReviewSchema } from "./sessions";

export { type ActionResult, extractFieldErrors } from "./materials";

export const elaborationSchema = z.object({
  card_id: z.uuid("無効なカードIDです"),
  text: z.string(),
});

export const completeElaborationSchema = z.object({
  sessionId: z.uuid("無効なセッションIDです"),
  reviews: z.array(cardReviewSchema).min(1, "レビューが空です").max(500, "レビューは500件以内です"),
  elaborations: z.array(elaborationSchema).min(1, "精緻化テキストが空です"),
  selfRating: z.number().int().min(1, "評価は1以上です").max(4, "評価は4以下です"),
});

export type ElaborationInput = z.infer<typeof elaborationSchema>;
export type CompleteElaborationInput = z.infer<typeof completeElaborationSchema>;
```

- [ ] **Step 4: テスト実行で成功を確認**

Run: `bun test:small tests/small/lib/validations/elaboration.test.ts`
Expected: PASS (6 tests)

- [ ] **Step 5: completeElaborationSession Server Action を実装**

`src/lib/actions/sessions.ts` に追加:

```typescript
import {
  completeElaborationSchema,
  type ElaborationInput,
} from "@/lib/validations/elaboration";

export async function completeElaborationSession(
  sessionId: string,
  reviews: CardReview[],
  elaborations: ElaborationInput[],
  selfRating: number,
): Promise<ActionResult<undefined>> {
  const parsed = completeElaborationSchema.safeParse({ sessionId, reviews, elaborations, selfRating });
  if (!parsed.success) {
    return { success: false, error: "入力内容を確認してください" };
  }

  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { success: false, error: "認証が必要です" };

  const { data: session } = await supabase
    .from("sessions")
    .select("id, started_at, status")
    .eq("id", parsed.data.sessionId)
    .eq("user_id", user.id)
    .single();

  if (!session) return { success: false, error: "セッションが見つかりません" };
  if (session.status !== "in_progress") {
    return { success: false, error: "このセッションは既に完了しています" };
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

  if (updateError) return { success: false, error: "セッションの更新に失敗しました" };

  // Edge Function で card_reviews + daily_logs を記録 (FSRS はスキップ)
  const fnResult = await supabase.functions.invoke("complete-session", {
    body: {
      session_id: parsed.data.sessionId,
      reviews: parsed.data.reviews,
    },
  });

  if (fnResult.error) {
    const { error: compensationError } = await supabase
      .from("sessions")
      .update({ status: "in_progress", ended_at: null, self_rating: null, duration_sec: 0, meta: null })
      .eq("id", parsed.data.sessionId);
    if (compensationError) {
      console.error(
        `completeElaborationSession compensation failed for session ${parsed.data.sessionId}:`,
        compensationError,
      );
    }
    return { success: false, error: "カードレビューの処理に失敗しました" };
  }

  revalidatePath("/");
  return { success: true, data: undefined };
}
```

- [ ] **Step 6: ElaborationPlayer コンポーネントを実装**

`src/app/session/[id]/elaboration-player.tsx`:

```typescript
"use client";

import { useEffect } from "react";
import { useRouter } from "next/navigation";
import { useElaborationPlayer } from "./use-elaboration-player";
import { RATING_LABELS, RATING_COLORS } from "@/lib/constants";
import type { SessionCard } from "@/lib/types/sessions";

type Props = {
  sessionId: string;
  cards: SessionCard[];
};

const RATINGS = [1, 2, 3, 4] as const;

export function ElaborationPlayer({ sessionId, cards }: Props) {
  const router = useRouter();
  const {
    currentCard,
    isRevealed,
    isComplete,
    text,
    setText,
    reveal,
    rate,
    progress,
    reviews,
    elaborations,
  } = useElaborationPlayer(cards);

  useEffect(() => {
    if (!isComplete) return;
    sessionStorage.setItem(
      `session-reviews-${sessionId}`,
      JSON.stringify(reviews),
    );
    sessionStorage.setItem(
      `session-elaborations-${sessionId}`,
      JSON.stringify(elaborations),
    );
    router.push(`/session/${sessionId}/review`);
  }, [isComplete, sessionId, reviews, elaborations, router]);

  if (!currentCard) return null;

  return (
    <div className="flex min-h-dvh flex-col">
      <header className="border-b px-4 py-3">
        <p className="text-sm text-muted-foreground">
          {progress.current} / {progress.total}
        </p>
      </header>

      <main className="flex flex-1 flex-col px-4 py-6">
        <div className="mx-auto w-full max-w-lg space-y-4">
          <div className="rounded-lg border p-6" aria-live="polite" aria-atomic="true">
            <p className="sr-only">{isRevealed ? "カード裏面" : "カード表面"}</p>
            <p className="text-lg whitespace-pre-wrap">{currentCard.front}</p>
            {isRevealed && (
              <>
                <hr className="my-4" />
                <p className="text-lg whitespace-pre-wrap">{currentCard.back}</p>
              </>
            )}
          </div>

          {!isRevealed && (
            <div className="space-y-2">
              <label htmlFor="elaboration-text" className="text-sm font-medium text-muted-foreground">
                なぜそうなるか、自分の言葉で説明してください
              </label>
              <textarea
                id="elaboration-text"
                value={text}
                onChange={(e) => setText(e.target.value)}
                className="w-full rounded-lg border bg-background p-3 text-sm focus:outline-none focus:ring-2 focus:ring-primary"
                rows={4}
                placeholder="ここに説明を入力..."
              />
            </div>
          )}
        </div>
      </main>

      <footer className="border-t px-4 py-4">
        {!isRevealed ? (
          <button
            type="button"
            onClick={reveal}
            className="w-full rounded-lg bg-primary py-3 text-primary-foreground"
          >
            回答を確認
          </button>
        ) : (
          <div className="grid grid-cols-4 gap-2">
            {RATINGS.map((r) => (
              <button
                key={r}
                type="button"
                onClick={() => rate(r)}
                className={`rounded-lg py-3 text-sm font-medium text-white ${RATING_COLORS[r]}`}
              >
                {RATING_LABELS[r]}
              </button>
            ))}
          </div>
        )}
      </footer>
    </div>
  );
}
```

- [ ] **Step 7: page.tsx の elaboration 分岐を ElaborationPlayer に接続**

`src/app/session/[id]/page.tsx` の elaboration ケースを更新:

```typescript
import { ElaborationPlayer } from "./elaboration-player";

// switch 内の elaboration ケース:
case "elaboration": {
  const cards = await getSessionCards(id);
  if (cards.length === 0) notFound();
  return <ElaborationPlayer sessionId={id} cards={cards} />;
}
```

- [ ] **Step 8: typecheck + テスト実行**

Run: `bun typecheck && bun test:small`
Expected: PASS

- [ ] **Step 9: コミット**

```bash
git add src/app/session/\[id\]/elaboration-player.tsx src/lib/validations/elaboration.ts tests/small/lib/validations/elaboration.test.ts src/lib/actions/sessions.ts src/app/session/\[id\]/page.tsx
git commit -m "feat: Elaboration セッション UI + Server Action を実装"
```

---

## Task 6: Edge Function に method.slug 分岐を追加

**Files:**
- Modify: `supabase/functions/complete-session/index.ts`

- [ ] **Step 1: Edge Function で method.slug を取得し分岐**

`supabase/functions/complete-session/index.ts` を修正。セッション取得クエリに `learning_methods(slug)` を JOIN し、slug に応じて FSRS 計算をスキップする。

session 取得部分 (line 55-59) を変更:

```typescript
  const { data: session, error: sessionError } = await supabase
    .from("sessions")
    .select("material_id, method_id, user_id, duration_sec, learning_methods(slug)")
    .eq("id", session_id)
    .single();
```

FSRS 計算部分 (line 87-172) を条件付きに:

```typescript
  const methodSlug = (session.learning_methods as { slug: string } | null)?.slug ?? "srs";

  // SRS のみ FSRS 計算 + srs_states 更新を実行する
  if (methodSlug === "srs") {
    // ... 既存の FSRS 計算ロジック (line 87-164 をそのまま維持)
    // ... complete_session_reviews RPC 呼び出し (line 166-172 をそのまま維持)
  } else {
    // Elaboration: card_reviews のみ INSERT (FSRS なし)
    const { error: reviewError } = await supabase.rpc("complete_session_reviews", {
      p_session_id: session_id,
      p_user_id: callerId,
      p_reviews: reviewRows,
      p_srs_states: [],
    });

    if (reviewError) {
      return jsonError(
        `complete_session_reviews failed: ${reviewError.message}`,
        500,
      );
    }
  }
```

daily_logs 部分は変更なし (material_id があれば記録する、既存ロジックで正しい)。

- [ ] **Step 2: テスト実行**

Run: `bun typecheck`
Expected: PASS (Edge Function は Deno なので bun test は対象外)

- [ ] **Step 3: コミット**

```bash
git add supabase/functions/complete-session/index.ts
git commit -m "feat: Edge Function に method.slug 分岐を追加 (Elaboration は FSRS スキップ)"
```

---

## Task 7: Pomodoro 定数 + タイマー hook

**Files:**
- Modify: `src/lib/constants.ts`
- Create: `src/app/session/[id]/use-pomodoro-timer.ts`
- Create: `tests/small/app/session/use-pomodoro-timer.test.ts`

- [ ] **Step 1: テストを作成 (Red)**

`tests/small/app/session/use-pomodoro-timer.test.ts`:

```typescript
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { renderHook, act } from "@testing-library/react";
import { usePomodoroTimer } from "@/app/session/[id]/use-pomodoro-timer";

beforeEach(() => {
  vi.useFakeTimers();
});

afterEach(() => {
  vi.useRealTimers();
});

describe("usePomodoroTimer", () => {
  it("starts in focus phase with full time", () => {
    const { result } = renderHook(() => usePomodoroTimer(10, 5));
    expect(result.current.phase).toBe("focus");
    expect(result.current.remainingSeconds).toBe(10);
    expect(result.current.cycle).toBe(1);
  });

  it("counts down each second during focus", () => {
    const { result } = renderHook(() => usePomodoroTimer(10, 5));
    act(() => { vi.advanceTimersByTime(3000); });
    expect(result.current.remainingSeconds).toBe(7);
  });

  it("transitions to focus_complete when focus timer ends", () => {
    const { result } = renderHook(() => usePomodoroTimer(3, 2));
    act(() => { vi.advanceTimersByTime(3000); });
    expect(result.current.phase).toBe("focus_complete");
    expect(result.current.remainingSeconds).toBe(0);
  });

  it("startBreak transitions to break phase", () => {
    const { result } = renderHook(() => usePomodoroTimer(3, 2));
    act(() => { vi.advanceTimersByTime(3000); });
    act(() => { result.current.startBreak(); });
    expect(result.current.phase).toBe("break");
    expect(result.current.remainingSeconds).toBe(2);
  });

  it("transitions to break_complete when break timer ends", () => {
    const { result } = renderHook(() => usePomodoroTimer(3, 2));
    act(() => { vi.advanceTimersByTime(3000); });
    act(() => { result.current.startBreak(); });
    act(() => { vi.advanceTimersByTime(2000); });
    expect(result.current.phase).toBe("break_complete");
  });

  it("startNextCycle increments cycle and returns to focus", () => {
    const { result } = renderHook(() => usePomodoroTimer(3, 2));
    act(() => { vi.advanceTimersByTime(3000); });
    act(() => { result.current.startBreak(); });
    act(() => { vi.advanceTimersByTime(2000); });
    act(() => { result.current.startNextCycle(); });
    expect(result.current.phase).toBe("focus");
    expect(result.current.cycle).toBe(2);
    expect(result.current.remainingSeconds).toBe(3);
  });

  it("finish marks the session as done", () => {
    const { result } = renderHook(() => usePomodoroTimer(3, 2));
    act(() => { vi.advanceTimersByTime(3000); });
    act(() => { result.current.startBreak(); });
    act(() => { vi.advanceTimersByTime(2000); });
    act(() => { result.current.finish(); });
    expect(result.current.phase).toBe("done");
  });

  it("progress returns correct ratio during focus", () => {
    const { result } = renderHook(() => usePomodoroTimer(10, 5));
    act(() => { vi.advanceTimersByTime(5000); });
    expect(result.current.progress).toBeCloseTo(0.5);
  });

  it("totalFocusSec accumulates across cycles", () => {
    const { result } = renderHook(() => usePomodoroTimer(3, 2));
    // Cycle 1
    act(() => { vi.advanceTimersByTime(3000); });
    act(() => { result.current.startBreak(); });
    act(() => { vi.advanceTimersByTime(2000); });
    act(() => { result.current.startNextCycle(); });
    // Cycle 2
    act(() => { vi.advanceTimersByTime(3000); });
    expect(result.current.totalFocusSec).toBe(6);
  });
});
```

- [ ] **Step 2: テスト実行で失敗を確認**

Run: `bun test:small tests/small/app/session/use-pomodoro-timer.test.ts`
Expected: FAIL (module not found)

- [ ] **Step 3: constants.ts にポモドーロ定数を追加**

`src/lib/constants.ts` に追加:

```typescript
// 25分の集中と5分の休憩で1サイクル。認知負荷のリセットに効果的な比率
export const POMODORO_FOCUS_SEC = 1500;
export const POMODORO_BREAK_SEC = 300;
```

- [ ] **Step 4: hook を実装**

`src/app/session/[id]/use-pomodoro-timer.ts`:

```typescript
"use client";

import { useState, useEffect, useRef, useCallback } from "react";

type Phase = "focus" | "focus_complete" | "break" | "break_complete" | "done";

export type PomodoroTimerState = {
  phase: Phase;
  remainingSeconds: number;
  progress: number;
  cycle: number;
  totalFocusSec: number;
  totalBreakSec: number;
  startBreak: () => void;
  startNextCycle: () => void;
  finish: () => void;
};

export function usePomodoroTimer(
  focusSec: number,
  breakSec: number,
): PomodoroTimerState {
  const [phase, setPhase] = useState<Phase>("focus");
  const [remainingSeconds, setRemainingSeconds] = useState(focusSec);
  const [cycle, setCycle] = useState(1);
  const [totalFocusSec, setTotalFocusSec] = useState(0);
  const [totalBreakSec, setTotalBreakSec] = useState(0);
  const intervalRef = useRef<ReturnType<typeof setInterval> | null>(null);

  const isTimerActive = phase === "focus" || phase === "break";
  const currentPhaseDuration = phase === "break" ? breakSec : focusSec;
  const progress = isTimerActive ? remainingSeconds / currentPhaseDuration : 0;

  useEffect(() => {
    if (!isTimerActive) return;

    intervalRef.current = setInterval(() => {
      setRemainingSeconds((prev) => {
        const next = prev - 1;
        if (next <= 0) {
          if (intervalRef.current) clearInterval(intervalRef.current);
          if (phase === "focus") {
            setTotalFocusSec((t) => t + focusSec);
            setPhase("focus_complete");
          } else {
            setTotalBreakSec((t) => t + breakSec);
            setPhase("break_complete");
          }
          return 0;
        }
        return next;
      });
    }, 1000);

    return () => {
      if (intervalRef.current) clearInterval(intervalRef.current);
    };
  }, [isTimerActive, phase, focusSec, breakSec]);

  const startBreak = useCallback(() => {
    setPhase("break");
    setRemainingSeconds(breakSec);
  }, [breakSec]);

  const startNextCycle = useCallback(() => {
    setCycle((c) => c + 1);
    setPhase("focus");
    setRemainingSeconds(focusSec);
  }, [focusSec]);

  const finish = useCallback(() => {
    setPhase("done");
  }, []);

  return {
    phase,
    remainingSeconds,
    progress,
    cycle,
    totalFocusSec,
    totalBreakSec,
    startBreak,
    startNextCycle,
    finish,
  };
}
```

- [ ] **Step 5: テスト実行で成功を確認**

Run: `bun test:small tests/small/app/session/use-pomodoro-timer.test.ts`
Expected: PASS (9 tests)

- [ ] **Step 6: コミット**

```bash
git add src/lib/constants.ts src/app/session/\[id\]/use-pomodoro-timer.ts tests/small/app/session/use-pomodoro-timer.test.ts
git commit -m "feat: usePomodoroTimer hook + 定数を実装"
```

---

## Task 8: Pomodoro UI コンポーネント + バリデーション + Server Action

**Files:**
- Create: `src/app/session/[id]/pomodoro-player.tsx`
- Create: `src/lib/validations/pomodoro.ts`
- Create: `tests/small/lib/validations/pomodoro.test.ts`
- Modify: `src/lib/actions/sessions.ts`
- Modify: `src/app/session/[id]/page.tsx`

- [ ] **Step 1: バリデーションスキーマのテストを作成 (Red)**

`tests/small/lib/validations/pomodoro.test.ts`:

```typescript
import { describe, it, expect } from "vitest";
import { completePomodoroSchema } from "@/lib/validations/pomodoro";

const VALID_UUID = "550e8400-e29b-41d4-a716-446655440000";

describe("completePomodoroSchema", () => {
  const valid = {
    sessionId: VALID_UUID,
    selfRating: 3,
    pomodorosCompleted: 2,
    totalFocusSec: 3000,
    totalBreakSec: 600,
  };

  it("accepts valid data", () => {
    expect(completePomodoroSchema.safeParse(valid).success).toBe(true);
  });

  it("rejects pomodorosCompleted 0", () => {
    expect(completePomodoroSchema.safeParse({ ...valid, pomodorosCompleted: 0 }).success).toBe(false);
  });

  it("rejects negative totalFocusSec", () => {
    expect(completePomodoroSchema.safeParse({ ...valid, totalFocusSec: -1 }).success).toBe(false);
  });

  it("rejects selfRating 0", () => {
    expect(completePomodoroSchema.safeParse({ ...valid, selfRating: 0 }).success).toBe(false);
  });

  it("rejects selfRating 5", () => {
    expect(completePomodoroSchema.safeParse({ ...valid, selfRating: 5 }).success).toBe(false);
  });
});
```

- [ ] **Step 2: テスト実行で失敗を確認**

Run: `bun test:small tests/small/lib/validations/pomodoro.test.ts`
Expected: FAIL (module not found)

- [ ] **Step 3: バリデーションスキーマを実装**

`src/lib/validations/pomodoro.ts`:

```typescript
import { z } from "zod";

export const completePomodoroSchema = z.object({
  sessionId: z.uuid("無効なセッションIDです"),
  selfRating: z.number().int().min(1, "評価は1以上です").max(4, "評価は4以下です"),
  pomodorosCompleted: z.number().int().min(1, "最低1サイクル必要です"),
  totalFocusSec: z.number().int().min(0),
  totalBreakSec: z.number().int().min(0),
});

export type CompletePomodoroInput = z.infer<typeof completePomodoroSchema>;
```

- [ ] **Step 4: テスト実行で成功を確認**

Run: `bun test:small tests/small/lib/validations/pomodoro.test.ts`
Expected: PASS (5 tests)

- [ ] **Step 5: completePomodoroSession Server Action を実装**

`src/lib/actions/sessions.ts` に追加:

```typescript
import { completePomodoroSchema } from "@/lib/validations/pomodoro";

export async function completePomodoroSession(
  sessionId: string,
  selfRating: number,
  pomodorosCompleted: number,
  totalFocusSec: number,
  totalBreakSec: number,
): Promise<ActionResult<undefined>> {
  const parsed = completePomodoroSchema.safeParse({
    sessionId, selfRating, pomodorosCompleted, totalFocusSec, totalBreakSec,
  });
  if (!parsed.success) {
    return { success: false, error: "入力内容を確認してください" };
  }

  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { success: false, error: "認証が必要です" };

  const { data: session } = await supabase
    .from("sessions")
    .select("id, started_at, status, material_id, method_id")
    .eq("id", parsed.data.sessionId)
    .eq("user_id", user.id)
    .single();

  if (!session) return { success: false, error: "セッションが見つかりません" };
  if (session.status !== "in_progress") {
    return { success: false, error: "このセッションは既に完了しています" };
  }

  const durationSec = parsed.data.totalFocusSec + parsed.data.totalBreakSec;

  const { error: updateError } = await supabase
    .from("sessions")
    .update({
      status: "completed",
      duration_sec: durationSec,
      self_rating: parsed.data.selfRating,
      ended_at: new Date().toISOString(),
      meta: {
        pomodoros_completed: parsed.data.pomodorosCompleted,
        total_focus_sec: parsed.data.totalFocusSec,
        total_break_sec: parsed.data.totalBreakSec,
      },
    })
    .eq("id", parsed.data.sessionId);

  if (updateError) return { success: false, error: "セッションの更新に失敗しました" };

  // Pomodoro は card_reviews がないため Edge Function を呼ばず、直接 daily_logs を記録する
  if (session.material_id) {
    const { data: material } = await supabase
      .from("materials")
      .select("subject_id")
      .eq("id", session.material_id)
      .single();

    if (material) {
      const JST_OFFSET_MS = 9 * 60 * 60 * 1000;
      const logDate = new Date(Date.now() + JST_OFFSET_MS)
        .toISOString()
        .split("T")[0];

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

- [ ] **Step 6: PomodoroPlayer コンポーネントを実装**

`src/app/session/[id]/pomodoro-player.tsx`:

```typescript
"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { usePomodoroTimer } from "./use-pomodoro-timer";
import { completePomodoroSession } from "@/lib/actions/sessions";
import { POMODORO_FOCUS_SEC, POMODORO_BREAK_SEC, SELF_RATING_LABELS } from "@/lib/constants";
import { formatDuration } from "@/lib/session-utils";

const RATINGS = [1, 2, 3, 4] as const;

export function PomodoroPlayer({ sessionId }: { sessionId: string }) {
  const router = useRouter();
  const timer = usePomodoroTimer(POMODORO_FOCUS_SEC, POMODORO_BREAK_SEC);
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  const radius = 80;
  const circumference = 2 * Math.PI * radius;
  const strokeDashoffset = circumference * (1 - timer.progress);

  async function handleComplete(selfRating: 1 | 2 | 3 | 4) {
    setSubmitting(true);
    const result = await completePomodoroSession(
      sessionId,
      selfRating,
      timer.cycle,
      timer.totalFocusSec,
      timer.totalBreakSec,
    );
    if (result.success) {
      router.push(`/session/${sessionId}/summary`);
    } else {
      setError(result.error);
      setSubmitting(false);
    }
  }

  return (
    <div className="mx-auto flex min-h-dvh max-w-md flex-col items-center justify-center p-4">
      {timer.phase === "focus" && (
        <>
          <p className="mb-2 text-sm font-medium text-muted-foreground">
            サイクル {timer.cycle} - 集中
          </p>
          <svg width="200" height="200" className="-rotate-90">
            <circle cx="100" cy="100" r={radius} fill="none" stroke="currentColor" strokeWidth="8" className="text-muted" />
            <circle cx="100" cy="100" r={radius} fill="none" stroke="currentColor" strokeWidth="8"
              strokeDasharray={circumference} strokeDashoffset={strokeDashoffset} strokeLinecap="round"
              className="text-primary transition-all duration-1000" />
          </svg>
          <p className="mt-4 text-3xl font-bold tabular-nums">{formatDuration(timer.remainingSeconds)}</p>
          <p className="mt-2 text-sm text-muted-foreground">集中タイマー</p>
        </>
      )}

      {timer.phase === "focus_complete" && (
        <div className="text-center space-y-4">
          <h1 className="text-xl font-semibold">集中完了</h1>
          <p className="text-sm text-muted-foreground">お疲れさまでした。休憩を取りましょう。</p>
          <button type="button" onClick={timer.startBreak}
            className="rounded-lg bg-primary px-6 py-3 font-medium text-primary-foreground">
            5分休憩を開始
          </button>
        </div>
      )}

      {timer.phase === "break" && (
        <>
          <p className="mb-2 text-sm font-medium text-muted-foreground">
            サイクル {timer.cycle} - 休憩
          </p>
          <svg width="200" height="200" className="-rotate-90">
            <circle cx="100" cy="100" r={radius} fill="none" stroke="currentColor" strokeWidth="8" className="text-muted" />
            <circle cx="100" cy="100" r={radius} fill="none" stroke="currentColor" strokeWidth="8"
              strokeDasharray={circumference} strokeDashoffset={strokeDashoffset} strokeLinecap="round"
              className="text-primary transition-all duration-1000" />
          </svg>
          <p className="mt-4 text-3xl font-bold tabular-nums">{formatDuration(timer.remainingSeconds)}</p>
          <p className="mt-2 text-sm text-muted-foreground">休憩タイマー</p>
        </>
      )}

      {timer.phase === "break_complete" && (
        <div className="text-center space-y-4">
          <h1 className="text-xl font-semibold">休憩完了</h1>
          <p className="text-sm text-muted-foreground">
            {timer.cycle} サイクル完了。続けますか?
          </p>
          <div className="flex gap-3 justify-center">
            <button type="button" onClick={timer.startNextCycle}
              className="rounded-lg bg-primary px-6 py-3 font-medium text-primary-foreground">
              もう1サイクル
            </button>
            <button type="button" onClick={timer.finish}
              className="rounded-lg bg-muted px-6 py-3 font-medium hover:bg-muted/80">
              終了する
            </button>
          </div>
        </div>
      )}

      {timer.phase === "done" && (
        <div className="text-center space-y-4">
          <h1 className="text-xl font-semibold">学習の振り返り</h1>
          <p className="text-sm text-muted-foreground">
            {timer.cycle} サイクル / {formatDuration(timer.totalFocusSec)} 集中
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

- [ ] **Step 7: page.tsx の pomodoro 分岐を PomodoroPlayer に接続**

`src/app/session/[id]/page.tsx` の pomodoro ケースを更新:

```typescript
import { PomodoroPlayer } from "./pomodoro-player";

// switch 内の pomodoro ケース:
case "pomodoro":
  return <PomodoroPlayer sessionId={id} />;
```

- [ ] **Step 8: typecheck + テスト実行**

Run: `bun typecheck && bun test:small`
Expected: PASS

- [ ] **Step 9: コミット**

```bash
git add src/app/session/\[id\]/pomodoro-player.tsx src/lib/validations/pomodoro.ts tests/small/lib/validations/pomodoro.test.ts src/lib/actions/sessions.ts src/app/session/\[id\]/page.tsx
git commit -m "feat: Pomodoro セッション UI + Server Action を実装"
```

---

## Task 9: 教材詳細ページの手法選択 UI

**Files:**
- Create: `src/components/method-select-list.tsx`
- Modify: `src/app/(main)/materials/[id]/page.tsx`

- [ ] **Step 1: MethodSelectList コンポーネントを実装**

`src/components/method-select-list.tsx`:

```typescript
"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { createSession } from "@/lib/actions/sessions";
import { METHOD_DESCRIPTIONS } from "@/lib/constants";
import type { LearningMethod } from "@/lib/types/materials";

type Props = {
  materialId: string;
  methods: LearningMethod[];
  dueCounts?: Record<string, number>;
};

export function MethodSelectList({ materialId, methods, dueCounts }: Props) {
  const router = useRouter();
  const [loading, setLoading] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  async function handleSelect(methodId: string) {
    setLoading(methodId);
    setError(null);
    const result = await createSession(materialId, methodId);
    if (result.success) {
      router.push(`/session/${result.data.id}`);
    } else {
      setError(result.error);
      setLoading(null);
    }
  }

  return (
    <div className="space-y-2">
      {methods.map((method) => {
        const dueCount = dueCounts?.[method.id];
        const description = METHOD_DESCRIPTIONS[method.slug] ?? method.name;

        return (
          <button
            key={method.id}
            type="button"
            onClick={() => void handleSelect(method.id)}
            disabled={loading !== null}
            className="flex w-full items-center justify-between rounded-lg border px-4 py-3 text-left hover:bg-muted disabled:opacity-50"
          >
            <div>
              <p className="text-sm font-medium">{method.name}</p>
              <p className="text-xs text-muted-foreground">{description}</p>
            </div>
            {dueCount !== undefined && dueCount > 0 && (
              <span className="rounded-full bg-primary px-2.5 py-0.5 text-xs font-medium text-primary-foreground">
                {dueCount}枚
              </span>
            )}
            {loading === method.id && (
              <span className="text-xs text-muted-foreground">...</span>
            )}
          </button>
        );
      })}
      {error && <p className="text-xs text-destructive">{error}</p>}
    </div>
  );
}
```

- [ ] **Step 2: 教材詳細ページで MethodSelectList を使用**

`src/app/(main)/materials/[id]/page.tsx` を修正:

1. `StartSessionButton` のインポートを `MethodSelectList` に置換
2. 教材に紐づく手法一覧を取得し、`MethodSelectList` に渡す
3. 手法が 1 つの場合は従来通り `StartSessionButton` を使用 (1 タップで開始)

具体的な変更箇所は教材詳細ページの「学習を始める」ボタン周辺。教材の `material_methods` から手法一覧を取得する必要があるため、`getMaterial` アクションが返すデータに手法一覧を含めるか、別途取得する。

- [ ] **Step 3: typecheck + テスト実行**

Run: `bun typecheck && bun test:small`
Expected: PASS

- [ ] **Step 4: コミット**

```bash
git add src/components/method-select-list.tsx src/app/\(main\)/materials/\[id\]/page.tsx
git commit -m "feat: 教材詳細ページに手法選択 UI を実装"
```

---

## Task 10: レビュー画面の Elaboration 対応

**Files:**
- Modify: `src/app/session/[id]/review/session-review.tsx`

- [ ] **Step 1: SessionReview を Elaboration に対応**

`session-review.tsx` で `sessionStorage` から `session-elaborations-{id}` を読み取り、`completeElaborationSession` を呼ぶ分岐を追加する。

手法の判定は sessionStorage にelaborations キーが存在するかどうかで行う:

```typescript
import { completeElaborationSession } from "@/lib/actions/sessions";

// handleRate 内:
const elaborationsJson = sessionStorage.getItem(`session-elaborations-${sessionId}`);
const elaborations = elaborationsJson ? JSON.parse(elaborationsJson) : null;

let result;
if (elaborations) {
  result = await completeElaborationSession(sessionId, reviews, elaborations, selfRating);
  sessionStorage.removeItem(`session-elaborations-${sessionId}`);
} else {
  result = await completeSession(sessionId, reviews, selfRating);
}
```

- [ ] **Step 2: typecheck + テスト実行**

Run: `bun typecheck && bun test:small`
Expected: PASS

- [ ] **Step 3: コミット**

```bash
git add src/app/session/\[id\]/review/session-review.tsx
git commit -m "feat: レビュー画面を Elaboration に対応"
```

---

## Task 11: サマリー画面の Pomodoro 対応

**Files:**
- Modify: `src/app/session/[id]/summary/page.tsx`

- [ ] **Step 1: サマリー画面で Pomodoro の場合にサイクル数と集中時間を表示**

`summary/page.tsx` で `session.meta` から Pomodoro データを読み取り、カードレビュー代わりにサイクル情報を表示する:

```typescript
// method.slug が pomodoro の場合:
const meta = session.meta as { pomodoros_completed?: number; total_focus_sec?: number } | null;
if (method?.slug === "pomodoro" && meta?.pomodoros_completed) {
  // サイクル数、集中時間、休憩時間を表示
  // カードレビュー関連のセクションは非表示
}
```

- [ ] **Step 2: typecheck + テスト実行**

Run: `bun typecheck && bun test:small`
Expected: PASS

- [ ] **Step 3: コミット**

```bash
git add src/app/session/\[id\]/summary/page.tsx
git commit -m "feat: サマリー画面を Pomodoro に対応"
```
