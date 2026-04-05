# Kairous — 設計まとめ

## プロジェクト概要

**目的**: 最新の学習科学に基づき、複数の学習手法を組み合わせて一括管理するWebアプリ

**アプリ名**: Kairous（カイルス）
**名前の由来**: ギリシャ語 kairos（好機・最適な瞬間）+ nous（知性）の造語。「最適なタイミングで知を得る」というスペーシング効果の本質を名前に内包する。競合調査済み・使用可能。

**コンセプト**:
- 分野・教材ごとに最適な学習手法を選択・切り替えできる
- セッション記録と統計を自動で蓄積する
- SRS（間隔反復）を筆頭に、複数手法を柔軟に組み合わせる

---

## 学習科学的根拠（2026年現在の知見）

Kairous が実装する各手法は認知科学・神経科学の研究に基づいている。
実装時のUX設計・機能優先度の判断軸として参照すること。

### 記憶定着系（最もエビデンスが厚い）

**スペーシング効果（分散学習）** `slug: srs`
- 同じ学習時間でも集中してやるより日をまたいで分散させるほうが長期記憶に残る
- 忘れかけた状態から思い出す行為が神経回路を強化する（望ましい困難）
- 実装: FSRSアルゴリズム（SM-2より少ない復習回数で同等の定着率）
- `srs_states` テーブルで stability・difficulty・due_date を管理

**想起練習（Testing Effect）** `slug: active_recall`
- 読むより「思い出す」行為そのものが記憶を強化する（Karpicke & Roediger 2008）
- 受動的な再読より圧倒的に効率が高い
- 実装: 白紙再現・問題演習・フラッシュカードのいずれかを選択

**忘れかけで復習する（レジリエント記憶）** — SRS に内包
- ほぼ忘れた状態からの想起が高ストレス下でも機能する記憶を形成する
- スムーズに思い出せるタイミングでの復習は強化効果が薄い
- FSRSのスケジューリングがこれを自動で実現する

### 深い理解系

**インターリービング（交互学習）** `slug: interleaving`
- 同一テーマをまとめて学ぶより複数テーマを交互に学ぶほうが応用力が上がる
- 数学なら同種の問題だけでなく種類をシャッフルして解く
- 実装: 複数教材を横断するセッションモード

**精緻化（エラボレーション）** `slug: elaboration`
- 「なぜ？」「どういう仕組みで？」と自問しながら学ぶ
- ファインマン・テクニック（小学生に説明するつもりで書く）が代表例
- 実装: セッション中に自由記述メモを促すUIを提供

### 2025〜26年の新知見

**覚醒的休息（Wakeful Rest）** `slug: wakeful_rest`
- 学習直後の10〜15分、スマホを触らず「ぼーっとする」だけで想起率が有意に向上
- 海馬がグリンパティック系を活性化させ情報を整理する物理的な時間が必要
- 学習直後にSNSを見ると記憶固定化プロセスへの「干渉」が起きる
- 実装: セッション終了後に任意でWakeful Restタイマーを起動できる

**AIを「筋肉」として使う学習** — 将来機能候補
- AIに答えを聞くだけの受動学習は実力が落ちる（GAI-SES研究、2025）
- 自分で考えてからAIに検証・反論させる能動的活用が効果的
- 実装: 将来的にAI問答機能を追加する際、ヒントは段階的に出す設計にする

### UX設計指針（学習科学に基づく）

**流暢性の錯覚を防ぐ**
- 「わかった気がする」は最大の敵。読むだけでは定着しない
- セッション後に必ず自己評価（1〜4）を促すUI
- 確認テストを自然に挟む設計

**睡眠固定化を活用する**
- 学習後の睡眠でREM睡眠中に海馬→皮質への記憶転送が起きる
- 就寝前リマインダーで翌日の due カードを予告し、睡眠固定化を活用する

**習慣化の設計**
- Wakeful Rest・ポモドーロの完了を可視化（バッジ・連続記録）して習慣を促す
- 毎日の due カード数をホーム画面で常に見せ、「今日のノルマ」感を演出する

### 手法選択マトリクス

| 学習目標 | 推奨手法 | 補助手法 |
|----------|----------|----------|
| 暗記・定着（語彙・公式） | SRS | アクティブリコール |
| 概念理解（仕組みを知る） | 精緻化 | インターリービング |
| 試験対策（応用・問題演習） | インターリービング | SRS |
| 集中力・習慣化 | ポモドーロ | 覚醒的休息 |
| 読書・資料の消化 | アクティブリコール | 覚醒的休息 |

---

## 技術スタック

| レイヤー | 選定 | 理由 |
|----------|------|------|
| フレームワーク | Next.js (App Router) | sugara と同スタック、知識流用可能 |
| バックエンド/DB | Supabase | Auth・RLS・Realtime・Edge Functions 一体型 |
| ホスティング | Vercel | Next.js との相性◎ |
| 言語 | TypeScript | 型安全・sugara と統一 |

---

## コア機能方針

- **手法の柔軟選択**: 1教材に複数の手法を紐付け、日によって切り替え可能
- **記録の粒度を分離**: 粗い記録（セッション）と細かい記録（カード回答）を別テーブルで管理
- **FSRSアルゴリズム**: Edge Function で計算し、`srs_states` に保存（デバイス間で同期）
- **手法をデータとして持つ**: `learning_methods` テーブルでシステム定義手法とユーザー手法を区別

---

## データモデル（ER設計）

### コアドメイン

```
users
  id, email, display_name, created_at

subjects  (分野: 英語, 数学, プログラミング...)
  id, user_id FK, name, color, display_order, created_at

materials  (教材: 英単語帳, 参考書, ノート...)
  id, subject_id FK, user_id FK
  title, description, source_type
  total_cards, created_at

learning_methods  (手法マスタ: SRS, ポモドーロ, アクティブリコール...)
  id, slug, name, category
  default_config (JSONB), is_system (bool)

material_methods  (教材×手法の中間テーブル ← ここが核心)
  id, material_id FK, method_id FK
  config (JSONB), is_active, created_at

cards  (SRS等で使うカード)
  id, material_id FK
  front, back, card_type, display_order, created_at
```

**`material_methods` の設計意図**:
1教材に複数手法を紐付け可能。`config` (JSONB) で手法ごとの設定（SRS間隔, ポモドーロ分数など）を柔軟に持つ。

### セッション・記録系

```
sessions  (学習セッション: 粗い記録)
  id, user_id FK, material_id FK (NULL許容), method_id FK
  duration_sec, status ('in_progress' | 'completed' | 'abandoned')
  self_rating (1-4, NULL許容)  -- 学習系手法で必須、wakeful_rest/free_studyはNULL
  meta (JSONB)  -- 手法固有データ置き場
  started_at, ended_at

session_materials  (インターリービング用: セッション×教材)
  id, session_id FK, material_id FK
  UNIQUE(session_id, material_id)

card_reviews  (カード回答ログ: 細かい記録)
  id, session_id FK, card_id FK
  rating (1-4), response_ms, reviewed_at

srs_states  (FSRSアルゴリズムの状態: カードごと)
  id, card_id FK, user_id FK
  stability, difficulty
  reps, lapses
  due_date, last_reviewed_at

daily_logs  (集計テーブル: セッション終了時にupsert)
  id, user_id FK, subject_id FK, method_id FK, log_date
  total_sec, session_count, cards_reviewed
  UNIQUE(user_id, subject_id, method_id, log_date)
```

**`sessions.meta` (JSONB) の使い方例**:
- ポモドーロ: `{ "pomodoros_completed": 3, "breaks_taken": 2 }`
- Wakeful Rest: `{ "parent_session_id": "uuid", "rest_duration_sec": 600 }`
- アクティブリコール: `{ "recall_score": 0.8 }`

---

## 重要な設計判断

### FSRSの配置
- **Edge Function** で計算 → `srs_states` に保存
- 理由: デバイス間で due_date が一致する、クライアント計算のズレを防ぐ

### 手法をコードでなくデータで持つ
- `learning_methods.slug` でコード内参照 (`srs`, `pomodoro`, `active_recall`...)
- `is_system = true` がシステム定義、`false` がユーザー定義
- 新手法追加時にコード変更不要（設定のみ）

### 集計テーブル分離 (`daily_logs`)
- リアルタイム集計クエリを避け、セッション終了時にバックグラウンドで集計
- ダッシュボードのクエリが O(1) になる

---

## 次のステップ（Claude Codeで進める）

1. **画面フロー設計** (ページ一覧とナビゲーション)
2. **Supabase マイグレーション作成** (上記ER通りのSQL)
3. **`learning_methods` シードデータ** (SRS/ポモドーロ等の初期データ)
4. **FSRS Edge Function** 実装
5. **UIコンポーネント** 実装

---

## 学習手法シード一覧

| slug | 名前 | category | 根拠 |
|------|------|----------|------|
| `srs` | 間隔反復 (FSRS) | memory | エビングハウス忘却曲線・FSRSアルゴリズム |
| `active_recall` | アクティブリコール | memory | Testing Effect（Karpicke & Roediger 2008） |
| `interleaving` | インターリービング | comprehension | 交互学習による転移促進 |
| `elaboration` | 精緻化（Why学習） | comprehension | 自己説明効果・ファインマン法 |
| `pomodoro` | ポモドーロ | focus | 認知負荷理論・単一タスク集中 |
| `wakeful_rest` | 覚醒的休息 | consolidation | グリンパティック系・記憶固定化（2026年研究） |
| `free_study` | 自由学習（記録のみ） | general | 手法不問・記録だけ残す |
