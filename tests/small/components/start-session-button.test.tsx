import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";

// next/navigation をモック
vi.mock("next/navigation", () => ({
  useRouter: vi.fn(() => ({
    push: vi.fn(),
  })),
}));

const createSessionMock = vi.fn();
vi.mock("@/lib/actions/sessions", () => ({
  createSession: (...args: unknown[]) => createSessionMock(...args) as unknown,
}));

import { StartSessionButton } from "@/components/start-session-button";

describe("StartSessionButton (S14)", () => {
  beforeEach(() => {
    createSessionMock.mockReset();
  });

  it("displays error message when createSession fails", async () => {
    createSessionMock.mockResolvedValue({
      success: false,
      error: "セッションの作成に失敗しました",
    });

    render(<StartSessionButton materialId="mat-1" methodId="method-1" />);

    await userEvent.click(screen.getByRole("button"));

    await waitFor(() => {
      expect(screen.getByText("セッションの作成に失敗しました")).toBeDefined();
    });
  });

  it("clears error on next attempt", async () => {
    createSessionMock
      .mockResolvedValueOnce({ success: false, error: "エラー" })
      .mockResolvedValueOnce({ success: true, data: { id: "s-1" } });

    render(<StartSessionButton materialId="mat-1" methodId="method-1" />);

    await userEvent.click(screen.getByRole("button"));
    await waitFor(() => {
      expect(screen.getByText("エラー")).toBeDefined();
    });

    await userEvent.click(screen.getByRole("button"));
    await waitFor(() => {
      expect(screen.queryByText("エラー")).toBeNull();
    });
  });
});
