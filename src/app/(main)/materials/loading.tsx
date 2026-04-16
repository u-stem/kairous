import { Skeleton } from "@/components/ui/skeleton";

export default function MaterialsLoading() {
  return (
    <div className="mx-auto max-w-4xl p-4 md:p-6">
      {/* 検索バーと新規ボタンのスケルトン */}
      <div className="mb-6 flex items-center justify-between gap-4">
        <Skeleton className="h-10 flex-1" />
        <Skeleton className="hidden h-10 w-28 md:block" />
      </div>

      {/* カテゴリセクション x 2 */}
      {[1, 2].map((section) => (
        <div key={section} className="mb-6">
          <div className="mb-3 flex items-center justify-between">
            <Skeleton className="h-4 w-16" />
            <Skeleton className="h-3 w-12" />
          </div>
          <div className="grid gap-2 md:grid-cols-2">
            {[1, 2, 3].map((card) => (
              <div key={card} className="rounded-xl border p-3">
                <div className="flex items-start justify-between">
                  <div className="flex-1">
                    <Skeleton className="mb-1 h-4 w-32" />
                    <Skeleton className="h-3 w-20" />
                  </div>
                  <Skeleton className="h-2 w-2 rounded-full" />
                </div>
                <div className="mt-2 flex gap-1">
                  <Skeleton className="h-5 w-14 rounded-full" />
                  <Skeleton className="h-5 w-12 rounded-full" />
                </div>
              </div>
            ))}
          </div>
        </div>
      ))}
    </div>
  );
}
