"use client";

import { useCallback } from "react";
import { useNotificationScheduler } from "@/hooks/useNotificationScheduler";
import { useNotificationPermission } from "@/hooks/useNotificationPermission";
import { getNotificationData } from "@/lib/actions/notifications";
import {
  buildDueTodayMessage,
  buildReviewAndPreviewMessage,
} from "@/lib/utils/notification-messages";
import type { NotificationSchedule } from "@/lib/types/notification";

export function NotificationProvider(props: {
  schedules: NotificationSchedule[];
  enabled: boolean;
}) {
  const { isGranted } = useNotificationPermission();

  const handleFire = useCallback(
    async (schedule: NotificationSchedule) => {
      if (!isGranted) return;

      // オーバーロードの型推論を効かせるため、message_type で分岐してから呼び出す
      let message;
      if (schedule.message_type === "due_today") {
        const result = await getNotificationData("due_today");
        if (!result.success) return;
        message = buildDueTodayMessage(result.data.categories);
      } else {
        const result = await getNotificationData("review_and_preview");
        if (!result.success) return;
        message = buildReviewAndPreviewMessage({
          sessionsToday: result.data.sessionsToday,
          dueTomorrow: result.data.categories,
        });
      }

      // tag に schedule.id を設定して、同じスケジュールの重複通知を OS レベルで抑制する
      const notification = new Notification(message.title, {
        body: message.body,
        tag: schedule.id,
      });
      // 通知タップで Today ページに遷移させ、ユーザーを学習開始へ導く
      notification.onclick = () => {
        window.focus();
        window.location.href = "/";
      };
    },
    [isGranted],
  );

  useNotificationScheduler({
    schedules: props.schedules,
    enabled: props.enabled && isGranted,
    // async の handleFire を void 型に合わせる
    onFire: (schedule: NotificationSchedule) => { void handleFire(schedule); },
  });

  return null; // UI を持たないプロバイダー
}
