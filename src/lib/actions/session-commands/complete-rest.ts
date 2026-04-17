"use server";

import { revalidatePath } from "next/cache";
import { completeRestSessionSchema } from "@/lib/validations/sessions";
import type { ActionResult } from "@/lib/types/action-result";
import { REST_DURATION_SEC, ACTION_ERRORS } from "@/lib/constants";
import { requireAuth } from "@/lib/actions/auth-utils";
import type { JoinedMethod } from "./_shared";

// 安静 (wakeful_rest) セッション完了。duration_sec は固定値 (REST_DURATION_SEC) を使う
export async function completeRestSession(
  sessionId: string,
): Promise<ActionResult<undefined>> {
  const parsed = completeRestSessionSchema.safeParse({ sessionId });
  if (!parsed.success) {
    return { success: false, error: ACTION_ERRORS.INVALID_INPUT };
  }

  const { user, supabase } = await requireAuth();

  // 所有者・進行中・安静セッションの3条件を同時に検証し、不正な完了を防ぐ
  const { data: session } = await supabase
    .from("sessions")
    .select("id, learning_methods!inner(slug)")
    .eq("id", parsed.data.sessionId)
    .eq("user_id", user.id)
    .eq("status", "in_progress")
    .single();

  if (!session) return { success: false, error: ACTION_ERRORS.NOT_FOUND("セッション") };

  const method = session.learning_methods as JoinedMethod;
  if (method.slug !== "wakeful_rest") {
    return { success: false, error: "安静セッションではありません" };
  }

  const { error } = await supabase
    .from("sessions")
    .update({
      status: "completed",
      duration_sec: REST_DURATION_SEC,
      ended_at: new Date().toISOString(),
    })
    .eq("id", parsed.data.sessionId);

  if (error) return { success: false, error: ACTION_ERRORS.UPDATE_FAILED("セッション") };

  revalidatePath("/");
  return { success: true, data: undefined };
}
