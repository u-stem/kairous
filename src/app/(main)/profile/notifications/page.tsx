import {
  getNotificationSchedules,
  getNotificationEnabled,
} from "@/lib/actions/notifications";
import { NotificationToggle } from "@/components/notification-toggle";
import { NotificationScheduleList } from "@/components/notification-schedule-list";
import { NotificationScheduleForm } from "@/components/notification-schedule-form";
import { MAX_NOTIFICATION_SCHEDULES } from "@/lib/constants";
import Link from "next/link";

export default async function NotificationsPage() {
  const [enabledResult, schedulesResult] = await Promise.all([
    getNotificationEnabled(),
    getNotificationSchedules(),
  ]);

  const notificationEnabled =
    enabledResult.success ? enabledResult.data.notification_enabled : false;
  const schedules = schedulesResult.success ? schedulesResult.data : [];

  return (
    <div className="p-4">
      <div className="mb-4">
        <Link
          href="/profile"
          className="text-sm text-muted-foreground hover:text-foreground"
          data-testid="back-to-profile"
        >
          ← 設定
        </Link>
      </div>
      <h2 className="text-lg font-bold">通知設定</h2>

      <div className="mt-6 space-y-6">
        <NotificationToggle initialEnabled={notificationEnabled} />

        {notificationEnabled && (
          <>
            <div>
              <h3 className="mb-2 text-sm font-medium text-muted-foreground uppercase tracking-wide">
                スケジュール
              </h3>
              <NotificationScheduleList schedules={schedules} />
            </div>

            {schedules.length < MAX_NOTIFICATION_SCHEDULES && (
              <NotificationScheduleForm />
            )}
          </>
        )}
      </div>
    </div>
  );
}
