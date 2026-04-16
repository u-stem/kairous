import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";

vi.mock("next/navigation", () => ({
  useRouter: vi.fn(() => ({ push: vi.fn() })),
}));

const createTagMock = vi.fn();
const addTagToMaterialMock = vi.fn();
const removeTagFromMaterialMock = vi.fn();

vi.mock("@/lib/actions/tags", () => ({
  createTag: (...args: unknown[]) => createTagMock(...args) as unknown,
  addTagToMaterial: (...args: unknown[]) => addTagToMaterialMock(...args) as unknown,
  removeTagFromMaterial: (...args: unknown[]) => removeTagFromMaterialMock(...args) as unknown,
  TAG_PRESET_COLORS: ["#94a3b8"],
}));

import { TagInput, TagInputPreview } from "@/components/tag-input";

const sampleTag = {
  id: "t-1",
  user_id: "user-1",
  name: "Python",
  color: "#94a3b8",
  created_at: "2024-01-01",
};

const sampleTag2 = {
  id: "t-2",
  user_id: "user-1",
  name: "JavaScript",
  color: "#f87171",
  created_at: "2024-01-02",
};

describe("TagInput", () => {
  beforeEach(() => {
    createTagMock.mockReset();
    addTagToMaterialMock.mockReset();
    removeTagFromMaterialMock.mockReset();
  });

  it("既存タグがチップとして表示される", () => {
    render(
      <TagInput
        materialId="m-1"
        existingTags={[sampleTag]}
        allTags={[sampleTag, sampleTag2]}
      />,
    );
    expect(screen.getByText("Python")).toBeDefined();
  });

  it("テキスト入力でサジェストが表示される", async () => {
    render(
      <TagInput
        materialId="m-1"
        existingTags={[]}
        allTags={[sampleTag, sampleTag2]}
      />,
    );
    const input = screen.getByRole("combobox");
    await userEvent.type(input, "Py");

    await waitFor(() => {
      expect(screen.getByText("Python")).toBeDefined();
    });
  });

  it("既存タグはサジェストに表示されない", async () => {
    render(
      <TagInput
        materialId="m-1"
        existingTags={[sampleTag]}
        allTags={[sampleTag, sampleTag2]}
      />,
    );
    const input = screen.getByRole("combobox");
    await userEvent.type(input, "P");

    // Python は既に付与済みなのでサジェストに出ない (listitem 内の Python は付与済みチップ)
    const listbox = screen.queryByRole("listbox");
    // サジェストが表示されたとしても Python は含まれない
    if (listbox) {
      const options = screen.queryAllByRole("option");
      const hasPython = options.some((o) => o.textContent?.includes("Python"));
      expect(hasPython).toBe(false);
    }
  });

  it("Enterキーで最初のサジェストを追加する", async () => {
    addTagToMaterialMock.mockResolvedValue({ success: true, data: undefined });
    render(
      <TagInput
        materialId="m-1"
        existingTags={[]}
        allTags={[sampleTag]}
      />,
    );
    const input = screen.getByRole("combobox");
    await userEvent.type(input, "Py{Enter}");

    await waitFor(() => {
      expect(addTagToMaterialMock).toHaveBeenCalledWith("m-1", "t-1");
    });
  });

  it("×ボタンでタグを外す", async () => {
    removeTagFromMaterialMock.mockResolvedValue({ success: true, data: undefined });
    render(
      <TagInput
        materialId="m-1"
        existingTags={[sampleTag]}
        allTags={[sampleTag]}
      />,
    );
    const removeButton = screen.getByRole("button", { name: `タグ「${sampleTag.name}」を外す` });
    await userEvent.click(removeButton);

    await waitFor(() => {
      expect(removeTagFromMaterialMock).toHaveBeenCalledWith("m-1", "t-1");
    });
  });

  it("未存在タグはEnterキーで新規作成される", async () => {
    const newTag = { ...sampleTag, id: "t-new", name: "Rust" };
    createTagMock.mockResolvedValue({ success: true, data: newTag });
    addTagToMaterialMock.mockResolvedValue({ success: true, data: undefined });

    render(
      <TagInput
        materialId="m-1"
        existingTags={[]}
        allTags={[]}
      />,
    );
    const input = screen.getByRole("combobox");
    await userEvent.type(input, "Rust{Enter}");

    await waitFor(() => {
      expect(createTagMock).toHaveBeenCalledWith("Rust", "#94a3b8");
    });
  });
});

describe("TagInputPreview", () => {
  it("選択済みタグが表示される", () => {
    const onChange = vi.fn();
    render(
      <TagInputPreview
        allTags={[sampleTag, sampleTag2]}
        selectedTags={[sampleTag]}
        onChange={onChange}
      />,
    );
    expect(screen.getByText("Python")).toBeDefined();
  });

  it("×ボタンでタグを外しonChangeが呼ばれる", async () => {
    const onChange = vi.fn();
    render(
      <TagInputPreview
        allTags={[sampleTag, sampleTag2]}
        selectedTags={[sampleTag]}
        onChange={onChange}
      />,
    );
    const removeButton = screen.getByRole("button", { name: `タグ「${sampleTag.name}」を外す` });
    await userEvent.click(removeButton);

    expect(onChange).toHaveBeenCalledWith([]);
  });

  it("サジェストからタグ選択でonChangeが呼ばれる", async () => {
    const onChange = vi.fn();
    render(
      <TagInputPreview
        allTags={[sampleTag, sampleTag2]}
        selectedTags={[]}
        onChange={onChange}
      />,
    );
    const input = screen.getByRole("combobox");
    await userEvent.type(input, "Py");

    await waitFor(() => {
      expect(screen.getByRole("listbox")).toBeDefined();
    });

    const pythonOption = screen.getByText("Python");
    await userEvent.click(pythonOption);

    expect(onChange).toHaveBeenCalledWith([sampleTag]);
  });
});
