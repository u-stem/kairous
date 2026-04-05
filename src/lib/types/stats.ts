// Stats 画面で扱うデータ構造を一箇所に集約し、
// コンポーネント・Server Action・Edge Function 間の型の不一致を防ぐ

export type StatsPeriod = 7 | 30 | 90;

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
  bySubject: BreakdownItem[];
  byMethod: BreakdownItem[];
};
