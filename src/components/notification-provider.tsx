"use client";

import { useCallback } from "react";
import { useNotificationScheduler } from "@/hooks/useNotificationScheduler";
import { useNotificationPermission } from "@/hooks/useNotificationPermission";
import { getNotificationData } from "@/lib/actions/notifications";
import {
  buildDueTodayMessage,
  buildReviewAndPreviewMessage,
} from "@/lib/utils/notification-messages";
import type { NotificationMessageType } from "@/lib/constants";

type Schedule = {
  id: string;
  enabled: boolean;
  time: string;
  message_type: NotificationMessageType;
  label: string;
};

export function NotificationProvider(props: {
  schedules: Schedule[];
  enabled: boolean;
}) {
  const { isGranted } = useNotificationPermission();

  const handleFire = useCallback(
    async (schedule: Schedule) => {
      if (!isGranted) return;

      const result = await getNotificationData(schedule.message_type);
      if (!result.success) return;

      let message;
      if (schedule.message_type === "due_today") {
        message = buildDueTodayMessage(result.data.subjects);
      } else {
        message = buildReviewAndPreviewMessage({
          // sessionsToday は due_today タイプでは存在しないので fallback を設定する
          sessionsToday: result.data.sessionsToday ?? 0,
          dueTomorrow: result.data.subjects,
        });
      }

      // tag に schedule.id を設定して、同じスケジュールの重複通知を OS レベルで抑制する
      new Notification(message.title, {
        body: message.body,
        tag: schedule.id,
      });
    },
    [isGranted],
  );

  useNotificationScheduler({
    schedules: props.schedules,
    enabled: props.enabled && isGranted,
    // async の handleFire を void を返すラッパーで包んで型を合わせる
    onFire: (schedule) => { void handleFire(schedule); },
  });

  return null; // UI を持たないプロバイダー
}
