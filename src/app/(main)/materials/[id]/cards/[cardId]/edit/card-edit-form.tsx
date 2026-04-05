"use client";

import { useTransition } from "react";
import { useRouter } from "next/navigation";
import { Loader2 } from "lucide-react";
import { toast } from "sonner";
import { CardEditor } from "@/components/card-editor";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
  DialogClose,
} from "@/components/ui/dialog";
import { updateCard, deleteCard } from "@/lib/actions/cards";
import type { Card } from "@/lib/types/materials";

type CardEditFormProps = {
  card: Card;
  materialId: string;
};

export function CardEditForm({ card, materialId }: CardEditFormProps) {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();
  const [isDeleting, startDeleteTransition] = useTransition();

  function handleSave(data: { front: string; back: string }) {
    startTransition(async () => {
      const formData = new FormData();
      formData.set("front", data.front);
      formData.set("back", data.back);

      const result = await updateCard(card.id, formData);
      if (!result.success) {
        toast.error(result.error);
        return;
      }

      router.push(`/materials/${materialId}?tab=cards`);
    });
  }

  function handleDelete() {
    startDeleteTransition(async () => {
      const result = await deleteCard(card.id);
      if (!result.success) {
        toast.error(result.error);
        return;
      }

      router.push(`/materials/${materialId}?tab=cards`);
    });
  }

  return (
    <div>
      <CardEditor
        defaultValues={{ front: card.front, back: card.back }}
        onSubmit={handleSave}
        submitLabel="保存"
        loading={isPending}
      />

      <div className="mt-6 flex items-center justify-between">
        <Dialog>
          <DialogTrigger render={<Button variant="destructive" size="sm" />}>
            削除
          </DialogTrigger>
          <DialogContent>
            <DialogHeader>
              <DialogTitle>カードを削除</DialogTitle>
            </DialogHeader>
            <p className="text-sm text-muted-foreground">
              このカードと関連する学習履歴（SRS状態、レビュー記録）が全て削除されます。この操作は元に戻せません。
            </p>
            <div className="flex justify-end gap-2">
              <DialogClose render={<Button variant="outline" />}>
                キャンセル
              </DialogClose>
              <Button
                variant="destructive"
                onClick={() => void handleDelete()}
                disabled={isDeleting}
              >
                {isDeleting && (
                  <Loader2 className="mr-1.5 h-4 w-4 animate-spin" />
                )}
                削除
              </Button>
            </div>
          </DialogContent>
        </Dialog>

        <Button
          variant="outline"
          onClick={() => router.push(`/materials/${materialId}?tab=cards`)}
        >
          キャンセル
        </Button>
      </div>
    </div>
  );
}
