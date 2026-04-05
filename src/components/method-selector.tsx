"use client";

import { cn } from "@/lib/utils";
import {
  MATERIAL_METHOD_SLUGS,
  METHOD_CATEGORIES,
  METHOD_DESCRIPTIONS,
  getMethodColorClasses,
  type MethodCategory,
} from "@/lib/constants";
import { Checkbox } from "@/components/ui/checkbox";

type Method = {
  id: string;
  slug: string;
  name: string;
  category: string;
};

type MethodSelectorProps = {
  methods: Method[];
  selected: string[];
  onChange: (selected: string[]) => void;
};

export function MethodSelector({ methods, selected, onChange }: MethodSelectorProps) {
  // MATERIAL_METHOD_SLUGS のみを対象とし、ウィザード外の手法を除外する
  const filteredMethods = methods.filter((m) =>
    (MATERIAL_METHOD_SLUGS as readonly string[]).includes(m.slug)
  );

  function toggle(id: string) {
    if (selected.includes(id)) {
      onChange(selected.filter((s) => s !== id));
    } else {
      onChange([...selected, id]);
    }
  }

  return (
    <div className="flex flex-col gap-4">
      {(Object.entries(METHOD_CATEGORIES) as [MethodCategory, { label: string; slugs: readonly string[] }][]).map(
        ([category, { label, slugs }]) => {
          const categoryMethods = filteredMethods.filter((m) =>
            slugs.includes(m.slug)
          );
          if (categoryMethods.length === 0) return null;

          return (
            <div key={category} className="flex flex-col gap-2">
              <p className="text-xs font-medium text-muted-foreground">{label}</p>
              <div className="flex flex-col gap-1.5">
                {categoryMethods.map((method) => {
                  const isSelected = selected.includes(method.id);
                  const colors = getMethodColorClasses(method.category);

                  return (
                    <label
                      key={method.id}
                      htmlFor={`method-${method.id}`}
                      className={cn(
                        "flex cursor-pointer items-start gap-3 rounded-lg border p-3 transition-colors",
                        isSelected
                          ? `border-current ${colors.light} ${colors.dark}`
                          : "border-border hover:bg-muted/50"
                      )}
                    >
                      <Checkbox
                        id={`method-${method.id}`}
                        checked={isSelected}
                        onCheckedChange={() => toggle(method.id)}
                      />
                      <div className="flex flex-col gap-0.5">
                        <span className="text-sm font-medium">{method.name}</span>
                        {METHOD_DESCRIPTIONS[method.slug] && (
                          <span className="text-xs text-muted-foreground">
                            {METHOD_DESCRIPTIONS[method.slug]}
                          </span>
                        )}
                      </div>
                    </label>
                  );
                })}
              </div>
            </div>
          );
        }
      )}
    </div>
  );
}
