import type { StatsSummary } from "@/lib/types/stats";
import { formatStudyTime, calcChangeRate, shouldShowReviewCard } from "@/lib/utils/stats";

function ChangeIndicator({ current, previous }: { current: number; previous: number }) {
  const rate = calcChangeRate(current, previous);
  if (rate === 0) return <span className="text-xs text-gray-400">--</span>;
  const isPositive = rate > 0;
  return (
    <span className={`text-xs ${isPositive ? "text-green-600" : "text-red-500"}`}>
      {isPositive ? "+" : ""}{rate}%
    </span>
  );
}

export function SummaryCards({ summary }: { summary: StatsSummary }) {
  const showReview = shouldShowReviewCard(
    summary.cardsReviewed,
    summary.prevCardsReviewed,
  );

  const cards = [
    {
      label: "学習時間",
      value: formatStudyTime(summary.totalSec),
      current: summary.totalSec,
      previous: summary.prevTotalSec,
    },
    {
      label: "セッション",
      value: String(summary.sessionCount),
      current: summary.sessionCount,
      previous: summary.prevSessionCount,
    },
    ...(showReview
      ? [
          {
            label: "レビュー",
            value: String(summary.cardsReviewed),
            current: summary.cardsReviewed,
            previous: summary.prevCardsReviewed,
          },
        ]
      : []),
  ];

  return (
    <div className={`grid gap-3 ${showReview ? "grid-cols-3" : "grid-cols-2"}`}>
      {cards.map((card) => (
        <div key={card.label} className="rounded-lg bg-gray-50 p-3 text-center">
          <p className="text-xs text-gray-500">{card.label}</p>
          <p className="text-xl font-bold">{card.value}</p>
          <ChangeIndicator current={card.current} previous={card.previous} />
        </div>
      ))}
    </div>
  );
}
