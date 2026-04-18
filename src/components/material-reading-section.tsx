"use client";

import { useState, useEffect, useTransition } from "react";
import { toast } from "sonner";
import { Loader2 } from "lucide-react";
import { updatePageProgress } from "@/lib/actions/reading";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { MaterialTypeSectionShell } from "@/components/material-type-section-shell";
import { MaterialProgressBar } from "@/components/material-progress-bar";

type Props = {
  materialId: string;
  completedUnits: number;
  totalPages: number | undefined;
  unitLabel: string;
};

// reading タイプ教材の読書進捗セクション。セッションとは独立して手動で
// ページ進捗を記録できるようにする。total_pages が未設定なら上限なし。
export function MaterialReadingSection({
  materialId,
  completedUnits,
  totalPages,
  unitLabel,
}: Props) {
  const [pagesInput, setPagesInput] = useState(String(completedUnits));
  const [isPending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);

  // 別タブでの更新や server action 後の revalidatePath で completedUnits が変わった場合に
  // 入力欄を同期する。ユーザーが編集中 (isPending) の間はフォーカスを奪わないよう skip。
  useEffect(() => {
    if (!isPending) {
      setPagesInput(String(completedUnits));
    }
  }, [completedUnits, isPending]);

  function handleSubmit() {
    const pages = Number(pagesInput);
    if (!Number.isInteger(pages) || pages < 0) {
      setError("0 以上の整数を入力してください");
      return;
    }
    if (totalPages !== undefined && pages > totalPages) {
      setError(`${unitLabel}総数 (${totalPages}) を超えています`);
      return;
    }
    setError(null);

    startTransition(async () => {
      const result = await updatePageProgress(materialId, pages);
      if (!result.success) {
        setError(result.error);
        toast.error(result.error);
        return;
      }
      toast.success("進捗を更新しました");
    });
  }

  return (
    <MaterialTypeSectionShell
      testId="reading-section"
      title="読書進捗"
      error={error}
      errorTestId="reading-error"
    >
      <div className="flex items-center justify-between text-sm">
        <span data-testid="reading-progress-label">
          {completedUnits} / {totalPages ?? "-"} {unitLabel}
        </span>
      </div>
      {totalPages !== undefined && totalPages > 0 && (
        <MaterialProgressBar
          current={completedUnits}
          max={totalPages}
          percentTestId="reading-progress-percent"
          ariaLabel="読書進捗"
        />
      )}

      <div className="flex items-end gap-2">
        <div className="flex flex-1 flex-col gap-1.5">
          <Label htmlFor="reading-pages-input" className="text-xs text-muted-foreground">
            現在の{unitLabel}
          </Label>
          <Input
            id="reading-pages-input"
            type="number"
            min={0}
            max={totalPages}
            value={pagesInput}
            onChange={(e) => setPagesInput(e.target.value)}
            onKeyDown={(e) => {
              // 単一入力フィールドの UX として Enter で更新を実行
              if (e.key === "Enter") {
                e.preventDefault();
                handleSubmit();
              }
            }}
            disabled={isPending}
            data-testid="reading-pages-input"
          />
        </div>
        <Button
          onClick={handleSubmit}
          disabled={isPending}
          data-testid="reading-update-button"
        >
          {isPending && <Loader2 aria-hidden="true" className="animate-spin" />}
          更新
        </Button>
      </div>
    </MaterialTypeSectionShell>
  );
}
