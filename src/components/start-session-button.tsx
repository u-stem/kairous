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

  async function handleClick() {
    setLoading(true);
    const result = await createSession(materialId, methodId);
    if (result.success) {
      router.push(`/session/${result.data.id}`);
    }
    setLoading(false);
  }

  return (
    <button onClick={() => void handleClick()} disabled={loading} className={className}>
      {loading ? "..." : label}
    </button>
  );
}
