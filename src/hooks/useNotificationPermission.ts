"use client";

import { useState, useCallback, useSyncExternalStore } from "react";

type PermissionState = NotificationPermission | "not-supported";

function getServerSnapshot(): PermissionState {
  return "not-supported";
}

function getSnapshot(): PermissionState {
  if (typeof Notification === "undefined") return "not-supported";
  return Notification.permission;
}

function subscribe(callback: () => void): () => void {
  // Notification API にはイベントリスナーがないため、
  // requestPermission 後に手動で更新する
  return () => {};
}

export function useNotificationPermission() {
  const browserPermission = useSyncExternalStore(
    subscribe,
    getSnapshot,
    getServerSnapshot,
  );

  const [permission, setPermission] = useState<PermissionState>(browserPermission);
  const isSupported = typeof Notification !== "undefined";

  const requestPermission = useCallback(async (): Promise<NotificationPermission | null> => {
    if (!isSupported) return null;

    const result = await Notification.requestPermission();
    setPermission(result);
    return result;
  }, [isSupported]);

  return {
    permission,
    isSupported,
    isGranted: permission === "granted",
    isDenied: permission === "denied",
    requestPermission,
  };
}
