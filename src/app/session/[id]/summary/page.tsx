import { notFound } from "next/navigation";
import { getSession } from "@/lib/actions/sessions";
import { RATING_LABELS, RATING_COLORS } from "@/lib/constants";
import {
  calculateAccuracyRate,
  formatDuration,
  countByRating,
} from "@/lib/session-utils";
import { SummaryActions } from "./summary-actions";

type Props = {
  params: Promise<{ id: string }>;
};

const RATINGS = [1, 2, 3, 4] as const;

export default async function SummaryPage({ params }: Props) {
  const { id } = await params;
  const session = await getSession(id);

  if (!session || session.status !== "completed") {
    notFound();
  }

  const accuracy = calculateAccuracyRate(session.card_reviews);
  const ratingCounts = countByRating(session.card_reviews);

  return (
    <div className="flex min-h-dvh flex-col items-center justify-center px-4">
      <div className="w-full max-w-lg space-y-8">
        <div className="text-center space-y-2">
          <div className="mx-auto flex h-16 w-16 items-center justify-center rounded-full bg-green-100 dark:bg-green-900">
            <svg
              className="h-8 w-8 text-green-600 dark:text-green-400"
              fill="none"
              viewBox="0 0 24 24"
              stroke="currentColor"
              strokeWidth={2}
            >
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                d="M5 13l4 4L19 7"
              />
            </svg>
          </div>
          <h1 className="text-2xl font-bold">セッション完了</h1>
          {session.material && (
            <p className="text-muted-foreground">
              {session.material.subject.name} / {session.material.title}
            </p>
          )}
        </div>

        <div className="grid grid-cols-3 gap-4 text-center">
          <div>
            <p className="text-2xl font-bold">{session.card_reviews.length}</p>
            <p className="text-sm text-muted-foreground">カード数</p>
          </div>
          <div>
            <p className="text-2xl font-bold">
              {Math.round(accuracy * 100)}%
            </p>
            <p className="text-sm text-muted-foreground">正答率</p>
          </div>
          <div>
            <p className="text-2xl font-bold">
              {formatDuration(session.duration_sec)}
            </p>
            <p className="text-sm text-muted-foreground">学習時間</p>
          </div>
        </div>

        {session.card_reviews.length > 0 && (
          <div className="space-y-2">
            <p className="text-sm font-medium">評価分布</p>
            <div className="grid grid-cols-4 gap-2">
              {RATINGS.map((r) => (
                <div key={r} className="text-center">
                  <div
                    className={`${RATING_COLORS[r]} mx-auto mb-1 flex h-10 w-10 items-center justify-center rounded-lg text-white font-bold`}
                  >
                    {ratingCounts[r]}
                  </div>
                  <p className="text-xs text-muted-foreground">
                    {RATING_LABELS[r]}
                  </p>
                </div>
              ))}
            </div>
          </div>
        )}

        <SummaryActions
          sessionId={session.id}
          remainingDueCount={session.remaining_due_count}
          materialId={session.material?.id}
          methodId={session.method_id}
        />
      </div>
    </div>
  );
}
