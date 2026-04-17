"use server";

import { revalidatePath } from "next/cache";
import type { ActionResult } from "@/lib/validations/materials";
import { ACTION_ERRORS } from "@/lib/constants";
import { completePomodoroSchema } from "@/lib/validations/pomodoro";
import { completeCustomSessionSchema } from "@/lib/validations/custom-session";
import { completeFreeStudySchema } from "@/lib/validations/free-study";
import { requireAuth } from "@/lib/actions/auth-utils";
import { upsertDailyLog, type JoinedMethod } from "./_shared";

// Pomodoro セッション完了。タイマーベースで card_reviews なし、直接 daily_logs に記録する
export async function completePomodoroSession(
  sessionId: string,
  selfRating: number,
  pomodorosCompleted: number,
  totalFocusSec: number,
  totalBreakSec: number,
): Promise<ActionResult<undefined>> {
  const parsed = completePomodoroSchema.safeParse({
    sessionId,
    selfRating,
    pomodorosCompleted,
    totalFocusSec,
    totalBreakSec,
  });
  if (!parsed.success) {
    return { success: false, error: ACTION_ERRORS.INVALID_INPUT };
  }

  const { user, supabase } = await requireAuth();

  const { data: session } = await supabase
    .from("sessions")
    .select("id, started_at, status, material_id, method_id")
    .eq("id", parsed.data.sessionId)
    .eq("user_id", user.id)
    .single();

  if (!session) return { success: false, error: ACTION_ERRORS.NOT_FOUND("セッション") };
  if (session.status !== "in_progress") {
    return { success: false, error: ACTION_ERRORS.SESSION_ALREADY_COMPLETED };
  }

  // クライアント値は表示用 meta にのみ使用し、duration_sec は改ざん耐性のためサーバー側で計算する
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
      meta: {
        pomodoros_completed: parsed.data.pomodorosCompleted,
        total_focus_sec: parsed.data.totalFocusSec,
        total_break_sec: parsed.data.totalBreakSec,
      },
    })
    .eq("id", parsed.data.sessionId);

  if (updateError) return { success: false, error: ACTION_ERRORS.UPDATE_FAILED("セッション") };

  if (session.material_id) {
    await upsertDailyLog(supabase, {
      userId: user.id,
      materialId: session.material_id,
      methodId: session.method_id,
      durationSec,
      actionName: "completePomodoroSession",
      sessionId: parsed.data.sessionId,
    });
  }

  revalidatePath("/");
  return { success: true, data: undefined };
}

// Custom method セッション完了。カスタム手法のみ許可、タイマーベースで daily_logs 直書き
export async function completeCustomSession(
  sessionId: string,
  selfRating: number,
  elapsedSec: number,
  targetDurationSec: number | null,
): Promise<ActionResult<undefined>> {
  const parsed = completeCustomSessionSchema.safeParse({
    sessionId,
    selfRating,
    elapsedSec,
    targetDurationSec,
  });
  if (!parsed.success) {
    return { success: false, error: ACTION_ERRORS.INVALID_INPUT };
  }

  const { user, supabase } = await requireAuth();

  const { data: session } = await supabase
    .from("sessions")
    .select("id, started_at, status, material_id, method_id")
    .eq("id", parsed.data.sessionId)
    .eq("user_id", user.id)
    .single();

  if (!session) return { success: false, error: ACTION_ERRORS.NOT_FOUND("セッション") };
  if (session.status !== "in_progress") {
    return { success: false, error: ACTION_ERRORS.SESSION_ALREADY_COMPLETED };
  }

  // カスタム手法のセッションのみ完了可能。システム手法は専用の completion action を使う
  const { data: methodRow } = await supabase
    .from("learning_methods")
    .select("is_system")
    .eq("id", session.method_id)
    .single();

  if (!methodRow || methodRow.is_system) {
    return { success: false, error: "この完了アクションはカスタム手法セッション専用です" };
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
      meta: {
        actual_duration_sec: parsed.data.elapsedSec,
        target_duration_sec: parsed.data.targetDurationSec,
      },
    })
    .eq("id", parsed.data.sessionId);

  if (updateError) return { success: false, error: ACTION_ERRORS.UPDATE_FAILED("セッション") };

  if (session.material_id) {
    await upsertDailyLog(supabase, {
      userId: user.id,
      materialId: session.material_id,
      methodId: session.method_id,
      durationSec,
      actionName: "completeCustomSession",
      sessionId: parsed.data.sessionId,
    });
  }

  revalidatePath("/");
  return { success: true, data: undefined };
}

// Free Study セッション完了。self_rating なし、タイマーベースで daily_logs 直書き
export async function completeFreeStudySession(
  sessionId: string,
  elapsedSec: number,
): Promise<ActionResult<undefined>> {
  const parsed = completeFreeStudySchema.safeParse({ sessionId, elapsedSec });
  if (!parsed.success) {
    return { success: false, error: ACTION_ERRORS.INVALID_INPUT };
  }

  const { user, supabase } = await requireAuth();

  // 所有者・進行中・free_study の3条件を同時に検証し、不正な完了を防ぐ
  const { data: session } = await supabase
    .from("sessions")
    .select("id, started_at, status, material_id, method_id, learning_methods!inner(slug)")
    .eq("id", parsed.data.sessionId)
    .eq("user_id", user.id)
    .single();

  if (!session) return { success: false, error: ACTION_ERRORS.NOT_FOUND("セッション") };
  if (session.status !== "in_progress") {
    return { success: false, error: ACTION_ERRORS.SESSION_ALREADY_COMPLETED };
  }

  const method = session.learning_methods as JoinedMethod;
  if (method.slug !== "free_study") {
    return { success: false, error: "自由学習セッションではありません" };
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
      self_rating: null,
      ended_at: now.toISOString(),
      meta: { actual_duration_sec: parsed.data.elapsedSec },
    })
    .eq("id", parsed.data.sessionId);

  if (updateError) return { success: false, error: ACTION_ERRORS.UPDATE_FAILED("セッション") };

  if (session.material_id) {
    await upsertDailyLog(supabase, {
      userId: user.id,
      materialId: session.material_id,
      methodId: session.method_id,
      durationSec,
      actionName: "completeFreeStudySession",
      sessionId: parsed.data.sessionId,
    });
  }

  revalidatePath("/");
  return { success: true, data: undefined };
}
