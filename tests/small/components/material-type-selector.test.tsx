import { describe, it, expect, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { MaterialTypeSelector } from "@/components/material-type-selector";
import { MATERIAL_TYPES, MATERIAL_TYPE_LABELS } from "@/lib/constants";

describe("MaterialTypeSelector", () => {
  it("5 タイプのカードをすべてレンダリングする", () => {
    render(<MaterialTypeSelector value="flashcard" onChange={() => {}} />);

    for (const type of MATERIAL_TYPES) {
      const { label } = MATERIAL_TYPE_LABELS[type];
      expect(screen.getByText(label)).toBeDefined();
    }
  });

  it("初期値のタイプが aria-checked=true になっている", () => {
    render(<MaterialTypeSelector value="reading" onChange={() => {}} />);

    const readingOption = screen.getByTestId("material-type-option-reading");
    expect(readingOption.getAttribute("aria-checked")).toBe("true");
    // 他のタイプは false
    const flashcardOption = screen.getByTestId("material-type-option-flashcard");
    expect(flashcardOption.getAttribute("aria-checked")).toBe("false");
  });

  it("カードをクリックすると onChange が正しいタイプで発火する", async () => {
    const user = userEvent.setup();
    const onChange = vi.fn();
    render(<MaterialTypeSelector value="flashcard" onChange={onChange} />);

    await user.click(screen.getByTestId("material-type-option-note"));

    expect(onChange).toHaveBeenCalledOnce();
    expect(onChange).toHaveBeenCalledWith("note");
  });

  it("Enter キーで onChange が発火する", async () => {
    const user = userEvent.setup();
    const onChange = vi.fn();
    render(<MaterialTypeSelector value="flashcard" onChange={onChange} />);

    const practiceOption = screen.getByTestId("material-type-option-practice_log");
    practiceOption.focus();
    await user.keyboard("{Enter}");

    expect(onChange).toHaveBeenCalledWith("practice_log");
  });

  it("Space キーで onChange が発火する", async () => {
    const user = userEvent.setup();
    const onChange = vi.fn();
    render(<MaterialTypeSelector value="flashcard" onChange={onChange} />);

    const projectOption = screen.getByTestId("material-type-option-project");
    projectOption.focus();
    await user.keyboard(" ");

    expect(onChange).toHaveBeenCalledWith("project");
  });
});
