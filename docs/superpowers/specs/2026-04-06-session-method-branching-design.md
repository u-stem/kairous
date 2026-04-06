# v0.6.0 セッション手法分岐 設計

## 目標

ウィザードで選択した手法 (SRS / Elaboration / Pomodoro) ごとに適切なセッション体験を提供する。現状 SRS 以外の手法はカードフリップ UI しかなく機能不全。

## 背景

- SRS のみ完全な E2E 実装。Elaboration/Pomodoro は wizard で選択可能だが専用 UI なし
- Active Recall は SRS と完全に同じコードパスで動作しており差別化なし
- セッションプレイヤーは `method.slug` を見ず全手法でカードフリップ UI を表示

## スコープ

### In Scope

1. Active Recall → SRS 統合 (マイグレーション + コード整理)
2. セッションプレイヤー手法分岐ルーター
3. Elaboration セッション UI
4. Pomodoro セッション UI
5. 教材詳細ページの手法選択 UI

### Out of Scope

- Today ページの変更 (SRS due cards のみ、変更なし)
- Interleaving (material_id=NULL の Stats 問題が未解決、ADR #90)
- nonce ベース CSP (別マイルストーン)

## PBI 構成

| PBI | 内容 | 依存 |
|-----|------|------|
| 1 | Active Recall 統合 + 分岐ルーター | なし |
| 2 | Elaboration セッション | PBI 1 |
| 3 | Pomodoro セッション | PBI 1 |
| 4 | 教材詳細の手法選択 UI | PBI 1 |

---

## PBI 1: Active Recall 統合 + セッション分岐ルーター

### Active Recall → SRS 統合

**マイグレーション 00012:**

1. `material_methods` の `method_id` が `active_recall` を参照しているレコードを `srs` の `method_id` に更新
2. `learning_methods` テーブルから `active_recall` レコードを削除
3. 関連する `sessions`, `daily_logs` の `method_id` も `srs` に移行

**コード変更:**

- `MATERIAL_METHOD_SLUGS` から `"active_recall"` を削除 → `["srs", "elaboration", "pomodoro"]`
- `CARD_BASED_SLUGS` から `"active_recall"` を削除 → `["srs", "interleaving"]`
- `METHOD_CATEGORIES.memory.slugs` から `"active_recall"` を削除
- seed データ (`01_master.sql`) から `active_recall` レコードを削除
- `METHOD_DESCRIPTIONS` から `active_recall` エントリを削除

### セッション分岐ルーター

**変更箇所:** `src/app/session/[id]/page.tsx` (Server Component)

```
セッション取得 → method.slug で分岐
  ├─ srs          → CardSessionPlayer (既存の session-player.tsx)
  ├─ elaboration  → ElaborationPlayer (新規)
  └─ pomodoro     → PomodoroPlayer (新規)
```

- Server Component でセッションの `method_id` → `learning_methods.slug` を取得
- slug に応じて対応する Client Component を描画
- 未知の slug はエラー表示

---

## PBI 2: Elaboration セッション

### フロー

1. カード表面を表示 + 「なぜそうなるか、自分の言葉で説明してください」プロンプト
2. テキストエリアに記述 (任意の長さ)
3. 「回答を確認」ボタンで裏面を表示 → 自分の記述と比較
4. 自己評価 (1-4: SELF_RATING_LABELS)
5. 全カード完了 → レビュー画面 → セッション完了

### SRS との違い

- 「めくる」ではなく「テキスト入力 → 確認」の 2 ステップ
- FSRS 計算は行わない (Elaboration はスケジューリング不要)
- カード枚数は `SESSION_MAX_CARDS` (20枚) で制限
- 入力テキストを保存して振り返りに活用可能

### データ保存

- `card_reviews` に rating + response_ms を記録 (既存構造を再利用)
- `sessions.meta.elaborations` に `{ card_id: string, text: string }[]` で保存
- `daily_logs` には通常通り記録 (Edge Function 経由)

### Edge Function の変更

- `complete-session` Edge Function で method.slug をチェック
- `srs`: 現状通り card_reviews + FSRS 計算 + daily_logs
- `elaboration`: card_reviews + daily_logs のみ (FSRS 計算スキップ)
- `pomodoro`: daily_logs のみ (card_reviews なし、FSRS 計算なし)

### 新規ファイル

- `src/app/session/[id]/elaboration-player.tsx` -- Elaboration 用 Client Component
- `src/app/session/[id]/use-elaboration-player.ts` -- 状態管理 hook

---

## PBI 3: Pomodoro セッション

### フロー

1. セッション開始 → 25分の集中タイマーがスタート
2. カウントダウン表示 (円形プログレス、rest-timer と同様)
3. 25分経過 → 「集中完了」画面 + 自己評価 (1-4)
4. 「5分休憩を開始」ボタン → 5分の休憩タイマー
5. 休憩完了 → 「もう1サイクルやる?」の選択肢
   - はい → 手順 2 に戻る
   - いいえ → セッション完了

### SRS/Elaboration との違い

- カード不要。教材に紐づくが、学習行為はアプリ外
- セッション開始時に `getSessionCards` を呼ばない
- 複数サイクルを 1 セッションとして記録
- レビュー画面はサイクル数と合計時間のみ表示

### データ保存

- `sessions.meta`: `{ pomodoros_completed: number, total_focus_sec: number, total_break_sec: number }`
- `duration_sec`: タイマー合計 (集中 + 休憩)
- 自己評価: 最終サイクル終了時に 1 回のみ
- `card_reviews`: 使わない
- `daily_logs`: 通常通り記録

### 定数

- `POMODORO_FOCUS_SEC = 1500` (25分)
- `POMODORO_BREAK_SEC = 300` (5分)

### 既存コードの再利用

- rest-timer の円形プログレス SVG パターンを踏襲
- `useRestTimer` hook のインターフェースを参考に `usePomodoroTimer` を実装

### 新規ファイル

- `src/app/session/[id]/pomodoro-player.tsx` -- Pomodoro 用 Client Component
- `src/app/session/[id]/use-pomodoro-timer.ts` -- タイマー + サイクル管理 hook

---

## PBI 4: 教材詳細ページの手法選択 UI

### 現状

- `StartSessionButton` が 1 つの手法で直接セッションを開始
- 手法が複数紐づいている場合の選択 UI がない

### 変更

- 教材に紐づく手法が 1 つ → 直接セッション開始 (現状通り)
- 教材に紐づく手法が複数 → 手法カード一覧を表示
  - 各手法に名前、説明、アイコンを表示
  - SRS の場合は due cards 数も表示
  - 選択するとセッション作成 → 対応プレイヤーに遷移

### UI デザイン

手法カード一覧方式 (学習アプリのデファクト):
- 縦並びのカードリスト
- 各カードに手法名、`METHOD_DESCRIPTIONS` の説明テキスト、SRS の場合は due 数バッジ
- タップでセッション作成

### 新規ファイル

- `src/components/method-select-list.tsx` -- 手法選択カード一覧コンポーネント

---

## テスト方針

| PBI | Small テスト | Medium テスト |
|-----|-------------|-------------|
| 1 | constants 変更のテスト更新、分岐ルーターのテスト | マイグレーション検証 |
| 2 | use-elaboration-player hook のテスト、Elaboration バリデーション | Edge Function の method 分岐テスト |
| 3 | use-pomodoro-timer hook のテスト | なし (UI のみ) |
| 4 | method-select-list のテスト | なし (UI のみ) |
