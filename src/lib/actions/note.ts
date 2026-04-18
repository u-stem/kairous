"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { ACTION_ERRORS } from "@/lib/constants";
import { requireAuth } from "@/lib/actions/auth-utils";
import { noteMetaSchema } from "@/lib/validations/materials";
import {
  extractFieldErrors,
  type ActionResult,
} from "@/lib/types/action-result";

// noteMetaSchema から制約を派生させ、ダブル管理を避ける。
// section_count / word_count はどちらも optional で、部分更新を許可する
const noteStatsSchema = noteMetaSchema.pick({
  section_count: true,
  word_count: true,
});

const updateNoteStatsSchema = z.object({
  materialId: z.uuid("有効な教材IDを指定してください"),
  stats: noteStatsSchema,
});

export type NoteStatsInput = z.infer<typeof noteStatsSchema>;

type NoteMeta = z.infer<typeof noteMetaSchema>;

// note 教材の section_count / word_count を手動で更新する。
// completed_units は section_count をそのまま採用する (進捗表示で使用)。
// word_count のみ更新の場合は completed_units は既存値を維持する。
export async function updateNoteStats(
  materialId: string,
  stats: NoteStatsInput,
): Promise<ActionResult<undefined>> {
  const parsed = updateNoteStatsSchema.safeParse({ materialId, stats });
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
    .select("type, meta, completed_units")
    .eq("id", materialId)
    .eq("user_id", user.id)
    .maybeSingle();

  if (fetchError) {
    return { success: false, error: ACTION_ERRORS.UPDATE_FAILED("教材") };
  }
  if (!material) {
    return { success: false, error: ACTION_ERRORS.NOT_FOUND("教材") };
  }
  if (material.type !== "note") {
    return {
      success: false,
      error: "note タイプ以外の教材では stats を更新できません",
    };
  }

  const currentMeta = (material.meta as NoteMeta | null) ?? {};
  const nextMeta: NoteMeta = { ...currentMeta, ...parsed.data.stats };
  const nextCompletedUnits =
    parsed.data.stats.section_count ?? material.completed_units ?? 0;

  const { error: updateError } = await supabase
    .from("materials")
    .update({ meta: nextMeta, completed_units: nextCompletedUnits })
    .eq("id", materialId)
    .eq("user_id", user.id);

  if (updateError) {
    return { success: false, error: ACTION_ERRORS.UPDATE_FAILED("教材") };
  }

  revalidatePath(`/materials/${materialId}`);
  revalidatePath("/materials");
  return { success: true, data: undefined };
}
