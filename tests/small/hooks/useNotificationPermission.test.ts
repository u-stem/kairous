import { describe, it, expect, vi, beforeEach } from "vitest";
import { renderHook, act } from "@testing-library/react";
import { useNotificationPermission } from "@/hooks/useNotificationPermission";

// Notification API mock
const mockRequestPermission = vi.fn();

beforeEach(() => {
  vi.stubGlobal("Notification", {
    permission: "default",
    requestPermission: mockRequestPermission,
  });
  mockRequestPermission.mockReset();
});

describe("useNotificationPermission", () => {
  it("returns current permission state", () => {
    const { result } = renderHook(() => useNotificationPermission());
    expect(result.current.permission).toBe("default");
  });

  it("returns granted when Notification.permission is granted", () => {
    vi.stubGlobal("Notification", {
      permission: "granted",
      requestPermission: mockRequestPermission,
    });

    const { result } = renderHook(() => useNotificationPermission());
    expect(result.current.permission).toBe("granted");
  });

  it("requests permission and updates state on grant", async () => {
    // requestPermission resolve 時に Notification.permission も更新し、
    // getSnapshot が新しい値を返せるようにする
    mockRequestPermission.mockImplementation(() => {
      vi.stubGlobal("Notification", {
        permission: "granted",
        requestPermission: mockRequestPermission,
      });
      return Promise.resolve("granted");
    });

    const { result } = renderHook(() => useNotificationPermission());

    await act(async () => {
      await result.current.requestPermission();
    });

    expect(mockRequestPermission).toHaveBeenCalledOnce();
    expect(result.current.permission).toBe("granted");
  });

  it("requests permission and updates state on deny", async () => {
    // requestPermission resolve 時に Notification.permission も更新する
    mockRequestPermission.mockImplementation(() => {
      vi.stubGlobal("Notification", {
        permission: "denied",
        requestPermission: mockRequestPermission,
      });
      return Promise.resolve("denied");
    });

    const { result } = renderHook(() => useNotificationPermission());

    await act(async () => {
      await result.current.requestPermission();
    });

    expect(result.current.permission).toBe("denied");
  });

  it("returns not-supported when Notification is undefined", () => {
    vi.stubGlobal("Notification", undefined);

    const { result } = renderHook(() => useNotificationPermission());
    expect(result.current.isSupported).toBe(false);
  });
});
