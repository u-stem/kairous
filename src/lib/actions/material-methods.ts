"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import type { ActionResult } from "@/lib/validations/materials";
import type { LearningMethod } from "@/lib/types/materials";
import type { Json } from "@/lib/types/database";
import { MATERIAL_METHOD_SLUGS } from "@/lib/constants";

export async function addMaterialMethod(
  materialId: string,
  methodId: string,
  config?: Record<string, unknown>,
): Promise<ActionResult<undefined>> {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { success: false, error: "認証が必要です" };

  // RLSに加えてuser_idで絞り込み、他ユーザーの教材への追加を防ぐ
  const { data: material } = await supabase
    .from("materials")
    .select("id")
    .eq("id", materialId)
    .eq("user_id", user.id)
    .single();

  if (!material) return { success: false, error: "教材が見つかりません" };

  // ウィザード外から不正なスラッグを紐付けられないよう、許可リストで検証する
  const { data: method } = await supabase
    .from("learning_methods")
    .select("id, slug")
    .eq("id", methodId)
    .single();

  if (!method) return { success: false, error: "学習手法が見つかりません" };

  if (!(MATERIAL_METHOD_SLUGS as readonly string[]).includes(method.slug)) {
    return { success: false, error: "この学習手法は紐付けできません" };
  }

  const { error } = await supabase.from("material_methods").insert({
    material_id: materialId,
    method_id: methodId,
    config: (config ?? null) as Json | null,
  });

  if (error) {
    // PostgreSQL unique violation: 既に同じ手法が紐付けられている
    if (error.code === "23505") {
      return { success: false, error: "この手法は既に紐付けされています" };
    }
    return { success: false, error: "学習手法の追加に失敗しました" };
  }

  revalidatePath(`/materials/${materialId}`);
  return { success: true, data: undefined };
}

export async function removeMaterialMethod(
  materialId: string,
  methodId: string,
): Promise<ActionResult<undefined>> {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { success: false, error: "認証が必要です" };

  // RLSに加えてuser_idで絞り込み、他ユーザーの教材への操作を防ぐ
  const { data: material } = await supabase
    .from("materials")
    .select("id")
    .eq("id", materialId)
    .eq("user_id", user.id)
    .single();

  if (!material) return { success: false, error: "教材が見つかりません" };

  // 学習科学の観点から手法ゼロは意味をなさないため、削除前に残数を確認する
  const { count } = await supabase
    .from("material_methods")
    .select("id", { count: "exact", head: true })
    .eq("material_id", materialId);

  if (count !== null && count <= 1) {
    return { success: false, error: "最低1つの学習手法が必要です" };
  }

  const { error } = await supabase
    .from("material_methods")
    .delete()
    .eq("material_id", materialId)
    .eq("method_id", methodId);

  if (error) return { success: false, error: "学習手法の削除に失敗しました" };

  revalidatePath(`/materials/${materialId}`);
  return { success: true, data: undefined };
}

export async function getMethods(): Promise<LearningMethod[]> {
  const supabase = await createClient();

  // learning_methodsはシステムデータのため認証不要。全ユーザーが参照可能
  const { data } = await supabase
    .from("learning_methods")
    .select("*")
    .order("category", { ascending: true });

  return data ?? [];
}
