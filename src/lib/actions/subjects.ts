"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { createSubjectSchema } from "@/lib/validations/materials";
import type { ActionResult } from "@/lib/validations/materials";
import type { Subject } from "@/lib/types/materials";

export async function createSubject(
  formData: FormData,
): Promise<ActionResult<{ id: string; name: string }>> {
  const parsed = createSubjectSchema.safeParse({
    name: formData.get("name"),
  });

  if (!parsed.success) {
    return {
      success: false,
      error: "入力内容を確認してください",
      fieldErrors: parsed.error.flatten().fieldErrors,
    };
  }

  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    return { success: false, error: "認証が必要です" };
  }

  const { data, error } = await supabase
    .from("subjects")
    .insert({ name: parsed.data.name, user_id: user.id })
    .select("id, name")
    .single();

  if (error) {
    return { success: false, error: "科目の作成に失敗しました" };
  }

  revalidatePath("/materials");
  return { success: true, data };
}

export async function getSubjects(): Promise<Subject[]> {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) return [];

  const { data } = await supabase
    .from("subjects")
    .select("*")
    .eq("user_id", user.id)
    .order("display_order");

  return data ?? [];
}
