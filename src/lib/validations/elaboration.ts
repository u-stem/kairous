import { z } from "zod";
import { cardReviewSchema } from "./sessions";

export const elaborationSchema = z.object({
  card_id: z.uuid("無効なカードIDです"),
  text: z.string(),
});

export const completeElaborationSchema = z.object({
  sessionId: z.uuid("無効なセッションIDです"),
  reviews: z.array(cardReviewSchema).min(1, "レビューが空です").max(500, "レビューは500件以内です"),
  elaborations: z.array(elaborationSchema).min(1, "精緻化テキストが空です"),
  selfRating: z.number().int().min(1, "評価は1以上です").max(4, "評価は4以下です"),
});

export type ElaborationInput = z.infer<typeof elaborationSchema>;
export type CompleteElaborationInput = z.infer<typeof completeElaborationSchema>;
