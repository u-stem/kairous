// ウィザードで選択可能な学習手法スラッグ
export const MATERIAL_METHOD_SLUGS = [
  "srs",
  "elaboration",
  "pomodoro",
  "free_study",
] as const;

export type MaterialMethodSlug = (typeof MATERIAL_METHOD_SLUGS)[number];

// カードレビューを使用する手法（sessions側でcard_reviewsテーブルを参照する）
// MATERIAL_METHOD_SLUGS（ウィザード選択可能）とは別概念。interleaving は未実装だがカード手法として定義済み
export const CARD_BASED_SLUGS = ["srs", "interleaving"] as const;

// 教材がカードレビューを使用する手法を含むかを判定する
export function hasCardBasedMethod(methods: Array<{ slug: string }>): boolean {
  return methods.some((m) =>
    (CARD_BASED_SLUGS as readonly string[]).includes(m.slug)
  );
}

export type MethodCategory =
  | "memory"
  | "comprehension"
  | "focus"
  | "consolidation"
  | "general";

// 学習科学の観点でカテゴリ分類したメソッド定義
export const METHOD_CATEGORIES: Record<
  MethodCategory,
  { label: string; slugs: readonly string[] }
> = {
  memory: {
    label: "記憶",
    slugs: ["srs"],
  },
  comprehension: {
    label: "理解",
    slugs: ["interleaving", "elaboration"],
  },
  focus: {
    label: "集中",
    slugs: ["pomodoro"],
  },
  consolidation: {
    label: "統合",
    slugs: ["wakeful_rest"],
  },
  general: {
    label: "汎用",
    slugs: ["free_study"],
  },
};

// ウィザード Step2 でのみ表示する説明文。他画面では learning_methods.name を使う
export const METHOD_DESCRIPTIONS: Record<string, string> = {
  srs: "間隔を空けて復習し、長期記憶に定着させる",
  elaboration: "「なぜ?」を問い、自分の言葉で説明する",
  pomodoro: "25分集中 + 5分休憩のサイクルで学習する",
  interleaving: "複数教材のカードを混ぜて復習し、識別力を高める",
  free_study: "自由な形式で学習を記録する",
};

// UI コンポーネント間でカテゴリの視覚的一貫性を保つためのカラーマッピング
const COLOR_MAP: Record<MethodCategory, { light: string; dark: string }> = {
  memory: {
    light: "bg-indigo-50 text-indigo-600",
    dark: "dark:bg-indigo-950 dark:text-indigo-400",
  },
  comprehension: {
    light: "bg-green-50 text-green-600",
    dark: "dark:bg-green-950 dark:text-green-400",
  },
  focus: {
    light: "bg-amber-50 text-amber-600",
    dark: "dark:bg-amber-950 dark:text-amber-400",
  },
  consolidation: {
    light: "bg-purple-50 text-purple-600",
    dark: "dark:bg-purple-950 dark:text-purple-400",
  },
  general: {
    light: "bg-gray-100 text-gray-600",
    dark: "dark:bg-gray-800 dark:text-gray-400",
  },
};

const FALLBACK_COLOR = {
  light: "bg-gray-100 text-gray-600",
  dark: "dark:bg-gray-800 dark:text-gray-400",
};

export function getMethodColorClasses(category: string): {
  light: string;
  dark: string;
} {
  return COLOR_MAP[category as MethodCategory] ?? FALLBACK_COLOR;
}

// 日本のユーザーのみ対象のため JST 固定。国際化時に要対応
export const APP_TIMEZONE = "Asia/Tokyo" as const;
export const JST_OFFSET_MS = 9 * 60 * 60 * 1000;

// 学習継続率の短期・中期・長期の傾向を観察するための3段階
export const STATS_PERIODS = [7, 30, 90] as const;
export type StatsPeriod = (typeof STATS_PERIODS)[number];

// Edge Function 側でも同じ値を使うため single source of truth とする（Deno 側は手動同期）
export const SRS_DEFAULTS = {
  stability: 1.0,
  difficulty: 5.0,
} as const;

// 認知負荷を超えないよう1セッションのカード上限を制限 (学習科学の推奨範囲)
export const SESSION_MAX_CARDS = 20;
// 覚醒安静 (wakeful rest) のデフォルト時間。記憶定着に効果的な10分間
export const REST_DURATION_SEC = 600;
// 25分の集中と5分の休憩で1サイクル。認知負荷のリセットに効果的な比率
export const POMODORO_FOCUS_SEC = 1500;
export const POMODORO_BREAK_SEC = 300;

// 学習手法で用いる自己評価の取りうる値。UI の各プレイヤーと summary/review で共通利用する
export const SELF_RATINGS = [1, 2, 3, 4] as const;

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

// --- Server Action エラーメッセージ ---
// 散在していたハードコード文字列を一箇所に集約し、変更漏れを防ぐ
export const ACTION_ERRORS = {
  UNAUTHENTICATED: "認証が必要です",
  INVALID_INPUT: "入力内容を確認してください",
  NOT_FOUND: (entity: string) => `${entity}が見つかりません`,
  CREATE_FAILED: (entity: string) => `${entity}の作成に失敗しました`,
  UPDATE_FAILED: (entity: string) => `${entity}の更新に失敗しました`,
  DELETE_FAILED: (entity: string) => `${entity}の削除に失敗しました`,
  PERMISSION_DENIED: "権限がありません",
  EDGE_FUNCTION_FAILED: "カードレビューの処理に失敗しました",
  SESSION_ALREADY_COMPLETED: "このセッションは既に完了しています",
} as const;

// --- バリデーション制約値 ---
// 各 validation ファイルに散在していたマジックナンバーを集約
export const VALIDATION_LIMITS = {
  CATEGORY_NAME_MAX: 100,
  MATERIAL_TITLE_MAX: 200,
  MATERIAL_DESCRIPTION_MAX: 2000,
  CARD_TEXT_MAX: 5000,
  ELABORATION_TEXT_MAX: 10000,
  REVIEWS_MAX: 500,
  INTERLEAVING_MATERIALS_MAX: 10,
  METHOD_NAME_MAX: 50,
  METHOD_DESCRIPTION_MAX: 500,
  // 1分未満はタイマーとして意味がないため下限を設定
  METHOD_DURATION_MIN: 60,
  // 3時間を超えるセッションは認知負荷が高くなりすぎるため上限を設定
  METHOD_DURATION_MAX: 10800,
} as const;

// --- PostgreSQL エラーコード ---
export const PG_ERROR_CODES = {
  UNIQUE_VIOLATION: "23505",
} as const;

// --- 通知 ---
// タブ非アクティブ時に経過した通知を表示する最大遅延。30分を超えた古い通知は破棄する
export const NOTIFICATION_DELAY_THRESHOLD_MS = 30 * 60 * 1000;
// 1ユーザーあたりの通知スケジュール上限。過剰なタイマー生成を防ぐ
export const MAX_NOTIFICATION_SCHEDULES = 10;
// 通知本文に表示するカテゴリの最大数。超過分は「ほかN件」で表示
export const NOTIFICATION_MAX_CATEGORIES = 2;

export const NOTIFICATION_MESSAGE_TYPES = ["due_today", "review_and_preview"] as const;
export type NotificationMessageType = (typeof NOTIFICATION_MESSAGE_TYPES)[number];

export const NOTIFICATION_DEFAULTS = {
  morning: { label: "朝の通知", time: "08:00", messageType: "due_today" as const },
  evening: { label: "夜の通知", time: "22:00", messageType: "review_and_preview" as const },
} as const;
