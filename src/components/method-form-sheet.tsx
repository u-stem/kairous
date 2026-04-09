"use client";

import { useState, useTransition, useEffect } from "react";
import {
  Sheet,
  SheetContent,
  SheetHeader,
  SheetTitle,
} from "@/components/ui/sheet";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { METHOD_CATEGORIES, type MethodCategory } from "@/lib/constants";
import {
  createMethod,
  updateMethod,
  deleteMethod,
} from "@/lib/actions/method-commands";
import type { LearningMethod } from "@/lib/types/materials";

type Props = {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  method?: LearningMethod | null;
  onSuccess: () => void;
};

const CATEGORIES = Object.entries(METHOD_CATEGORIES) as [
  MethodCategory,
  { label: string },
][];

export function MethodFormSheet({
  open,
  onOpenChange,
  method,
  onSuccess,
}: Props) {
  const isEdit = !!method;
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const [fieldErrors, setFieldErrors] = useState<Record<string, string[]>>({});

  const [name, setName] = useState(method?.name ?? "");
  const [category, setCategory] = useState<string>(
    method?.category ?? "general",
  );
  const [description, setDescription] = useState(method?.description ?? "");
  const [durationMin, setDurationMin] = useState<string>(
    method?.default_duration_sec
      ? String(method.default_duration_sec / 60)
      : "",
  );

  // Sheet は常にマウント済みのため、method prop 変更時に state をリセットする
  useEffect(() => {
    setName(method?.name ?? "");
    setCategory(method?.category ?? "general");
    setDescription(method?.description ?? "");
    setDurationMin(
      method?.default_duration_sec ? String(method.default_duration_sec / 60) : "",
    );
    setError(null);
    setFieldErrors({});
  }, [method]);

  function resetForm() {
    setName("");
    setCategory("general");
    setDescription("");
    setDurationMin("");
    setError(null);
    setFieldErrors({});
  }

  function handleSubmit() {
    setError(null);
    setFieldErrors({});

    const durationSec = durationMin ? Number(durationMin) * 60 : null;
    const input = {
      name,
      category,
      description: description || undefined,
      default_duration_sec: durationSec,
    };

    startTransition(async () => {
      const result =
        isEdit && method
          ? await updateMethod(method.id, input)
          : await createMethod(input);

      if (result.success) {
        resetForm();
        onSuccess();
        onOpenChange(false);
      } else {
        setError(result.error);
        if ("fieldErrors" in result && result.fieldErrors) {
          setFieldErrors(result.fieldErrors);
        }
      }
    });
  }

  function handleDelete() {
    if (!method) return;
    startTransition(async () => {
      const result = await deleteMethod(method.id);
      if (result.success) {
        resetForm();
        onSuccess();
        onOpenChange(false);
      } else {
        setError(result.error);
      }
    });
  }

  return (
    <Sheet
      open={open}
      onOpenChange={(v) => {
        if (!v) resetForm();
        onOpenChange(v);
      }}
    >
      <SheetContent side="bottom" className="max-h-[85dvh] overflow-y-auto">
        <SheetHeader>
          <SheetTitle>{isEdit ? "手法を編集" : "新しい手法を作成"}</SheetTitle>
        </SheetHeader>

        <div className="mt-4 flex flex-col gap-4">
          <div>
            <Label htmlFor="method-name">名前 *</Label>
            <Input
              id="method-name"
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="例: ファインマンテクニック"
              maxLength={50}
            />
            {fieldErrors.name && (
              <p className="mt-1 text-xs text-destructive">
                {fieldErrors.name[0]}
              </p>
            )}
          </div>

          <div>
            <Label htmlFor="method-category">カテゴリ *</Label>
            <Select value={category} onValueChange={(v) => { if (v) setCategory(v); }}>
              <SelectTrigger id="method-category">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {CATEGORIES.map(([key, { label }]) => (
                  <SelectItem key={key} value={key}>
                    {label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          <div>
            <Label htmlFor="method-description">説明</Label>
            <Textarea
              id="method-description"
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              placeholder="例: 学んだ内容を自分の言葉で説明する"
              maxLength={500}
              rows={3}
            />
          </div>

          <div>
            <Label htmlFor="method-duration">目標時間 (任意)</Label>
            <div className="flex items-center gap-2">
              <Input
                id="method-duration"
                type="number"
                value={durationMin}
                onChange={(e) => setDurationMin(e.target.value)}
                placeholder="25"
                min={1}
                max={180}
                className="w-24"
              />
              <span className="text-sm text-muted-foreground">分</span>
            </div>
            <p className="mt-1 text-xs text-muted-foreground">
              未入力の場合はストップウォッチ式になります
            </p>
          </div>

          {error && <p className="text-sm text-destructive">{error}</p>}

          <Button onClick={handleSubmit} disabled={pending}>
            {isEdit ? "更新" : "作成"}
          </Button>

          {isEdit && (
            <Button
              variant="outline"
              className="border-destructive/30 text-destructive"
              onClick={handleDelete}
              disabled={pending}
            >
              この手法を削除
            </Button>
          )}
        </div>
      </SheetContent>
    </Sheet>
  );
}
