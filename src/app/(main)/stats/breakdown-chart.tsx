"use client";

import { PieChart, Pie, Sector, ResponsiveContainer } from "recharts";
import type { PieSectorShapeProps } from "recharts";
import type { BreakdownItem } from "@/lib/types/stats";
import { formatStudyTime } from "@/lib/utils/stats";

const COLORS = ["#7c3aed", "#a78bfa", "#c4b5fd", "#ddd6fe", "#ede9fe"];

// Cell は recharts v3 で deprecated になったため、shape prop でセクターごとの色を制御する
// Recharts v3 の shape は単一の props オブジェクトのみ渡すため、index は別パラメータとして受け取れない
function renderSector(props: PieSectorShapeProps) {
  const idx = (props as PieSectorShapeProps & { index?: number }).index ?? 0;
  return <Sector {...props} fill={COLORS[idx % COLORS.length]} />;
}

export function BreakdownChart({
  title,
  data,
}: {
  title: string;
  data: BreakdownItem[];
}) {
  if (data.length === 0) {
    return (
      <section>
        <h3 className="mb-2 font-bold">{title}</h3>
        <p className="text-sm text-gray-400">データがありません</p>
      </section>
    );
  }

  return (
    <section>
      <h3 className="mb-2 font-bold">{title}</h3>
      <div className="flex items-center gap-4">
        <div className="h-28 w-28 shrink-0">
          <ResponsiveContainer width="100%" height="100%">
            <PieChart>
              <Pie
                data={data}
                dataKey="totalSec"
                nameKey="name"
                cx="50%"
                cy="50%"
                innerRadius={25}
                outerRadius={50}
                paddingAngle={2}
                shape={renderSector}
              />
            </PieChart>
          </ResponsiveContainer>
        </div>
        <ul className="flex-1 space-y-1 text-sm">
          {data.map((item, i) => (
            <li key={item.id} className="flex items-center justify-between">
              <span className="flex items-center gap-2">
                <span
                  className="inline-block h-2.5 w-2.5 rounded-full"
                  style={{ backgroundColor: COLORS[i % COLORS.length] }}
                />
                {item.name}
              </span>
              <span className="text-gray-500">{formatStudyTime(item.totalSec)}</span>
            </li>
          ))}
        </ul>
      </div>
    </section>
  );
}
