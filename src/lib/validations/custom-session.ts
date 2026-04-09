import { z } from "zod";

export const completeCustomSessionSchema = z.object({
  sessionId: z.uuid("無効なセッションIDです"),
  selfRating: z.number().int().min(1, "評価は1以上です").max(4, "評価は4以下です"),
  elapsedSec: z.number().int().min(0),
  targetDurationSec: z.number().int().min(0).nullable(),
});

export type CompleteCustomSessionInput = z.infer<typeof completeCustomSessionSchema>;
