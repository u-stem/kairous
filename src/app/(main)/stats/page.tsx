import { getStats, getStreak } from "@/lib/actions/stats";
import { STATS_PERIODS } from "@/lib/constants";
import type { StatsPeriod } from "@/lib/types/stats";
import { StatsDashboard } from "./stats-dashboard";
import { StreakCard } from "./streak-card";

const VALID_PERIODS = new Set<number>(STATS_PERIODS);

export default async function StatsPage(props: {
  searchParams: Promise<{ period?: string }>;
}) {
  const searchParams = await props.searchParams;
  const raw = Number(searchParams.period);
  const period: StatsPeriod = VALID_PERIODS.has(raw)
    ? (raw as StatsPeriod)
    : 7;

  // stats と streak は独立したクエリのため並列取得してレイテンシを削減する
  const [data, streak] = await Promise.all([getStats(period), getStreak()]);

  const isEmpty =
    data.summary.totalSec === 0 &&
    data.summary.sessionCount === 0 &&
    data.summary.cardsReviewed === 0;

  return (
    <div className="mx-auto max-w-2xl p-4">
      <h2 className="mb-4 text-lg font-bold">統計</h2>
      {isEmpty ? (
        <p className="mt-8 text-center text-gray-500">
          まだ学習記録がありません。セッションを完了すると統計が表示されます。
        </p>
      ) : (
        <StatsDashboard data={data} period={period} />
      )}
      <StreakCard streak={streak} />
    </div>
  );
}
