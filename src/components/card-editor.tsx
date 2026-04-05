"use client";

import { useRef, useState } from "react";
import { cardSchema } from "@/lib/validations/materials";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { Button } from "@/components/ui/button";

type CardEditorProps = {
  defaultValues?: { front: string; back: string };
  onSubmit: (data: { front: string; back: string }) => void;
  submitLabel?: string;
  loading?: boolean;
};

type FieldErrors = {
  front?: string[];
  back?: string[];
};

export function CardEditor({
  defaultValues,
  onSubmit,
  submitLabel = "追加",
  loading,
}: CardEditorProps) {
  const [front, setFront] = useState(defaultValues?.front ?? "");
  const [back, setBack] = useState(defaultValues?.back ?? "");
  const [errors, setErrors] = useState<FieldErrors>({});
  const frontRef = useRef<HTMLInputElement>(null);

  function handleSubmit(e: React.SyntheticEvent<HTMLFormElement>) {
    e.preventDefault();

    const result = cardSchema.safeParse({ front, back });
    if (!result.success) {
      const fieldErrors: FieldErrors = {};
      for (const issue of result.error.issues) {
        const field = issue.path[0] as keyof FieldErrors;
        if (!fieldErrors[field]) fieldErrors[field] = [];
        fieldErrors[field].push(issue.message);
      }
      setErrors(fieldErrors);
      return;
    }

    setErrors({});
    onSubmit(result.data);

    // defaultValues がない場合は連続追加モードとみなし、フォームをクリアしてフォーカスを戻す
    if (!defaultValues) {
      setFront("");
      setBack("");
      frontRef.current?.focus();
    }
  }

  return (
    <form onSubmit={handleSubmit} className="flex flex-col gap-4">
      <div className="flex flex-col gap-1.5">
        <Label htmlFor="card-front">表面</Label>
        <Input
          id="card-front"
          ref={frontRef}
          value={front}
          onChange={(e) => setFront(e.target.value)}
          aria-invalid={!!errors.front}
        />
        {errors.front && (
          <p className="text-xs text-destructive">{errors.front[0]}</p>
        )}
      </div>
      <div className="flex flex-col gap-1.5">
        <Label htmlFor="card-back">裏面</Label>
        <Textarea
          id="card-back"
          value={back}
          onChange={(e) => setBack(e.target.value)}
          aria-invalid={!!errors.back}
        />
        {errors.back && (
          <p className="text-xs text-destructive">{errors.back[0]}</p>
        )}
      </div>
      <Button type="submit" disabled={loading}>
        {submitLabel}
      </Button>
    </form>
  );
}
