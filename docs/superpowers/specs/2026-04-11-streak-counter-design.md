# Streak カウンター設計書

## 概要

学習の習慣化を促進するため、連続学習日数 (Streak) を計算・表示する機能を追加する。

## 設計判断

### アプローチ: アプリ層計算

`daily_logs` から `DISTINCT log_date` を取得し、TypeScript で連続日数を計算する。

- 新規テーブル/RPC 不要
- 純粋関数としてテスト容易
- daily_logs のデータ量は 1 ユーザーあたり 365 行/年 程度で十分小さい
- 将来パフォーマンスが問題になったら PostgreSQL RPC に移行する

### Streak の定義

- 1日に少なくとも1件のセッションを完了した日を「学習日」とする
- 連続する学習日の数が Streak
- 1日でも学習しない日があればリセット
- 「今日」はまだ学習していなくても、昨日まで連続していれば Streak は維持 (isActiveToday で区別)

## データ型

```typescript
// src/lib/types/stats.ts に追加
export type StreakData = {
  currentStreak: number;    // 現在の連続日数
  longestStreak: number;    // 最長記録
  isActiveToday: boolean;   // 今日セッション完了済みか
};
```

## コンポーネント

### 1. Streak 計算ロジック (`src/lib/utils/streak.ts`)

```typescript
// 日付文字列の配列 (降順ソート済み) から連続日数を計算
export function calculateStreak(dates: string[], today: string): StreakData
```

- 入力: `DISTINCT log_date` の降順配列と JST の今日の日付
- 出力: StreakData
- 純粋関数。DB 非依存

### 2. Server Action (`src/lib/actions/stats.ts`)

既存の `getStats()` に `streak: StreakData` を追加。`daily_logs` から `DISTINCT log_date` を取得するクエリを追加。

### 3. Today ページ (`src/app/(main)/page.tsx`)

ヘッダー下に Streak バッジを表示:
- `currentStreak > 0 && isActiveToday`: "N日連続" (強調表示)
- `currentStreak > 0 && !isActiveToday`: "N日連続 - 今日はまだ学習していません"
- `currentStreak === 0`: 非表示

Streak データは専用の Server Action `getStreak()` で取得 (getStats とは独立)。

### 4. Stats ページ (`src/app/(main)/stats/streak-card.tsx`)

独立した `StreakCard` コンポーネントとして実装し、`page.tsx` で `StatsDashboard` の直後に配置:
- 現在の Streak 日数
- 最長記録との比較
- `isEmpty` 時は非表示 (StatsDashboard と同じ条件分岐内)

## PBI 分解

| PBI | 内容 | 対象ファイル |
|-----|------|------------|
| A: Streak 計算ロジック | calculateStreak 純粋関数 + Small テスト | `src/lib/utils/streak.ts`, `tests/small/lib/utils/streak.test.ts` |
| B: Server Action | getStreak Server Action + Small テスト | `src/lib/actions/stats.ts`, `src/lib/types/stats.ts`, `tests/small/lib/actions/streak.test.ts` |
| C: Today ページ表示 | Streak バッジ UI | `src/app/(main)/page.tsx` |
| D: Stats ページ表示 | StreakCard 独立コンポーネント | `src/app/(main)/stats/streak-card.tsx`, `src/app/(main)/stats/page.tsx` |

### 並列開発戦略

- Phase 1 (並列): A + B (型定義を先に共有)
- Phase 2 (並列): C + D (B の完了後)
