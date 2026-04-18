"use client";

import type { ReactNode } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";

type Props = {
  // Card 自体に付ける testid (例: "reading-section"、E2E / small テストで使う)
  testId: string;
  // CardHeader のタイトル (例: "読書進捗"、"マイルストーン (3 / 5)")
  title: string;
  // CardContent の中身。本文 (一覧 / フォーム / 数値カード等) を各 section が差し込む
  children: ReactNode;
  // エラーメッセージ (input validation 失敗等)
  error?: string | null;
  // エラー <p> の testid。既存 section が `<type>-error` 形式で運用しているため
  // 明示指定を優先し、未指定のときのみ `${testId}-error` をデフォルト採用する
  errorTestId?: string;
};

// material-*-section の Card + CardHeader + CardContent + error パターンを共通化する
// 薄い shell。各 section の差異は children で表現する。
// 目的は practice_log / note / project / reading が同じ視覚構造を使うこと、および
// Card の外殻を毎ファイルで書くコスト削減 (#335)。
export function MaterialTypeSectionShell({
  testId,
  title,
  children,
  error,
  errorTestId,
}: Props) {
  return (
    <Card data-testid={testId}>
      <CardHeader>
        <CardTitle className="text-sm">{title}</CardTitle>
      </CardHeader>
      <CardContent className="flex flex-col gap-3">
        {children}
        {error && (
          <p
            className="text-xs text-destructive"
            data-testid={errorTestId ?? `${testId}-error`}
          >
            {error}
          </p>
        )}
      </CardContent>
    </Card>
  );
}
