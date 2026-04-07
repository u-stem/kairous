import { z } from "zod";
import { SESSION_MAX_CARDS, VALIDATION_LIMITS } from "@/lib/constants";
import { cardReviewSchema } from "./sessions";

export const elaborationSchema = z.object({
  card_id: z.uuid("無効なカードIDです"),
  // 認知的詳述の内容は長くなり得るが、DB 負荷を避けるため上限を設ける
  text: z.string().min(1, "説明を入力してください").max(VALIDATION_LIMITS.ELABORATION_TEXT_MAX, "説明は10000文字以内です"),
});

export const completeElaborationSchema = z.object({
  sessionId: z.uuid("無効なセッションIDです"),
  reviews: z.array(cardReviewSchema).min(1, "レビューが空です").max(SESSION_MAX_CARDS, "レビューは20件以内です"),
  elaborations: z.array(elaborationSchema).min(1, "精緻化テキストが空です").max(SESSION_MAX_CARDS, "精緻化テキストは20件以内です"),
  selfRating: z.number().int().min(1, "評価は1以上です").max(4, "評価は4以下です"),
});

export type ElaborationInput = z.infer<typeof elaborationSchema>;
export type CompleteElaborationInput = z.infer<typeof completeElaborationSchema>;
