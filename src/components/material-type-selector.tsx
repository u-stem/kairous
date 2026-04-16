"use client";

import { Layers, BookOpen, Target, Dumbbell, FileText } from "lucide-react";
import type { LucideIcon } from "lucide-react";
import { MATERIAL_TYPES, MATERIAL_TYPE_LABELS } from "@/lib/constants";
import type { MaterialType } from "@/lib/constants";
import { cn } from "@/lib/utils";

// タイプとアイコンの対応。lucide-react の Icon コンポーネントとして管理する
const TYPE_ICONS: Record<MaterialType, LucideIcon> = {
  flashcard: Layers,
  reading: BookOpen,
  project: Target,
  practice_log: Dumbbell,
  note: FileText,
};

type Props = {
  value: MaterialType;
  onChange: (type: MaterialType) => void;
};

export function MaterialTypeSelector({ value, onChange }: Props) {
  function handleKeyDown(e: React.KeyboardEvent, type: MaterialType) {
    // Enter または Space で選択できるようにする (radio group の標準的なキーボード操作)
    if (e.key === "Enter" || e.key === " ") {
      e.preventDefault();
      onChange(type);
    }
  }

  return (
    <div role="radiogroup" aria-label="教材タイプを選択" className="flex flex-col gap-2">
      {MATERIAL_TYPES.map((type) => {
        const Icon = TYPE_ICONS[type];
        const { label, description } = MATERIAL_TYPE_LABELS[type];
        const isSelected = value === type;

        return (
          <div
            key={type}
            role="radio"
            aria-checked={isSelected}
            tabIndex={isSelected ? 0 : -1}
            data-testid={`material-type-option-${type}`}
            onClick={() => onChange(type)}
            onKeyDown={(e) => handleKeyDown(e, type)}
            className={cn(
              "flex cursor-pointer items-center gap-3 rounded-lg border p-3 transition-colors",
              isSelected
                ? "border-primary bg-primary/5"
                : "border-border hover:bg-muted/50",
            )}
          >
            <Icon
              aria-hidden="true"
              className={cn(
                "h-5 w-5 shrink-0",
                isSelected ? "text-primary" : "text-muted-foreground",
              )}
            />
            <div className="flex flex-col gap-0.5">
              <span className="text-sm font-medium">{label}</span>
              <span className="text-xs text-muted-foreground">{description}</span>
            </div>
          </div>
        );
      })}
    </div>
  );
}
