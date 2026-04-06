// ネットワーク往復を減らすため、個別評価はクライアントで蓄積しセッション完了時に一括送信する
export type CardReview = {
  card_id: string;
  rating: 1 | 2 | 3 | 4;
  started_at: string; // ISO 8601
  answered_at: string; // ISO 8601
};

// Server Component でまとめて取得し Client Component に渡すため、表示に必要な最小限のフィールドのみ
export type SessionCard = {
  id: string;
  front: string;
  back: string;
  display_order: number;
};

// Today ページで due カード数と共に教材を表示するため、集計済みの due_count を持つ
export type DueMaterial = {
  id: string;
  title: string;
  subject: { id: string; name: string; color: string };
  due_count: number;
  srs_method_id: string;
};

// サマリー画面で統計表示するため、セッション + レビュー + 残りの due 数を1つにまとめる
export type SessionDetail = {
  id: string;
  material: {
    id: string;
    title: string;
    subject: { name: string };
  } | null;
  method: { slug: string; name: string };
  method_id: string;
  status: "in_progress" | "completed" | "abandoned";
  duration_sec: number;
  self_rating: 1 | 2 | 3 | 4 | null;
  started_at: string;
  ended_at: string | null;
  card_reviews: Array<{
    card_id: string;
    rating: number;
    response_ms: number;
    card: { front: string; back: string };
  }>;
  remaining_due_count: number;
  meta: Record<string, unknown> | null;
};
