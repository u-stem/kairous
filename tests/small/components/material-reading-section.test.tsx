import { describe, it, expect, vi } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";
import { MaterialReadingSection } from "@/components/material-reading-section";

vi.mock("@/lib/actions/reading", () => ({
  updatePageProgress: vi.fn(() =>
    Promise.resolve({ success: true, data: undefined }),
  ),
}));

vi.mock("sonner", () => ({
  toast: { success: vi.fn(), error: vi.fn() },
}));

const MATERIAL_ID = "12345678-1234-4abc-89ef-1234567890ab";

describe("MaterialReadingSection", () => {
  it("totalPages が設定されているとき進捗バーと % を表示する", () => {
    render(
      <MaterialReadingSection
        materialId={MATERIAL_ID}
        completedUnits={100}
        totalPages={300}
        unitLabel="ページ"
      />,
    );

    expect(screen.getByTestId("reading-progress-label")).toHaveTextContent(
      "100 / 300 ページ",
    );
    expect(screen.getByTestId("reading-progress-percent")).toHaveTextContent("33%");
    expect(screen.getByRole("progressbar")).toBeDefined();
  });

  it("totalPages 未設定時は % を表示せずハイフンにする", () => {
    render(
      <MaterialReadingSection
        materialId={MATERIAL_ID}
        completedUnits={50}
        totalPages={undefined}
        unitLabel="ページ"
      />,
    );

    expect(screen.getByTestId("reading-progress-label")).toHaveTextContent(
      "50 / - ページ",
    );
    expect(screen.queryByTestId("reading-progress-percent")).toBeNull();
  });

  it("不正な入力 (負数) はクライアント側で拒否する", () => {
    render(
      <MaterialReadingSection
        materialId={MATERIAL_ID}
        completedUnits={10}
        totalPages={300}
        unitLabel="ページ"
      />,
    );

    fireEvent.change(screen.getByTestId("reading-pages-input"), {
      target: { value: "-5" },
    });
    fireEvent.submit(screen.getByTestId("reading-pages-input").closest("form")!);

    expect(screen.getByTestId("reading-error")).toHaveTextContent("0 以上");
  });

  it("totalPages 超過はクライアント側で拒否する", () => {
    render(
      <MaterialReadingSection
        materialId={MATERIAL_ID}
        completedUnits={10}
        totalPages={300}
        unitLabel="ページ"
      />,
    );

    fireEvent.change(screen.getByTestId("reading-pages-input"), {
      target: { value: "500" },
    });
    fireEvent.submit(screen.getByTestId("reading-pages-input").closest("form")!);

    expect(screen.getByTestId("reading-error")).toHaveTextContent("300");
  });
});
