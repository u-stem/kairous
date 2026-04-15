# 情報モデル柔軟化 設計書 (Epic #232)

**作成日**: 2026-04-15
**対象マイルストーン**: v0.17.0
**関連 Epic**: [#232](https://github.com/u-stem/kairous/issues/232)

## 背景

現在のデータモデルは `subjects (科目) > materials (教材) > cards` のフラット構造で、命名・構造ともに教育課程寄り。趣味・仕事・資格など多様な分野を扱う場合に以下が不足する。

- 分野のネストができない (例: 「仕事 > Python」)
- タグ横断の検索・interleaving 組成ができない
- 「科目」の命名が academic で汎用用途のユーザーに心理的バリアになり得る

## 学習科学的根拠

- **Interleaving** (Rohrer & Taylor 2007): 異分野を混ぜるほど転移効果が高い → 強い階層は逆効果
- **Concept maps** (Novak): 階層 + クロスリンク構造が retention に寄与
- **実装先行事例**: Anki (deck 階層 + 自由タグ) / Notion (DB + multi-select)
- 結論: **浅い階層 (2 段) + 自由タグ** のハイブリッドが研究・実装の両面で支持される

## 設計判断サマリ

| 項目 | 決定 | 理由 |
|------|------|------|
| 階層モデル | 2 段階固定 (親カテゴリ > 子カテゴリ) | YAGNI。3 段目は運用後に必要性を再評価。tag 横断で不足を補える |
| タグモデル | `tags` + `material_tags` の正規化 2 テーブル | タグ別集計・リネーム・色変更・統計が素直。`text[]` では横断検索と UI が辛い |
| 命名 | subjects → categories、UI は「カテゴリ」 | academic 色の除去 |
| 既存データ移行 | subjects → categories にリネーム、全行を parent_id=NULL の親カテゴリとして維持 | ダミー「未分類」を作らずユーザー自身で親子再構成可能。破壊的変更だが移行は機械的 |
| interleaving 組成 | カテゴリ + タグの AND 絞り込みを追加 | 既存の教材跨ぎシャッフルは維持 |
| display_order | categories で実運用。materials は当面 created_at DESC 維持 | materials の順序は要望が出るまで変えない |

## データモデル

### 新規/変更スキーマ

```sql
-- 1) subjects → categories リネーム + 親子関係
ALTER TABLE subjects RENAME TO categories;
ALTER INDEX idx_subjects_user_id RENAME TO idx_categories_user_id;

ALTER TABLE categories
  ADD COLUMN parent_id UUID REFERENCES categories(id) ON DELETE CASCADE;

CREATE INDEX idx_categories_parent_id ON categories(parent_id);

-- 深度 2 段制限: 親は parent_id IS NULL でなければならない
CREATE OR REPLACE FUNCTION enforce_category_depth()
RETURNS TRIGGER AS $$
BEGIN
  IF NEW.parent_id IS NOT NULL THEN
    IF (SELECT parent_id FROM categories WHERE id = NEW.parent_id) IS NOT NULL THEN
      RAISE EXCEPTION 'Category depth exceeds 2 levels';
    END IF;
    -- 自己参照禁止
    IF NEW.parent_id = NEW.id THEN
      RAISE EXCEPTION 'Category cannot be its own parent';
    END IF;
    -- 親子の user_id 一致
    IF (SELECT user_id FROM categories WHERE id = NEW.parent_id) <> NEW.user_id THEN
      RAISE EXCEPTION 'Parent category belongs to different user';
    END IF;
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER enforce_category_depth_trigger
  BEFORE INSERT OR UPDATE ON categories
  FOR EACH ROW EXECUTE FUNCTION enforce_category_depth();

-- 2) materials.subject_id → category_id リネーム
ALTER TABLE materials RENAME COLUMN subject_id TO category_id;
ALTER INDEX idx_materials_subject_id RENAME TO idx_materials_category_id;

-- 3) tags テーブル
CREATE TABLE tags (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  color TEXT NOT NULL DEFAULT '#94a3b8',
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE(user_id, name)
);
CREATE INDEX idx_tags_user_id ON tags(user_id);

-- 4) material_tags 中間テーブル
CREATE TABLE material_tags (
  material_id UUID NOT NULL REFERENCES materials(id) ON DELETE CASCADE,
  tag_id UUID NOT NULL REFERENCES tags(id) ON DELETE CASCADE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  PRIMARY KEY (material_id, tag_id)
);
CREATE INDEX idx_material_tags_tag_id ON material_tags(tag_id);

-- 5) RLS
ALTER TABLE tags ENABLE ROW LEVEL SECURITY;
CREATE POLICY tags_owner ON tags FOR ALL
  USING (user_id = auth.uid()) WITH CHECK (user_id = auth.uid());

ALTER TABLE material_tags ENABLE ROW LEVEL SECURITY;
CREATE POLICY material_tags_owner ON material_tags FOR ALL
  USING (EXISTS (SELECT 1 FROM materials m WHERE m.id = material_id AND m.user_id = auth.uid()))
  WITH CHECK (EXISTS (SELECT 1 FROM materials m WHERE m.id = material_id AND m.user_id = auth.uid()));
```

### 移行戦略

1. 既存 `subjects` 行はすべて `categories` の親 (parent_id=NULL) として残る → 機能維持
2. 既存 `materials.subject_id` は `category_id` にリネームのみ。データ変換なし
3. ユーザーは後から親カテゴリを追加し、既存カテゴリを子として付け替える運用
4. ロールバック: リネーム逆転 + tags/material_tags DROP で復旧可

### RPC 変更

| RPC | 変更 |
|-----|------|
| `get_interleaving_due_cards` | `category_id UUID DEFAULT NULL`, `tag_ids UUID[] DEFAULT NULL` 引数追加。category_id 指定時は親カテゴリなら子も含む。tag_ids は AND (材料が全タグを持つ)。`DROP FUNCTION IF EXISTS` で旧シグネチャ除去後 `CREATE OR REPLACE` (overload 回避) |
| `get_due_counts_by_subject` | → `get_due_counts_by_category` にリネーム。子カテゴリの due は親に集約 (親選択時は子も合算) |
| その他 | subject_id 参照箇所を category_id に差し替え |

## UI 設計

### カテゴリセレクタ (2 段)

- 親カテゴリ一覧 → 選択で子カテゴリ一覧表示。「親のみを材料に紐付ける」も可
- 新規作成フローは 既存 `subject-selector.tsx` を拡張。親 → 子の順で入力

### 教材ウィザード (`materials/new`)

- Step1: カテゴリ選択 (親 + 任意の子)
- Step1.5: タグ入力 (チップ UI、既存タグサジェスト + 新規作成、最大件数制限なし)
- Step2 以降は既存のまま

### 教材一覧 (`materials/page.tsx`)

- 親カテゴリを heading、その下に子カテゴリを subheading でネスト。子カテゴリ未設定の教材は親 heading 直下
- ページ上部に「タグフィルタ」チップ群 (複数選択 = AND: 全タグを持つ教材のみ表示)

### Interleaving 組成

- セッション開始画面に「カテゴリ」「タグ」絞り込みセレクタを追加 (両方未指定で従来どおり全教材跨ぎ)
- 絞り込み条件は `get_interleaving_due_cards` の引数として RPC に渡す

### 命名リネーム

| 旧 | 新 |
|----|----|
| 科目 | カテゴリ |
| 科目を選択 | カテゴリを選択 |
| 新しい科目を作成 | 新しいカテゴリを作成 |
| 科目名 | カテゴリ名 |

## PBI 分解

| # | 内容 | 依存 | 規模目安 |
|---|------|------|----------|
| PBI-1 | schema migration (categories リネーム + parent_id + 深度トリガ + tags/material_tags + RLS + types 再生成) | なし | 中 |
| PBI-2 | RPC 変更 + サーバーサイドコード追従 (category_id / interleaving 絞り込み引数) | PBI-1 | 中 |
| PBI-3 | UI: カテゴリ 2 段セレクタ + wizard + 一覧グルーピング + 命名リネーム | PBI-2 | 中 |
| PBI-4 | UI: タグ CRUD + タグ入力 + materials タグフィルタ + interleaving 絞り込み UI | PBI-2 | 中 |

各 PBI 300 行以内目安。PBI-3 と PBI-4 は PBI-2 完了後に並列可。

## テスト方針

- **Medium** (Supabase ローカル)
  - categories 親子 CRUD (深度 2 を超える INSERT が REJECT される)
  - 他ユーザーの親カテゴリを指定した場合に REJECT される
  - tags / material_tags CRUD + RLS (他ユーザー不可視)
  - `get_interleaving_due_cards` の絞り込み組み合わせ (category のみ / tag のみ / 両方 / 両方 NULL)
  - `get_due_counts_by_category` の親子ロールアップ
- **Large** (Playwright)
  - 親子カテゴリ作成 → 教材作成時に子カテゴリ選択 + タグ 2 件付与
  - materials 一覧でカテゴリグルーピングとタグフィルタ動作
  - interleaving セッション組成時にタグ絞り込みで対象カードが減ることを確認

## スコープ外 (将来 PBI)

- 3 段目以上の階層 (まず 2 段で運用)
- タグの使用頻度順サジェスト
- カテゴリ色の親子継承、カテゴリアイコン
- 統計ページ (`stats/page.tsx`) のタグ別集計
- 教材の並び替え (display_order 追加)

## リスク

| リスク | 対策 |
|--------|------|
| 破壊的スキーマ変更で既存ユーザーデータ破損 | migration 前に `pg_dump` をバックアップ。ロールバック migration を同一 PBI に用意 |
| 命名変更で UI 文字列を取りこぼす | 日本語 grep (`科目`) で残検出、medium テスト + Large E2E で実画面確認 |
| RPC overload による PostgREST 曖昧解決エラー | 新シグネチャ前に `DROP FUNCTION IF EXISTS` を必ず実行 (CLAUDE.md workflow 準拠) |
| 深度トリガ漏れで 3 段以上が混入 | migration 内に negative test SQL を含め、CI で失敗 → 修正ループ |

## 参考

- Epic Issue: [#232](https://github.com/u-stem/kairous/issues/232)
- CLAUDE.md の Core Invariants (material_methods 1:N、RLS 全テーブル)
- migration 00013 (`get_interleaving_due_cards` 既存実装)
