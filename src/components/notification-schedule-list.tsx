"use client";

import { useState, useTransition } from "react";
import {
  updateNotificationSchedule,
  deleteNotificationSchedule,
} from "@/lib/actions/notifications";
import { NotificationScheduleForm } from "./notification-schedule-form";

type Schedule = {
  id: string;
  label: string;
  time: string;
  message_type: string;
  enabled: boolean;
};

export function NotificationScheduleList(props: {
  schedules: Schedule[];
}) {
  const [editingId, setEditingId] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();

  const handleToggle = (schedule: Schedule) => {
    startTransition(async () => {
      await updateNotificationSchedule({
        id: schedule.id,
        enabled: !schedule.enabled,
      });
    });
  };

  const handleDelete = (id: string) => {
    startTransition(async () => {
      await deleteNotificationSchedule({ id });
    });
  };

  if (props.schedules.length === 0) {
    return (
      <p className="text-sm text-muted-foreground" data-testid="no-schedules">
        スケジュールがありません
      </p>
    );
  }

  return (
    <ul className="space-y-2" data-testid="schedule-list">
      {props.schedules.map((schedule) => (
        <li
          key={schedule.id}
          className="rounded-lg border p-4"
          data-testid={`schedule-item-${schedule.id}`}
        >
          {editingId === schedule.id ? (
            <NotificationScheduleForm
              schedule={schedule}
              onSaved={() => setEditingId(null)}
              onCancel={() => setEditingId(null)}
            />
          ) : (
            <div className="flex items-center justify-between">
              <div>
                <p className="font-medium">{schedule.label}</p>
                <p className="text-sm text-muted-foreground">
                  {schedule.time.slice(0, 5)}
                </p>
              </div>
              <div className="flex items-center gap-2">
                <button
                  type="button"
                  role="switch"
                  aria-checked={schedule.enabled}
                  aria-label={`${schedule.label}の通知を${schedule.enabled ? "オフ" : "オン"}にする`}
                  disabled={isPending}
                  onClick={() => handleToggle(schedule)}
                  data-testid={`schedule-toggle-${schedule.id}`}
                  className={`relative inline-flex h-5 w-9 items-center rounded-full transition-colors ${
                    schedule.enabled ? "bg-primary" : "bg-muted"
                  }`}
                >
                  <span
                    className={`inline-block h-3 w-3 rounded-full bg-background transition-transform ${
                      schedule.enabled ? "translate-x-5" : "translate-x-1"
                    }`}
                  />
                </button>
                <button
                  type="button"
                  onClick={() => setEditingId(schedule.id)}
                  className="text-sm text-muted-foreground hover:text-foreground"
                  data-testid={`schedule-edit-${schedule.id}`}
                >
                  編集
                </button>
                <button
                  type="button"
                  onClick={() => handleDelete(schedule.id)}
                  disabled={isPending}
                  className="text-sm text-destructive hover:text-destructive/80"
                  data-testid={`schedule-delete-${schedule.id}`}
                >
                  削除
                </button>
              </div>
            </div>
          )}
        </li>
      ))}
    </ul>
  );
}
