import { Skeleton } from "@/components/ui/skeleton";

export default function MaterialDetailLoading() {
  return (
    <div className="mx-auto max-w-4xl p-4 md:p-6">
      {/* ヘッダー: タイトル・カテゴリ・編集ボタンのスケルトン */}
      <div className="mb-4 flex items-start justify-between gap-3">
        <div className="flex flex-1 flex-col gap-2">
          <Skeleton className="h-7 w-48" />
          <Skeleton className="h-4 w-24" />
        </div>
        <Skeleton className="h-8 w-16 shrink-0" />
      </div>

      {/* 手法チップのスケルトン */}
      <div className="mb-6 flex flex-wrap items-center gap-2">
        <Skeleton className="h-5 w-16 rounded-full" />
        <Skeleton className="h-5 w-20 rounded-full" />
        <Skeleton className="h-6 w-14 rounded-md" />
      </div>

      {/* タブバーのスケルトン */}
      <div className="mb-4 flex gap-1">
        <Skeleton className="h-8 w-20 rounded-md" />
        <Skeleton className="h-8 w-24 rounded-md" />
        <Skeleton className="h-8 w-16 rounded-md" />
      </div>

      {/* コンテンツエリア: 3つのスタットカード */}
      <div className="grid grid-cols-3 gap-3">
        {[1, 2, 3].map((i) => (
          <div key={i} className="rounded-xl border p-4">
            <Skeleton className="mb-2 h-3 w-16" />
            <Skeleton className="h-8 w-12" />
          </div>
        ))}
      </div>

      {/* 直近セッションリストのスケルトン */}
      <div className="mt-6 flex flex-col gap-2">
        <Skeleton className="h-4 w-24 mb-2" />
        {[1, 2, 3].map((i) => (
          <div key={i} className="rounded-lg border p-3">
            <div className="flex items-center justify-between">
              <Skeleton className="h-4 w-20" />
              <Skeleton className="h-3 w-16" />
            </div>
            <Skeleton className="mt-1 h-3 w-28" />
          </div>
        ))}
      </div>
    </div>
  );
}
