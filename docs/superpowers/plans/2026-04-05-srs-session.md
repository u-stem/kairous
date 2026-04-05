# SRS セッション実行フロー Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 教材の due カードをフリップ形式で学習し、セッション自己評価 → FSRS 更新 → daily_logs 記録までの一連フローを実装する。

**Architecture:** Server Component でデータ取得、Client Component でカードフリップ UI を管理。カード評価はクライアント状態で蓄積し、全カード完了後にまとめて Server Action → Edge Function で FSRS 計算・DB 更新する。

**Tech Stack:** Next.js 16 (App Router) / TypeScript / Supabase (PostgreSQL + Edge Functions) / ts-fsrs (FSRS-5) / zod v4 / date-fns / vitest

**Spec:** `docs/superpowers/specs/2026-04-05-srs-session-design.md`

---

## File Structure

```
src/
  app/
    (main)/
      page.tsx                              # REPLACE: Today ページ
      today-material-list.tsx               # CREATE: 教材リスト Client Component
    session/
      [id]/
        page.tsx                            # CREATE: セッション Server Component
        session-player.tsx                  # CREATE: カードフリップ Client Component
        use-session-player.ts              # CREATE: セッション状態管理 hook
        review/
          page.tsx                          # CREATE: 自己評価 Server Component
          session-review.tsx                # CREATE: 自己評価 Client Component
        summary/
          page.tsx                          # CREATE: サマリー Server Component
          summary-actions.tsx               # CREATE: サマリーアクション Client Component
    rest/
      [id]/
        page.tsx                            # CREATE: 安静タイマー Server Component
        rest-timer.tsx                      # CREATE: タイマー Client Component
        use-rest-timer.ts                   # CREATE: タイマー hook
  components/
    start-session-button.tsx                # CREATE: セッション開始ボタン (共通)
  lib/
    actions/
      sessions.ts                           # CREATE: セッション CRUD
    validations/
      sessions.ts                           # CREATE: セッション入力スキーマ
    types/
      sessions.ts                           # CREATE: セッション関連型
    constants.ts                            # MODIFY: セッション定数追加
    session-utils.ts                        # CREATE: セッション統計ユーティリティ
supabase/
  migrations/
    00004_add_srs_state_column.sql          # CREATE: srs_states.state カラム
  functions/
    complete-session/
      index.ts                              # CREATE: FSRS + daily_logs
tests/
  small/
    lib/
      validations/
        sessions.test.ts                    # CREATE: バリデーションテスト
      session-utils.test.ts                 # CREATE: ユーティリティテスト
    app/
      session/
        use-session-player.test.ts          # CREATE: hook テスト
      rest/
        use-rest-timer.test.ts              # CREATE: タイマー hook テスト
  medium/
    lib/actions/
      sessions.test.ts                      # CREATE: Server Action テスト
    helpers/
      db.ts                                 # MODIFY: セッション用ヘルパー追加
```

---

### Task 1: DB Migration + Dependencies

**Files:**
- Create: `supabase/migrations/00004_add_srs_state_column.sql`
- Modify: `package.json` (ts-fsrs 追加)

- [ ] **Step 1: マイグレーションファイルを作成**

```sql
-- supabase/migrations/00004_add_srs_state_column.sql

-- ts-fsrs の Card.state に対応するカラムを追加
-- FSRS-5 アルゴリズムが入力として state を要求するため
ALTER TABLE srs_states ADD COLUMN state TEXT NOT NULL DEFAULT 'New'
  CHECK (state IN ('New', 'Learning', 'Review', 'Relearning'));
```

- [ ] **Step 2: マイグレーションを実行**

Run: `bunx supabase db reset`
Expected: `Finished supabase db reset`

- [ ] **Step 3: DB 型を再生成**

Run: `bunx supabase gen types typescript --local > src/lib/types/database.ts`
Expected: `src/lib/types/database.ts` に `state` カラムが追加されている

- [ ] **Step 4: ts-fsrs をインストール**

Run: `bun add ts-fsrs@4.6.0`

注: npm で最新の 4.x を確認し、そのバージョンを指定すること。

- [ ] **Step 5: typecheck が通ることを確認**

Run: `bun typecheck`
Expected: エラーなし

- [ ] **Step 6: コミット**

```bash
git add supabase/migrations/00004_add_srs_state_column.sql src/lib/types/database.ts package.json bun.lock
git commit -m "feat: srs_states に state カラム追加、ts-fsrs インストール"
```

---

### Task 2: セッション型 + 定数 + バリデーションスキーマ

**Files:**
- Create: `src/lib/types/sessions.ts`
- Create: `src/lib/validations/sessions.ts`
- Create: `tests/small/lib/validations/sessions.test.ts`
- Modify: `src/lib/constants.ts`

- [ ] **Step 1: Small テストを作成**

```typescript
// tests/small/lib/validations/sessions.test.ts
import { describe, it, expect } from "vitest";
import {
  createSessionSchema,
  completeSessionSchema,
  createRestSessionSchema,
  cardReviewSchema,
} from "@/lib/validations/sessions";

const VALID_UUID = "550e8400-e29b-41d4-a716-446655440000";

describe("cardReviewSchema", () => {
  const valid = {
    card_id: VALID_UUID,
    rating: 3,
    started_at: "2026-04-05T10:00:00.000Z",
    answered_at: "2026-04-05T10:00:05.000Z",
  };

  it("有効なレビューを受け付ける", () => {
    expect(cardReviewSchema.safeParse(valid).success).toBe(true);
  });

  it("rating 0 を拒否する", () => {
    expect(cardReviewSchema.safeParse({ ...valid, rating: 0 }).success).toBe(false);
  });

  it("rating 5 を拒否する", () => {
    expect(cardReviewSchema.safeParse({ ...valid, rating: 5 }).success).toBe(false);
  });

  it("無効な card_id を拒否する", () => {
    expect(cardReviewSchema.safeParse({ ...valid, card_id: "bad" }).success).toBe(false);
  });
});

describe("createSessionSchema", () => {
  it("有効なデータを受け付ける", () => {
    const result = createSessionSchema.safeParse({
      materialId: VALID_UUID,
      methodId: VALID_UUID,
    });
    expect(result.success).toBe(true);
  });

  it("無効な materialId を拒否する", () => {
    const result = createSessionSchema.safeParse({
      materialId: "bad",
      methodId: VALID_UUID,
    });
    expect(result.success).toBe(false);
  });

  it("無効な methodId を拒否する", () => {
    const result = createSessionSchema.safeParse({
      materialId: VALID_UUID,
      methodId: "bad",
    });
    expect(result.success).toBe(false);
  });
});

describe("completeSessionSchema", () => {
  const valid = {
    sessionId: VALID_UUID,
    reviews: [{
      card_id: VALID_UUID,
      rating: 3,
      started_at: "2026-04-05T10:00:00.000Z",
      answered_at: "2026-04-05T10:00:05.000Z",
    }],
    selfRating: 3,
  };

  it("有効なデータを受け付ける", () => {
    expect(completeSessionSchema.safeParse(valid).success).toBe(true);
  });

  it("空の reviews を拒否する", () => {
    expect(completeSessionSchema.safeParse({ ...valid, reviews: [] }).success).toBe(false);
  });

  it("selfRating 0 を拒否する", () => {
    expect(completeSessionSchema.safeParse({ ...valid, selfRating: 0 }).success).toBe(false);
  });

  it("selfRating 5 を拒否する", () => {
    expect(completeSessionSchema.safeParse({ ...valid, selfRating: 5 }).success).toBe(false);
  });
});

describe("createRestSessionSchema", () => {
  it("有効な parentSessionId を受け付ける", () => {
    expect(createRestSessionSchema.safeParse({ parentSessionId: VALID_UUID }).success).toBe(true);
  });

  it("無効な parentSessionId を拒否する", () => {
    expect(createRestSessionSchema.safeParse({ parentSessionId: "bad" }).success).toBe(false);
  });
});
```

- [ ] **Step 2: テスト実行 (Red)**

Run: `bun test:small -- tests/small/lib/validations/sessions.test.ts`
Expected: FAIL (モジュールが存在しない)

- [ ] **Step 3: セッション型を作成**

```typescript
// src/lib/types/sessions.ts

// カード個別評価 (クライアントで蓄積し、セッション完了時にまとめて送信)
export type CardReview = {
  card_id: string;
  rating: 1 | 2 | 3 | 4;
  started_at: string;  // ISO 8601
  answered_at: string; // ISO 8601
};

// セッション画面に渡すカードデータ
export type SessionCard = {
  id: string;
  front: string;
  back: string;
  display_order: number;
};

// Today ページ用: due カードがある教材
export type DueMaterial = {
  id: string;
  title: string;
  subject: { id: string; name: string; color: string };
  due_count: number;
  srs_method_id: string;
};

// サマリー画面用: セッション詳細
export type SessionDetail = {
  id: string;
  material: {
    id: string;
    title: string;
    subject: { name: string };
  } | null;
  method: { slug: string; name: string };
  method_id: string;
  status: string;
  duration_sec: number;
  self_rating: number | null;
  started_at: string;
  ended_at: string | null;
  card_reviews: Array<{
    card_id: string;
    rating: number;
    response_ms: number;
    card: { front: string; back: string };
  }>;
  remaining_due_count: number;
};
```

- [ ] **Step 4: 定数を追加**

`src/lib/constants.ts` の末尾に追加:

```typescript
// セッション
export const SESSION_MAX_CARDS = 20;
export const REST_DURATION_SEC = 600;

export const RATING_LABELS = {
  1: "忘れた",
  2: "曖昧",
  3: "正解",
  4: "簡単",
} as const;

export const SELF_RATING_LABELS = {
  1: "ほとんど思い出せなかった",
  2: "曖昧な部分が多かった",
  3: "おおむね理解できた",
  4: "完璧に理解した",
} as const;

export const RATING_COLORS = {
  1: "bg-red-500",
  2: "bg-orange-500",
  3: "bg-green-500",
  4: "bg-blue-500",
} as const;
```

- [ ] **Step 5: バリデーションスキーマを作成**

```typescript
// src/lib/validations/sessions.ts
import { z } from "zod";

// ActionResult は既存の materials.ts から re-export
export { type ActionResult, extractFieldErrors } from "./materials";

export const cardReviewSchema = z.object({
  card_id: z.uuid("無効なカードIDです"),
  rating: z.number().int().min(1, "評価は1以上です").max(4, "評価は4以下です"),
  started_at: z.string().min(1, "開始時刻が必要です"),
  answered_at: z.string().min(1, "回答時刻が必要です"),
});

export const createSessionSchema = z.object({
  materialId: z.uuid("無効な教材IDです"),
  methodId: z.uuid("無効な学習手法IDです"),
});

export const completeSessionSchema = z.object({
  sessionId: z.uuid("無効なセッションIDです"),
  reviews: z.array(cardReviewSchema).min(1, "レビューが空です"),
  selfRating: z.number().int().min(1, "評価は1以上です").max(4, "評価は4以下です"),
});

export const createRestSessionSchema = z.object({
  parentSessionId: z.uuid("無効なセッションIDです"),
});

export type CardReviewInput = z.infer<typeof cardReviewSchema>;
export type CreateSessionInput = z.infer<typeof createSessionSchema>;
export type CompleteSessionInput = z.infer<typeof completeSessionSchema>;
export type CreateRestSessionInput = z.infer<typeof createRestSessionSchema>;
```

- [ ] **Step 6: テスト実行 (Green)**

Run: `bun test:small -- tests/small/lib/validations/sessions.test.ts`
Expected: すべて PASS

- [ ] **Step 7: typecheck**

Run: `bun typecheck`
Expected: エラーなし

- [ ] **Step 8: コミット**

```bash
git add src/lib/types/sessions.ts src/lib/validations/sessions.ts src/lib/constants.ts tests/small/lib/validations/sessions.test.ts
git commit -m "feat: セッション型、定数、バリデーションスキーマを追加"
```

---

### Task 3: セッションユーティリティ関数

**Files:**
- Create: `src/lib/session-utils.ts`
- Create: `tests/small/lib/session-utils.test.ts`

- [ ] **Step 1: Small テストを作成**

```typescript
// tests/small/lib/session-utils.test.ts
import { describe, it, expect } from "vitest";
import {
  calculateAccuracyRate,
  formatDuration,
  calculateResponseMs,
  countByRating,
} from "@/lib/session-utils";

describe("calculateAccuracyRate", () => {
  it("rating 3 以上を正解として割合を返す", () => {
    const reviews = [{ rating: 1 }, { rating: 2 }, { rating: 3 }, { rating: 4 }];
    expect(calculateAccuracyRate(reviews)).toBe(0.5);
  });

  it("空配列で 0 を返す", () => {
    expect(calculateAccuracyRate([])).toBe(0);
  });

  it("全問正解で 1 を返す", () => {
    expect(calculateAccuracyRate([{ rating: 3 }, { rating: 4 }])).toBe(1);
  });

  it("全問不正解で 0 を返す", () => {
    expect(calculateAccuracyRate([{ rating: 1 }, { rating: 2 }])).toBe(0);
  });
});

describe("formatDuration", () => {
  it("秒数を m:ss 形式に変換する", () => {
    expect(formatDuration(272)).toBe("4:32");
  });

  it("0 秒を 0:00 に変換する", () => {
    expect(formatDuration(0)).toBe("0:00");
  });

  it("秒数が 1 桁の場合はゼロパディングする", () => {
    expect(formatDuration(65)).toBe("1:05");
  });

  it("60 秒を 1:00 に変換する", () => {
    expect(formatDuration(60)).toBe("1:00");
  });
});

describe("calculateResponseMs", () => {
  it("2 つの ISO 文字列の差をミリ秒で返す", () => {
    expect(calculateResponseMs(
      "2026-04-05T10:00:00.000Z",
      "2026-04-05T10:00:05.000Z",
    )).toBe(5000);
  });

  it("同一時刻で 0 を返す", () => {
    expect(calculateResponseMs(
      "2026-04-05T10:00:00.000Z",
      "2026-04-05T10:00:00.000Z",
    )).toBe(0);
  });
});

describe("countByRating", () => {
  it("rating 別のカウントを返す", () => {
    const reviews = [{ rating: 1 }, { rating: 3 }, { rating: 3 }, { rating: 4 }];
    expect(countByRating(reviews)).toEqual({ 1: 1, 2: 0, 3: 2, 4: 1 });
  });

  it("空配列で全て 0 を返す", () => {
    expect(countByRating([])).toEqual({ 1: 0, 2: 0, 3: 0, 4: 0 });
  });
});
```

- [ ] **Step 2: テスト実行 (Red)**

Run: `bun test:small -- tests/small/lib/session-utils.test.ts`
Expected: FAIL

- [ ] **Step 3: ユーティリティ関数を実装**

```typescript
// src/lib/session-utils.ts

export function calculateAccuracyRate(reviews: Array<{ rating: number }>): number {
  if (reviews.length === 0) return 0;
  const correct = reviews.filter((r) => r.rating >= 3).length;
  return correct / reviews.length;
}

export function formatDuration(totalSeconds: number): string {
  const minutes = Math.floor(totalSeconds / 60);
  const seconds = totalSeconds % 60;
  return `${minutes}:${String(seconds).padStart(2, "0")}`;
}

export function calculateResponseMs(startedAt: string, answeredAt: string): number {
  return new Date(answeredAt).getTime() - new Date(startedAt).getTime();
}

export function countByRating(
  reviews: Array<{ rating: number }>,
): Record<1 | 2 | 3 | 4, number> {
  const counts = { 1: 0, 2: 0, 3: 0, 4: 0 } as Record<1 | 2 | 3 | 4, number>;
  for (const r of reviews) {
    if (r.rating >= 1 && r.rating <= 4) {
      counts[r.rating as 1 | 2 | 3 | 4]++;
    }
  }
  return counts;
}
```

- [ ] **Step 4: テスト実行 (Green)**

Run: `bun test:small -- tests/small/lib/session-utils.test.ts`
Expected: すべて PASS

- [ ] **Step 5: コミット**

```bash
git add src/lib/session-utils.ts tests/small/lib/session-utils.test.ts
git commit -m "feat: セッション統計ユーティリティ関数を追加"
```

---

### Task 4: テストヘルパー + getDueMaterials Server Action

**Files:**
- Modify: `tests/medium/helpers/db.ts`
- Create: `src/lib/actions/sessions.ts`
- Create: `tests/medium/lib/actions/sessions.test.ts`

- [ ] **Step 1: テストヘルパーを追加**

`tests/medium/helpers/db.ts` の末尾に追加:

```typescript
export async function createTestCard(
  materialId: string,
  front = "テスト表面",
  back = "テスト裏面",
  displayOrder = 0,
) {
  const result = await adminClient
    .from("cards")
    .insert({ material_id: materialId, front, back, display_order: displayOrder })
    .select()
    .single();
  if (result.error) throw new Error(`テストカード作成失敗: ${result.error.message}`);
  return result.data as { id: string; material_id: string; front: string; back: string; display_order: number };
}

export async function getSrsMethodId(): Promise<string> {
  const { data } = await adminClient
    .from("learning_methods")
    .select("id")
    .eq("slug", "srs")
    .single();
  if (!data) throw new Error("SRS method not found in seed data");
  return data.id;
}

export async function getWakefulRestMethodId(): Promise<string> {
  const { data } = await adminClient
    .from("learning_methods")
    .select("id")
    .eq("slug", "wakeful_rest")
    .single();
  if (!data) throw new Error("wakeful_rest method not found in seed data");
  return data.id;
}

export async function linkMaterialMethod(materialId: string, methodId: string) {
  const { error } = await adminClient
    .from("material_methods")
    .insert({ material_id: materialId, method_id: methodId });
  if (error) throw new Error(`material_methods 紐付け失敗: ${error.message}`);
}

export async function createTestSrsState(
  cardId: string,
  userId: string,
  dueDate: string,
  state = "New",
) {
  const { error } = await adminClient
    .from("srs_states")
    .insert({
      card_id: cardId,
      user_id: userId,
      due_date: dueDate,
      state,
      stability: 1.0,
      difficulty: 5.0,
    });
  if (error) throw new Error(`テスト srs_state 作成失敗: ${error.message}`);
}

export async function createTestSession(
  userId: string,
  materialId: string,
  methodId: string,
  status = "in_progress",
) {
  const result = await adminClient
    .from("sessions")
    .insert({ user_id: userId, material_id: materialId, method_id: methodId, status })
    .select()
    .single();
  if (result.error) throw new Error(`テストセッション作成失敗: ${result.error.message}`);
  return result.data as { id: string; user_id: string; material_id: string; method_id: string; status: string; started_at: string };
}
```

ファイル先頭の `import { adminClient } from "../setup";` は既存。新しいヘルパーも同じ `adminClient` を使う。

- [ ] **Step 2: Medium テストを作成 (getDueMaterials)**

```typescript
// tests/medium/lib/actions/sessions.test.ts
import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { adminClient, createTestUser, deleteTestUser } from "../../setup";
import {
  createTestSubject,
  createTestMaterial,
  createTestCard,
  getSrsMethodId,
  linkMaterialMethod,
  createTestSrsState,
  cleanupTestData,
} from "../../helpers/db";

let userId: string;
let subjectId: string;
let materialId: string;
let srsMethodId: string;

beforeAll(async () => {
  userId = await createTestUser();
  srsMethodId = await getSrsMethodId();
  const subject = await createTestSubject(userId, "数学");
  subjectId = subject.id;
  const material = await createTestMaterial(subjectId, userId, "微分積分");
  materialId = material.id;
  await linkMaterialMethod(materialId, srsMethodId);
});

afterAll(async () => {
  await cleanupTestData(userId);
  await deleteTestUser(userId);
});

describe("getDueMaterials (DB integration)", () => {
  it("due カードがある教材を返す", async () => {
    const card = await createTestCard(materialId, "Q1", "A1");
    // srs_state なし = 新規カード = due 扱い

    // adminClient で直接クエリして getDueMaterials の期待動作を検証
    const today = new Date().toISOString().split("T")[0];
    const { data: allCards } = await adminClient
      .from("cards")
      .select("id")
      .eq("material_id", materialId);

    const cardIds = allCards!.map((c) => c.id);
    const { data: notDueStates } = await adminClient
      .from("srs_states")
      .select("card_id")
      .eq("user_id", userId)
      .gt("due_date", today)
      .in("card_id", cardIds);

    const notDueIds = new Set((notDueStates ?? []).map((s) => s.card_id));
    const dueCount = allCards!.filter((c) => !notDueIds.has(c.id)).length;

    expect(dueCount).toBeGreaterThan(0);
  });

  it("due_date が未来のカードは due に含まれない", async () => {
    const card = await createTestCard(materialId, "Q-future", "A-future", 10);
    // due_date を 1 年後に設定
    const futureDate = "2027-04-05";
    await createTestSrsState(card.id, userId, futureDate, "Review");

    const today = new Date().toISOString().split("T")[0];
    const { data: state } = await adminClient
      .from("srs_states")
      .select("due_date")
      .eq("card_id", card.id)
      .eq("user_id", userId)
      .single();

    expect(state!.due_date > today).toBe(true);
  });
});
```

- [ ] **Step 3: テスト実行 (Red)**

Run: `bun test:medium -- tests/medium/lib/actions/sessions.test.ts`
Expected: PASS (ヘルパー動作確認のみ。getDueMaterials の Action テストは Step 5 で追加)

- [ ] **Step 4: getDueMaterials を実装**

```typescript
// src/lib/actions/sessions.ts
"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import {
  createSessionSchema,
  completeSessionSchema,
  createRestSessionSchema,
  extractFieldErrors,
} from "@/lib/validations/sessions";
import type { ActionResult } from "@/lib/validations/materials";
import type { DueMaterial, SessionCard, SessionDetail } from "@/lib/types/sessions";
import type { CardReview } from "@/lib/types/sessions";
import { SESSION_MAX_CARDS, REST_DURATION_SEC } from "@/lib/constants";

export async function getDueMaterials(): Promise<DueMaterial[]> {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return [];

  // SRS 手法が紐付いている教材を取得
  const { data: materials } = await supabase
    .from("materials")
    .select(`
      id, title,
      subjects!inner(id, name, color),
      material_methods!inner(
        learning_methods!inner(id, slug)
      )
    `)
    .eq("user_id", user.id);

  if (!materials || materials.length === 0) return [];

  // SRS 手法を持つ教材のみ抽出し、method_id を取得
  const srsMaterials: Array<{
    id: string;
    title: string;
    subject: { id: string; name: string; color: string };
    srs_method_id: string;
  }> = [];

  for (const m of materials) {
    const methods = m.material_methods as unknown as Array<{
      learning_methods: { id: string; slug: string };
    }>;
    const srsMethod = methods.find((mm) => mm.learning_methods.slug === "srs");
    if (srsMethod) {
      srsMaterials.push({
        id: m.id,
        title: m.title,
        subject: m.subjects as unknown as { id: string; name: string; color: string },
        srs_method_id: srsMethod.learning_methods.id,
      });
    }
  }

  if (srsMaterials.length === 0) return [];

  // due_count 集計: カードが srs_state を持たない(新規) or due_date <= today なら due
  const materialIds = srsMaterials.map((m) => m.id);
  const today = new Date().toISOString().split("T")[0];

  const { data: allCards } = await supabase
    .from("cards")
    .select("id, material_id")
    .in("material_id", materialIds);

  if (!allCards || allCards.length === 0) return [];

  // due_date が明日以降のカード(= 今日は due でない)を取得
  const cardIds = allCards.map((c) => c.id);
  const { data: notDueStates } = await supabase
    .from("srs_states")
    .select("card_id")
    .eq("user_id", user.id)
    .gt("due_date", today)
    .in("card_id", cardIds);

  const notDueCardIds = new Set((notDueStates ?? []).map((s) => s.card_id));

  // due_count = 全カード - not due カード
  const dueCountMap = new Map<string, number>();
  for (const card of allCards) {
    if (!notDueCardIds.has(card.id)) {
      dueCountMap.set(card.material_id, (dueCountMap.get(card.material_id) ?? 0) + 1);
    }
  }

  return srsMaterials
    .map((m) => ({ ...m, due_count: dueCountMap.get(m.id) ?? 0 }))
    .filter((m) => m.due_count > 0);
}
```

- [ ] **Step 5: typecheck**

Run: `bun typecheck`
Expected: エラーなし

- [ ] **Step 6: コミット**

```bash
git add src/lib/actions/sessions.ts tests/medium/helpers/db.ts tests/medium/lib/actions/sessions.test.ts
git commit -m "feat: getDueMaterials Server Action + テストヘルパー"
```

---

### Task 5: createSession + getSessionCards Server Actions

**Files:**
- Modify: `src/lib/actions/sessions.ts`
- Modify: `tests/medium/lib/actions/sessions.test.ts`

- [ ] **Step 1: Medium テストを追加**

`tests/medium/lib/actions/sessions.test.ts` に追加:

```typescript
describe("createSession (DB integration)", () => {
  it("sessions テーブルに in_progress で INSERT される", async () => {
    const { data: session, error } = await adminClient
      .from("sessions")
      .insert({
        user_id: userId,
        material_id: materialId,
        method_id: srsMethodId,
        status: "in_progress",
      })
      .select()
      .single();

    expect(error).toBeNull();
    expect(session!.status).toBe("in_progress");
    expect(session!.material_id).toBe(materialId);

    // cleanup
    await adminClient.from("sessions").delete().eq("id", session!.id);
  });
});

describe("getSessionCards (DB integration)", () => {
  it("due カードのみ返し、最大 20 枚に制限する", async () => {
    // 25 枚のカードを作成
    const cards = [];
    for (let i = 0; i < 25; i++) {
      cards.push(await createTestCard(materialId, `Q${i}`, `A${i}`, i));
    }

    // 5 枚は due_date を未来に設定
    for (let i = 0; i < 5; i++) {
      await createTestSrsState(cards[i].id, userId, "2027-01-01", "Review");
    }

    // 残り 20 枚は srs_state なし(新規) = due
    const today = new Date().toISOString().split("T")[0];
    const cardIds = cards.map((c) => c.id);

    const { data: notDueStates } = await adminClient
      .from("srs_states")
      .select("card_id")
      .eq("user_id", userId)
      .gt("due_date", today)
      .in("card_id", cardIds);

    const notDueIds = new Set((notDueStates ?? []).map((s) => s.card_id));
    const dueCards = cards
      .filter((c) => !notDueIds.has(c.id))
      .slice(0, 20);

    expect(dueCards.length).toBe(20);
  });
});
```

- [ ] **Step 2: テスト実行で動作確認**

Run: `bun test:medium -- tests/medium/lib/actions/sessions.test.ts`
Expected: PASS

- [ ] **Step 3: createSession を実装**

`src/lib/actions/sessions.ts` に追加:

```typescript
export async function createSession(
  materialId: string,
  methodId: string,
): Promise<ActionResult<{ id: string }>> {
  const parsed = createSessionSchema.safeParse({ materialId, methodId });
  if (!parsed.success) {
    return {
      success: false,
      error: "入力内容を確認してください",
      fieldErrors: extractFieldErrors(parsed.error),
    };
  }

  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { success: false, error: "認証が必要です" };

  // 教材の所有権確認
  const { data: material } = await supabase
    .from("materials")
    .select("id")
    .eq("id", parsed.data.materialId)
    .eq("user_id", user.id)
    .single();

  if (!material) return { success: false, error: "教材が見つかりません" };

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

  if (error) return { success: false, error: "セッションの作成に失敗しました" };

  return { success: true, data: { id: session.id } };
}
```

- [ ] **Step 4: getSessionCards を実装**

`src/lib/actions/sessions.ts` に追加:

```typescript
export async function getSessionCards(sessionId: string): Promise<SessionCard[]> {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return [];

  // セッションの所有権確認 + material_id 取得
  const { data: session } = await supabase
    .from("sessions")
    .select("material_id")
    .eq("id", sessionId)
    .eq("user_id", user.id)
    .single();

  if (!session?.material_id) return [];

  const today = new Date().toISOString().split("T")[0];

  // 教材の全カードを取得
  const { data: allCards } = await supabase
    .from("cards")
    .select("id, front, back, display_order")
    .eq("material_id", session.material_id)
    .order("display_order");

  if (!allCards || allCards.length === 0) return [];

  // due_date が明日以降のカードを除外
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
```

- [ ] **Step 5: typecheck**

Run: `bun typecheck`
Expected: エラーなし

- [ ] **Step 6: コミット**

```bash
git add src/lib/actions/sessions.ts tests/medium/lib/actions/sessions.test.ts
git commit -m "feat: createSession, getSessionCards Server Actions"
```

---

### Task 6: Edge Function: complete-session

**Files:**
- Create: `supabase/functions/complete-session/index.ts`

**前提:** Edge Function のローカルテストには `bunx supabase functions serve` が必要。

- [ ] **Step 1: Edge Function を作成**

```typescript
// supabase/functions/complete-session/index.ts
import { createClient } from "npm:@supabase/supabase-js@2";
import {
  fsrs,
  createEmptyCard,
  Rating,
  State,
  type Card as FSRSCard,
} from "npm:ts-fsrs@4";

const FSRS_STATE_MAP: Record<string, State> = {
  New: State.New,
  Learning: State.Learning,
  Review: State.Review,
  Relearning: State.Relearning,
};

const FSRS_STATE_TEXT: Record<number, string> = {
  [State.New]: "New",
  [State.Learning]: "Learning",
  [State.Review]: "Review",
  [State.Relearning]: "Relearning",
};

type ReviewInput = {
  card_id: string;
  rating: 1 | 2 | 3 | 4;
  started_at: string;
  answered_at: string;
};

Deno.serve(async (req) => {
  const { session_id, reviews } = (await req.json()) as {
    session_id: string;
    reviews: ReviewInput[];
  };

  const supabase = createClient(
    Deno.env.get("SUPABASE_URL")!,
    Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
  );

  // 1. セッション情報を取得
  const { data: session, error: sessionError } = await supabase
    .from("sessions")
    .select("material_id, method_id, user_id, duration_sec")
    .eq("id", session_id)
    .single();

  if (sessionError || !session) {
    return new Response(
      JSON.stringify({ error: "Session not found" }),
      { status: 404, headers: { "Content-Type": "application/json" } },
    );
  }

  // 2. card_reviews 一括 INSERT
  const reviewRows = reviews.map((r) => ({
    session_id,
    card_id: r.card_id,
    rating: r.rating,
    response_ms: new Date(r.answered_at).getTime() - new Date(r.started_at).getTime(),
    reviewed_at: r.answered_at,
  }));

  const { error: reviewError } = await supabase
    .from("card_reviews")
    .insert(reviewRows);

  if (reviewError) {
    return new Response(
      JSON.stringify({ error: `card_reviews INSERT failed: ${reviewError.message}` }),
      { status: 500, headers: { "Content-Type": "application/json" } },
    );
  }

  // 3. 各カードの現在の srs_states を取得
  const cardIds = reviews.map((r) => r.card_id);
  const { data: existingStates } = await supabase
    .from("srs_states")
    .select("id, card_id, stability, difficulty, reps, lapses, due_date, state, last_reviewed_at")
    .eq("user_id", session.user_id)
    .in("card_id", cardIds);

  const stateMap = new Map(
    (existingStates ?? []).map((s) => [s.card_id, s]),
  );

  // 4. FSRS-5 計算 + srs_states 更新
  const f = fsrs();
  const now = new Date();

  for (const review of reviews) {
    const existing = stateMap.get(review.card_id);

    let card: FSRSCard;
    if (existing) {
      const lastReview = existing.last_reviewed_at
        ? new Date(existing.last_reviewed_at)
        : undefined;
      card = {
        due: new Date(existing.due_date),
        stability: existing.stability,
        difficulty: existing.difficulty,
        elapsed_days: lastReview
          ? Math.max(0, Math.floor((now.getTime() - lastReview.getTime()) / 86400000))
          : 0,
        scheduled_days: 0,
        reps: existing.reps,
        lapses: existing.lapses,
        state: FSRS_STATE_MAP[existing.state] ?? State.New,
        last_review: lastReview,
      };
    } else {
      card = createEmptyCard(now);
    }

    // rating 1-4 は Rating.Again=1, Hard=2, Good=3, Easy=4 と一致
    const scheduling = f.repeat(card, now);
    const result = scheduling[review.rating as Rating];
    const newCard = result.card;

    const newState = {
      card_id: review.card_id,
      user_id: session.user_id,
      stability: newCard.stability,
      difficulty: newCard.difficulty,
      reps: newCard.reps,
      lapses: newCard.lapses,
      due_date: newCard.due.toISOString().split("T")[0],
      state: FSRS_STATE_TEXT[newCard.state] ?? "New",
      last_reviewed_at: now.toISOString(),
    };

    if (existing) {
      const { error } = await supabase
        .from("srs_states")
        .update(newState)
        .eq("id", existing.id);
      if (error) {
        return new Response(
          JSON.stringify({ error: `srs_states UPDATE failed: ${error.message}` }),
          { status: 500, headers: { "Content-Type": "application/json" } },
        );
      }
    } else {
      const { error } = await supabase
        .from("srs_states")
        .insert(newState);
      if (error) {
        return new Response(
          JSON.stringify({ error: `srs_states INSERT failed: ${error.message}` }),
          { status: 500, headers: { "Content-Type": "application/json" } },
        );
      }
    }
  }

  // 5. daily_logs upsert (安静タイマーセッション = material_id NULL の場合はスキップ)
  if (session.material_id) {
    const { data: material } = await supabase
      .from("materials")
      .select("subject_id")
      .eq("id", session.material_id)
      .single();

    if (material) {
      const logDate = now.toISOString().split("T")[0];

      const { data: existingLog } = await supabase
        .from("daily_logs")
        .select("id, total_sec, session_count, cards_reviewed")
        .eq("user_id", session.user_id)
        .eq("subject_id", material.subject_id)
        .eq("method_id", session.method_id)
        .eq("log_date", logDate)
        .single();

      if (existingLog) {
        await supabase
          .from("daily_logs")
          .update({
            total_sec: existingLog.total_sec + (session.duration_sec ?? 0),
            session_count: existingLog.session_count + 1,
            cards_reviewed: existingLog.cards_reviewed + reviews.length,
          })
          .eq("id", existingLog.id);
      } else {
        await supabase
          .from("daily_logs")
          .insert({
            user_id: session.user_id,
            subject_id: material.subject_id,
            method_id: session.method_id,
            log_date: logDate,
            total_sec: session.duration_sec ?? 0,
            session_count: 1,
            cards_reviewed: reviews.length,
          });
      }
    }
  }

  return new Response(
    JSON.stringify({ success: true }),
    { headers: { "Content-Type": "application/json" } },
  );
});
```

- [ ] **Step 2: ローカルで動作確認**

ターミナル 1:
```bash
bunx supabase functions serve complete-session --env-file .env.local
```

ターミナル 2 (テストデータがある前提):
```bash
curl -X POST http://localhost:54321/functions/v1/complete-session \
  -H "Authorization: Bearer $SUPABASE_SERVICE_ROLE_KEY" \
  -H "Content-Type: application/json" \
  -d '{"session_id":"<test-session-id>","reviews":[{"card_id":"<test-card-id>","rating":3,"started_at":"2026-04-05T10:00:00Z","answered_at":"2026-04-05T10:00:05Z"}]}'
```

Expected: `{"success":true}`

- [ ] **Step 3: Medium テストを追加**

`tests/medium/lib/actions/sessions.test.ts` に追加:

```typescript
describe("complete-session Edge Function (DB integration)", () => {
  it("card_reviews を INSERT し srs_states を作成する", async () => {
    // Setup
    const card = await createTestCard(materialId, "FSRS-test-Q", "FSRS-test-A", 100);
    const session = await createTestSession(userId, materialId, srsMethodId);

    // sessions.status を completed に更新 (Edge Function は session 情報のみ参照)
    await adminClient
      .from("sessions")
      .update({ status: "completed", duration_sec: 120 })
      .eq("id", session.id);

    // Edge Function 呼び出し
    const { error } = await adminClient.functions.invoke("complete-session", {
      body: {
        session_id: session.id,
        reviews: [{
          card_id: card.id,
          rating: 3,
          started_at: "2026-04-05T10:00:00.000Z",
          answered_at: "2026-04-05T10:00:05.000Z",
        }],
      },
    });

    expect(error).toBeNull();

    // card_reviews が INSERT されている
    const { data: reviews } = await adminClient
      .from("card_reviews")
      .select("*")
      .eq("session_id", session.id);

    expect(reviews).toHaveLength(1);
    expect(reviews![0].rating).toBe(3);
    expect(reviews![0].response_ms).toBe(5000);

    // srs_states が作成されている
    const { data: state } = await adminClient
      .from("srs_states")
      .select("*")
      .eq("card_id", card.id)
      .eq("user_id", userId)
      .single();

    expect(state).not.toBeNull();
    expect(state!.reps).toBe(1);
    expect(state!.state).not.toBe("New");

    // daily_logs が作成されている
    const { data: log } = await adminClient
      .from("daily_logs")
      .select("*")
      .eq("user_id", userId)
      .eq("method_id", srsMethodId)
      .single();

    expect(log).not.toBeNull();
    expect(log!.cards_reviewed).toBe(1);
    expect(log!.session_count).toBe(1);
  });
});
```

注: このテストは `bunx supabase functions serve` が起動中の場合のみ PASS する。CI では functions serve をバックグラウンド起動する必要がある。

- [ ] **Step 4: テスト実行**

Run: `bun test:medium -- tests/medium/lib/actions/sessions.test.ts`
Expected: PASS (`bunx supabase functions serve` が起動中であること)

- [ ] **Step 5: コミット**

```bash
git add supabase/functions/complete-session/index.ts tests/medium/lib/actions/sessions.test.ts
git commit -m "feat: complete-session Edge Function (FSRS + card_reviews + daily_logs)"
```

---

### Task 7: completeSession + getSession + createRestSession + completeRestSession

**Files:**
- Modify: `src/lib/actions/sessions.ts`

- [ ] **Step 1: completeSession を実装**

`src/lib/actions/sessions.ts` に追加:

```typescript
export async function completeSession(
  sessionId: string,
  reviews: CardReview[],
  selfRating: number,
): Promise<ActionResult<undefined>> {
  const parsed = completeSessionSchema.safeParse({ sessionId, reviews, selfRating });
  if (!parsed.success) {
    return { success: false, error: "入力内容を確認してください" };
  }

  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { success: false, error: "認証が必要です" };

  // セッションの所有権 + status 確認
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

  // sessions UPDATE
  const { error: updateError } = await supabase
    .from("sessions")
    .update({
      status: "completed",
      duration_sec: durationSec,
      self_rating: parsed.data.selfRating,
      ended_at: now.toISOString(),
    })
    .eq("id", parsed.data.sessionId);

  if (updateError) return { success: false, error: "セッションの更新に失敗しました" };

  // Edge Function 呼び出し
  const { error: fnError } = await supabase.functions.invoke("complete-session", {
    body: {
      session_id: parsed.data.sessionId,
      reviews: parsed.data.reviews,
    },
  });

  if (fnError) {
    console.error("Edge Function 呼び出し失敗:", fnError.message);
    return { success: false, error: "カードレビューの処理に失敗しました" };
  }

  revalidatePath("/");
  return { success: true, data: undefined };
}
```

- [ ] **Step 2: getSession を実装**

```typescript
export async function getSession(sessionId: string): Promise<SessionDetail | null> {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return null;

  const { data: session } = await supabase
    .from("sessions")
    .select(`
      id, method_id, status, duration_sec, self_rating, started_at, ended_at,
      materials(id, title, subjects(name)),
      learning_methods(slug, name)
    `)
    .eq("id", sessionId)
    .eq("user_id", user.id)
    .single();

  if (!session) return null;

  // card_reviews を取得
  const { data: reviews } = await supabase
    .from("card_reviews")
    .select("card_id, rating, response_ms, cards(front, back)")
    .eq("session_id", sessionId);

  // 残りの due カード数を算出
  let remainingDueCount = 0;
  const mat = session.materials as unknown as {
    id: string;
    title: string;
    subjects: { name: string };
  } | null;

  if (mat) {
    const today = new Date().toISOString().split("T")[0];

    const { data: allCards } = await supabase
      .from("cards")
      .select("id")
      .eq("material_id", mat.id);

    if (allCards && allCards.length > 0) {
      const cardIds = allCards.map((c) => c.id);
      const { data: notDueStates } = await supabase
        .from("srs_states")
        .select("card_id")
        .eq("user_id", user.id)
        .gt("due_date", today)
        .in("card_id", cardIds);

      const notDueCardIds = new Set((notDueStates ?? []).map((s) => s.card_id));
      // 今回レビュー済みのカードも除外
      const reviewedCardIds = new Set((reviews ?? []).map((r) => r.card_id));
      remainingDueCount = allCards.filter(
        (c) => !notDueCardIds.has(c.id) && !reviewedCardIds.has(c.id),
      ).length;
    }
  }

  return {
    id: session.id,
    material: mat
      ? { id: mat.id, title: mat.title, subject: { name: mat.subjects.name } }
      : null,
    method: session.learning_methods as unknown as { slug: string; name: string },
    method_id: session.method_id,
    status: session.status,
    duration_sec: session.duration_sec,
    self_rating: session.self_rating,
    started_at: session.started_at,
    ended_at: session.ended_at,
    card_reviews: (reviews ?? []).map((r) => ({
      card_id: r.card_id,
      rating: r.rating,
      response_ms: r.response_ms,
      card: r.cards as unknown as { front: string; back: string },
    })),
    remaining_due_count: remainingDueCount,
  };
}
```

- [ ] **Step 3: createRestSession を実装**

```typescript
export async function createRestSession(
  parentSessionId: string,
): Promise<ActionResult<{ id: string }>> {
  const parsed = createRestSessionSchema.safeParse({ parentSessionId });
  if (!parsed.success) {
    return { success: false, error: "入力内容を確認してください" };
  }

  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { success: false, error: "認証が必要です" };

  // 親セッションの所有権確認
  const { data: parentSession } = await supabase
    .from("sessions")
    .select("id")
    .eq("id", parsed.data.parentSessionId)
    .eq("user_id", user.id)
    .single();

  if (!parentSession) return { success: false, error: "セッションが見つかりません" };

  // wakeful_rest の method_id を取得
  const { data: restMethod } = await supabase
    .from("learning_methods")
    .select("id")
    .eq("slug", "wakeful_rest")
    .single();

  if (!restMethod) return { success: false, error: "安静タイマー手法が見つかりません" };

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

  if (error) return { success: false, error: "安静セッションの作成に失敗しました" };

  return { success: true, data: { id: session.id } };
}
```

- [ ] **Step 4: completeRestSession を実装**

```typescript
export async function completeRestSession(
  sessionId: string,
): Promise<ActionResult<undefined>> {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { success: false, error: "認証が必要です" };

  const { error } = await supabase
    .from("sessions")
    .update({
      status: "completed",
      duration_sec: REST_DURATION_SEC,
      ended_at: new Date().toISOString(),
    })
    .eq("id", sessionId)
    .eq("user_id", user.id)
    .eq("status", "in_progress");

  if (error) return { success: false, error: "セッションの完了に失敗しました" };

  revalidatePath("/");
  return { success: true, data: undefined };
}
```

- [ ] **Step 5: typecheck**

Run: `bun typecheck`
Expected: エラーなし

- [ ] **Step 6: コミット**

```bash
git add src/lib/actions/sessions.ts
git commit -m "feat: completeSession, getSession, createRestSession, completeRestSession"
```

---

### Task 8: Today ページ (/)

**Files:**
- Replace: `src/app/(main)/page.tsx`
- Create: `src/app/(main)/today-material-list.tsx`
- Create: `src/components/start-session-button.tsx`

- [ ] **Step 1: セッション開始ボタン (共通コンポーネント) を作成**

```typescript
// src/components/start-session-button.tsx
"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { createSession } from "@/lib/actions/sessions";

type Props = {
  materialId: string;
  methodId: string;
  label?: string;
  className?: string;
};

export function StartSessionButton({
  materialId,
  methodId,
  label = "学習",
  className = "rounded-md bg-blue-500 px-3 py-1.5 text-xs font-medium text-white hover:bg-blue-600 disabled:opacity-50",
}: Props) {
  const router = useRouter();
  const [loading, setLoading] = useState(false);

  async function handleClick() {
    setLoading(true);
    const result = await createSession(materialId, methodId);
    if (result.success) {
      router.push(`/session/${result.data.id}`);
    }
    setLoading(false);
  }

  return (
    <button onClick={() => void handleClick()} disabled={loading} className={className}>
      {loading ? "..." : label}
    </button>
  );
}
```

- [ ] **Step 2: Today ページの教材リストを作成**

```typescript
// src/app/(main)/today-material-list.tsx
"use client";

import type { DueMaterial } from "@/lib/types/sessions";
import { StartSessionButton } from "@/components/start-session-button";

export function TodayMaterialList({ materials }: { materials: DueMaterial[] }) {
  return (
    <div className="space-y-2">
      {materials.map((m) => (
        <div
          key={m.id}
          className="flex items-center justify-between rounded-lg bg-muted p-3"
        >
          <div>
            <div className="font-medium">{m.title}</div>
            <div className="text-xs text-muted-foreground">{m.subject.name}</div>
          </div>
          <div className="flex items-center gap-2">
            <span className="text-sm text-orange-500">{m.due_count}枚</span>
            <StartSessionButton materialId={m.id} methodId={m.srs_method_id} />
          </div>
        </div>
      ))}
    </div>
  );
}
```

- [ ] **Step 3: Today ページを実装**

```typescript
// src/app/(main)/page.tsx
import { getDueMaterials } from "@/lib/actions/sessions";
import { format } from "date-fns";
import { ja } from "date-fns/locale";
import { TodayMaterialList } from "./today-material-list";

export default async function TodayPage() {
  const materials = await getDueMaterials();
  const today = new Date();
  const dateStr = format(today, "M月d日 EEEE", { locale: ja });

  const totalCards = materials.reduce((sum, m) => sum + m.due_count, 0);

  return (
    <div className="mx-auto max-w-2xl p-4">
      <div className="mb-6">
        <p className="text-sm text-muted-foreground">{dateStr}</p>
        <h1 className="text-2xl font-bold">今日の学習</h1>
      </div>

      {materials.length > 0 ? (
        <>
          <div className="mb-6 grid grid-cols-2 gap-3">
            <div className="rounded-lg bg-muted p-4 text-center">
              <div className="text-2xl font-bold text-orange-500">{totalCards}</div>
              <div className="text-xs text-muted-foreground">復習カード</div>
            </div>
            <div className="rounded-lg bg-muted p-4 text-center">
              <div className="text-2xl font-bold text-blue-500">
                {materials.length}
              </div>
              <div className="text-xs text-muted-foreground">教材</div>
            </div>
          </div>

          <p className="mb-3 text-sm text-muted-foreground">復習が必要な教材</p>
          <TodayMaterialList materials={materials} />
        </>
      ) : (
        <div className="py-12 text-center">
          <p className="text-lg font-medium">復習完了</p>
          <p className="mt-2 text-sm text-muted-foreground">
            今日の復習カードはすべて完了しました
          </p>
        </div>
      )}
    </div>
  );
}
```

- [ ] **Step 4: dev サーバーで表示確認**

Run: `bun dev`
Expected: `http://localhost:3000` で Today ページが表示される

- [ ] **Step 5: typecheck + lint**

Run: `bun typecheck && bun lint`
Expected: エラーなし

- [ ] **Step 6: コミット**

```bash
git add src/app/\(main\)/page.tsx src/app/\(main\)/today-material-list.tsx src/components/start-session-button.tsx
git commit -m "feat: Today ページを due 教材リストに置き換え"
```

---

### Task 9: セッションプレイヤー (/session/[id])

**Files:**
- Create: `src/app/session/[id]/use-session-player.ts`
- Create: `src/app/session/[id]/session-player.tsx`
- Create: `src/app/session/[id]/page.tsx`
- Create: `tests/small/app/session/use-session-player.test.ts`

- [ ] **Step 1: Small テストを作成**

```typescript
// tests/small/app/session/use-session-player.test.ts
import { describe, it, expect } from "vitest";
import { renderHook, act } from "@testing-library/react";
import { useSessionPlayer } from "@/app/session/[id]/use-session-player";
import type { SessionCard } from "@/lib/types/sessions";

const cards: SessionCard[] = [
  { id: "card-1", front: "Q1", back: "A1", display_order: 0 },
  { id: "card-2", front: "Q2", back: "A2", display_order: 1 },
];

describe("useSessionPlayer", () => {
  it("初期状態では最初のカードが表面で表示される", () => {
    const { result } = renderHook(() => useSessionPlayer(cards));
    expect(result.current.currentCard?.id).toBe("card-1");
    expect(result.current.isFlipped).toBe(false);
    expect(result.current.isComplete).toBe(false);
    expect(result.current.progress).toEqual({ current: 1, total: 2 });
  });

  it("flip でカードが裏返る", () => {
    const { result } = renderHook(() => useSessionPlayer(cards));
    act(() => result.current.flip());
    expect(result.current.isFlipped).toBe(true);
  });

  it("rate で次のカードに進み reviews が追加される", () => {
    const { result } = renderHook(() => useSessionPlayer(cards));
    act(() => result.current.flip());
    act(() => result.current.rate(3));

    expect(result.current.currentCard?.id).toBe("card-2");
    expect(result.current.isFlipped).toBe(false);
    expect(result.current.reviews).toHaveLength(1);
    expect(result.current.reviews[0].card_id).toBe("card-1");
    expect(result.current.reviews[0].rating).toBe(3);
  });

  it("全カード完了で isComplete が true になる", () => {
    const { result } = renderHook(() => useSessionPlayer(cards));

    act(() => result.current.flip());
    act(() => result.current.rate(3));
    act(() => result.current.flip());
    act(() => result.current.rate(4));

    expect(result.current.isComplete).toBe(true);
    expect(result.current.reviews).toHaveLength(2);
  });

  it("reviews に started_at と answered_at が含まれる", () => {
    const { result } = renderHook(() => useSessionPlayer(cards));
    act(() => result.current.flip());
    act(() => result.current.rate(3));

    const review = result.current.reviews[0];
    expect(review.started_at).toBeTruthy();
    expect(review.answered_at).toBeTruthy();
    expect(new Date(review.answered_at).getTime()).toBeGreaterThanOrEqual(
      new Date(review.started_at).getTime(),
    );
  });
});
```

- [ ] **Step 2: テスト実行 (Red)**

Run: `bun test:small -- tests/small/app/session/use-session-player.test.ts`
Expected: FAIL

- [ ] **Step 3: useSessionPlayer hook を作成**

```typescript
// src/app/session/[id]/use-session-player.ts
"use client";

import { useState, useRef } from "react";
import type { CardReview, SessionCard } from "@/lib/types/sessions";

export function useSessionPlayer(cards: SessionCard[]) {
  const [currentIndex, setCurrentIndex] = useState(0);
  const [isFlipped, setIsFlipped] = useState(false);
  const [reviews, setReviews] = useState<CardReview[]>([]);
  const cardStartedAt = useRef(new Date().toISOString());

  const currentCard = currentIndex < cards.length ? cards[currentIndex] : null;
  const isComplete = currentIndex >= cards.length;
  const progress = { current: Math.min(currentIndex + 1, cards.length), total: cards.length };

  function flip() {
    setIsFlipped(true);
  }

  function rate(rating: 1 | 2 | 3 | 4) {
    if (!currentCard) return;
    const now = new Date().toISOString();
    const review: CardReview = {
      card_id: currentCard.id,
      rating,
      started_at: cardStartedAt.current,
      answered_at: now,
    };
    setReviews((prev) => [...prev, review]);
    setIsFlipped(false);
    setCurrentIndex((prev) => prev + 1);
    cardStartedAt.current = now;
  }

  return { currentCard, isFlipped, isComplete, progress, reviews, flip, rate };
}
```

- [ ] **Step 4: テスト実行 (Green)**

Run: `bun test:small -- tests/small/app/session/use-session-player.test.ts`
Expected: すべて PASS

- [ ] **Step 5: SessionPlayer コンポーネントを作成**

```typescript
// src/app/session/[id]/session-player.tsx
"use client";

import { useEffect } from "react";
import { useRouter } from "next/navigation";
import { useSessionPlayer } from "./use-session-player";
import { RATING_LABELS, RATING_COLORS } from "@/lib/constants";
import type { SessionCard } from "@/lib/types/sessions";

type Props = {
  sessionId: string;
  cards: SessionCard[];
};

export function SessionPlayer({ sessionId, cards }: Props) {
  const router = useRouter();
  const { currentCard, isFlipped, isComplete, progress, reviews, flip, rate } =
    useSessionPlayer(cards);

  useEffect(() => {
    if (isComplete) {
      // reviews を sessionStorage に保存して review ページへ遷移
      sessionStorage.setItem(
        `session-${sessionId}-reviews`,
        JSON.stringify(reviews),
      );
      router.push(`/session/${sessionId}/review`);
    }
  }, [isComplete, sessionId, reviews, router]);

  if (isComplete || !currentCard) return null;

  return (
    <div className="flex min-h-dvh flex-col">
      {/* ヘッダー */}
      <div className="flex items-center justify-between border-b p-4">
        <span className="text-sm text-muted-foreground">SRS</span>
        <span className="text-sm font-medium">
          {progress.current} / {progress.total}
        </span>
      </div>

      {/* カード */}
      <div className="flex flex-1 items-center justify-center p-4">
        <div className="w-full max-w-md rounded-xl border bg-card p-6 shadow-sm">
          <p className="text-lg">{currentCard.front}</p>
          {isFlipped && (
            <>
              <hr className="my-4" />
              <p className="text-lg">{currentCard.back}</p>
            </>
          )}
        </div>
      </div>

      {/* アクション */}
      <div className="border-t p-4">
        {!isFlipped ? (
          <button
            onClick={flip}
            className="w-full rounded-lg bg-blue-500 py-3 font-medium text-white hover:bg-blue-600"
          >
            めくる
          </button>
        ) : (
          <div className="grid grid-cols-4 gap-2">
            {([1, 2, 3, 4] as const).map((r) => (
              <button
                key={r}
                onClick={() => rate(r)}
                className={`rounded-lg py-3 text-sm font-medium text-white ${RATING_COLORS[r]}`}
              >
                {RATING_LABELS[r]}
              </button>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
```

- [ ] **Step 6: Session ページを作成**

```typescript
// src/app/session/[id]/page.tsx
import { getSessionCards } from "@/lib/actions/sessions";
import { notFound } from "next/navigation";
import { SessionPlayer } from "./session-player";

type Props = { params: Promise<{ id: string }> };

export default async function SessionPage({ params }: Props) {
  const { id } = await params;
  const cards = await getSessionCards(id);

  if (cards.length === 0) notFound();

  return <SessionPlayer sessionId={id} cards={cards} />;
}
```

- [ ] **Step 7: typecheck + lint**

Run: `bun typecheck && bun lint`
Expected: エラーなし

- [ ] **Step 8: コミット**

```bash
git add src/app/session/ tests/small/app/session/
git commit -m "feat: セッションプレイヤー (カードフリップ UI)"
```

---

### Task 10: 自己評価ページ (/session/[id]/review)

**Files:**
- Create: `src/app/session/[id]/review/page.tsx`
- Create: `src/app/session/[id]/review/session-review.tsx`

- [ ] **Step 1: SessionReview コンポーネントを作成**

```typescript
// src/app/session/[id]/review/session-review.tsx
"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { completeSession } from "@/lib/actions/sessions";
import { SELF_RATING_LABELS } from "@/lib/constants";
import type { CardReview } from "@/lib/types/sessions";

export function SessionReview({ sessionId }: { sessionId: string }) {
  const router = useRouter();
  const [reviews, setReviews] = useState<CardReview[]>([]);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    const stored = sessionStorage.getItem(`session-${sessionId}-reviews`);
    if (stored) {
      setReviews(JSON.parse(stored) as CardReview[]);
    }
  }, [sessionId]);

  const correctCount = reviews.filter((r) => r.rating >= 3).length;

  async function handleRate(selfRating: 1 | 2 | 3 | 4) {
    setLoading(true);
    const result = await completeSession(sessionId, reviews, selfRating);
    if (result.success) {
      sessionStorage.removeItem(`session-${sessionId}-reviews`);
      router.push(`/session/${sessionId}/summary`);
    }
    setLoading(false);
  }

  if (reviews.length === 0) {
    return (
      <div className="flex min-h-dvh items-center justify-center">
        <p className="text-muted-foreground">読み込み中...</p>
      </div>
    );
  }

  return (
    <div className="mx-auto flex min-h-dvh max-w-md flex-col justify-center p-4">
      <h1 className="mb-2 text-xl font-bold">このセッションの理解度は？</h1>
      <p className="mb-8 text-sm text-muted-foreground">
        {reviews.length}枚中{correctCount}枚正解
      </p>

      <div className="space-y-3">
        {([1, 2, 3, 4] as const).map((r) => (
          <button
            key={r}
            onClick={() => void handleRate(r)}
            disabled={loading}
            className="w-full rounded-lg border bg-card p-4 text-left transition-colors hover:bg-muted disabled:opacity-50"
          >
            <span className="font-medium">{r}.</span>{" "}
            <span className="text-muted-foreground">{SELF_RATING_LABELS[r]}</span>
          </button>
        ))}
      </div>
    </div>
  );
}
```

- [ ] **Step 2: Review ページを作成**

```typescript
// src/app/session/[id]/review/page.tsx
import { SessionReview } from "./session-review";

type Props = { params: Promise<{ id: string }> };

export default async function ReviewPage({ params }: Props) {
  const { id } = await params;
  return <SessionReview sessionId={id} />;
}
```

- [ ] **Step 3: typecheck + lint**

Run: `bun typecheck && bun lint`
Expected: エラーなし

- [ ] **Step 4: コミット**

```bash
git add src/app/session/\[id\]/review/
git commit -m "feat: セッション自己評価ページ"
```

---

### Task 11: サマリーページ (/session/[id]/summary)

**Files:**
- Create: `src/app/session/[id]/summary/page.tsx`
- Create: `src/app/session/[id]/summary/summary-actions.tsx`

- [ ] **Step 1: SummaryActions コンポーネントを作成**

```typescript
// src/app/session/[id]/summary/summary-actions.tsx
"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { createSession, createRestSession } from "@/lib/actions/sessions";

type Props = {
  sessionId: string;
  remainingDueCount: number;
  materialId?: string;
  methodId?: string;
};

export function SummaryActions({
  sessionId,
  remainingDueCount,
  materialId,
  methodId,
}: Props) {
  const router = useRouter();
  const [loading, setLoading] = useState(false);

  async function handleContinue() {
    if (!materialId || !methodId) return;
    setLoading(true);
    const result = await createSession(materialId, methodId);
    if (result.success) {
      router.push(`/session/${result.data.id}`);
    }
    setLoading(false);
  }

  async function handleRest() {
    setLoading(true);
    const result = await createRestSession(sessionId);
    if (result.success) {
      router.push(`/rest/${result.data.id}`);
    }
    setLoading(false);
  }

  return (
    <div className="mt-8 flex w-full max-w-sm flex-col gap-3">
      {remainingDueCount > 0 && materialId && methodId && (
        <button
          onClick={() => void handleContinue()}
          disabled={loading}
          className="rounded-lg bg-blue-500 py-3 font-medium text-white hover:bg-blue-600 disabled:opacity-50"
        >
          続けて学習する (残り {remainingDueCount} 枚)
        </button>
      )}
      <button
        onClick={() => void handleRest()}
        disabled={loading}
        className="rounded-lg bg-purple-600 py-3 font-medium text-white hover:bg-purple-700 disabled:opacity-50"
      >
        安静タイマーを開始 (10分)
      </button>
      <button
        onClick={() => router.push("/")}
        className="rounded-lg bg-muted py-3 font-medium hover:bg-muted/80"
      >
        ホームに戻る
      </button>
    </div>
  );
}
```

- [ ] **Step 2: Summary ページを作成**

```typescript
// src/app/session/[id]/summary/page.tsx
import { getSession } from "@/lib/actions/sessions";
import { notFound } from "next/navigation";
import { calculateAccuracyRate, formatDuration, countByRating } from "@/lib/session-utils";
import { RATING_COLORS } from "@/lib/constants";
import { SummaryActions } from "./summary-actions";

type Props = { params: Promise<{ id: string }> };

export default async function SummaryPage({ params }: Props) {
  const { id } = await params;
  const session = await getSession(id);
  if (!session || session.status !== "completed") notFound();

  const accuracy = calculateAccuracyRate(session.card_reviews);
  const duration = formatDuration(session.duration_sec);
  const ratingCounts = countByRating(session.card_reviews);

  return (
    <div className="mx-auto flex min-h-dvh max-w-md flex-col items-center justify-center p-4">
      <div className="text-center">
        <div className="mb-2 text-3xl text-green-500">&#10003;</div>
        <h1 className="text-xl font-semibold">セッション完了</h1>
        {session.material && (
          <p className="mt-1 text-sm text-muted-foreground">
            {session.material.subject.name} - {session.material.title}
          </p>
        )}
      </div>

      {/* 統計 3 指標 */}
      <div className="mt-6 flex gap-8">
        <div className="text-center">
          <div className="text-2xl font-bold text-blue-500">
            {session.card_reviews.length}
          </div>
          <div className="text-xs text-muted-foreground">カード</div>
        </div>
        <div className="text-center">
          <div className="text-2xl font-bold text-green-500">
            {Math.round(accuracy * 100)}%
          </div>
          <div className="text-xs text-muted-foreground">正解率</div>
        </div>
        <div className="text-center">
          <div className="text-2xl font-bold text-orange-500">{duration}</div>
          <div className="text-xs text-muted-foreground">所要時間</div>
        </div>
      </div>

      {/* 評価分布 */}
      <div className="mt-4 flex gap-1">
        {([1, 2, 3, 4] as const).map((r) => (
          <div
            key={r}
            className={`flex h-6 w-6 items-center justify-center rounded text-xs font-medium text-white ${RATING_COLORS[r]}`}
          >
            {ratingCounts[r]}
          </div>
        ))}
      </div>

      <SummaryActions
        sessionId={id}
        remainingDueCount={session.remaining_due_count}
        materialId={session.material?.id}
        methodId={session.method_id}
      />
    </div>
  );
}
```

- [ ] **Step 3: typecheck + lint**

Run: `bun typecheck && bun lint`
Expected: エラーなし

- [ ] **Step 4: コミット**

```bash
git add src/app/session/\[id\]/summary/
git commit -m "feat: セッションサマリーページ"
```

---

### Task 12: 安静タイマー (/rest/[id])

**Files:**
- Create: `src/app/rest/[id]/use-rest-timer.ts`
- Create: `src/app/rest/[id]/rest-timer.tsx`
- Create: `src/app/rest/[id]/page.tsx`
- Create: `tests/small/app/rest/use-rest-timer.test.ts`

- [ ] **Step 1: Small テストを作成**

```typescript
// tests/small/app/rest/use-rest-timer.test.ts
import { describe, it, expect, vi, afterEach } from "vitest";
import { renderHook, act } from "@testing-library/react";
import { useRestTimer } from "@/app/rest/[id]/use-rest-timer";

describe("useRestTimer", () => {
  afterEach(() => {
    vi.useRealTimers();
  });

  it("初期値が totalSeconds と一致する", () => {
    const { result } = renderHook(() => useRestTimer(600));
    expect(result.current.remainingSeconds).toBe(600);
    expect(result.current.isComplete).toBe(false);
  });

  it("1 秒ごとにカウントダウンする", () => {
    vi.useFakeTimers();
    const { result } = renderHook(() => useRestTimer(10));

    act(() => {
      vi.advanceTimersByTime(3000);
    });

    expect(result.current.remainingSeconds).toBe(7);
  });

  it("0 になったら isComplete が true になる", () => {
    vi.useFakeTimers();
    const { result } = renderHook(() => useRestTimer(2));

    act(() => {
      vi.advanceTimersByTime(2000);
    });

    expect(result.current.remainingSeconds).toBe(0);
    expect(result.current.isComplete).toBe(true);
  });

  it("progress が 0-1 の範囲で減少する", () => {
    vi.useFakeTimers();
    const { result } = renderHook(() => useRestTimer(10));

    expect(result.current.progress).toBe(1);

    act(() => {
      vi.advanceTimersByTime(5000);
    });

    expect(result.current.progress).toBe(0.5);
  });
});
```

- [ ] **Step 2: テスト実行 (Red)**

Run: `bun test:small -- tests/small/app/rest/use-rest-timer.test.ts`
Expected: FAIL

- [ ] **Step 3: useRestTimer hook を作成**

```typescript
// src/app/rest/[id]/use-rest-timer.ts
"use client";

import { useState, useEffect, useRef } from "react";

export function useRestTimer(totalSeconds: number) {
  const [remainingSeconds, setRemainingSeconds] = useState(totalSeconds);
  const intervalRef = useRef<ReturnType<typeof setInterval> | null>(null);

  const isComplete = remainingSeconds <= 0;
  const progress = totalSeconds > 0 ? remainingSeconds / totalSeconds : 0;

  useEffect(() => {
    if (isComplete) return;

    intervalRef.current = setInterval(() => {
      setRemainingSeconds((prev) => {
        if (prev <= 1) {
          if (intervalRef.current) clearInterval(intervalRef.current);
          return 0;
        }
        return prev - 1;
      });
    }, 1000);

    return () => {
      if (intervalRef.current) clearInterval(intervalRef.current);
    };
  }, [isComplete]);

  return { remainingSeconds, isComplete, progress };
}
```

- [ ] **Step 4: テスト実行 (Green)**

Run: `bun test:small -- tests/small/app/rest/use-rest-timer.test.ts`
Expected: すべて PASS

- [ ] **Step 5: RestTimer コンポーネントを作成**

```typescript
// src/app/rest/[id]/rest-timer.tsx
"use client";

import { useEffect, useRef } from "react";
import { useRouter } from "next/navigation";
import { useRestTimer } from "./use-rest-timer";
import { completeRestSession } from "@/lib/actions/sessions";
import { REST_DURATION_SEC } from "@/lib/constants";
import { formatDuration } from "@/lib/session-utils";

export function RestTimer({ sessionId }: { sessionId: string }) {
  const router = useRouter();
  const { remainingSeconds, isComplete, progress } = useRestTimer(REST_DURATION_SEC);
  const completedRef = useRef(false);

  useEffect(() => {
    if (isComplete && !completedRef.current) {
      completedRef.current = true;
      void completeRestSession(sessionId);
    }
  }, [isComplete, sessionId]);

  // 円形プログレスの SVG パラメータ
  const radius = 80;
  const circumference = 2 * Math.PI * radius;
  const strokeDashoffset = circumference * (1 - progress);

  return (
    <div className="mx-auto flex min-h-dvh max-w-md flex-col items-center justify-center p-4">
      {!isComplete ? (
        <>
          <svg width="200" height="200" className="-rotate-90">
            <circle
              cx="100"
              cy="100"
              r={radius}
              fill="none"
              stroke="currentColor"
              strokeWidth="8"
              className="text-muted"
            />
            <circle
              cx="100"
              cy="100"
              r={radius}
              fill="none"
              stroke="currentColor"
              strokeWidth="8"
              strokeDasharray={circumference}
              strokeDashoffset={strokeDashoffset}
              strokeLinecap="round"
              className="text-purple-500 transition-all duration-1000"
            />
          </svg>
          <p className="mt-4 text-3xl font-bold tabular-nums">
            {formatDuration(remainingSeconds)}
          </p>
          <p className="mt-2 text-sm text-muted-foreground">安静タイマー</p>
        </>
      ) : (
        <div className="text-center">
          <div className="mb-2 text-3xl text-purple-500">&#10003;</div>
          <h1 className="text-xl font-semibold">安静完了</h1>
          <p className="mt-2 text-sm text-muted-foreground">
            10 分間の安静が完了しました
          </p>
          <button
            onClick={() => router.push("/")}
            className="mt-6 rounded-lg bg-muted px-6 py-3 font-medium hover:bg-muted/80"
          >
            ホームに戻る
          </button>
        </div>
      )}
    </div>
  );
}
```

- [ ] **Step 6: Rest ページを作成**

```typescript
// src/app/rest/[id]/page.tsx
import { RestTimer } from "./rest-timer";

type Props = { params: Promise<{ id: string }> };

export default async function RestPage({ params }: Props) {
  const { id } = await params;
  return <RestTimer sessionId={id} />;
}
```

- [ ] **Step 7: typecheck + lint**

Run: `bun typecheck && bun lint`
Expected: エラーなし

- [ ] **Step 8: コミット**

```bash
git add src/app/rest/ tests/small/app/rest/
git commit -m "feat: 安静タイマー (10 分カウントダウン)"
```

---

### Task 13: 教材詳細ページ「学習を始める」ボタン

**Files:**
- Modify: `src/app/(main)/materials/[id]/page.tsx`

- [ ] **Step 1: 教材詳細ページを確認**

Read: `src/app/(main)/materials/[id]/page.tsx`

due_count が既に取得されていることを確認。SRS method_id を追加で取得する必要がある。

- [ ] **Step 2: SRS method_id を MaterialDetail 型に追加**

`src/lib/types/materials.ts` の `MaterialDetail` (または `MaterialWithMethods`) には既に `methods` 配列がある。この中から `slug === "srs"` を探す。

`src/app/(main)/materials/[id]/page.tsx` に追加:

概要タブの適切な位置 (metrics の後、カードリストの前) に以下を追加:

```typescript
// 既存の material.methods から SRS method を検索
const srsMethod = material.methods.find((m) => m.slug === "srs");

// JSX 内、概要タブに追加
{srsMethod && material.due_count > 0 && (
  <div className="mt-4">
    <StartSessionButton
      materialId={material.id}
      methodId={srsMethod.id}
      label={`学習を始める (${material.due_count}枚)`}
      className="w-full rounded-lg bg-blue-500 py-3 font-medium text-white hover:bg-blue-600 disabled:opacity-50"
    />
  </div>
)}
```

ファイル先頭に import を追加:

```typescript
import { StartSessionButton } from "@/components/start-session-button";
```

- [ ] **Step 3: typecheck + lint**

Run: `bun typecheck && bun lint`
Expected: エラーなし

- [ ] **Step 4: dev サーバーで表示確認**

Run: `bun dev`
Expected: 教材詳細ページに「学習を始める」ボタンが表示される (due カードがある場合のみ)

- [ ] **Step 5: コミット**

```bash
git add src/app/\(main\)/materials/\[id\]/page.tsx
git commit -m "feat: 教材詳細ページに「学習を始める」ボタン追加"
```

---

## Self-Review Checklist

### Spec Coverage

| Spec 要件 | Task |
|-----------|------|
| srs_states.state カラム | Task 1 |
| バリデーションスキーマ | Task 2 |
| セッション統計ユーティリティ | Task 3 |
| getDueMaterials | Task 4 |
| createSession | Task 5 |
| getSessionCards | Task 5 |
| Edge Function: complete-session | Task 6 |
| completeSession | Task 7 |
| getSession | Task 7 |
| createRestSession | Task 7 |
| completeRestSession | Task 7 |
| Today ページ (/) | Task 8 |
| セッション画面 (/session/[id]) | Task 9 |
| 自己評価画面 (/session/[id]/review) | Task 10 |
| サマリー画面 (/session/[id]/summary) | Task 11 |
| 安静タイマー (/rest/[id]) | Task 12 |
| 教材詳細「学習を始める」ボタン | Task 13 |

### Type Consistency

- `CardReview`: `src/lib/types/sessions.ts` で定義 → `use-session-player.ts`, `session-review.tsx`, `sessions.ts` (action), Edge Function で同一構造を使用
- `SessionCard`: `src/lib/types/sessions.ts` → `session-player.tsx`, `use-session-player.ts`
- `DueMaterial`: `src/lib/types/sessions.ts` → `today-material-list.tsx`, `getDueMaterials()`
- `SessionDetail`: `src/lib/types/sessions.ts` → `summary/page.tsx`, `getSession()`
- `ActionResult<T>`: `src/lib/validations/materials.ts` → re-exported from `sessions.ts`
- 定数 `SESSION_MAX_CARDS`, `REST_DURATION_SEC`, `RATING_LABELS`, `SELF_RATING_LABELS`, `RATING_COLORS`: `src/lib/constants.ts`

### Placeholder Scan

- No TBD/TODO found
- All steps contain actual code
- All file paths are exact
- All test commands are exact
