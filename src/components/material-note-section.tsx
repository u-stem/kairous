"use client";

import { useState, useTransition } from "react";
import { toast } from "sonner";
import { Loader2 } from "lucide-react";
import { updateNoteStats } from "@/lib/actions/note";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { MaterialTypeSectionShell } from "@/components/material-type-section-shell";
import { MaterialProgressBar } from "@/components/material-progress-bar";

type Props = {
  materialId: string;
  sectionCount: number;
  wordCount: number;
  unitLabel: string;
};

// note の word_count 進捗バーの基準値。長文ノート (Zettelkasten) の目安として
// 10000 語を 100% としてスケーリング。超過時は 100% 表示に clamp する
const WORD_COUNT_SCALE = 10000;

// note 教材の section_count / word_count を手動で更新するセクション。
// 目標値がないため section_count は数値カードで表示し、word_count は
// 長文ノートの目安 (10000 語) に対する進捗バーとして視覚化する。
export function MaterialNoteSection({
  materialId,
  sectionCount,
  wordCount,
  unitLabel,
}: Props) {
  const [sectionInput, setSectionInput] = useState(String(sectionCount));
  const [wordInput, setWordInput] = useState(String(wordCount));
  const [error, setError] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();

  function handleSubmit() {
    setError(null);
    const sectionValue = sectionInput.trim();
    const wordValue = wordInput.trim();

    const stats: { section_count?: number; word_count?: number } = {};
    if (sectionValue !== "") {
      const n = Number(sectionValue);
      if (!Number.isInteger(n) || n < 0) {
        setError(`${unitLabel}数は 0 以上の整数で入力してください`);
        return;
      }
      stats.section_count = n;
    }
    if (wordValue !== "") {
      const n = Number(wordValue);
      if (!Number.isInteger(n) || n < 0) {
        setError("語数は 0 以上の整数で入力してください");
        return;
      }
      stats.word_count = n;
    }

    // 両フィールド空のままボタン押下は Server Action を無駄に 1 回呼ぶだけなので早期 return
    if (Object.keys(stats).length === 0) return;

    startTransition(async () => {
      const result = await updateNoteStats(materialId, stats);
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
      testId="note-section"
      title="ノート進捗"
      error={error}
      errorTestId="note-error"
    >
      <div className="grid grid-cols-2 gap-3 text-sm">
        <div className="rounded-md border p-2">
          <p className="text-xs text-muted-foreground">{unitLabel}数</p>
          <p className="text-xl font-semibold" data-testid="note-section-count">
            {sectionCount}
          </p>
        </div>
        <div className="rounded-md border p-2">
          <p className="text-xs text-muted-foreground">語数</p>
          <p className="text-xl font-semibold" data-testid="note-word-count">
            {wordCount}
          </p>
        </div>
      </div>

      <MaterialProgressBar
        current={wordCount}
        max={WORD_COUNT_SCALE}
        label={`語数の目安 (${WORD_COUNT_SCALE} 語)`}
        percentTestId="note-word-percent"
        ariaLabel="語数進捗"
      />

      <div className="grid grid-cols-2 gap-2">
        <div className="flex flex-col gap-1.5">
          <Label htmlFor="note-section-input" className="text-xs text-muted-foreground">
            {unitLabel}数を更新
          </Label>
          <Input
            id="note-section-input"
            type="number"
            min={0}
            value={sectionInput}
            onChange={(e) => setSectionInput(e.target.value)}
            disabled={isPending}
            data-testid="note-section-input"
          />
        </div>
        <div className="flex flex-col gap-1.5">
          <Label htmlFor="note-word-input" className="text-xs text-muted-foreground">
            語数を更新
          </Label>
          <Input
            id="note-word-input"
            type="number"
            min={0}
            value={wordInput}
            onChange={(e) => setWordInput(e.target.value)}
            disabled={isPending}
            data-testid="note-word-input"
          />
        </div>
      </div>

      <Button
        onClick={handleSubmit}
        disabled={isPending}
        data-testid="note-update-button"
        className="self-end"
      >
        {isPending && <Loader2 aria-hidden="true" className="animate-spin" />}
        更新
      </Button>
    </MaterialTypeSectionShell>
  );
}
