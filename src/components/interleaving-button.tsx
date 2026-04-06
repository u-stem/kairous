"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { createInterleavingSession } from "@/lib/actions/sessions";

type Props = {
  materialIds: string[];
};

export function InterleavingButton({ materialIds }: Props) {
  const router = useRouter();
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function handleClick() {
    setLoading(true);
    setError(null);
    const result = await createInterleavingSession(materialIds);
    if (result.success) {
      router.push(`/session/${result.data.id}`);
    } else {
      setError(result.error);
      setLoading(false);
    }
  }

  return (
    <div>
      <button
        type="button"
        onClick={() => void handleClick()}
        disabled={loading}
        className="w-full rounded-lg bg-green-500 py-3 font-medium text-white hover:bg-green-600 disabled:opacity-50"
      >
        {loading ? "..." : "まとめて学習"}
      </button>
      {error && (
        <p className="mt-1 text-sm text-red-500">{error}</p>
      )}
    </div>
  );
}
