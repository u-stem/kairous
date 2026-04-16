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

  it("ArrowDown キーで次のタイプに onChange が発火する", async () => {
    const user = userEvent.setup();
    const onChange = vi.fn();
    // flashcard (index 0) が選択された状態でArrowDown → reading (index 1)
    render(<MaterialTypeSelector value="flashcard" onChange={onChange} />);

    const flashcardOption = screen.getByTestId("material-type-option-flashcard");
    flashcardOption.focus();
    await user.keyboard("{ArrowDown}");

    expect(onChange).toHaveBeenCalledWith("reading");
  });

  it("ArrowRight キーで次のタイプに onChange が発火する", async () => {
    const user = userEvent.setup();
    const onChange = vi.fn();
    render(<MaterialTypeSelector value="reading" onChange={onChange} />);

    const readingOption = screen.getByTestId("material-type-option-reading");
    readingOption.focus();
    await user.keyboard("{ArrowRight}");

    expect(onChange).toHaveBeenCalledWith("project");
  });

  it("ArrowUp キーで前のタイプに onChange が発火する", async () => {
    const user = userEvent.setup();
    const onChange = vi.fn();
    render(<MaterialTypeSelector value="reading" onChange={onChange} />);

    const readingOption = screen.getByTestId("material-type-option-reading");
    readingOption.focus();
    await user.keyboard("{ArrowUp}");

    expect(onChange).toHaveBeenCalledWith("flashcard");
  });

  it("ArrowLeft キーで前のタイプに onChange が発火する", async () => {
    const user = userEvent.setup();
    const onChange = vi.fn();
    render(<MaterialTypeSelector value="project" onChange={onChange} />);

    const projectOption = screen.getByTestId("material-type-option-project");
    projectOption.focus();
    await user.keyboard("{ArrowLeft}");

    expect(onChange).toHaveBeenCalledWith("reading");
  });

  it("最後のタイプで ArrowDown を押すと最初のタイプに循環する", async () => {
    const user = userEvent.setup();
    const onChange = vi.fn();
    // note は MATERIAL_TYPES の最後
    render(<MaterialTypeSelector value="note" onChange={onChange} />);

    const noteOption = screen.getByTestId("material-type-option-note");
    noteOption.focus();
    await user.keyboard("{ArrowDown}");

    expect(onChange).toHaveBeenCalledWith("flashcard");
  });

  it("最初のタイプで ArrowUp を押すと最後のタイプに循環する", async () => {
    const user = userEvent.setup();
    const onChange = vi.fn();
    render(<MaterialTypeSelector value="flashcard" onChange={onChange} />);

    const flashcardOption = screen.getByTestId("material-type-option-flashcard");
    flashcardOption.focus();
    await user.keyboard("{ArrowUp}");

    expect(onChange).toHaveBeenCalledWith("note");
  });
});
