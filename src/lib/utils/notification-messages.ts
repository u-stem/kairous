import { NOTIFICATION_MAX_CATEGORIES } from "@/lib/constants";

export type CategoryDueCount = {
  category: string;
  count: number;
};

export type NotificationMessage = {
  title: string;
  body: string;
};

// カテゴリリストを「数学 5枚 / 英語 7枚 ほかN科目」形式に整形する
function formatCategoryList(categories: CategoryDueCount[]): string {
  if (categories.length === 0) return "";

  const shown = categories.slice(0, NOTIFICATION_MAX_CATEGORIES);
  const remaining = categories.length - NOTIFICATION_MAX_CATEGORIES;
  const parts = shown.map((s) => `${s.category} ${s.count}枚`);
  const joined = parts.join(" / ");

  if (remaining > 0) {
    return `${joined} ほか${remaining}科目`;
  }
  return joined;
}

export function buildDueTodayMessage(
  subjects: CategoryDueCount[],
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
    body: formatCategoryList(subjects),
  };
}

export function buildReviewAndPreviewMessage(params: {
  sessionsToday: number;
  dueTomorrow: CategoryDueCount[];
}): NotificationMessage {
  const { sessionsToday, dueTomorrow } = params;
  const hasSessions = sessionsToday > 0;
  const hasDue = dueTomorrow.length > 0;

  // セッションがなく明日の復習がある場合は「明日の復習: N枚」形式にフォールバック
  if (!hasSessions && hasDue) {
    const total = dueTomorrow.reduce((sum, s) => sum + s.count, 0);
    return {
      title: `明日の復習: ${total}枚`,
      body: formatCategoryList(dueTomorrow),
    };
  }

  const title = hasSessions
    ? `今日は ${sessionsToday}セッション完了!`
    : "今日はまだセッションがありません";

  const body = hasDue
    ? `明日は ${formatCategoryList(dueTomorrow)} が待っています`
    : "明日の復習はありません";

  return { title, body };
}
