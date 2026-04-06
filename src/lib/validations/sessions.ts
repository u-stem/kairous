import { z } from "zod";

// Server Action の共通型を re-export し、sessions 側の import を一箇所にまとめる
export { type ActionResult, extractFieldErrors } from "./materials";

export const cardReviewSchema = z.object({
  card_id: z.uuid("無効なカードIDです"),
  rating: z.number().int().min(1, "評価は1以上です").max(4, "評価は4以下です"),
  started_at: z.iso.datetime({ offset: true, message: "有効な ISO 8601 日時が必要です" }),
  answered_at: z.iso.datetime({ offset: true, message: "有効な ISO 8601 日時が必要です" }),
});

export const createSessionSchema = z.object({
  materialId: z.uuid("無効な教材IDです"),
  methodId: z.uuid("無効な学習手法IDです"),
});

// card-based メソッド (SRS, Active Recall, Interleaving) 専用。
// time/text-based メソッドは別スキーマで定義する (現在のスコープ外)
export const completeSessionSchema = z.object({
  sessionId: z.uuid("無効なセッションIDです"),
  reviews: z.array(cardReviewSchema).min(1, "レビューが空です"),
  selfRating: z.number().int().min(1, "評価は1以上です").max(4, "評価は4以下です"),
});

export const createRestSessionSchema = z.object({
  parentSessionId: z.uuid("無効なセッションIDです"),
});

export const completeRestSessionSchema = z.object({
  sessionId: z.uuid("無効なセッションIDです"),
});

export type CardReviewInput = z.infer<typeof cardReviewSchema>;
export type CreateSessionInput = z.infer<typeof createSessionSchema>;
export type CompleteSessionInput = z.infer<typeof completeSessionSchema>;
export type CreateRestSessionInput = z.infer<typeof createRestSessionSchema>;
export type CompleteRestSessionInput = z.infer<typeof completeRestSessionSchema>;
