"use client";

import { useState, useTransition, useCallback } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { Loader2, Trash2 } from "lucide-react";
import type { Category, LearningMethod } from "@/lib/types/materials";
import { hasCardBasedMethod } from "@/lib/constants";
import type { MaterialType } from "@/lib/constants";
import { createMaterial, getAllowedMethods } from "@/lib/actions/materials";
import { createCard } from "@/lib/actions/cards";
import { createCategory } from "@/lib/actions/categories";
import { addTagToMaterial } from "@/lib/actions/tags";
import type { Tag } from "@/lib/types/tags";
import { CategorySelector, buildCreateCategoryHandler } from "@/components/category-selector";
import { MethodSelector } from "@/components/method-selector";
import { MaterialTypeSelector } from "@/components/material-type-selector";
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
  // 追加・削除で並び変わる一覧のキーに index を使うと React が DOM を再マッチできず
  // 入力フォーカスが外れるなどの UX 劣化が起きるため、クライアント生成 UUID を保持する
  id: string;
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

// ウィザードのステップ数（Step0 + カードベース手法なしの場合は3ステップ完了）
const TOTAL_STEPS = 4;

// Step 0 → 1 → 1.5 → 2 → 3 をプログレスバーの番号に変換する
// Step1.5 はステップ番号が整数でないため文字列キーで管理する
const STEP_TO_PROGRESS: Record<string, number> = {
  "0": 1,
  "1": 2,
  "1.5": 3,
  "2": 4,
  "3": 5,
};

export function MaterialWizard({ categories: initialCategories, methods: allMethods, allTags: initialAllTags }: Props) {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();
  const [isStep0Pending, startStep0Transition] = useTransition();

  // ステップ0: タイプ選択
  const [materialType, setMaterialType] = useState<MaterialType>("flashcard");

  // ステップ1: 基本情報
  const [title, setTitle] = useState("");
  const [description, setDescription] = useState("");
  const [categoryId, setCategoryId] = useState<string | null>(null);
  const [categories, setCategories] = useState<Category[]>(initialCategories);
  const [step1Errors, setStep1Errors] = useState<{ title?: string; category_id?: string }>({});

  // reading タイプ選択時に Step 1 で表示する固有フィールド。
  // type を切り替えても値自体は保持するが、submitForm で materialType === "reading" ガードされるため
  // 非 reading で保存されることはない (再リセットは不要)。
  const [readingTotalPages, setReadingTotalPages] = useState("");
  const [readingUnitLabel, setReadingUnitLabel] = useState("ページ");

  // practice_log タイプの固有フィールド。entry_schema は教材作成後に固定される想定
  // (reps/duration/freeform で UI が切り替わるため)。
  const [practiceLogEntrySchema, setPracticeLogEntrySchema] =
    useState<"reps" | "duration" | "freeform">("reps");
  const [practiceLogUnitLabel, setPracticeLogUnitLabel] = useState("回");

  // ステップ1.5: タグ選択
  const [selectedTags, setSelectedTags] = useState<Tag[]>([]);
  const [allTags] = useState<Tag[]>(initialAllTags);

  // ステップ2: 学習手法（タイプに応じて絞り込む）
  const [filteredMethods, setFilteredMethods] = useState<LearningMethod[]>(allMethods);
  const [selectedMethodIds, setSelectedMethodIds] = useState<string[]>([]);
  const [step2Error, setStep2Error] = useState("");

  // ステップ3: カード追加
  const [cards, setCards] = useState<CardDraft[]>([]);

  const [currentStep, setCurrentStep] = useState(0);

  const needsCardStep = hasSelectedCardBasedMethod(selectedMethodIds, filteredMethods);

  // 表示上のステップ数（Step0 分を +1、カードベース手法ありの場合はさらに +1）
  const visibleStepCount = needsCardStep ? TOTAL_STEPS + 1 : TOTAL_STEPS;

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

  // useCallback で参照を安定させ、startStep0Transition 経由で連打を防ぐ
  const handleNextFromStep0 = useCallback(() => {
    startStep0Transition(async () => {
      // タイプが変わったら手法の絞り込みを更新する
      try {
        const allowed = await getAllowedMethods(materialType);
        // allowed の ID に存在する allMethods のエントリのみ表示する
        const allowedIds = new Set(allowed.map((m) => m.id));
        const filtered = allMethods.filter((m) => allowedIds.has(m.id));
        setFilteredMethods(filtered);
        // 絞り込み後に無効になった手法を選択解除する
        setSelectedMethodIds((prev) => prev.filter((id) => allowedIds.has(id)));
      } catch {
        // 取得失敗時は全手法を表示して続行する
        setFilteredMethods(allMethods);
      }
      setCurrentStep(1);
    });
  }, [materialType, allMethods]);

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
    setCards((prev) => [...prev, { id: crypto.randomUUID(), ...data }]);
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
      formData.set("type", materialType);
      // reading タイプは total_pages を meta に格納。整数化できなければ空 meta
      const meta: Record<string, unknown> = {};
      if (materialType === "reading" && readingTotalPages.trim()) {
        const n = Number(readingTotalPages);
        if (Number.isInteger(n) && n > 0 && n <= 99999) {
          meta.total_pages = n;
        }
      }
      // practice_log は entry_schema のみ meta に格納 (entries は空配列スタート)
      if (materialType === "practice_log") {
        meta.entry_schema = practiceLogEntrySchema;
      }
      formData.set("meta", JSON.stringify(meta));
      if (materialType === "reading" && readingUnitLabel.trim()) {
        formData.set("unit_label", readingUnitLabel.trim());
      }
      if (materialType === "practice_log" && practiceLogUnitLabel.trim()) {
        formData.set("unit_label", practiceLogUnitLabel.trim());
      }

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

  const progressStep = STEP_TO_PROGRESS[String(currentStep)] ?? 1;

  return (
    <div className="flex flex-col gap-6">
      {/* プログレスバー。項目順が固定かつコンテンツが index に依存するため key={i} で妥当 */}
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

      {/* ステップ0: タイプ選択 */}
      {currentStep === 0 && (
        <div className="flex flex-col gap-5">
          <p className="text-sm text-muted-foreground">ステップ 1 / {visibleStepCount}: 教材タイプ</p>

          <MaterialTypeSelector value={materialType} onChange={setMaterialType} disabled={isStep0Pending} />

          <div className="flex justify-end">
            <Button onClick={handleNextFromStep0} disabled={isStep0Pending}>
              {isStep0Pending && <Loader2 aria-hidden="true" className="animate-spin" />}
              次へ
            </Button>
          </div>
        </div>
      )}

      {/* ステップ1: 基本情報 */}
      {currentStep === 1 && (
        <div className="flex flex-col gap-5">
          <p className="text-sm text-muted-foreground">ステップ 2 / {visibleStepCount}: 基本情報</p>

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

          {/* reading 固有フィールド: 総ページ数と単位ラベル (章/ページ 等) */}
          {materialType === "reading" && (
            <>
              <div className="flex flex-col gap-1.5">
                <Label htmlFor="reading-total-pages">総ページ数（任意）</Label>
                <Input
                  id="reading-total-pages"
                  type="number"
                  min={1}
                  max={99999}
                  value={readingTotalPages}
                  onChange={(e) => setReadingTotalPages(e.target.value)}
                  placeholder="例: 320"
                  data-testid="reading-total-pages-input"
                />
              </div>
              <div className="flex flex-col gap-1.5">
                <Label htmlFor="reading-unit-label">単位</Label>
                <Input
                  id="reading-unit-label"
                  value={readingUnitLabel}
                  onChange={(e) => setReadingUnitLabel(e.target.value)}
                  placeholder="例: ページ / 章"
                  data-testid="reading-unit-label-input"
                />
              </div>
            </>
          )}

          {/* practice_log 固有フィールド: 記録形式 (reps/duration/freeform) と単位 */}
          {materialType === "practice_log" && (
            <>
              <div className="flex flex-col gap-1.5">
                <Label id="practice-log-schema-label">記録形式</Label>
                <div role="radiogroup" aria-labelledby="practice-log-schema-label" className="flex gap-2">
                  {(
                    [
                      ["reps", "回数"],
                      ["duration", "時間"],
                      ["freeform", "自由記述"],
                    ] as const
                  ).map(([value, label]) => {
                    const selected = practiceLogEntrySchema === value;
                    return (
                      <button
                        key={value}
                        type="button"
                        role="radio"
                        aria-checked={selected}
                        onClick={() => setPracticeLogEntrySchema(value)}
                        data-testid={`practice-log-schema-${value}`}
                        className={cn(
                          "flex-1 rounded-lg border p-2 text-sm transition-colors",
                          selected
                            ? "border-primary bg-primary/5"
                            : "border-border hover:bg-muted/50",
                        )}
                      >
                        {label}
                      </button>
                    );
                  })}
                </div>
              </div>
              <div className="flex flex-col gap-1.5">
                <Label htmlFor="practice-log-unit-label">単位</Label>
                <Input
                  id="practice-log-unit-label"
                  value={practiceLogUnitLabel}
                  onChange={(e) => setPracticeLogUnitLabel(e.target.value)}
                  placeholder="例: 回 / 分 / セット"
                  data-testid="practice-log-unit-label-input"
                />
              </div>
            </>
          )}

          <div className="flex justify-between">
            <Button variant="outline" onClick={() => setCurrentStep(0)}>
              戻る
            </Button>
            <Button onClick={handleNextFromStep1}>次へ</Button>
          </div>
        </div>
      )}

      {/* ステップ1.5: タグ選択 */}
      {currentStep === 1.5 && (
        <div className="flex flex-col gap-5">
          <p className="text-sm text-muted-foreground">ステップ 3 / {visibleStepCount}: タグ（任意）</p>

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
          <p className="text-sm text-muted-foreground">ステップ 4 / {visibleStepCount}: 学習手法の選択</p>

          {filteredMethods.length === 0 ? (
            // getAllowedMethods が空配列を返した場合のデッドエンド対策
            <p className="text-sm text-destructive">
              このタイプに対応する学習手法が設定されていません。管理者にお問い合わせください。
            </p>
          ) : (
            <>
              <MethodSelector
                methods={filteredMethods}
                selected={selectedMethodIds}
                onChange={setSelectedMethodIds}
                onMethodsChange={() => router.refresh()}
              />

              {step2Error && (
                <p className="text-xs text-destructive">{step2Error}</p>
              )}
            </>
          )}

          <div className="flex justify-between">
            <Button variant="outline" onClick={() => setCurrentStep(1.5)}>
              戻る
            </Button>
            {filteredMethods.length > 0 && (
              <Button onClick={handleNextFromStep2} disabled={isPending}>
                {isPending && <Loader2 aria-hidden="true" className="animate-spin" />}
                {needsCardStep ? "次へ" : "作成"}
              </Button>
            )}
          </div>
        </div>
      )}

      {/* ステップ3: カード追加（カードベース手法が選択された場合のみ表示） */}
      {currentStep === 3 && needsCardStep && (
        <div className="flex flex-col gap-5">
          <p className="text-sm text-muted-foreground">ステップ 5 / {visibleStepCount}: カード追加</p>

          <CardEditor onSubmit={handleAddCard} submitLabel="追加" />

          {/* 追加済みカードの一覧 */}
          {cards.length > 0 && (
            <div className="flex flex-col gap-2">
              <p className="text-sm font-medium">追加済み ({cards.length}枚)</p>
              <ul className="flex flex-col gap-2">
                {cards.map((card, i) => (
                  <li
                    key={card.id}
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
