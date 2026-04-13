"use client";

import { useState } from "react";
import { Plus } from "lucide-react";
import type { Subject } from "@/lib/types/materials";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";

type SubjectSelectorProps = {
  subjects: Subject[];
  value: string;
  onChange: (value: string) => void;
  onCreateSubject: (name: string) => Promise<{ id: string; name: string } | null>;
};

export function SubjectSelector({
  subjects,
  value,
  onChange,
  onCreateSubject,
}: SubjectSelectorProps) {
  const [open, setOpen] = useState(false);
  const [newName, setNewName] = useState("");
  const [creating, setCreating] = useState(false);

  async function handleCreate() {
    if (!newName.trim()) return;

    setCreating(true);
    const result = await onCreateSubject(newName.trim());
    setCreating(false);

    if (result) {
      onChange(result.id);
      setOpen(false);
      setNewName("");
    }
  }

  // Enter キーでダイアログを送信できるようにし、フォーム追加の手間を省く
  function handleKeyDown(e: React.KeyboardEvent<HTMLInputElement>) {
    if (e.key === "Enter") {
      e.preventDefault();
      void handleCreate();
    }
  }

  return (
    <div className="flex gap-2">
      {/* onValueChange は null を返す可能性があるが、科目選択解除は想定しないため null を無視する */}
      <Select value={value} onValueChange={(v) => v && onChange(v)}>
        <SelectTrigger className="flex-1">
          <SelectValue placeholder="科目を選択" />
        </SelectTrigger>
        <SelectContent>
          {subjects.map((subject) => (
            <SelectItem key={subject.id} value={subject.id}>
              {subject.name}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>

      <Button
        type="button"
        variant="outline"
        size="icon"
        onClick={() => setOpen(true)}
        aria-label="科目を追加"
      >
        <Plus aria-hidden="true" />
      </Button>

      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>新しい科目を作成</DialogTitle>
          </DialogHeader>
          <div className="flex flex-col gap-1.5">
            <Label htmlFor="new-subject-name">科目名</Label>
            <Input
              id="new-subject-name"
              value={newName}
              onChange={(e) => setNewName(e.target.value)}
              onKeyDown={handleKeyDown}
              placeholder="例: 数学、英語"
              autoFocus
            />
          </div>
          <DialogFooter>
            <Button
              onClick={() => void handleCreate()}
              disabled={!newName.trim() || creating}
            >
              {creating ? "作成中..." : "作成"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
