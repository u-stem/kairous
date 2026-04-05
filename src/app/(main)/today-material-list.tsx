"use client";

import type { DueMaterial } from "@/lib/types/sessions";
import { StartSessionButton } from "@/components/start-session-button";

export function TodayMaterialList({ materials }: { materials: DueMaterial[] }) {
  return (
    <div className="space-y-2">
      {materials.map((m) => (
        <div
          key={m.id}
          className="flex items-center justify-between rounded-lg bg-muted p-3"
        >
          <div>
            <div className="font-medium">{m.title}</div>
            <div className="text-xs text-muted-foreground">{m.subject.name}</div>
          </div>
          <div className="flex items-center gap-2">
            <span className="text-sm text-orange-500">{m.due_count}枚</span>
            <StartSessionButton materialId={m.id} methodId={m.srs_method_id} />
          </div>
        </div>
      ))}
    </div>
  );
}
