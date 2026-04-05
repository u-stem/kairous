"use client";

import { useState, useTransition } from "react";
import { Plus, Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  Sheet,
  SheetTrigger,
  SheetContent,
  SheetHeader,
  SheetTitle,
  SheetDescription,
  SheetFooter,
  SheetClose,
} from "@/components/ui/sheet";
import { MethodSelector } from "@/components/method-selector";
import { getMethods, addMaterialMethod, removeMaterialMethod } from "@/lib/actions/material-methods";
import type { LearningMethod } from "@/lib/types/materials";

type MaterialMethodSheetProps = {
  materialId: string;
  currentMethodIds: string[];
};

export function MaterialMethodSheet({ materialId, currentMethodIds }: MaterialMethodSheetProps) {
  const [isOpen, setIsOpen] = useState(false);
  const [methods, setMethods] = useState<LearningMethod[]>([]);
  const [selected, setSelected] = useState<string[]>(currentMethodIds);
  const [isPending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);

  // シートを開いたときに手法一覧を取得し、現在の選択状態を同期する
  async function handleOpenChange(open: boolean) {
    setIsOpen(open);
    if (open) {
      setSelected(currentMethodIds);
      setError(null);
      const allMethods = await getMethods();
      setMethods(allMethods);
    }
  }

  function handleSave() {
    setError(null);

    const toAdd = selected.filter((id) => !currentMethodIds.includes(id));
    const toRemove = currentMethodIds.filter((id) => !selected.includes(id));

    startTransition(async () => {
      // 順次実行で部分失敗によるDB不整合を防ぐ。失敗時はサーバーから最新状態を再取得する
      const operations = [
        ...toRemove.map((id) => () => removeMaterialMethod(materialId, id)),
        ...toAdd.map((id) => () => addMaterialMethod(materialId, id)),
      ];

      for (const op of operations) {
        const result = await op();
        if (!result.success) {
          setError(result.error ?? "手法の更新に失敗しました");
          const refreshed = await getMethods();
          setMethods(refreshed);
          return;
        }
      }

      setIsOpen(false);
    });
  }

  return (
    <Sheet open={isOpen} onOpenChange={(open) => void handleOpenChange(open)}>
      <SheetTrigger render={
        <Button variant="outline" size="sm">
          <Plus />
          手法
        </Button>
      } />

      <SheetContent side="bottom">
        <SheetHeader>
          <SheetTitle>学習手法を管理</SheetTitle>
          <SheetDescription>
            この教材に紐付ける学習手法を選択してください
          </SheetDescription>
        </SheetHeader>

        <div className="overflow-y-auto px-4 py-2">
          {methods.length > 0 ? (
            <MethodSelector
              methods={methods}
              selected={selected}
              onChange={setSelected}
            />
          ) : (
            <div className="flex items-center justify-center py-8">
              <Loader2 className="animate-spin text-muted-foreground" />
            </div>
          )}
        </div>

        {error && (
          <p className="px-4 text-sm text-destructive">{error}</p>
        )}

        <SheetFooter>
          <SheetClose render={<Button variant="outline" />}>
            キャンセル
          </SheetClose>
          <Button onClick={handleSave} disabled={isPending}>
            {isPending && <Loader2 className="animate-spin" />}
            保存
          </Button>
        </SheetFooter>
      </SheetContent>
    </Sheet>
  );
}
