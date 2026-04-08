# Wake-up リマインダー設計書

## 目的

学習促進と習慣定着の両方を実現するリマインダー機能。通知で今日の成果を振り返らせ、翌日の学習を意識させることで、睡眠中の記憶固定化を促す。

学習科学的根拠: 自己効力感（今日できた事実）が次の行動の最大の予測因子。達成感を先に見せ、翌日の見通しを添えることで行動継続率が上がる。

## 制約

- Supabase / Vercel ともに Free プラン
- pg_cron 使用不可、Vercel Cron は 1 日 2 回まで
- MVP ではクライアント側スケジューリング。ブラウザ/PWA が閉じている間は通知しない
- 将来 Web Push (FCM) へ移行可能な構造にする
- 対象ユーザーは日本在住（JST 固定）。TIME 型にタイムゾーン情報を持たないため、国際化時には TIME WITH TIME ZONE への変更が必要

## アーキテクチャ

メインスレッド (React) でタイマー管理し、Notification API でローカル通知を表示する。Service Worker はスケジューラとして使わない（idle 時に停止されるため）。将来の Web Push 受信用に骨格だけ用意する。

```
ブラウザ (PWA)
├── メインスレッド (React)
│   ├── useNotificationScheduler hook
│   │   ├── ログイン時にスケジュールを DB から取得
│   │   ├── setTimeout で次の通知時刻までタイマー設定
│   │   ├── visibilitychange で復帰時にタイマー再計算
│   │   └── new Notification() で表示
│   └── 通知設定ページ (/profile/notifications)
│       ├── Notification.requestPermission()
│       └── CRUD → Server Action → notification_schedules
│
├── Service Worker (sw.js)
│   └── 将来の Web Push 受信用（今は空）
│
└── manifest.webmanifest
    └── PWA 最低限の定義

Supabase
└── notification_schedules テーブル
```

### useNotificationScheduler hook

`(main)/layout.tsx` は Server Component のため、hook を直接マウントできない。Client Component のラッパー（例: `notification-provider.tsx`）を `(main)/layout.tsx` 内に配置し、その中で hook を呼び出す。ページ遷移しても維持される。

1. マウント時: DB からスケジュール取得 → 次の通知時刻を計算 → `setTimeout` 設定
2. 時刻到達時: Server Action（`getAuthenticatedUser()` で認証済み）で通知データ（due カード数・今日の実績）を取得 → `new Notification()` で表示 → 次のタイマーを設定
3. `visibilitychange` で復帰時: 経過した通知を確認し、`NOTIFICATION_DELAY_THRESHOLD_MS`（定数、30 分）以内のものは遅延表示。タイマーを再計算
4. スケジュール変更時: 通知設定ページから state 更新でタイマー再設定

## データモデル

### notification_schedules テーブル

migration 番号は実装時に `supabase/migrations/` の最大番号 + 1 で採番する（設計時の `00015` は仮番号）。

以下の DDL を **1 つの migration** にまとめる:

```sql
-- profiles テーブルにマスタートグルを追加
ALTER TABLE profiles
  ADD COLUMN notification_enabled BOOLEAN NOT NULL DEFAULT false;
-- 既存の RLS ポリシー (Users can manage own profile) が
-- FOR ALL USING + WITH CHECK で定義済みのため、新カラムも自動的にカバーされる

-- 通知スケジュールテーブル
CREATE TABLE notification_schedules (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  label TEXT NOT NULL,
  enabled BOOLEAN NOT NULL DEFAULT true,
  time TIME NOT NULL,
  message_type TEXT NOT NULL
    CHECK (message_type IN ('due_today', 'review_and_preview')),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX idx_notification_schedules_user_id
  ON notification_schedules(user_id);

ALTER TABLE notification_schedules ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can manage own schedules"
  ON notification_schedules FOR ALL
  USING (auth.uid() = user_id)
  WITH CHECK (auth.uid() = user_id);
```

`profiles.notification_enabled` はマスタートグルの状態。個別スケジュールの enabled とは独立。マスターが OFF なら全スケジュールのタイマーを停止する（DB のスケジュールは保持）。

- `label`: 通知の表示名。デフォルトは `'朝の通知'` / `'夜の通知'`。ユーザーが自由に変更可能
- `time`: 通知時刻（TIME 型）。クライアント側で JST ローカル時刻として解釈する（制約セクション参照）
- `message_type`: 通知内容の種類
  - `due_today`: 今日の due カード数を表示（朝向け）
  - `review_and_preview`: 今日の成果 + 明日の予告を表示（夜向け）

### デフォルトスケジュール

通知を初めて ON にした時、以下の 2 件を自動作成する:

| label | time | message_type |
|-------|------|-------------|
| 朝の通知 | 08:00 | due_today |
| 夜の通知 | 22:00 | review_and_preview |

## 通知内容

### due_today（朝向け）

```
タイトル: 今日の復習: {total}枚
本文:    {subject1} {count1}枚 / {subject2} {count2}枚
```

科目が 3 つ以上ある場合は上位 2 件を表示し、残りをまとめる:

```
本文:    数学 5枚 / 英語 7枚 ほか1科目
```

due カードがない場合:

```
タイトル: 今日の復習はありません
本文:    新しい教材を追加してみませんか?
```

### review_and_preview（夜向け）

```
タイトル: 今日は {sessions}セッション完了!
本文:    明日は {subject1} {count1}枚 / {subject2} {count2}枚が待っています
```

科目が 3 つ以上ある場合は上位 2 件 + 「ほかN科目」で表示する（due_today と同じルール）。

今日のセッションがない場合:

```
タイトル: 明日の復習: {total}枚
本文:    {subject1} {count1}枚 / {subject2} {count2}枚
```

通知タップで Today ページ (`/`) に遷移する。

## 画面フロー

### /profile（既存ページに追加）

「通知設定」リンクを追加する。現在のページ構成（email 表示 + ログアウトボタン）に 1 行加えるだけ。

### /profile/notifications（新規ページ）

1. **通知マスタートグル**: 通知機能全体の ON/OFF。ON 時に `Notification.requestPermission()` を実行。OFF にすると全スケジュールのタイマーを停止する（DB のスケジュールは保持）
2. **スケジュール一覧**: 各スケジュールにラベル・時刻・個別 ON/OFF トグルを表示
3. **「+ 通知を追加」ボタン**: 新しいスケジュールを追加（上限 `MAX_NOTIFICATION_SCHEDULES = 10`、Server Action 側で件数チェック）
4. **スケジュール編集**: ラベル、時刻、通知タイプ (due_today / review_and_preview) を設定

## ファイル構成

```
src/
  app/(main)/profile/
    notifications/
      page.tsx                        -- 通知設定ページ
  components/
    notification-provider.tsx         -- Client Component ラッパー (layout.tsx に配置)
    notification-schedule-list.tsx     -- スケジュール一覧
    notification-schedule-form.tsx     -- 追加/編集フォーム
    notification-toggle.tsx           -- マスタートグル + 権限要求
  hooks/
    useNotificationScheduler.ts       -- タイマー管理
    useNotificationPermission.ts      -- 権限状態管理
  lib/
    actions/notifications.ts          -- Server Actions (CRUD + 通知データ取得、全て getAuthenticatedUser() で認証)
    utils/notification-messages.ts    -- メッセージ生成ロジック
public/
  manifest.webmanifest                -- PWA manifest (最低限)
  sw.js                               -- 空の Service Worker (将来用)
supabase/
  migrations/
    00015_notification_schedules.sql   -- テーブル作成
```

## エラーハンドリング

| 状況 | 対応 |
|------|------|
| 通知権限が拒否された | トグルを OFF に戻し、ブラウザ設定から変更する方法を案内 |
| 通知権限が default（未回答） | 設定ページで ON 時に再度 requestPermission() |
| DB 保存失敗 | toast.error で表示、ローカル状態をロールバック |
| タブ非アクティブで時刻経過 | visibilitychange で復帰時に未発火分を確認し、NOTIFICATION_DELAY_THRESHOLD_MS（30 分）以内なら遅延表示 |
| ブラウザが閉じている | 何もしない（MVP の制約） |
| ログアウト状態 | useNotificationScheduler は未認証なら何もしない |

## テスト方針

### Small テスト

- `notification-messages.ts`: due カード数 → テキスト変換。0 件・1 科目・2 科目・3 科目以上（「ほかN科目」）のケース
- `useNotificationPermission`: granted / denied / default の状態管理
- `useNotificationScheduler`: タイマー設定・再計算ロジック（Notification API はモック）
- Server Actions: バリデーション（不正な time、空の label、不正な message_type）

### Medium テスト

- Server Actions + Supabase: スケジュールの CRUD が DB に反映されること
- RLS (notification_schedules): 他ユーザーのスケジュールにアクセスできないこと
- RLS (profiles): 他ユーザーの notification_enabled を更新できないこと
- 上限チェック: 11 件目の作成がエラーになること

### Large テスト (E2E)

- 通知設定ページの表示・スケジュール追加・編集・削除（`data-testid` ベースのセレクタを使用）
- マスタートグル / 個別トグルの ON/OFF
- Notification API の動作は E2E ではテストしない（Small でカバー）

## CSP への影響

なし。Notification API はブラウザネイティブで追加の connect-src は不要。将来 FCM に移行する際に connect-src へ FCM エンドポイントを追加する。

## 将来の Web Push 移行パス

1. Supabase Pro にアップグレードし pg_cron を有効化
2. FCM プロジェクトを作成し VAPID キーを取得
3. Service Worker に push イベントハンドラを追加
4. pg_cron + Edge Function で notification_schedules を読み、FCM 経由で Push 送信
5. useNotificationScheduler のクライアント側タイマーを削除
6. notification_schedules テーブルはそのまま使用（スキーマ変更不要）
