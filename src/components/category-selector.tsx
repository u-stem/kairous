"use client";

import { type Dispatch, type SetStateAction, useState } from "react";
import { Plus } from "lucide-react";
import { toast } from "sonner";
import type { Category } from "@/lib/types/materials";
import type { ActionResult } from "@/lib/validations/materials";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";

type CategorySelectorProps = {
  categories: Category[];
  value: string | null;
  onChange: (categoryId: string | null) => void;
  onCreateCategory: (name: string, parentId: string | null) => Promise<{ id: string; name: string } | null>;
  selectAriaLabelledBy?: string;
};

type CreateCategoryAction = (formData: FormData) => Promise<ActionResult<{ id: string; name: string }>>;

/**
 * createCategory Server Action を呼び出す共通ハンドラを生成する。
 * material-wizard と material-edit-form で重複するロジックをここに集約する。
 * Server Action を引数で受け取ることで、テスト時に Supabase env 依存を避ける。
 * setCategories に既存リストを渡してローカル追加することで再フェッチを避ける。
 */
export function buildCreateCategoryHandler(
  createCategoryAction: CreateCategoryAction,
  setCategories: Dispatch<SetStateAction<Category[]>>,
): (name: string, parentId: string | null) => Promise<{ id: string; name: string } | null> {
  return async (name: string, parentId: string | null) => {
    const formData = new FormData();
    formData.set("name", name);
    if (parentId) formData.set("parent_id", parentId);
    const result = await createCategoryAction(formData);
    if (!result.success) {
      toast.error(result.error);
      return null;
    }
    // color・created_at はサーバー側で設定されるため暫定値を使う
    setCategories((prev) => [
      ...prev,
      {
        ...result.data,
        color: "#6b7280",
        parent_id: parentId,
        display_order: Math.max(0, ...prev.map((c) => c.display_order)) + 1,
        user_id: "",
        created_at: new Date().toISOString(),
      },
    ]);
    return result.data;
  };
}

export function CategorySelector({
  categories,
  value,
  onChange,
  onCreateCategory,
  selectAriaLabelledBy,
}: CategorySelectorProps) {
  const [open, setOpen] = useState(false);
  const [newName, setNewName] = useState("");
  const [creating, setCreating] = useState(false);
  // ダイアログ内での新規カテゴリの親 (null = 親カテゴリとして作成)
  const [dialogParentId, setDialogParentId] = useState<string | null>(null);

  const parentCategories = categories.filter((c) => c.parent_id === null);

  // 選択中のカテゴリから親IDと子IDを導出する
  const selectedCategory = value ? (categories.find((c) => c.id === value) ?? null) : null;
  const selectedParentId: string | null =
    selectedCategory === null
      ? null
      : selectedCategory.parent_id !== null
        ? selectedCategory.parent_id
        : selectedCategory.id;
  const selectedChildId: string | null =
    selectedCategory !== null && selectedCategory.parent_id !== null
      ? selectedCategory.id
      : null;

  const childCategoriesForParent = (parentId: string) =>
    categories.filter((c) => c.parent_id === parentId);

  // 現在選択中の親の子カテゴリ一覧。selectedParentId が null の場合は空配列
  const activeChildCategories =
    selectedParentId !== null ? childCategoriesForParent(selectedParentId) : [];

  function handleParentChange(parentId: string | null) {
    // 親が変わったら子の選択を解除し、親カテゴリを選択済みにする。
    // 呼び出し元の onValueChange で空文字列を弾いているため null は渡らない
    onChange(parentId);
  }

  function handleChildChange(childId: string | null) {
    if (childId !== null) onChange(childId);
  }

  async function handleCreate() {
    if (!newName.trim()) return;

    setCreating(true);
    const result = await onCreateCategory(newName.trim(), dialogParentId);
    setCreating(false);

    if (result) {
      onChange(result.id);
      setOpen(false);
      setNewName("");
      setDialogParentId(null);
    }
  }

  // Enter キーでダイアログを送信できるようにし、フォーム追加の手間を省く
  function handleKeyDown(e: React.KeyboardEvent<HTMLInputElement>) {
    if (e.key === "Enter") {
      e.preventDefault();
      void handleCreate();
    }
  }

  function openDialog(parentId: string | null) {
    setDialogParentId(parentId);
    setNewName("");
    setOpen(true);
  }

  return (
    <div className="flex flex-col gap-2">
      {/* 1段目: 親カテゴリ選択 */}
      <div className="flex gap-2">
        {/* onValueChange は null を返す可能性があるが、選択解除は想定しないため null を無視する */}
        <Select
          value={selectedParentId ?? ""}
          onValueChange={(v) => v && handleParentChange(v)}
        >
          {/* min-w-0 が無いと flex-1 配下で SelectTrigger の w-fit + whitespace-nowrap
              が親幅を無視して伸びるため、SP 375px で横あふれする */}
          <SelectTrigger
            className="min-w-0 flex-1"
            aria-labelledby={selectAriaLabelledBy}
          >
            <SelectValue placeholder="カテゴリを選択">
              {selectedParentId
                ? (categories.find((c) => c.id === selectedParentId)?.name ?? "カテゴリを選択")
                : "カテゴリを選択"}
            </SelectValue>
          </SelectTrigger>
          <SelectContent>
            {parentCategories.map((cat) => (
              <SelectItem key={cat.id} value={cat.id}>
                {cat.name}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>

        <Button
          type="button"
          variant="outline"
          size="icon"
          onClick={() => openDialog(null)}
          aria-label="カテゴリを追加"
        >
          <Plus aria-hidden="true" />
        </Button>
      </div>

      {/* 2段目: 子カテゴリ選択 (親が選択済みで子が存在する場合のみ表示) */}
      {activeChildCategories.length > 0 && (
        <div className="flex gap-2 pl-4">
          <Select
            value={selectedChildId ?? "__none__"}
            onValueChange={(v) => {
              if (v === "__none__") {
                // 「なし (親のみ)」を選択した場合は親カテゴリIDを直接セット
                // activeChildCategories.length > 0 の条件下なので selectedParentId は non-null
                if (selectedParentId !== null) handleParentChange(selectedParentId);
              } else {
                handleChildChange(v);
              }
            }}
          >
            <SelectTrigger className="min-w-0 flex-1" aria-label="サブカテゴリを選択">
              <SelectValue placeholder="サブカテゴリ (任意)">
                {selectedChildId
                  ? (categories.find((c) => c.id === selectedChildId)?.name ?? "サブカテゴリ (任意)")
                  : "サブカテゴリ (任意)"}
              </SelectValue>
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="__none__">なし (親のみ)</SelectItem>
              {activeChildCategories.map((cat) => (
                <SelectItem key={cat.id} value={cat.id}>
                  {cat.name}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>

          <Button
            type="button"
            variant="outline"
            size="icon"
            onClick={() => openDialog(selectedParentId)}
            aria-label="サブカテゴリを追加"
          >
            <Plus aria-hidden="true" />
          </Button>
        </div>
      )}

      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>
              {dialogParentId ? "新しいサブカテゴリを作成" : "新しいカテゴリを作成"}
            </DialogTitle>
          </DialogHeader>
          <div className="flex flex-col gap-1.5">
            <Label htmlFor="new-category-name">カテゴリ名</Label>
            <Input
              id="new-category-name"
              value={newName}
              onChange={(e) => setNewName(e.target.value)}
              onKeyDown={handleKeyDown}
              placeholder={dialogParentId ? "例: Python、JavaScript" : "例: 仕事、趣味"}
              autoFocus
            />
          </div>
          <DialogFooter>
            <Button
              onClick={() => void handleCreate()}
              disabled={!newName.trim() || creating}
            >
              {creating ? "作成中..." : "作成"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
