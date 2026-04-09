# Wake-up リマインダー実装計画

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** ユーザーが設定した時刻にローカル通知を表示し、学習の振り返りと翌日の予告を行うリマインダー機能を実装する。

**Architecture:** メインスレッド (React) の `useNotificationScheduler` hook で `setTimeout` ベースのタイマーを管理し、Notification API でローカル通知を表示する。通知スケジュールは `notification_schedules` テーブルに永続化し、マスタートグルは `profiles.notification_enabled` で管理する。

**Tech Stack:** Next.js 16 (App Router), Supabase (PostgreSQL + RLS), Notification API, Zod, Vitest

**Spec:** `docs/superpowers/specs/2026-04-09-wake-up-reminder-design.md`

---

## ファイル構成

| 操作 | パス | 責務 |
|------|------|------|
| Create | `supabase/migrations/00015_notification_schedules.sql` | DB migration (profiles ALTER + 新テーブル) |
| Create | `src/lib/validations/notifications.ts` | Zod スキーマ |
| Create | `src/lib/actions/notifications.ts` | Server Actions (CRUD + 通知データ取得) |
| Create | `src/lib/utils/notification-messages.ts` | メッセージ生成ロジック |
| Create | `src/hooks/useNotificationPermission.ts` | 権限状態管理 hook |
| Create | `src/hooks/useNotificationScheduler.ts` | タイマー管理 hook |
| Create | `src/components/notification-provider.tsx` | Client Component ラッパー (layout に配置) |
| Create | `src/components/notification-toggle.tsx` | マスタートグル + 権限要求 |
| Create | `src/components/notification-schedule-list.tsx` | スケジュール一覧 |
| Create | `src/components/notification-schedule-form.tsx` | 追加/編集フォーム |
| Create | `src/app/(main)/profile/notifications/page.tsx` | 通知設定ページ |
| Create | `public/manifest.webmanifest` | PWA manifest (最低限) |
| Create | `public/sw.js` | 空の Service Worker (将来用) |
| Modify | `src/lib/constants.ts` | 通知関連定数の追加 |
| Modify | `src/app/(main)/layout.tsx` | NotificationProvider 配置 |
| Modify | `src/app/(main)/profile/page.tsx` | 通知設定リンク追加 |
| Modify | `src/app/layout.tsx` | manifest.webmanifest リンク + SW 登録 |
| Create | `tests/small/lib/utils/notification-messages.test.ts` | メッセージ生成テスト |
| Create | `tests/small/lib/validations/notifications.test.ts` | バリデーションテスト |
| Create | `tests/small/lib/actions/notifications.test.ts` | Server Actions テスト |
| Create | `tests/small/hooks/useNotificationPermission.test.ts` | 権限 hook テスト |
| Create | `tests/small/hooks/useNotificationScheduler.test.ts` | スケジューラ hook テスト |
| Create | `tests/medium/lib/actions/notifications.test.ts` | DB 統合テスト |
| Create | `tests/large/notifications.spec.ts` | E2E テスト |

migration 番号 `00015` は仮番号。実装時に `supabase/migrations/` の最大番号 + 1 で採番する。

---

### Task 1: DB migration + 定数 + バリデーション

**Files:**
- Create: `supabase/migrations/00015_notification_schedules.sql`
- Modify: `src/lib/constants.ts`
- Create: `src/lib/validations/notifications.ts`
- Create: `tests/small/lib/validations/notifications.test.ts`

- [ ] **Step 1: migration ファイルを作成**

```sql
-- profiles テーブルにマスタートグルを追加
ALTER TABLE profiles
  ADD COLUMN notification_enabled BOOLEAN NOT NULL DEFAULT false;

-- 通知スケジュールテーブル
CREATE TABLE notification_schedules (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  label TEXT NOT NULL,
  enabled BOOLEAN NOT NULL DEFAULT true,
  time TIME NOT NULL,
  message_type TEXT NOT NULL
    CHECK (message_type IN ('due_today', 'review_and_preview')),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX idx_notification_schedules_user_id
  ON notification_schedules(user_id);

ALTER TABLE notification_schedules ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can manage own schedules"
  ON notification_schedules FOR ALL
  USING (auth.uid() = user_id)
  WITH CHECK (auth.uid() = user_id);
```

- [ ] **Step 2: migration を適用して型を再生成**

Run: `supabase db reset && supabase gen types typescript --local > src/lib/types/database.ts`

Expected: `database.ts` の `profiles` 型に `notification_enabled: boolean` が追加され、`notification_schedules` テーブルの型が生成される。

- [ ] **Step 3: 定数を追加**

`src/lib/constants.ts` に以下を追加:

```typescript
// --- 通知 ---
// タブ非アクティブ時に経過した通知を表示する最大遅延。30分を超えた古い通知は破棄する
export const NOTIFICATION_DELAY_THRESHOLD_MS = 30 * 60 * 1000;
// 1ユーザーあたりの通知スケジュール上限。過剰なタイマー生成を防ぐ
export const MAX_NOTIFICATION_SCHEDULES = 10;
// 通知本文に表示する科目の最大数。超過分は「ほかN科目」で表示
export const NOTIFICATION_MAX_SUBJECTS = 2;

export const NOTIFICATION_MESSAGE_TYPES = ["due_today", "review_and_preview"] as const;
export type NotificationMessageType = (typeof NOTIFICATION_MESSAGE_TYPES)[number];

export const NOTIFICATION_DEFAULTS = {
  morning: { label: "朝の通知", time: "08:00", messageType: "due_today" as const },
  evening: { label: "夜の通知", time: "22:00", messageType: "review_and_preview" as const },
} as const;
```

- [ ] **Step 4: バリデーションテストを作成 (RED)**

`tests/small/lib/validations/notifications.test.ts`:

```typescript
import { describe, it, expect } from "vitest";
import {
  createNotificationScheduleSchema,
  updateNotificationScheduleSchema,
} from "@/lib/validations/notifications";

describe("createNotificationScheduleSchema", () => {
  it("accepts valid input with due_today type", () => {
    const result = createNotificationScheduleSchema.safeParse({
      label: "朝の通知",
      time: "08:00",
      message_type: "due_today",
    });
    expect(result.success).toBe(true);
  });

  it("accepts valid input with review_and_preview type", () => {
    const result = createNotificationScheduleSchema.safeParse({
      label: "夜の通知",
      time: "22:00",
      message_type: "review_and_preview",
    });
    expect(result.success).toBe(true);
  });

  it("rejects empty label", () => {
    const result = createNotificationScheduleSchema.safeParse({
      label: "",
      time: "08:00",
      message_type: "due_today",
    });
    expect(result.success).toBe(false);
  });

  it("rejects invalid time format", () => {
    const result = createNotificationScheduleSchema.safeParse({
      label: "朝の通知",
      time: "25:00",
      message_type: "due_today",
    });
    expect(result.success).toBe(false);
  });

  it("rejects invalid message_type", () => {
    const result = createNotificationScheduleSchema.safeParse({
      label: "朝の通知",
      time: "08:00",
      message_type: "invalid",
    });
    expect(result.success).toBe(false);
  });

  it("rejects label exceeding max length", () => {
    const result = createNotificationScheduleSchema.safeParse({
      label: "a".repeat(101),
      time: "08:00",
      message_type: "due_today",
    });
    expect(result.success).toBe(false);
  });
});

describe("updateNotificationScheduleSchema", () => {
  it("accepts partial update with only label", () => {
    const result = updateNotificationScheduleSchema.safeParse({
      id: "550e8400-e29b-41d4-a716-446655440000",
      label: "新しいラベル",
    });
    expect(result.success).toBe(true);
  });

  it("accepts partial update with only enabled", () => {
    const result = updateNotificationScheduleSchema.safeParse({
      id: "550e8400-e29b-41d4-a716-446655440000",
      enabled: false,
    });
    expect(result.success).toBe(true);
  });

  it("rejects missing id", () => {
    const result = updateNotificationScheduleSchema.safeParse({
      label: "新しいラベル",
    });
    expect(result.success).toBe(false);
  });
});
```

- [ ] **Step 5: テスト実行して RED を確認**

Run: `bun test:small -- tests/small/lib/validations/notifications.test.ts`

Expected: FAIL (モジュールが存在しない)

- [ ] **Step 6: バリデーションスキーマを実装 (GREEN)**

`src/lib/validations/notifications.ts`:

```typescript
import { z } from "zod";
import { NOTIFICATION_MESSAGE_TYPES } from "@/lib/constants";

export { type ActionResult, extractFieldErrors } from "@/lib/validations/materials";

const timeRegex = /^([01]\d|2[0-3]):[0-5]\d$/;

export const createNotificationScheduleSchema = z.object({
  label: z
    .string()
    .min(1, "ラベルを入力してください")
    .max(100, "ラベルは100文字以内で入力してください"),
  time: z
    .string()
    .regex(timeRegex, "時刻は HH:MM 形式で入力してください"),
  message_type: z.enum(NOTIFICATION_MESSAGE_TYPES, {
    message: "有効な通知タイプを選択してください",
  }),
});

export const updateNotificationScheduleSchema = z.object({
  id: z.uuid("有効なスケジュールIDが必要です"),
  label: z
    .string()
    .min(1, "ラベルを入力してください")
    .max(100, "ラベルは100文字以内で入力してください")
    .optional(),
  time: z
    .string()
    .regex(timeRegex, "時刻は HH:MM 形式で入力してください")
    .optional(),
  message_type: z.enum(NOTIFICATION_MESSAGE_TYPES, {
    message: "有効な通知タイプを選択してください",
  }).optional(),
  enabled: z.boolean().optional(),
});

export const deleteNotificationScheduleSchema = z.object({
  id: z.uuid("有効なスケジュールIDが必要です"),
});
```

- [ ] **Step 7: テスト実行して GREEN を確認**

Run: `bun test:small -- tests/small/lib/validations/notifications.test.ts`

Expected: PASS

- [ ] **Step 8: コミット**

```bash
git add supabase/migrations/00015_notification_schedules.sql \
  src/lib/constants.ts \
  src/lib/types/database.ts \
  src/lib/validations/notifications.ts \
  tests/small/lib/validations/notifications.test.ts
git commit -m "feat: 通知スケジュールの DB migration + バリデーション"
```

---

### Task 2: メッセージ生成ロジック

**Files:**
- Create: `src/lib/utils/notification-messages.ts`
- Create: `tests/small/lib/utils/notification-messages.test.ts`

- [ ] **Step 1: テストを作成 (RED)**

`tests/small/lib/utils/notification-messages.test.ts`:

```typescript
import { describe, it, expect } from "vitest";
import {
  buildDueTodayMessage,
  buildReviewAndPreviewMessage,
} from "@/lib/utils/notification-messages";

describe("buildDueTodayMessage", () => {
  it("returns due card count with single subject", () => {
    const result = buildDueTodayMessage([
      { subject: "数学", count: 5 },
    ]);
    expect(result.title).toBe("今日の復習: 5枚");
    expect(result.body).toBe("数学 5枚");
  });

  it("returns due card count with two subjects", () => {
    const result = buildDueTodayMessage([
      { subject: "数学", count: 5 },
      { subject: "英語", count: 7 },
    ]);
    expect(result.title).toBe("今日の復習: 12枚");
    expect(result.body).toBe("数学 5枚 / 英語 7枚");
  });

  it("truncates to top 2 subjects when 3 or more", () => {
    const result = buildDueTodayMessage([
      { subject: "数学", count: 5 },
      { subject: "英語", count: 7 },
      { subject: "物理", count: 3 },
    ]);
    expect(result.title).toBe("今日の復習: 15枚");
    expect(result.body).toBe("数学 5枚 / 英語 7枚 ほか1科目");
  });

  it("truncates to top 2 subjects when 4 or more", () => {
    const result = buildDueTodayMessage([
      { subject: "数学", count: 5 },
      { subject: "英語", count: 7 },
      { subject: "物理", count: 3 },
      { subject: "化学", count: 2 },
    ]);
    expect(result.body).toBe("数学 5枚 / 英語 7枚 ほか2科目");
  });

  it("returns no-due message when empty", () => {
    const result = buildDueTodayMessage([]);
    expect(result.title).toBe("今日の復習はありません");
    expect(result.body).toBe("新しい教材を追加してみませんか?");
  });
});

describe("buildReviewAndPreviewMessage", () => {
  it("returns review and preview with sessions completed", () => {
    const result = buildReviewAndPreviewMessage({
      sessionsToday: 3,
      dueTomorrow: [
        { subject: "数学", count: 5 },
        { subject: "英語", count: 7 },
      ],
    });
    expect(result.title).toBe("今日は 3セッション完了!");
    expect(result.body).toBe("明日は 数学 5枚 / 英語 7枚 が待っています");
  });

  it("falls back to due-only message when no sessions today", () => {
    const result = buildReviewAndPreviewMessage({
      sessionsToday: 0,
      dueTomorrow: [
        { subject: "数学", count: 5 },
        { subject: "英語", count: 7 },
      ],
    });
    expect(result.title).toBe("明日の復習: 12枚");
    expect(result.body).toBe("数学 5枚 / 英語 7枚");
  });

  it("truncates subjects in preview when 3 or more", () => {
    const result = buildReviewAndPreviewMessage({
      sessionsToday: 2,
      dueTomorrow: [
        { subject: "数学", count: 5 },
        { subject: "英語", count: 7 },
        { subject: "物理", count: 3 },
      ],
    });
    expect(result.body).toBe("明日は 数学 5枚 / 英語 7枚 ほか1科目 が待っています");
  });

  it("handles no due cards tomorrow", () => {
    const result = buildReviewAndPreviewMessage({
      sessionsToday: 2,
      dueTomorrow: [],
    });
    expect(result.title).toBe("今日は 2セッション完了!");
    expect(result.body).toBe("明日の復習はありません");
  });

  it("handles no sessions and no due cards", () => {
    const result = buildReviewAndPreviewMessage({
      sessionsToday: 0,
      dueTomorrow: [],
    });
    expect(result.title).toBe("今日はまだセッションがありません");
    expect(result.body).toBe("明日の復習はありません");
  });
});
```

- [ ] **Step 2: テスト実行して RED を確認**

Run: `bun test:small -- tests/small/lib/utils/notification-messages.test.ts`

Expected: FAIL

- [ ] **Step 3: メッセージ生成を実装 (GREEN)**

`src/lib/utils/notification-messages.ts`:

```typescript
import { NOTIFICATION_MAX_SUBJECTS } from "@/lib/constants";

export type SubjectDueCount = {
  subject: string;
  count: number;
};

export type NotificationMessage = {
  title: string;
  body: string;
};

function formatSubjectList(subjects: SubjectDueCount[]): string {
  if (subjects.length === 0) return "";

  const shown = subjects.slice(0, NOTIFICATION_MAX_SUBJECTS);
  const remaining = subjects.length - NOTIFICATION_MAX_SUBJECTS;
  const parts = shown.map((s) => `${s.subject} ${s.count}枚`);
  const joined = parts.join(" / ");

  if (remaining > 0) {
    return `${joined} ほか${remaining}科目`;
  }
  return joined;
}

export function buildDueTodayMessage(
  subjects: SubjectDueCount[],
): NotificationMessage {
  if (subjects.length === 0) {
    return {
      title: "今日の復習はありません",
      body: "新しい教材を追加してみませんか?",
    };
  }

  const total = subjects.reduce((sum, s) => sum + s.count, 0);
  return {
    title: `今日の復習: ${total}枚`,
    body: formatSubjectList(subjects),
  };
}

export function buildReviewAndPreviewMessage(params: {
  sessionsToday: number;
  dueTomorrow: SubjectDueCount[];
}): NotificationMessage {
  const { sessionsToday, dueTomorrow } = params;
  const hasSessions = sessionsToday > 0;
  const hasDue = dueTomorrow.length > 0;

  if (!hasSessions && hasDue) {
    const total = dueTomorrow.reduce((sum, s) => sum + s.count, 0);
    return {
      title: `明日の復習: ${total}枚`,
      body: formatSubjectList(dueTomorrow),
    };
  }

  const title = hasSessions
    ? `今日は ${sessionsToday}セッション完了!`
    : "今日はまだセッションがありません";

  const body = hasDue
    ? `明日は ${formatSubjectList(dueTomorrow)} が待っています`
    : "明日の復習はありません";

  return { title, body };
}
```

- [ ] **Step 4: テスト実行して GREEN を確認**

Run: `bun test:small -- tests/small/lib/utils/notification-messages.test.ts`

Expected: PASS

- [ ] **Step 5: コミット**

```bash
git add src/lib/utils/notification-messages.ts \
  tests/small/lib/utils/notification-messages.test.ts
git commit -m "feat: 通知メッセージ生成ロジック"
```

---

### Task 3: Server Actions (CRUD + 通知データ取得)

**Files:**
- Create: `src/lib/actions/notifications.ts`
- Create: `tests/small/lib/actions/notifications.test.ts`

- [ ] **Step 1: テストを作成 (RED)**

`tests/small/lib/actions/notifications.test.ts`:

```typescript
import { describe, it, expect, vi, beforeEach } from "vitest";

vi.mock("next/cache", () => ({
  revalidatePath: vi.fn(),
}));

vi.mock("next/navigation", () => ({
  redirect: vi.fn((url: string) => {
    throw new Error(`NEXT_REDIRECT:${url}`);
  }),
}));

function createChainMock(resolvedValue: { data: unknown; error: unknown }) {
  const makeChain = (): Record<string, unknown> => {
    const resolved = Promise.resolve(resolvedValue);
    const chain: Record<string, unknown> = {
      insert: vi.fn().mockImplementation(() => makeChain()),
      update: vi.fn().mockImplementation(() => makeChain()),
      delete: vi.fn().mockImplementation(() => makeChain()),
      select: vi.fn().mockImplementation(() => makeChain()),
      eq: vi.fn().mockImplementation(() => makeChain()),
      order: vi.fn().mockReturnValue(resolved),
      single: vi.fn().mockReturnValue(resolved),
      then: resolved.then.bind(resolved),
    };
    return chain;
  };
  return makeChain();
}

function buildMockClient(options: {
  user: { id: string } | null;
  queryResult?: { data: unknown; error: unknown };
  countResult?: { count: number; error: unknown };
}) {
  const authMock = {
    getUser: vi.fn().mockResolvedValue({
      data: { user: options.user },
    }),
  };
  const queryResult = options.queryResult ?? { data: null, error: null };

  const fromMock = vi.fn().mockReturnValue({
    ...createChainMock(queryResult),
    select: vi.fn().mockImplementation((cols?: string) => {
      if (cols && cols.includes("count")) {
        return Promise.resolve(options.countResult ?? { count: 0, error: null });
      }
      return createChainMock(queryResult);
    }),
  });

  return { auth: authMock, from: fromMock, rpc: vi.fn() };
}

let mockClient: ReturnType<typeof buildMockClient>;

vi.mock("@/lib/supabase/server", () => ({
  createClient: vi.fn(() => Promise.resolve(mockClient)),
}));

describe("createNotificationSchedule", () => {
  beforeEach(() => {
    vi.resetModules();
  });

  it("redirects when unauthenticated", async () => {
    mockClient = buildMockClient({ user: null });

    const { createNotificationSchedule } = await import(
      "@/lib/actions/notifications"
    );

    await expect(
      createNotificationSchedule({
        label: "朝の通知",
        time: "08:00",
        message_type: "due_today",
      }),
    ).rejects.toThrow("NEXT_REDIRECT:/auth/login");
  });

  it("returns validation error for empty label", async () => {
    mockClient = buildMockClient({ user: { id: "user-1" } });

    const { createNotificationSchedule } = await import(
      "@/lib/actions/notifications"
    );
    const result = await createNotificationSchedule({
      label: "",
      time: "08:00",
      message_type: "due_today",
    });

    expect(result.success).toBe(false);
  });

  it("returns validation error for invalid time", async () => {
    mockClient = buildMockClient({ user: { id: "user-1" } });

    const { createNotificationSchedule } = await import(
      "@/lib/actions/notifications"
    );
    const result = await createNotificationSchedule({
      label: "朝の通知",
      time: "25:00",
      message_type: "due_today",
    });

    expect(result.success).toBe(false);
  });

  it("returns success with created schedule", async () => {
    const schedule = {
      id: "sched-1",
      label: "朝の通知",
      time: "08:00:00",
      message_type: "due_today",
      enabled: true,
    };
    mockClient = buildMockClient({
      user: { id: "user-1" },
      queryResult: { data: schedule, error: null },
      countResult: { count: 0, error: null },
    });

    const { createNotificationSchedule } = await import(
      "@/lib/actions/notifications"
    );
    const result = await createNotificationSchedule({
      label: "朝の通知",
      time: "08:00",
      message_type: "due_today",
    });

    expect(result.success).toBe(true);
  });
});

describe("toggleNotificationEnabled", () => {
  beforeEach(() => {
    vi.resetModules();
  });

  it("redirects when unauthenticated", async () => {
    mockClient = buildMockClient({ user: null });

    const { toggleNotificationEnabled } = await import(
      "@/lib/actions/notifications"
    );

    await expect(toggleNotificationEnabled(true)).rejects.toThrow(
      "NEXT_REDIRECT:/auth/login",
    );
  });

  it("returns success on valid toggle", async () => {
    mockClient = buildMockClient({
      user: { id: "user-1" },
      queryResult: { data: { notification_enabled: true }, error: null },
    });

    const { toggleNotificationEnabled } = await import(
      "@/lib/actions/notifications"
    );
    const result = await toggleNotificationEnabled(true);

    expect(result.success).toBe(true);
  });
});
```

- [ ] **Step 2: テスト実行して RED を確認**

Run: `bun test:small -- tests/small/lib/actions/notifications.test.ts`

Expected: FAIL

- [ ] **Step 3: Server Actions を実装 (GREEN)**

`src/lib/actions/notifications.ts`:

```typescript
"use server";

import { revalidatePath } from "next/cache";
import { requireAuth } from "@/lib/actions/auth-utils";
import {
  ACTION_ERRORS,
  MAX_NOTIFICATION_SCHEDULES,
  NOTIFICATION_DEFAULTS,
} from "@/lib/constants";
import {
  createNotificationScheduleSchema,
  updateNotificationScheduleSchema,
  deleteNotificationScheduleSchema,
  extractFieldErrors,
  type ActionResult,
} from "@/lib/validations/notifications";

export async function getNotificationSchedules() {
  const { user, supabase } = await requireAuth();

  const { data, error } = await supabase
    .from("notification_schedules")
    .select("*")
    .eq("user_id", user.id)
    .order("time", { ascending: true });

  if (error) {
    return { success: false as const, error: "スケジュールの取得に失敗しました" };
  }

  return { success: true as const, data: data ?? [] };
}

export async function getNotificationEnabled(): Promise<
  ActionResult<{ notification_enabled: boolean }>
> {
  const { user, supabase } = await requireAuth();

  const { data, error } = await supabase
    .from("profiles")
    .select("notification_enabled")
    .eq("id", user.id)
    .single();

  if (error) {
    return { success: false, error: "設定の取得に失敗しました" };
  }

  return { success: true, data };
}

export async function toggleNotificationEnabled(
  enabled: boolean,
): Promise<ActionResult<{ notification_enabled: boolean }>> {
  const { user, supabase } = await requireAuth();

  const { data, error } = await supabase
    .from("profiles")
    .update({ notification_enabled: enabled })
    .eq("id", user.id)
    .select("notification_enabled")
    .single();

  if (error) {
    return { success: false, error: ACTION_ERRORS.UPDATE_FAILED("通知設定") };
  }

  // 初回 ON 時にデフォルトスケジュールを作成
  if (enabled) {
    const { data: existing } = await supabase
      .from("notification_schedules")
      .select("id")
      .eq("user_id", user.id)
      .limit(1);

    if (!existing || existing.length === 0) {
      const { error: insertError } = await supabase.from("notification_schedules").insert([
        {
          user_id: user.id,
          label: NOTIFICATION_DEFAULTS.morning.label,
          time: NOTIFICATION_DEFAULTS.morning.time,
          message_type: NOTIFICATION_DEFAULTS.morning.messageType,
        },
        {
          user_id: user.id,
          label: NOTIFICATION_DEFAULTS.evening.label,
          time: NOTIFICATION_DEFAULTS.evening.time,
          message_type: NOTIFICATION_DEFAULTS.evening.messageType,
        },
      ]);
      // トグル自体は成功扱いだが、スケジュール作成失敗はログに残す
      if (insertError) {
        console.error("Failed to create default notification schedules:", insertError.message);
      }
    }
  }

  revalidatePath("/profile/notifications");
  return { success: true, data };
}

export async function createNotificationSchedule(
  input: { label: string; time: string; message_type: string },
): Promise<ActionResult<{ id: string }>> {
  const parsed = createNotificationScheduleSchema.safeParse(input);
  if (!parsed.success) {
    return {
      success: false,
      error: ACTION_ERRORS.INVALID_INPUT,
      fieldErrors: extractFieldErrors(parsed.error),
    };
  }

  const { user, supabase } = await requireAuth();

  // 上限チェック
  const { count, error: countError } = await supabase
    .from("notification_schedules")
    .select("*", { count: "exact", head: true })
    .eq("user_id", user.id);

  if (countError) {
    return { success: false, error: ACTION_ERRORS.CREATE_FAILED("スケジュール") };
  }

  if ((count ?? 0) >= MAX_NOTIFICATION_SCHEDULES) {
    return {
      success: false,
      error: `スケジュールは${MAX_NOTIFICATION_SCHEDULES}件まで作成できます`,
    };
  }

  const { data, error } = await supabase
    .from("notification_schedules")
    .insert({
      user_id: user.id,
      label: parsed.data.label,
      time: parsed.data.time,
      message_type: parsed.data.message_type,
    })
    .select("id")
    .single();

  if (error) {
    return { success: false, error: ACTION_ERRORS.CREATE_FAILED("スケジュール") };
  }

  revalidatePath("/profile/notifications");
  return { success: true, data };
}

export async function updateNotificationSchedule(
  input: {
    id: string;
    label?: string;
    time?: string;
    message_type?: string;
    enabled?: boolean;
  },
): Promise<ActionResult<{ id: string }>> {
  const parsed = updateNotificationScheduleSchema.safeParse(input);
  if (!parsed.success) {
    return {
      success: false,
      error: ACTION_ERRORS.INVALID_INPUT,
      fieldErrors: extractFieldErrors(parsed.error),
    };
  }

  const { user, supabase } = await requireAuth();
  const { id, ...fields } = parsed.data;

  const { data, error } = await supabase
    .from("notification_schedules")
    .update({ ...fields, updated_at: new Date().toISOString() })
    .eq("id", id)
    .eq("user_id", user.id)
    .select("id")
    .single();

  if (error) {
    return { success: false, error: ACTION_ERRORS.UPDATE_FAILED("スケジュール") };
  }

  revalidatePath("/profile/notifications");
  return { success: true, data };
}

export async function deleteNotificationSchedule(
  input: { id: string },
): Promise<ActionResult<null>> {
  const parsed = deleteNotificationScheduleSchema.safeParse(input);
  if (!parsed.success) {
    return { success: false, error: ACTION_ERRORS.INVALID_INPUT };
  }

  const { user, supabase } = await requireAuth();

  const { error } = await supabase
    .from("notification_schedules")
    .delete()
    .eq("id", parsed.data.id)
    .eq("user_id", user.id);

  if (error) {
    return { success: false, error: ACTION_ERRORS.DELETE_FAILED("スケジュール") };
  }

  revalidatePath("/profile/notifications");
  return { success: true, data: null };
}

// 通知表示時に呼ばれるデータ取得アクション
// 注: get_due_materials RPC は SRS 手法のみ返す。通知では全手法の due カードを
// 対象にするため、cards + srs_states を直接クエリする。
export async function getNotificationData(
  messageType: "due_today" | "review_and_preview",
) {
  const { user, supabase } = await requireAuth();
  const today = new Date().toISOString().split("T")[0];

  async function getDueBySubject(targetDate: string) {
    // due カード = srs_state がない or due_date <= targetDate のカード
    const { data } = await supabase
      .from("cards")
      .select(`
        id,
        materials!inner(subject_id, subjects!inner(name))
      `)
      .eq("materials.user_id", user.id);

    if (!data) return [];

    // srs_states で未来の due_date を持つカードを除外
    const cardIds = data.map((c: { id: string }) => c.id);
    const { data: futureStates } = await supabase
      .from("srs_states")
      .select("card_id")
      .eq("user_id", user.id)
      .gt("due_date", targetDate)
      .in("card_id", cardIds);

    const futureIds = new Set((futureStates ?? []).map((s: { card_id: string }) => s.card_id));
    const dueCards = data.filter((c: { id: string }) => !futureIds.has(c.id));

    // 科目別に集計
    const counts = new Map<string, { subject: string; count: number }>();
    for (const card of dueCards) {
      const subjectName = (card as { materials: { subjects: { name: string } } }).materials.subjects.name;
      const existing = counts.get(subjectName);
      if (existing) {
        existing.count += 1;
      } else {
        counts.set(subjectName, { subject: subjectName, count: 1 });
      }
    }
    return Array.from(counts.values());
  }

  if (messageType === "due_today") {
    const subjects = await getDueBySubject(today);
    return { success: true as const, data: { subjects } };
  }

  // review_and_preview: 今日のセッション数 + 明日の due
  const tomorrow = new Date(Date.now() + 86400000).toISOString().split("T")[0];

  const [sessionsResult, subjects] = await Promise.all([
    supabase
      .from("sessions")
      .select("id", { count: "exact", head: true })
      .eq("user_id", user.id)
      .eq("status", "completed")
      .gte("created_at", `${today}T00:00:00`)
      .lt("created_at", `${tomorrow}T00:00:00`),
    getDueBySubject(tomorrow),
  ]);

  return {
    success: true as const,
    data: {
      sessionsToday: sessionsResult.count ?? 0,
      subjects,
    },
  };
}
```

- [ ] **Step 4: テスト実行して GREEN を確認**

Run: `bun test:small -- tests/small/lib/actions/notifications.test.ts`

Expected: PASS

- [ ] **Step 5: コミット**

```bash
git add src/lib/actions/notifications.ts \
  tests/small/lib/actions/notifications.test.ts
git commit -m "feat: 通知スケジュール CRUD Server Actions"
```

---

### Task 4: useNotificationPermission hook

**Files:**
- Create: `src/hooks/useNotificationPermission.ts`
- Create: `tests/small/hooks/useNotificationPermission.test.ts`

- [ ] **Step 1: テストを作成 (RED)**

`tests/small/hooks/useNotificationPermission.test.ts`:

```typescript
import { describe, it, expect, vi, beforeEach } from "vitest";
import { renderHook, act } from "@testing-library/react";
import { useNotificationPermission } from "@/hooks/useNotificationPermission";

// Notification API をモック
const mockRequestPermission = vi.fn();

beforeEach(() => {
  vi.stubGlobal("Notification", {
    permission: "default",
    requestPermission: mockRequestPermission,
  });
  mockRequestPermission.mockReset();
});

describe("useNotificationPermission", () => {
  it("returns current permission state", () => {
    const { result } = renderHook(() => useNotificationPermission());
    expect(result.current.permission).toBe("default");
  });

  it("returns granted when Notification.permission is granted", () => {
    vi.stubGlobal("Notification", {
      permission: "granted",
      requestPermission: mockRequestPermission,
    });

    const { result } = renderHook(() => useNotificationPermission());
    expect(result.current.permission).toBe("granted");
  });

  it("requests permission and updates state on grant", async () => {
    mockRequestPermission.mockResolvedValue("granted");

    const { result } = renderHook(() => useNotificationPermission());

    await act(async () => {
      await result.current.requestPermission();
    });

    expect(mockRequestPermission).toHaveBeenCalledOnce();
    expect(result.current.permission).toBe("granted");
  });

  it("requests permission and updates state on deny", async () => {
    mockRequestPermission.mockResolvedValue("denied");

    const { result } = renderHook(() => useNotificationPermission());

    await act(async () => {
      await result.current.requestPermission();
    });

    expect(result.current.permission).toBe("denied");
  });

  it("returns not-supported when Notification is undefined", () => {
    vi.stubGlobal("Notification", undefined);

    const { result } = renderHook(() => useNotificationPermission());
    expect(result.current.isSupported).toBe(false);
  });
});
```

- [ ] **Step 2: テスト実行して RED を確認**

Run: `bun test:small -- tests/small/hooks/useNotificationPermission.test.ts`

Expected: FAIL

- [ ] **Step 3: hook を実装 (GREEN)**

`src/hooks/useNotificationPermission.ts`:

```typescript
"use client";

import { useState, useCallback, useSyncExternalStore } from "react";

type PermissionState = NotificationPermission | "not-supported";

function getServerSnapshot(): PermissionState {
  return "not-supported";
}

function getSnapshot(): PermissionState {
  if (typeof Notification === "undefined") return "not-supported";
  return Notification.permission;
}

function subscribe(callback: () => void): () => void {
  // Notification API にはイベントリスナーがないため、
  // requestPermission 後に手動で更新する
  return () => {};
}

export function useNotificationPermission() {
  const browserPermission = useSyncExternalStore(
    subscribe,
    getSnapshot,
    getServerSnapshot,
  );

  const [permission, setPermission] = useState<PermissionState>(browserPermission);
  const isSupported = typeof Notification !== "undefined";

  const requestPermission = useCallback(async (): Promise<NotificationPermission | null> => {
    if (!isSupported) return null;

    const result = await Notification.requestPermission();
    setPermission(result);
    return result;
  }, [isSupported]);

  return {
    permission,
    isSupported,
    isGranted: permission === "granted",
    isDenied: permission === "denied",
    requestPermission,
  };
}
```

- [ ] **Step 4: テスト実行して GREEN を確認**

Run: `bun test:small -- tests/small/hooks/useNotificationPermission.test.ts`

Expected: PASS

- [ ] **Step 5: コミット**

```bash
git add src/hooks/useNotificationPermission.ts \
  tests/small/hooks/useNotificationPermission.test.ts
git commit -m "feat: useNotificationPermission hook"
```

---

### Task 5: useNotificationScheduler hook

**Files:**
- Create: `src/hooks/useNotificationScheduler.ts`
- Create: `tests/small/hooks/useNotificationScheduler.test.ts`

- [ ] **Step 1: テストを作成 (RED)**

`tests/small/hooks/useNotificationScheduler.test.ts`:

```typescript
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import {
  calcMsUntilNextFiring,
  shouldShowDelayedNotification,
} from "@/hooks/useNotificationScheduler";
import { NOTIFICATION_DELAY_THRESHOLD_MS } from "@/lib/constants";

describe("calcMsUntilNextFiring", () => {
  // ISO 8601 でオフセットを明示し、CI (UTC) でもローカル (JST) でも同じ結果にする
  it("returns positive ms when target time is later today", () => {
    // now = 08:00 JST, target = 10:00 → 2 hours
    const now = new Date("2026-04-09T08:00:00+09:00");
    const result = calcMsUntilNextFiring("10:00", now);
    expect(result).toBe(2 * 60 * 60 * 1000);
  });

  it("returns ms until next day when target time has passed", () => {
    // now = 23:00 JST, target = 08:00 → 9 hours
    const now = new Date("2026-04-09T23:00:00+09:00");
    const result = calcMsUntilNextFiring("08:00", now);
    expect(result).toBe(9 * 60 * 60 * 1000);
  });

  it("returns 24 hours when target time is exactly now", () => {
    const now = new Date("2026-04-09T08:00:00+09:00");
    const result = calcMsUntilNextFiring("08:00", now);
    // 0ms なら即発火ループになるので、24時間後にスケジュール
    expect(result).toBe(24 * 60 * 60 * 1000);
  });
});

describe("shouldShowDelayedNotification", () => {
  it("returns true when elapsed time is within threshold", () => {
    const scheduledTime = new Date(Date.now() - 10 * 60 * 1000); // 10 min ago
    expect(shouldShowDelayedNotification(scheduledTime)).toBe(true);
  });

  it("returns false when elapsed time exceeds threshold", () => {
    const scheduledTime = new Date(
      Date.now() - NOTIFICATION_DELAY_THRESHOLD_MS - 1000,
    );
    expect(shouldShowDelayedNotification(scheduledTime)).toBe(false);
  });

  it("returns false for future time", () => {
    const scheduledTime = new Date(Date.now() + 60000);
    expect(shouldShowDelayedNotification(scheduledTime)).toBe(false);
  });
});
```

- [ ] **Step 2: テスト実行して RED を確認**

Run: `bun test:small -- tests/small/hooks/useNotificationScheduler.test.ts`

Expected: FAIL

- [ ] **Step 3: hook を実装 (GREEN)**

`src/hooks/useNotificationScheduler.ts`:

```typescript
"use client";

import { useEffect, useRef, useCallback } from "react";
import { NOTIFICATION_DELAY_THRESHOLD_MS } from "@/lib/constants";
import type { NotificationMessageType } from "@/lib/constants";

type Schedule = {
  id: string;
  enabled: boolean;
  time: string; // "HH:MM" or "HH:MM:SS"
  message_type: NotificationMessageType;
  label: string;
};

// テスト対象として export する純粋関数
export function calcMsUntilNextFiring(time: string, now: Date): number {
  const [hours, minutes] = time.split(":").map(Number);
  const target = new Date(now);
  target.setHours(hours, minutes, 0, 0);

  let ms = target.getTime() - now.getTime();
  if (ms <= 0) {
    ms += 24 * 60 * 60 * 1000;
  }
  return ms;
}

export function shouldShowDelayedNotification(scheduledTime: Date): boolean {
  const elapsed = Date.now() - scheduledTime.getTime();
  return elapsed > 0 && elapsed <= NOTIFICATION_DELAY_THRESHOLD_MS;
}

export function useNotificationScheduler(params: {
  schedules: Schedule[];
  enabled: boolean;
  onFire: (schedule: Schedule) => void;
}) {
  const { schedules, enabled, onFire } = params;
  const timersRef = useRef<Map<string, ReturnType<typeof setTimeout>>>(new Map());
  const onFireRef = useRef(onFire);
  onFireRef.current = onFire;

  const clearAllTimers = useCallback(() => {
    for (const timer of timersRef.current.values()) {
      clearTimeout(timer);
    }
    timersRef.current.clear();
  }, []);

  const scheduleTimer = useCallback(
    (schedule: Schedule) => {
      const ms = calcMsUntilNextFiring(schedule.time, new Date());
      const timer = setTimeout(() => {
        onFireRef.current(schedule);
        // 次の日のタイマーを再設定
        scheduleTimer(schedule);
      }, ms);
      timersRef.current.set(schedule.id, timer);
    },
    [],
  );

  useEffect(() => {
    clearAllTimers();

    if (!enabled) return;

    const activeSchedules = schedules.filter((s) => s.enabled);
    for (const schedule of activeSchedules) {
      scheduleTimer(schedule);
    }

    return clearAllTimers;
  }, [schedules, enabled, clearAllTimers, scheduleTimer]);

  // visibilitychange で復帰時にタイマーを再設定
  useEffect(() => {
    if (!enabled) return;

    const handleVisibilityChange = () => {
      if (document.visibilityState === "visible") {
        // 非アクティブ中に経過したスケジュールを確認
        const now = new Date();
        const activeSchedules = schedules.filter((s) => s.enabled);

        for (const schedule of activeSchedules) {
          const [hours, minutes] = schedule.time.split(":").map(Number);
          const scheduledToday = new Date(now);
          scheduledToday.setHours(hours, minutes, 0, 0);

          if (shouldShowDelayedNotification(scheduledToday)) {
            onFireRef.current(schedule);
          }
        }

        // タイマーを再設定
        clearAllTimers();
        for (const schedule of activeSchedules) {
          scheduleTimer(schedule);
        }
      }
    };

    document.addEventListener("visibilitychange", handleVisibilityChange);
    return () => {
      document.removeEventListener("visibilitychange", handleVisibilityChange);
    };
  }, [schedules, enabled, clearAllTimers, scheduleTimer]);
}
```

- [ ] **Step 4: テスト実行して GREEN を確認**

Run: `bun test:small -- tests/small/hooks/useNotificationScheduler.test.ts`

Expected: PASS

- [ ] **Step 5: コミット**

```bash
git add src/hooks/useNotificationScheduler.ts \
  tests/small/hooks/useNotificationScheduler.test.ts
git commit -m "feat: useNotificationScheduler hook"
```

---

### Task 6: UI コンポーネント + 通知設定ページ

**Files:**
- Create: `src/components/notification-toggle.tsx`
- Create: `src/components/notification-schedule-list.tsx`
- Create: `src/components/notification-schedule-form.tsx`
- Create: `src/components/notification-provider.tsx`
- Create: `src/app/(main)/profile/notifications/page.tsx`
- Modify: `src/app/(main)/profile/page.tsx`
- Modify: `src/app/(main)/layout.tsx`

- [ ] **Step 1: notification-toggle.tsx を作成**

```typescript
"use client";

import { useState, useTransition } from "react";
import { useNotificationPermission } from "@/hooks/useNotificationPermission";
import { toggleNotificationEnabled } from "@/lib/actions/notifications";

export function NotificationToggle(props: {
  initialEnabled: boolean;
  onToggle?: (enabled: boolean) => void;
}) {
  const [enabled, setEnabled] = useState(props.initialEnabled);
  const [isPending, startTransition] = useTransition();
  const { isSupported, isDenied, requestPermission } = useNotificationPermission();

  const handleToggle = async () => {
    const newValue = !enabled;

    if (newValue && !isDenied) {
      const result = await requestPermission();
      if (result === "denied") return;
    }

    setEnabled(newValue);
    startTransition(async () => {
      const result = await toggleNotificationEnabled(newValue);
      if (!result.success) {
        setEnabled(!newValue); // ロールバック
      } else {
        props.onToggle?.(newValue);
      }
    });
  };

  if (!isSupported) {
    return (
      <p className="text-sm text-muted-foreground">
        このブラウザは通知に対応していません
      </p>
    );
  }

  return (
    <div className="flex items-center justify-between">
      <div>
        <p className="font-medium">通知</p>
        {isDenied && (
          <p className="text-xs text-muted-foreground">
            ブラウザの設定から通知を許可してください
          </p>
        )}
      </div>
      <button
        type="button"
        role="switch"
        aria-checked={enabled}
        disabled={isPending || isDenied}
        onClick={handleToggle}
        data-testid="notification-master-toggle"
        className={`relative inline-flex h-6 w-11 items-center rounded-full transition-colors ${
          enabled ? "bg-primary" : "bg-muted"
        } ${isPending || isDenied ? "opacity-50 cursor-not-allowed" : "cursor-pointer"}`}
      >
        <span
          className={`inline-block h-4 w-4 rounded-full bg-background transition-transform ${
            enabled ? "translate-x-6" : "translate-x-1"
          }`}
        />
      </button>
    </div>
  );
}
```

- [ ] **Step 2: notification-schedule-form.tsx を作成**

```typescript
"use client";

import { useState, useTransition } from "react";
import {
  createNotificationSchedule,
  updateNotificationSchedule,
} from "@/lib/actions/notifications";
import { NOTIFICATION_MESSAGE_TYPES } from "@/lib/constants";

type Schedule = {
  id: string;
  label: string;
  time: string;
  message_type: string;
  enabled: boolean;
};

const MESSAGE_TYPE_LABELS: Record<string, string> = {
  due_today: "今日の due カード",
  review_and_preview: "振り返り + 明日の予告",
};

export function NotificationScheduleForm(props: {
  schedule?: Schedule;
  onSaved?: () => void;
  onCancel?: () => void;
}) {
  const isEdit = !!props.schedule;
  const [label, setLabel] = useState(props.schedule?.label ?? "");
  const [time, setTime] = useState(props.schedule?.time?.slice(0, 5) ?? "08:00");
  const [messageType, setMessageType] = useState(
    props.schedule?.message_type ?? "due_today",
  );
  const [error, setError] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);

    startTransition(async () => {
      const result = isEdit
        ? await updateNotificationSchedule({
            id: props.schedule!.id,
            label,
            time,
            message_type: messageType,
          })
        : await createNotificationSchedule({
            label,
            time,
            message_type: messageType,
          });

      if (result.success) {
        props.onSaved?.();
      } else {
        setError(result.error);
      }
    });
  };

  return (
    <form onSubmit={handleSubmit} className="space-y-4" data-testid="schedule-form">
      <div>
        <label htmlFor="schedule-label" className="block text-sm font-medium">
          ラベル
        </label>
        <input
          id="schedule-label"
          type="text"
          value={label}
          onChange={(e) => setLabel(e.target.value)}
          className="mt-1 w-full rounded-md border bg-background px-3 py-2 text-sm"
          data-testid="schedule-label-input"
        />
      </div>
      <div>
        <label htmlFor="schedule-time" className="block text-sm font-medium">
          時刻
        </label>
        <input
          id="schedule-time"
          type="time"
          value={time}
          onChange={(e) => setTime(e.target.value)}
          className="mt-1 w-full rounded-md border bg-background px-3 py-2 text-sm"
          data-testid="schedule-time-input"
        />
      </div>
      <div>
        <label htmlFor="schedule-type" className="block text-sm font-medium">
          通知タイプ
        </label>
        <select
          id="schedule-type"
          value={messageType}
          onChange={(e) => setMessageType(e.target.value)}
          className="mt-1 w-full rounded-md border bg-background px-3 py-2 text-sm"
          data-testid="schedule-type-select"
        >
          {NOTIFICATION_MESSAGE_TYPES.map((type) => (
            <option key={type} value={type}>
              {MESSAGE_TYPE_LABELS[type]}
            </option>
          ))}
        </select>
      </div>
      {error && (
        <p className="text-sm text-destructive" role="alert">
          {error}
        </p>
      )}
      <div className="flex gap-2">
        <button
          type="submit"
          disabled={isPending}
          className="rounded-md bg-primary px-4 py-2 text-sm text-primary-foreground"
          data-testid="schedule-save-button"
        >
          {isPending ? "保存中..." : isEdit ? "更新" : "追加"}
        </button>
        {props.onCancel && (
          <button
            type="button"
            onClick={props.onCancel}
            className="rounded-md border px-4 py-2 text-sm"
          >
            キャンセル
          </button>
        )}
      </div>
    </form>
  );
}
```

- [ ] **Step 3: notification-schedule-list.tsx を作成**

```typescript
"use client";

import { useState, useTransition } from "react";
import {
  updateNotificationSchedule,
  deleteNotificationSchedule,
} from "@/lib/actions/notifications";
import { NotificationScheduleForm } from "./notification-schedule-form";

type Schedule = {
  id: string;
  label: string;
  time: string;
  message_type: string;
  enabled: boolean;
};

export function NotificationScheduleList(props: {
  schedules: Schedule[];
}) {
  const [editingId, setEditingId] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();

  const handleToggle = (schedule: Schedule) => {
    startTransition(async () => {
      await updateNotificationSchedule({
        id: schedule.id,
        enabled: !schedule.enabled,
      });
    });
  };

  const handleDelete = (id: string) => {
    startTransition(async () => {
      await deleteNotificationSchedule({ id });
    });
  };

  if (props.schedules.length === 0) {
    return (
      <p className="text-sm text-muted-foreground" data-testid="no-schedules">
        スケジュールがありません
      </p>
    );
  }

  return (
    <ul className="space-y-2" data-testid="schedule-list">
      {props.schedules.map((schedule) => (
        <li
          key={schedule.id}
          className="rounded-lg border p-4"
          data-testid={`schedule-item-${schedule.id}`}
        >
          {editingId === schedule.id ? (
            <NotificationScheduleForm
              schedule={schedule}
              onSaved={() => setEditingId(null)}
              onCancel={() => setEditingId(null)}
            />
          ) : (
            <div className="flex items-center justify-between">
              <div>
                <p className="font-medium">{schedule.label}</p>
                <p className="text-sm text-muted-foreground">
                  {schedule.time.slice(0, 5)}
                </p>
              </div>
              <div className="flex items-center gap-2">
                <button
                  type="button"
                  role="switch"
                  aria-checked={schedule.enabled}
                  aria-label={`${schedule.label}の通知を${schedule.enabled ? "オフ" : "オン"}にする`}
                  disabled={isPending}
                  onClick={() => handleToggle(schedule)}
                  data-testid={`schedule-toggle-${schedule.id}`}
                  className={`relative inline-flex h-5 w-9 items-center rounded-full transition-colors ${
                    schedule.enabled ? "bg-primary" : "bg-muted"
                  }`}
                >
                  <span
                    className={`inline-block h-3 w-3 rounded-full bg-background transition-transform ${
                      schedule.enabled ? "translate-x-5" : "translate-x-1"
                    }`}
                  />
                </button>
                <button
                  type="button"
                  onClick={() => setEditingId(schedule.id)}
                  className="text-sm text-muted-foreground hover:text-foreground"
                  data-testid={`schedule-edit-${schedule.id}`}
                >
                  編集
                </button>
                <button
                  type="button"
                  onClick={() => handleDelete(schedule.id)}
                  disabled={isPending}
                  className="text-sm text-destructive hover:text-destructive/80"
                  data-testid={`schedule-delete-${schedule.id}`}
                >
                  削除
                </button>
              </div>
            </div>
          )}
        </li>
      ))}
    </ul>
  );
}
```

- [ ] **Step 4: notification-provider.tsx を作成**

```typescript
"use client";

import { useCallback } from "react";
import { useNotificationScheduler } from "@/hooks/useNotificationScheduler";
import { useNotificationPermission } from "@/hooks/useNotificationPermission";
import { getNotificationData } from "@/lib/actions/notifications";
import {
  buildDueTodayMessage,
  buildReviewAndPreviewMessage,
} from "@/lib/utils/notification-messages";
import type { NotificationMessageType } from "@/lib/constants";

type Schedule = {
  id: string;
  enabled: boolean;
  time: string;
  message_type: NotificationMessageType;
  label: string;
};

export function NotificationProvider(props: {
  schedules: Schedule[];
  enabled: boolean;
}) {
  const { isGranted } = useNotificationPermission();

  const handleFire = useCallback(
    async (schedule: Schedule) => {
      if (!isGranted) return;

      const result = await getNotificationData(schedule.message_type);
      if (!result.success) return;

      let message;
      if (schedule.message_type === "due_today") {
        message = buildDueTodayMessage(result.data.subjects);
      } else {
        message = buildReviewAndPreviewMessage({
          sessionsToday: result.data.sessionsToday,
          dueTomorrow: result.data.subjects,
        });
      }

      new Notification(message.title, {
        body: message.body,
        tag: schedule.id, // 同じ schedule の重複通知を防ぐ
      });
    },
    [isGranted],
  );

  useNotificationScheduler({
    schedules: props.schedules,
    enabled: props.enabled && isGranted,
    onFire: handleFire,
  });

  return null; // UI を持たないプロバイダー
}
```

- [ ] **Step 5: 通知設定ページを作成**

`src/app/(main)/profile/notifications/page.tsx`:

```typescript
import {
  getNotificationSchedules,
  getNotificationEnabled,
} from "@/lib/actions/notifications";
import { NotificationToggle } from "@/components/notification-toggle";
import { NotificationScheduleList } from "@/components/notification-schedule-list";
import { NotificationScheduleForm } from "@/components/notification-schedule-form";
import { MAX_NOTIFICATION_SCHEDULES } from "@/lib/constants";
import Link from "next/link";

export default async function NotificationsPage() {
  // requireAuth() は getNotificationEnabled / getNotificationSchedules 内部で呼ばれる
  // 未認証時は redirect("/auth/login") される
  const [enabledResult, schedulesResult] = await Promise.all([
    getNotificationEnabled(),
    getNotificationSchedules(),
  ]);

  const notificationEnabled =
    enabledResult.success ? enabledResult.data.notification_enabled : false;
  const schedules = schedulesResult.success ? schedulesResult.data : [];

  return (
    <div className="p-4">
      <div className="mb-4">
        <Link
          href="/profile"
          className="text-sm text-muted-foreground hover:text-foreground"
          data-testid="back-to-profile"
        >
          ← 設定
        </Link>
      </div>
      <h2 className="text-lg font-bold">通知設定</h2>

      <div className="mt-6 space-y-6">
        <NotificationToggle initialEnabled={notificationEnabled} />

        {notificationEnabled && (
          <>
            <div>
              <h3 className="mb-2 text-sm font-medium text-muted-foreground uppercase tracking-wide">
                スケジュール
              </h3>
              <NotificationScheduleList schedules={schedules} />
            </div>

            {schedules.length < MAX_NOTIFICATION_SCHEDULES && (
              <NotificationScheduleForm />
            )}
          </>
        )}
      </div>
    </div>
  );
}
```

- [ ] **Step 6: プロフィールページに通知設定リンクを追加**

`src/app/(main)/profile/page.tsx` に以下を追加:

```typescript
// 既存の email 表示とログアウトボタンの間に通知設定リンクを追加
<Link
  href="/profile/notifications"
  className="flex items-center justify-between rounded-md border px-4 py-3 text-sm hover:bg-muted"
  data-testid="notification-settings-link"
>
  <span>通知設定</span>
  <span className="text-muted-foreground">›</span>
</Link>
```

- [ ] **Step 7: layout.tsx に NotificationProvider を追加**

`src/app/(main)/layout.tsx`:

```typescript
import { BottomNav } from "@/components/navigation/bottom-nav";
import { Sidebar } from "@/components/navigation/sidebar";
import { NotificationProvider } from "@/components/notification-provider";
import { createClient } from "@/lib/supabase/server";

export default async function MainLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  // 通知設定を取得（未認証なら空で NotificationProvider は何もしない）
  let notificationEnabled = false;
  let schedules: Array<{
    id: string;
    enabled: boolean;
    time: string;
    message_type: "due_today" | "review_and_preview";
    label: string;
  }> = [];

  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (user) {
    const [profileResult, schedulesResult] = await Promise.all([
      supabase
        .from("profiles")
        .select("notification_enabled")
        .eq("id", user.id)
        .single(),
      supabase
        .from("notification_schedules")
        .select("id, enabled, time, message_type, label")
        .eq("user_id", user.id)
        .order("time", { ascending: true }),
    ]);
    notificationEnabled = profileResult.data?.notification_enabled ?? false;
    schedules = (schedulesResult.data ?? []) as typeof schedules;
  }

  return (
    <div className="flex min-h-dvh">
      <Sidebar />
      <main className="flex-1 pb-16 md:pb-0">{children}</main>
      <BottomNav />
      <NotificationProvider
        schedules={schedules}
        enabled={notificationEnabled}
      />
    </div>
  );
}
```

- [ ] **Step 8: コミット**

```bash
git add src/components/notification-toggle.tsx \
  src/components/notification-schedule-form.tsx \
  src/components/notification-schedule-list.tsx \
  src/components/notification-provider.tsx \
  src/app/(main)/profile/notifications/page.tsx \
  src/app/(main)/profile/page.tsx \
  src/app/(main)/layout.tsx
git commit -m "feat: 通知設定 UI + NotificationProvider"
```

---

### Task 7: PWA manifest + Service Worker 骨格

**Files:**
- Create: `public/manifest.webmanifest`
- Create: `public/sw.js`
- Modify: `src/app/layout.tsx`

- [ ] **Step 1: manifest.webmanifest を作成**

`public/manifest.webmanifest`:

```json
{
  "name": "Kairous",
  "short_name": "Kairous",
  "start_url": "/",
  "display": "standalone",
  "background_color": "#ffffff",
  "theme_color": "#6366f1"
}
```

- [ ] **Step 2: 空の Service Worker を作成**

`public/sw.js`:

```javascript
// 将来の Web Push 受信用。現在は空。
// push イベントハンドラは Web Push 移行時に追加する。
self.addEventListener("install", () => self.skipWaiting());
self.addEventListener("activate", (event) => event.waitUntil(self.clients.claim()));
```

- [ ] **Step 3: ルートレイアウトに manifest リンクと SW 登録を追加**

`src/app/layout.tsx` の `<head>` (metadata) に:

```typescript
// metadata export に追加
export const metadata: Metadata = {
  // ...既存の設定
  manifest: "/manifest.webmanifest",
};
```

`<body>` の末尾に SW 登録スクリプトを追加。CSP が `script-src 'nonce-...' 'strict-dynamic'` のため、nonce を付与する必要がある。

既存パターン: `src/middleware.ts` がレスポンスヘッダーに nonce を設定し、`src/app/layout.tsx` で `headers()` から nonce を取得して `<NextScript nonce={nonce} />` に渡す。同じ仕組みを使う:

```typescript
import { headers } from "next/headers";

// RootLayout 内で:
const headersList = await headers();
const nonce = headersList.get("x-nonce") ?? "";

// body 末尾に:
<script
  nonce={nonce}
  dangerouslySetInnerHTML={{
    __html: `
      if ('serviceWorker' in navigator) {
        navigator.serviceWorker.register('/sw.js').catch(() => {});
      }
    `,
  }}
/>
```

注: 既存の `layout.tsx` が既に nonce を取得しているかを確認し、重複しないようにする。取得済みなら同じ変数を使い回す。

- [ ] **Step 4: コミット**

```bash
git add public/manifest.webmanifest public/sw.js src/app/layout.tsx
git commit -m "feat: PWA manifest + Service Worker 骨格"
```

---

### Task 8: Medium テスト (DB 統合)

**Files:**
- Create: `tests/medium/lib/actions/notifications.test.ts`

- [ ] **Step 1: テストヘルパーにクリーンアップ関数を追加**

`tests/shared/helpers.ts` に追加:

```typescript
export async function cleanupNotificationSchedules(userId: string) {
  await getAdminClient()
    .from("notification_schedules")
    .delete()
    .eq("user_id", userId);
}
```

`tests/medium/helpers/db.ts` の re-export に追加:

```typescript
export {
  // ...既存の export
  cleanupNotificationSchedules,
} from "../../shared/helpers";
```

- [ ] **Step 2: Medium テストを作成**

`tests/medium/lib/actions/notifications.test.ts`:

```typescript
import { describe, it, expect, beforeAll, afterAll, afterEach } from "vitest";
import { getAdminClient, createTestUser, deleteTestUser } from "../../setup";
import { cleanupNotificationSchedules } from "../../helpers/db";

let userId: string;
let otherUserId: string;

beforeAll(async () => {
  userId = await createTestUser("notif-test@example.com");
  otherUserId = await createTestUser("notif-other@example.com");
});

afterEach(async () => {
  await cleanupNotificationSchedules(userId);
  await cleanupNotificationSchedules(otherUserId);
});

afterAll(async () => {
  await deleteTestUser(userId);
  await deleteTestUser(otherUserId);
});

describe("notification_schedules CRUD", () => {
  it("creates a schedule for user", async () => {
    const { data, error } = await getAdminClient()
      .from("notification_schedules")
      .insert({
        user_id: userId,
        label: "朝の通知",
        time: "08:00",
        message_type: "due_today",
      })
      .select()
      .single();

    expect(error).toBeNull();
    expect(data?.label).toBe("朝の通知");
    expect(data?.enabled).toBe(true);
  });

  it("rejects invalid message_type via CHECK constraint", async () => {
    const { error } = await getAdminClient()
      .from("notification_schedules")
      .insert({
        user_id: userId,
        label: "テスト",
        time: "08:00",
        message_type: "invalid_type",
      });

    expect(error).not.toBeNull();
  });
});

describe("notification_schedules RLS", () => {
  it("user cannot read other user schedules", async () => {
    // admin で他ユーザーのスケジュールを作成
    await getAdminClient().from("notification_schedules").insert({
      user_id: otherUserId,
      label: "他ユーザーの通知",
      time: "09:00",
      message_type: "due_today",
    });

    // userId のクライアントで全件取得 → 他ユーザーのデータは見えない
    const { createUserClient } = await import("../../setup");
    const userClient = await createUserClient(userId);
    const { data } = await userClient
      .from("notification_schedules")
      .select("*");

    expect(data).toHaveLength(0);
  });
});

describe("profiles.notification_enabled RLS", () => {
  it("user cannot update other user notification_enabled", async () => {
    const { createUserClient } = await import("../../setup");
    const userClient = await createUserClient(userId);

    const { error } = await userClient
      .from("profiles")
      .update({ notification_enabled: true })
      .eq("id", otherUserId);

    // RLS が WITH CHECK で弾くため、update は 0 行に影響（エラーではなく空結果）
    const { data: otherProfile } = await getAdminClient()
      .from("profiles")
      .select("notification_enabled")
      .eq("id", otherUserId)
      .single();

    expect(otherProfile?.notification_enabled).toBe(false);
  });
});
```

- [ ] **Step 3: テスト実行**

Run: `bun test:medium -- tests/medium/lib/actions/notifications.test.ts`

Expected: PASS

- [ ] **Step 4: コミット**

```bash
git add tests/medium/lib/actions/notifications.test.ts \
  tests/shared/helpers.ts
git commit -m "test: 通知スケジュール Medium テスト (DB統合 + RLS)"
```

---

### Task 9: E2E テスト

**Files:**
- Create: `tests/large/notifications.spec.ts`

- [ ] **Step 1: E2E テストを作成**

`tests/large/notifications.spec.ts`:

```typescript
import { test, expect } from "@playwright/test";

test.describe("Notification Settings", () => {
  test.beforeEach(async ({ page }) => {
    // ログイン
    await page.goto("/auth/login");
    await page.waitForLoadState("networkidle");
    await page.getByLabel("メールアドレス").fill("test@example.com");
    await page.getByLabel("パスワード").fill("testpass123");
    await page.getByRole("button", { name: "ログイン" }).click();
    await page.waitForURL("/");
  });

  test("navigates to notification settings from profile", async ({ page }) => {
    await page.goto("/profile");
    await page.waitForLoadState("networkidle");

    await page.getByTestId("notification-settings-link").click();
    await page.waitForURL("/profile/notifications");

    await expect(page.getByText("通知設定")).toBeVisible();
  });

  test("toggles master notification on and creates default schedules", async ({
    page,
  }) => {
    await page.goto("/profile/notifications");
    await page.waitForLoadState("networkidle");

    // マスタートグルを ON にする（ブラウザの通知許可はテスト環境では自動許可）
    await page.getByTestId("notification-master-toggle").click();

    // デフォルトスケジュールが作成される
    await expect(page.getByTestId("schedule-list")).toBeVisible();
    await expect(page.getByText("朝の通知")).toBeVisible();
    await expect(page.getByText("夜の通知")).toBeVisible();
  });

  test("adds a new notification schedule", async ({ page }) => {
    await page.goto("/profile/notifications");
    await page.waitForLoadState("networkidle");

    // 各テストは独立して実行可能にする。マスタートグルが OFF なら ON にする
    const toggle = page.getByTestId("notification-master-toggle");
    if ((await toggle.getAttribute("aria-checked")) !== "true") {
      await toggle.click();
      await page.waitForTimeout(500);
    }

    // フォームに入力
    await page.getByTestId("schedule-label-input").fill("昼の通知");
    await page.getByTestId("schedule-time-input").fill("12:00");
    await page.getByTestId("schedule-save-button").click();

    // 追加されたスケジュールが表示される
    await expect(page.getByText("昼の通知")).toBeVisible();
  });

  test("deletes a notification schedule", async ({ page }) => {
    await page.goto("/profile/notifications");
    await page.waitForLoadState("networkidle");

    // 各テストは独立して実行可能にする
    const toggle = page.getByTestId("notification-master-toggle");
    if ((await toggle.getAttribute("aria-checked")) !== "true") {
      await toggle.click();
      await page.waitForTimeout(500);
    }

    // 最初のスケジュールの削除ボタンをクリック
    const deleteButtons = page.locator("[data-testid^='schedule-delete-']");
    const count = await deleteButtons.count();
    if (count > 0) {
      const firstDeleteButton = deleteButtons.first();
      await firstDeleteButton.click();
      await page.waitForTimeout(500);

      // 1 件減ったことを確認
      const newCount = await deleteButtons.count();
      expect(newCount).toBe(count - 1);
    }
  });

  test("navigates back to profile", async ({ page }) => {
    await page.goto("/profile/notifications");
    await page.waitForLoadState("networkidle");

    await page.getByTestId("back-to-profile").click();
    await page.waitForURL("/profile");
  });
});
```

- [ ] **Step 2: テスト実行**

Run: `bun test:large -- tests/large/notifications.spec.ts`

Expected: PASS

- [ ] **Step 3: コミット**

```bash
git add tests/large/notifications.spec.ts
git commit -m "test: 通知設定 E2E テスト"
```

---

### Task 10: ドキュメント更新 + 最終確認

**Files:**
- Modify: `CLAUDE.md`

- [ ] **Step 1: CLAUDE.md を更新**

Directory Structure に `notifications/` を追加:

```
    profile/      # /profile, /profile/notifications
```

Design Decisions に追加:

```
- **Notification** uses client-side scheduling (Notification API + setTimeout). No Web Push in MVP. Schedules stored in `notification_schedules` table with master toggle in `profiles.notification_enabled`.
```

- [ ] **Step 2: lint + typecheck + テスト全実行**

Run: `bun lint && bun typecheck && bun test:small && bun test:medium`

Expected: PASS

- [ ] **Step 3: コミット**

```bash
git add CLAUDE.md
git commit -m "docs: CLAUDE.md に通知機能を追記"
```

- [ ] **Step 4: git push**

Run: `git push`
