import { describe, it, expect, vi } from "vitest";
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { CategorySelector } from "@/components/category-selector";
import type { Category } from "@/lib/types/materials";

const parentCategory: Category = {
  id: "cat-parent-1",
  name: "仕事",
  color: "#4f46e5",
  parent_id: null,
  user_id: "user-1",
  display_order: 0,
  created_at: "2026-01-01T00:00:00Z",
};

const childCategory: Category = {
  id: "cat-child-1",
  name: "Python",
  color: "#4f46e5",
  parent_id: "cat-parent-1",
  user_id: "user-1",
  display_order: 0,
  created_at: "2026-01-01T00:00:00Z",
};

const categories: Category[] = [parentCategory, childCategory];

describe("CategorySelector", () => {
  it("カテゴリ追加ボタンが表示される", () => {
    render(
      <CategorySelector
        categories={categories}
        value={null}
        onChange={() => {}}
        onCreateCategory={vi.fn()}
      />,
    );
    expect(screen.getByRole("button", { name: "カテゴリを追加" })).toBeDefined();
  });

  it("追加ボタンをクリックするとダイアログが開く", async () => {
    render(
      <CategorySelector
        categories={categories}
        value={null}
        onChange={() => {}}
        onCreateCategory={vi.fn()}
      />,
    );

    await userEvent.click(screen.getByRole("button", { name: "カテゴリを追加" }));

    await waitFor(() => {
      expect(screen.getByText("新しいカテゴリを作成")).toBeDefined();
    });
  });

  it("カテゴリ名を入力して作成ボタンを押すと onCreateCategory が呼ばれる", async () => {
    const onCreateCategory = vi.fn().mockResolvedValue({ id: "cat-new", name: "趣味" });
    const onChange = vi.fn();

    render(
      <CategorySelector
        categories={[]}
        value={null}
        onChange={onChange}
        onCreateCategory={onCreateCategory}
      />,
    );

    await userEvent.click(screen.getByRole("button", { name: "カテゴリを追加" }));
    await waitFor(() => screen.getByLabelText("カテゴリ名"));

    await userEvent.type(screen.getByLabelText("カテゴリ名"), "趣味");
    await userEvent.click(screen.getByRole("button", { name: "作成" }));

    await waitFor(() => {
      // 親カテゴリとして作成 (parentId = null)
      expect(onCreateCategory).toHaveBeenCalledWith("趣味", null);
    });
  });

  it("作成後に onChange が新しい ID で呼ばれる", async () => {
    const onCreateCategory = vi.fn().mockResolvedValue({ id: "cat-new", name: "趣味" });
    const onChange = vi.fn();

    render(
      <CategorySelector
        categories={[]}
        value={null}
        onChange={onChange}
        onCreateCategory={onCreateCategory}
      />,
    );

    await userEvent.click(screen.getByRole("button", { name: "カテゴリを追加" }));
    await waitFor(() => screen.getByLabelText("カテゴリ名"));

    await userEvent.type(screen.getByLabelText("カテゴリ名"), "趣味");
    await userEvent.click(screen.getByRole("button", { name: "作成" }));

    await waitFor(() => {
      expect(onChange).toHaveBeenCalledWith("cat-new");
    });
  });

  it("親カテゴリ選択後にサブカテゴリ選択が表示される", () => {
    render(
      <CategorySelector
        categories={categories}
        value="cat-parent-1"
        onChange={() => {}}
        onCreateCategory={vi.fn()}
      />,
    );

    // 親に子カテゴリが存在するため 2 段目のサブカテゴリ追加ボタンが表示される
    expect(screen.getByRole("button", { name: "サブカテゴリを追加" })).toBeDefined();
  });

  it("サブカテゴリ追加ボタンをクリックするとサブカテゴリ作成ダイアログが開く", async () => {
    render(
      <CategorySelector
        categories={categories}
        value="cat-parent-1"
        onChange={() => {}}
        onCreateCategory={vi.fn()}
      />,
    );

    await userEvent.click(screen.getByRole("button", { name: "サブカテゴリを追加" }));

    await waitFor(() => {
      expect(screen.getByText("新しいサブカテゴリを作成")).toBeDefined();
    });
  });

  it("サブカテゴリ作成時に onCreateCategory が親ID付きで呼ばれる", async () => {
    const onCreateCategory = vi.fn().mockResolvedValue({ id: "cat-child-new", name: "Rust" });
    const onChange = vi.fn();

    render(
      <CategorySelector
        categories={categories}
        value="cat-parent-1"
        onChange={onChange}
        onCreateCategory={onCreateCategory}
      />,
    );

    await userEvent.click(screen.getByRole("button", { name: "サブカテゴリを追加" }));
    await waitFor(() => screen.getByLabelText("カテゴリ名"));

    await userEvent.type(screen.getByLabelText("カテゴリ名"), "Rust");
    await userEvent.click(screen.getByRole("button", { name: "作成" }));

    await waitFor(() => {
      expect(onCreateCategory).toHaveBeenCalledWith("Rust", "cat-parent-1");
    });
  });
});
