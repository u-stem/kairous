import { describe, it, expect, vi } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";
import { MaterialNoteSection } from "@/components/material-note-section";

vi.mock("@/lib/actions/note", () => ({
  updateNoteStats: vi.fn(() =>
    Promise.resolve({ success: true, data: undefined }),
  ),
}));

vi.mock("sonner", () => ({
  toast: { success: vi.fn(), error: vi.fn() },
}));

const MATERIAL_ID = "12345678-1234-4abc-89ef-1234567890ab";

describe("MaterialNoteSection", () => {
  it("section_count / word_count を数値カードで表示する", () => {
    render(
      <MaterialNoteSection
        materialId={MATERIAL_ID}
        sectionCount={7}
        wordCount={3500}
        unitLabel="セクション"
      />,
    );

    expect(screen.getByTestId("note-section-count")).toHaveTextContent("7");
    expect(screen.getByTestId("note-word-count")).toHaveTextContent("3500");
    // 10000 語基準で 35% = 3500 / 10000
    expect(screen.getByTestId("note-word-percent")).toHaveTextContent("35%");
  });

  it("10000 語を超える word_count は 100% に clamp する", () => {
    render(
      <MaterialNoteSection
        materialId={MATERIAL_ID}
        sectionCount={0}
        wordCount={50000}
        unitLabel="セクション"
      />,
    );

    expect(screen.getByTestId("note-word-percent")).toHaveTextContent("100%");
  });

  it("負数の section_count 入力はクライアント側で拒否する", () => {
    render(
      <MaterialNoteSection
        materialId={MATERIAL_ID}
        sectionCount={3}
        wordCount={1000}
        unitLabel="章"
      />,
    );

    fireEvent.change(screen.getByTestId("note-section-input"), {
      target: { value: "-1" },
    });
    fireEvent.click(screen.getByTestId("note-update-button"));

    expect(screen.getByTestId("note-error")).toHaveTextContent("章数");
  });
});
