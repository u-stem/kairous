"use server";

import { createClient } from "@/lib/supabase/server";
import type { StatsData, StatsPeriod } from "@/lib/types/stats";
import { aggregateDaily, aggregateByKey } from "@/lib/utils/stats";

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
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return EMPTY_STATS;

  const today = new Date();
  const currentStart = new Date(today);
  currentStart.setDate(currentStart.getDate() - period);
  const prevStart = new Date(currentStart);
  prevStart.setDate(prevStart.getDate() - period);

  const currentStartStr = currentStart.toISOString().split("T")[0];
  const prevStartStr = prevStart.toISOString().split("T")[0];

  // 現在 + 前期間を1クエリで取得し、コード側で分割する
  const { data: logs } = await supabase
    .from("daily_logs")
    .select("log_date, total_sec, session_count, cards_reviewed, subject_id, method_id")
    .eq("user_id", user.id)
    .gte("log_date", prevStartStr)
    .order("log_date", { ascending: true });

  if (!logs || logs.length === 0) return EMPTY_STATS;

  const currentLogs = logs.filter((l) => l.log_date >= currentStartStr);
  const prevLogs = logs.filter((l) => l.log_date < currentStartStr);

  const sum = (arr: typeof logs, key: "total_sec" | "session_count" | "cards_reviewed") =>
    arr.reduce((acc, row) => acc + row[key], 0);

  // 分野・手法の名前を取得
  const { data: subjects } = await supabase
    .from("subjects")
    .select("id, name")
    .eq("user_id", user.id)
    .order("name");

  const { data: methods } = await supabase
    .from("learning_methods")
    .select("id, name")
    .order("name");

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
