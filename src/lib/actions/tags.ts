"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { ACTION_ERRORS, PG_ERROR_CODES, VALIDATION_LIMITS } from "@/lib/constants";
import { requireAuth } from "@/lib/actions/auth-utils";
import type { Tag } from "@/lib/types/tags";
import type { ActionResult } from "@/lib/validations/materials";

const createTagSchema = z.object({
  name: z.string().min(1, "タグ名を入力してください").max(VALIDATION_LIMITS.TAG_NAME_MAX, `${VALIDATION_LIMITS.TAG_NAME_MAX}文字以内で入力してください`).trim(),
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

export async function getBulkTagsForMaterials(
  materialIds: string[],
): Promise<Map<string, Tag[]>> {
  if (materialIds.length === 0) return new Map();

  const { user, supabase } = await requireAuth();

  // N+1 を避けるため material_tags を一括取得し、アプリ層で material_id ごとに集約する
  const { data, error } = await supabase
    .from("material_tags")
    .select("material_id, tags(*)")
    .in("material_id", materialIds)
    .eq("tags.user_id", user.id);

  if (error) throw new Error(`getBulkTagsForMaterials failed: ${error.message}`);

  const map = new Map<string, Tag[]>(materialIds.map((id) => [id, []]));
  for (const row of data ?? []) {
    const tag = row.tags as Tag | null;
    if (tag) {
      map.get(row.material_id)?.push(tag);
    }
  }
  return map;
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
    // UNIQUE(user_id, name) 違反
    if (error.code === PG_ERROR_CODES.UNIQUE_VIOLATION) {
      return { success: false, error: "同名のタグが既に存在します" };
    }
    return { success: false, error: ACTION_ERRORS.CREATE_FAILED("タグ") };
  }

  revalidatePath("/materials");
  return { success: true, data: data as Tag };
}

export async function deleteTag(tagId: string): Promise<ActionResult<undefined>> {
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
): Promise<ActionResult<undefined>> {
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
): Promise<ActionResult<undefined>> {
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
