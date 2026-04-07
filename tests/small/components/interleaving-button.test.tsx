import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";

vi.mock("next/navigation", () => ({
  useRouter: vi.fn(() => ({
    push: vi.fn(),
  })),
}));

const createInterleavingSessionMock = vi.fn();
vi.mock("@/lib/actions/sessions", () => ({
  createInterleavingSession: (...args: unknown[]) =>
    createInterleavingSessionMock(...args) as unknown,
}));

import { useRouter } from "next/navigation";
import { InterleavingButton } from "@/components/interleaving-button";

describe("InterleavingButton", () => {
  beforeEach(() => {
    createInterleavingSessionMock.mockReset();
  });

  it("ボタンが表示される", () => {
    createInterleavingSessionMock.mockResolvedValue({ success: true, data: { id: "s-1" } });
    render(<InterleavingButton materialIds={["m-1", "m-2"]} />);
    expect(screen.getByRole("button", { name: "まとめて学習" })).toBeDefined();
  });

  it("成功時に /session/:id へ遷移する", async () => {
    const pushMock = vi.fn();
    vi.mocked(useRouter).mockReturnValue({ push: pushMock } as unknown as ReturnType<typeof useRouter>);
    createInterleavingSessionMock.mockResolvedValue({ success: true, data: { id: "s-42" } });

    render(<InterleavingButton materialIds={["m-1", "m-2"]} />);
    await userEvent.click(screen.getByRole("button"));

    await waitFor(() => {
      expect(pushMock).toHaveBeenCalledWith("/session/s-42");
    });
  });

  it("失敗時にエラーメッセージを表示する", async () => {
    createInterleavingSessionMock.mockResolvedValue({
      success: false,
      error: "インターリービングセッションの作成に失敗しました",
    });

    render(<InterleavingButton materialIds={["m-1", "m-2"]} />);
    await userEvent.click(screen.getByRole("button"));

    await waitFor(() => {
      expect(
        screen.getByText("インターリービングセッションの作成に失敗しました"),
      ).toBeDefined();
    });
  });
});
