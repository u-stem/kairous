import type { DailyData, BreakdownItem } from "@/lib/types/stats";

type DailyLogRow = {
  log_date: string;
  total_sec: number;
  session_count: number;
  cards_reviewed: number;
  category_id: string;
  method_id: string;
};

export function formatStudyTime(totalSec: number): string {
  const minutes = Math.round(totalSec / 60);
  if (minutes < 60) return `${minutes}m`;
  const hours = totalSec / 3600;
  return `${Math.round(hours * 10) / 10}h`;
}

export function calcChangeRate(current: number, previous: number): number {
  if (previous === 0) return current === 0 ? 0 : 100;
  return Math.round(((current - previous) / previous) * 100);
}

// カード不使用の手法のみのユーザーに「レビュー 0」を常時表示しないため
export function shouldShowReviewCard(
  cardsReviewed: number,
  prevCardsReviewed: number,
): boolean {
  return cardsReviewed > 0 || prevCardsReviewed > 0;
}

export function aggregateDaily(rows: DailyLogRow[]): DailyData[] {
  const map = new Map<string, DailyData>();
  for (const row of rows) {
    const existing = map.get(row.log_date);
    if (existing) {
      existing.totalSec += row.total_sec;
      existing.sessionCount += row.session_count;
    } else {
      map.set(row.log_date, {
        date: row.log_date,
        totalSec: row.total_sec,
        sessionCount: row.session_count,
      });
    }
  }
  // 日付昇順で返すことで呼び出し側のソート処理を不要にする
  return [...map.values()].sort((a, b) => a.date.localeCompare(b.date));
}

export function aggregateByKey(
  rows: DailyLogRow[],
  key: "category_id" | "method_id",
  names: Map<string, string>,
): BreakdownItem[] {
  const map = new Map<string, BreakdownItem>();
  for (const row of rows) {
    const id = row[key];
    const existing = map.get(id);
    if (existing) {
      existing.totalSec += row.total_sec;
      existing.sessionCount += row.session_count;
      existing.cardsReviewed += row.cards_reviewed;
    } else {
      map.set(id, {
        id,
        // names に存在しない id はそのまま id をフォールバックとして使う
        name: names.get(id) ?? id,
        totalSec: row.total_sec,
        sessionCount: row.session_count,
        cardsReviewed: row.cards_reviewed,
      });
    }
  }
  // Stats 画面で上位項目を先に表示するため降順ソート
  return [...map.values()].sort((a, b) => b.totalSec - a.totalSec);
}
