"use client";

import {
  BarChart,
  Bar,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
} from "recharts";
import { format, parseISO } from "date-fns";
import { ja } from "date-fns/locale";
import type { DailyData } from "@/lib/types/stats";
import { formatStudyTime } from "@/lib/utils/stats";

type ChartItem = {
  date: string;
  label: string;
  minutes: number;
  totalSec: number;
};

function CustomTooltip({
  active,
  payload,
}: {
  active?: boolean;
  payload?: Array<{ payload: ChartItem }>;
}) {
  if (!active || !payload?.[0]) return null;
  const data = payload[0].payload;
  return (
    <div className="rounded-lg border bg-white p-2 text-sm shadow-sm">
      <p className="font-medium">{data.label}</p>
      <p className="text-gray-600">{formatStudyTime(data.totalSec)}</p>
    </div>
  );
}

export function DailyChart({ daily }: { daily: DailyData[] }) {
  const chartData: ChartItem[] = daily.map((d) => ({
    date: d.date,
    label: format(parseISO(d.date), "M/d (E)", { locale: ja }),
    minutes: Math.round(d.totalSec / 60),
    totalSec: d.totalSec,
  }));

  if (chartData.length === 0) {
    return (
      <div className="flex h-40 items-center justify-center text-sm text-gray-400">
        データがありません
      </div>
    );
  }

  return (
    <ResponsiveContainer width="100%" height={200}>
      <BarChart data={chartData}>
        <CartesianGrid strokeDasharray="3 3" vertical={false} />
        <XAxis
          dataKey="label"
          tick={{ fontSize: 11 }}
          tickLine={false}
          axisLine={false}
        />
        <YAxis
          tick={{ fontSize: 11 }}
          tickLine={false}
          axisLine={false}
          tickFormatter={(v: number) => `${v}m`}
        />
        <Tooltip content={<CustomTooltip />} />
        <Bar dataKey="minutes" fill="#7c3aed" radius={[4, 4, 0, 0]} />
      </BarChart>
    </ResponsiveContainer>
  );
}
