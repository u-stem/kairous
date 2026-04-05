export function calculateAccuracyRate(reviews: Array<{ rating: number }>): number {
  if (reviews.length === 0) return 0;
  const correct = reviews.filter((r) => r.rating >= 3).length;
  return correct / reviews.length;
}

export function formatDuration(totalSeconds: number): string {
  const minutes = Math.floor(totalSeconds / 60);
  const seconds = totalSeconds % 60;
  return `${minutes}:${String(seconds).padStart(2, "0")}`;
}

export function calculateResponseMs(startedAt: string, answeredAt: string): number {
  return new Date(answeredAt).getTime() - new Date(startedAt).getTime();
}

export function countByRating(
  reviews: Array<{ rating: number }>,
): Record<1 | 2 | 3 | 4, number> {
  const counts = { 1: 0, 2: 0, 3: 0, 4: 0 } as Record<1 | 2 | 3 | 4, number>;
  for (const r of reviews) {
    if (r.rating >= 1 && r.rating <= 4) {
      counts[r.rating as 1 | 2 | 3 | 4]++;
    }
  }
  return counts;
}
