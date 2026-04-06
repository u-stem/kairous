"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { createSession } from "@/lib/actions/sessions";
import { METHOD_DESCRIPTIONS } from "@/lib/constants";
// MaterialDetail.methods の形状に合わせた最小型（フルテーブル型より依存を減らすため）
type MethodItem = {
  id: string;
  slug: string;
  name: string;
  category: string;
};

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
        // ウィザードと同じ説明文を再利用し、ない場合は手法名で代替する
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
            {dueCount !== undefined && dueCount > 0 && (
              <span className="rounded-full bg-primary px-2.5 py-0.5 text-xs font-medium text-primary-foreground">
                {dueCount}枚
              </span>
            )}
            {loading === method.id && (
              <span className="text-xs text-muted-foreground">...</span>
            )}
          </button>
        );
      })}
      {error && <p className="text-xs text-destructive">{error}</p>}
    </div>
  );
}
