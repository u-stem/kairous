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
1. `crypto.getRandomValues(new Uint8Array(16))` で 128bit の乱数を生成し、base64 エンコードして nonce とする
2. nonce を含む CSP ヘッダーを構築
3. `NextResponse.next()` の `request.headers` に `x-nonce` ヘッダーを追加 (Server Component から `headers()` で読み取り可能にする)
4. `updateSession` の戻り値 (レスポンス) に `Content-Security-Policy` ヘッダーを設定

具体的な実装順序:
```
const nonce = Buffer.from(crypto.getRandomValues(new Uint8Array(16))).toString("base64");
const cspHeader = buildCspHeader(nonce);

// リクエストヘッダーに nonce を追加 (Server Component 用)
request.headers.set("x-nonce", nonce);

// Supabase セッション更新 (既存)
const response = await updateSession(request);

// レスポンスヘッダーに CSP を設定 (ブラウザ用)
response.headers.set("Content-Security-Policy", cspHeader);

return response;
```

**next.config.ts:**
- `headers()` から CSP 設定のみ削除。X-Frame-Options, X-Content-Type-Options, Referrer-Policy, Permissions-Policy は静的で良いためそのまま維持

**layout.tsx:**
- `headers()` から `x-nonce` を読み取り、`<Script>` タグに nonce 属性を付与

### CSP ポリシー

```
default-src 'self';
script-src 'nonce-{value}' 'strict-dynamic';
style-src 'self' 'unsafe-inline';
connect-src 'self' {SUPABASE_URL};
img-src 'self' data: blob:;
font-src 'self';
frame-ancestors 'none';
```

- `'strict-dynamic'` は `'self'` を無効化するため、`script-src` に `'self'` は不要。nonce 付きスクリプトが読み込んだスクリプト (Next.js の `_next/static/` チャンク含む) は自動的に許可される
- `style-src`: Tailwind のインラインスタイルのため `'unsafe-inline'` を維持
- 開発環境のみ `script-src` に `'unsafe-eval'` を追加 (HMR 用)

### 制約

- 全ページが動的レンダリングになる
- Kairous は認証必須アプリのため、CDN キャッシュの恩恵は元々薄く影響は軽微

### テスト方針

- Small: CSP ヘッダー構築関数のテスト (nonce 埋め込み、開発/本番の分岐)
- ブラウザ確認: `bun dev` および `bun build && bun start` 後に Chrome DevTools の Console で CSP 違反がゼロであることを確認

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

注意: 既存の `getSessionCards` は `material_id = NULL` のセッションで空配列を返すため、interleaving セッションでは `getInterleavingCards` を使用する。`getSessionCards` の既存ガードは変更不要。

### Edge Function の変更

`complete-session/index.ts` に `interleaving` ケースを追加:

- FSRS 計算: SRS と同じロジックを実行 (`complete_session_reviews` RPC に srs_states を渡す)
- daily_logs: interleaving 専用の処理フロー
  1. `session_materials` から教材 ID 一覧を取得
  2. 各教材の `subject_id` を `materials` テーブルから JOIN で取得
  3. `card_reviews` の `card_id` → `cards.material_id` のマッピングで教材ごとのカード枚数を集計
  4. 枚数比で `duration_sec` を按分
  5. 教材ごとに `upsert_daily_log` を呼ぶ (`cards_reviewed` は実枚数、`duration_sec` は按分値)
  6. `session_count` の重複を避けるため、最初の教材のみ `session_count += 1` とし、残りは `session_count` を加算しない (1 セッション = 1 カウント)

注意: 既存の `if (session.material_id)` ブロック (単一教材の daily_logs) はスキップされるため、interleaving 用の daily_logs 処理はその外側 (interleaving 分岐内) に配置する。

### データフロー

```
createInterleavingSession
  → sessions (material_id=NULL, method_id=interleaving)
  → session_materials (session_id, material_id) x N教材

getInterleavingCards
  → session_materials → materials → cards → srs_states
  → シャッフル + SESSION_MAX_CARDS 制限
  → 各カードに material_title を付与

complete-session Edge Function (interleaving ケース)
  → card_reviews INSERT + srs_states UPSERT (SRS と同じ FSRS 計算)
  → session_materials → materials(subject_id) で教材 + 科目を取得
  → card_reviews → cards(material_id) で教材ごとのカード枚数を集計
  → 枚数比で duration_sec 按分
  → upsert_daily_log x N教材 (session_count は最初の1教材のみ +1)
```

### バリデーション

`src/lib/validations/sessions.ts` に `createInterleavingSessionSchema` を追加:
- `materialIds`: UUID 配列、min(2)、max(10)

### 定数変更

- `MATERIAL_METHOD_SLUGS` は変更しない。interleaving は複数教材を横断するセッション手法であり、単一教材に紐付ける material_methods の手法とは異なる概念。`CARD_BASED_SLUGS` には既に含まれている
- `METHOD_DESCRIPTIONS` に interleaving の説明を追加

### エッジケース

- `getInterleavingCards` が 0 件を返す場合: `session/[id]/page.tsx` で `notFound()` を呼ぶ (SRS/Elaboration と同じパターン)
- `validate.ts` の `reviews.length === 0` 拒否: interleaving でカードが 0 件の場合はそもそもセッションプレイヤーが表示されないため、Edge Function に到達しない

### テスト方針

- Small: createInterleavingSession のバリデーション、getInterleavingCards のシャッフル + 制限ロジック
- Medium: Edge Function の interleaving パス (FSRS + daily_logs 按分)

---

## PBI 3: Interleaving UI

### Today ページ

- due cards がある教材が 2 つ以上の場合に「まとめて学習」ボタンを表示
- ボタン押下で `createInterleavingSession` を呼び、全 due 教材の ID を渡す
- セッション作成後にセッションページへ遷移

### セッションプレイヤー

- `session/[id]/page.tsx` の router に `interleaving` ケースを追加
- `getInterleavingCards` でカードを取得。0 件なら `notFound()`
- 既存の `SessionPlayer` (CardSessionPlayer) を再利用
- カード表示に教材名ラベルを追加 (カード上部に小さく表示)

### サマリー画面

- `getSession` を拡張: `material_id = NULL` の場合は `session_materials` から教材一覧を取得
- `SessionDetail` 型に `interleaving_materials: Array<{ id: string; title: string }> | null` を追加
- サマリー画面で対象教材一覧を表示
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
- session_count: 1 Interleaving セッション = 1 カウント (最初の教材のレコードのみ加算)
