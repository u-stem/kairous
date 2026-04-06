"use client";

import type { StatsData, StatsPeriod } from "@/lib/types/stats";
import { PeriodSelector } from "./period-selector";
import { SummaryCards } from "./summary-cards";
import { DailyChart } from "./daily-chart";
import { BreakdownChart } from "./breakdown-chart";

export function StatsDashboard({
  data,
  period,
}: {
  data: StatsData;
  period: StatsPeriod;
}) {
  return (
    <div className="space-y-6">
      <PeriodSelector current={period} />
      <SummaryCards summary={data.summary} />
      <section>
        <h3 className="mb-2 font-bold">日別学習時間</h3>
        <DailyChart daily={data.daily} />
      </section>
      <BreakdownChart title="分野別" data={data.bySubject} />
      <BreakdownChart title="手法別" data={data.byMethod} />
    </div>
  );
}
