# コード品質改善 実装計画

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 共通化・定数化、エラーハンドリング改善、テスト補強で技術的負債を解消する

**Architecture:** PBI 1 (共通化・定数化) → PBI 2 (エラーハンドリング) → PBI 3 (テスト補強) の順に実装。PBI 1 は振る舞いを変えないリファクタリング、PBI 2 は error.tsx 導入 + throw 変更、PBI 3 は PBI 1・2 完了後のコードに対するテスト追加。

**Tech Stack:** Next.js 16 (App Router), TypeScript, Vitest, Supabase, sonner (toast)

**Spec:** `docs/superpowers/specs/2026-04-07-code-quality-design.md`

**Epic:** #116, **PBI:** #117 / #118 / #119

---

## PBI 1: 共通化・定数化 (#117)

### Task 1: 定数追加 (ACTION_ERRORS, VALIDATION_LIMITS, PG_ERROR_CODES)

**Files:**
- Modify: `src/lib/constants.ts`
- Test: `tests/small/lib/constants.test.ts` (既存)

- [ ] **Step 1: `constants.ts` に定数を追加**

`src/lib/constants.ts` の末尾に以下を追加:

```typescript
// --- Server Action エラーメッセージ ---
// 散在していたハードコード文字列を一箇所に集約し、変更漏れを防ぐ
export const ACTION_ERRORS = {
  UNAUTHENTICATED: "認証が必要です",
  INVALID_INPUT: "入力内容を確認してください",
  NOT_FOUND: (entity: string) => `${entity}が見つかりません`,
  CREATE_FAILED: (entity: string) => `${entity}の作成に失敗しました`,
  UPDATE_FAILED: (entity: string) => `${entity}の更新に失敗しました`,
  DELETE_FAILED: (entity: string) => `${entity}の削除に失敗しました`,
  PERMISSION_DENIED: "権限がありません",
  EDGE_FUNCTION_FAILED: "カードレビューの処理に失敗しました",
  COMPENSATION_FAILED: "セッション状態の復元に失敗しました",
} as const;

// --- バリデーション制約値 ---
// 各 validation ファイルに散在していたマジックナンバーを集約
export const VALIDATION_LIMITS = {
  SUBJECT_NAME_MAX: 100,
  MATERIAL_TITLE_MAX: 200,
  MATERIAL_DESCRIPTION_MAX: 2000,
  CARD_TEXT_MAX: 5000,
  ELABORATION_TEXT_MAX: 10000,
  REVIEWS_MAX: 500,
  INTERLEAVING_MATERIALS_MAX: 10,
} as const;

// --- PostgreSQL エラーコード ---
export const PG_ERROR_CODES = {
  UNIQUE_VIOLATION: "23505",
} as const;
```

- [ ] **Step 2: 型チェック**

Run: `bun typecheck`
Expected: PASS (追加のみで既存コードに影響なし)

- [ ] **Step 3: テスト実行**

Run: `bun test:small`
Expected: 全テスト PASS

- [ ] **Step 4: コミット**

```bash
git add src/lib/constants.ts
git commit -m "refactor: ACTION_ERRORS, VALIDATION_LIMITS, PG_ERROR_CODES を定数化"
```

### Task 2: 認証ユーティリティ抽出

**Files:**
- Create: `src/lib/actions/auth-utils.ts`
- Test: (既存テストで回帰確認)

- [ ] **Step 1: `auth-utils.ts` を作成**

```typescript
import { createClient } from "@/lib/supabase/server";
import type { User } from "@supabase/supabase-js";

type AuthResult = {
  user: User | null;
  supabase: Awaited<ReturnType<typeof createClient>>;
};

export async function getAuthenticatedUser(): Promise<AuthResult> {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  return { user, supabase };
}
```

- [ ] **Step 2: 型チェック**

Run: `bun typecheck`
Expected: PASS

- [ ] **Step 3: コミット**

```bash
git add src/lib/actions/auth-utils.ts
git commit -m "refactor: getAuthenticatedUser ユーティリティを抽出"
```

### Task 3: Server Actions で認証ユーティリティ + エラー定数を適用

6 ファイルを順に変更する。各ファイルで以下のパターンを置換:

**Before (各 action 関数内):**
```typescript
const supabase = await createClient();
const {
  data: { user },
} = await supabase.auth.getUser();
if (!user) return { success: false, error: "認証が必要です" };
```

**After:**
```typescript
const { user, supabase } = await getAuthenticatedUser();
if (!user) return { success: false, error: ACTION_ERRORS.UNAUTHENTICATED };
```

エラーメッセージも同時に定数参照に置換する。

**Files:**
- Modify: `src/lib/actions/sessions.ts`
- Modify: `src/lib/actions/materials.ts`
- Modify: `src/lib/actions/cards.ts`
- Modify: `src/lib/actions/subjects.ts`
- Modify: `src/lib/actions/material-methods.ts`
- Modify: `src/lib/actions/stats.ts`

- [ ] **Step 1: `subjects.ts` を変更** (最小ファイルから着手)

import を変更:
```typescript
// Before
import { createClient } from "@/lib/supabase/server";
// After
import { getAuthenticatedUser } from "@/lib/actions/auth-utils";
import { ACTION_ERRORS } from "@/lib/constants";
```

`createSubject` (行27-32):
```typescript
// Before
const supabase = await createClient();
const {
  data: { user },
} = await supabase.auth.getUser();
if (!user) return { ok: false, error: "認証が必要です" };
// After
const { user, supabase } = await getAuthenticatedUser();
if (!user) return { ok: false, error: ACTION_ERRORS.UNAUTHENTICATED };
```

`getSubjects` (行51-56) も同様に変更。

エラーメッセージ置換:
- "科目の作成に失敗しました" → `ACTION_ERRORS.CREATE_FAILED("科目")`
- "入力内容を確認してください" → `ACTION_ERRORS.INVALID_INPUT`

- [ ] **Step 2: テスト実行**

Run: `bun test:small`
Expected: 全テスト PASS (振る舞い変更なし)

- [ ] **Step 3: `material-methods.ts` を変更**

import を変更し、認証パターンを `getAuthenticatedUser` に置換。

追加変更 -- DB エラーコード定数化 (行52):
```typescript
// Before
if (error.code === "23505") {
// After
if (error.code === PG_ERROR_CODES.UNIQUE_VIOLATION) {
```

import に `PG_ERROR_CODES` を追加。

- [ ] **Step 4: テスト実行**

Run: `bun test:small`
Expected: 全テスト PASS

- [ ] **Step 5: `cards.ts` を変更**

import を変更し、認証パターンを `getAuthenticatedUser` に置換 (5 関数: createCard, getCard, getCards, updateCard, deleteCard)。

エラーメッセージ置換:
- "認証が必要です" → `ACTION_ERRORS.UNAUTHENTICATED`
- "権限がありません" → `ACTION_ERRORS.PERMISSION_DENIED`
- "カードが見つかりません" → `ACTION_ERRORS.NOT_FOUND("カード")`
- "カードの作成に失敗しました" → `ACTION_ERRORS.CREATE_FAILED("カード")`
- "カードの更新に失敗しました" → `ACTION_ERRORS.UPDATE_FAILED("カード")`
- "カードの削除に失敗しました" → `ACTION_ERRORS.DELETE_FAILED("カード")`

- [ ] **Step 6: テスト実行**

Run: `bun test:small`
Expected: 全テスト PASS

- [ ] **Step 7: `materials.ts` を変更**

import を変更し、認証パターンを `getAuthenticatedUser` に置換 (5 関数: createMaterial, getMaterials, getMaterial, updateMaterial, deleteMaterial)。

エラーメッセージ置換:
- "認証が必要です" → `ACTION_ERRORS.UNAUTHENTICATED`
- "入力内容を確認してください" → `ACTION_ERRORS.INVALID_INPUT`
- "教材の作成に失敗しました" → `ACTION_ERRORS.CREATE_FAILED("教材")`
- "教材が見つかりません" → `ACTION_ERRORS.NOT_FOUND("教材")`
- "教材の更新に失敗しました" → `ACTION_ERRORS.UPDATE_FAILED("教材")`
- "教材の削除に失敗しました" → `ACTION_ERRORS.DELETE_FAILED("教材")`

- [ ] **Step 8: テスト実行**

Run: `bun test:small`
Expected: 全テスト PASS

- [ ] **Step 9: `stats.ts` を変更**

import を変更し、認証パターンを `getAuthenticatedUser` に置換。

- [ ] **Step 10: テスト実行**

Run: `bun test:small`
Expected: 全テスト PASS

- [ ] **Step 11: `sessions.ts` を変更** (最大ファイル、12 関数)

import を変更:
```typescript
// Before
import { createClient } from "@/lib/supabase/server";
// After
import { getAuthenticatedUser } from "@/lib/actions/auth-utils";
import { ACTION_ERRORS } from "@/lib/constants";
```

12 関数全てで認証パターンを置換: getSessionInfo, getDueMaterials, createSession, getSessionCards, completeSession, getSession, createRestSession, completeElaborationSession, completePomodoroSession, completeRestSession, createInterleavingSession, getInterleavingCards

エラーメッセージ置換:
- "認証が必要です" → `ACTION_ERRORS.UNAUTHENTICATED`
- "入力内容を確認してください" → `ACTION_ERRORS.INVALID_INPUT`
- "セッションが見つかりません" → `ACTION_ERRORS.NOT_FOUND("セッション")`
- "カードレビューの処理に失敗しました" → `ACTION_ERRORS.EDGE_FUNCTION_FAILED`
- その他各エラーメッセージを対応する定数に

- [ ] **Step 12: テスト実行**

Run: `bun test:small`
Expected: 全テスト PASS

- [ ] **Step 13: コミット**

```bash
git add src/lib/actions/
git commit -m "refactor: 全 Server Actions で getAuthenticatedUser + ACTION_ERRORS を適用"
```

### Task 4: バリデーション制約値を定数参照に変更

**Files:**
- Modify: `src/lib/validations/materials.ts`
- Modify: `src/lib/validations/sessions.ts`
- Modify: `src/lib/validations/elaboration.ts`
- Modify: `src/lib/validations/interleaving.ts`
- Modify: `src/lib/validations/pomodoro.ts`

- [ ] **Step 1: `materials.ts` の制約値を定数参照に変更**

```typescript
import { VALIDATION_LIMITS } from "@/lib/constants";

// Before
export const createSubjectSchema = z.object({
  name: z.string().min(1).max(100),
});
// After
export const createSubjectSchema = z.object({
  name: z.string().min(1).max(VALIDATION_LIMITS.SUBJECT_NAME_MAX),
});
```

同様に:
- `createMaterialSchema.title`: max(200) → max(VALIDATION_LIMITS.MATERIAL_TITLE_MAX)
- `createMaterialSchema.description`: max(2000) → max(VALIDATION_LIMITS.MATERIAL_DESCRIPTION_MAX)
- `updateMaterialSchema.title`: max(200) → max(VALIDATION_LIMITS.MATERIAL_TITLE_MAX)
- `updateMaterialSchema.description`: max(2000) → max(VALIDATION_LIMITS.MATERIAL_DESCRIPTION_MAX)
- `cardSchema.front`: max(5000) → max(VALIDATION_LIMITS.CARD_TEXT_MAX)
- `cardSchema.back`: max(5000) → max(VALIDATION_LIMITS.CARD_TEXT_MAX)

- [ ] **Step 2: `sessions.ts` の制約値を定数参照に変更**

```typescript
import { VALIDATION_LIMITS } from "@/lib/constants";

// reviews: max(500) → max(VALIDATION_LIMITS.REVIEWS_MAX)
```

- [ ] **Step 3: `elaboration.ts` の制約値を定数参照に変更**

```typescript
import { VALIDATION_LIMITS, SESSION_MAX_CARDS } from "@/lib/constants";

// text: max(10000) → max(VALIDATION_LIMITS.ELABORATION_TEXT_MAX)
// reviews: max(20) → max(SESSION_MAX_CARDS)
// elaborations: max(20) → max(SESSION_MAX_CARDS)
```

- [ ] **Step 4: `interleaving.ts` の制約値を定数参照に変更**

```typescript
import { VALIDATION_LIMITS } from "@/lib/constants";

// materialIds: max(10) → max(VALIDATION_LIMITS.INTERLEAVING_MATERIALS_MAX)
```

- [ ] **Step 5: `pomodoro.ts` の制約値を定数参照に変更**

rating の min(1), max(4) はドメイン固有の制約 (FSRS の 1-4 評価) なので定数化不要。pomodorosCompleted の min(1) も同様。変更なし。

- [ ] **Step 6: テスト実行**

Run: `bun test:small`
Expected: 全テスト PASS (既存の validation テストが回帰テストとして機能)

- [ ] **Step 7: コミット**

```bash
git add src/lib/validations/
git commit -m "refactor: バリデーション制約値を VALIDATION_LIMITS 定数に置換"
```

### Task 5: 日付関数の統一

**Files:**
- Modify: `src/lib/actions/sessions.ts`
- Modify: `src/lib/actions/materials.ts`
- Modify: `src/lib/actions/cards.ts`

- [ ] **Step 1: sessions.ts の日付フォーマットを統一**

import に `toJstDateString` を追加:
```typescript
import { toJstDateString } from "@/lib/utils/date";
```

置換箇所:
- 行66 `getDueMaterials`: `const today = new Date().toISOString().split("T")[0]` → `const today = toJstDateString(new Date())`
- 行154 `getSessionCards`: 同上
- 行312 `getSession`: 同上
- 行567 `completePomodoroSession`: `const logDate = new Date(Date.now() + JST_OFFSET_MS).toISOString().split("T")[0]` → `const logDate = toJstDateString(new Date())`
- 行725 `getInterleavingCards`: 同上

`JST_OFFSET_MS` の import が不要になったら削除。

- [ ] **Step 2: materials.ts の日付フォーマットを統一**

import に `toJstDateString` を追加。

- 行119 `getMaterials`: `const today = new Date().toISOString().split("T")[0]` → `const today = toJstDateString(new Date())`
- 行181 `getMaterial`: 同上

- [ ] **Step 3: cards.ts の日付フォーマットを統一**

import に `toJstDateString` を追加。

- 行86 `createCard`: `const today = new Date().toISOString().split("T")[0]` → `const today = toJstDateString(new Date())`

- [ ] **Step 4: テスト実行**

Run: `bun test:small`
Expected: 全テスト PASS

- [ ] **Step 5: コミット**

```bash
git add src/lib/actions/
git commit -m "refactor: 日付フォーマットを toJstDateString に統一"
```

### Task 6: タイマー hook 共通化

**Files:**
- Create: `src/hooks/use-countdown-timer.ts`
- Create: `tests/small/hooks/use-countdown-timer.test.ts`
- Modify: `src/app/rest/[id]/use-rest-timer.ts`
- Modify: `src/app/session/[id]/use-pomodoro-timer.ts`

- [ ] **Step 1: テストを書く**

`tests/small/hooks/use-countdown-timer.test.ts`:

```typescript
import { renderHook, act } from "@testing-library/react";
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { useCountdownTimer } from "@/hooks/use-countdown-timer";

describe("useCountdownTimer", () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it("initializes with correct state", () => {
    const { result } = renderHook(() => useCountdownTimer(60));
    expect(result.current.remainingSeconds).toBe(60);
    expect(result.current.progress).toBe(1);
    expect(result.current.isRunning).toBe(false);
    expect(result.current.isComplete).toBe(false);
  });

  it("counts down after start", () => {
    const { result } = renderHook(() => useCountdownTimer(10));
    act(() => { result.current.start(); });
    expect(result.current.isRunning).toBe(true);

    act(() => { vi.advanceTimersByTime(3000); });
    expect(result.current.remainingSeconds).toBe(7);
    expect(result.current.progress).toBeCloseTo(0.7);
  });

  it("stops at zero and sets isComplete", () => {
    const { result } = renderHook(() => useCountdownTimer(3));
    act(() => { result.current.start(); });
    act(() => { vi.advanceTimersByTime(3000); });

    expect(result.current.remainingSeconds).toBe(0);
    expect(result.current.isComplete).toBe(true);
    expect(result.current.isRunning).toBe(false);
  });

  it("pauses the countdown", () => {
    const { result } = renderHook(() => useCountdownTimer(10));
    act(() => { result.current.start(); });
    act(() => { vi.advanceTimersByTime(2000); });
    act(() => { result.current.pause(); });

    expect(result.current.isRunning).toBe(false);
    expect(result.current.remainingSeconds).toBe(8);

    act(() => { vi.advanceTimersByTime(3000); });
    expect(result.current.remainingSeconds).toBe(8);
  });

  it("resets to initial state", () => {
    const { result } = renderHook(() => useCountdownTimer(10));
    act(() => { result.current.start(); });
    act(() => { vi.advanceTimersByTime(5000); });
    act(() => { result.current.reset(); });

    expect(result.current.remainingSeconds).toBe(10);
    expect(result.current.isRunning).toBe(false);
    expect(result.current.isComplete).toBe(false);
  });
});
```

- [ ] **Step 2: テスト失敗を確認**

Run: `bun test:small tests/small/hooks/use-countdown-timer.test.ts`
Expected: FAIL (モジュールが存在しない)

- [ ] **Step 3: `useCountdownTimer` を実装**

`src/hooks/use-countdown-timer.ts`:

```typescript
"use client";
import { useState, useEffect, useRef, useCallback } from "react";

export type CountdownState = {
  remainingSeconds: number;
  progress: number;
  isRunning: boolean;
  isComplete: boolean;
  start: () => void;
  pause: () => void;
  reset: () => void;
};

export function useCountdownTimer(totalSeconds: number): CountdownState {
  const [remainingSeconds, setRemainingSeconds] = useState(totalSeconds);
  const [isRunning, setIsRunning] = useState(false);
  const intervalRef = useRef<ReturnType<typeof setInterval> | null>(null);

  const isComplete = remainingSeconds <= 0;
  const progress = totalSeconds > 0 ? remainingSeconds / totalSeconds : 0;

  useEffect(() => {
    if (!isRunning || isComplete) return;

    intervalRef.current = setInterval(() => {
      setRemainingSeconds((prev) => {
        const next = prev - 1;
        if (next <= 0) {
          if (intervalRef.current) clearInterval(intervalRef.current);
          setIsRunning(false);
          return 0;
        }
        return next;
      });
    }, 1000);

    return () => {
      if (intervalRef.current) clearInterval(intervalRef.current);
    };
  }, [isRunning, isComplete]);

  const start = useCallback(() => {
    if (!isComplete) setIsRunning(true);
  }, [isComplete]);

  const pause = useCallback(() => {
    setIsRunning(false);
  }, []);

  const reset = useCallback(() => {
    setIsRunning(false);
    setRemainingSeconds(totalSeconds);
  }, [totalSeconds]);

  return { remainingSeconds, progress, isRunning, isComplete, start, pause, reset };
}
```

- [ ] **Step 4: テスト成功を確認**

Run: `bun test:small tests/small/hooks/use-countdown-timer.test.ts`
Expected: PASS

- [ ] **Step 5: `use-rest-timer.ts` を `useCountdownTimer` で書き換え**

```typescript
"use client";
import { useCountdownTimer } from "@/hooks/use-countdown-timer";
import { useEffect } from "react";

export interface RestTimerState {
  remainingSeconds: number;
  isComplete: boolean;
  progress: number;
}

export function useRestTimer(totalSeconds: number): RestTimerState {
  const timer = useCountdownTimer(totalSeconds);

  // マウント時に自動スタート (既存の挙動を維持)
  useEffect(() => {
    timer.start();
    // start は安定した参照なので依存配列に含めない
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  return {
    remainingSeconds: timer.remainingSeconds,
    isComplete: timer.isComplete,
    progress: timer.progress,
  };
}
```

- [ ] **Step 6: 既存の rest-timer テストを実行**

Run: `bun test:small tests/small/hooks/use-rest-timer.test.ts`
Expected: PASS (インターフェース不変)

- [ ] **Step 7: `use-pomodoro-timer.ts` を `useCountdownTimer` で書き換え**

```typescript
"use client";
import { useState, useCallback, useEffect } from "react";
import { useCountdownTimer } from "@/hooks/use-countdown-timer";

type Phase = "focus" | "focus_complete" | "break" | "break_complete" | "done";

export type PomodoroTimerState = {
  phase: Phase;
  remainingSeconds: number;
  remainingRatio: number;
  cycle: number;
  totalFocusSec: number;
  totalBreakSec: number;
  startBreak: () => void;
  startNextCycle: () => void;
  finish: () => void;
};

export function usePomodoroTimer(focusSec: number, breakSec: number): PomodoroTimerState {
  const [phase, setPhase] = useState<Phase>("focus");
  const [cycle, setCycle] = useState(1);
  const [totalFocusSec, setTotalFocusSec] = useState(0);
  const [totalBreakSec, setTotalBreakSec] = useState(0);

  const currentDuration = phase === "break" ? breakSec : focusSec;
  const timer = useCountdownTimer(currentDuration);

  const isTimerActive = phase === "focus" || phase === "break";
  const remainingRatio = isTimerActive ? timer.progress : 0;

  // フェーズ開始時に自動スタート
  useEffect(() => {
    if (phase === "focus" || phase === "break") {
      timer.start();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [phase]);

  // タイマー完了時にフェーズ遷移
  useEffect(() => {
    if (!timer.isComplete) return;
    if (phase === "focus") {
      setTotalFocusSec((t) => t + focusSec);
      setPhase("focus_complete");
    } else if (phase === "break") {
      setTotalBreakSec((t) => t + breakSec);
      setPhase("break_complete");
    }
  }, [timer.isComplete, phase, focusSec, breakSec]);

  const startBreak = useCallback(() => {
    setPhase("break");
    timer.reset();
  }, [timer]);

  const startNextCycle = useCallback(() => {
    setCycle((c) => c + 1);
    setPhase("focus");
    timer.reset();
  }, [timer]);

  const finish = useCallback(() => {
    setPhase("done");
  }, []);

  return {
    phase,
    remainingSeconds: timer.remainingSeconds,
    remainingRatio,
    cycle,
    totalFocusSec,
    totalBreakSec,
    startBreak,
    startNextCycle,
    finish,
  };
}
```

注意: `useCountdownTimer` は `totalSeconds` が変わっても内部で自動リセットしない設計。フェーズ切り替え時に `timer.reset()` を明示的に呼ぶ。もし `useCountdownTimer` の `totalSeconds` 変更で自動リセットが必要なら、`useEffect` で `totalSeconds` を監視して `reset` を呼ぶロジックを追加する。既存テストで検証する。

- [ ] **Step 8: 既存の pomodoro-timer テストを実行**

Run: `bun test:small tests/small/hooks/use-pomodoro-timer.test.ts`
Expected: PASS

テストが失敗する場合、`useCountdownTimer` が `totalSeconds` prop 変更時にリセットされない問題の可能性がある。その場合 `useCountdownTimer` に `useEffect(() => { setRemainingSeconds(totalSeconds); }, [totalSeconds])` を追加して対応する。

- [ ] **Step 9: 全テスト実行**

Run: `bun test:small`
Expected: 全テスト PASS

- [ ] **Step 10: コミット**

```bash
git add src/hooks/ src/app/rest/ src/app/session/ tests/small/hooks/
git commit -m "refactor: useCountdownTimer 共通 hook を抽出"
```

### Task 7: セッション完了補償パターン共通化

**Files:**
- Create: `src/lib/actions/session-compensation.ts`
- Modify: `src/lib/actions/sessions.ts`

- [ ] **Step 1: `session-compensation.ts` を作成**

```typescript
import type { createClient } from "@/lib/supabase/server";
import { ACTION_ERRORS } from "@/lib/constants";

type SupabaseClient = Awaited<ReturnType<typeof createClient>>;

type CompensationResult =
  | { ok: true; data: unknown }
  | { ok: false; error: string };

const DEFAULT_COMPENSATION_FIELDS = {
  status: "in_progress" as const,
  ended_at: null,
  self_rating: null,
  duration_sec: 0,
};

export async function invokeCompleteSession(
  supabase: SupabaseClient,
  sessionId: string,
  body: Record<string, unknown>,
  extraCompensationFields?: Record<string, unknown>,
): Promise<CompensationResult> {
  const fnResult = await supabase.functions.invoke("complete-session", { body });

  if (fnResult.error) {
    const compensationFields = {
      ...DEFAULT_COMPENSATION_FIELDS,
      ...extraCompensationFields,
    };

    const { error: compensationError } = await supabase
      .from("sessions")
      .update(compensationFields)
      .eq("id", sessionId);

    if (compensationError) {
      console.error(
        `invokeCompleteSession compensation failed for session ${sessionId}:`,
        compensationError,
      );
    }

    return { ok: false, error: ACTION_ERRORS.EDGE_FUNCTION_FAILED };
  }

  return { ok: true, data: fnResult.data };
}
```

- [ ] **Step 2: `sessions.ts` の `completeSession` を書き換え**

行233-254 を置換:

```typescript
// Before
const fnResult = await supabase.functions.invoke("complete-session", { ... });
if (fnResult.error) { /* 補償処理 */ }
// After
const fnResult = await invokeCompleteSession(
  supabase,
  parsed.data.sessionId,
  { session_id: parsed.data.sessionId, reviews: parsed.data.reviews },
);
if (!fnResult.ok) return { success: false, error: fnResult.error };
```

- [ ] **Step 3: `sessions.ts` の `completeElaborationSession` を書き換え**

行470-492 を置換:

```typescript
const fnResult = await invokeCompleteSession(
  supabase,
  parsed.data.sessionId,
  { session_id: parsed.data.sessionId, reviews: parsed.data.reviews },
  { meta: null },
);
if (!fnResult.ok) return { success: false, error: fnResult.error };
```

- [ ] **Step 4: テスト実行**

Run: `bun test:small`
Expected: 全テスト PASS

- [ ] **Step 5: コミット**

```bash
git add src/lib/actions/session-compensation.ts src/lib/actions/sessions.ts
git commit -m "refactor: セッション完了補償パターンを invokeCompleteSession に共通化"
```

### Task 8: PBI 1 完了確認 + push

- [ ] **Step 1: 全テスト + 型チェック + lint**

Run: `bun check`
Expected: 全て PASS

- [ ] **Step 2: push**

Run: `git push`

---

## PBI 2: エラーハンドリング改善 (#118)

### Task 9: error.tsx 導入

**Files:**
- Create: `src/app/error.tsx`
- Create: `src/app/(main)/error.tsx`
- Create: `src/app/session/error.tsx`
- Create: `src/app/rest/error.tsx`

- [ ] **Step 1: グローバル `error.tsx` を作成**

`src/app/error.tsx`:

```tsx
"use client";

import Link from "next/link";
import { useEffect } from "react";

export default function GlobalError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  useEffect(() => {
    console.error("Unhandled error:", error);
  }, [error]);

  return (
    <div className="flex min-h-dvh flex-col items-center justify-center gap-4 p-4 text-center">
      <h1 className="text-xl font-bold">エラーが発生しました</h1>
      <p className="text-sm text-muted-foreground">
        {process.env.NODE_ENV === "development" ? error.message : "予期しないエラーが発生しました"}
      </p>
      <div className="flex gap-2">
        <button
          type="button"
          onClick={reset}
          className="rounded-lg border px-4 py-2 text-sm hover:bg-accent"
        >
          再読み込み
        </button>
        <Link
          href="/"
          className="rounded-lg bg-primary px-4 py-2 text-sm text-primary-foreground"
        >
          ホームに戻る
        </Link>
      </div>
    </div>
  );
}
```

- [ ] **Step 2: `(main)/error.tsx` を作成**

`src/app/(main)/error.tsx`:

```tsx
"use client";

import { useEffect } from "react";

export default function MainError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  useEffect(() => {
    console.error("Main layout error:", error);
  }, [error]);

  return (
    <div className="flex flex-1 flex-col items-center justify-center gap-4 p-4 text-center">
      <h1 className="text-xl font-bold">エラーが発生しました</h1>
      <p className="text-sm text-muted-foreground">
        {process.env.NODE_ENV === "development" ? error.message : "データの読み込みに失敗しました"}
      </p>
      <button
        type="button"
        onClick={reset}
        className="rounded-lg bg-primary px-4 py-2 text-sm text-primary-foreground"
      >
        再読み込み
      </button>
    </div>
  );
}
```

- [ ] **Step 3: `session/error.tsx` を作成**

`src/app/session/error.tsx`:

```tsx
"use client";

import Link from "next/link";
import { useEffect } from "react";

export default function SessionError({
  error,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  useEffect(() => {
    console.error("Session error:", error);
  }, [error]);

  return (
    <div className="flex min-h-dvh flex-col items-center justify-center gap-4 p-4 text-center">
      <h1 className="text-xl font-bold">セッションエラー</h1>
      <p className="text-sm text-muted-foreground">
        {process.env.NODE_ENV === "development" ? error.message : "セッションの読み込みに失敗しました"}
      </p>
      <Link
        href="/"
        className="rounded-lg bg-primary px-4 py-2 text-sm text-primary-foreground"
      >
        ホームに戻る
      </Link>
    </div>
  );
}
```

- [ ] **Step 4: `rest/error.tsx` を作成**

`src/app/rest/error.tsx`: `session/error.tsx` と同じ構造。メッセージのみ変更:

```tsx
"use client";

import Link from "next/link";
import { useEffect } from "react";

export default function RestError({
  error,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  useEffect(() => {
    console.error("Rest timer error:", error);
  }, [error]);

  return (
    <div className="flex min-h-dvh flex-col items-center justify-center gap-4 p-4 text-center">
      <h1 className="text-xl font-bold">タイマーエラー</h1>
      <p className="text-sm text-muted-foreground">
        {process.env.NODE_ENV === "development" ? error.message : "タイマーの読み込みに失敗しました"}
      </p>
      <Link
        href="/"
        className="rounded-lg bg-primary px-4 py-2 text-sm text-primary-foreground"
      >
        ホームに戻る
      </Link>
    </div>
  );
}
```

- [ ] **Step 5: 型チェック**

Run: `bun typecheck`
Expected: PASS

- [ ] **Step 6: コミット**

```bash
git add src/app/error.tsx src/app/\(main\)/error.tsx src/app/session/error.tsx src/app/rest/error.tsx
git commit -m "feat: error.tsx をグローバル + セクション別に導入"
```

### Task 10: データ取得関数のエラーハンドリング改善

**Files:**
- Modify: `src/lib/actions/materials.ts`
- Modify: `src/lib/actions/stats.ts`
- Modify: `src/lib/actions/subjects.ts`
- Modify: `tests/small/lib/actions/stats.test.ts`

- [ ] **Step 1: `getMaterials` を throw に変更**

`src/lib/actions/materials.ts` の `getMaterials`:

```typescript
// Before (行87)
if (!user) return [];
// After
if (!user) redirect("/auth/login");

// Before (行110-111)
const { data } = await query;
if (!data) return [];
// After
const { data, error } = await query;
if (error) throw new Error(`getMaterials failed: ${error.message}`);
if (!data) return [];
```

import に `redirect` を追加:
```typescript
import { redirect } from "next/navigation";
```

- [ ] **Step 2: `getMaterial` を throw に変更**

```typescript
// Before (行163)
if (!user) return null;
// After
if (!user) redirect("/auth/login");
```

Supabase クエリエラー時も throw:
```typescript
const { data: material, error } = await supabase.rpc("get_material", { ... });
if (error) throw new Error(`getMaterial failed: ${error.message}`);
```

- [ ] **Step 3: `getSubjects` を throw に変更**

`src/lib/actions/subjects.ts`:
```typescript
// Before (行56)
if (!user) return [];
// After
if (!user) redirect("/auth/login");

// Before (行64)
return data ?? [];
// After
const { data, error } = await supabase.from("subjects")...;
if (error) throw new Error(`getSubjects failed: ${error.message}`);
return data ?? [];
```

- [ ] **Step 4: `getStats` を throw + redirect に変更**

`src/lib/actions/stats.ts`:
```typescript
// Before (行38)
if (!user) return EMPTY_STATS;
// After
if (!user) redirect("/auth/login");

// Supabase クエリエラー時
// Before (行58)
if (!logs || logs.length === 0) return EMPTY_STATS;
// After
const { data: logs, error } = await supabase.from("daily_logs")...;
if (error) throw new Error(`getStats failed: ${error.message}`);
if (!logs || logs.length === 0) return EMPTY_STATS;
```

import に `redirect` を追加。

- [ ] **Step 5: `stats.test.ts` の未認証テストを修正**

```typescript
// redirect のモック
vi.mock("next/navigation", () => ({
  redirect: vi.fn((url: string) => {
    throw new Error(`NEXT_REDIRECT:${url}`);
  }),
}));

// Before
it("returns EMPTY_STATS when user is not authenticated", async () => {
  // ...
  expect(result).toEqual(EMPTY_STATS);
});

// After
it("redirects to login when user is not authenticated", async () => {
  authMock.getUser.mockResolvedValue({ data: { user: null } });
  const { getStats } = await import("@/lib/actions/stats");
  await expect(getStats(7)).rejects.toThrow("NEXT_REDIRECT:/auth/login");
});
```

- [ ] **Step 6: テスト実行**

Run: `bun test:small`
Expected: 全テスト PASS

- [ ] **Step 7: コミット**

```bash
git add src/lib/actions/ tests/small/
git commit -m "fix: データ取得関数でエラー時に throw、未認証時に redirect"
```

### Task 11: summary-actions.tsx のサイレント失敗修正

**Files:**
- Modify: `src/app/session/[id]/summary/summary-actions.tsx`

- [ ] **Step 1: toast import を追加し、エラーハンドリングを修正**

```typescript
// import 追加
import { toast } from "sonner";

// handleContinue 修正
function handleContinue() {
  if (!materialId || !methodId) return;
  startTransition(async () => {
    const result = await createSession(materialId, methodId);
    if (result.success) {
      router.push(`/session/${result.data.id}`);
    } else {
      toast.error(result.error);
    }
  });
}

// handleRest 修正
function handleRest() {
  startTransition(async () => {
    const result = await createRestSession(sessionId);
    if (result.success) {
      router.push(`/rest/${result.data.id}`);
    } else {
      toast.error(result.error);
    }
  });
}
```

- [ ] **Step 2: 型チェック**

Run: `bun typecheck`
Expected: PASS

- [ ] **Step 3: コミット**

```bash
git add src/app/session/
git commit -m "fix: summary-actions のサイレント失敗を修正し toast.error で通知"
```

### Task 12: PBI 2 完了確認 + push

- [ ] **Step 1: 全テスト + 型チェック + lint**

Run: `bun check`
Expected: 全て PASS

- [ ] **Step 2: push**

Run: `git push`

---

## PBI 3: テスト補強 (#119)

### Task 13: materials.ts actions テスト

**Files:**
- Create: `tests/small/lib/actions/materials.test.ts`

- [ ] **Step 1: テストファイルを作成**

```typescript
import { describe, it, expect, vi, beforeEach } from "vitest";
import { ACTION_ERRORS } from "@/lib/constants";

// Supabase クライアントモック
const selectMock = vi.fn();
const insertMock = vi.fn();
const updateMock = vi.fn();
const deleteMock = vi.fn();
const rpcMock = vi.fn();
const eqMock = vi.fn();
const singleMock = vi.fn();

const authMock = {
  getUser: vi.fn(),
};

function buildChain(finalResult: { data: unknown; error: unknown }) {
  const chain = {
    select: vi.fn().mockReturnThis(),
    insert: vi.fn().mockReturnThis(),
    update: vi.fn().mockReturnThis(),
    delete: vi.fn().mockReturnThis(),
    eq: vi.fn().mockReturnThis(),
    in: vi.fn().mockReturnThis(),
    gte: vi.fn().mockReturnThis(),
    order: vi.fn().mockReturnThis(),
    single: vi.fn().mockResolvedValue(finalResult),
    then: vi.fn().mockResolvedValue(finalResult),
  };
  // .select().eq().single() のチェインを返す
  return chain;
}

let mockFromResult: ReturnType<typeof buildChain>;

const mockClient = {
  auth: authMock,
  from: vi.fn(() => mockFromResult),
  rpc: rpcMock,
};

vi.mock("@/lib/supabase/server", () => ({
  createClient: vi.fn(() => Promise.resolve(mockClient)),
}));

vi.mock("next/cache", () => ({
  revalidatePath: vi.fn(),
}));

vi.mock("next/navigation", () => ({
  redirect: vi.fn((url: string) => {
    throw new Error(`NEXT_REDIRECT:${url}`);
  }),
}));

describe("createMaterial", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.resetModules();
    authMock.getUser.mockResolvedValue({ data: { user: { id: "user-1" } } });
  });

  it("returns validation error for empty title", async () => {
    const { createMaterial } = await import("@/lib/actions/materials");
    const result = await createMaterial({
      title: "",
      subjectId: "sub-1",
      methodIds: ["m-1"],
    });
    expect(result.success).toBe(false);
    expect(result.error).toBe(ACTION_ERRORS.INVALID_INPUT);
  });

  it("returns auth error when user is not authenticated", async () => {
    authMock.getUser.mockResolvedValue({ data: { user: null } });
    const { createMaterial } = await import("@/lib/actions/materials");
    const result = await createMaterial({
      title: "Test",
      subjectId: "sub-1",
      methodIds: ["m-1"],
    });
    expect(result.success).toBe(false);
    expect(result.error).toBe(ACTION_ERRORS.UNAUTHENTICATED);
  });
});

describe("getMaterials", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.resetModules();
  });

  it("redirects when user is not authenticated", async () => {
    authMock.getUser.mockResolvedValue({ data: { user: null } });
    const { getMaterials } = await import("@/lib/actions/materials");
    await expect(getMaterials()).rejects.toThrow("NEXT_REDIRECT:/auth/login");
  });
});

describe("getMaterial", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.resetModules();
  });

  it("redirects when user is not authenticated", async () => {
    authMock.getUser.mockResolvedValue({ data: { user: null } });
    const { getMaterial } = await import("@/lib/actions/materials");
    await expect(getMaterial("mat-1")).rejects.toThrow("NEXT_REDIRECT:/auth/login");
  });
});
```

注意: 実際のモックパターンは既存テスト (`sessions.test.ts`) を参考に調整する。上記は基本構造。createMaterial の正常系テストは Supabase の `from().insert().select().single()` チェインのモックが複雑なため、実装時に既存の `buildMockClientWithRpc` パターンに合わせる。

- [ ] **Step 2: テスト実行**

Run: `bun test:small tests/small/lib/actions/materials.test.ts`
Expected: PASS

- [ ] **Step 3: コミット**

```bash
git add tests/small/lib/actions/materials.test.ts
git commit -m "test: materials.ts actions のテストを追加"
```

### Task 14: subjects.ts actions テスト

**Files:**
- Create: `tests/small/lib/actions/subjects.test.ts`

- [ ] **Step 1: テストファイルを作成**

```typescript
import { describe, it, expect, vi, beforeEach } from "vitest";
import { ACTION_ERRORS } from "@/lib/constants";

const authMock = {
  getUser: vi.fn(),
};

const fromChainMock = {
  select: vi.fn().mockReturnThis(),
  insert: vi.fn().mockReturnThis(),
  eq: vi.fn().mockReturnThis(),
  order: vi.fn().mockReturnThis(),
  single: vi.fn(),
};

const mockClient = {
  auth: authMock,
  from: vi.fn(() => fromChainMock),
};

vi.mock("@/lib/supabase/server", () => ({
  createClient: vi.fn(() => Promise.resolve(mockClient)),
}));

vi.mock("next/cache", () => ({
  revalidatePath: vi.fn(),
}));

vi.mock("next/navigation", () => ({
  redirect: vi.fn((url: string) => {
    throw new Error(`NEXT_REDIRECT:${url}`);
  }),
}));

describe("createSubject", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.resetModules();
    authMock.getUser.mockResolvedValue({ data: { user: { id: "user-1" } } });
  });

  it("returns validation error for empty name", async () => {
    const { createSubject } = await import("@/lib/actions/subjects");
    const result = await createSubject("");
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.error).toBe(ACTION_ERRORS.INVALID_INPUT);
  });

  it("returns auth error when not authenticated", async () => {
    authMock.getUser.mockResolvedValue({ data: { user: null } });
    const { createSubject } = await import("@/lib/actions/subjects");
    const result = await createSubject("Math");
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.error).toBe(ACTION_ERRORS.UNAUTHENTICATED);
  });

  it("creates subject and returns id", async () => {
    fromChainMock.single.mockResolvedValue({
      data: { id: "new-sub-1", name: "Math" },
      error: null,
    });
    const { createSubject } = await import("@/lib/actions/subjects");
    const result = await createSubject("Math");
    expect(result.ok).toBe(true);
    if (result.ok) expect(result.data.id).toBe("new-sub-1");
  });
});

describe("getSubjects", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.resetModules();
  });

  it("redirects when not authenticated", async () => {
    authMock.getUser.mockResolvedValue({ data: { user: null } });
    const { getSubjects } = await import("@/lib/actions/subjects");
    await expect(getSubjects()).rejects.toThrow("NEXT_REDIRECT:/auth/login");
  });
});
```

- [ ] **Step 2: テスト実行**

Run: `bun test:small tests/small/lib/actions/subjects.test.ts`
Expected: PASS

- [ ] **Step 3: コミット**

```bash
git add tests/small/lib/actions/subjects.test.ts
git commit -m "test: subjects.ts actions のテストを追加"
```

### Task 15: コンポーネントテスト (4 ファイル)

**Files:**
- Create: `tests/small/components/interleaving-button.test.tsx`
- Create: `tests/small/components/material-card.test.tsx`
- Create: `tests/small/components/method-select-list.test.tsx`
- Create: `tests/small/components/subject-selector.test.tsx`

- [ ] **Step 1: `interleaving-button.test.tsx` を作成**

```tsx
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, it, expect, vi, beforeEach } from "vitest";
import { InterleavingButton } from "@/components/interleaving-button";

const pushMock = vi.fn();
vi.mock("next/navigation", () => ({
  useRouter: () => ({ push: pushMock }),
}));

const createInterleavingSessionMock = vi.fn();
vi.mock("@/lib/actions/sessions", () => ({
  createInterleavingSession: (...args: unknown[]) => createInterleavingSessionMock(...args),
}));

describe("InterleavingButton", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("renders button text", () => {
    render(<InterleavingButton materialIds={["m-1", "m-2"]} />);
    expect(screen.getByRole("button", { name: "まとめて学習" })).toBeInTheDocument();
  });

  it("navigates to session on success", async () => {
    createInterleavingSessionMock.mockResolvedValue({
      success: true,
      data: { id: "session-1" },
    });
    const user = userEvent.setup();
    render(<InterleavingButton materialIds={["m-1", "m-2"]} />);
    await user.click(screen.getByRole("button"));
    expect(pushMock).toHaveBeenCalledWith("/session/session-1");
  });

  it("shows error on failure", async () => {
    createInterleavingSessionMock.mockResolvedValue({
      success: false,
      error: "テストエラー",
    });
    const user = userEvent.setup();
    render(<InterleavingButton materialIds={["m-1", "m-2"]} />);
    await user.click(screen.getByRole("button"));
    expect(screen.getByText("テストエラー")).toBeInTheDocument();
  });
});
```

- [ ] **Step 2: `material-card.test.tsx` を作成**

```tsx
import { render, screen } from "@testing-library/react";
import { describe, it, expect } from "vitest";
import { MaterialCard } from "@/components/material-card";
import type { MaterialWithMethods } from "@/lib/types/materials";

const baseMaterial: MaterialWithMethods = {
  id: "mat-1",
  title: "テスト教材",
  description: null,
  subject_id: "sub-1",
  subject_name: "数学",
  total_cards: 10,
  due_count: 3,
  methods: [{ id: "m-1", name: "SRS", slug: "srs" }],
};

describe("MaterialCard", () => {
  it("renders material title", () => {
    render(<MaterialCard material={baseMaterial} />);
    expect(screen.getByText("テスト教材")).toBeInTheDocument();
  });

  it("shows due count for card-based methods", () => {
    render(<MaterialCard material={baseMaterial} />);
    expect(screen.getByText("3件")).toBeInTheDocument();
    expect(screen.getByText("10枚")).toBeInTheDocument();
  });

  it("shows session label for non-card-based methods", () => {
    const material: MaterialWithMethods = {
      ...baseMaterial,
      methods: [{ id: "m-2", name: "ポモドーロ", slug: "pomodoro" }],
    };
    render(<MaterialCard material={material} />);
    expect(screen.getByText("セッション学習")).toBeInTheDocument();
  });

  it("links to material detail page", () => {
    render(<MaterialCard material={baseMaterial} />);
    const link = screen.getByRole("link");
    expect(link).toHaveAttribute("href", "/materials/mat-1");
  });
});
```

- [ ] **Step 3: `method-select-list.test.tsx` を作成**

```tsx
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, it, expect, vi, beforeEach } from "vitest";
import { MethodSelectList } from "@/components/method-select-list";

const pushMock = vi.fn();
vi.mock("next/navigation", () => ({
  useRouter: () => ({ push: pushMock }),
}));

const createSessionMock = vi.fn();
vi.mock("@/lib/actions/sessions", () => ({
  createSession: (...args: unknown[]) => createSessionMock(...args),
}));

const methods = [
  { id: "m-1", name: "SRS", slug: "srs" },
  { id: "m-2", name: "ポモドーロ", slug: "pomodoro" },
];

describe("MethodSelectList", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("renders all methods", () => {
    render(<MethodSelectList materialId="mat-1" methods={methods} />);
    expect(screen.getByText("SRS")).toBeInTheDocument();
    expect(screen.getByText("ポモドーロ")).toBeInTheDocument();
  });

  it("shows due count badge when provided", () => {
    render(
      <MethodSelectList
        materialId="mat-1"
        methods={methods}
        dueCounts={{ "m-1": 5 }}
      />,
    );
    expect(screen.getByText("5枚")).toBeInTheDocument();
  });

  it("navigates to session on method select", async () => {
    createSessionMock.mockResolvedValue({
      success: true,
      data: { id: "session-1" },
    });
    const user = userEvent.setup();
    render(<MethodSelectList materialId="mat-1" methods={methods} />);
    await user.click(screen.getByText("SRS"));
    expect(createSessionMock).toHaveBeenCalledWith("mat-1", "m-1");
    expect(pushMock).toHaveBeenCalledWith("/session/session-1");
  });

  it("shows error on failure", async () => {
    createSessionMock.mockResolvedValue({
      success: false,
      error: "作成失敗",
    });
    const user = userEvent.setup();
    render(<MethodSelectList materialId="mat-1" methods={methods} />);
    await user.click(screen.getByText("SRS"));
    expect(screen.getByText("作成失敗")).toBeInTheDocument();
  });
});
```

- [ ] **Step 4: `subject-selector.test.tsx` を作成**

```tsx
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, it, expect, vi, beforeEach } from "vitest";
import { SubjectSelector } from "@/components/subject-selector";

const subjects = [
  { id: "sub-1", name: "数学" },
  { id: "sub-2", name: "英語" },
];

describe("SubjectSelector", () => {
  const onChange = vi.fn();
  const onCreateSubject = vi.fn();

  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("renders subject options", () => {
    render(
      <SubjectSelector
        subjects={subjects}
        value="sub-1"
        onChange={onChange}
        onCreateSubject={onCreateSubject}
      />,
    );
    expect(screen.getByRole("combobox")).toBeInTheDocument();
  });

  it("renders add button", () => {
    render(
      <SubjectSelector
        subjects={subjects}
        value=""
        onChange={onChange}
        onCreateSubject={onCreateSubject}
      />,
    );
    expect(screen.getByRole("button", { name: "科目を追加" })).toBeInTheDocument();
  });

  it("opens dialog on add button click", async () => {
    const user = userEvent.setup();
    render(
      <SubjectSelector
        subjects={subjects}
        value=""
        onChange={onChange}
        onCreateSubject={onCreateSubject}
      />,
    );
    await user.click(screen.getByRole("button", { name: "科目を追加" }));
    expect(screen.getByText("新しい科目を作成")).toBeInTheDocument();
  });

  it("calls onCreateSubject and onChange on create", async () => {
    onCreateSubject.mockResolvedValue({ id: "sub-3", name: "理科" });
    const user = userEvent.setup();
    render(
      <SubjectSelector
        subjects={subjects}
        value=""
        onChange={onChange}
        onCreateSubject={onCreateSubject}
      />,
    );
    await user.click(screen.getByRole("button", { name: "科目を追加" }));
    await user.type(screen.getByPlaceholderText("例: 数学、英語"), "理科");
    await user.click(screen.getByRole("button", { name: "作成" }));
    expect(onCreateSubject).toHaveBeenCalledWith("理科");
    expect(onChange).toHaveBeenCalledWith("sub-3");
  });
});
```

- [ ] **Step 5: 全テスト実行**

Run: `bun test:small`
Expected: 全テスト PASS

テスト失敗時の対応:
- `MaterialWithMethods` 型が不一致 → `src/lib/types/materials.ts` を確認して fixture を修正
- Select コンポーネントのモック問題 → Radix UI の Select は JSDOM でレンダリング困難な場合があるので、`subject-selector.test.tsx` は基本的な表示とボタンのみテストし、Select の内部動作はテストしない

- [ ] **Step 6: コミット**

```bash
git add tests/small/components/
git commit -m "test: 未テストコンポーネント 4 件のテストを追加"
```

### Task 16: PBI 3 完了確認 + push

- [ ] **Step 1: 全テスト + 型チェック + lint**

Run: `bun check`
Expected: 全て PASS

- [ ] **Step 2: push**

Run: `git push`

---

## 完了タスク

### Task 17: Issue クローズ + ドキュメント更新

- [ ] **Step 1: Sub-issues をクローズ**

```bash
gh issue close 117
gh issue close 118
gh issue close 119
gh issue close 116
```

- [ ] **Step 2: CLAUDE.md の更新** (必要に応じて)

`src/hooks/` ディレクトリが新規追加されたため、Directory Structure に追記:

```
src/
  hooks/            # Shared custom hooks
```

- [ ] **Step 3: Project Board のステータスを Done に更新**

- [ ] **Step 4: コミット + push**

```bash
git add CLAUDE.md
git commit -m "docs: hooks ディレクトリを Directory Structure に追加"
git push
```
