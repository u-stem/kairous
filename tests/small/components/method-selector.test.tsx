import { describe, it, expect, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { MethodSelector } from "@/components/method-selector";

const methods = [
  { id: "1", slug: "srs", name: "SRS", category: "memory" },
  { id: "2", slug: "active_recall", name: "アクティブリコール", category: "memory" },
  { id: "3", slug: "elaboration", name: "精緻化", category: "comprehension" },
  { id: "4", slug: "pomodoro", name: "ポモドーロ", category: "focus" },
  // MATERIAL_METHOD_SLUGS 外のメソッドはフィルタされる
  { id: "5", slug: "wakeful_rest", name: "ウェイクフルレスト", category: "consolidation" },
];

describe("MethodSelector", () => {
  it("MATERIAL_METHOD_SLUGS に含まれるメソッドをカテゴリごとにグループ表示する", () => {
    render(<MethodSelector methods={methods} selected={[]} onChange={() => {}} />);

    // カテゴリラベルが表示される
    expect(screen.getByText("記憶")).toBeDefined();
    expect(screen.getByText("理解")).toBeDefined();
    expect(screen.getByText("集中")).toBeDefined();

    // MATERIAL_METHOD_SLUGS に含まれるメソッドが表示される
    expect(screen.getByText("SRS")).toBeDefined();
    expect(screen.getByText("アクティブリコール")).toBeDefined();
    expect(screen.getByText("精緻化")).toBeDefined();
    expect(screen.getByText("ポモドーロ")).toBeDefined();

    // MATERIAL_METHOD_SLUGS 外のメソッドは表示されない
    expect(screen.queryByText("ウェイクフルレスト")).toBeNull();
  });

  it("メソッドをクリックすると onChange に選択済み配列を渡す", async () => {
    const user = userEvent.setup();
    const onChange = vi.fn();
    render(<MethodSelector methods={methods} selected={[]} onChange={onChange} />);

    // SRS のラベルをクリックして選択
    await user.click(screen.getByText("SRS"));

    expect(onChange).toHaveBeenCalledWith(["1"]);
  });

  it("選択済みメソッドをクリックすると選択解除される", async () => {
    const user = userEvent.setup();
    const onChange = vi.fn();
    render(<MethodSelector methods={methods} selected={["1"]} onChange={onChange} />);

    // 既に選択済みの SRS をクリックして解除
    await user.click(screen.getByText("SRS"));

    expect(onChange).toHaveBeenCalledWith([]);
  });
});
