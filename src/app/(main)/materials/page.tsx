import { Plus } from "lucide-react";
import Link from "next/link";
import { getMaterials } from "@/lib/actions/materials";
import { getCategories } from "@/lib/actions/categories";
import { MaterialCard } from "@/components/material-card";
import { EmptyState } from "@/components/empty-state";
import { buttonVariants } from "@/components/ui/button-variants";
import { cn } from "@/lib/utils";
import { MaterialsSearch } from "./materials-search";

export default async function MaterialsPage({
  searchParams,
}: {
  searchParams: Promise<{ q?: string }>;
}) {
  const params = await searchParams;
  const [materials, allCategories] = await Promise.all([
    getMaterials({ search: params.q }),
    getCategories(),
  ]);

  if (materials.length === 0) {
    return (
      <div className="mx-auto max-w-4xl p-4 md:p-6">
        <EmptyState
          title="教材がありません"
          description="最初の教材を追加しましょう"
          action={{ label: "教材を追加", href: "/materials/new" }}
        />
      </div>
    );
  }

  // 親カテゴリのマップ (id -> { id, name })
  const parentCategoryMap = new Map(
    allCategories
      .filter((c) => c.parent_id === null)
      .map((c) => [c.id, c]),
  );

  // 3 階層グルーピング: 親カテゴリ > 子カテゴリ > 教材
  // 教材の category.parent_id が null なら parent 直下、non-null なら子カテゴリ配下
  type ChildGroup = Map<string | null, { name: string | null; materials: typeof materials }>;
  const grouped = new Map<string, { parentName: string; children: ChildGroup }>();

  for (const material of materials) {
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
    <div className="mx-auto max-w-4xl p-4 md:p-6">
      {/* ヘッダー: 検索バー + デスクトップ用新規ボタン */}
      <div className="mb-6 flex items-center justify-between gap-4">
        <MaterialsSearch />
        <Link
          href="/materials/new"
          className={cn(buttonVariants(), "hidden md:inline-flex")}
        >
          <Plus aria-hidden="true" className="mr-1.5 h-4 w-4" />
          新規教材
        </Link>
      </div>

      {/* カテゴリ別セクション (親 > 子 > 教材 の 3 階層) */}
      {Array.from(grouped.entries()).map(([parentId, { parentName, children }]) => (
        <section key={parentId} className="mb-6">
          <h2 className="mb-3 text-xs font-bold uppercase text-muted-foreground">
            {parentName}
          </h2>

          {Array.from(children.entries()).map(([childId, { name: childName, materials: childMaterials }]) => (
            <div key={childId ?? "__parent_only__"} className="mb-4">
              {/* 子カテゴリが設定されている場合のみ subheading を表示する */}
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

      {/* モバイル用 FAB — BottomNav と重ならないよう bottom-20 に配置 */}
      <div className="fixed bottom-20 right-4 md:hidden">
        <Link
          href="/materials/new"
          aria-label="新規教材を追加"
          className={cn(
            buttonVariants({ size: "icon" }),
            "size-14 rounded-full shadow-lg",
          )}
        >
          <Plus aria-hidden="true" className="h-6 w-6" />
        </Link>
      </div>
    </div>
  );
}
