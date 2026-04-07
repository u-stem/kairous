# コード品質改善 設計書

## 概要

v0.7.0 まで蓄積した技術的負債を解消する。共通化・定数化、エラーハンドリング改善、テスト補強の3軸で品質を底上げする。

Epic: #116, PBI: #117 / #118 / #119, Milestone: v0.8.0

## 設計判断

| 項目 | 決定 | 理由 |
|------|------|------|
| 認証共通化の粒度 | ユーティリティ関数のみ | Higher-order function は過度な抽象化。action ごとの差異に対応しづらい |
| エラーメッセージ管理 | `constants.ts` に定数追加 | 既存の定数管理パターンに合わせる。別ファイルにするほどの量ではない |
| ログ集約 (Sentry 等) | スコープ外 | 外部サービス連携は別 PBI。今回は error.tsx + エラー処理改善に集中 |
| error.tsx の粒度 | グローバル + セクション別 | セクションごとにリカバリー方法が異なる (ナビゲーション表示の有無等) |
| テスト追加対象 | actions 2 ファイル + コンポーネント 4 件 | カバレッジギャップが大きく、リグレッションリスクが高い箇所 |

---

## PBI 1: 共通化・定数化 (#117)

### 1a. 認証ユーティリティ抽出

**新規ファイル**: `src/lib/actions/auth-utils.ts`

```typescript
import { createClient } from "@/lib/supabase/server";

export async function getAuthenticatedUser() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  return { user, supabase };
}
```

`user` と `supabase` を一緒に返す。ほぼ全ての action で両方を使うため。

**対象ファイル** (6 ファイル、20+ 箇所):
- `src/lib/actions/sessions.ts`
- `src/lib/actions/materials.ts`
- `src/lib/actions/cards.ts`
- `src/lib/actions/subjects.ts`
- `src/lib/actions/material-methods.ts`
- `src/lib/actions/stats.ts`

### 1b. エラーメッセージ定数化

**変更ファイル**: `src/lib/constants.ts`

```typescript
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
```

### 1c. バリデーション制約値の定数化

**変更ファイル**: `src/lib/constants.ts`

```typescript
export const VALIDATION_LIMITS = {
  SUBJECT_NAME_MAX: 100,
  MATERIAL_TITLE_MAX: 200,
  MATERIAL_DESCRIPTION_MAX: 2000,
  CARD_TEXT_MAX: 5000,
  ELABORATION_TEXT_MAX: 10000,
  REVIEWS_MAX: 500,
  INTERLEAVING_MATERIALS_MAX: 10,
} as const;
```

`ELABORATION_CARDS_MAX` は既存の `SESSION_MAX_CARDS` と同値なので、validation 側で `SESSION_MAX_CARDS` を直接参照する。

**対象ファイル** (5 ファイル):
- `src/lib/validations/materials.ts`
- `src/lib/validations/sessions.ts`
- `src/lib/validations/elaboration.ts`
- `src/lib/validations/interleaving.ts`
- `src/lib/validations/pomodoro.ts`

### 1d. 日付関数の統一

`.toISOString().split("T")[0]` を全て `toJstDateString` に置換する。

**既存関数**: `src/lib/utils/date.ts` の `toJstDateString`

**対象箇所**: `sessions.ts`、`materials.ts`、`cards.ts` 内の直接フォーマット

### 1e. タイマー hook 共通化

**新規ファイル**: `src/hooks/use-countdown-timer.ts`

```typescript
type CountdownState = {
  remainingSeconds: number;
  progress: number; // 0.0 ~ 1.0 (残り割合)
  isRunning: boolean;
  start: () => void;
  pause: () => void;
  reset: () => void;
};

export function useCountdownTimer(totalSeconds: number): CountdownState;
```

**対象ファイル**:
- `src/app/session/[id]/use-pomodoro-timer.ts`: 内部で `useCountdownTimer` を利用。フェーズ管理 (focus/break) はこのファイルに残る
- `src/app/rest/[id]/use-rest-timer.ts`: `useCountdownTimer` をほぼそのまま利用

### 1f. セッション完了補償パターン共通化

**新規ファイル**: `src/lib/actions/session-compensation.ts`

```typescript
type CompensationResult =
  | { ok: true; data: unknown }
  | { ok: false; error: string };

export async function invokeCompleteSession(
  supabase: SupabaseClient,
  sessionId: string,
  body: Record<string, unknown>,
): Promise<CompensationResult>;
```

Edge Function `complete-session` の呼び出しと、失敗時のセッション status リセットを一箇所にまとめる。

**対象箇所**:
- `completeSession` (sessions.ts 行 230-254)
- `completeElaborationSession` (sessions.ts 行 470-492)

---

## PBI 2: エラーハンドリング改善 (#118)

### 2a. error.tsx 導入

| ファイル | 用途 | リカバリー |
|---------|------|-----------|
| `src/app/error.tsx` | グローバル fallback | "ホームに戻る" ボタン |
| `src/app/(main)/error.tsx` | メインレイアウト内 | ナビゲーション表示 + "再読み込み" ボタン |
| `src/app/session/error.tsx` | セッション中のエラー | "ホームに戻る" (ナビなし) |
| `src/app/rest/error.tsx` | 休息タイマーのエラー | "ホームに戻る" (ナビなし) |

全て `"use client"` コンポーネント。`error` prop と `reset` prop を受け取る Next.js 規約に従う。本番では `console.error` でログ、開発時のみエラー詳細を表示。

### 2b. サイレント失敗の修正

**summary-actions.tsx**:
- `completeSession` / `completePomodoroSession` の返り値を確認
- 失敗時は `toast.error` でユーザーに通知
- ナビゲーションは成功時のみ実行

**データ取得関数のエラーハンドリング方針**:

Server Component から呼ばれるデータ取得関数は、エラー時に `throw` して error.tsx でキャッチする方式に統一する。

| 関数 | 現在の挙動 | 変更後 |
|------|-----------|--------|
| `getMaterials` | `[]` を返す | `throw` |
| `getMaterial` | エラー無視 | `throw` |
| `getStats` | 空 stats を返す | `throw` |
| `getDueMaterials` | `[]` を返す | `throw` |
| `getInterleavingCards` | `[]` を返す | `throw` |
| `getSubjects` | `[]` を返す | `throw` |

認証エラー (user なし) は `redirect("/auth/login")` のまま変更しない。Supabase クエリエラーのみ `throw` する。

### 2c. DB エラーコード型安全化

**変更ファイル**: `src/lib/constants.ts`

```typescript
export const PG_ERROR_CODES = {
  UNIQUE_VIOLATION: "23505",
  FOREIGN_KEY_VIOLATION: "23503",
} as const;
```

**対象箇所**:
- `src/lib/actions/material-methods.ts`: `error?.code === "23505"` → `PG_ERROR_CODES.UNIQUE_VIOLATION`

---

## PBI 3: テスト補強 (#119)

### 3a. materials.ts actions テスト

**新規ファイル**: `tests/small/lib/actions/materials.test.ts`

テスト対象:
- `createMaterial`: 正常系 (material + methods 作成)、バリデーションエラー、認証エラー、methods 作成失敗時のロールバック
- `getMaterials`: 正常系 (分野グループ化)、認証エラー
- `getMaterial`: 正常系 (RPC 経由)、not found
- `updateMaterial`: 正常系、所有権チェック

Supabase クライアントは Small テストなのでモック。

### 3b. subjects.ts actions テスト

**新規ファイル**: `tests/small/lib/actions/subjects.test.ts`

テスト対象:
- `createSubject`: 正常系、バリデーションエラー、認証エラー
- `getSubjects`: 正常系

### 3c. コンポーネントテスト

| 新規テストファイル | テスト観点 |
|------------------|-----------|
| `tests/small/components/interleaving-button.test.tsx` | 表示条件、クリック → セッション作成、ローディング状態 |
| `tests/small/components/material-card.test.tsx` | props の表示、due 件数バッジ、クリックイベント |
| `tests/small/components/method-select-list.test.tsx` | メソッド一覧表示、選択状態、セッション開始 |
| `tests/small/components/subject-selector.test.tsx` | 科目一覧、選択、新規作成 |

---

## テスト方針

- 全変更は既存テストが緑の状態から開始 (リファクタリングの原則)
- 共通化・定数化 (PBI 1) は振る舞いを変えないため、既存テストがそのまま回帰テストになる
- エラーハンドリング変更 (PBI 2) では、`throw` に変更する関数の既存テストを修正
- テスト補強 (PBI 3) は PBI 1・2 の変更後のコードに対して書く

## 実装順序

PBI 1 → PBI 2 → PBI 3 の順。PBI 1 のリファクタリングでコードがクリーンになった状態で PBI 2・3 に着手する。PBI 3 は PBI 2 の `throw` 変更を前提とするテストを含む。

## スコープ外

- Sentry 等のログ集約サービス導入 (別 PBI)
- Higher-order function による action 抽象化
- not-found.tsx の追加 (現在 `notFound()` は適切に使われている)
- コンポーネントの大規模リファクタリング
