"use client";

import { useState, useCallback } from "react";
import { cn } from "@/lib/utils";
import {
  MATERIAL_METHOD_SLUGS,
  METHOD_CATEGORIES,
  METHOD_DESCRIPTIONS,
  getMethodColorClasses,
  type MethodCategory,
} from "@/lib/constants";
import { Checkbox } from "@/components/ui/checkbox";
import { Pencil, Plus } from "lucide-react";
import { MethodFormSheet } from "@/components/method-form-sheet";
import type { LearningMethod } from "@/lib/types/materials";

type Method = {
  id: string;
  slug: string;
  name: string;
  category: string;
  is_system: boolean;
  description?: string | null;
};

type MethodSelectorProps = {
  methods: Method[];
  selected: string[];
  onChange: (selected: string[]) => void;
  onMethodsChange?: () => void;
};

export function MethodSelector({
  methods,
  selected,
  onChange,
  onMethodsChange,
}: MethodSelectorProps) {
  const [sheetOpen, setSheetOpen] = useState(false);
  const [editingMethod, setEditingMethod] = useState<LearningMethod | null>(
    null,
  );

  // システム手法は MATERIAL_METHOD_SLUGS のみ。カスタム手法は全て表示
  const filteredMethods = methods.filter((m) =>
    m.is_system
      ? (MATERIAL_METHOD_SLUGS as readonly string[]).includes(m.slug)
      : true,
  );

  function toggle(id: string) {
    if (selected.includes(id)) {
      onChange(selected.filter((s) => s !== id));
    } else {
      onChange([...selected, id]);
    }
  }

  const handleSuccess = useCallback(() => {
    onMethodsChange?.();
  }, [onMethodsChange]);

  return (
    <>
      <div className="flex flex-col gap-4">
        {(
          Object.entries(METHOD_CATEGORIES) as [
            MethodCategory,
            { label: string; slugs: readonly string[] },
          ][]
        ).map(([category, { label, slugs }]) => {
          const categoryMethods = filteredMethods.filter((m) =>
            m.is_system ? slugs.includes(m.slug) : m.category === category,
          );
          if (categoryMethods.length === 0) return null;

          return (
            <div key={category} className="flex flex-col gap-2">
              <p className="text-xs font-medium text-muted-foreground">
                {label}
              </p>
              <div className="flex flex-col gap-1.5">
                {categoryMethods.map((method) => {
                  const isSelected = selected.includes(method.id);
                  const colors = getMethodColorClasses(method.category);
                  const desc =
                    METHOD_DESCRIPTIONS[method.slug] ?? method.description;

                  return (
                    <label
                      key={method.id}
                      htmlFor={`method-${method.id}`}
                      className={cn(
                        "flex cursor-pointer items-start gap-3 rounded-lg border p-3 transition-colors",
                        isSelected
                          ? `border-current ${colors.light} ${colors.dark}`
                          : "border-border hover:bg-muted/50",
                      )}
                    >
                      <Checkbox
                        id={`method-${method.id}`}
                        checked={isSelected}
                        onCheckedChange={() => toggle(method.id)}
                      />
                      <div className="flex flex-1 flex-col gap-0.5">
                        <span className="text-sm font-medium">
                          {method.name}
                        </span>
                        {desc && (
                          <span className="text-xs text-muted-foreground">
                            {desc}
                          </span>
                        )}
                      </div>
                      {!method.is_system && (
                        <button
                          type="button"
                          onClick={(e) => {
                            e.preventDefault();
                            setEditingMethod(method as LearningMethod);
                            setSheetOpen(true);
                          }}
                          className="shrink-0 p-1 text-muted-foreground hover:text-foreground"
                          aria-label={`${method.name}を編集`}
                        >
                          <Pencil className="h-3.5 w-3.5" />
                        </button>
                      )}
                    </label>
                  );
                })}
              </div>
            </div>
          );
        })}

        <button
          type="button"
          onClick={() => {
            setEditingMethod(null);
            setSheetOpen(true);
          }}
          className="flex w-full items-center justify-center gap-1.5 rounded-lg border border-dashed border-muted-foreground/30 p-3 text-sm text-muted-foreground hover:bg-muted/50"
        >
          <Plus className="h-4 w-4" />
          手法を作成
        </button>
      </div>

      <MethodFormSheet
        open={sheetOpen}
        onOpenChange={setSheetOpen}
        method={editingMethod}
        onSuccess={handleSuccess}
      />
    </>
  );
}
