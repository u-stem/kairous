"use client";

import { useTransition, useState } from "react";
import Link from "next/link";
import { Pencil, Trash2, Loader2 } from "lucide-react";
import { toast } from "sonner";
import { Button, buttonVariants } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
  DialogClose,
} from "@/components/ui/dialog";
import { deleteCard } from "@/lib/actions/cards";
import { cn } from "@/lib/utils";
import type { Card } from "@/lib/types/materials";

type CardListItemProps = {
  card: Card;
  materialId: string;
};

export function CardListItem({ card, materialId }: CardListItemProps) {
  const [isPending, startTransition] = useTransition();
  const [isDialogOpen, setIsDialogOpen] = useState(false);

  function handleDelete() {
    startTransition(async () => {
      const result = await deleteCard(card.id);
      if (!result.success) {
        // 削除失敗時はダイアログを閉じずにエラーをユーザーへ通知する
        toast.error(result.error ?? "カードの削除に失敗しました");
        return;
      }
      setIsDialogOpen(false);
    });
  }

  return (
    <div className="flex items-start gap-3 rounded-lg border p-3" data-testid="card-list-item">
      {/* カード内容: 表面・裏面を縦並びで表示 */}
      <div className="min-w-0 flex-1">
        <p className="truncate text-sm font-medium" data-testid="card-front">{card.front}</p>
        <p className="mt-0.5 truncate text-xs text-muted-foreground">{card.back}</p>
      </div>

      {/* 操作ボタン: 編集リンク + 削除ダイアログトリガー */}
      <div className="flex shrink-0 items-center gap-1">
        <Link
          href={`/materials/${materialId}/cards/${card.id}/edit`}
          className={cn(buttonVariants({ variant: "ghost", size: "icon-sm" }))}
          aria-label="カードを編集"
        >
          <Pencil aria-hidden="true" />
        </Link>

        <Button
          variant="ghost"
          size="icon-sm"
          onClick={() => setIsDialogOpen(true)}
          aria-label="カードを削除"
        >
          <Trash2 aria-hidden="true" className="text-destructive" />
        </Button>
      </div>

      {/* 削除確認ダイアログ: SRSデータも失われることを警告する */}
      <Dialog open={isDialogOpen} onOpenChange={setIsDialogOpen}>
        <DialogContent showCloseButton={false}>
          <DialogHeader>
            <DialogTitle>カードを削除しますか？</DialogTitle>
            <DialogDescription>
              このカードに紐付く復習履歴（SRS状態・レビュー記録）もすべて削除されます。この操作は元に戻せません。
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <DialogClose render={<Button variant="outline" />}>
              キャンセル
            </DialogClose>
            <Button
              variant="destructive"
              onClick={() => void handleDelete()}
              disabled={isPending}
            >
              {isPending && <Loader2 aria-hidden="true" className="animate-spin" />}
              削除する
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
