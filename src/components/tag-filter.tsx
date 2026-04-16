"use client";

import { useState } from "react";
import { cn } from "@/lib/utils";
import type { Tag } from "@/lib/actions/tags";

type Props = {
  tags: Tag[];
  selectedTagIds: string[];
  onChange: (tagIds: string[]) => void;
};

/**
 * タグフィルタチップ群。
 * 複数選択 AND: 全タグを持つ教材のみ表示するため、選択状態を呼び出し元に委譲する。
 */
export function TagFilter({ tags, selectedTagIds, onChange }: Props) {
  function toggle(tagId: string) {
    if (selectedTagIds.includes(tagId)) {
      onChange(selectedTagIds.filter((id) => id !== tagId));
    } else {
      onChange([...selectedTagIds, tagId]);
    }
  }

  if (tags.length === 0) return null;

  return (
    <div
      role="group"
      aria-label="タグフィルタ"
      className="flex flex-wrap gap-1.5"
    >
      {tags.map((tag) => {
        const isSelected = selectedTagIds.includes(tag.id);
        return (
          <button
            key={tag.id}
            type="button"
            role="checkbox"
            aria-checked={isSelected}
            aria-label={`タグ「${tag.name}」でフィルタ`}
            onClick={() => toggle(tag.id)}
            className={cn(
              "inline-flex items-center rounded-full px-2.5 py-1 text-xs font-medium transition-opacity",
              isSelected ? "opacity-100 ring-2 ring-offset-1" : "opacity-60 hover:opacity-90",
            )}
            style={{
              backgroundColor: tag.color,
              color: "#fff",
            }}
          >
            {tag.name}
          </button>
        );
      })}

      {selectedTagIds.length > 0 && (
        <button
          type="button"
          onClick={() => onChange([])}
          className="inline-flex items-center rounded-full border border-border px-2.5 py-1 text-xs text-muted-foreground hover:bg-muted"
        >
          フィルタ解除
        </button>
      )}
    </div>
  );
}
