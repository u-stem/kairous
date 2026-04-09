import { NOTIFICATION_MAX_SUBJECTS } from "@/lib/constants";

export type SubjectDueCount = {
  subject: string;
  count: number;
};

export type NotificationMessage = {
  title: string;
  body: string;
};

// 科目リストを「数学 5枚 / 英語 7枚 ほかN科目」形式に整形する
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

  // セッションがなく明日の復習がある場合は「明日の復習: N枚」形式にフォールバック
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
