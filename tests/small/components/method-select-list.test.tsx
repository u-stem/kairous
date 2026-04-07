import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";

vi.mock("next/navigation", () => ({
  useRouter: vi.fn(() => ({
    push: vi.fn(),
  })),
}));

const createSessionMock = vi.fn();
vi.mock("@/lib/actions/session-commands", () => ({
  createSession: (...args: unknown[]) => createSessionMock(...args) as unknown,
}));

import { useRouter } from "next/navigation";
import { MethodSelectList } from "@/components/method-select-list";
import type { MethodItem } from "@/lib/types/materials";

const methods: MethodItem[] = [
  { id: "m-1", slug: "srs", name: "SRS" },
  { id: "m-2", slug: "pomodoro", name: "ポモドーロ" },
];

describe("MethodSelectList", () => {
  beforeEach(() => {
    createSessionMock.mockReset();
  });

  it("すべての手法ボタンを表示する", () => {
    render(<MethodSelectList materialId="mat-1" methods={methods} />);
    expect(screen.getByText("SRS")).toBeDefined();
    expect(screen.getByText("ポモドーロ")).toBeDefined();
  });

  it("dueCount が 0 より大きい場合にバッジを表示する", () => {
    render(
      <MethodSelectList
        materialId="mat-1"
        methods={methods}
        dueCounts={{ "m-1": 7, "m-2": 0 }}
      />,
    );
    expect(screen.getByText("7枚")).toBeDefined();
    expect(screen.queryByText("0枚")).toBeNull();
  });

  it("手法を選択すると /session/:id へ遷移する", async () => {
    const pushMock = vi.fn();
    vi.mocked(useRouter).mockReturnValue({ push: pushMock } as unknown as ReturnType<typeof useRouter>);
    createSessionMock.mockResolvedValue({ success: true, data: { id: "s-10" } });

    render(<MethodSelectList materialId="mat-1" methods={methods} />);
    await userEvent.click(screen.getByText("SRS").closest("button")!);

    await waitFor(() => {
      expect(pushMock).toHaveBeenCalledWith("/session/s-10");
    });
  });

  it("失敗時にエラーメッセージを表示する", async () => {
    createSessionMock.mockResolvedValue({
      success: false,
      error: "セッションの作成に失敗しました",
    });

    render(<MethodSelectList materialId="mat-1" methods={methods} />);
    await userEvent.click(screen.getByText("SRS").closest("button")!);

    await waitFor(() => {
      expect(screen.getByText("セッションの作成に失敗しました")).toBeDefined();
    });
  });
});
