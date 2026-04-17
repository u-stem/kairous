import { z } from "zod";
import { VALIDATION_LIMITS, MATERIAL_TYPES } from "@/lib/constants";
import type { MaterialType } from "@/lib/constants";

export const createCategorySchema = z.object({
  name: z
    .string()
    .min(1, "カテゴリ名を入力してください")
    .max(VALIDATION_LIMITS.CATEGORY_NAME_MAX, "カテゴリ名は100文字以内で入力してください"),
  parent_id: z.uuid().nullable().optional(),
});

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
  // MATERIAL_TYPES を単一の source of truth として参照し、定義の重複を防ぐ
  type: z.enum(MATERIAL_TYPES).default("flashcard"),
  // meta は JSONB フィールド。タイプ別詳細バリデーションは validateMaterialMeta で行う
  meta: z.record(z.string(), z.unknown()).default({}),
  // reading/practice_log 等の進捗単位ラベル (「ページ」「章」「回」等)。未指定時は DB 側のデフォルトを使用
  unit_label: z.string().min(1).max(20).optional(),
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

// タイプ別 meta バリデーションスキーマ
// .strict() で余分なキーを拒否し、意図しないデータ混入を防ぐ
export const flashcardMetaSchema = z.object({}).strict();

export const readingMetaSchema = z
  .object({
    total_pages: z.number().int().positive().max(99999).optional(),
    isbn: z.string().max(20).optional(),
    author: z.string().max(200).optional(),
  })
  .strict();

export const projectMetaSchema = z
  .object({
    milestones: z
      .array(
        z.object({
          name: z.string().min(1).max(200),
          done: z.boolean(),
          date: z.iso.date().optional(),
        }),
      )
      .max(50)
      .optional(),
    deadline: z.iso.date().optional(),
  })
  .strict();

export const practiceLogMetaSchema = z
  .object({
    entry_schema: z.enum(["reps", "duration", "freeform"]).optional(),
    entries: z
      .array(
        z.object({
          date: z.iso.date(),
          value: z.union([z.number(), z.string()]),
          note: z.string().max(500).optional(),
        }),
      )
      .max(10000)
      .optional(),
  })
  .strict();

export const noteMetaSchema = z
  .object({
    section_count: z.number().int().nonnegative().max(10000).optional(),
    word_count: z.number().int().nonnegative().max(1000000).optional(),
  })
  .strict();

// タイプに応じた meta バリデーションを実行する。switch で全タイプを網羅し、
// 型レベルで未処理タイプが残らないことを保証する
export function validateMaterialMeta(type: MaterialType, meta: unknown) {
  switch (type) {
    case "flashcard":
      return flashcardMetaSchema.safeParse(meta);
    case "reading":
      return readingMetaSchema.safeParse(meta);
    case "project":
      return projectMetaSchema.safeParse(meta);
    case "practice_log":
      return practiceLogMetaSchema.safeParse(meta);
    case "note":
      return noteMetaSchema.safeParse(meta);
    default: {
      const _exhaustive: never = type;
      throw new Error(`Unknown material type: ${_exhaustive as string}`);
    }
  }
}

export type CreateCategoryInput = z.infer<typeof createCategorySchema>;
export type CreateMaterialInput = z.infer<typeof createMaterialSchema>;
export type UpdateMaterialInput = z.infer<typeof updateMaterialSchema>;
export type CardInput = z.infer<typeof cardSchema>;
