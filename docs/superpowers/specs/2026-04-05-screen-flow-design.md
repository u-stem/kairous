# Kairous 画面フロー設計

## 概要

学習管理Webアプリ Kairous の画面フロー設計。モバイルファーストのレスポンシブ設計で、両デバイスで快適に使えることを目指す。

---

## 1. ナビゲーション構造

### モバイル: BottomNav（4タブ）

| タブ | ラベル | 遷移先 |
|------|--------|--------|
| 1 | 今日 | `/` |
| 2 | 教材 | `/materials` |
| 3 | 統計 | `/stats` |
| 4 | 設定 | `/profile` |

### PC: サイドバー

BottomNav と同じ4項目をサイドバーに展開。メインコンテンツ領域を広く使う。

### 切り替え基準

- BreakPoint: 768px
- 768px 未満: BottomNav
- 768px 以上: Sidebar

---

## 2. ページ一覧（12ページ）

| URL | ページ名 | コンポーネント | 役割 |
|-----|----------|----------------|------|
| `/` | 今日 | TodayPage | due件数表示、教材タップで手法選択→学習開始、ミックス学習セクション |
| `/materials` | 教材一覧 | MaterialsPage | 分野別に教材を表示、追加・編集 |
| `/materials/[id]` | 教材詳細 | MaterialDetailPage | 手法設定(material_methods)、統計、カード管理(カード系手法がある場合のみ) |
| `/materials/[id]/cards/new` | カード追加 | CardNewPage | 新規カード作成(front/back入力) |
| `/session/[id]` | 学習セッション | SessionPage | 手法に応じたセッション画面(カード/タイマー/記述) |
| `/session/[id]/review` | 自己評価 | SessionReviewPage | セッション全体の理解度を1-4で評価(学習系手法は必須、wakeful_rest/free_studyはスキップ) |
| `/session/[id]/summary` | サマリー | SessionSummaryPage | 結果表示 + 覚醒的休息タイマー起動ボタン |
| `/rest/[id]` | 覚醒的休息 | WakefulRestPage | 10-15分カウントダウンタイマー。独立セッションとして記録。[id]は休息セッション自体のID |
| `/stats` | 統計 | StatsPage | daily_logsベースのダッシュボード(分野別・手法別) |
| `/profile` | プロフィール | ProfilePage | アカウント設定、通知、リマインダー |
| `/auth/login` | ログイン | LoginPage | Supabase Auth |
| `/auth/signup` | サインアップ | SignupPage | Supabase Auth |

---

## 3. 画面遷移フロー

### フローA: 教材追加 → 学習準備

```
/materials → +追加 → /materials/[id]（手法を紐付け）
  → カード系手法あり? → /materials/[id]/cards/new（カード追加）
  → 戻る → / (今日)
```

### フローB: 通常セッション（1教材 x 1手法）

```
/ (今日) → 教材タップ → BottomSheet(手法選択)
  → /session/[id]（学習実行）
  → /session/[id]/review（自己評価 1-4、必須）
  → /session/[id]/summary（結果表示）
  → / (今日)
```

### フローC: インターリービングセッション

```
/ (今日) → 「ミックス学習」タップ → BottomSheet(教材を複数選択、チェック式)
  → /session/[id]（シャッフル表示）
  → /session/[id]/review（自己評価）
  → /session/[id]/summary
  → / (今日)
```

- sessions.material_id = NULL
- session_materials に選択した教材を記録

### フローD: 覚醒的休息（任意）

```
/session/[id]/summary → 「休息を始める」ボタン
  → POST で休息セッションを作成、レスポンスの rest_session_id を取得
  → /rest/[rest_session_id]（10-15分タイマー）
  → 完了 → / (今日)
```

- 「休息を始める」押下時に新規セッション(method_id=wakeful_rest)をAPI経由で作成
- meta.parent_session_id に親セッションIDを記録
- URL の [id] は休息セッション自体のID（ブラウザバック・直接アクセスで復元可能）

---

## 4. データモデル変更点

元の設計書(kairous_design.md)からの変更。

### sessions テーブル

```sql
-- 変更1: material_id を NULL許容に
material_id UUID REFERENCES materials(id) -- NULL = interleaving session

-- 変更2: self_rating 列を追加（NULL許容）
self_rating INT CHECK (self_rating >= 1 AND self_rating <= 4) -- NULLable
-- 学習系手法(SRS, active_recall, interleaving, elaboration, pomodoro)では必須（アプリ側で強制）
-- wakeful_rest, free_study では NULL（自己評価の対象外）
-- card_reviews.rating(カード単位の難易度)とは別の概念

-- 変更3: status 列の定義を明確化
status TEXT NOT NULL DEFAULT 'in_progress' CHECK (status IN ('in_progress', 'completed', 'abandoned'))
```

### session_materials テーブル（新規）

```sql
CREATE TABLE session_materials (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  session_id UUID NOT NULL REFERENCES sessions(id) ON DELETE CASCADE,
  material_id UUID NOT NULL REFERENCES materials(id),
  UNIQUE(session_id, material_id)
);
```

インターリービングセッションで複数教材を参照するための中間テーブル。

### RLS 方針

全テーブルに RLS を有効化する。方針:
- ユーザーテーブル: `auth.uid() = user_id` でフィルタ
- sessions, cards, materials 等: user_id 列または user_id への JOIN で制限
- session_materials: sessions 経由で user_id を検証
- Edge Functions は service_role key で RLS をバイパスし、FSRS計算・daily_logs upsert を実行
- 詳細なポリシー定義は Step 2 (Supabase Migration) で策定

### daily_logs テーブル

```sql
-- 変更: method_id 列を追加
method_id UUID NOT NULL REFERENCES learning_methods(id)

-- UNIQUE制約を変更
UNIQUE(user_id, subject_id, method_id, log_date)
```

---

## 5. 手法分類と記録方式

### カード系（card_reviews 使用）

| 手法 | セッションUI | 記録先 |
|------|-------------|--------|
| SRS | カード表示→回答→rating(1-4)→次カード | card_reviews + srs_states |
| アクティブリコール | カード表面のみ→自力想起→裏面確認→rating | card_reviews + meta `{ "recall_score": 0.8 }` |
| インターリービング | 複数教材からシャッフル→回答→rating。各カードのFSRS状態は所属教材の srs_states をそのまま使用（シャッフルは出題順のみ、FSRS計算は変わらない） | card_reviews を記録、session_materials で教材の対応を管理 |

### 時間/記述系（sessions.meta JSONB のみ）

| 手法 | セッションUI | meta の構造 |
|------|-------------|-------------|
| 精緻化 | テーマ表示→自由記述エリア | `{ "notes": [...] }` |
| ポモドーロ | 25分タイマー→5分休憩→繰り返し | `{ "pomodoros_completed": 3, "breaks_taken": 2 }` |
| 自由学習 | 経過時間カウンター(ストップウォッチ) | `{}` (duration_sec のみ) |

### 固定化

| 手法 | セッションUI | meta の構造 |
|------|-------------|-------------|
| 覚醒的休息 | 10-15分カウントダウン | `{ "parent_session_id": "...", "rest_duration_sec": 600 }` |

---

## 6. 教材詳細ページの条件分岐

material_methods に紐付いた手法に応じてUIを出し分ける。

### カード系手法が1つ以上ある場合

- 手法設定セクション
- カード管理セクション（一覧・追加・編集）
- 統計セクション

### 時間/記述系手法のみの場合

- 手法設定セクション
- 統計セクション
- カード管理セクションは非表示

---

## 7. 「今日」タブの構成

上から順に:

1. **ヘッダー**: 日付、合計due件数
2. **教材リスト**: 分野でグループ化、各教材にdue件数を表示
   - タップ → BottomSheet で手法選択 → セッション開始
3. **ミックス学習セクション**: インターリービング専用の導線
   - タップ → BottomSheet で教材を複数選択(チェック式) → セッション開始
4. **今日の学習サマリー**: 完了セッション数、合計学習時間

---

## 8. 設計上の制約

1. **material_methods** が設計の核心。1教材に複数手法を紐付ける構造を壊さない
2. **FSRS** の計算は必ず Supabase Edge Function で行う（クライアント計算禁止）
3. **daily_logs** はセッション終了時に Edge Function で upsert（リアルタイム集計しない）
4. **インターリービングの daily_logs** は session_materials の各教材の subject_id ごとに按分。按分ロジック: card_reviews から各教材のカード枚数を集計し、枚数比で duration_sec を分配する（例: 教材Aから8枚、教材Bから12枚 → A=40%, B=60%）
5. **自己評価UI**（self_rating 1-4）は学習系手法（SRS, active_recall, interleaving, elaboration, pomodoro）で必須。wakeful_rest と free_study はスキップ（self_rating = NULL）
6. sessions.status は 'in_progress' / 'completed' / 'abandoned' の3状態。ブラウザ離脱時は abandoned として扱い、再開はしない
7. **覚醒的休息** タイマーはセッション後に「任意で」起動する設計
8. **モバイルファースト** だがPC版でも快適なレスポンシブ設計
9. **RLS** は全テーブルに有効化。Edge Functions は service_role key でバイパス
