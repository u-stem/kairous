"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { createInterleavingSession } from "@/lib/actions/session-commands";
import { TagFilter } from "@/components/tag-filter";
import type { Tag } from "@/lib/actions/tags";

type DueMaterial = {
  id: string;
};

type Props = {
  materials: DueMaterial[];
  allTags: Tag[];
  // 教材 ID -> タグ一覧のマップ (server で取得して渡す)
  materialTagsMap: Record<string, Tag[]>;
};

/**
 * インターリービングのタグ絞り込みセレクタ付きボタン。
 * タグ選択後、選択タグを全て持つ教材のみを対象にセッションを作成する。
 */
export function InterleavingFilter({ materials, allTags, materialTagsMap }: Props) {
  const router = useRouter();
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [selectedTagIds, setSelectedTagIds] = useState<string[]>([]);

  // タグ絞り込み後の対象教材 ID
  const filteredIds =
    selectedTagIds.length === 0
      ? materials.map((m) => m.id)
      : materials
          .filter((m) => {
            const tags = materialTagsMap[m.id] ?? [];
            const tagIds = new Set(tags.map((t) => t.id));
            return selectedTagIds.every((id) => tagIds.has(id));
          })
          .map((m) => m.id);

  const canStart = filteredIds.length >= 2;

  async function handleClick() {
    setLoading(true);
    setError(null);
    const result = await createInterleavingSession(filteredIds);
    if (result.success) {
      router.push(`/session/${result.data.id}`);
    } else {
      setError(result.error);
      setLoading(false);
    }
  }

  return (
    <div className="flex flex-col gap-2">
      {/* タグが存在する場合のみ絞り込みUIを表示する */}
      {allTags.length > 0 && (
        <div>
          <p className="mb-1 text-xs text-muted-foreground">タグで絞り込む（任意）</p>
          <TagFilter
            tags={allTags}
            selectedTagIds={selectedTagIds}
            onChange={setSelectedTagIds}
          />
          {selectedTagIds.length > 0 && (
            <p className="mt-1 text-xs text-muted-foreground">
              対象: {filteredIds.length}件の教材
            </p>
          )}
        </div>
      )}

      <button
        type="button"
        onClick={() => void handleClick()}
        disabled={loading || !canStart}
        className="w-full rounded-lg bg-green-500 py-3 font-medium text-white hover:bg-green-600 disabled:opacity-50"
      >
        {loading ? "..." : "まとめて学習"}
      </button>

      {!canStart && filteredIds.length < 2 && selectedTagIds.length > 0 && (
        <p className="text-xs text-muted-foreground">
          絞り込み結果が2件未満のため開始できません
        </p>
      )}

      {error && (
        <p className="mt-1 text-sm text-red-500">{error}</p>
      )}
    </div>
  );
}
