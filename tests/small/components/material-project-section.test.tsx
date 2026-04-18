import { describe, it, expect, vi } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";
import { MaterialProjectSection } from "@/components/material-project-section";

vi.mock("@/lib/actions/project", () => ({
  addMilestone: vi.fn(() =>
    Promise.resolve({ success: true, data: undefined }),
  ),
  toggleMilestone: vi.fn(() =>
    Promise.resolve({ success: true, data: undefined }),
  ),
  deleteMilestone: vi.fn(() =>
    Promise.resolve({ success: true, data: undefined }),
  ),
}));

vi.mock("sonner", () => ({
  toast: { success: vi.fn(), error: vi.fn() },
}));

const MATERIAL_ID = "12345678-1234-4abc-89ef-1234567890ab";

describe("MaterialProjectSection", () => {
  it("マイルストーン 0 件時は空メッセージを表示する", () => {
    render(
      <MaterialProjectSection
        materialId={MATERIAL_ID}
        milestones={[]}
        unitLabel="マイルストーン"
      />,
    );

    expect(screen.getByTestId("project-section")).toBeDefined();
    expect(screen.getByText("まだマイルストーンがありません")).toBeDefined();
  });

  it("done / total の進捗率を表示する", () => {
    render(
      <MaterialProjectSection
        materialId={MATERIAL_ID}
        milestones={[
          { name: "a", done: true },
          { name: "b", done: true },
          { name: "c", done: false },
          { name: "d", done: false },
        ]}
        unitLabel="マイルストーン"
      />,
    );

    // 2 / 4 = 50%
    expect(screen.getByTestId("project-percent")).toHaveTextContent("50%");
  });

  it("deadline が設定されていると締切を表示する", () => {
    render(
      <MaterialProjectSection
        materialId={MATERIAL_ID}
        milestones={[]}
        deadline="2026-05-01"
        unitLabel="マイルストーン"
      />,
    );

    expect(screen.getByTestId("project-deadline")).toHaveTextContent("2026/5/1");
  });

  it("空のマイルストーン名で追加を試みると拒否する", () => {
    render(
      <MaterialProjectSection
        materialId={MATERIAL_ID}
        milestones={[]}
        unitLabel="マイルストーン"
      />,
    );

    fireEvent.click(screen.getByTestId("project-add-button"));

    expect(screen.getByTestId("project-error")).toHaveTextContent(
      "マイルストーン名を入力してください",
    );
  });
});
