import Link from "next/link";
import { getDueMaterials, getTodaySessions } from "@/lib/actions/session-queries";
import { getStreak } from "@/lib/actions/stats";
import { format } from "date-fns";
import { ja } from "date-fns/locale";
import { TodayMaterialList } from "./today-material-list";
import { InterleavingButton } from "@/components/interleaving-button";
import { buttonVariants } from "@/components/ui/button-variants";
import { formatDurationHuman } from "@/lib/session-utils";

export default async function TodayPage() {
  const [materials, todaySessions, streak] = await Promise.all([
    getDueMaterials(),
    getTodaySessions(),
    getStreak(),
  ]);
  const today = new Date();
  const dateStr = format(today, "M月d日 EEEE", { locale: ja });

  const totalCards = materials.reduce((sum, m) => sum + m.due_count, 0);
  const todayTotalSec = todaySessions.reduce((sum, s) => sum + s.durationSec, 0);

  return (
    <div data-testid="today-container" className="mx-auto max-w-2xl p-4">
      <div className="mb-6">
        <p className="text-sm text-muted-foreground">{dateStr}</p>
        <h1 className="text-2xl font-bold">今日の学習</h1>
        {/* 継続学習のモチベーション維持のため、streak が 0 より大きい場合のみ表示する */}
        {streak.currentStreak > 0 && (
          <div className={`mt-2 inline-flex items-center gap-1 rounded-full px-3 py-1 text-sm font-medium ${
            streak.isActiveToday
              ? "bg-orange-100 text-orange-700"
              : "bg-gray-100 text-gray-600"
          }`}>
            {streak.currentStreak}日連続
            {streak.isActiveToday
              ? <span className="text-xs"> 継続中</span>
              : <span className="text-xs"> - 今日はまだ学習していません</span>
            }
          </div>
        )}
      </div>

      {materials.length > 0 ? (
        <>
          <div className="mb-6 grid grid-cols-2 gap-3">
            <div className="rounded-lg bg-muted p-4 text-center">
              <div className="text-2xl font-bold text-orange-500">{totalCards}</div>
              <div className="text-xs text-muted-foreground">復習カード</div>
            </div>
            <div className="rounded-lg bg-muted p-4 text-center">
              <div className="text-2xl font-bold text-blue-500">
                {materials.length}
              </div>
              <div className="text-xs text-muted-foreground">教材</div>
            </div>
          </div>

          {materials.length >= 2 && (
            <div className="mb-4">
              <InterleavingButton materialIds={materials.map((m) => m.id)} />
            </div>
          )}

          <p className="mb-3 text-sm text-muted-foreground">復習が必要な教材</p>
          <TodayMaterialList materials={materials} />
        </>
      ) : (
        <div className="py-8 text-center">
          <p className="text-lg font-medium">復習完了</p>
          <p className="mt-1 text-sm text-muted-foreground">
            今日の復習カードはすべて完了しました
          </p>
        </div>
      )}

      {/* 今日の学習サマリー: 復習カードの有無に関わらず、セッション実績があれば表示する */}
      {todaySessions.length > 0 && (
        <div className="mt-6">
          <h2 className="mb-3 text-sm font-medium text-muted-foreground">完了セッション</h2>
          <div className="mb-4 grid grid-cols-2 gap-3">
            <div className="rounded-lg bg-muted p-4 text-center">
              <div className="text-2xl font-bold text-blue-500">{formatDurationHuman(todayTotalSec)}</div>
              <div className="text-xs text-muted-foreground">学習時間</div>
            </div>
            <div className="rounded-lg bg-muted p-4 text-center">
              <div className="text-2xl font-bold text-green-500">{todaySessions.length}</div>
              <div className="text-xs text-muted-foreground">セッション</div>
            </div>
          </div>
          <div className="flex flex-col gap-2">
            {todaySessions.map((session) => (
              <div
                key={session.id}
                className="flex items-center justify-between rounded-lg border px-3 py-2.5"
              >
                <div>
                  <p className="text-sm font-medium">{session.methodName}</p>
                  <p className="text-xs text-muted-foreground">{session.materialTitle ?? "---"}</p>
                </div>
                <p className="text-xs text-muted-foreground">{formatDurationHuman(session.durationSec)}</p>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* CTA: 復習完了後でも教材一覧へ遷移して学習を開始できるようにする */}
      {materials.length === 0 && (
        <div className="mt-6 text-center">
          <Link href="/materials" className={buttonVariants()}>
            教材を見る
          </Link>
        </div>
      )}
    </div>
  );
}
