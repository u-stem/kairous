"use client";

import Link from "next/link";
import { useEffect } from "react";

export default function SessionError({
  error,
  // Next.js Error Boundary 規約の引数。セッション中断後の状態復元が困難なため使用しない
  reset: _reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  useEffect(() => {
    console.error("Session error:", error);
  }, [error]);

  return (
    <div className="flex min-h-dvh flex-col items-center justify-center gap-4 p-4 text-center">
      <h1 className="text-xl font-bold">セッションエラー</h1>
      <p className="text-sm text-muted-foreground">
        {process.env.NODE_ENV === "development" ? error.message : "セッションの読み込みに失敗しました"}
      </p>
      <Link
        href="/"
        className="rounded-lg bg-primary px-4 py-2 text-sm text-primary-foreground"
      >
        ホームに戻る
      </Link>
    </div>
  );
}
