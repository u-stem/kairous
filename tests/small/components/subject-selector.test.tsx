import { describe, it, expect, vi } from "vitest";
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { SubjectSelector } from "@/components/subject-selector";
import type { Subject } from "@/lib/types/materials";

const subjects: Subject[] = [
  {
    id: "subj-1",
    name: "数学",
    color: "#4f46e5",
    user_id: "user-1",
    display_order: 0,
    created_at: "2026-01-01T00:00:00Z",
  },
];

describe("SubjectSelector", () => {
  it("科目追加ボタンが表示される", () => {
    render(
      <SubjectSelector
        subjects={subjects}
        value=""
        onChange={() => {}}
        onCreateSubject={vi.fn()}
      />,
    );
    expect(screen.getByRole("button", { name: "科目を追加" })).toBeDefined();
  });

  it("追加ボタンをクリックするとダイアログが開く", async () => {
    render(
      <SubjectSelector
        subjects={subjects}
        value=""
        onChange={() => {}}
        onCreateSubject={vi.fn()}
      />,
    );

    await userEvent.click(screen.getByRole("button", { name: "科目を追加" }));

    await waitFor(() => {
      expect(screen.getByText("新しい科目を作成")).toBeDefined();
    });
  });

  it("科目名を入力して作成ボタンを押すと onCreateSubject が呼ばれる", async () => {
    const onCreateSubject = vi.fn().mockResolvedValue({ id: "subj-new", name: "英語" });
    const onChange = vi.fn();

    render(
      <SubjectSelector
        subjects={subjects}
        value=""
        onChange={onChange}
        onCreateSubject={onCreateSubject}
      />,
    );

    await userEvent.click(screen.getByRole("button", { name: "科目を追加" }));
    await waitFor(() => screen.getByLabelText("科目名"));

    await userEvent.type(screen.getByLabelText("科目名"), "英語");
    await userEvent.click(screen.getByRole("button", { name: "作成" }));

    await waitFor(() => {
      expect(onCreateSubject).toHaveBeenCalledWith("英語");
    });
  });

  it("作成後に onChange が新しい ID で呼ばれる", async () => {
    const onCreateSubject = vi.fn().mockResolvedValue({ id: "subj-new", name: "英語" });
    const onChange = vi.fn();

    render(
      <SubjectSelector
        subjects={subjects}
        value=""
        onChange={onChange}
        onCreateSubject={onCreateSubject}
      />,
    );

    await userEvent.click(screen.getByRole("button", { name: "科目を追加" }));
    await waitFor(() => screen.getByLabelText("科目名"));

    await userEvent.type(screen.getByLabelText("科目名"), "英語");
    await userEvent.click(screen.getByRole("button", { name: "作成" }));

    await waitFor(() => {
      expect(onChange).toHaveBeenCalledWith("subj-new");
    });
  });
});
