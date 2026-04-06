import { z } from "zod";

// Interleaving は2教材以上で成立し、認知負荷を考慮して10教材を上限とする
export const createInterleavingSessionSchema = z.object({
  materialIds: z
    .array(z.uuid("無効な教材IDです"))
    .min(2, "インターリービングには2つ以上の教材が必要です")
    .max(10, "教材は10個以内です"),
});

export type CreateInterleavingSessionInput = z.infer<typeof createInterleavingSessionSchema>;
