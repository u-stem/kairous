"use client";

import { useRouter, usePathname } from "next/navigation";
import type { StatsPeriod } from "@/lib/types/stats";

const PERIODS: { value: StatsPeriod; label: string }[] = [
  { value: 7, label: "7日" },
  { value: 30, label: "30日" },
  { value: 90, label: "90日" },
];

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
