"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { Loader2, Trash2 } from "lucide-react";
import type { Category, LearningMethod } from "@/lib/types/materials";
import { hasCardBasedMethod } from "@/lib/constants";
import { createMaterial } from "@/lib/actions/materials";
import { createCard } from "@/lib/actions/cards";
import { createCategory } from "@/lib/actions/categories";
import { addTagToMaterial } from "@/lib/actions/tags";
import type { Tag } from "@/lib/types/tags";
import { CategorySelector, buildCreateCategoryHandler } from "@/components/category-selector";
import { MethodSelector } from "@/components/method-selector";
import { TagInputPreview } from "@/components/tag-input";
import { CardEditor } from "@/components/card-editor";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { cn } from "@/lib/utils";

type Props = {
  categories: Category[];
  methods: LearningMethod[];
  allTags: Tag[];
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

export function MaterialWizard({ categories: initialCategories, methods, allTags: initialAllTags }: Props) {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();

  // ステップ1: 基本情報
  const [title, setTitle] = useState("");
  const [description, setDescription] = useState("");
  const [categoryId, setCategoryId] = useState<string | null>(null);
  const [categories, setCategories] = useState<Category[]>(initialCategories);
  const [step1Errors, setStep1Errors] = useState<{ title?: string; category_id?: string }>({});

  // ステップ1.5: タグ選択
  const [selectedTags, setSelectedTags] = useState<Tag[]>([]);
  const [allTags] = useState<Tag[]>(initialAllTags);

  // ステップ2: 学習手法
  const [selectedMethodIds, setSelectedMethodIds] = useState<string[]>([]);
  const [step2Error, setStep2Error] = useState("");

  // ステップ3: カード追加
  const [cards, setCards] = useState<CardDraft[]>([]);

  const [currentStep, setCurrentStep] = useState(1);

  const needsCardStep = hasSelectedCardBasedMethod(selectedMethodIds, methods);

  // 表示上のステップ数（カードベース手法なしの場合は3ステップ）
  // Step1 → Step1.5(タグ) → Step2(手法) → Step3(カード, 任意)
  const visibleStepCount = needsCardStep ? TOTAL_STEPS + 1 : 3;

  function validateStep1(): boolean {
    const errors: { title?: string; category_id?: string } = {};
    if (!title.trim()) errors.title = "タイトルを入力してください";
    else if (title.trim().length > 200) errors.title = "200文字以内で入力してください";
    if (!categoryId) errors.category_id = "カテゴリを選択してください";
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
    setCurrentStep(1.5);
  }

  function handleNextFromStep1_5() {
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

  // buildCreateCategoryHandler で共通ロジックを集約し、createCategory と setCategories をバインドする
  const handleCreateCategory = buildCreateCategoryHandler(createCategory, setCategories);

  function submitForm(cardDrafts: CardDraft[]) {
    startTransition(async () => {
      // 教材を作成する
      const formData = new FormData();
      formData.set("title", title.trim());
      if (description.trim()) formData.set("description", description.trim());
      if (categoryId) formData.set("category_id", categoryId);
      formData.set("method_ids", JSON.stringify(selectedMethodIds));

      const result = await createMaterial(formData);
      if (!result.success) {
        toast.error(result.error);
        return;
      }

      const materialId = result.data.id;

      // 選択済みタグを教材に紐付ける
      for (const tag of selectedTags) {
        const tagResult = await addTagToMaterial(materialId, tag.id);
        if (!tagResult.success) {
          // タグ付けに失敗しても教材は作成済みのため、警告のみ表示して続行する
          toast.error(`タグ「${tag.name}」の付与に失敗しました`);
        }
      }

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

  // Step 1.5 をプログレスバー上では 2 番目として扱う
  const progressStep = currentStep === 1 ? 1 : currentStep === 1.5 ? 2 : currentStep + 1;

  return (
    <div className="flex flex-col gap-6">
      {/* プログレスバー */}
      <div className="flex gap-1.5">
        {Array.from({ length: visibleStepCount }).map((_, i) => (
          <div
            key={i}
            className={cn(
              "h-1 flex-1 rounded-full transition-colors",
              i < progressStep ? "bg-primary" : "bg-muted",
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
            <Label id="category-label">カテゴリ</Label>
            <CategorySelector
              categories={categories}
              value={categoryId}
              onChange={setCategoryId}
              onCreateCategory={handleCreateCategory}
              selectAriaLabelledBy="category-label"
            />
            {step1Errors.category_id && (
              <p className="text-xs text-destructive">{step1Errors.category_id}</p>
            )}
          </div>

          <div className="flex justify-end">
            <Button onClick={handleNextFromStep1}>次へ</Button>
          </div>
        </div>
      )}

      {/* ステップ1.5: タグ選択 */}
      {currentStep === 1.5 && (
        <div className="flex flex-col gap-5">
          <p className="text-sm text-muted-foreground">ステップ 2 / {visibleStepCount}: タグ（任意）</p>

          <div className="flex flex-col gap-1.5">
            <Label>タグ</Label>
            <TagInputPreview
              allTags={allTags}
              selectedTags={selectedTags}
              onChange={setSelectedTags}
            />
          </div>

          <div className="flex justify-between">
            <Button variant="outline" onClick={() => setCurrentStep(1)}>
              戻る
            </Button>
            <Button onClick={handleNextFromStep1_5}>次へ</Button>
          </div>
        </div>
      )}

      {/* ステップ2: 学習手法の選択 */}
      {currentStep === 2 && (
        <div className="flex flex-col gap-5">
          <p className="text-sm text-muted-foreground">ステップ 3 / {visibleStepCount}: 学習手法の選択</p>

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
            <Button variant="outline" onClick={() => setCurrentStep(1.5)}>
              戻る
            </Button>
            <Button onClick={handleNextFromStep2} disabled={isPending}>
              {isPending && <Loader2 aria-hidden="true" className="animate-spin" />}
              {needsCardStep ? "次へ" : "作成"}
            </Button>
          </div>
        </div>
      )}

      {/* ステップ3: カード追加（カードベース手法が選択された場合のみ表示） */}
      {currentStep === 3 && needsCardStep && (
        <div className="flex flex-col gap-5">
          <p className="text-sm text-muted-foreground">ステップ 4 / {visibleStepCount}: カード追加</p>

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
                      <Trash2 aria-hidden="true" />
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
            <Button onClick={() => void handleSubmitWithCards()} disabled={isPending}>
              {isPending && <Loader2 aria-hidden="true" className="animate-spin" />}
              完了{cards.length > 0 ? `（${cards.length}枚のカード）` : ""}
            </Button>
          </div>
        </div>
      )}
    </div>
  );
}
