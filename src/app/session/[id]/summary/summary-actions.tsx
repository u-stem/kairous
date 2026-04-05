"use client";

import { useRouter } from "next/navigation";
import { useTransition } from "react";
import { createSession, createRestSession } from "@/lib/actions/sessions";

type Props = {
  sessionId: string;
  remainingDueCount: number;
  materialId?: string;
  methodId?: string;
};

export function SummaryActions({
  sessionId,
  remainingDueCount,
  materialId,
  methodId,
}: Props) {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();

  function handleContinue() {
    if (!materialId || !methodId) return;
    startTransition(async () => {
      const result = await createSession(materialId, methodId);
      if (result.success) {
        router.push(`/session/${result.data.id}`);
      }
    });
  }

  function handleRest() {
    startTransition(async () => {
      const result = await createRestSession(sessionId);
      if (result.success) {
        router.push(`/rest/${result.data.id}`);
      }
    });
  }

  function handleHome() {
    router.push("/");
  }

  const canContinue =
    remainingDueCount > 0 && materialId != null && methodId != null;

  return (
    <div className="space-y-3">
      {canContinue && (
        <button
          type="button"
          disabled={isPending}
          onClick={handleContinue}
          className="w-full rounded-lg bg-primary py-3 font-medium text-primary-foreground disabled:opacity-50"
        >
          続けて学習する
        </button>
      )}
      <button
        type="button"
        disabled={isPending}
        onClick={handleRest}
        className="w-full rounded-lg border py-3 font-medium transition-colors hover:bg-accent disabled:opacity-50"
      >
        安静タイマーを開始 (10分)
      </button>
      <button
        type="button"
        disabled={isPending}
        onClick={handleHome}
        className="w-full rounded-lg border py-3 font-medium transition-colors hover:bg-accent disabled:opacity-50"
      >
        ホームに戻る
      </button>
    </div>
  );
}
