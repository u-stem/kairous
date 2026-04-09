import type { NotificationMessageType } from "@/lib/constants";

export type NotificationSchedule = {
  id: string;
  label: string;
  time: string;
  message_type: NotificationMessageType;
  enabled: boolean;
};
