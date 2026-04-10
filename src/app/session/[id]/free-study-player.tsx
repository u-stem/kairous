"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { useCustomTimer } from "./use-custom-timer";
import { completeFreeStudySession } from "@/lib/actions/session-commands";
import { formatDuration } from "@/lib/session-utils";
import { Button } from "@/components/ui/button";

type Props = {
  sessionId: string;
  methodName: string;
  materialTitle: string | null;
};

export function FreeStudyPlayer({ sessionId, methodName, materialTitle }: Props) {
  const router = useRouter();
  // targetDurationSec = null でカウントアップモード
  const timer = useCustomTimer(null);
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  useEffect(() => {
    timer.start();
    // eslint-disable-next-line react-hooks/exhaustive-deps -- mount only
  }, []);

  async function handleComplete() {
    timer.pause();
    setSubmitting(true);
    const result = await completeFreeStudySession(sessionId, timer.elapsedSeconds);
    if (result.success) {
      router.push(`/session/${sessionId}/summary`);
    } else {
      setError(result.error);
      setSubmitting(false);
    }
  }

  return (
    <div className="mx-auto flex min-h-dvh max-w-md flex-col items-center justify-center p-4">
      <p className="mb-1 text-sm font-medium text-muted-foreground">{methodName}</p>
      {materialTitle && (
        <p className="mb-4 text-xs text-muted-foreground">{materialTitle}</p>
      )}

      <p className="mt-4 text-3xl font-bold tabular-nums">
        {formatDuration(timer.elapsedSeconds)}
      </p>

      <div className="mt-6 flex gap-3">
        {timer.isRunning ? (
          <Button variant="outline" type="button" onClick={timer.pause}>
            一時停止
          </Button>
        ) : (
          <Button variant="outline" type="button" onClick={timer.start}>
            再開
          </Button>
        )}
        <Button type="button" onClick={() => void handleComplete()} disabled={submitting}>
          完了
        </Button>
      </div>

      {error && <p className="mt-4 text-sm text-destructive">{error}</p>}
    </div>
  );
}
