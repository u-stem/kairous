import type { StreakData } from "@/lib/types/stats";

export function StreakCard({ streak }: { streak: StreakData }) {
  if (streak.currentStreak === 0 && streak.longestStreak === 0) return null;

  return (
    <div className="rounded-lg border p-4">
      <h3 className="mb-2 text-sm font-medium text-gray-500">連続記録</h3>
      <div className="grid grid-cols-2 gap-4">
        <div>
          <p className="text-2xl font-bold text-orange-500">{streak.currentStreak}</p>
          <p className="text-xs text-gray-500">
            {streak.isActiveToday ? "日連続 (継続中)" : "日連続"}
          </p>
        </div>
        <div>
          <p className="text-2xl font-bold text-gray-700">{streak.longestStreak}</p>
          <p className="text-xs text-gray-500">最長記録</p>
        </div>
      </div>
    </div>
  );
}
