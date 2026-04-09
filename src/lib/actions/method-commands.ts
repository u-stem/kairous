"use server";

import { revalidatePath } from "next/cache";
import type { ActionResult } from "@/lib/validations/materials";
import {
  createMethodSchema,
  updateMethodSchema,
} from "@/lib/validations/methods";
import { extractFieldErrors } from "@/lib/validations/materials";
import { ACTION_ERRORS, PG_ERROR_CODES } from "@/lib/constants";
import { requireAuth } from "@/lib/actions/auth-utils";
import { generateMethodSlug } from "@/lib/utils/slug";
import type { Tables } from "@/lib/types/database";

type MethodRow = Tables<"learning_methods">;

export async function createMethod(
  input: unknown,
): Promise<ActionResult<MethodRow>> {
  const parsed = createMethodSchema.safeParse(input);
  if (!parsed.success) {
    return {
      success: false,
      error: ACTION_ERRORS.INVALID_INPUT,
      fieldErrors: extractFieldErrors(parsed.error),
    };
  }

  const { user, supabase } = await requireAuth();
  const slug = generateMethodSlug(user.id, parsed.data.name);

  const { data, error } = await supabase
    .from("learning_methods")
    .insert({
      slug,
      name: parsed.data.name,
      category: parsed.data.category,
      description: parsed.data.description ?? null,
      default_duration_sec: parsed.data.default_duration_sec ?? null,
      default_config: {},
      is_system: false,
      user_id: user.id,
    })
    .select()
    .single();

  if (error) {
    if (error.code === PG_ERROR_CODES.UNIQUE_VIOLATION) {
      return { success: false, error: "同じ名前の手法が既に存在します" };
    }
    return { success: false, error: ACTION_ERRORS.CREATE_FAILED("学習手法") };
  }

  revalidatePath("/materials");
  return { success: true, data };
}

export async function updateMethod(
  methodId: string,
  input: unknown,
): Promise<ActionResult<MethodRow>> {
  const parsed = updateMethodSchema.safeParse(input);
  if (!parsed.success) {
    return {
      success: false,
      error: ACTION_ERRORS.INVALID_INPUT,
      fieldErrors: extractFieldErrors(parsed.error),
    };
  }

  const { user, supabase } = await requireAuth();

  const updateData: Record<string, unknown> = {};
  if (parsed.data.name !== undefined) {
    updateData.name = parsed.data.name;
    updateData.slug = generateMethodSlug(user.id, parsed.data.name);
  }
  if (parsed.data.category !== undefined)
    updateData.category = parsed.data.category;
  if (parsed.data.description !== undefined)
    updateData.description = parsed.data.description;
  if ("default_duration_sec" in parsed.data)
    updateData.default_duration_sec =
      parsed.data.default_duration_sec ?? null;

  const { data, error } = await supabase
    .from("learning_methods")
    .update(updateData)
    .eq("id", methodId)
    .eq("is_system", false)
    .eq("user_id", user.id)
    .select()
    .single();

  if (error) {
    if (error.code === PG_ERROR_CODES.UNIQUE_VIOLATION) {
      return { success: false, error: "同じ名前の手法が既に存在します" };
    }
    return { success: false, error: ACTION_ERRORS.UPDATE_FAILED("学習手法") };
  }

  revalidatePath("/materials");
  return { success: true, data };
}

export async function deleteMethod(
  methodId: string,
): Promise<ActionResult<undefined>> {
  const { user, supabase } = await requireAuth();

  // セッション履歴があれば削除不可
  const { count: sessionCount } = await supabase
    .from("sessions")
    .select("id", { count: "exact", head: true })
    .eq("method_id", methodId)
    .eq("user_id", user.id);

  if (sessionCount && sessionCount > 0) {
    return {
      success: false,
      error:
        "この手法にはセッションが記録されているため削除できません",
    };
  }

  // 教材の唯一の手法になっていないか確認
  // material_methods で method_id にマッチする教材のうち、手法が1つしかないものを探す
  const { data: linkedMaterials } = await supabase
    .from("material_methods")
    .select("material_id")
    .eq("method_id", methodId);

  if (linkedMaterials && linkedMaterials.length > 0) {
    const materialIds = linkedMaterials.map((l) => l.material_id);
    const { data: materialMethodCounts } = await supabase
      .from("material_methods")
      .select("material_id")
      .in("material_id", materialIds);

    if (materialMethodCounts) {
      const countByMaterial = new Map<string, number>();
      for (const row of materialMethodCounts) {
        countByMaterial.set(row.material_id, (countByMaterial.get(row.material_id) ?? 0) + 1);
      }
      for (const mid of materialIds) {
        if ((countByMaterial.get(mid) ?? 0) <= 1) {
          return {
            success: false,
            error:
              "この手法は教材の唯一の手法であるため削除できません。先に教材から手法を外してください",
          };
        }
      }
    }
  }

  // RLS が is_system=false AND user_id=auth.uid() を強制
  const { error } = await supabase
    .from("learning_methods")
    .delete()
    .eq("id", methodId)
    .eq("is_system", false)
    .eq("user_id", user.id);

  if (error) {
    return { success: false, error: ACTION_ERRORS.DELETE_FAILED("学習手法") };
  }

  revalidatePath("/materials");
  return { success: true, data: undefined };
}
