# Elaboration 永続化 設計書

## 背景

現状、Elaboration セッションの記述テキストは `sessions.meta.elaborations` JSONB に永続化されている。ただし、

- Review 画面は `sessionStorage` から読み出しており、タブ閉鎖後は閲覧不可
- 過去セッションの elaboration を横断的に閲覧する UI がない
- JSONB 構造は検索・集計に不利 (card_id でインデックス不可)

Epic #143 の受け入れ条件:
- [ ] DB に永続化される (※ 現状の sessions.meta は分析・履歴には不適)
- [ ] Review 画面で永続化されたテキストが表示される
- [ ] 過去セッション履歴から elaboration を閲覧できる
- [ ] sessionStorage は廃止 (DB が single source of truth)

## 設計判断

### スキーマ: 専用テーブル `card_elaborations`

**採用理由**:
- JSONB での card_id 検索は複雑 (`jsonb_array_elements` + 結合)。履歴 UI の要件を満たせない
- `srs_states` など既存の「カード×状態」パターンと一貫
- インデックスで高速検索可能

```sql
CREATE TABLE card_elaborations (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  session_id UUID NOT NULL REFERENCES sessions(id) ON DELETE CASCADE,
  card_id UUID NOT NULL REFERENCES cards(id) ON DELETE CASCADE,
  elaboration_text TEXT NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX idx_card_elaborations_user_card ON card_elaborations (user_id, card_id, created_at DESC);
CREATE INDEX idx_card_elaborations_session ON card_elaborations (session_id);

-- RLS: 本人のみ閲覧可
ALTER TABLE card_elaborations ENABLE ROW LEVEL SECURITY;
CREATE POLICY card_elaborations_select ON card_elaborations FOR SELECT USING (auth.uid() = user_id);
CREATE POLICY card_elaborations_insert ON card_elaborations FOR INSERT WITH CHECK (auth.uid() = user_id);
-- Edge Function は service_role でバイパス
```

### バックフィル

既存の `sessions.meta.elaborations` を `card_elaborations` に移行:

```sql
INSERT INTO card_elaborations (user_id, session_id, card_id, elaboration_text, created_at)
SELECT
  s.user_id,
  s.id,
  (e->>'card_id')::uuid,
  e->>'text',
  s.completed_at
FROM sessions s, jsonb_array_elements(s.meta->'elaborations') e
WHERE s.meta ? 'elaborations'
  AND jsonb_array_length(s.meta->'elaborations') > 0;
```

### sessions.meta の扱い

`meta.elaborations` フィールドへの新規書き込みは廃止する。過去データはバックフィル済みなので、meta からも読まない。`meta` 自体は Pomodoro 等で使うので残す。

## コンポーネント

### 1. Migration `00017_card_elaborations.sql`
- テーブル作成、インデックス、RLS、バックフィル

### 2. Edge Function `complete-session/index.ts`
- `elaborations` を引数で受け取り、`card_elaborations` に INSERT
- `sessions.meta` への書き込みは廃止

### 3. Server Action `completeElaborationSession`
- sessionStorage の読み書きを廃止
- `card_elaborations` への書き込みは Edge Function 経由で行う (既存パターン)
- Review 画面用のクエリ関数 `getSessionElaborations(sessionId)` を追加

### 4. Review 画面 `session-review.tsx`
- sessionStorage 廃止
- `getSessionElaborations(sessionId)` で DB から取得して表示

### 5. 履歴 UI (教材詳細画面下部)
- 新コンポーネント `CardElaborationHistory`
- 教材の全カードの elaboration を時系列降順で表示
- 新クエリ関数 `getMaterialElaborations(materialId)`

## PBI 分解

| PBI | 内容 | 対象 | 依存 |
|-----|------|------|------|
| A | Migration + バックフィル | `supabase/migrations/00017_*.sql` | - |
| B | Edge Function + Server Action (write path) | `complete-session/index.ts`, `session-commands.ts` | A |
| C | Review 画面 DB 読み出し (read path) | `session-review.tsx`, 新クエリ関数 | A |
| D | 履歴 UI (教材詳細画面) | `CardElaborationHistory`, 新クエリ関数 | A |

### 並列開発戦略

- Phase 1: A (Migration) — 単独実行
- Phase 2: B + C + D 並列 — 全て A のテーブルに依存。互いに独立したファイル
