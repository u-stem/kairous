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
  // requestPermission 後に再レンダリングをトリガーするためのカウンター
  const [, setTick] = useState(0);

  const permission = useSyncExternalStore(
    subscribe,
    getSnapshot,
    getServerSnapshot,
  );

  const isSupported = typeof Notification !== "undefined";

  const requestPermission = useCallback(async (): Promise<NotificationPermission | null> => {
    if (!isSupported) return null;

    const result = await Notification.requestPermission();
    // useSyncExternalStore の subscribe は no-op のため、手動で再レンダリングを発火
    setTick((t) => t + 1);
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
