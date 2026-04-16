# 学習対象の多様化 設計書 (Epic #233)

**作成日**: 2026-04-16
**対象マイルストーン**: v0.18.0
**関連 Epic**: [#233](https://github.com/u-stem/kairous/issues/233)
**前提 Epic**: #232 完了 (カテゴリネスト + タグ横断)

## 背景

現状 `materials` は flashcard (Q&A カード) 前提で設計されており、以下のユースケースに適合しない:

- 書籍・論文の**読書** (ページ進捗)
- **プロジェクト学習** (成果物 + マイルストーン)
- **練習ログ** (楽器/コード/運動の反復記録)
- **長文ノート** (Zettelkasten 的な知識蓄積)

`total_cards` を唯一の進捗指標とする設計も flashcard 特化。教材タイプに応じた progress メトリクスが必要。

## 学習科学的根拠

- **Deliberate practice** (Ericsson): 反復記録とフィードバックループ。practice_log タイプが対応
- **Generation effect** (Slamecka & Graf): 自分で作る learning > 受動的 review。project/note タイプが対応
- **Retrieval practice の多様化**: Q&A だけでなく free recall、exposition、teaching も想起に含まれる。タイプごとに異なる想起手段を提供

## 設計判断サマリ

| 項目 | 決定 | 理由 |
|------|------|------|
| スキーマ | 判別カラム `materials.type` + JSONB `meta` | SQL フィルタ可、型別拡張柔軟、テーブル増加なし |
| 初期サポートタイプ | flashcard / reading / project / practice_log / note | Epic 本文受け入れ条件に一致 |
| progress 指標 | `total_units` / `completed_units` / `unit_label` | タイプ横断で統計が書ける |
| 手法互換性 | `method_material_types` 中間テーブル | DB レベルで型安全、UI ハードコード回避 |
| 既存データ移行 | 全教材 `type='flashcard'`、列移行 | 機械的、破壊なし |
| cards テーブル | flashcard 限定のまま | SRS/elaboration は flashcard 限定 |

## データモデル

### Schema 変更

```sql
-- 1) materials に type, meta, progress 列追加
ALTER TABLE materials
  ADD COLUMN type TEXT NOT NULL DEFAULT 'flashcard'
    CHECK (type IN ('flashcard', 'reading', 'project', 'practice_log', 'note')),
  ADD COLUMN meta JSONB NOT NULL DEFAULT '{}',
  ADD COLUMN total_units INT NOT NULL DEFAULT 0,
  ADD COLUMN completed_units INT NOT NULL DEFAULT 0,
  ADD COLUMN unit_label TEXT NOT NULL DEFAULT '枚';

CREATE INDEX idx_materials_type ON materials(type);

-- 2) 既存 flashcard の total_units を total_cards から移行
UPDATE materials SET total_units = total_cards WHERE type = 'flashcard';

-- 3) total_cards は trigger で total_units と同期 (暫定併存、PBI-7 完了後に削除)
CREATE FUNCTION sync_total_cards()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY INVOKER
SET search_path = public
AS $$
BEGIN
  IF NEW.type = 'flashcard' THEN
    NEW.total_cards := NEW.total_units;
  END IF;
  RETURN NEW;
END;
$$;

CREATE TRIGGER sync_total_cards_trigger
  BEFORE INSERT OR UPDATE ON materials
  FOR EACH ROW EXECUTE FUNCTION sync_total_cards();

-- 4) method_material_types: どの手法がどのタイプに使えるか
CREATE TABLE method_material_types (
  method_id UUID NOT NULL REFERENCES learning_methods(id) ON DELETE CASCADE,
  material_type TEXT NOT NULL
    CHECK (material_type IN ('flashcard', 'reading', 'project', 'practice_log', 'note')),
  PRIMARY KEY (method_id, material_type)
);

-- 5) 初期 seeds (slug ベースで紐付け)
INSERT INTO method_material_types (method_id, material_type)
SELECT lm.id, mt.type
FROM learning_methods lm
CROSS JOIN (VALUES
  ('srs', 'flashcard'), ('interleaving', 'flashcard'), ('elaboration', 'flashcard'),
  ('pomodoro', 'flashcard'), ('pomodoro', 'reading'), ('pomodoro', 'project'),
  ('pomodoro', 'practice_log'), ('pomodoro', 'note'),
  ('free_study', 'flashcard'), ('free_study', 'reading'), ('free_study', 'project'),
  ('free_study', 'practice_log'), ('free_study', 'note'),
  ('wakeful_rest', 'flashcard'), ('wakeful_rest', 'reading'), ('wakeful_rest', 'project'),
  ('wakeful_rest', 'practice_log'), ('wakeful_rest', 'note')
) AS mt(slug, type)
WHERE lm.slug = mt.slug;
```

### タイプ別 meta スキーマ

| type | meta フィールド | unit_label | 進捗更新方法 |
|------|----------------|------------|--------------|
| flashcard | `{}` (cards テーブル管理) | 枚 | cards 追加/削除で auto |
| reading | `{ total_pages?, isbn?, author? }` | ページ | ユーザー手動 (読了ページ記録) |
| project | `{ milestones: [{name, done, date?}], deadline? }` | マイルストーン | milestone 完了チェック |
| practice_log | `{ entry_schema: 'reps'\|'duration'\|'freeform', entries: [{date, value, note}] }` | エントリ | セッション完了時に自動追加 |
| note | `{ section_count?, word_count? }` | セクション | ユーザー手動 (セクション追加) |

`meta` は書き込み時に Server Action 側で zod スキーマ検証する。

## UI 設計

### 教材作成ウィザード

- **Step0 (新規)**: タイプ選択画面。5 択カード (アイコン + ラベル + 1 行説明)
  - flashcard: 「Q&A カード」「暗記・知識定着に」
  - reading: 「読書」「書籍・論文の進捗管理」
  - project: 「プロジェクト」「成果物ベースの学習」
  - practice_log: 「練習ログ」「反復記録 (楽器/コード/運動)」
  - note: 「ノート」「長文ノート・Zettelkasten」
- **Step1**: カテゴリ + タイトルは共通、タイプ別の meta 入力欄が追加
  - flashcard: 変更なし
  - reading: 総ページ数
  - project: 初期マイルストーン (空でも可)
  - practice_log: エントリ形式選択 (reps/duration/freeform)
  - note: なし (後からセクション追加)
- **Step1.5 (PBI-3 時点で既存)**: タグ入力
- **Step2**: 手法選択。`method_material_types` で絞り込み済みの手法のみ表示

### 教材詳細画面

- **progress 表示**: `{completed_units} / {total_units} {unit_label}` を共通化
- **タイプ別セクション**:
  - flashcard: 既存 cards タブ
  - reading: 「進捗を更新」フォーム (現在ページ入力)
  - project: マイルストーン一覧 (チェックボックス + 追加ボタン)
  - practice_log: エントリ一覧 (日付/値/メモ) + 追加フォーム
  - note: セクション数/単語数表示 + 更新フォーム

### 統計画面

- タイプ横断で「学習時間」「セッション数」「日数」は既存どおり
- タイプ別パネル: タイプごとに教材数・完了率を別枠で表示 (折りたたみ)

## PBI 分解

7 PBI。PBI 3 完了後は 4/5/6/7 並列可。**1 PBI = 300 行以下を厳守** (Epic #232 の教訓)。

| # | 内容 | 依存 | 想定行数 |
|---|------|------|---------|
| PBI-1 | migration: type/meta/total_units/unit_label 列 + method_material_types + seeds + 移行 | なし | ~200 |
| PBI-2 | Server Action / 型: `getAllowedMethods(type)` + validation + `updateMaterialMeta` | 1 | ~200 |
| PBI-3 | UI: ウィザード Step0 (タイプ選択) + flashcard 経路既存維持 + 手法絞り込み | 2 | ~250 |
| PBI-4 | reading タイプ: form + progress 更新 UI + 専用ページ | 3 | ~300 |
| PBI-5 | practice_log タイプ: エントリ記録 UI + セッション完了時の自動追加 | 3 | ~300 |
| PBI-6 | project タイプ: マイルストーン UI + 完了率計算 | 3 | ~300 |
| PBI-7 | note タイプ + 統計画面のタイプ横断対応 + `total_cards` 列削除 | 3 | ~300 |

**PBI 設計原則** (Epic #232 の学び):
- Server Action + UI + Large E2E が混在する PBI は前段 (アクション) と後段 (UI + E2E) に分解済み
- PBI-4/5/6/7 は「タイプ 1 つ = 1 PBI」で独立、並列可
- 各 PBI で Migration を作らない (PBI-1 で一括)

## テスト方針

- **Small**:
  - 各タイプの meta zod スキーマ境界
  - `getAllowedMethods(type)` の返却値
  - progress 計算ロジック (practice_log のエントリ合算等)
- **Medium**:
  - migration: type CHECK 制約、method_material_types UNIQUE、trigger の total_cards 同期
  - Server Action: updateMaterialMeta の型別バリデーション、他ユーザー教材への書き込み拒否
- **Large** (各タイプで 1 シナリオ):
  - reading: 教材作成 → 進捗更新 → 統計でページ数反映
  - practice_log: 教材作成 → セッション完了でエントリ自動追加 → 統計
  - project: 教材作成 → マイルストーン完了 → 完了率更新
  - note: 教材作成 → セクション追加 → 統計
  - flashcard: 既存テスト維持

## リスク

| リスク | 対策 |
|--------|------|
| 既存 `total_cards` ベースのコード漏れ | trigger で total_units ↔ total_cards 同期し、PBI-7 で total_cards 削除前に全参照を grep で検出 |
| meta JSONB の schema drift | Server Action 入り口で zod 検証、DB に CHECK は書かない (JSONB 柔軟性を保つ) |
| タイプ × 手法の組合せ爆発 UI | `method_material_types` で DB 主導に絞り込み、UI はロード時 1 クエリで取得 |
| practice_log の entries が肥大化 | 将来別テーブル (`practice_log_entries`) に分離可能な設計を維持 (meta.entries は暫定) |

## スコープ外 (将来の別 Epic)

- 読書タイプのハイライト機能 + Kindle/EPUB 連携
- プロジェクトタイプのタスク分解 AI (Epic #236 の範囲)
- practice_log の詳細分析 (グラフ、トレンド)
- ソーシャル共有、公開ノート

## 参考

- Epic Issue: [#233](https://github.com/u-stem/kairous/issues/233)
- 前 Epic: #232 (カテゴリネスト + タグ横断)
- CLAUDE.md Core Invariants (material_methods 1:N、RLS 全テーブル)
- Spec: 情報モデル柔軟化 (2026-04-15)
