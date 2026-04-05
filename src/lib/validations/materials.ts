import { z } from "zod";

// Server Action の戻り値型。成功/失敗を型レベルで区別することでハンドリング漏れを防ぐ
export type ActionResult<T> =
  | { success: true; data: T }
  | { success: false; error: string; fieldErrors?: Record<string, string[]> };

// zod v4 で ZodError.flatten() が非推奨になったため、トップレベル関数を使う
export function extractFieldErrors(
  error: z.ZodError,
): Record<string, string[]> {
  return z.flattenError(error).fieldErrors as Record<string, string[]>;
}

export const createSubjectSchema = z.object({
  name: z
    .string()
    .min(1, "科目名を入力してください")
    .max(100, "科目名は100文字以内で入力してください"),
});

export const createMaterialSchema = z.object({
  title: z
    .string()
    .min(1, "タイトルを入力してください")
    .max(200, "タイトルは200文字以内で入力してください"),
  description: z.string().optional(),
  subject_id: z.uuid("有効な科目を選択してください"),
  // 学習手法は1つ以上必須（material_methodsテーブルの整合性を保つため）
  method_ids: z
    .array(z.uuid("無効な学習手法IDです"))
    .min(1, "学習手法を1つ以上選択してください"),
});

export const updateMaterialSchema = z.object({
  title: z
    .string()
    .min(1, "タイトルを入力してください")
    .max(200, "タイトルは200文字以内で入力してください"),
  description: z.string().optional(),
  subject_id: z.uuid("有効な科目を選択してください"),
});

export const cardSchema = z.object({
  front: z
    .string()
    .min(1, "表面のテキストを入力してください")
    .max(5000, "表面のテキストは5000文字以内で入力してください"),
  back: z
    .string()
    .min(1, "裏面のテキストを入力してください")
    .max(5000, "裏面のテキストは5000文字以内で入力してください"),
});

export type CreateSubjectInput = z.infer<typeof createSubjectSchema>;
export type CreateMaterialInput = z.infer<typeof createMaterialSchema>;
export type UpdateMaterialInput = z.infer<typeof updateMaterialSchema>;
export type CardInput = z.infer<typeof cardSchema>;
