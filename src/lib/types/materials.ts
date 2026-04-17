import type { Database } from "./database";

type Tables<T extends keyof Database["public"]["Tables"]> =
  Database["public"]["Tables"][T]["Row"];

export type Category = Tables<"categories">;
export type Material = Tables<"materials">;
export type Card = Tables<"cards">;
export type LearningMethod = Tables<"learning_methods">;
export type MaterialMethod = Tables<"material_methods">;

// MethodSelectList 等で learning_methods の最小フィールドを参照するための型
export type MethodItem = {
  id: string;
  slug: string;
  name: string;
};

// 一覧表示に必要な関連データを結合した型（categories・learning_methodsをJOINしたクエリ結果）
export type MaterialWithMethods = {
  id: string;
  title: string;
  description: string | null;
  category_id: string;
  category: {
    id: string;
    name: string;
    color: string;
    parent_id: string | null;
  };
  total_cards: number;
  due_count: number;
  methods: Array<{
    id: string;
    slug: string;
    name: string;
    category: string;
  }>;
  last_studied_at: string | null;
  created_at: string;
};

// 詳細ページで追加表示するデータ（直近セッション・正答率はクエリコストが高いため別型）
export type MaterialDetail = MaterialWithMethods & {
  recent_sessions: Array<{
    id: string;
    method: { slug: string; name: string };
    duration_sec: number;
    self_rating: number | null;
    started_at: string;
  }>;
  accuracy_rate: number | null;
};
