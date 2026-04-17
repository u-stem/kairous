"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { ACTION_ERRORS } from "@/lib/constants";
import { requireAuth } from "@/lib/actions/auth-utils";
import {
  practiceLogEntrySchema,
  practiceLogMetaSchema,
} from "@/lib/validations/materials";
import {
  extractFieldErrors,
  type ActionResult,
} from "@/lib/types/action-result";

// 配列全体のスキーマ (practiceLogMetaSchema) ではなく単一エントリ
// (practiceLogEntrySchema) を入口で検証するため再利用する。共通化で制約の drift を防ぐ
export type PracticeLogEntry = z.infer<typeof practiceLogEntrySchema>;

const addEntrySchema = z.object({
  materialId: z.uuid("有効な教材IDを指定してください"),
  entry: practiceLogEntrySchema,
});

const deleteEntrySchema = z.object({
  materialId: z.uuid("有効な教材IDを指定してください"),
  entryIndex: z
    .number()
    .int("インデックスは整数で指定してください")
    .nonnegative("インデックスは 0 以上で指定してください"),
});

// practiceLogMetaSchema.max(10000) と揃える。UI/DB で二重チェックし、meta の肥大化を防ぐ
const MAX_ENTRIES = 10000;

// practiceLogMetaSchema と二重管理にならないよう z.infer で派生させる
type PracticeLogMeta = z.infer<typeof practiceLogMetaSchema>;

// practice_log 教材にエントリを追加する。meta.entries への追記と
// completed_units (= entries.length) 更新を 1 UPDATE で atomic に実行する。
export async function addPracticeLogEntry(
  materialId: string,
  entry: PracticeLogEntry,
): Promise<ActionResult<undefined>> {
  const parsed = addEntrySchema.safeParse({ materialId, entry });
  if (!parsed.success) {
    return {
      success: false,
      error: ACTION_ERRORS.INVALID_INPUT,
      fieldErrors: extractFieldErrors(parsed.error),
    };
  }

  const { user, supabase } = await requireAuth();

  const { data: material, error: fetchError } = await supabase
    .from("materials")
    .select("type, meta")
    .eq("id", materialId)
    .eq("user_id", user.id)
    .maybeSingle();

  if (fetchError) {
    return { success: false, error: ACTION_ERRORS.UPDATE_FAILED("教材") };
  }
  if (!material) {
    return { success: false, error: ACTION_ERRORS.NOT_FOUND("教材") };
  }
  if (material.type !== "practice_log") {
    return {
      success: false,
      error: "practice_log タイプ以外の教材ではエントリを追加できません",
    };
  }

  const meta = (material.meta as PracticeLogMeta | null) ?? {};
  const currentEntries = meta.entries ?? [];
  if (currentEntries.length >= MAX_ENTRIES) {
    return {
      success: false,
      error: `エントリ数が上限 (${MAX_ENTRIES}) に達しています`,
    };
  }

  const nextEntries = [...currentEntries, parsed.data.entry];
  const nextMeta: PracticeLogMeta = { ...meta, entries: nextEntries };

  const { error: updateError } = await supabase
    .from("materials")
    .update({ meta: nextMeta, completed_units: nextEntries.length })
    .eq("id", materialId)
    .eq("user_id", user.id);

  if (updateError) {
    return { success: false, error: ACTION_ERRORS.UPDATE_FAILED("教材") };
  }

  revalidatePath(`/materials/${materialId}`);
  revalidatePath("/materials");
  return { success: true, data: undefined };
}

// practice_log 教材の指定インデックスのエントリを削除する。
// meta.entries と completed_units を atomic に更新する。
export async function deletePracticeLogEntry(
  materialId: string,
  entryIndex: number,
): Promise<ActionResult<undefined>> {
  const parsed = deleteEntrySchema.safeParse({ materialId, entryIndex });
  if (!parsed.success) {
    return {
      success: false,
      error: ACTION_ERRORS.INVALID_INPUT,
      fieldErrors: extractFieldErrors(parsed.error),
    };
  }

  const { user, supabase } = await requireAuth();

  const { data: material, error: fetchError } = await supabase
    .from("materials")
    .select("type, meta")
    .eq("id", materialId)
    .eq("user_id", user.id)
    .maybeSingle();

  if (fetchError) {
    return { success: false, error: ACTION_ERRORS.UPDATE_FAILED("教材") };
  }
  if (!material) {
    return { success: false, error: ACTION_ERRORS.NOT_FOUND("教材") };
  }
  if (material.type !== "practice_log") {
    return {
      success: false,
      error: "practice_log タイプ以外の教材ではエントリを削除できません",
    };
  }

  const meta = (material.meta as PracticeLogMeta | null) ?? {};
  const currentEntries = meta.entries ?? [];
  if (entryIndex >= currentEntries.length) {
    return {
      success: false,
      error: `インデックス ${entryIndex} のエントリは存在しません`,
    };
  }

  const nextEntries = currentEntries.filter((_, i) => i !== entryIndex);
  const nextMeta: PracticeLogMeta = { ...meta, entries: nextEntries };

  const { error: updateError } = await supabase
    .from("materials")
    .update({ meta: nextMeta, completed_units: nextEntries.length })
    .eq("id", materialId)
    .eq("user_id", user.id);

  if (updateError) {
    return { success: false, error: ACTION_ERRORS.UPDATE_FAILED("教材") };
  }

  revalidatePath(`/materials/${materialId}`);
  revalidatePath("/materials");
  return { success: true, data: undefined };
}
