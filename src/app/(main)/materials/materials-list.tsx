"use client";

import { useState } from "react";
import { MaterialCard } from "@/components/material-card";
import { TagFilter } from "@/components/tag-filter";
import { EmptyState } from "@/components/empty-state";
import { cn } from "@/lib/utils";
import type { MaterialWithMethods } from "@/lib/types/materials";
import type { Tag } from "@/lib/types/tags";

type Category = {
  id: string;
  name: string;
  parent_id: string | null;
};

type Props = {
  materials: MaterialWithMethods[];
  allCategories: Category[];
  allTags: Tag[];
  // 教材 ID -> タグ一覧のマップ (server で取得して渡す)
  materialTagsMap: Record<string, Tag[]>;
};

/**
 * タグフィルタはクライアントサイドフィルタリングのため Client Component として分離する。
 * 教材全件と全タグを受け取り、選択状態に応じてフィルタした結果を表示する。
 */
export function MaterialsList({ materials, allCategories, allTags, materialTagsMap }: Props) {
  const [selectedTagIds, setSelectedTagIds] = useState<string[]>([]);

  // AND フィルタ: 選択中のタグをすべて持つ教材のみ表示する
  const filtered =
    selectedTagIds.length === 0
      ? materials
      : materials.filter((m) => {
          const tags = materialTagsMap[m.id] ?? [];
          const tagIds = new Set(tags.map((t) => t.id));
          return selectedTagIds.every((id) => tagIds.has(id));
        });

  // 親カテゴリのマップ (id -> category)
  const parentCategoryMap = new Map(
    allCategories
      .filter((c) => c.parent_id === null)
      .map((c) => [c.id, c]),
  );

  // 3 階層グルーピング: 親カテゴリ > 子カテゴリ > 教材
  type ChildGroup = Map<string | null, { name: string | null; materials: MaterialWithMethods[] }>;
  const grouped = new Map<string, { parentName: string; children: ChildGroup }>();

  for (const material of filtered) {
    const cat = material.category;
    const parentId = cat.parent_id !== null ? cat.parent_id : cat.id;
    const childId = cat.parent_id !== null ? cat.id : null;
    const childName = cat.parent_id !== null ? cat.name : null;
    const parentName =
      cat.parent_id !== null
        ? (parentCategoryMap.get(cat.parent_id)?.name ?? cat.name)
        : cat.name;

    if (!grouped.has(parentId)) {
      grouped.set(parentId, { parentName, children: new Map() });
    }
    const parentGroup = grouped.get(parentId)!;
    if (!parentGroup.children.has(childId)) {
      parentGroup.children.set(childId, { name: childName, materials: [] });
    }
    parentGroup.children.get(childId)!.materials.push(material);
  }

  return (
    <>
      {/* タグフィルタチップ群: タグが 1 件以上存在する場合のみ表示する */}
      {allTags.length > 0 && (
        <div className="mb-4" data-testid="tag-filter">
          <p className="mb-1.5 text-xs text-muted-foreground">タグで絞り込み</p>
          <TagFilter
            tags={allTags}
            selectedTagIds={selectedTagIds}
            onChange={setSelectedTagIds}
          />
        </div>
      )}

      {filtered.length === 0 ? (
        <EmptyState
          title="条件に一致する教材がありません"
          description="フィルタを解除するか、別のタグを試してください"
        />
      ) : (
        <>
          {/* カテゴリ別セクション (親 > 子 > 教材 の 3 階層) */}
          {Array.from(grouped.entries()).map(([parentId, { parentName, children }]) => (
            <section key={parentId} className="mb-6">
              <h2 className="mb-3 text-xs font-bold uppercase text-muted-foreground">
                {parentName}
              </h2>

              {Array.from(children.entries()).map(([childId, { name: childName, materials: childMaterials }]) => (
                <div key={childId ?? "__parent_only__"} className="mb-4">
                  {childName && (
                    <h3 className="mb-2 ml-3 text-xs font-semibold text-muted-foreground">
                      {childName}
                    </h3>
                  )}
                  <div className={cn("grid gap-2 md:grid-cols-2", childName && "ml-3")}>
                    {childMaterials.map((material) => (
                      <MaterialCard key={material.id} material={material} />
                    ))}
                  </div>
                </div>
              ))}
            </section>
          ))}
        </>
      )}
    </>
  );
}
