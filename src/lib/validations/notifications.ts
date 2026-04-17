import { z } from "zod";
import { NOTIFICATION_MESSAGE_TYPES } from "@/lib/constants";

const timeRegex = /^([01]\d|2[0-3]):[0-5]\d$/;

export const createNotificationScheduleSchema = z.object({
  label: z
    .string()
    .min(1, "ラベルを入力してください")
    .max(100, "ラベルは100文字以内で入力してください"),
  time: z
    .string()
    .regex(timeRegex, "時刻は HH:MM 形式で入力してください"),
  message_type: z.enum(NOTIFICATION_MESSAGE_TYPES, {
    message: "有効な通知タイプを選択してください",
  }),
});

export const updateNotificationScheduleSchema = z.object({
  id: z.uuid("有効なスケジュールIDが必要です"),
  label: z
    .string()
    .min(1, "ラベルを入力してください")
    .max(100, "ラベルは100文字以内で入力してください")
    .optional(),
  time: z
    .string()
    .regex(timeRegex, "時刻は HH:MM 形式で入力してください")
    .optional(),
  message_type: z.enum(NOTIFICATION_MESSAGE_TYPES, {
    message: "有効な通知タイプを選択してください",
  }).optional(),
  enabled: z.boolean().optional(),
});

export const deleteNotificationScheduleSchema = z.object({
  id: z.uuid("有効なスケジュールIDが必要です"),
});
