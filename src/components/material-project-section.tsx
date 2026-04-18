"use client";

import { useState, useTransition } from "react";
import { toast } from "sonner";
import { Loader2, Trash2 } from "lucide-react";
import {
  addMilestone,
  toggleMilestone,
  deleteMilestone,
  type ProjectMilestone,
} from "@/lib/actions/project";
import { formatDateString } from "@/lib/utils/date";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { MaterialTypeSectionShell } from "@/components/material-type-section-shell";
import { MaterialProgressBar } from "@/components/material-progress-bar";

type Props = {
  materialId: string;
  milestones: ProjectMilestone[];
  deadline?: string;
  unitLabel: string;
};

// project 教材のマイルストーン管理セクション。
// 追加 / 完了トグル / 削除を Server Action で行い、revalidatePath による再フェッチに任せる。
export function MaterialProjectSection({
  materialId,
  milestones,
  deadline,
  unitLabel,
}: Props) {
  const [nameInput, setNameInput] = useState("");
  const [dateInput, setDateInput] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [pendingIndex, setPendingIndex] = useState<number | null>(null);
  const [isPending, startTransition] = useTransition();

  const doneCount = milestones.filter((m) => m.done).length;
  const totalCount = milestones.length;

  function handleAdd() {
    setError(null);
    const name = nameInput.trim();
    if (!name) {
      setError("マイルストーン名を入力してください");
      return;
    }
    if (name.length > 200) {
      setError("マイルストーン名は 200 文字以内で入力してください");
      return;
    }

    const milestone: ProjectMilestone = {
      name,
      done: false,
      ...(dateInput ? { date: dateInput } : {}),
    };

    startTransition(async () => {
      const result = await addMilestone(materialId, milestone);
      if (!result.success) {
        setError(result.error);
        toast.error(result.error);
        return;
      }
      toast.success("マイルストーンを追加しました");
      setNameInput("");
      setDateInput("");
    });
  }

  function handleToggle(index: number) {
    setPendingIndex(index);
    startTransition(async () => {
      const result = await toggleMilestone(materialId, index);
      setPendingIndex(null);
      if (!result.success) toast.error(result.error);
    });
  }

  function handleDelete(index: number) {
    setPendingIndex(index);
    startTransition(async () => {
      const result = await deleteMilestone(materialId, index);
      setPendingIndex(null);
      if (!result.success) toast.error(result.error);
      else toast.success("マイルストーンを削除しました");
    });
  }

  return (
    <MaterialTypeSectionShell
      testId="project-section"
      title={`マイルストーン (${doneCount} / ${totalCount})`}
      error={error}
      errorTestId="project-error"
    >
      {deadline && (
        <p className="text-xs text-muted-foreground" data-testid="project-deadline">
          締切: {formatDateString(deadline)}
        </p>
      )}

      <MaterialProgressBar
        current={doneCount}
        max={totalCount}
        label="進捗"
        percentTestId="project-percent"
        ariaLabel="マイルストーン進捗"
      />

      {milestones.length > 0 ? (
        <ul className="flex flex-col gap-1.5" data-testid="project-milestones">
          {milestones.map((milestone, index) => (
            <li
              key={index}
              className="flex items-center gap-2 rounded-md border p-2 text-sm"
              data-testid={`project-milestone-${index}`}
            >
              <Checkbox
                checked={milestone.done}
                onCheckedChange={() => handleToggle(index)}
                disabled={isPending}
                aria-label={`マイルストーン「${milestone.name}」の完了を切り替え`}
                data-testid={`project-toggle-${index}`}
              />
              <div className="flex min-w-0 flex-1 flex-col">
                <span
                  className={milestone.done ? "text-muted-foreground line-through" : ""}
                  data-testid={`project-name-${index}`}
                >
                  {milestone.name}
                </span>
                {milestone.date && (
                  <span className="text-xs text-muted-foreground">
                    {formatDateString(milestone.date)}
                  </span>
                )}
              </div>
              <Button
                type="button"
                variant="ghost"
                size="icon"
                onClick={() => handleDelete(index)}
                disabled={isPending}
                aria-label={`マイルストーン「${milestone.name}」を削除`}
                data-testid={`project-delete-${index}`}
              >
                {pendingIndex === index ? (
                  <Loader2 aria-hidden="true" className="animate-spin" />
                ) : (
                  <Trash2 aria-hidden="true" />
                )}
              </Button>
            </li>
          ))}
        </ul>
      ) : (
        <p className="text-xs text-muted-foreground">
          まだ{unitLabel}がありません
        </p>
      )}

      <div className="flex flex-col gap-2 border-t pt-3">
        <div className="grid grid-cols-[1fr_auto] gap-2">
          <div className="flex flex-col gap-1.5">
            <Label htmlFor="project-name-input" className="text-xs text-muted-foreground">
              {unitLabel}名
            </Label>
            <Input
              id="project-name-input"
              value={nameInput}
              onChange={(e) => setNameInput(e.target.value)}
              maxLength={200}
              disabled={isPending}
              data-testid="project-name-input"
            />
          </div>
          <div className="flex flex-col gap-1.5">
            <Label htmlFor="project-date-input" className="text-xs text-muted-foreground">
              期日（任意）
            </Label>
            <Input
              id="project-date-input"
              type="date"
              value={dateInput}
              onChange={(e) => setDateInput(e.target.value)}
              disabled={isPending}
              data-testid="project-date-input"
            />
          </div>
        </div>
        <Button
          onClick={handleAdd}
          disabled={isPending}
          data-testid="project-add-button"
          className="self-end"
        >
          {isPending && pendingIndex === null && (
            <Loader2 aria-hidden="true" className="animate-spin" />
          )}
          追加
        </Button>
      </div>
    </MaterialTypeSectionShell>
  );
}
