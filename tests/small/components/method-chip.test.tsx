import { describe, it, expect } from "vitest";
import { render, screen } from "@testing-library/react";
import { MethodChip } from "@/components/method-chip";

const memoryMethod = {
  id: "1",
  slug: "srs",
  name: "SRS",
  category: "memory",
};

const comprehensionMethod = {
  id: "2",
  slug: "elaboration",
  name: "精緻化",
  category: "comprehension",
};

describe("MethodChip", () => {
  it("メソッド名を表示する", () => {
    render(<MethodChip method={memoryMethod} />);
    expect(screen.getByText("SRS")).toBeInTheDocument();
  });

  it("memory カテゴリに indigo カラークラスを適用する", () => {
    const { container } = render(<MethodChip method={memoryMethod} />);
    const chip = container.querySelector("span");
    expect(chip?.className).toContain("bg-indigo-50");
    expect(chip?.className).toContain("text-indigo-600");
  });

  it("comprehension カテゴリに green カラークラスを適用する", () => {
    const { container } = render(<MethodChip method={comprehensionMethod} />);
    const chip = container.querySelector("span");
    expect(chip?.className).toContain("bg-green-50");
    expect(chip?.className).toContain("text-green-600");
  });

  it("removable + onRemove が指定されたとき × ボタンを表示する", () => {
    const onRemove = () => {};
    render(<MethodChip method={memoryMethod} removable onRemove={onRemove} />);
    expect(screen.getByRole("button", { name: "SRSを解除" })).toBeInTheDocument();
  });

  it("removable が false のとき × ボタンを表示しない", () => {
    render(<MethodChip method={memoryMethod} />);
    expect(screen.queryByRole("button")).toBeNull();
  });
});
