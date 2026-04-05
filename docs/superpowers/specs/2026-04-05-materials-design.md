# 教材管理 (Materials) 設計

## 概要

教材の CRUD、学習手法の紐付け、カード管理を実装する。Kairous の Core Features の第 1 サブプロジェクト。

**スコープ:** 教材一覧、教材作成ウィザード、教材詳細（タブ式）、教材編集、カード CRUD、科目管理
**スコープ外:** セッション実行、FSRS 計算、daily_logs 集計、統計グラフ（後続サブプロジェクト）

---

## アーキテクチャ

### UI 基盤

shadcn/ui + Radix UI + Tailwind CSS 4 を採用する。2026 年の Next.js App Router エコシステムで最も採用率が高いパターン。

- **UI プリミティブ:** `src/components/ui/` — shadcn/ui CLI で生成。Radix UI ベースでアクセシビリティ担保
- **ドメイン複合:** `src/components/` — Kairous 固有の複合コンポーネント
- **ページ固有:** `src/app/(main)/materials/` — colocate

### テーマシステム

ダークモード/ライトモードを初期から導入する。

| 要素 | 実装 |
|------|------|
| テーマ切り替え | `next-themes` (system / light / dark) |
| CSS 変数 | shadcn/ui テーマトークン (`--background`, `--foreground`, `--primary` 等) |
| Tailwind | `dark:` バリアント、`globals.css` に `:root` と `.dark` でトークン定義 |
| 切り替え UI | Profile ページに ThemeToggle（system / light / dark） |
| アイコン | lucide-react（絵文字は使用禁止） |

### データフロー

```
Client Component
  -> Server Action (zod validation)
    -> Supabase Server Client (RLS)
      -> PostgreSQL
  <- revalidatePath で UI 更新
```

---

## ファイル構成

```
src/
  app/(main)/materials/
    page.tsx                        # 教材一覧（科目グルーピング + 検索）
    new/
      page.tsx                      # 教材作成ウィザード（3ステップ）
    [id]/
      page.tsx                      # 教材詳細（タブ: 概要 | カード | 統計）
      edit/page.tsx                 # 教材編集
      cards/
        new/page.tsx                # カード追加
        [cardId]/edit/page.tsx      # カード編集
  components/
    ui/                             # shadcn/ui 生成コンポーネント
      button.tsx
      input.tsx
      textarea.tsx
      label.tsx
      select.tsx
      checkbox.tsx
      tabs.tsx
      card.tsx
      badge.tsx
      sheet.tsx
      dialog.tsx
      separator.tsx
      scroll-area.tsx
      skeleton.tsx
      sonner.tsx                    # Toast 通知
    material-card.tsx               # 教材一覧のカード表示
    method-chip.tsx                 # 手法バッジ（カテゴリ色自動判定）
    method-selector.tsx             # 手法チェックボックスリスト（カテゴリグルーピング）
    subject-selector.tsx            # 科目ドロップダウン + インライン新規作成
    card-editor.tsx                 # カードの表裏入力フォーム（作成・編集共用）
    search-bar.tsx                  # インクリメンタル検索（デバウンス 300ms）
    empty-state.tsx                 # 空状態（アイコン + メッセージ + CTA）
    theme-toggle.tsx                # テーマ切り替え
    theme-provider.tsx              # next-themes Provider
  lib/
    actions/
      materials.ts                  # 教材 CRUD Server Actions
      subjects.ts                   # 科目 CRUD Server Actions
      cards.ts                      # カード CRUD Server Actions
      material-methods.ts           # 手法紐付け Server Actions
    constants.ts                    # 学習手法スラッグ、カテゴリ、色定義
    validations/
      materials.ts                  # zod スキーマ（Server Action と Client で共有）
```

---

## Server Actions

### 科目

| Action | 引数 | バリデーション | 戻り値 |
|--------|------|---------------|--------|
| `createSubject(formData)` | name: string | zod: 1-100文字 | `{ id, name }` or `{ error }` |
| `getSubjects()` | - | - | `Subject[]` |

### 教材

| Action | 引数 | バリデーション | 戻り値 |
|--------|------|---------------|--------|
| `createMaterial(formData)` | title, description?, subject_id | zod: title 1-200文字, subject_id UUID | `{ id }` or `{ error }` |
| `getMaterials(subjectId?)` | subjectId?: string | - | `MaterialWithMethods[]` |
| `getMaterial(id)` | id: string | - | `MaterialDetail` or null |
| `updateMaterial(id, formData)` | title, description, subject_id | zod: title 1-200文字, subject_id UUID | `{ success }` or `{ error }` |
| `deleteMaterial(id)` | id: string | - | `{ success }` or `{ error }` |

### 手法紐付け

| Action | 引数 | バリデーション | 戻り値 |
|--------|------|---------------|--------|
| `addMaterialMethod(materialId, methodId, config?)` | materialId, methodId, config | zod: UUID, JSONB | `{ success }` or `{ error }` |
| `removeMaterialMethod(materialId, methodId)` | materialId, methodId | - | `{ success }` or `{ error }` |
| `getMethods()` | - | - | `LearningMethod[]` |

### カード

| Action | 引数 | バリデーション | 戻り値 |
|--------|------|---------------|--------|
| `createCard(materialId, formData)` | front, back | zod: 1-5000文字 | `{ id }` or `{ error }` |
| `getCards(materialId)` | materialId: string | - | `Card[]` |
| `updateCard(id, formData)` | front, back | zod: 1-5000文字 | `{ success }` or `{ error }` |
| `deleteCard(id)` | id: string | - | `{ success }` or `{ error }` |

カード作成時に `srs_states` を自動初期化する。初期値は教材に紐付いた SRS 手法の `learning_methods.default_config` から取得する:
- `stability` = `default_config.initial_stability` (fallback: 1.0)
- `difficulty` = `default_config.initial_difficulty` (fallback: 5.0)
- `due_date` = TODAY
- `reps` = 0, `lapses` = 0

DB カラムのデフォルト値 `0` は Edge Function 経由で作成する場合の fallback であり、Server Action では必ず `default_config` から読み込んで明示的に設定する。

カード削除時は `srs_states` と `card_reviews` が CASCADE で自動削除される（DB FK 制約による）。学習履歴が消失するため、削除確認 Dialog でその旨を表示する。

`materials.total_cards` 列は Server Action でカード追加・削除時にインクリメント/デクリメントで同期する。教材一覧のカード枚数表示はこの列を使う（集計クエリを避ける）。

---

## インターリービングと material_methods の関係

インターリービング (`interleaving`) は `material_methods` に紐付けない。インターリービングは「複数教材を横断して学習する手法」であり、個別教材への紐付けではなくセッション開始時に複数教材を選択して開始する独立フローである（スクリーンフロー仕様のフロー C）。

教材作成ウィザード Step 2 で表示する手法は、個別教材に紐付ける手法のみ:
- srs, active_recall, elaboration, pomodoro

セッション時のみ選択可能な手法（`material_methods` に紐付けない）:
- interleaving（複数教材選択フロー）
- wakeful_rest（セッションサマリーから起動）
- free_study（任意の教材で即開始）

---

## 科目の補足

`createSubject` は `name` のみ受け取り、`color` と `display_order` は DB デフォルト値を使用する。将来的に科目管理画面で色とソート順を変更可能にするが、教材管理スコープでは対応しない。

---

## 型定義

Server Actions の戻り値型を以下のように定義する（`src/lib/types/` に配置）:

```ts
type MaterialWithMethods = {
  id: string;
  title: string;
  description: string | null;
  subject_id: string;
  subject: { id: string; name: string; color: string };
  total_cards: number;
  due_count: number; // srs_states.due_date <= TODAY のカード数
  methods: { id: string; slug: string; name: string; category: string }[];
  created_at: string;
};

type MaterialDetail = MaterialWithMethods & {
  recent_sessions: {
    id: string;
    method: { slug: string; name: string };
    duration_sec: number;
    self_rating: number | null;
    started_at: string;
  }[];
  accuracy_rate: number | null; // card_reviews で rating >= 3 の割合。レビューなしは null
};
```

`due_count` は `srs_states` テーブルから `due_date <= CURRENT_DATE` のカード数を集計する。この集計は Server Action 内で JOIN して取得し、クライアント側で FSRS 計算は行わない。

`accuracy_rate`（正答率）は `card_reviews` テーブルから `rating >= 3` の件数 / 全件数で算出する。

---

## loading.tsx 配置

シマー付きスケルトンの `loading.tsx` は以下のレベルに配置する:
- `src/app/(main)/materials/loading.tsx` — 教材一覧
- `src/app/(main)/materials/[id]/loading.tsx` — 教材詳細

---

## ページ設計

### 教材一覧 (`/materials`)

**レイアウト:**
- モバイル: 科目別セクション + リスト表示 + FAB（右下フローティングボタン）
- デスクトップ: 科目別セクション + 2カラムグリッド + ヘッダー内「+ 新規教材」ボタン

**教材カード表示内容:**
- タイトル
- カード枚数（カードベース手法がある場合）/ セッション回数（それ以外）
- due 数インジケーター（黄色ドット + 数字、due=0 は緑ドット）
- 手法チップ（カテゴリ色分け）

**検索:** タイトルのインクリメンタル検索（デバウンス 300ms）

**空状態:** EmptyState コンポーネント（lucide-react の BookOpen アイコン + 「最初の教材を追加しましょう」+ CTA ボタン）

**タップ:** 教材カードタップで `/materials/[id]` へ遷移

### 教材作成ウィザード (`/materials/new`)

3 ステップのウィザード形式。プログレスバーで現在位置を表示。

**Step 1: 基本情報**
- タイトル（必須、1-200文字）
- 説明（任意）
- 科目（必須、Select + 「+ 新規」ボタン → Dialog でインライン作成）

**Step 2: 学習手法の選択**
- カテゴリ別グルーピング（記憶 / 理解 / 集中）
- チェックボックスで複数選択（1つ以上必須）
- 各手法に名前 + 1行説明
- 選択中の手法は枠線 + 背景色で強調
- インターリービング・覚醒的休息・自由学習はセッション時選択のため表示しない
- 表示対象手法: srs, active_recall, elaboration, pomodoro

**Step 3: カード追加（条件付き）**
- カードベース手法（SRS, Active Recall）が Step 2 で 1 つ以上選ばれている場合のみ表示
- カードベース手法が未選択の場合はスキップして即完了
- 表裏入力フォーム（CardEditor コンポーネント共用）
- 追加済みカードのリスト表示（削除可）
- 連続追加: 追加後にフォームクリア、フォーカスを表（front）に戻す
- 「完了（N枚のカード）」ボタンで作成完了

**完了後:** `/materials/[id]` にリダイレクト

### 教材詳細 (`/materials/[id]`)

タブ切り替え式（shadcn/ui Tabs）。3 タブ: 概要 | カード | 統計。

**ヘッダー:**
- タイトル + 科目名
- 「編集」ボタン → `/materials/[id]/edit`
- 手法チップ一覧（MethodChip、カテゴリ色分け） + 「+ 手法」ボタン → Sheet で手法追加

**概要タブ:**
- クイック統計: 本日 due 数、総カード数、正答率（3カラムグリッド）
- 最近のセッション一覧（手法名、時間、評価、日付）
- 「学習を開始」ボタン → Sheet で手法選択（紐付け済み手法 + 自由学習）

**カードタブ:**
- カード一覧（front → back 形式）
- 「+ 新規」ボタン → `/materials/[id]/cards/new`
- 各カードに編集・削除アクション
- カードタップで編集ページへ
- 空状態: 「カードを追加して学習を始めましょう」

**統計タブ:**
- プレースホルダー（後続サブプロジェクトで実装）
- 「統計機能は準備中です」メッセージ

### 教材編集 (`/materials/[id]/edit`)

- タイトル、説明の編集フォーム
- 「保存」「キャンセル」ボタン
- 「削除」ボタン（destructive） → Dialog で確認「この教材と関連する全てのカード・セッション記録が削除されます」

### カード追加 (`/materials/[id]/cards/new`)

- CardEditor コンポーネント（ウィザード Step 3 と共用）
- 連続追加モード: 追加後にフォームクリア + フォーカス戻し
- 「完了」で教材詳細のカードタブに戻る

### カード編集 (`/materials/[id]/cards/[cardId]/edit`)

- CardEditor コンポーネント（初期値入り）
- 「保存」「キャンセル」ボタン
- 「削除」ボタン → 確認 Dialog

---

## 手法チップの色分け

| カテゴリ | slug | 色 (Light) | 色 (Dark) |
|---------|------|-----------|-----------|
| 記憶 (memory) | srs, active_recall | bg-indigo-50 text-indigo-600 | bg-indigo-950 text-indigo-400 |
| 理解 (comprehension) | interleaving, elaboration | bg-green-50 text-green-600 | bg-green-950 text-green-400 |
| 集中 (focus) | pomodoro | bg-amber-50 text-amber-600 | bg-amber-950 text-amber-400 |
| 統合 (consolidation) | wakeful_rest | bg-purple-50 text-purple-600 | bg-purple-950 text-purple-400 |
| 汎用 (general) | free_study | bg-gray-100 text-gray-600 | bg-gray-800 text-gray-400 |

色定義は `src/lib/constants.ts` に集約する。

---

## shadcn/ui コンポーネント一覧

| コンポーネント | 用途 |
|---------------|------|
| Button | 全ボタン（default, secondary, ghost, destructive, outline） |
| Input | テキスト入力 |
| Textarea | 教材説明、カード裏面 |
| Label | フォームラベル |
| Select | 科目選択 |
| Checkbox | 手法選択 |
| Tabs / TabsList / TabsTrigger / TabsContent | 教材詳細 |
| Card / CardHeader / CardContent | 教材カード、統計カード |
| Badge | 手法チップ |
| Sheet / SheetTrigger / SheetContent | 手法選択 BottomSheet |
| Dialog / DialogTrigger / DialogContent | 科目作成、削除確認 |
| Separator | セクション区切り |
| ScrollArea | カード一覧 |
| Skeleton | シマー付きローディング状態 |
| Sonner (toast) | サーバーエラー通知 |

---

## ドメイン複合コンポーネント

| コンポーネント | 責務 | Props |
|---------------|------|-------|
| MaterialCard | 教材一覧のカード | `material: MaterialWithMethods` |
| MethodChip | 手法バッジ（カテゴリ色自動判定） | `method: LearningMethod` |
| MethodSelector | 手法チェックボックスリスト | `selected: string[], onChange` |
| SubjectSelector | 科目ドロップダウン + Dialog | `value, onChange, subjects` |
| CardEditor | カード表裏入力 | `defaultValues?, onSubmit` |
| SearchBar | デバウンス検索 | `onSearch, placeholder` |
| EmptyState | 空状態表示 | `icon, title, description, action?` |
| ThemeToggle | テーマ切り替え | - |
| ThemeProvider | next-themes Provider | `children` |

---

## ローディングとエラー

### シマー付きスケルトン

全ページにシマー付きスケルトンを導入する。shadcn/ui の Skeleton コンポーネントにシマーアニメーション（`animate-pulse` または CSS `@keyframes shimmer`）を適用。

| ページ | スケルトン構成 |
|-------|-------------|
| 教材一覧 | 科目ヘッダー + MaterialCard x 3 のスケルトン |
| 教材詳細 | ヘッダー + タブ + コンテンツ領域のスケルトン |
| カード一覧 | カード行 x 5 のスケルトン |

Next.js の `loading.tsx` でページ遷移時のスケルトンを表示する。

### エラーハンドリング

| シナリオ | 対応 |
|---------|------|
| フォーム送信中 | Button に loading spinner（lucide-react Loader2 アイコン回転）、disabled で二重送信防止 |
| バリデーションエラー | Input/Textarea 下に赤テキスト（zod エラーメッセージ） |
| サーバーエラー | Sonner toast 通知 |
| 教材削除 | Dialog で確認 |
| 空状態 | EmptyState コンポーネント |
| 楽観的更新 | カード追加時に即リスト反映、失敗時にロールバック + toast |

---

## デザインレビュー基準

実装時に以下を検証する:

- [ ] モバイルファースト（375px 基準、768px でレスポンシブ切り替え）
- [ ] ダークモード/ライトモードの両方で正しく表示されるか
- [ ] アクセシビリティ（Radix UI でキーボード操作・スクリーンリーダー対応）
- [ ] フォーム送信中の loading 状態が表示されるか
- [ ] シマー付きスケルトンがページ遷移時に表示されるか
- [ ] 空状態が適切に表示されるか
- [ ] 手法チップの色分けが一貫しているか
- [ ] lucide-react アイコンのみ使用（絵文字禁止）
- [ ] shadcn/ui のデザイントークンで色・spacing・typography が統一されているか
- [ ] Toast 通知がエラー時に表示されるか

---

## 依存パッケージ（追加）

| パッケージ | 用途 |
|-----------|------|
| `next-themes` | ダークモード/ライトモード切り替え |
| `lucide-react` | アイコン |
| `sonner` | Toast 通知 |
| `date-fns` | 日付フォーマット（「3日前」等の相対表示） |

shadcn/ui コンポーネントは `bunx shadcn@latest add <component>` で個別追加する。内部依存として `@radix-ui/*` が自動インストールされる。

---

## テスト方針

### Small テスト（tests/small/）

| 対象 | テスト内容 |
|------|-----------|
| MethodChip | カテゴリに応じた色クラスの出力 |
| MethodSelector | 手法選択・解除のインタラクション |
| SubjectSelector | 科目選択 + 新規作成 Dialog の表示 |
| CardEditor | 表裏入力、バリデーション（空入力でエラー） |
| SearchBar | デバウンス動作 |
| EmptyState | アイコン・メッセージ・CTA の表示 |
| 教材作成ウィザード | Step 遷移、条件付き Step 3 スキップ |
| zod スキーマ | バリデーションのエッジケース |

### Medium テスト（tests/medium/）

| 対象 | テスト内容 |
|------|-----------|
| createMaterial | 教材作成 + material_methods 一括作成 |
| createCard | カード作成 + srs_states 自動初期化 |
| deleteMaterial | CASCADE 削除の確認 |
| getMaterials | 科目別取得、手法情報の結合 |
| RLS | 他ユーザーの教材にアクセスできないこと |
