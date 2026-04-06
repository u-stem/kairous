import { z } from "zod";

export const completePomodoroSchema = z.object({
  sessionId: z.uuid("無効なセッションIDです"),
  selfRating: z.number().int().min(1, "評価は1以上です").max(4, "評価は4以下です"),
  pomodorosCompleted: z.number().int().min(1, "最低1サイクル必要です"),
  totalFocusSec: z.number().int().min(0),
  totalBreakSec: z.number().int().min(0),
});

export type CompletePomodoroInput = z.infer<typeof completePomodoroSchema>;
