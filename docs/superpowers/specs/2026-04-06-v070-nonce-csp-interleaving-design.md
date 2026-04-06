# v0.7.0 nonce CSP + Interleaving 設計

## 目標

1. CSP を `'unsafe-inline'` から nonce ベースに移行し、XSS 耐性を強化する
2. Interleaving セッションを実装し、複数教材のカードを交互に学習できるようにする

## 背景

- CSP: 現在 `next.config.ts` で `script-src 'self' 'unsafe-inline'` を使用。インラインスクリプトを無制限に許可しており、XSS 攻撃のリスクがある
- Interleaving: DB スキーマ (`session_materials` テーブル) は実装済みだが、セッション作成/実行/完了のロジックが未実装。ADR #90 で daily_logs の按分方針を保留していた

## スコープ

### In Scope

1. nonce ベース CSP (middleware + layout.tsx)
2. Interleaving セッション基盤 (Server Action + Edge Function)
3. Today ページの「まとめて学習」ボタン + セッションプレイヤー対応

### Out of Scope

- style-src の nonce 化 (Tailwind のインラインスタイルのため `'unsafe-inline'` を維持)
- Interleaving の教材選択 UI (自動で全 due 教材を対象にする)
- Stats ページの Interleaving 専用表示

## PBI 構成

| PBI | 内容 | 依存 |
|-----|------|------|
| 1 | nonce ベース CSP | なし |
| 2 | Interleaving セッション基盤 | なし |
| 3 | Interleaving UI | PBI 2 |

---

## PBI 1: nonce ベース CSP

### 変更箇所

**middleware.ts:**
- リクエストごとに `crypto.randomUUID()` で nonce を生成
- CSP ヘッダーに `'nonce-{value}'` を設定
- `x-nonce` リクエストヘッダーに nonce を格納し Server Component から参照可能にする

**next.config.ts:**
- `headers()` の CSP 設定を削除 (middleware に移行)

**layout.tsx:**
- `headers()` から nonce を読み取り、`<Script>` タグに nonce 属性を付与

### CSP ポリシー

```
default-src 'self';
script-src 'self' 'nonce-{value}' 'strict-dynamic';
style-src 'self' 'unsafe-inline';
connect-src 'self' {SUPABASE_URL};
img-src 'self' data: blob:;
font-src 'self';
frame-ancestors 'none';
```

- `'strict-dynamic'`: nonce 付きスクリプトが読み込んだスクリプトも自動許可
- `style-src`: Tailwind のインラインスタイルのため `'unsafe-inline'` を維持
- 開発環境のみ `script-src` に `'unsafe-eval'` を追加 (HMR 用)

### 制約

- 全ページが動的レンダリングになる
- Kairous は認証必須アプリのため、CDN キャッシュの恩恵は元々薄く影響は軽微

### テスト方針

- Small: CSP ヘッダー文字列のパースと nonce 有無の検証
- Medium: なし (ヘッダー確認は E2E 的だが、middleware の単体テストで十分)

---

## PBI 2: Interleaving セッション基盤

### Server Action

**createInterleavingSession:**
1. 認証 + バリデーション
2. `learning_methods` から `interleaving` の method_id を取得
3. `sessions` に `material_id = NULL` で INSERT
4. `session_materials` に対象教材を INSERT
5. セッション ID を返す

**getInterleavingCards:**
1. `session_materials` からセッションに紐づく教材一覧を取得
2. 各教材の due cards を取得 (SRS の due_date フィルタを適用)
3. 全カードをシャッフルして `SESSION_MAX_CARDS` で制限
4. 各カードに `material_title` を付与して返す (UI で教材名を表示するため)

### Edge Function の変更

`complete-session/index.ts` に `interleaving` ケースを追加:
- FSRS 計算: SRS と同じロジックを実行
- daily_logs: `session_materials` + `card_reviews` から教材ごとのカード枚数を集計し、枚数比で duration_sec を按分して教材ごとに `upsert_daily_log` を呼ぶ

### データフロー

```
createInterleavingSession
  → sessions (material_id=NULL, method_id=interleaving)
  → session_materials (session_id, material_id) x N教材

getInterleavingCards
  → session_materials → materials → cards → srs_states
  → シャッフル + SESSION_MAX_CARDS 制限

complete-session Edge Function
  → card_reviews INSERT + srs_states UPSERT (SRS と同じ)
  → session_materials + cards → material_id マッピング
  → 教材ごとのカード枚数を集計
  → 枚数比で duration_sec 按分
  → upsert_daily_log x N教材
```

### バリデーション

`src/lib/validations/sessions.ts` に `createInterleavingSessionSchema` を追加:
- `materialIds`: UUID 配列、min(2)、max(10)

### 定数変更

- `MATERIAL_METHOD_SLUGS` に `"interleaving"` を追加
- `METHOD_DESCRIPTIONS` に interleaving の説明を追加

### テスト方針

- Small: createInterleavingSession のバリデーション、getInterleavingCards のシャッフル + 制限ロジック
- Medium: Edge Function の interleaving パス (FSRS + daily_logs 按分)

---

## PBI 3: Interleaving UI

### Today ページ

- due cards がある教材が 2 つ以上の場合に「まとめて学習」ボタンを表示
- ボタン押下で `createInterleavingSession` を呼び、全 due 教材を渡す
- セッション作成後にセッションページへ遷移

### セッションプレイヤー

- `session/[id]/page.tsx` の router に `interleaving` ケースを追加
- `getInterleavingCards` でカードを取得し、既存の `SessionPlayer` (CardSessionPlayer) を再利用
- カード表示に教材名ラベルを追加 (カード上部に小さく表示)

### サマリー画面

- `getSession` で `session_materials` も取得し、対象教材一覧を表示
- カードレビュー統計は SRS と同じ表示

### 新規ファイル

- `src/components/interleaving-button.tsx`: 「まとめて学習」ボタン (Client Component)

### テスト方針

- Small: なし (UI のみ)

---

## ADR #90 の更新

ADR #90 (daily_logs 按分方針) のステータスを更新:
- 決定: 教材ごとのカード枚数比で duration_sec を按分し、教材ごとに daily_logs に記録する
- cards_reviewed は各教材の実レビュー枚数をそのまま記録
