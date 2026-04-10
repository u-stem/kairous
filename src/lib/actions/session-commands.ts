"use server";

import { revalidatePath } from "next/cache";
import {
  createSessionSchema,
  completeSessionSchema,
  createRestSessionSchema,
  completeRestSessionSchema,
  extractFieldErrors,
} from "@/lib/validations/sessions";
import {
  completeElaborationSchema,
  type ElaborationInput,
} from "@/lib/validations/elaboration";
import { createInterleavingSessionSchema } from "@/lib/validations/interleaving";
import type { ActionResult } from "@/lib/validations/materials";
import type { CardReview } from "@/lib/types/sessions";
import { REST_DURATION_SEC, ACTION_ERRORS } from "@/lib/constants";
import { completePomodoroSchema } from "@/lib/validations/pomodoro";
import { completeCustomSessionSchema } from "@/lib/validations/custom-session";
import { completeFreeStudySchema } from "@/lib/validations/free-study";
import { requireAuth } from "@/lib/actions/auth-utils";
import { invokeCompleteSession } from "@/lib/actions/session-compensation";
import { toJstDateString } from "@/lib/utils/date";

// Supabase JOIN 結果の型
type JoinedMethod = { slug: string };

export async function createSession(
  materialId: string,
  methodId: string,
): Promise<ActionResult<{ id: string }>> {
  const parsed = createSessionSchema.safeParse({ materialId, methodId });
  if (!parsed.success) {
    return {
      success: false,
      error: ACTION_ERRORS.INVALID_INPUT,
      fieldErrors: extractFieldErrors(parsed.error),
    };
  }

  const { user, supabase } = await requireAuth();

  // RLS に加えてアプリ層でも所有者を確認し、RLS 緩和時の誤操作を防ぐ
  const { data: material } = await supabase
    .from("materials")
    .select("id")
    .eq("id", parsed.data.materialId)
    .eq("user_id", user.id)
    .single();

  if (!material) return { success: false, error: ACTION_ERRORS.NOT_FOUND("教材") };

  const { data: session, error } = await supabase
    .from("sessions")
    .insert({
      material_id: parsed.data.materialId,
      method_id: parsed.data.methodId,
      user_id: user.id,
      status: "in_progress",
    })
    .select("id")
    .single();

  if (error) return { success: false, error: ACTION_ERRORS.CREATE_FAILED("セッション") };

  return { success: true, data: { id: session.id } };
}

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

export async function createRestSession(
  parentSessionId: string,
): Promise<ActionResult<{ id: string }>> {
  const parsed = createRestSessionSchema.safeParse({ parentSessionId });
  if (!parsed.success) {
    return { success: false, error: ACTION_ERRORS.INVALID_INPUT };
  }

  const { user, supabase } = await requireAuth();

  // RLS に加えてアプリ層でも所有者を確認し、他ユーザーのセッションへの紐付けを防ぐ
  const { data: parentSession } = await supabase
    .from("sessions")
    .select("id")
    .eq("id", parsed.data.parentSessionId)
    .eq("user_id", user.id)
    .single();

  if (!parentSession) return { success: false, error: ACTION_ERRORS.NOT_FOUND("セッション") };

  const { data: restMethod } = await supabase
    .from("learning_methods")
    .select("id")
    .eq("slug", "wakeful_rest")
    .single();

  if (!restMethod) return { success: false, error: ACTION_ERRORS.NOT_FOUND("安静タイマー手法") };

  const { data: session, error } = await supabase
    .from("sessions")
    .insert({
      user_id: user.id,
      method_id: restMethod.id,
      status: "in_progress",
      meta: { parent_session_id: parsed.data.parentSessionId },
    })
    .select("id")
    .single();

  if (error) return { success: false, error: ACTION_ERRORS.CREATE_FAILED("安静セッション") };

  return { success: true, data: { id: session.id } };
}

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

  // elaborations を meta に保存し、セッションを完了する
  const { error: updateError } = await supabase
    .from("sessions")
    .update({
      status: "completed",
      duration_sec: durationSec,
      self_rating: parsed.data.selfRating,
      ended_at: now.toISOString(),
      meta: { elaborations: parsed.data.elaborations },
    })
    .eq("id", parsed.data.sessionId);

  if (updateError) return { success: false, error: ACTION_ERRORS.UPDATE_FAILED("セッション") };

  // Edge Function で card_reviews + daily_logs を記録 (FSRS はスキップ)
  // meta: null を extraCompensationFields に渡すのは、失敗時に完了前に保存した elaborations を破棄するため
  const fnResult = await invokeCompleteSession(
    supabase,
    parsed.data.sessionId,
    { session_id: parsed.data.sessionId, reviews: parsed.data.reviews },
    { meta: null },
  );
  if (!fnResult.ok) return { success: false, error: fnResult.error };

  revalidatePath("/");
  return { success: true, data: undefined };
}

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

  // RLS に加えてアプリ層でも所有者と status を確認し、二重完了を防ぐ
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

  // Pomodoro は card_reviews がないため Edge Function を呼ばず、直接 daily_logs を記録する
  if (session.material_id) {
    const { data: material } = await supabase
      .from("materials")
      .select("subject_id")
      .eq("id", session.material_id)
      .single();

    if (material) {
      const logDate = toJstDateString(new Date());

      const { error: logError } = await supabase.rpc("upsert_daily_log", {
        p_user_id: user.id,
        p_subject_id: material.subject_id,
        p_method_id: session.method_id,
        p_log_date: logDate,
        p_duration_sec: durationSec,
        p_cards_reviewed: 0,
      });
      if (logError) {
        // daily_log 失敗はセッション完了をブロックしないが、データ欠損を追跡するためログに記録する
        console.error(
          `completePomodoroSession daily_log upsert failed for session ${parsed.data.sessionId}:`,
          logError,
        );
      }
    }
  }

  revalidatePath("/");
  return { success: true, data: undefined };
}

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

  // RLS に加えてアプリ層でも所有者と status を確認し、二重完了を防ぐ
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
        actual_duration_sec: parsed.data.elapsedSec,
        target_duration_sec: parsed.data.targetDurationSec,
      },
    })
    .eq("id", parsed.data.sessionId);

  if (updateError) return { success: false, error: ACTION_ERRORS.UPDATE_FAILED("セッション") };

  // カスタム手法は card_reviews がないため Edge Function を呼ばず、直接 daily_logs を記録する
  if (session.material_id) {
    const { data: material } = await supabase
      .from("materials")
      .select("subject_id")
      .eq("id", session.material_id)
      .single();

    if (material) {
      const logDate = toJstDateString(new Date());

      const { error: logError } = await supabase.rpc("upsert_daily_log", {
        p_user_id: user.id,
        p_subject_id: material.subject_id,
        p_method_id: session.method_id,
        p_log_date: logDate,
        p_duration_sec: durationSec,
        p_cards_reviewed: 0,
      });
      if (logError) {
        console.error(
          `completeCustomSession daily_log upsert failed for session ${parsed.data.sessionId}:`,
          logError,
        );
      }
    }
  }

  revalidatePath("/");
  return { success: true, data: undefined };
}

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
      self_rating: null,
      ended_at: now.toISOString(),
      meta: { actual_duration_sec: parsed.data.elapsedSec },
    })
    .eq("id", parsed.data.sessionId);

  if (updateError) return { success: false, error: ACTION_ERRORS.UPDATE_FAILED("セッション") };

  // Free Study は card_reviews がないため Edge Function を呼ばず、直接 daily_logs を記録する
  if (session.material_id) {
    const { data: material } = await supabase
      .from("materials")
      .select("subject_id")
      .eq("id", session.material_id)
      .single();

    if (material) {
      const logDate = toJstDateString(new Date());

      const { error: logError } = await supabase.rpc("upsert_daily_log", {
        p_user_id: user.id,
        p_subject_id: material.subject_id,
        p_method_id: session.method_id,
        p_log_date: logDate,
        p_duration_sec: durationSec,
        p_cards_reviewed: 0,
      });
      if (logError) {
        console.error(
          `completeFreeStudySession daily_log upsert failed for session ${parsed.data.sessionId}:`,
          logError,
        );
      }
    }
  }

  revalidatePath("/");
  return { success: true, data: undefined };
}

export async function createInterleavingSession(
  materialIds: string[],
): Promise<ActionResult<{ id: string }>> {
  const parsed = createInterleavingSessionSchema.safeParse({ materialIds });
  if (!parsed.success) {
    return { success: false, error: "インターリービングには2つ以上の教材が必要です" };
  }

  const { user, supabase } = await requireAuth();

  // interleaving の method_id を取得
  const { data: method } = await supabase
    .from("learning_methods")
    .select("id")
    .eq("slug", "interleaving")
    .single();

  if (!method) return { success: false, error: ACTION_ERRORS.NOT_FOUND("インターリービング手法") };

  // RLS に加えてアプリ層でも全教材の所有権を確認する
  const { data: ownedMaterials } = await supabase
    .from("materials")
    .select("id")
    .eq("user_id", user.id)
    .in("id", parsed.data.materialIds);

  if (!ownedMaterials || ownedMaterials.length !== parsed.data.materialIds.length) {
    return { success: false, error: ACTION_ERRORS.NOT_FOUND("教材") };
  }

  // material_id = NULL で interleaving セッションを作成
  const { data: session, error: sessionError } = await supabase
    .from("sessions")
    .insert({
      user_id: user.id,
      method_id: method.id,
      status: "in_progress",
    })
    .select("id")
    .single();

  if (sessionError || !session) {
    return { success: false, error: ACTION_ERRORS.CREATE_FAILED("セッション") };
  }

  // session_materials に対象教材を一括登録
  const sessionMaterialRows = parsed.data.materialIds.map((mid) => ({
    session_id: session.id,
    material_id: mid,
  }));

  const { error: smError } = await supabase
    .from("session_materials")
    .insert(sessionMaterialRows);

  if (smError) {
    // session_materials 挿入に失敗した場合、セッションを放棄状態にする
    await supabase
      .from("sessions")
      .update({ status: "abandoned" })
      .eq("id", session.id);
    return { success: false, error: ACTION_ERRORS.CREATE_FAILED("セッション") };
  }

  return { success: true, data: { id: session.id } };
}
