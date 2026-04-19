"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { ACTION_ERRORS } from "@/lib/constants";
import { requireAuth } from "@/lib/actions/auth-utils";
import { practiceLogEntrySchema } from "@/lib/validations/materials";
import {
  extractFieldErrors,
  type ActionResult,
} from "@/lib/types/action-result";

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

// 00025 migration の plpgsql 関数が `RAISE EXCEPTION` で投げるメッセージから
// user-facing エラーに map する。RPC 内の検証エラー (P0001 / P0002) を
// Server Action 境界で吸収し、UI に日本語エラーを返すためのアダプタ。
function mapRpcError(message: string): string {
  if (message.includes("material not found")) {
    return ACTION_ERRORS.NOT_FOUND("教材");
  }
  if (message.includes("not practice_log")) {
    return "practice_log タイプ以外の教材ではエントリを操作できません";
  }
  if (message.includes("exceeded max")) {
    const m = message.match(/max \((\d+)\)/);
    return `エントリ数が上限 (${m?.[1] ?? "10000"}) に達しています`;
  }
  if (message.includes("out of range")) {
    const m = message.match(/index (-?\d+)/);
    // SQL 側のメッセージ形式が変わっても awkward な空 index 表示にならないよう
    // regex 失敗時は index 番号なしの fallback メッセージに倒す
    return m ? `インデックス ${m[1]} のエントリは存在しません` : "指定されたエントリは存在しません";
  }
  if (message.includes("must be a JSON object")) {
    return ACTION_ERRORS.INVALID_INPUT;
  }
  return ACTION_ERRORS.UPDATE_FAILED("教材");
}

// practice_log 教材にエントリを追加する。entries 追加と completed_units 更新は
// `practice_log_append_entry` RPC 内で SELECT FOR UPDATE + UPDATE により atomic
// に実行される (#321)。client 側の read-modify-write で entry が失われる問題を
// 回避するため RPC 呼び出しに統一。
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

  // RPC (SECURITY INVOKER) に所有権チェックを委譲するため user 情報は不要。
  // materials の RLS (FOR ALL USING = auth.uid()) が SELECT FOR UPDATE を守る
  const { supabase } = await requireAuth();

  const { error } = await supabase.rpc("practice_log_append_entry", {
    p_material_id: parsed.data.materialId,
    p_entry: parsed.data.entry,
  });

  if (error) {
    return { success: false, error: mapRpcError(error.message) };
  }

  revalidatePath(`/materials/${materialId}`);
  revalidatePath("/materials");
  return { success: true, data: undefined };
}

// practice_log 教材の指定インデックスのエントリを削除する。entries 削除と
// completed_units 更新は `practice_log_delete_entry` RPC で atomic 化する。
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

  const { supabase } = await requireAuth();

  const { error } = await supabase.rpc("practice_log_delete_entry", {
    p_material_id: parsed.data.materialId,
    p_entry_index: parsed.data.entryIndex,
  });

  if (error) {
    return { success: false, error: mapRpcError(error.message) };
  }

  revalidatePath(`/materials/${materialId}`);
  revalidatePath("/materials");
  return { success: true, data: undefined };
}
