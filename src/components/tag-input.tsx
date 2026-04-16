"use client";

import { useId, useRef, useState, useTransition } from "react";
import { X } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  createTag,
  addTagToMaterial,
  removeTagFromMaterial,
} from "@/lib/actions/tags";
import { TAG_PRESET_COLORS } from "@/lib/constants";
import type { Tag } from "@/lib/types/tags";
import { cn } from "@/lib/utils";

type Props = {
  materialId: string;
  existingTags: Tag[];
  allTags: Tag[];
};

export function TagInput({ materialId, existingTags: initialExistingTags, allTags: initialAllTags }: Props) {
  const inputId = useId();
  const listboxId = useId();
  const inputRef = useRef<HTMLInputElement>(null);
  const [query, setQuery] = useState("");
  const [existingTags, setExistingTags] = useState<Tag[]>(initialExistingTags);
  const [allTags, setAllTags] = useState<Tag[]>(initialAllTags);
  const [isOpen, setIsOpen] = useState(false);
  const [isPending, startTransition] = useTransition();

  const existingTagIds = new Set(existingTags.map((t) => t.id));

  // クエリに部分一致し、まだ付与されていないタグを候補として提示する
  const suggestions = allTags.filter(
    (t) => !existingTagIds.has(t.id) && t.name.toLowerCase().includes(query.toLowerCase()),
  );

  // 入力クエリと完全一致するタグが存在しない場合に新規作成オプションを表示する
  const hasExactMatch = allTags.some(
    (t) => t.name.toLowerCase() === query.toLowerCase(),
  );
  const canCreate = query.trim().length > 0 && !hasExactMatch;

  function handleAdd(tag: Tag) {
    setExistingTags((prev) => [...prev, tag]);
    setQuery("");
    setIsOpen(false);
    inputRef.current?.focus();

    startTransition(async () => {
      const result = await addTagToMaterial(materialId, tag.id);
      if (!result.success) {
        toast.error(result.error);
        setExistingTags((prev) => prev.filter((t) => t.id !== tag.id));
      }
    });
  }

  function handleRemove(tagId: string) {
    const removedTag = existingTags.find((t) => t.id === tagId);
    setExistingTags((prev) => prev.filter((t) => t.id !== tagId));

    startTransition(async () => {
      const result = await removeTagFromMaterial(materialId, tagId);
      if (!result.success) {
        toast.error(result.error);
        if (removedTag) setExistingTags((prev) => [...prev, removedTag]);
      }
    });
  }

  function handleCreate() {
    const name = query.trim();
    if (!name) return;

    startTransition(async () => {
      const result = await createTag(name, TAG_PRESET_COLORS[0]);
      if (!result.success) {
        toast.error(result.error);
        return;
      }

      const newTag = result.data;
      setAllTags((prev) => [...prev, newTag]);

      const addResult = await addTagToMaterial(materialId, newTag.id);
      if (!addResult.success) {
        toast.error(addResult.error);
        return;
      }

      setExistingTags((prev) => [...prev, newTag]);
      setQuery("");
      setIsOpen(false);
      inputRef.current?.focus();
    });
  }

  function handleKeyDown(e: React.KeyboardEvent<HTMLInputElement>) {
    if (e.key === "Enter") {
      e.preventDefault();
      if (suggestions.length > 0) {
        handleAdd(suggestions[0]);
      } else if (canCreate) {
        handleCreate();
      }
    } else if (e.key === "Escape") {
      setIsOpen(false);
    }
  }

  return (
    <div className="flex flex-col gap-2">
      {/* 付与済みタグのチップ一覧 */}
      {existingTags.length > 0 && (
        <div className="flex flex-wrap gap-1.5" role="list" aria-label="付与済みタグ">
          {existingTags.map((tag) => (
            <span
              key={tag.id}
              role="listitem"
              className="inline-flex items-center gap-1 rounded-full px-2.5 py-1 text-xs font-medium text-white"
              style={{ backgroundColor: tag.color }}
            >
              {tag.name}
              <button
                type="button"
                aria-label={`タグ「${tag.name}」を外す`}
                onClick={() => handleRemove(tag.id)}
                disabled={isPending}
                className="ml-0.5 rounded-full p-0.5 opacity-70 hover:opacity-100 focus:outline-none focus-visible:ring-2 focus-visible:ring-white"
              >
                <X className="h-3 w-3" aria-hidden="true" />
              </button>
            </span>
          ))}
        </div>
      )}

      {/* コンボボックス: サジェスト + 新規作成 */}
      <div className="relative">
        <Input
          id={inputId}
          ref={inputRef}
          role="combobox"
          aria-label="タグを追加"
          aria-expanded={isOpen}
          aria-autocomplete="list"
          aria-controls={listboxId}
          aria-busy={isPending}
          value={query}
          onChange={(e) => {
            setQuery(e.target.value);
            setIsOpen(e.target.value.length > 0);
          }}
          onFocus={() => {
            if (query.length > 0) setIsOpen(true);
          }}
          onBlur={() => {
            // blur 時はリストのクリックが完了するまで少し待ってから閉じる
            setTimeout(() => setIsOpen(false), 150);
          }}
          onKeyDown={handleKeyDown}
          placeholder="タグを検索または作成..."
          disabled={isPending}
          className="text-sm"
          autoComplete="off"
        />

        {isOpen && (suggestions.length > 0 || canCreate) && (
          <ul
            id={listboxId}
            role="listbox"
            aria-label="タグ候補"
            className="absolute z-10 mt-1 max-h-48 w-full overflow-auto rounded-md border border-border bg-popover py-1 shadow-md"
          >
            {suggestions.map((tag) => (
              <li key={tag.id} role="option" aria-selected={false}>
                <button
                  type="button"
                  className="flex w-full items-center gap-2 px-3 py-1.5 text-sm hover:bg-muted"
                  onClick={() => handleAdd(tag)}
                >
                  <span
                    className="h-3 w-3 shrink-0 rounded-full"
                    style={{ backgroundColor: tag.color }}
                    aria-hidden="true"
                  />
                  {tag.name}
                </button>
              </li>
            ))}

            {canCreate && (
              <li role="option" aria-selected={false}>
                <button
                  type="button"
                  className={cn(
                    "flex w-full items-center gap-2 px-3 py-1.5 text-sm hover:bg-muted",
                    suggestions.length > 0 && "border-t border-border",
                  )}
                  onClick={handleCreate}
                >
                  <span className="text-muted-foreground">新規作成:</span>
                  <span className="font-medium">{query.trim()}</span>
                </button>
              </li>
            )}
          </ul>
        )}
      </div>

      {/* クエリが空のときはヒントテキストを表示する */}
      {query.length === 0 && (
        <p className="text-xs text-muted-foreground">
          タグ名を入力してサジェストから選択、または新規作成できます
        </p>
      )}
    </div>
  );
}

/**
 * materialId なしの状態でタグを一時管理するコンポーネント。
 * 教材作成ウィザードで教材 ID が確定する前に使用する。
 * 選択済みタグを外部 state に持ち出すための onChange を受け取る。
 */
type TagInputPreviewProps = {
  allTags: Tag[];
  selectedTags: Tag[];
  onChange: (tags: Tag[]) => void;
};

export function TagInputPreview({ allTags, selectedTags, onChange }: TagInputPreviewProps) {
  const inputId = useId();
  const listboxId = useId();
  const inputRef = useRef<HTMLInputElement>(null);
  const [query, setQuery] = useState("");
  const [localAllTags, setLocalAllTags] = useState<Tag[]>(allTags);
  const [isOpen, setIsOpen] = useState(false);
  const [isPending, startTransition] = useTransition();

  const selectedTagIds = new Set(selectedTags.map((t) => t.id));

  const suggestions = localAllTags.filter(
    (t) => !selectedTagIds.has(t.id) && t.name.toLowerCase().includes(query.toLowerCase()),
  );

  const hasExactMatch = localAllTags.some(
    (t) => t.name.toLowerCase() === query.toLowerCase(),
  );
  const canCreate = query.trim().length > 0 && !hasExactMatch;

  function handleAdd(tag: Tag) {
    onChange([...selectedTags, tag]);
    setQuery("");
    setIsOpen(false);
    inputRef.current?.focus();
  }

  function handleRemove(tagId: string) {
    onChange(selectedTags.filter((t) => t.id !== tagId));
  }

  function handleCreate() {
    const name = query.trim();
    if (!name) return;

    startTransition(async () => {
      const result = await createTag(name, TAG_PRESET_COLORS[0]);
      if (!result.success) {
        toast.error(result.error);
        return;
      }

      const newTag = result.data;
      setLocalAllTags((prev) => [...prev, newTag]);
      onChange([...selectedTags, newTag]);
      setQuery("");
      setIsOpen(false);
      inputRef.current?.focus();
    });
  }

  function handleKeyDown(e: React.KeyboardEvent<HTMLInputElement>) {
    if (e.key === "Enter") {
      e.preventDefault();
      if (suggestions.length > 0) {
        handleAdd(suggestions[0]);
      } else if (canCreate) {
        handleCreate();
      }
    } else if (e.key === "Escape") {
      setIsOpen(false);
    }
  }

  return (
    <div className="flex flex-col gap-2">
      {selectedTags.length > 0 && (
        <div className="flex flex-wrap gap-1.5" role="list" aria-label="選択済みタグ">
          {selectedTags.map((tag) => (
            <span
              key={tag.id}
              role="listitem"
              className="inline-flex items-center gap-1 rounded-full px-2.5 py-1 text-xs font-medium text-white"
              style={{ backgroundColor: tag.color }}
            >
              {tag.name}
              <button
                type="button"
                aria-label={`タグ「${tag.name}」を外す`}
                onClick={() => handleRemove(tag.id)}
                disabled={isPending}
                className="ml-0.5 rounded-full p-0.5 opacity-70 hover:opacity-100 focus:outline-none focus-visible:ring-2 focus-visible:ring-white"
              >
                <X className="h-3 w-3" aria-hidden="true" />
              </button>
            </span>
          ))}
        </div>
      )}

      <div className="relative">
        <Input
          id={inputId}
          ref={inputRef}
          role="combobox"
          aria-label="タグを追加"
          aria-expanded={isOpen}
          aria-autocomplete="list"
          aria-controls={listboxId}
          aria-busy={isPending}
          value={query}
          onChange={(e) => {
            setQuery(e.target.value);
            setIsOpen(e.target.value.length > 0);
          }}
          onFocus={() => {
            if (query.length > 0) setIsOpen(true);
          }}
          onBlur={() => {
            setTimeout(() => setIsOpen(false), 150);
          }}
          onKeyDown={handleKeyDown}
          placeholder="タグを検索または作成..."
          disabled={isPending}
          className="text-sm"
          autoComplete="off"
        />

        {isOpen && (suggestions.length > 0 || canCreate) && (
          <ul
            id={listboxId}
            role="listbox"
            aria-label="タグ候補"
            className="absolute z-10 mt-1 max-h-48 w-full overflow-auto rounded-md border border-border bg-popover py-1 shadow-md"
          >
            {suggestions.map((tag) => (
              <li key={tag.id} role="option" aria-selected={false}>
                <button
                  type="button"
                  className="flex w-full items-center gap-2 px-3 py-1.5 text-sm hover:bg-muted"
                  onClick={() => handleAdd(tag)}
                >
                  <span
                    className="h-3 w-3 shrink-0 rounded-full"
                    style={{ backgroundColor: tag.color }}
                    aria-hidden="true"
                  />
                  {tag.name}
                </button>
              </li>
            ))}

            {canCreate && (
              <li role="option" aria-selected={false}>
                <button
                  type="button"
                  className={cn(
                    "flex w-full items-center gap-2 px-3 py-1.5 text-sm hover:bg-muted",
                    suggestions.length > 0 && "border-t border-border",
                  )}
                  onClick={handleCreate}
                >
                  <span className="text-muted-foreground">新規作成:</span>
                  <span className="font-medium">{query.trim()}</span>
                </button>
              </li>
            )}
          </ul>
        )}
      </div>

      {query.length === 0 && (
        <p className="text-xs text-muted-foreground">
          タグ名を入力してサジェストから選択、または新規作成できます
        </p>
      )}
    </div>
  );
}
