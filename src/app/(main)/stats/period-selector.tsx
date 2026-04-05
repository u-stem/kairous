"use client";

import { useRouter, usePathname } from "next/navigation";
import { STATS_PERIODS } from "@/lib/constants";
import type { StatsPeriod } from "@/lib/types/stats";

const PERIOD_LABELS: Record<StatsPeriod, string> = {
  7: "7日",
  30: "30日",
  90: "90日",
};

const PERIODS = STATS_PERIODS.map((value) => ({
  value,
  label: PERIOD_LABELS[value],
}));

export function PeriodSelector({ current }: { current: StatsPeriod }) {
  const router = useRouter();
  const pathname = usePathname();

  return (
    <div className="flex gap-2">
      {PERIODS.map(({ value, label }) => (
        <button
          key={value}
          onClick={() => router.push(`${pathname}?period=${value}`)}
          className={`rounded-full px-3 py-1 text-sm font-medium transition-colors ${
            current === value
              ? "bg-purple-600 text-white"
              : "bg-gray-100 text-gray-600 hover:bg-gray-200"
          }`}
        >
          {label}
        </button>
      ))}
    </div>
  );
}
