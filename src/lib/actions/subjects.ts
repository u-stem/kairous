"use server";

import { revalidatePath } from "next/cache";
import {
  createSubjectSchema,
  extractFieldErrors,
} from "@/lib/validations/materials";
import type { ActionResult } from "@/lib/validations/materials";
import type { Subject } from "@/lib/types/materials";
import { ACTION_ERRORS } from "@/lib/constants";
import { requireAuth } from "@/lib/actions/auth-utils";

export async function createSubject(
  formData: FormData,
): Promise<ActionResult<{ id: string; name: string }>> {
  const parsed = createSubjectSchema.safeParse({
    name: formData.get("name"),
  });

  if (!parsed.success) {
    return {
      success: false,
      error: ACTION_ERRORS.INVALID_INPUT,
      fieldErrors: extractFieldErrors(parsed.error),
    };
  }

  const { user, supabase } = await requireAuth();

  const { data, error } = await supabase
    .from("subjects")
    .insert({ name: parsed.data.name, user_id: user.id })
    .select("id, name")
    .single();

  if (error) {
    return { success: false, error: ACTION_ERRORS.CREATE_FAILED("科目") };
  }

  revalidatePath("/materials");
  return { success: true, data };
}

export async function getSubjects(): Promise<Subject[]> {
  const { user, supabase } = await requireAuth();

  const { data, error } = await supabase
    .from("subjects")
    .select("*")
    .eq("user_id", user.id)
    .order("display_order");

  if (error) throw new Error(`getSubjects failed: ${error.message}`);
  return data ?? [];
}
