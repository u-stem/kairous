import { z } from "zod";
import { cardReviewSchema } from "./sessions";

export const elaborationSchema = z.object({
  card_id: z.uuid("無効なカードIDです"),
  // 認知的詳述の内容は長くなり得るが、DB 負荷を避けるため上限を設ける
  text: z.string().max(10000, "説明は10000文字以内です"),
});

export const completeElaborationSchema = z.object({
  sessionId: z.uuid("無効なセッションIDです"),
  // SESSION_MAX_CARDS = 20 に合わせた上限。静的値が必要なため数値リテラルで指定
  reviews: z.array(cardReviewSchema).min(1, "レビューが空です").max(20, "レビューは20件以内です"),
  elaborations: z.array(elaborationSchema).min(1, "精緻化テキストが空です").max(20, "精緻化テキストは20件以内です"),
  selfRating: z.number().int().min(1, "評価は1以上です").max(4, "評価は4以下です"),
});

export type ElaborationInput = z.infer<typeof elaborationSchema>;
export type CompleteElaborationInput = z.infer<typeof completeElaborationSchema>;
