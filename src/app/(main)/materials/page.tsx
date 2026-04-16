import { Plus } from "lucide-react";
import Link from "next/link";
import { getMaterials } from "@/lib/actions/materials";
import { getCategories } from "@/lib/actions/categories";
import { getTags, getBulkTagsForMaterials } from "@/lib/actions/tags";
import { EmptyState } from "@/components/empty-state";
import { buttonVariants } from "@/components/ui/button-variants";
import { cn } from "@/lib/utils";
import { MaterialsSearch } from "./materials-search";
import { MaterialsList } from "./materials-list";

export default async function MaterialsPage({
  searchParams,
}: {
  searchParams: Promise<{ q?: string }>;
}) {
  const params = await searchParams;
  const [materials, allCategories, allTags] = await Promise.all([
    getMaterials({ search: params.q }),
    getCategories(),
    getTags(),
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

  // 教材ごとのタグを一括取得し、クライアントにマップとして渡す
  const bulkTagsMap = await getBulkTagsForMaterials(materials.map((m) => m.id));
  const materialTagsMap = Object.fromEntries(bulkTagsMap);

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

      <MaterialsList
        materials={materials}
        allCategories={allCategories}
        allTags={allTags}
        materialTagsMap={materialTagsMap}
      />

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
