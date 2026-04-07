"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { createSession } from "@/lib/actions/session-commands";
import { METHOD_DESCRIPTIONS } from "@/lib/constants";
import type { MethodItem } from "@/lib/types/materials";

type Props = {
  materialId: string;
  methods: MethodItem[];
  dueCounts?: Record<string, number>;
};

export function MethodSelectList({ materialId, methods, dueCounts }: Props) {
  const router = useRouter();
  const [loading, setLoading] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  async function handleSelect(methodId: string) {
    setLoading(methodId);
    setError(null);
    const result = await createSession(materialId, methodId);
    if (result.success) {
      router.push(`/session/${result.data.id}`);
    } else {
      setError(result.error);
      setLoading(null);
    }
  }

  return (
    <div className="space-y-2">
      {methods.map((method) => {
        const dueCount = dueCounts?.[method.id];
        // METHOD_DESCRIPTIONS に未登録の手法は name をフォールバック表示する
        const description = METHOD_DESCRIPTIONS[method.slug] ?? method.name;

        return (
          <button
            key={method.id}
            type="button"
            onClick={() => void handleSelect(method.id)}
            disabled={loading !== null}
            className="flex w-full items-center justify-between rounded-lg border px-4 py-3 text-left hover:bg-muted disabled:opacity-50"
          >
            <div>
              <p className="text-sm font-medium">{method.name}</p>
              <p className="text-xs text-muted-foreground">{description}</p>
            </div>
            {loading === method.id ? (
              <span className="text-xs text-muted-foreground">...</span>
            ) : (
              dueCount !== undefined && dueCount > 0 && (
                <span className="rounded-full bg-primary px-2.5 py-0.5 text-xs font-medium text-primary-foreground">
                  {dueCount}枚
                </span>
              )
            )}
          </button>
        );
      })}
      {error && <p className="text-xs text-destructive" aria-live="polite">{error}</p>}
    </div>
  );
}
