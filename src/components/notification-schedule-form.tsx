"use client";

import { useState, useTransition } from "react";
import {
  createNotificationSchedule,
  updateNotificationSchedule,
} from "@/lib/actions/notifications";
import { NOTIFICATION_MESSAGE_TYPES } from "@/lib/constants";

type Schedule = {
  id: string;
  label: string;
  time: string;
  message_type: string;
  enabled: boolean;
};

// DB の enum 値をユーザー向けラベルに変換する。constants に入れるほどではないのでローカル定義
const MESSAGE_TYPE_LABELS: Record<string, string> = {
  due_today: "今日の due カード",
  review_and_preview: "振り返り + 明日の予告",
};

export function NotificationScheduleForm(props: {
  schedule?: Schedule;
  onSaved?: () => void;
  onCancel?: () => void;
}) {
  const isEdit = !!props.schedule;
  const [label, setLabel] = useState(props.schedule?.label ?? "");
  const [time, setTime] = useState(props.schedule?.time?.slice(0, 5) ?? "08:00");
  const [messageType, setMessageType] = useState(
    props.schedule?.message_type ?? "due_today",
  );
  const [error, setError] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();

  const handleSubmit = (e: React.SyntheticEvent<HTMLFormElement>) => {
    e.preventDefault();
    setError(null);

    startTransition(async () => {
      const result = isEdit
        ? await updateNotificationSchedule({
            id: props.schedule!.id,
            label,
            time,
            message_type: messageType,
          })
        : await createNotificationSchedule({
            label,
            time,
            message_type: messageType,
          });

      if (result.success) {
        props.onSaved?.();
      } else {
        setError(result.error);
      }
    });
  };

  return (
    <form onSubmit={handleSubmit} className="space-y-4" data-testid="schedule-form">
      <div>
        <label htmlFor="schedule-label" className="block text-sm font-medium">
          ラベル
        </label>
        <input
          id="schedule-label"
          type="text"
          value={label}
          onChange={(e) => setLabel(e.target.value)}
          className="mt-1 w-full rounded-md border bg-background px-3 py-2 text-sm"
          data-testid="schedule-label-input"
        />
      </div>
      <div>
        <label htmlFor="schedule-time" className="block text-sm font-medium">
          時刻
        </label>
        <input
          id="schedule-time"
          type="time"
          value={time}
          onChange={(e) => setTime(e.target.value)}
          className="mt-1 w-full rounded-md border bg-background px-3 py-2 text-sm"
          data-testid="schedule-time-input"
        />
      </div>
      <div>
        <label htmlFor="schedule-type" className="block text-sm font-medium">
          通知タイプ
        </label>
        <select
          id="schedule-type"
          value={messageType}
          onChange={(e) => setMessageType(e.target.value)}
          className="mt-1 w-full rounded-md border bg-background px-3 py-2 text-sm"
          data-testid="schedule-type-select"
        >
          {NOTIFICATION_MESSAGE_TYPES.map((type) => (
            <option key={type} value={type}>
              {MESSAGE_TYPE_LABELS[type]}
            </option>
          ))}
        </select>
      </div>
      {error && (
        <p className="text-sm text-destructive" role="alert">
          {error}
        </p>
      )}
      <div className="flex gap-2">
        <button
          type="submit"
          disabled={isPending}
          className="rounded-md bg-primary px-4 py-2 text-sm text-primary-foreground"
          data-testid="schedule-save-button"
        >
          {isPending ? "保存中..." : isEdit ? "更新" : "追加"}
        </button>
        {props.onCancel && (
          <button
            type="button"
            onClick={props.onCancel}
            className="rounded-md border px-4 py-2 text-sm"
          >
            キャンセル
          </button>
        )}
      </div>
    </form>
  );
}
