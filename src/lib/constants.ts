// ウィザードで選択可能な学習手法スラッグ（SRS以外の手法は別途追加予定）
export const MATERIAL_METHOD_SLUGS = [
  "srs",
  "active_recall",
  "elaboration",
  "pomodoro",
] as const;

export type MaterialMethodSlug = (typeof MATERIAL_METHOD_SLUGS)[number];

// カードレビューを使用する手法（sessions側でcard_reviewsテーブルを参照する）
export const CARD_BASED_SLUGS = ["srs", "active_recall"] as const;

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
    slugs: ["srs", "active_recall"],
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
  active_recall: "カードを見て能動的に思い出す練習をする",
  elaboration: "「なぜ?」を問い、自分の言葉で説明する",
  pomodoro: "25分集中 + 5分休憩のサイクルで学習する",
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

// Edge Function の FSRS 初期化でも同じ値を使うため、定数として共有する
export const SRS_DEFAULTS = {
  stability: 1.0,
  difficulty: 5.0,
} as const;

// 認知負荷を超えないよう1セッションのカード上限を制限 (学習科学の推奨範囲)
export const SESSION_MAX_CARDS = 20;
// 覚醒安静 (wakeful rest) のデフォルト時間。記憶定着に効果的な10分間
export const REST_DURATION_SEC = 600;

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
