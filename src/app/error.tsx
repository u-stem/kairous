"use client";

import Link from "next/link";
import { useEffect } from "react";

export default function GlobalError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  useEffect(() => {
    console.error("Unhandled error:", error);
  }, [error]);

  return (
    <div className="flex min-h-dvh flex-col items-center justify-center gap-4 p-4 text-center">
      <h1 className="text-xl font-bold">エラーが発生しました</h1>
      <p className="text-sm text-muted-foreground">
        {process.env.NODE_ENV === "development" ? error.message : "予期しないエラーが発生しました"}
      </p>
      <div className="flex gap-2">
        <button
          type="button"
          onClick={reset}
          className="rounded-lg border px-4 py-2 text-sm hover:bg-accent"
        >
          再読み込み
        </button>
        <Link
          href="/"
          className="rounded-lg bg-primary px-4 py-2 text-sm text-primary-foreground"
        >
          ホームに戻る
        </Link>
      </div>
    </div>
  );
}
