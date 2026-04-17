"use server";

import { revalidatePath } from "next/cache";
import { createCategorySchema } from "@/lib/validations/materials";
import { extractFieldErrors, type ActionResult } from "@/lib/types/action-result";
import type { Category } from "@/lib/types/materials";
import { ACTION_ERRORS } from "@/lib/constants";
import { requireAuth } from "@/lib/actions/auth-utils";

export async function createCategory(
  formData: FormData,
): Promise<ActionResult<{ id: string; name: string }>> {
  const parsed = createCategorySchema.safeParse({
    name: formData.get("name"),
    parent_id: formData.get("parent_id") ?? null,
  });

  if (!parsed.success) {
    return {
      success: false,
      error: ACTION_ERRORS.INVALID_INPUT,
      fieldErrors: extractFieldErrors(parsed.error),
    };
  }

  const { user, supabase } = await requireAuth();

  // RLS により自分のカテゴリしか返らないため、他ユーザーの parent_id は null になる
  // DB トリガ enforce_category_depth が深さを保証するが、ここでも早期に弾く
  if (parsed.data.parent_id) {
    const { data: parent } = await supabase
      .from("categories")
      .select("id")
      .eq("id", parsed.data.parent_id)
      .single();
    if (!parent) return { success: false, error: "無効な親カテゴリです" };
  }

  const insertData: { name: string; user_id: string; parent_id?: string } = {
    name: parsed.data.name,
    user_id: user.id,
  };
  if (parsed.data.parent_id) {
    insertData.parent_id = parsed.data.parent_id;
  }

  const { data, error } = await supabase
    .from("categories")
    .insert(insertData)
    .select("id, name")
    .single();

  if (error) {
    return { success: false, error: ACTION_ERRORS.CREATE_FAILED("カテゴリ") };
  }

  revalidatePath("/materials");
  return { success: true, data };
}

export async function getCategories(): Promise<Category[]> {
  const { user, supabase } = await requireAuth();

  const { data, error } = await supabase
    .from("categories")
    .select("*")
    .eq("user_id", user.id)
    .order("display_order");

  if (error) throw new Error(`getCategories failed: ${error.message}`);
  return data ?? [];
}
