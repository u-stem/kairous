import { Plus } from "lucide-react";
import Link from "next/link";
import { getMaterials } from "@/lib/actions/materials";
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
  const materials = await getMaterials({ search: params.q });

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

  // subject_id をキーに科目ごとにグループ化する
  const grouped = new Map<
    string,
    { subject: { id: string; name: string; color: string }; materials: typeof materials }
  >();
  for (const material of materials) {
    const key = material.subject_id;
    if (!grouped.has(key)) {
      grouped.set(key, { subject: material.subject, materials: [] });
    }
    grouped.get(key)!.materials.push(material);
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
          <Plus className="mr-1.5 h-4 w-4" />
          新規教材
        </Link>
      </div>

      {/* 科目別セクション */}
      {Array.from(grouped.entries()).map(([subjectId, { subject, materials: subjectMaterials }]) => (
        <section key={subjectId} className="mb-6">
          <div className="mb-3 flex items-center justify-between">
            <h2 className="text-xs font-bold uppercase text-muted-foreground">
              {subject.name}
            </h2>
            <span className="text-xs text-muted-foreground">
              {subjectMaterials.length} 教材
            </span>
          </div>
          <div className="grid gap-2 md:grid-cols-2">
            {subjectMaterials.map((material) => (
              <MaterialCard key={material.id} material={material} />
            ))}
          </div>
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
          <Plus className="h-6 w-6" />
        </Link>
      </div>
    </div>
  );
}
