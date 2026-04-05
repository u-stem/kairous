"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { CardEditor } from "@/components/card-editor";
import { Button } from "@/components/ui/button";
import { createCard } from "@/lib/actions/cards";

type CardAddFormProps = {
  materialId: string;
};

export function CardAddForm({ materialId }: CardAddFormProps) {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();
  const [addedCount, setAddedCount] = useState(0);

  function handleSubmit(data: { front: string; back: string }) {
    startTransition(async () => {
      const formData = new FormData();
      formData.set("front", data.front);
      formData.set("back", data.back);

      const result = await createCard(materialId, formData);
      if (!result.success) {
        toast.error(result.error);
        return;
      }

      setAddedCount((prev) => prev + 1);
      toast.success("カードを追加しました");
    });
  }

  return (
    <div>
      <CardEditor onSubmit={handleSubmit} loading={isPending} />
      {addedCount > 0 && (
        <p className="mt-4 text-sm text-muted-foreground">
          {addedCount}枚のカードを追加しました
        </p>
      )}
      <div className="mt-6">
        <Button
          variant="outline"
          onClick={() => router.push(`/materials/${materialId}?tab=cards`)}
        >
          完了
        </Button>
      </div>
    </div>
  );
}
