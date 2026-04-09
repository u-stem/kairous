"use client";

import { useState, useTransition } from "react";
import { useNotificationPermission } from "@/hooks/useNotificationPermission";
import { toggleNotificationEnabled } from "@/lib/actions/notifications";

export function NotificationToggle(props: {
  initialEnabled: boolean;
  onToggle?: (enabled: boolean) => void;
}) {
  const [enabled, setEnabled] = useState(props.initialEnabled);
  const [isPending, startTransition] = useTransition();
  const { isSupported, isDenied, requestPermission } = useNotificationPermission();

  const handleToggle = async () => {
    const newValue = !enabled;

    // オンにしようとしているのにブラウザの権限が拒否されていない場合は許可を要求する
    if (newValue && !isDenied) {
      const result = await requestPermission();
      if (result === "denied") return;
    }

    setEnabled(newValue);
    startTransition(async () => {
      const result = await toggleNotificationEnabled(newValue);
      if (!result.success) {
        setEnabled(!newValue); // 保存失敗時は元の状態にロールバック
      } else {
        props.onToggle?.(newValue);
      }
    });
  };

  if (!isSupported) {
    return (
      <p className="text-sm text-muted-foreground">
        このブラウザは通知に対応していません
      </p>
    );
  }

  return (
    <div className="flex items-center justify-between">
      <div>
        <p className="font-medium">通知</p>
        {isDenied && (
          <p className="text-xs text-muted-foreground">
            ブラウザの設定から通知を許可してください
          </p>
        )}
      </div>
      <button
        type="button"
        role="switch"
        aria-checked={enabled}
        disabled={isPending || isDenied}
        onClick={() => { void handleToggle(); }}
        data-testid="notification-master-toggle"
        className={`relative inline-flex h-6 w-11 items-center rounded-full transition-colors ${
          enabled ? "bg-primary" : "bg-muted"
        } ${isPending || isDenied ? "opacity-50 cursor-not-allowed" : "cursor-pointer"}`}
      >
        <span
          className={`inline-block h-4 w-4 rounded-full bg-background transition-transform ${
            enabled ? "translate-x-6" : "translate-x-1"
          }`}
        />
      </button>
    </div>
  );
}
