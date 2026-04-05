# SRS セッション実行フロー設計

## 概要

教材の due カードをフリップ形式で学習し、セッション自己評価 (1-4) → FSRS 更新 → daily_logs 記録までの一連のループを実装する。Kairous の Core Features 第 2 サブプロジェクト。

**スコープ:** Today ページ、SRS セッション実行、セッション自己評価、セッションサマリー、安静タイマー、FSRS Edge Function
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
  → due カードを取得 (Server Component、最大 20 枚)
  → クライアント状態でカード進行管理
  → 全カード完了
  → /session/[id]/review にリダイレクト (reviews[] をクエリまたは state で渡す)

/session/[id]/review (セッション自己評価)
  → ユーザーがセッション全体の理解度を 1-4 で評価
  → Server Action: completeSession(sessionId, reviews[], selfRating)
    → sessions UPDATE (status: 'completed', duration_sec, self_rating)
    → Edge Function 呼び出し: complete-session(session_id, reviews[])
  → /session/[id]/summary にリダイレクト

Edge Function: complete-session
  → card_reviews 一括 INSERT
  → ts-fsrs で FSRS 計算
  → srs_states 更新 (state, due_date, stability, difficulty, reps, lapses)
  → daily_logs upsert (sessions → materials → subjects で subject_id を取得)

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
  started_at: string;  // カード表示時刻 (ISO 8601)
  answered_at: string; // 評価タップ時刻 (ISO 8601)
};

// クライアント状態
currentIndex: number;       // 現在のカード位置
isFlipped: boolean;         // 表/裏
reviews: CardReview[];      // 評価結果 (完了時にまとめて送信)
```

カード 1 枚ごとに Server Action を呼ばない。全カード完了後にまとめて送信する。レイテンシを避け、テンポの良い学習体験を維持するため。

### カードバッチサイズ

1 セッションあたり最大 20 枚。due カードが 20 枚を超える場合は最初の 20 枚のみ取得し、残りは次のセッションに回す。ユーザーに「残り N 枚」を表示し、サマリー画面から続けてセッションを開始できるようにする。

過大なバッチは学習効果を下げる (desirable difficulty の範囲を超える) ため、上限を設ける。

### セッション起動の導線

2 箇所から起動可能。起動ロジック (Server Action) は共通:

1. **Today ページ** (`/`): 「学習」ボタン → `createSession(materialId, srsMethodId)`
2. **教材詳細** (`/materials/[id]`): 「学習を始める」ボタン → 同じ Server Action

Today ページの「学習」ボタンは、教材に紐付いた SRS 手法の method_id を自動で解決する。教材に SRS と Active Recall の両方が紐付いている場合は SRS を優先する (このスコープでは SRS のみ対応のため)。

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
- `getDueMaterials()` 新規作成。SRS 手法が紐付いている教材で due_count > 0 のものを返す
- 各教材の SRS method_id も同時に取得 (セッション作成に必要)

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
- 評価タップ → 次のカードへ

**途中離脱:**
- ブラウザバック/閉じた場合: sessions.status = 'in_progress' のまま残る
- 未送信の reviews は失われる (意図的。途中離脱は「やり直し」として扱う)

### 自己評価画面 (/session/[id]/review)

Client Component。セッション全体の理解度をユーザーに問う。

**レイアウト:**
- 「このセッションの理解度は？」見出し
- カード評価のサマリー (N 枚中 M 枚正解)
- 4 つの評価ボタン (縦並び、各ボタンに説明文):
  - 1: ほとんど思い出せなかった
  - 2: 曖昧な部分が多かった
  - 3: おおむね理解できた
  - 4: 完璧に理解した
- 評価タップ → completeSession 呼び出し → summary にリダイレクト

**目的:** 流暢性の錯覚を防ぐ。カード個別の評価とは別に、セッション全体を振り返る機会を強制する。ユーザーは個別カードでは「3 (正解)」と評価しても、全体として理解が浅いと感じれば「2」を付けることができる。

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
- due カードが残っている場合: 「続けて学習する (残り N 枚)」ボタン
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
- zod バリデーション (materialId: uuid, methodId: uuid)
- sessions INSERT: `{ material_id, user_id, method_id, status: 'in_progress', started_at: now() }`
- 戻り値: `ActionResult<{ id: string }>`

### getDueMaterials()

- 認証チェック
- SRS 手法が紐付いている教材を取得
- 各教材の due_count を srs_states から集計
- due_count > 0 のもののみ返す
- 各教材の SRS method_id も返す
- 戻り値: `DueMaterial[]`

### getSessionCards(sessionId: string)

- 認証チェック
- セッションの所有権確認
- セッションに紐付く教材の due カード一覧を取得
- srs_states JOIN で due_date <= today のカードを抽出
- display_order でソート
- 最大 20 枚に制限
- 戻り値: `Card[]`

### completeSession(sessionId: string, reviews: CardReview[], selfRating: 1 | 2 | 3 | 4)

- 認証チェック
- セッションの所有権確認 + status = 'in_progress' であること
- zod バリデーション (reviews 配列、selfRating: 1-4)
- sessions UPDATE: status = 'completed', duration_sec (started_at からの経過秒), self_rating
- Edge Function `complete-session` を呼び出し (session_id + reviews[] を渡す)
- 戻り値: `ActionResult<undefined>`

### getSession(sessionId: string)

- 認証チェック
- セッションの所有権確認
- sessions + card_reviews + materials を JOIN して返す
- サマリー画面で使用
- 戻り値: `SessionDetail | null`

### createRestSession(parentSessionId: string)

- 認証チェック
- 親セッションの所有権確認
- wakeful_rest の method_id を取得
- sessions INSERT: `{ user_id, method_id, status: 'in_progress', meta: { parent_session_id } }`
- 戻り値: `ActionResult<{ id: string }>`

---

## Edge Function

### complete-session

**パス:** `supabase/functions/complete-session/index.ts`

**入力:** `{ session_id: string, reviews: CardReview[] }`

reviews の型:
```typescript
type CardReview = {
  card_id: string;
  rating: 1 | 2 | 3 | 4;
  started_at: string;
  answered_at: string;
};
```

**処理:**
1. sessions テーブルから session_id のレコードを取得 (material_id, method_id, user_id)
2. card_reviews 一括 INSERT (reviews[] から変換。response_ms = answered_at - started_at をミリ秒で計算)
3. 各カードの現在の srs_states を取得
4. ts-fsrs で FSRS-5 アルゴリズムを実行:
   - 入力: Card オブジェクト (state を reps/lapses から推定: reps=0 → New, lapses>0 && reps<3 → Relearning, それ以外 → Review)、rating
   - 出力: 新しい state, due_date, stability, difficulty, reps, lapses
5. srs_states を一括 UPDATE (state カラムも更新)
6. daily_logs を upsert:
   - subject_id は sessions → materials → subjects で取得
   - キー: user_id + log_date + subject_id + method_id
   - 値: total_duration_sec += session.duration_sec, total_cards_reviewed += reviews.length
   - 安静タイマーセッション (material_id = NULL) の場合は daily_logs をスキップ

**認証:** service_role key で RLS バイパス。呼び出し元の Server Action が認証済みであることを前提とする。

**card_reviews を Edge Function 内で INSERT する理由:** Server Action で INSERT してから Edge Function を呼ぶと、トランザクション完了前に Edge Function が読みに行く競合が発生しうる。Edge Function に reviews データを直接渡し、INSERT と FSRS 計算をアトミックに実行する。

---

## スキーマ変更

### srs_states テーブルに state カラムを追加

ts-fsrs は Card の state (New/Learning/Review/Relearning) を入力に取る。現在の srs_states テーブルにはこのカラムがない。

```sql
ALTER TABLE srs_states ADD COLUMN state TEXT NOT NULL DEFAULT 'New'
  CHECK (state IN ('New', 'Learning', 'Review', 'Relearning'));
```

マイグレーションファイルとして追加。

---

## バリデーションスキーマ

`src/lib/validations/sessions.ts` を新規作成:

- `createSessionSchema`: materialId (uuid), methodId (uuid)
- `completeSessionSchema`: sessionId (uuid), reviews (CardReview[]), selfRating (1-4)
- `createRestSessionSchema`: parentSessionId (uuid)
- `CardReview` の zod スキーマ: card_id (uuid), rating (1-4), started_at (datetime), answered_at (datetime)

---

## テスト戦略

### Small テスト

- セッション状態管理ロジック: カード進行、isFlipped トグル、reviews 配列の構築
- サマリー統計計算: 正解率、所要時間のフォーマット
- 安静タイマーのカウントダウンロジック
- response_ms 計算 (answered_at - started_at)
- FSRS state 推定ロジック (reps/lapses → New/Review/Relearning)
- バリデーションスキーマのテスト

### Medium テスト

- createSession: sessions テーブルに正しく INSERT されるか
- completeSession: sessions.status 更新 + Edge Function 呼び出し
- Edge Function: card_reviews INSERT + FSRS 計算で srs_states が正しく更新されるか
- Edge Function: daily_logs が正しく upsert されるか (既存レコードへの加算)
- getSessionCards: due カードのみ返すか、20 枚上限が効くか
- getDueMaterials: SRS 手法のある教材のみ、due_count > 0 のみ返すか

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
        review/
          page.tsx                          # CREATE: セッション自己評価
          session-review.tsx                # CREATE: 自己評価 Client Component
        summary/
          page.tsx                          # CREATE: サマリー
    rest/
      [id]/
        page.tsx                            # CREATE: 安静タイマー
        rest-timer.tsx                      # CREATE: タイマー Client Component
  lib/
    actions/
      sessions.ts                           # CREATE: セッション CRUD
    validations/
      sessions.ts                           # CREATE: セッション入力スキーマ
supabase/
  migrations/
    00004_add_srs_state_column.sql          # CREATE: srs_states.state カラム追加
  functions/
    complete-session/
      index.ts                              # CREATE: FSRS + daily_logs
```
