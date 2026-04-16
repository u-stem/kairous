// Stats 画面で扱うデータ構造を一箇所に集約し、
// コンポーネント・Server Action・Edge Function 間の型の不一致を防ぐ

// StatsPeriod は constants.ts で定義。re-export で既存の import を壊さない
export type { StatsPeriod } from "@/lib/constants";

export type StatsSummary = {
  totalSec: number;
  sessionCount: number;
  cardsReviewed: number;
  prevTotalSec: number;
  prevSessionCount: number;
  prevCardsReviewed: number;
};

export type DailyData = {
  date: string; // YYYY-MM-DD
  totalSec: number;
  sessionCount: number;
};

export type BreakdownItem = {
  id: string;
  name: string;
  totalSec: number;
  sessionCount: number;
  cardsReviewed: number;
};

export type StatsData = {
  summary: StatsSummary;
  daily: DailyData[];
  byCategory: BreakdownItem[];
  byMethod: BreakdownItem[];
};

export type StreakData = {
  currentStreak: number; // 現在の連続日数
  longestStreak: number; // 最長記録
  isActiveToday: boolean; // 今日セッション完了済みか
};
