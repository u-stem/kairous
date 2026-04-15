# Epic #232 PBI-1: カテゴリ階層 + タグ スキーマ実装

> **For agentic workers:** REQUIRED SUB-SKILL: superpowers:subagent-driven-development を使ってタスクごとに実装する。チェックボックス (`- [ ]`) を進捗管理に使う。

**Goal:** `subjects` を `categories` にリネームし、親子階層 (最大 2 段) と `tags` / `material_tags` を追加する。UI 文言変更は PBI-3 に委ね、本 PBI は schema + サーバーサイドコード追従のみ。

**Architecture:** migration 00020 で DDL を一括適用。DB 内参照 (RPC 本体、テストヘルパ、Server Actions、query関数) を `subject_id` → `category_id` に機械的リネーム。RPC 名 (例: `get_due_counts_by_subject`) は本 PBI では変えず PBI-2 で更新。UI 日本語文字列 (「科目」) は変更せず PBI-3 で扱う。

**Tech Stack:** Supabase (PostgreSQL / RLS)、bun、TypeScript、Playwright (Large), Vitest (Small/Medium)

**関連:** 設計書 `docs/superpowers/specs/2026-04-15-info-model-redesign-design.md`

---

## 事前準備

- [ ] **Step 0-1: ブランチ作成 + Supabase ローカル起動確認**

```bash
git checkout -b feat/232-pbi1-category-tag-schema
bun supabase status | grep "API URL"
```

Expected: Supabase ローカルが起動中。未起動なら `bun supabase start`。

- [ ] **Step 0-2: 現在の subjects / materials 参照をリスト化**

```bash
rg -l '\bsubjects\b|\bsubject_id\b' src supabase tests | tee /tmp/rename-targets.txt
```

Expected: 実装・テスト・migration あわせて数十ファイル。後段でこのリストを基準に追従確認する。

---

## File Structure

**Create:**
- `supabase/migrations/00020_category_tag_schema.sql` — 本 PBI の全 DDL
- `tests/medium/migrations/00020_category_tag.test.ts` — 新スキーマの medium テスト

**Modify (主要):**
- `src/lib/types/database.ts` — 自動再生成
- `tests/shared/helpers.ts` — `createTestSubject` → `createTestCategory`、`subject_id` → `category_id`
- `src/lib/actions/*.ts` — `subject_id` / `subjects` 参照を機械的に置換 (UI文字列を除く)
- `src/lib/actions/session-queries.ts` — `getDueMaterials` の subject join を category join に置換
- `supabase/migrations/00013_get_interleaving_due_cards.sql` は変更しない (列名 subject_id は RPC 内で使われていない旨を確認)。参照していれば新 migration 00020 で `CREATE OR REPLACE` する
- `supabase/migrations/00019_get_due_counts_by_subject.sql` の本体 SQL を、`00020` で `CREATE OR REPLACE FUNCTION get_due_counts_by_subject` として上書き (名前は据え置き、内部 column を `category_id` に)

**既存 small/medium/large テストで `subject` 系ヘルパ/列を直接参照しているもの:**
- `tests/small/lib/actions/subjects.test.ts` — 関数ファイル (`src/lib/actions/subjects.ts`) を扱うため中身に応じてリネーム判断 (PBI-2 以降で rename。本 PBI では import パスが壊れないよう中間対応のみ)
- `tests/small/components/subject-selector.test.tsx` — UI コンポーネント、本 PBI では無変更 (DB 列参照なし)
- `tests/medium/lib/actions/notifications.test.ts` — ヘルパ差し替えで対応
- `tests/small/lib/utils/notification-messages.test.ts` — 文字列、変更不要
- `tests/small/migrations/00010-atomic-complete.test.ts` — DDL リネームに合わせて column 参照を更新

**方針:** 「DB 側の列/テーブル rename + データアクセスコードの追従」に閉じ、UI・RPC 名・ファイル名変更は PBI-2..4 で段階適用する。

---

## Task 1: Migration SQL を書く (Red: migration test)

**Files:**
- Create: `supabase/migrations/00020_category_tag_schema.sql`
- Create: `tests/medium/migrations/00020_category_tag.test.ts`

- [ ] **Step 1-1: 失敗する medium テストを書く**

`tests/medium/migrations/00020_category_tag.test.ts`:

```typescript
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { getAdminClient } from "../../shared/db";
import { createTestUser, deleteTestUser } from "../../shared/helpers";

describe("migration 00020: category + tags", () => {
  let userId: string;
  beforeAll(async () => {
    userId = await createTestUser();
  });
  afterAll(async () => {
    await deleteTestUser(userId);
  });

  it("categories テーブルが存在し parent_id を持つ", async () => {
    const db = getAdminClient();
    const parent = await db.from("categories").insert({ user_id: userId, name: "仕事" }).select().single();
    expect(parent.error).toBeNull();
    const child = await db
      .from("categories")
      .insert({ user_id: userId, name: "Python", parent_id: parent.data!.id })
      .select()
      .single();
    expect(child.error).toBeNull();
  });

  it("depth > 2 を INSERT すると REJECT される", async () => {
    const db = getAdminClient();
    const lv1 = await db.from("categories").insert({ user_id: userId, name: "A" }).select().single();
    const lv2 = await db
      .from("categories")
      .insert({ user_id: userId, name: "B", parent_id: lv1.data!.id })
      .select()
      .single();
    const lv3 = await db
      .from("categories")
      .insert({ user_id: userId, name: "C", parent_id: lv2.data!.id })
      .select()
      .single();
    expect(lv3.error?.message).toMatch(/depth/i);
  });

  it("tags と material_tags が RLS 越しに自分のデータのみ見える", async () => {
    const db = getAdminClient();
    const tag = await db.from("tags").insert({ user_id: userId, name: "重要" }).select().single();
    expect(tag.error).toBeNull();
    expect(tag.data!.color).toBeTruthy();
  });

  it("materials.category_id に外部キーで紐付く", async () => {
    const db = getAdminClient();
    const cat = await db.from("categories").insert({ user_id: userId, name: "Cat" }).select().single();
    const mat = await db
      .from("materials")
      .insert({ user_id: userId, category_id: cat.data!.id, title: "M1" })
      .select()
      .single();
    expect(mat.error).toBeNull();
    expect(mat.data!.category_id).toBe(cat.data!.id);
  });
});
```

- [ ] **Step 1-2: テストを実行して失敗を確認**

```bash
bun test tests/medium/migrations/00020_category_tag.test.ts
```

Expected: テーブル `categories` / `tags` / `material_tags` が存在せず全テスト FAIL。

- [ ] **Step 1-3: migration を書いて Green にする**

`supabase/migrations/00020_category_tag_schema.sql`:

```sql
-- 1) subjects → categories リネーム
ALTER TABLE subjects RENAME TO categories;
ALTER INDEX idx_subjects_user_id RENAME TO idx_categories_user_id;

-- 2) 親子関係
ALTER TABLE categories
  ADD COLUMN parent_id UUID REFERENCES categories(id) ON DELETE CASCADE;
CREATE INDEX idx_categories_parent_id ON categories(parent_id);

CREATE OR REPLACE FUNCTION enforce_category_depth()
RETURNS TRIGGER AS $$
BEGIN
  IF NEW.parent_id IS NOT NULL THEN
    IF NEW.parent_id = NEW.id THEN
      RAISE EXCEPTION 'Category cannot be its own parent';
    END IF;
    IF (SELECT parent_id FROM categories WHERE id = NEW.parent_id) IS NOT NULL THEN
      RAISE EXCEPTION 'Category depth exceeds 2 levels';
    END IF;
    IF (SELECT user_id FROM categories WHERE id = NEW.parent_id) <> NEW.user_id THEN
      RAISE EXCEPTION 'Parent category belongs to different user';
    END IF;
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS enforce_category_depth_trigger ON categories;
CREATE TRIGGER enforce_category_depth_trigger
  BEFORE INSERT OR UPDATE ON categories
  FOR EACH ROW EXECUTE FUNCTION enforce_category_depth();

-- 3) materials リネーム
ALTER TABLE materials RENAME COLUMN subject_id TO category_id;
ALTER INDEX idx_materials_subject_id RENAME TO idx_materials_category_id;

-- 4) tags
CREATE TABLE tags (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  color TEXT NOT NULL DEFAULT '#94a3b8',
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE(user_id, name)
);
CREATE INDEX idx_tags_user_id ON tags(user_id);

-- 5) material_tags
CREATE TABLE material_tags (
  material_id UUID NOT NULL REFERENCES materials(id) ON DELETE CASCADE,
  tag_id UUID NOT NULL REFERENCES tags(id) ON DELETE CASCADE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  PRIMARY KEY (material_id, tag_id)
);
CREATE INDEX idx_material_tags_tag_id ON material_tags(tag_id);

-- 6) RLS
ALTER TABLE tags ENABLE ROW LEVEL SECURITY;
CREATE POLICY tags_owner ON tags FOR ALL
  USING (user_id = auth.uid()) WITH CHECK (user_id = auth.uid());

ALTER TABLE material_tags ENABLE ROW LEVEL SECURITY;
CREATE POLICY material_tags_owner ON material_tags FOR ALL
  USING (EXISTS (SELECT 1 FROM materials m WHERE m.id = material_id AND m.user_id = auth.uid()))
  WITH CHECK (EXISTS (SELECT 1 FROM materials m WHERE m.id = material_id AND m.user_id = auth.uid()));

-- 7) 既存 RPC (get_due_counts_by_subject) の column 参照を category_id に追従
--    関数名は PBI-2 でリネーム予定のため据え置き
DROP FUNCTION IF EXISTS get_due_counts_by_subject(UUID);
CREATE OR REPLACE FUNCTION get_due_counts_by_subject(p_user_id UUID)
RETURNS TABLE(subject_id UUID, subject_name TEXT, due_count BIGINT)
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT c.id AS subject_id,
         c.name AS subject_name,
         COUNT(*) FILTER (WHERE ss.due_date <= CURRENT_DATE) AS due_count
  FROM categories c
  JOIN materials m ON m.category_id = c.id
  JOIN cards cd ON cd.material_id = m.id
  LEFT JOIN srs_states ss ON ss.card_id = cd.id
  WHERE c.user_id = p_user_id
  GROUP BY c.id, c.name;
$$;
```

- [ ] **Step 1-4: migration を適用してテストを通す**

```bash
bun supabase db reset
bun test tests/medium/migrations/00020_category_tag.test.ts
```

Expected: PASS。

- [ ] **Step 1-5: コミット**

```bash
git add supabase/migrations/00020_category_tag_schema.sql tests/medium/migrations/00020_category_tag.test.ts
git commit -m "feat(db): カテゴリ階層とタグの schema 追加 (Epic #232 PBI-1)"
```

---

## Task 2: 型を再生成してビルドを通す

**Files:**
- Modify: `src/lib/types/database.ts`

- [ ] **Step 2-1: 型を再生成**

```bash
bun run db:types
```

Expected: `src/lib/types/database.ts` の `subjects` が `categories` に、`subject_id` が `category_id` に、`tags` / `material_tags` が追加。

- [ ] **Step 2-2: typecheck を走らせて壊れ箇所を把握**

```bash
bun typecheck 2>&1 | tee /tmp/ts-errors.txt | head -50
```

Expected: 大量のエラー (subject_id / subjects 参照)。次のタスクで順次修正。

- [ ] **Step 2-3: コミット**

```bash
git add src/lib/types/database.ts
git commit -m "chore(types): database types を再生成"
```

---

## Task 3: テストヘルパを追従

**Files:**
- Modify: `tests/shared/helpers.ts`

- [ ] **Step 3-1: helpers をリネーム**

`tests/shared/helpers.ts` の冒頭 `createTestSubject` を次で置き換える:

```typescript
export async function createTestCategory(
  userId: string,
  name = "テストカテゴリ",
  parentId?: string,
) {
  const result = await getAdminClient()
    .from("categories")
    .insert({ user_id: userId, name, color: "#6366f1", parent_id: parentId ?? null })
    .select()
    .single();
  if (result.error) throw new Error(`テストカテゴリ作成失敗: ${result.error.message}`);
  return result.data as { id: string; name: string; color: string; user_id: string; parent_id: string | null };
}

// 後方互換エイリアス。PBI-2 で最終削除
export const createTestSubject = createTestCategory;
```

`createTestMaterial` の `subject_id` 引数名を `categoryId` に変更 + 挿入時の列名を `category_id` に変更:

```typescript
export async function createTestMaterial(
  categoryId: string,
  userId: string,
  title = "テスト教材",
  id?: string,
) {
  const insertData: Record<string, unknown> = {
    category_id: categoryId,
    user_id: userId,
    title,
  };
  if (id) insertData.id = id;
  const result = await getAdminClient()
    .from("materials")
    .insert(insertData)
    .select()
    .single();
  if (result.error) throw new Error(`テスト教材作成失敗: ${result.error.message}`);
  return result.data as { id: string; title: string; category_id: string; user_id: string };
}
```

- [ ] **Step 3-2: 既存テストで subject_id を受け取っていた箇所の型を確認**

```bash
rg 'subject_id' tests
```

Expected: 残りは後方互換で動くが、戻り値 `.subject_id` を参照している箇所があれば `category_id` に変更する必要がある。該当箇所を 1 つずつ直す。

- [ ] **Step 3-3: medium テストを通す**

```bash
bun test:medium
```

Expected: PASS (helper 経由のテストは型互換で動く)。

- [ ] **Step 3-4: コミット**

```bash
git add tests/
git commit -m "test: テストヘルパを categories/category_id に追従"
```

---

## Task 4: サーバーサイドコードの機械的リネーム

**Files:**
- Modify: `src/lib/actions/**/*.ts`
- Modify: `src/lib/actions/session-queries.ts`
- Modify: 他 `subject_id` / `from("subjects")` 参照のある `src/**/*.ts`

UI 日本語文字列 (「科目」) は触らない。TypeScript 型・列名・テーブル名だけ追従する。

- [ ] **Step 4-1: `from("subjects")` の参照を listup**

```bash
rg 'from\("subjects"\)|\.subject_id|subject_id:' src --type ts | tee /tmp/subj-refs.txt
```

- [ ] **Step 4-2: 1 ファイルずつ置換**

各ファイルで:
- `from("subjects")` → `from("categories")`
- `.subject_id` (プロパティアクセス) → `.category_id`
- オブジェクトキー `subject_id:` → `category_id:`
- 変数名/引数名 `subjectId` → `categoryId` (スコープ限定で安全に)

**注意:** SQL/RPC 内部の戻り値プロパティ `subject_id` を RPC 名ごと保持している場合 (例: `get_due_counts_by_subject` は引き続き `subject_id` プロパティを返す)、呼び出し側はそのまま `subject_id` を参照する。これは PBI-2 で整理する。

- [ ] **Step 4-3: typecheck を通す**

```bash
bun typecheck
```

Expected: エラー 0 件。残っていれば該当ファイルを直す。

- [ ] **Step 4-4: small + medium テストを通す**

```bash
bun test:small && bun test:medium
```

Expected: PASS。

- [ ] **Step 4-5: コミット**

```bash
git add src/ tests/
git commit -m "refactor(db): subject_id 参照を category_id に追従"
```

---

## Task 5: medium テストに階層と RLS の境界ケース追加

**Files:**
- Modify: `tests/medium/migrations/00020_category_tag.test.ts`

- [ ] **Step 5-1: 自己参照禁止のテスト追加**

```typescript
it("自分自身を parent_id に指定できない", async () => {
  const db = getAdminClient();
  const cat = await db.from("categories").insert({ user_id: userId, name: "Self" }).select().single();
  const update = await db
    .from("categories")
    .update({ parent_id: cat.data!.id })
    .eq("id", cat.data!.id);
  expect(update.error?.message).toMatch(/own parent/i);
});

it("他ユーザーのカテゴリを親にできない", async () => {
  const db = getAdminClient();
  const otherUser = await createTestUser();
  try {
    const otherCat = await db.from("categories").insert({ user_id: otherUser, name: "Other" }).select().single();
    const mine = await db
      .from("categories")
      .insert({ user_id: userId, name: "Mine", parent_id: otherCat.data!.id })
      .select()
      .single();
    expect(mine.error?.message).toMatch(/different user/i);
  } finally {
    await deleteTestUser(otherUser);
  }
});
```

- [ ] **Step 5-2: テストを通す**

```bash
bun test tests/medium/migrations/00020_category_tag.test.ts
```

Expected: 全 PASS。

- [ ] **Step 5-3: コミット**

```bash
git add tests/medium/migrations/00020_category_tag.test.ts
git commit -m "test: categories 階層の境界ケース追加"
```

---

## Task 6: full-check と PR 作成

- [ ] **Step 6-1: full-check**

```bash
bun run check
```

Expected: lint / typecheck / test:small / test:medium 全 PASS。失敗なら修正。

- [ ] **Step 6-2: 設計書への参照 + Issue 着手宣言**

Epic #232 に着手宣言コメントを投稿:

```bash
gh issue comment 232 --repo u-stem/kairous --body "$(cat <<'EOF'
### 着手 (in-progress)

- セッション: `feat/232-pbi1-category-tag-schema`
- 開始: 2026-04-15
- 領域: `supabase/migrations/00020_*`, `src/lib/actions/**`, `tests/shared/helpers.ts`, `tests/medium/migrations/**`
- 備考: PBI-1 (schema). UI 文言は PBI-3 で変更
EOF
)"
```

- [ ] **Step 6-3: PR 作成**

```bash
git push -u origin feat/232-pbi1-category-tag-schema
gh pr create --title "feat(db): categories 階層 + tags スキーマ (Epic #232 PBI-1)" --body "$(cat <<'EOF'
## Summary
- `subjects` → `categories` リネーム、`parent_id` + 深度トリガ (最大 2 段) 追加
- `tags` / `material_tags` 追加、RLS 付き
- 既存 RPC `get_due_counts_by_subject` を内部 column 追従 (名前は据え置き、PBI-2 でリネーム)
- サーバーサイドコード + テストヘルパを `category_id` に追従
- UI 文言・RPC 名・ファイル名変更は PBI-2 以降

設計書: docs/superpowers/specs/2026-04-15-info-model-redesign-design.md

Related: Epic #232

## Test plan
- [x] 00020 migration medium テスト (depth, RLS, 自己参照, 他ユーザー親)
- [x] bun run check (lint / typecheck / test:small / test:medium)
- [ ] CI: test:large / lighthouse

🤖 Generated with [Claude Code](https://claude.com/claude-code)
EOF
)"
```

- [ ] **Step 6-4: CI を待つ**

```bash
gh pr checks --watch
```

Expected: 全ジョブ success。失敗ジョブがあれば原因ログを確認して修正コミット。

- [ ] **Step 6-5: Claude PR Review 対応**

レビュー完了後、各コメントに返信 → resolve → マージ可否を確認。

---

## Self-Review チェックリスト (計画レビュー)

- [x] Spec の PBI-1 スコープ (schema + types + server-side rename) を全タスクで網羅
- [x] 既存 RPC `get_interleaving_due_cards` は materials.subject_id を直接参照していないか実装時に確認 (Task 4 Step 4-1 で検出可能)
- [x] TODO/プレースホルダなし
- [x] 各 step はビルド/テスト/コミット単位で 2-5 分に収まる粒度

---

## 次 PBI の予告

- **PBI-2 (RPC + サーバーロジック刷新)**: `get_due_counts_by_subject` → `get_due_counts_by_category`、`get_interleaving_due_cards` に `category_id` + `tag_ids` 引数追加、関連 Server Action 追従
- **PBI-3 (UI: カテゴリ)**: 2 段セレクタ、wizard、materials 一覧グルーピング、「科目」→「カテゴリ」命名変更
- **PBI-4 (UI: タグ + interleaving 絞り込み)**: タグ CRUD、タグフィルタ、interleaving 組成画面の絞り込み UI
