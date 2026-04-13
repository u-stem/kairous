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
  selectAriaLabelledBy?: string;
};

export function SubjectSelector({
  subjects,
  value,
  onChange,
  onCreateSubject,
  selectAriaLabelledBy,
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

  const selectedSubject = subjects.find((s) => s.id === value);

  return (
    <div className="flex gap-2">
      {/* onValueChange は null を返す可能性があるが、科目選択解除は想定しないため null を無視する */}
      <Select value={value} onValueChange={(v) => v && onChange(v)}>
        {/* min-w-0 が無いと flex-1 配下で SelectTrigger の w-fit + whitespace-nowrap
            が親幅を無視して伸びるため、SP 375px で横あふれする */}
        <SelectTrigger
          className="min-w-0 flex-1"
          aria-labelledby={selectAriaLabelledBy}
        >
          <SelectValue placeholder="科目を選択">
            {selectedSubject?.name ?? "科目を選択"}
          </SelectValue>
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
