import { z } from "zod";

export const completeFreeStudySchema = z.object({
  sessionId: z.uuid("無効なセッションIDです"),
  elapsedSec: z.number().int().min(0),
});

export type CompleteFreeStudyInput = z.infer<typeof completeFreeStudySchema>;
