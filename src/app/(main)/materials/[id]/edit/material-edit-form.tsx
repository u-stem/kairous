"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Loader2 } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { SubjectSelector } from "@/components/subject-selector";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
  DialogClose,
} from "@/components/ui/dialog";
import { updateMaterial, deleteMaterial } from "@/lib/actions/materials";
import { createSubject } from "@/lib/actions/subjects";
import type { MaterialDetail, Subject } from "@/lib/types/materials";

type MaterialEditFormProps = {
  material: MaterialDetail;
  subjects: Subject[];
};

export function MaterialEditForm({
  material,
  subjects: initialSubjects,
}: MaterialEditFormProps) {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();
  const [isDeleting, startDeleteTransition] = useTransition();

  const [title, setTitle] = useState(material.title);
  const [description, setDescription] = useState(material.description ?? "");
  const [subjectId, setSubjectId] = useState(material.category_id);
  const [subjects, setSubjects] = useState(initialSubjects);
  const [errors, setErrors] = useState<Record<string, string>>({});

  // 科目を新規作成して選択状態に反映する。
  // createSubject が返す data に Subject 全フィールドがないため、不足フィールドをデフォルト値で補完する
  async function handleCreateSubject(
    name: string,
  ): Promise<{ id: string; name: string } | null> {
    const formData = new FormData();
    formData.set("name", name);
    const result = await createSubject(formData);
    if (result.success) {
      const newSubject: Subject = {
        id: result.data.id,
        name: result.data.name,
        color: "#6b7280",
        parent_id: null,
        display_order: Math.max(0, ...subjects.map((s) => s.display_order)) + 1,
        user_id: "",
        created_at: new Date().toISOString(),
      };
      setSubjects((prev) => [...prev, newSubject]);
      return result.data;
    }
    return null;
  }

  function handleSave() {
    setErrors({});
    if (!title.trim()) {
      setErrors({ title: "タイトルを入力してください" });
      return;
    }

    startTransition(async () => {
      const formData = new FormData();
      formData.set("title", title);
      formData.set("description", description);
      formData.set("subject_id", subjectId);

      const result = await updateMaterial(material.id, formData);

      if (!result.success) {
        toast.error(result.error);
        if (result.fieldErrors) {
          const mapped: Record<string, string> = {};
          for (const [key, msgs] of Object.entries(result.fieldErrors)) {
            if (msgs?.[0]) mapped[key] = msgs[0];
          }
          setErrors(mapped);
        }
        return;
      }

      router.push(`/materials/${material.id}`);
    });
  }

  function handleDelete() {
    startDeleteTransition(async () => {
      const result = await deleteMaterial(material.id);
      if (!result.success) {
        toast.error(result.error);
        return;
      }
      router.push("/materials");
    });
  }

  return (
    <div className="flex flex-col gap-6">
      {/* タイトル */}
      <div className="flex flex-col gap-1.5">
        <Label htmlFor="title">タイトル</Label>
        <Input
          id="title"
          value={title}
          onChange={(e) => setTitle(e.target.value)}
          placeholder="例: TOEFL単語帳"
          disabled={isPending}
        />
        {errors.title && (
          <p className="text-sm text-destructive">{errors.title}</p>
        )}
      </div>

      {/* 説明 */}
      <div className="flex flex-col gap-1.5">
        <Label htmlFor="description">説明（任意）</Label>
        <Textarea
          id="description"
          value={description}
          onChange={(e) => setDescription(e.target.value)}
          placeholder="教材の説明を入力"
          rows={3}
          disabled={isPending}
        />
      </div>

      {/* 科目 */}
      <div className="flex flex-col gap-1.5">
        <Label id="subject-label">科目</Label>
        <SubjectSelector
          subjects={subjects}
          value={subjectId}
          onChange={setSubjectId}
          onCreateSubject={handleCreateSubject}
          selectAriaLabelledBy="subject-label"
        />
        {errors.subject_id && (
          <p className="text-sm text-destructive">{errors.subject_id}</p>
        )}
      </div>

      {/* 操作バー: 削除（左）/ キャンセル・保存（右） */}
      <div className="flex items-center justify-between gap-2 pt-2">
        {/* 削除はカスケードで関連データも消えるためダイアログで確認を挟む */}
        <Dialog>
          <DialogTrigger
            render={<Button variant="destructive" size="sm" disabled={isDeleting} />}
          >
            {isDeleting ? (
              <>
                <Loader2 aria-hidden="true" className="animate-spin" />
                削除中...
              </>
            ) : (
              "削除"
            )}
          </DialogTrigger>
          <DialogContent>
            <DialogHeader>
              <DialogTitle>教材を削除しますか？</DialogTitle>
            </DialogHeader>
            <p className="text-sm text-muted-foreground">
              「{material.title}」を削除すると、カードや学習履歴など関連するすべてのデータが削除されます。この操作は取り消せません。
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
                {isDeleting ? (
                  <>
                    <Loader2 aria-hidden="true" className="animate-spin" />
                    削除中...
                  </>
                ) : (
                  "削除する"
                )}
              </Button>
            </div>
          </DialogContent>
        </Dialog>

        <div className="flex gap-2">
          <Button
            variant="outline"
            onClick={() => router.push(`/materials/${material.id}`)}
            disabled={isPending}
          >
            キャンセル
          </Button>
          <Button
            onClick={() => void handleSave()}
            disabled={isPending || !title.trim()}
          >
            {isPending ? (
              <>
                <Loader2 aria-hidden="true" className="animate-spin" />
                保存中...
              </>
            ) : (
              "保存"
            )}
          </Button>
        </div>
      </div>
    </div>
  );
}
