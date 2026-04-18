"use client";

import { useState, useTransition } from "react";
import { toast } from "sonner";
import { Loader2, Trash2 } from "lucide-react";
import { format } from "date-fns";
import {
  addPracticeLogEntry,
  deletePracticeLogEntry,
  type PracticeLogEntry,
} from "@/lib/actions/practice-log";
import { toJstDateString } from "@/lib/utils/date";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";

type EntrySchema = "reps" | "duration" | "freeform";

type Props = {
  materialId: string;
  entries: PracticeLogEntry[];
  entrySchema: EntrySchema;
  unitLabel: string;
};

const RECENT_ENTRY_LIMIT = 10;

const SCHEMA_LABEL: Record<EntrySchema, string> = {
  reps: "回数",
  duration: "時間",
  freeform: "記録",
};

// practice_log 教材のエントリ追加 / 一覧 / 削除。
// Server Action の revalidatePath で再フェッチされるため楽観更新はしない。
export function MaterialPracticeLogSection({
  materialId,
  entries,
  entrySchema,
  unitLabel,
}: Props) {
  const [date, setDate] = useState(() => toJstDateString(new Date()));
  const [valueInput, setValueInput] = useState("");
  const [note, setNote] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [pendingDeleteIndex, setPendingDeleteIndex] = useState<number | null>(null);
  const [isPending, startTransition] = useTransition();

  // meta.entries は append 順のため、末尾から固定件数を逆順表示する
  const displayEntries = entries
    .map((entry, originalIndex) => ({ entry, originalIndex }))
    .slice(-RECENT_ENTRY_LIMIT)
    .reverse();

  function handleAdd() {
    setError(null);
    if (!valueInput.trim()) {
      setError("値を入力してください");
      return;
    }
    let value: PracticeLogEntry["value"];
    if (entrySchema === "freeform") {
      value = valueInput.trim();
    } else {
      const n = Number(valueInput);
      if (!Number.isFinite(n) || n < 0) {
        setError("0 以上の数値を入力してください");
        return;
      }
      value = n;
    }

    const entry: PracticeLogEntry = {
      date,
      value,
      ...(note.trim() ? { note: note.trim() } : {}),
    };

    startTransition(async () => {
      const result = await addPracticeLogEntry(materialId, entry);
      if (!result.success) {
        setError(result.error);
        toast.error(result.error);
        return;
      }
      toast.success("エントリを追加しました");
      setValueInput("");
      setNote("");
    });
  }

  function handleDelete(originalIndex: number) {
    setPendingDeleteIndex(originalIndex);
    startTransition(async () => {
      const result = await deletePracticeLogEntry(materialId, originalIndex);
      setPendingDeleteIndex(null);
      if (!result.success) toast.error(result.error);
      else toast.success("エントリを削除しました");
    });
  }

  return (
    <Card data-testid="practice-log-section">
      <CardHeader>
        <CardTitle className="text-sm">練習記録 ({entries.length}件)</CardTitle>
      </CardHeader>
      <CardContent className="flex flex-col gap-4">
        <div className="flex flex-col gap-2">
          <div className="grid grid-cols-2 gap-2">
            <div className="flex flex-col gap-1.5">
              <Label htmlFor="practice-log-date" className="text-xs text-muted-foreground">
                日付
              </Label>
              <Input
                id="practice-log-date"
                type="date"
                value={date}
                onChange={(e) => setDate(e.target.value)}
                disabled={isPending}
                data-testid="practice-log-date-input"
              />
            </div>
            <div className="flex flex-col gap-1.5">
              <Label htmlFor="practice-log-value" className="text-xs text-muted-foreground">
                {SCHEMA_LABEL[entrySchema]} ({unitLabel})
              </Label>
              <Input
                id="practice-log-value"
                type={entrySchema === "freeform" ? "text" : "number"}
                min={entrySchema === "freeform" ? undefined : 0}
                value={valueInput}
                onChange={(e) => setValueInput(e.target.value)}
                disabled={isPending}
                data-testid="practice-log-value-input"
              />
            </div>
          </div>
          <div className="flex flex-col gap-1.5">
            <Label htmlFor="practice-log-note" className="text-xs text-muted-foreground">
              メモ（任意）
            </Label>
            <Textarea
              id="practice-log-note"
              value={note}
              onChange={(e) => setNote(e.target.value)}
              rows={2}
              disabled={isPending}
              data-testid="practice-log-note-input"
            />
          </div>
          <Button
            onClick={handleAdd}
            disabled={isPending}
            data-testid="practice-log-add-button"
            className="self-end"
          >
            {isPending && pendingDeleteIndex === null && (
              <Loader2 aria-hidden="true" className="animate-spin" />
            )}
            追加
          </Button>
          {error && (
            <p className="text-xs text-destructive" data-testid="practice-log-error">
              {error}
            </p>
          )}
        </div>

        {displayEntries.length > 0 ? (
          <ul className="flex flex-col gap-1.5" data-testid="practice-log-entries">
            {displayEntries.map(({ entry, originalIndex }) => (
              <li
                key={originalIndex}
                className="flex items-start justify-between gap-2 rounded-md border p-2 text-sm"
                data-testid={`practice-log-entry-${originalIndex}`}
              >
                <div className="flex min-w-0 flex-col gap-0.5">
                  <span className="text-xs text-muted-foreground">
                    {format(new Date(entry.date), "yyyy/M/d")}
                  </span>
                  <span className="font-medium">
                    {typeof entry.value === "number"
                      ? `${entry.value} ${unitLabel}`
                      : entry.value}
                  </span>
                  {entry.note && (
                    <span className="truncate text-xs text-muted-foreground">
                      {entry.note}
                    </span>
                  )}
                </div>
                <Button
                  type="button"
                  variant="ghost"
                  size="icon"
                  onClick={() => handleDelete(originalIndex)}
                  disabled={isPending}
                  aria-label={`${format(new Date(entry.date), "yyyy/M/d")} のエントリを削除`}
                  data-testid={`practice-log-delete-${originalIndex}`}
                >
                  {pendingDeleteIndex === originalIndex ? (
                    <Loader2 aria-hidden="true" className="animate-spin" />
                  ) : (
                    <Trash2 aria-hidden="true" />
                  )}
                </Button>
              </li>
            ))}
          </ul>
        ) : (
          <p className="text-xs text-muted-foreground">まだエントリがありません</p>
        )}
      </CardContent>
    </Card>
  );
}
