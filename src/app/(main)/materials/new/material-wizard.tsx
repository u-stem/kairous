"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { Loader2, Trash2 } from "lucide-react";
import type { Subject, LearningMethod } from "@/lib/types/materials";
import { hasCardBasedMethod } from "@/lib/constants";
import { createMaterial } from "@/lib/actions/materials";
import { createCard } from "@/lib/actions/cards";
import { createSubject } from "@/lib/actions/subjects";
import { SubjectSelector } from "@/components/subject-selector";
import { MethodSelector } from "@/components/method-selector";
import { CardEditor } from "@/components/card-editor";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { cn } from "@/lib/utils";

type Props = {
  subjects: Subject[];
  methods: LearningMethod[];
};

type CardDraft = {
  front: string;
  back: string;
};

// 選択された手法のうちカードベースのものがあるかを判定する
function hasSelectedCardBasedMethod(
  selectedMethodIds: string[],
  methods: LearningMethod[],
): boolean {
  const selectedMethods = methods.filter((m) => selectedMethodIds.includes(m.id));
  return hasCardBasedMethod(selectedMethods);
}

// ウィザードのステップ数（カードベース手法なしの場合は2ステップで完了）
const TOTAL_STEPS = 3;

export function MaterialWizard({ subjects: initialSubjects, methods }: Props) {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();

  // ステップ1: 基本情報
  const [title, setTitle] = useState("");
  const [description, setDescription] = useState("");
  const [subjectId, setSubjectId] = useState("");
  const [subjects, setSubjects] = useState<Subject[]>(initialSubjects);
  const [step1Errors, setStep1Errors] = useState<{ title?: string; subject_id?: string }>({});

  // ステップ2: 学習手法
  const [selectedMethodIds, setSelectedMethodIds] = useState<string[]>([]);
  const [step2Error, setStep2Error] = useState("");

  // ステップ3: カード追加
  const [cards, setCards] = useState<CardDraft[]>([]);

  const [currentStep, setCurrentStep] = useState(1);

  const needsCardStep = hasSelectedCardBasedMethod(selectedMethodIds, methods);

  // 表示上のステップ数（カードベース手法なしの場合は2ステップ）
  const visibleStepCount = needsCardStep ? TOTAL_STEPS : 2;

  function validateStep1(): boolean {
    const errors: { title?: string; subject_id?: string } = {};
    if (!title.trim()) errors.title = "タイトルを入力してください";
    else if (title.trim().length > 200) errors.title = "200文字以内で入力してください";
    if (!subjectId) errors.subject_id = "科目を選択してください";
    setStep1Errors(errors);
    return Object.keys(errors).length === 0;
  }

  function validateStep2(): boolean {
    if (selectedMethodIds.length === 0) {
      setStep2Error("学習手法を1つ以上選択してください");
      return false;
    }
    setStep2Error("");
    return true;
  }

  function handleNextFromStep1() {
    if (!validateStep1()) return;
    setCurrentStep(2);
  }

  function handleNextFromStep2() {
    if (!validateStep2()) return;

    // カードベース手法が選択されていない場合はStep3をスキップして送信
    if (!needsCardStep) {
      submitForm([]);
      return;
    }

    setCurrentStep(3);
  }

  function handleAddCard(data: { front: string; back: string }) {
    setCards((prev) => [...prev, data]);
  }

  function handleRemoveCard(index: number) {
    setCards((prev) => prev.filter((_, i) => i !== index));
  }

  // SubjectSelector の onCreateSubject コールバック
  // createSubject は FormData を受け取るため、ここでラップする
  async function handleCreateSubject(
    name: string,
  ): Promise<{ id: string; name: string } | null> {
    const formData = new FormData();
    formData.set("name", name);
    const result = await createSubject(formData);
    if (!result.success) {
      toast.error(result.error);
      return null;
    }
    // 新しく作成した科目をローカルリストに追加し、再フェッチを避ける
    // color・created_atはサーバー側で設定されるため、暫定値を設定する
    setSubjects((prev) => [
      ...prev,
      {
        ...result.data,
        color: "#6b7280",
        display_order: Math.max(0, ...prev.map((s) => s.display_order)) + 1,
        user_id: "",
        created_at: new Date().toISOString(),
      } as Subject,
    ]);
    return result.data;
  }

  function submitForm(cardDrafts: CardDraft[]) {
    startTransition(async () => {
      // 教材を作成する
      const formData = new FormData();
      formData.set("title", title.trim());
      if (description.trim()) formData.set("description", description.trim());
      formData.set("subject_id", subjectId);
      formData.set("method_ids", JSON.stringify(selectedMethodIds));

      const result = await createMaterial(formData);
      if (!result.success) {
        toast.error(result.error);
        return;
      }

      const materialId = result.data.id;

      // カードを順番に作成する（並列にするとdisplay_orderが衝突するため逐次処理）
      for (const card of cardDrafts) {
        const cardForm = new FormData();
        cardForm.set("front", card.front);
        cardForm.set("back", card.back);
        const cardResult = await createCard(materialId, cardForm);
        if (!cardResult.success) {
          toast.error(`カードの作成に失敗しました: ${cardResult.error}`);
          // カード作成が失敗しても教材自体は作成済みのため、詳細ページへ遷移する
          router.push(`/materials/${materialId}`);
          return;
        }
      }

      router.push(`/materials/${materialId}`);
    });
  }

  function handleSubmitWithCards() {
    submitForm(cards);
  }

  return (
    <div className="flex flex-col gap-6">
      {/* プログレスバー */}
      <div className="flex gap-1.5">
        {Array.from({ length: visibleStepCount }).map((_, i) => (
          <div
            key={i}
            className={cn(
              "h-1 flex-1 rounded-full transition-colors",
              i < currentStep ? "bg-primary" : "bg-muted",
            )}
          />
        ))}
      </div>

      {/* ステップ1: 基本情報 */}
      {currentStep === 1 && (
        <div className="flex flex-col gap-5">
          <p className="text-sm text-muted-foreground">ステップ 1 / {visibleStepCount}: 基本情報</p>

          <div className="flex flex-col gap-1.5">
            <Label htmlFor="material-title">タイトル</Label>
            <Input
              id="material-title"
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              placeholder="例: TOEIC 単語帳"
              aria-invalid={!!step1Errors.title}
            />
            {step1Errors.title && (
              <p className="text-xs text-destructive">{step1Errors.title}</p>
            )}
          </div>

          <div className="flex flex-col gap-1.5">
            <Label htmlFor="material-description">説明（任意）</Label>
            <Textarea
              id="material-description"
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              placeholder="この教材の目的や内容について"
              rows={3}
            />
          </div>

          <div className="flex flex-col gap-1.5">
            <Label>科目</Label>
            <SubjectSelector
              subjects={subjects}
              value={subjectId}
              onChange={setSubjectId}
              onCreateSubject={handleCreateSubject}
            />
            {step1Errors.subject_id && (
              <p className="text-xs text-destructive">{step1Errors.subject_id}</p>
            )}
          </div>

          <div className="flex justify-end">
            <Button onClick={handleNextFromStep1}>次へ</Button>
          </div>
        </div>
      )}

      {/* ステップ2: 学習手法の選択 */}
      {currentStep === 2 && (
        <div className="flex flex-col gap-5">
          <p className="text-sm text-muted-foreground">ステップ 2 / {visibleStepCount}: 学習手法の選択</p>

          <MethodSelector
            methods={methods}
            selected={selectedMethodIds}
            onChange={setSelectedMethodIds}
            onMethodsChange={() => router.refresh()}
          />

          {step2Error && (
            <p className="text-xs text-destructive">{step2Error}</p>
          )}

          <div className="flex justify-between">
            <Button variant="outline" onClick={() => setCurrentStep(1)}>
              戻る
            </Button>
            <Button onClick={handleNextFromStep2} disabled={isPending}>
              {isPending && <Loader2 className="animate-spin" />}
              {needsCardStep ? "次へ" : "作成"}
            </Button>
          </div>
        </div>
      )}

      {/* ステップ3: カード追加（カードベース手法が選択された場合のみ表示） */}
      {currentStep === 3 && needsCardStep && (
        <div className="flex flex-col gap-5">
          <p className="text-sm text-muted-foreground">ステップ 3 / {visibleStepCount}: カード追加</p>

          <CardEditor onSubmit={handleAddCard} submitLabel="追加" />

          {/* 追加済みカードの一覧 */}
          {cards.length > 0 && (
            <div className="flex flex-col gap-2">
              <p className="text-sm font-medium">追加済み ({cards.length}枚)</p>
              <ul className="flex flex-col gap-2">
                {cards.map((card, i) => (
                  <li
                    key={i}
                    className="flex items-start justify-between gap-2 rounded-lg border border-border p-3"
                  >
                    <div className="flex flex-col gap-0.5 overflow-hidden">
                      <span className="truncate text-sm font-medium">{card.front}</span>
                      <span className="truncate text-xs text-muted-foreground">{card.back}</span>
                    </div>
                    <Button
                      type="button"
                      variant="ghost"
                      size="icon"
                      onClick={() => handleRemoveCard(i)}
                      aria-label={`カード「${card.front}」を削除`}
                    >
                      <Trash2 />
                    </Button>
                  </li>
                ))}
              </ul>
            </div>
          )}

          <div className="flex justify-between">
            <Button variant="outline" onClick={() => setCurrentStep(2)}>
              戻る
            </Button>
            <Button onClick={handleSubmitWithCards} disabled={isPending}>
              {isPending && <Loader2 className="animate-spin" />}
              完了{cards.length > 0 ? `（${cards.length}枚のカード）` : ""}
            </Button>
          </div>
        </div>
      )}
    </div>
  );
}
