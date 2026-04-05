import { describe, it, expect, vi } from "vitest";
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { CardEditor } from "@/components/card-editor";

describe("CardEditor", () => {
  it("表面と裏面の入力欄を表示する", () => {
    render(<CardEditor onSubmit={() => {}} />);
    expect(screen.getByLabelText("表面")).toBeDefined();
    expect(screen.getByLabelText("裏面")).toBeDefined();
  });

  it("空のまま送信するとバリデーションエラーを表示する", async () => {
    const user = userEvent.setup();
    render(<CardEditor onSubmit={() => {}} />);

    await user.click(screen.getByRole("button", { name: "追加" }));

    await waitFor(() => {
      expect(screen.getByText("表面のテキストを入力してください")).toBeDefined();
      expect(screen.getByText("裏面のテキストを入力してください")).toBeDefined();
    });
  });

  it("有効なデータを入力して送信すると onSubmit を呼ぶ", async () => {
    const user = userEvent.setup();
    const onSubmit = vi.fn();
    render(<CardEditor onSubmit={onSubmit} />);

    await user.type(screen.getByLabelText("表面"), "質問");
    await user.type(screen.getByLabelText("裏面"), "回答");
    await user.click(screen.getByRole("button", { name: "追加" }));

    await waitFor(() => {
      expect(onSubmit).toHaveBeenCalledWith({ front: "質問", back: "回答" });
    });
  });

  it("defaultValues を渡すと入力欄にデフォルト値が表示される", () => {
    render(
      <CardEditor
        defaultValues={{ front: "既存の表面", back: "既存の裏面" }}
        onSubmit={() => {}}
        submitLabel="更新"
      />
    );
    expect(screen.getByLabelText<HTMLInputElement>("表面").value).toBe("既存の表面");
    expect(screen.getByLabelText<HTMLTextAreaElement>("裏面").value).toBe("既存の裏面");
    expect(screen.getByRole("button", { name: "更新" })).toBeDefined();
  });
});
