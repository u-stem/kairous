"use client";

import { useState, useTransition } from "react";
import { toast } from "sonner";
import { Loader2 } from "lucide-react";
import { updateNoteStats } from "@/lib/actions/note";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";

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

  const wordPercent = Math.min(
    100,
    Math.round((wordCount / WORD_COUNT_SCALE) * 100),
  );

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
    <Card data-testid="note-section">
      <CardHeader>
        <CardTitle className="text-sm">ノート進捗</CardTitle>
      </CardHeader>
      <CardContent className="flex flex-col gap-3">
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

        <div className="flex flex-col gap-1.5">
          <div className="flex items-center justify-between text-xs">
            <span className="text-muted-foreground">
              語数の目安 ({WORD_COUNT_SCALE} 語)
            </span>
            <span className="text-muted-foreground" data-testid="note-word-percent">
              {wordPercent}%
            </span>
          </div>
          <div
            className="h-2 w-full overflow-hidden rounded-full bg-muted"
            role="progressbar"
            aria-valuenow={wordCount}
            aria-valuemin={0}
            aria-valuemax={WORD_COUNT_SCALE}
            aria-label="語数進捗"
          >
            <div
              className="h-full bg-primary transition-all"
              style={{ width: `${wordPercent}%` }}
            />
          </div>
        </div>

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

        {error && (
          <p className="text-xs text-destructive" data-testid="note-error">
            {error}
          </p>
        )}
      </CardContent>
    </Card>
  );
}
