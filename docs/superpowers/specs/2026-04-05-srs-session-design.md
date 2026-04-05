# SRS セッション実行フロー設計

## 概要

教材の due カードをフリップ形式で学習し、自己評価 (1-4) → FSRS 更新 → daily_logs 記録までの一連のループを実装する。Kairous の Core Features 第 2 サブプロジェクト。

**スコープ:** Today ページ、SRS セッション実行、セッションサマリー、安静タイマー、FSRS Edge Function
**スコープ外:** 他の学習手法 (Pomodoro, Elaboration 等)、インターリービング、Stats ページ、Profile ページ

---

## アーキテクチャ

### データフロー

```
Today (/) → 教材タップ「学習」
  → Server Action: createSession(materialId, methodId)
    → sessions INSERT (status: 'in_progress')
  → /session/[id] にリダイレクト

/session/[id] (カードフリップ)
  → due カードを取得 (Server Component)
  → クライアント状態でカード進行管理
  → 全カード完了
  → Server Action: completeSession(sessionId, reviews[])
    → card_reviews 一括 INSERT
    → sessions UPDATE (status: 'completed', duration_sec, self_rating)
    → Edge Function 呼び出し: complete-session(session_id)
  → /session/[id]/summary にリダイレクト

Edge Function: complete-session
  → card_reviews 取得
  → ts-fsrs で FSRS 計算
  → srs_states 更新 (due_date, stability, difficulty, reps, lapses)
  → daily_logs upsert (日付 + 科目 + 手法で集計)

/session/[id]/summary
  → 結果表示
  → 「安静タイマー」→ createRestSession → /rest/[id]

/rest/[id]
  → 10 分カウントダウン
  → 完了 → sessions UPDATE (status: 'completed')
```

### セッション状態管理

カードフリップ中はページ遷移しない。クライアント状態で管理する:

```typescript
type CardReview = {
  card_id: string;
  rating: 1 | 2 | 3 | 4;
  started_at: string;  // カード表示時刻
  answered_at: string; // 評価タップ時刻
};

// クライアント状態
currentIndex: number;       // 現在のカード位置
isFlipped: boolean;         // 表/裏
reviews: CardReview[];      // 評価結果 (完了時にまとめて送信)
```

カード 1 枚ごとに Server Action を呼ばない。全カード完了後にまとめて送信する。レイテンシを避け、テンポの良い学習体験を維持するため。

### セッション起動の導線

2 箇所から起動可能。起動ロジック (Server Action) は共通:

1. **Today ページ** (`/`): 「学習」ボタン → `createSession(materialId, srsMethodId)`
2. **教材詳細** (`/materials/[id]`): 「学習を始める」ボタン → 同じ Server Action

---

## 画面設計

### Today ページ (/)

Server Component。due カードの集計とリスト表示。

**レイアウト:**
- 日付表示 + 「今日の学習」見出し
- サマリーカード: 復習カード総数 + 教材数 (2 カラム)
- due のある教材リスト:
  - 教材名、科目名、due カード数
  - 「学習」ボタン (タップでセッション作成 → リダイレクト)
- due = 0 の場合: EmptyState (「復習完了」メッセージ)

**データ取得:**
- `getMaterials()` の既存ロジックで due_count を取得
- due_count > 0 の教材のみ表示
- SRS 手法が紐付いている教材に限定

### セッション画面 (/session/[id])

Server Component (初期データ取得) + Client Component (カードフリップ UI)。

**レイアウト:**
- ヘッダー: 進捗表示 (3/12)、手法名 (SRS)
- カード表示エリア:
  - **表面:** テキスト表示 + 「めくる」ボタン (中央下部)
  - **裏面:** 表面テキスト (小さく薄く表示) + 裏面テキスト + 評価ボタン (1-4)
- 評価ボタン: 横並び 4 つ
  - 1: 忘れた (赤)
  - 2: 曖昧 (橙)
  - 3: 正解 (緑)
  - 4: 簡単 (青)
- 評価タップ → 次のカードへ (アニメーションなし、即遷移)

**途中離脱:**
- ブラウザバック/閉じた場合: sessions.status = 'in_progress' のまま残る
- 未送信の reviews は失われる (意図的。途中離脱は「やり直し」として扱う)

### サマリー画面 (/session/[id]/summary)

Server Component。セッション結果を表示。

**レイアウト:**
- チェックマーク + 「セッション完了」
- 教材名表示
- 統計 3 指標 (横並び):
  - カード数
  - 正解率 (rating 3+4 の割合)
  - 所要時間 (mm:ss)
- 評価分布: 1-4 の各カウントをカラーブロックで表示
- 「安静タイマーを開始 (10分)」ボタン
- 「ホームに戻る」ボタン

### 安静タイマー (/rest/[id])

Client Component。カウントダウンタイマー。

**レイアウト:**
- 円形プログレス表示 (残り時間)
- 中央に mm:ss 表示
- 完了時: メッセージ + 「ホームに戻る」ボタン

**実装:**
- デフォルト 10 分
- `requestAnimationFrame` または `setInterval` でカウントダウン
- セッション作成時: `learning_methods.slug = 'wakeful_rest'`、`meta = { parent_session_id: <元のセッションID> }`
- タイマー完了時: `sessions.status = 'completed'`、`sessions.duration_sec = 600`

---

## Server Actions

### createSession(materialId: string, methodId: string)

- 認証チェック
- 教材の所有権確認
- sessions INSERT: `{ material_id, user_id, method_id, status: 'in_progress', started_at: now() }`
- 戻り値: `{ success: true, data: { id: sessionId } }`

### getSessionCards(sessionId: string)

- 認証チェック
- セッションの所有権確認
- セッションに紐付く教材の due カード一覧を取得
- srs_states JOIN で due_date <= today のカードを抽出
- display_order でソート

### completeSession(sessionId: string, reviews: CardReview[])

- 認証チェック
- セッションの所有権確認 + status = 'in_progress' であること
- card_reviews 一括 INSERT
- sessions UPDATE: status = 'completed', duration_sec, self_rating (全レビューの平均を四捨五入)
- Edge Function `complete-session` を呼び出し (session_id を渡す)
- 戻り値: `{ success: true }`

### createRestSession(parentSessionId: string)

- 認証チェック
- 親セッションの所有権確認
- wakeful_rest の method_id を取得
- sessions INSERT: `{ user_id, method_id, status: 'in_progress', meta: { parent_session_id } }`
- 戻り値: `{ success: true, data: { id: restSessionId } }`

---

## Edge Function

### complete-session

**パス:** `supabase/functions/complete-session/index.ts`

**入力:** `{ session_id: string }`

**処理:**
1. sessions テーブルから session_id のレコードを取得 (material_id, method_id, user_id)
2. card_reviews テーブルから当該セッションの全レビューを取得
3. 各カードの現在の srs_states を取得
4. ts-fsrs で FSRS-5 アルゴリズムを実行:
   - 入力: 現在の stability, difficulty, reps, lapses, rating
   - 出力: 新しい due_date, stability, difficulty, reps, lapses
5. srs_states を一括 UPDATE
6. daily_logs を upsert:
   - キー: user_id + log_date + subject_id + method_id
   - 値: total_duration_sec += session.duration_sec, total_cards_reviewed += reviews.length

**認証:** service_role key で RLS バイパス。呼び出し元の Server Action が認証済みであることを前提とする。

---

## テスト戦略

### Small テスト

- セッション状態管理ロジック: カード進行、isFlipped トグル、reviews 配列の構築
- サマリー統計計算: 正解率、所要時間のフォーマット
- 安静タイマーのカウントダウンロジック
- self_rating の平均計算 (四捨五入)

### Medium テスト

- createSession: sessions テーブルに正しく INSERT されるか
- completeSession: card_reviews 一括 INSERT + sessions.status 更新
- Edge Function: FSRS 計算で srs_states が正しく更新されるか
- Edge Function: daily_logs が正しく upsert されるか (既存レコードへの加算)
- getSessionCards: due カードのみ返すか

### テスト対象外

- カードフリップのアニメーション
- ページ遷移の E2E フロー (Large テストで対応)
- ts-fsrs ライブラリ自体の計算精度

---

## 既存コードへの変更

### Today ページ (/) の置き換え

現在のプレースホルダーを完全に置き換え。`src/app/(main)/page.tsx`。

### 教材詳細ページへの「学習を始める」ボタン追加

`src/app/(main)/materials/[id]/page.tsx` の概要タブに「学習を始める」ボタンを追加。due_count > 0 の場合のみ表示。

### 新規ファイル

```
src/
  app/
    (main)/
      page.tsx                              # REPLACE: Today ページ
    session/
      [id]/
        page.tsx                            # CREATE: セッション実行
        session-player.tsx                  # CREATE: カードフリップ Client Component
        summary/
          page.tsx                          # CREATE: サマリー
    rest/
      [id]/
        page.tsx                            # CREATE: 安静タイマー
        rest-timer.tsx                      # CREATE: タイマー Client Component
  lib/
    actions/
      sessions.ts                           # CREATE: セッション CRUD
supabase/
  functions/
    complete-session/
      index.ts                              # CREATE: FSRS + daily_logs
```
