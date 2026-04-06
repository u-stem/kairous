"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { createSession } from "@/lib/actions/sessions";

type Props = {
  materialId: string;
  methodId: string;
  label?: string;
  className?: string;
};

export function StartSessionButton({
  materialId,
  methodId,
  label = "学習",
  className = "rounded-md bg-blue-500 px-3 py-1.5 text-xs font-medium text-white hover:bg-blue-600 disabled:opacity-50",
}: Props) {
  const router = useRouter();
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function handleClick() {
    setLoading(true);
    setError(null);
    const result = await createSession(materialId, methodId);
    if (result.success) {
      router.push(`/session/${result.data.id}`);
    } else {
      setError(result.error);
      setLoading(false);
    }
  }

  return (
    <div>
      <button type="button" onClick={() => void handleClick()} disabled={loading} className={className}>
        {loading ? "..." : label}
      </button>
      {error && (
        <p className="mt-1 text-xs text-red-500">{error}</p>
      )}
    </div>
  );
}
