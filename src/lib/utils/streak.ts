import type { StreakData } from "@/lib/types/stats";

// 2つの YYYY-MM-DD 文字列が連続する日付（差が1日）かどうかを判定する
function isConsecutiveDay(earlier: string, later: string): boolean {
  const a = new Date(earlier);
  const b = new Date(later);
  const diffMs = b.getTime() - a.getTime();
  const oneDayMs = 24 * 60 * 60 * 1000;
  return diffMs === oneDayMs;
}

// 降順ソート済みの日付配列から最長連続日数を求める
function computeLongestStreak(dates: string[]): number {
  if (dates.length === 0) return 0;

  let longest = 1;
  let current = 1;

  // dates は降順なので earlier/later の順を合わせて比較する
  for (let i = 0; i < dates.length - 1; i++) {
    if (isConsecutiveDay(dates[i + 1], dates[i])) {
      current++;
      if (current > longest) longest = current;
    } else {
      current = 1;
    }
  }

  return longest;
}

/**
 * 日付文字列の配列（降順ソート済み）から連続日数を計算する。
 * DB アクセスを持たない純粋関数。
 *
 * @param dates "YYYY-MM-DD" 形式の降順ソート済み配列 (daily_logs の DISTINCT log_date)
 * @param today JST の今日の日付 ("YYYY-MM-DD")
 */
export function calculateStreak(dates: string[], today: string): StreakData {
  if (dates.length === 0) {
    return { currentStreak: 0, longestStreak: 0, isActiveToday: false };
  }

  const isActiveToday = dates[0] === today;
  const longestStreak = computeLongestStreak(dates);

  // currentStreak の起点を決める
  // 今日が含まれる → today 起点
  // 昨日が起点になれる（今日未学習だが streak 継続中）→ yesterday 起点
  // それ以外 → 途切れているので 0
  const todayDate = new Date(today);
  const yesterdayDate = new Date(todayDate.getTime() - 24 * 60 * 60 * 1000);
  const yesterday = yesterdayDate.toISOString().split("T")[0];

  let startIndex: number;
  if (isActiveToday) {
    startIndex = 0;
  } else if (dates[0] === yesterday) {
    startIndex = 0;
  } else {
    // 今日も昨日も含まれていない → streak 途切れ
    return { currentStreak: 0, longestStreak, isActiveToday: false };
  }

  // 起点から過去に遡り、連続する日付をカウントする
  let currentStreak = 1;
  for (let i = startIndex; i < dates.length - 1; i++) {
    if (isConsecutiveDay(dates[i + 1], dates[i])) {
      currentStreak++;
    } else {
      break;
    }
  }

  return { currentStreak, longestStreak, isActiveToday };
}
