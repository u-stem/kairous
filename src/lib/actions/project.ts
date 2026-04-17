"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { ACTION_ERRORS, VALIDATION_LIMITS } from "@/lib/constants";
import { requireAuth, type AuthenticatedContext } from "@/lib/actions/auth-utils";
import { projectMetaSchema } from "@/lib/validations/materials";
import {
  extractFieldErrors,
  type ActionResult,
} from "@/lib/types/action-result";

// projectMetaSchema.milestones 内の単一要素に合わせて制約値を揃える。
// zod の派生は型推論が複雑になるため手書きで揃え、コメントで対応関係を示す
const milestoneSchema = z.object({
  name: z.string().min(1, "マイルストーン名を入力してください").max(200),
  done: z.boolean(),
  date: z.iso.date().optional(),
});

export type ProjectMilestone = z.infer<typeof milestoneSchema>;
type ProjectMeta = z.infer<typeof projectMetaSchema>;

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

// projectMetaSchema.milestones.max と同じ値を参照し、single source of truth にする
const MAX_MILESTONES = VALIDATION_LIMITS.PROJECT_MILESTONES_MAX;

// done=true のマイルストーン件数。進捗表示で completed_units として採用する
function countDone(milestones: ProjectMilestone[]): number {
  return milestones.filter((m) => m.done).length;
}

// project 教材の取得と型チェックを共通化。
// 3 Action (add / toggle / delete) の冒頭で走る所有権 + type ガードを 1 箇所にまとめる
type LoadOk = {
  ok: true;
  meta: ProjectMeta;
  milestones: ProjectMilestone[];
};
type LoadErr = { ok: false; error: string };

async function loadProjectMaterial(
  ctx: AuthenticatedContext,
  materialId: string,
): Promise<LoadOk | LoadErr> {
  const { data: material, error: fetchError } = await ctx.supabase
    .from("materials")
    .select("type, meta")
    .eq("id", materialId)
    .eq("user_id", ctx.user.id)
    .maybeSingle();

  if (fetchError) {
    return { ok: false, error: ACTION_ERRORS.UPDATE_FAILED("教材") };
  }
  if (!material) {
    return { ok: false, error: ACTION_ERRORS.NOT_FOUND("教材") };
  }
  if (material.type !== "project") {
    return {
      ok: false,
      error: "project タイプ以外の教材ではマイルストーンを操作できません",
    };
  }

  const meta = (material.meta as ProjectMeta | null) ?? {};
  return { ok: true, meta, milestones: meta.milestones ?? [] };
}

// add / toggle / delete で共通の atomic 更新処理
async function persistMilestones(
  ctx: AuthenticatedContext,
  materialId: string,
  currentMeta: ProjectMeta,
  nextMilestones: ProjectMilestone[],
): Promise<ActionResult<undefined>> {
  // deadline 等 currentMeta の他フィールドを保持して milestones のみ差し替える
  const nextMeta: ProjectMeta = { ...currentMeta, milestones: nextMilestones };
  const { error: updateError } = await ctx.supabase
    .from("materials")
    .update({ meta: nextMeta, completed_units: countDone(nextMilestones) })
    .eq("id", materialId)
    .eq("user_id", ctx.user.id);

  if (updateError) {
    return { success: false, error: ACTION_ERRORS.UPDATE_FAILED("教材") };
  }

  revalidatePath(`/materials/${materialId}`);
  revalidatePath("/materials");
  return { success: true, data: undefined };
}

// project 教材にマイルストーンを追加する
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

  const ctx = await requireAuth();
  const loaded = await loadProjectMaterial(ctx, materialId);
  if (!loaded.ok) return { success: false, error: loaded.error };

  if (loaded.milestones.length >= MAX_MILESTONES) {
    return {
      success: false,
      error: `マイルストーン数が上限 (${MAX_MILESTONES}) に達しています`,
    };
  }

  const nextMilestones = [...loaded.milestones, parsed.data.milestone];
  return persistMilestones(ctx, materialId, loaded.meta, nextMilestones);
}

// 指定 index のマイルストーンの done を反転する
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

  const ctx = await requireAuth();
  const loaded = await loadProjectMaterial(ctx, materialId);
  if (!loaded.ok) return { success: false, error: loaded.error };

  if (milestoneIndex >= loaded.milestones.length) {
    return {
      success: false,
      error: `インデックス ${milestoneIndex} のマイルストーンは存在しません`,
    };
  }

  const nextMilestones = loaded.milestones.map((m, i) =>
    i === milestoneIndex ? { ...m, done: !m.done } : m,
  );
  return persistMilestones(ctx, materialId, loaded.meta, nextMilestones);
}

// 指定 index のマイルストーンを削除する
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

  const ctx = await requireAuth();
  const loaded = await loadProjectMaterial(ctx, materialId);
  if (!loaded.ok) return { success: false, error: loaded.error };

  if (milestoneIndex >= loaded.milestones.length) {
    return {
      success: false,
      error: `インデックス ${milestoneIndex} のマイルストーンは存在しません`,
    };
  }

  const nextMilestones = loaded.milestones.filter(
    (_, i) => i !== milestoneIndex,
  );
  return persistMilestones(ctx, materialId, loaded.meta, nextMilestones);
}
