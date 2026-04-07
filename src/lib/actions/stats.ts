"use server";

import { z } from "zod";
import { redirect } from "next/navigation";
import { STATS_PERIODS } from "@/lib/constants";
import { getAuthenticatedUser } from "@/lib/actions/auth-utils";
import type { StatsData, StatsPeriod } from "@/lib/types/stats";
import { aggregateDaily, aggregateByKey } from "@/lib/utils/stats";
import { toJstDateString } from "@/lib/utils/date";

// STATS_PERIODS と同期した union を生成し、定数追加時に漏れを防ぐ
const periodSchema = z.union(
  STATS_PERIODS.map((v) => z.literal(v)) as [z.ZodLiteral<7>, z.ZodLiteral<30>, z.ZodLiteral<90>],
);

const EMPTY_STATS: StatsData = {
  summary: {
    totalSec: 0,
    sessionCount: 0,
    cardsReviewed: 0,
    prevTotalSec: 0,
    prevSessionCount: 0,
    prevCardsReviewed: 0,
  },
  daily: [],
  bySubject: [],
  byMethod: [],
};

export async function getStats(period: StatsPeriod): Promise<StatsData> {
  // Server Action は外部から任意の値を受け取れるため、型に頼らず実行時にバリデーションする
  const parsed = periodSchema.safeParse(period);
  if (!parsed.success) return EMPTY_STATS;

  const { user, supabase } = await getAuthenticatedUser();
  if (!user) redirect("/auth/login");

  const today = new Date();
  const currentStart = new Date(today);
  currentStart.setDate(currentStart.getDate() - parsed.data);
  const prevStart = new Date(currentStart);
  prevStart.setDate(prevStart.getDate() - parsed.data);

  // toISOString() は UTC 基準のため、JST 23:00 の学習が翌日扱いになる問題を防ぐ
  const currentStartStr = toJstDateString(currentStart);
  const prevStartStr = toJstDateString(prevStart);

  // 現在 + 前期間を1クエリで取得し、コード側で分割する
  const { data: logs, error } = await supabase
    .from("daily_logs")
    .select("log_date, total_sec, session_count, cards_reviewed, subject_id, method_id")
    .eq("user_id", user.id)
    .gte("log_date", prevStartStr)
    .order("log_date", { ascending: true });

  if (error) throw new Error(`getStats failed: ${error.message}`);
  if (!logs || logs.length === 0) return EMPTY_STATS;

  const currentLogs = logs.filter((l) => l.log_date >= currentStartStr);
  const prevLogs = logs.filter((l) => l.log_date < currentStartStr);

  const sum = (arr: typeof logs, key: "total_sec" | "session_count" | "cards_reviewed") =>
    arr.reduce((acc, row) => acc + row[key], 0);

  // 分野・手法は互いに依存しないため並列取得してレイテンシを削減する
  const [{ data: subjects }, { data: methods }] = await Promise.all([
    supabase.from("subjects").select("id, name").eq("user_id", user.id).order("name"),
    supabase.from("learning_methods").select("id, name").order("name"),
  ]);

  const subjectNames = new Map(
    (subjects ?? []).map((s: { id: string; name: string }) => [s.id, s.name]),
  );
  const methodNames = new Map(
    (methods ?? []).map((m: { id: string; name: string }) => [m.id, m.name]),
  );

  return {
    summary: {
      totalSec: sum(currentLogs, "total_sec"),
      sessionCount: sum(currentLogs, "session_count"),
      cardsReviewed: sum(currentLogs, "cards_reviewed"),
      prevTotalSec: sum(prevLogs, "total_sec"),
      prevSessionCount: sum(prevLogs, "session_count"),
      prevCardsReviewed: sum(prevLogs, "cards_reviewed"),
    },
    daily: aggregateDaily(currentLogs),
    bySubject: aggregateByKey(currentLogs, "subject_id", subjectNames),
    byMethod: aggregateByKey(currentLogs, "method_id", methodNames),
  };
}
