import { z } from "zod";
import { VALIDATION_LIMITS } from "@/lib/constants";

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

export const createCategorySchema = z.object({
  name: z
    .string()
    .min(1, "カテゴリ名を入力してください")
    .max(VALIDATION_LIMITS.SUBJECT_NAME_MAX, "カテゴリ名は100文字以内で入力してください"),
  parent_id: z.uuid().nullable().optional(),
});

// 後方互換エイリアス。Epic #232 全 PBI マージ完了時に削除予定
export const createSubjectSchema = createCategorySchema;

export const createMaterialSchema = z.object({
  title: z
    .string()
    .min(1, "タイトルを入力してください")
    .max(VALIDATION_LIMITS.MATERIAL_TITLE_MAX, "タイトルは200文字以内で入力してください"),
  description: z.string().max(VALIDATION_LIMITS.MATERIAL_DESCRIPTION_MAX, "説明は2000文字以内で入力してください").optional(),
  category_id: z.uuid("有効なカテゴリを選択してください"),
  // 学習手法は1つ以上必須（material_methodsテーブルの整合性を保つため）
  method_ids: z
    .array(z.uuid("無効な学習手法IDです"))
    .min(1, "学習手法を1つ以上選択してください")
    .max(20, "学習手法は20個以内で選択してください"),
});

export const updateMaterialSchema = z.object({
  title: z
    .string()
    .min(1, "タイトルを入力してください")
    .max(VALIDATION_LIMITS.MATERIAL_TITLE_MAX, "タイトルは200文字以内で入力してください"),
  description: z.string().max(VALIDATION_LIMITS.MATERIAL_DESCRIPTION_MAX, "説明は2000文字以内で入力してください").optional(),
  category_id: z.uuid("有効なカテゴリを選択してください"),
});

export const cardSchema = z.object({
  front: z
    .string()
    .min(1, "表面のテキストを入力してください")
    .max(VALIDATION_LIMITS.CARD_TEXT_MAX, "表面のテキストは5000文字以内で入力してください"),
  back: z
    .string()
    .min(1, "裏面のテキストを入力してください")
    .max(VALIDATION_LIMITS.CARD_TEXT_MAX, "裏面のテキストは5000文字以内で入力してください"),
});

export type CreateCategoryInput = z.infer<typeof createCategorySchema>;
// 後方互換エイリアス
export type CreateSubjectInput = CreateCategoryInput;
export type CreateMaterialInput = z.infer<typeof createMaterialSchema>;
export type UpdateMaterialInput = z.infer<typeof updateMaterialSchema>;
export type CardInput = z.infer<typeof cardSchema>;
