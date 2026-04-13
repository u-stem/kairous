"use server";

import { revalidatePath } from "next/cache";
import { addDays } from "date-fns";
import { requireAuth } from "@/lib/actions/auth-utils";
import { toJstDateString } from "@/lib/utils/date";
import {
  ACTION_ERRORS,
  MAX_NOTIFICATION_SCHEDULES,
  NOTIFICATION_DEFAULTS,
} from "@/lib/constants";
import {
  createNotificationScheduleSchema,
  updateNotificationScheduleSchema,
  deleteNotificationScheduleSchema,
  extractFieldErrors,
  type ActionResult,
} from "@/lib/validations/notifications";
import type { SubjectDueCount } from "@/lib/utils/notification-messages";
import type { NotificationSchedule } from "@/lib/types/notification";

export async function getNotificationSchedules(): Promise<
  ActionResult<NotificationSchedule[]>
> {
  const { user, supabase } = await requireAuth();

  const { data, error } = await supabase
    .from("notification_schedules")
    .select("id, label, time, message_type, enabled")
    .eq("user_id", user.id)
    .order("time", { ascending: true });

  if (error) {
    return { success: false, error: "スケジュールの取得に失敗しました" };
  }

  // DB の message_type は CHECK 制約で NotificationMessageType に限定されている
  return { success: true, data: (data ?? []) as NotificationSchedule[] };
}

export async function getNotificationEnabled(): Promise<
  ActionResult<{ notification_enabled: boolean }>
> {
  const { user, supabase } = await requireAuth();

  const { data, error } = await supabase
    .from("profiles")
    .select("notification_enabled")
    .eq("id", user.id)
    .single();

  if (error) {
    return { success: false, error: "設定の取得に失敗しました" };
  }

  return { success: true, data };
}

export async function toggleNotificationEnabled(
  enabled: boolean,
): Promise<ActionResult<{ notification_enabled: boolean }>> {
  const { user, supabase } = await requireAuth();

  const { data, error } = await supabase
    .from("profiles")
    .update({ notification_enabled: enabled })
    .eq("id", user.id)
    .select("notification_enabled")
    .single();

  if (error) {
    return { success: false, error: ACTION_ERRORS.UPDATE_FAILED("通知設定") };
  }

  // 初回 ON 時にデフォルトスケジュールを作成する。
  // 既存スケジュールがある場合は重複挿入しない。
  if (enabled) {
    const { data: existing } = await supabase
      .from("notification_schedules")
      .select("id")
      .eq("user_id", user.id)
      .limit(1);

    if (!existing || existing.length === 0) {
      const { error: insertError } = await supabase.from("notification_schedules").insert([
        {
          user_id: user.id,
          label: NOTIFICATION_DEFAULTS.morning.label,
          time: NOTIFICATION_DEFAULTS.morning.time,
          message_type: NOTIFICATION_DEFAULTS.morning.messageType,
        },
        {
          user_id: user.id,
          label: NOTIFICATION_DEFAULTS.evening.label,
          time: NOTIFICATION_DEFAULTS.evening.time,
          message_type: NOTIFICATION_DEFAULTS.evening.messageType,
        },
      ]);
      if (insertError) {
        // デフォルトスケジュール作成失敗はトグル操作自体を妨げない
        console.error("Failed to create default notification schedules:", insertError.message);
      }
    }
  }

  revalidatePath("/profile/notifications");
  return { success: true, data };
}

export async function createNotificationSchedule(
  input: { label: string; time: string; message_type: string },
): Promise<ActionResult<{ id: string }>> {
  const parsed = createNotificationScheduleSchema.safeParse(input);
  if (!parsed.success) {
    return {
      success: false,
      error: ACTION_ERRORS.INVALID_INPUT,
      fieldErrors: extractFieldErrors(parsed.error),
    };
  }

  const { user, supabase } = await requireAuth();

  // スケジュール上限チェック。1ユーザーあたりのタイマー数を制限する
  const { count, error: countError } = await supabase
    .from("notification_schedules")
    .select("*", { count: "exact", head: true })
    .eq("user_id", user.id);

  if (countError) {
    return { success: false, error: ACTION_ERRORS.CREATE_FAILED("スケジュール") };
  }

  if ((count ?? 0) >= MAX_NOTIFICATION_SCHEDULES) {
    return {
      success: false,
      error: `スケジュールは${MAX_NOTIFICATION_SCHEDULES}件まで作成できます`,
    };
  }

  const { data, error } = await supabase
    .from("notification_schedules")
    .insert({
      user_id: user.id,
      label: parsed.data.label,
      time: parsed.data.time,
      message_type: parsed.data.message_type,
    })
    .select("id")
    .single();

  if (error) {
    return { success: false, error: ACTION_ERRORS.CREATE_FAILED("スケジュール") };
  }

  revalidatePath("/profile/notifications");
  return { success: true, data };
}

export async function updateNotificationSchedule(
  input: {
    id: string;
    label?: string;
    time?: string;
    message_type?: string;
    enabled?: boolean;
  },
): Promise<ActionResult<{ id: string }>> {
  const parsed = updateNotificationScheduleSchema.safeParse(input);
  if (!parsed.success) {
    return {
      success: false,
      error: ACTION_ERRORS.INVALID_INPUT,
      fieldErrors: extractFieldErrors(parsed.error),
    };
  }

  const { user, supabase } = await requireAuth();
  const { id, ...fields } = parsed.data;

  const { data, error } = await supabase
    .from("notification_schedules")
    .update(fields)
    .eq("id", id)
    .eq("user_id", user.id)
    .select("id")
    .single();

  if (error) {
    return { success: false, error: ACTION_ERRORS.UPDATE_FAILED("スケジュール") };
  }

  revalidatePath("/profile/notifications");
  return { success: true, data };
}

export async function deleteNotificationSchedule(
  input: { id: string },
): Promise<ActionResult<null>> {
  const parsed = deleteNotificationScheduleSchema.safeParse(input);
  if (!parsed.success) {
    return { success: false, error: ACTION_ERRORS.INVALID_INPUT };
  }

  const { user, supabase } = await requireAuth();

  const { error } = await supabase
    .from("notification_schedules")
    .delete()
    .eq("id", parsed.data.id)
    .eq("user_id", user.id);

  if (error) {
    return { success: false, error: ACTION_ERRORS.DELETE_FAILED("スケジュール") };
  }

  revalidatePath("/profile/notifications");
  return { success: true, data: null };
}

// 通知表示時に呼ばれるデータ取得アクション
// 注: get_due_materials RPC は SRS 手法のみ返す。通知では全手法の due カードを
// 対象にするため get_due_counts_by_subject RPC で DB 側集計する
// (従来 JS 側集計では PostgREST の 1000 行上限で static truncation する問題があった)

type DueTodayResult = { subjects: SubjectDueCount[] };
type ReviewAndPreviewResult = { sessionsToday: number; subjects: SubjectDueCount[] };

export async function getNotificationData(
  messageType: "due_today",
): Promise<ActionResult<DueTodayResult>>;
export async function getNotificationData(
  messageType: "review_and_preview",
): Promise<ActionResult<ReviewAndPreviewResult>>;
export async function getNotificationData(
  messageType: "due_today" | "review_and_preview",
): Promise<ActionResult<DueTodayResult | ReviewAndPreviewResult>> {
  const { user, supabase } = await requireAuth();
  const today = toJstDateString(new Date());

  async function getDueBySubject(targetDate: string): Promise<SubjectDueCount[]> {
    const { data, error } = await supabase.rpc("get_due_counts_by_subject", {
      p_user_id: user.id,
      p_target_date: targetDate,
    });

    if (error) throw new Error(`get_due_counts_by_subject failed: ${error.message}`);

    return (data ?? []).map((row: { subject_name: string; due_count: number }) => ({
      subject: row.subject_name,
      count: Number(row.due_count),
    }));
  }

  if (messageType === "due_today") {
    const subjects = await getDueBySubject(today);
    return { success: true as const, data: { subjects } };
  }

  // review_and_preview: 今日のセッション数 + 明日の due カード科目一覧
  const tomorrow = toJstDateString(addDays(new Date(), 1));

  const [sessionsResult, subjects] = await Promise.all([
    supabase
      .from("sessions")
      .select("id", { count: "exact", head: true })
      .eq("user_id", user.id)
      .eq("status", "completed")
      .gte("created_at", `${today}T00:00:00+09:00`)
      .lt("created_at", `${tomorrow}T00:00:00+09:00`),
    getDueBySubject(tomorrow),
  ]);

  return {
    success: true as const,
    data: {
      sessionsToday: sessionsResult.count ?? 0,
      subjects,
    },
  };
}
