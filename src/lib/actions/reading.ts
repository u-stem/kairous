"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { ACTION_ERRORS } from "@/lib/constants";
import { requireAuth } from "@/lib/actions/auth-utils";
import {
  extractFieldErrors,
  type ActionResult,
} from "@/lib/types/action-result";

const updatePageProgressSchema = z.object({
  materialId: z.uuid("有効な教材IDを指定してください"),
  pagesRead: z
    .number()
    .int("ページ数は整数で指定してください")
    .nonnegative("ページ数は 0 以上の値を指定してください")
    .max(99999, "ページ数が大きすぎます"),
});

// reading 教材の読書進捗を更新する。
// セッションとは独立した手動進捗更新用の Server Action。
// セッション経由の進捗は session-commands 側で上書きされる。
export async function updatePageProgress(
  materialId: string,
  pagesRead: number,
): Promise<ActionResult<undefined>> {
  const parsed = updatePageProgressSchema.safeParse({ materialId, pagesRead });
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
    .select("type, total_units, meta")
    .eq("id", materialId)
    .eq("user_id", user.id)
    .maybeSingle();

  if (fetchError) {
    return { success: false, error: ACTION_ERRORS.UPDATE_FAILED("教材") };
  }
  if (!material) {
    return { success: false, error: ACTION_ERRORS.NOT_FOUND("教材") };
  }
  if (material.type !== "reading") {
    return {
      success: false,
      error: "reading タイプ以外の教材では進捗を更新できません",
    };
  }

  // meta.total_pages が設定されている場合のみ上限チェック
  const meta = material.meta as { total_pages?: number } | null;
  const totalPages = meta?.total_pages;
  if (totalPages !== undefined && pagesRead > totalPages) {
    return {
      success: false,
      error: `進捗はページ総数 (${totalPages}) を超えられません`,
      fieldErrors: {
        pagesRead: [`ページ総数 ${totalPages} を超えています`],
      },
    };
  }

  const { error: updateError } = await supabase
    .from("materials")
    .update({ completed_units: pagesRead })
    .eq("id", materialId)
    .eq("user_id", user.id);

  if (updateError) {
    return { success: false, error: ACTION_ERRORS.UPDATE_FAILED("教材") };
  }

  revalidatePath(`/materials/${materialId}`);
  return { success: true, data: undefined };
}
