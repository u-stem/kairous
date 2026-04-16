"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { ACTION_ERRORS } from "@/lib/constants";
import { requireAuth } from "@/lib/actions/auth-utils";
import type { Tag } from "@/lib/types/tags";

type ActionResult<T = undefined> =
  | { success: true; data: T }
  | { success: false; error: string };

const createTagSchema = z.object({
  name: z.string().min(1, "タグ名を入力してください").max(50, "50文字以内で入力してください").trim(),
  color: z.string().optional(),
});

export async function getTags(): Promise<Tag[]> {
  const { user, supabase } = await requireAuth();

  const { data, error } = await supabase
    .from("tags")
    .select("*")
    .eq("user_id", user.id)
    .order("name");

  if (error) throw new Error(`getTags failed: ${error.message}`);
  return data ?? [];
}

export async function getTagsForMaterial(materialId: string): Promise<Tag[]> {
  const { user, supabase } = await requireAuth();

  // RLS で自分の教材のタグのみ返る。アプリ層でも user_id をフィルタし多重保護する
  const { data, error } = await supabase
    .from("material_tags")
    .select("tags(*)")
    .eq("material_id", materialId)
    .eq("tags.user_id", user.id);

  if (error) throw new Error(`getTagsForMaterial failed: ${error.message}`);

  return (data ?? [])
    .map((row) => row.tags as Tag | null)
    .filter((t): t is Tag => t !== null);
}

export async function createTag(
  name: string,
  color?: string,
): Promise<ActionResult<Tag>> {
  const parsed = createTagSchema.safeParse({ name, color });
  if (!parsed.success) {
    return { success: false, error: ACTION_ERRORS.INVALID_INPUT };
  }

  const { user, supabase } = await requireAuth();

  const { data, error } = await supabase
    .from("tags")
    .insert({
      name: parsed.data.name,
      user_id: user.id,
      color: parsed.data.color ?? "#94a3b8",
    })
    .select("*")
    .single();

  if (error) {
    // UNIQUE(user_id, name) 違反: code 23505
    if (error.code === "23505") {
      return { success: false, error: "同名のタグが既に存在します" };
    }
    return { success: false, error: ACTION_ERRORS.CREATE_FAILED("タグ") };
  }

  revalidatePath("/materials");
  return { success: true, data: data as Tag };
}

export async function deleteTag(tagId: string): Promise<ActionResult> {
  const { user, supabase } = await requireAuth();

  const { error } = await supabase
    .from("tags")
    .delete()
    .eq("id", tagId)
    .eq("user_id", user.id);

  if (error) return { success: false, error: ACTION_ERRORS.DELETE_FAILED("タグ") };

  revalidatePath("/materials");
  return { success: true, data: undefined };
}

export async function addTagToMaterial(
  materialId: string,
  tagId: string,
): Promise<ActionResult> {
  const { supabase } = await requireAuth();

  // RLS で自分の教材・タグのみ操作可能
  const { error } = await supabase
    .from("material_tags")
    .upsert({ material_id: materialId, tag_id: tagId });

  if (error) return { success: false, error: "タグの追加に失敗しました" };

  revalidatePath(`/materials/${materialId}`);
  revalidatePath("/materials");
  return { success: true, data: undefined };
}

export async function removeTagFromMaterial(
  materialId: string,
  tagId: string,
): Promise<ActionResult> {
  const { supabase } = await requireAuth();

  const { error } = await supabase
    .from("material_tags")
    .delete()
    .eq("material_id", materialId)
    .eq("tag_id", tagId);

  if (error) return { success: false, error: "タグの削除に失敗しました" };

  revalidatePath(`/materials/${materialId}`);
  revalidatePath("/materials");
  return { success: true, data: undefined };
}
