"use server";

import { revalidatePath } from "next/cache";
import { completeSessionSchema } from "@/lib/validations/sessions";
import {
  completeElaborationSchema,
  type ElaborationInput,
} from "@/lib/validations/elaboration";
import type { ActionResult } from "@/lib/validations/materials";
import type { CardReview } from "@/lib/types/sessions";
import { ACTION_ERRORS } from "@/lib/constants";
import { requireAuth } from "@/lib/actions/auth-utils";
import { invokeCompleteSession } from "@/lib/actions/session-compensation";

// SRS セッション完了。FSRS 計算と card_reviews INSERT を Edge Function に委譲する
export async function completeSession(
  sessionId: string,
  reviews: CardReview[],
  selfRating: number,
): Promise<ActionResult<undefined>> {
  const parsed = completeSessionSchema.safeParse({ sessionId, reviews, selfRating });
  if (!parsed.success) {
    return { success: false, error: ACTION_ERRORS.INVALID_INPUT };
  }

  const { user, supabase } = await requireAuth();

  // RLS に加えてアプリ層でも所有者と status を確認し、二重完了を防ぐ
  const { data: session } = await supabase
    .from("sessions")
    .select("id, started_at, status")
    .eq("id", parsed.data.sessionId)
    .eq("user_id", user.id)
    .single();

  if (!session) return { success: false, error: ACTION_ERRORS.NOT_FOUND("セッション") };
  if (session.status !== "in_progress") {
    return { success: false, error: ACTION_ERRORS.SESSION_ALREADY_COMPLETED };
  }

  const now = new Date();
  const durationSec = Math.floor(
    (now.getTime() - new Date(session.started_at).getTime()) / 1000,
  );

  const { error: updateError } = await supabase
    .from("sessions")
    .update({
      status: "completed",
      duration_sec: durationSec,
      self_rating: parsed.data.selfRating,
      ended_at: now.toISOString(),
    })
    .eq("id", parsed.data.sessionId);

  if (updateError) return { success: false, error: ACTION_ERRORS.UPDATE_FAILED("セッション") };

  // FSRS 計算と統計更新を原子的に実行するため、Edge Function に処理を委譲する。
  // supabase.functions.invoke はユーザーの JWT を Authorization ヘッダーに自動付与する
  const fnResult = await invokeCompleteSession(
    supabase,
    parsed.data.sessionId,
    { session_id: parsed.data.sessionId, reviews: parsed.data.reviews },
  );
  if (!fnResult.ok) return { success: false, error: fnResult.error };

  revalidatePath("/");
  return { success: true, data: undefined };
}

// Elaboration セッション完了。FSRS 計算はなく、elaborations を card_elaborations に記録する
export async function completeElaborationSession(
  sessionId: string,
  reviews: CardReview[],
  elaborations: ElaborationInput[],
  selfRating: number,
): Promise<ActionResult<undefined>> {
  const parsed = completeElaborationSchema.safeParse({ sessionId, reviews, elaborations, selfRating });
  if (!parsed.success) {
    return { success: false, error: ACTION_ERRORS.INVALID_INPUT };
  }

  const { user, supabase } = await requireAuth();

  // RLS に加えてアプリ層でも所有者と status を確認し、二重完了を防ぐ
  const { data: session } = await supabase
    .from("sessions")
    .select("id, started_at, status")
    .eq("id", parsed.data.sessionId)
    .eq("user_id", user.id)
    .single();

  if (!session) return { success: false, error: ACTION_ERRORS.NOT_FOUND("セッション") };
  if (session.status !== "in_progress") {
    return { success: false, error: ACTION_ERRORS.SESSION_ALREADY_COMPLETED };
  }

  const now = new Date();
  const durationSec = Math.floor(
    (now.getTime() - new Date(session.started_at).getTime()) / 1000,
  );

  // elaborations は Edge Function 経由で card_elaborations テーブルに保存する。
  // 以前は sessions.meta に JSONB で保持していたが、PBI #172 以降は正規化テーブルに移行した
  const { error: updateError } = await supabase
    .from("sessions")
    .update({
      status: "completed",
      duration_sec: durationSec,
      self_rating: parsed.data.selfRating,
      ended_at: now.toISOString(),
    })
    .eq("id", parsed.data.sessionId);

  if (updateError) return { success: false, error: ACTION_ERRORS.UPDATE_FAILED("セッション") };

  // Edge Function で card_reviews + card_elaborations + daily_logs を記録 (FSRS はスキップ)
  const fnResult = await invokeCompleteSession(
    supabase,
    parsed.data.sessionId,
    {
      session_id: parsed.data.sessionId,
      reviews: parsed.data.reviews,
      elaborations: parsed.data.elaborations,
    },
  );
  if (!fnResult.ok) return { success: false, error: fnResult.error };

  revalidatePath("/");
  return { success: true, data: undefined };
}
