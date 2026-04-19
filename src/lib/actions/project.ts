"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { ACTION_ERRORS, VALIDATION_LIMITS } from "@/lib/constants";
import { requireAuth } from "@/lib/actions/auth-utils";
import {
  extractFieldErrors,
  type ActionResult,
} from "@/lib/types/action-result";

// projectMetaSchema.milestones 内の単一要素に合わせた zod スキーマ。
// 直接 projectMetaSchema から派生させると nested の型推論が複雑化するため手書きで揃える
const milestoneSchema = z.object({
  name: z.string().min(1, "マイルストーン名を入力してください").max(200),
  done: z.boolean(),
  date: z.iso.date().optional(),
});

export type ProjectMilestone = z.infer<typeof milestoneSchema>;

const addMilestoneSchema = z.object({
  materialId: z.uuid("有効な教材IDを指定してください"),
  milestone: milestoneSchema,
});

const milestoneIndexSchema = z.object({
  materialId: z.uuid("有効な教材IDを指定してください"),
  milestoneIndex: z
    .number()
    .int("インデックスは整数で指定してください")
    .nonnegative("インデックスは 0 以上で指定してください"),
});

// 00025 migration の plpgsql 関数が `RAISE EXCEPTION` で投げるメッセージから
// user-facing エラーに map する。practice-log.ts の mapRpcError と同方針。
function mapRpcError(message: string): string {
  if (message.includes("material not found")) {
    return ACTION_ERRORS.NOT_FOUND("教材");
  }
  // "is not project" まで含めた方が誤 match リスクを下げられる
  // (migration の RAISE メッセージは `material type is not project (got ...)`)
  if (message.includes("is not project")) {
    return "project タイプ以外の教材ではマイルストーンを操作できません";
  }
  if (message.includes("exceeded max")) {
    const m = message.match(/max \((\d+)\)/);
    return `マイルストーン数が上限 (${m?.[1] ?? VALIDATION_LIMITS.PROJECT_MILESTONES_MAX}) に達しています`;
  }
  if (message.includes("out of range")) {
    const m = message.match(/index (-?\d+)/);
    return m
      ? `インデックス ${m[1]} のマイルストーンは存在しません`
      : "指定されたマイルストーンは存在しません";
  }
  if (message.includes("must be a JSON object")) {
    return ACTION_ERRORS.INVALID_INPUT;
  }
  return ACTION_ERRORS.UPDATE_FAILED("教材");
}

// project 教材にマイルストーンを追加する。milestones 追加と completed_units
// (= done 件数) 更新は `project_add_milestone` RPC 内で SELECT FOR UPDATE +
// UPDATE により atomic に実行される (#321)。RLS (FOR ALL USING = auth.uid())
// が所有権を守るため Server Action 側での user_id フィルタは不要。
export async function addMilestone(
  materialId: string,
  milestone: ProjectMilestone,
): Promise<ActionResult<undefined>> {
  const parsed = addMilestoneSchema.safeParse({ materialId, milestone });
  if (!parsed.success) {
    return {
      success: false,
      error: ACTION_ERRORS.INVALID_INPUT,
      fieldErrors: extractFieldErrors(parsed.error),
    };
  }

  const { supabase } = await requireAuth();

  const { error } = await supabase.rpc("project_add_milestone", {
    p_material_id: parsed.data.materialId,
    p_milestone: parsed.data.milestone,
  });

  if (error) {
    return { success: false, error: mapRpcError(error.message) };
  }

  revalidatePath(`/materials/${materialId}`);
  revalidatePath("/materials");
  return { success: true, data: undefined };
}

// 指定 index のマイルストーンの done を反転する。completed_units の再計算は
// RPC 側で jsonb_array_elements を用いて集計するため client 側は関知しない。
export async function toggleMilestone(
  materialId: string,
  milestoneIndex: number,
): Promise<ActionResult<undefined>> {
  const parsed = milestoneIndexSchema.safeParse({ materialId, milestoneIndex });
  if (!parsed.success) {
    return {
      success: false,
      error: ACTION_ERRORS.INVALID_INPUT,
      fieldErrors: extractFieldErrors(parsed.error),
    };
  }

  const { supabase } = await requireAuth();

  const { error } = await supabase.rpc("project_toggle_milestone", {
    p_material_id: parsed.data.materialId,
    p_milestone_index: parsed.data.milestoneIndex,
  });

  if (error) {
    return { success: false, error: mapRpcError(error.message) };
  }

  revalidatePath(`/materials/${materialId}`);
  revalidatePath("/materials");
  return { success: true, data: undefined };
}

// 指定 index のマイルストーンを削除する。
export async function deleteMilestone(
  materialId: string,
  milestoneIndex: number,
): Promise<ActionResult<undefined>> {
  const parsed = milestoneIndexSchema.safeParse({ materialId, milestoneIndex });
  if (!parsed.success) {
    return {
      success: false,
      error: ACTION_ERRORS.INVALID_INPUT,
      fieldErrors: extractFieldErrors(parsed.error),
    };
  }

  const { supabase } = await requireAuth();

  const { error } = await supabase.rpc("project_delete_milestone", {
    p_material_id: parsed.data.materialId,
    p_milestone_index: parsed.data.milestoneIndex,
  });

  if (error) {
    return { success: false, error: mapRpcError(error.message) };
  }

  revalidatePath(`/materials/${materialId}`);
  revalidatePath("/materials");
  return { success: true, data: undefined };
}
