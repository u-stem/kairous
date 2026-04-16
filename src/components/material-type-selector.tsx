"use client";

import { useRef } from "react";
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
  disabled?: boolean;
};

export function MaterialTypeSelector({ value, onChange, disabled = false }: Props) {
  const currentIdx = MATERIAL_TYPES.indexOf(value);
  // WAI-ARIA radio group の Arrow キー操作で DOM フォーカスを選択先に追随させるため ref 配列を保持する
  const refs = useRef<(HTMLDivElement | null)[]>([]);

  function handleKeyDown(e: React.KeyboardEvent, type: MaterialType) {
    if (disabled) return;
    // WAI-ARIA radio group 仕様: Arrow で隣接する選択肢に移動して自動選択する
    if (e.key === "ArrowDown" || e.key === "ArrowRight") {
      e.preventDefault();
      const nextIdx = (currentIdx + 1) % MATERIAL_TYPES.length;
      onChange(MATERIAL_TYPES[nextIdx]);
      refs.current[nextIdx]?.focus();
    } else if (e.key === "ArrowUp" || e.key === "ArrowLeft") {
      e.preventDefault();
      const prevIdx = (currentIdx - 1 + MATERIAL_TYPES.length) % MATERIAL_TYPES.length;
      onChange(MATERIAL_TYPES[prevIdx]);
      refs.current[prevIdx]?.focus();
    } else if (e.key === "Enter" || e.key === " ") {
      // Enter または Space で現在フォーカス中の項目を選択する
      e.preventDefault();
      onChange(type);
    }
  }

  return (
    <div role="radiogroup" aria-label="教材タイプを選択" className="flex flex-col gap-2">
      {MATERIAL_TYPES.map((type, idx) => {
        const Icon = TYPE_ICONS[type];
        const { label, description } = MATERIAL_TYPE_LABELS[type];
        const isSelected = value === type;

        return (
          <div
            key={type}
            ref={(el) => { refs.current[idx] = el; }}
            role="radio"
            aria-checked={isSelected}
            aria-disabled={disabled}
            tabIndex={isSelected ? 0 : -1}
            data-testid={`material-type-option-${type}`}
            onClick={() => { if (!disabled) onChange(type); }}
            onKeyDown={(e) => handleKeyDown(e, type)}
            className={cn(
              "flex items-center gap-3 rounded-lg border p-3 transition-colors",
              disabled
                ? "cursor-not-allowed opacity-50"
                : "cursor-pointer",
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
