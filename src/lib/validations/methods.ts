import { z } from "zod";
import { VALIDATION_LIMITS } from "@/lib/constants";

// MethodCategory と同じ値を列挙。constants.ts の union type から z.enum を生成できないため手動同期
const CATEGORIES = ["memory", "comprehension", "focus", "consolidation", "general"] as const;

export const createMethodSchema = z.object({
  name: z
    .string()
    .min(1, "手法名を入力してください")
    .max(VALIDATION_LIMITS.METHOD_NAME_MAX, `手法名は${VALIDATION_LIMITS.METHOD_NAME_MAX}文字以内で入力してください`),
  category: z.enum(CATEGORIES, { message: "カテゴリを選択してください" }),
  description: z
    .string()
    .max(VALIDATION_LIMITS.METHOD_DESCRIPTION_MAX, `説明は${VALIDATION_LIMITS.METHOD_DESCRIPTION_MAX}文字以内で入力してください`)
    .optional(),
  default_duration_sec: z
    .number()
    .int()
    .min(VALIDATION_LIMITS.METHOD_DURATION_MIN, "目標時間は1分以上にしてください")
    .max(VALIDATION_LIMITS.METHOD_DURATION_MAX, "目標時間は180分以内にしてください")
    .nullable()
    .optional(),
});

export const updateMethodSchema = createMethodSchema.partial();

export type CreateMethodInput = z.infer<typeof createMethodSchema>;
export type UpdateMethodInput = z.infer<typeof updateMethodSchema>;
