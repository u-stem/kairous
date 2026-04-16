-- 教材タイプ多様化 (Epic #233 PBI-1)
-- materials に type / meta / progress 列を追加し、method_material_types で手法×タイプ互換性を管理する。

-- 1) materials に type, meta, progress 列追加
ALTER TABLE materials
  ADD COLUMN type TEXT NOT NULL DEFAULT 'flashcard'
    CHECK (type IN ('flashcard', 'reading', 'project', 'practice_log', 'note')),
  ADD COLUMN meta JSONB NOT NULL DEFAULT '{}',
  ADD COLUMN total_units INT NOT NULL DEFAULT 0,
  ADD COLUMN completed_units INT NOT NULL DEFAULT 0,
  ADD COLUMN unit_label TEXT NOT NULL DEFAULT '枚';

CREATE INDEX idx_materials_type ON materials(type);

-- 2) 既存 flashcard 教材の total_units を total_cards から移行
UPDATE materials SET total_units = total_cards WHERE type = 'flashcard';

-- 3) total_cards を total_units と同期する trigger (PBI-7 で total_cards 削除後に DROP)
-- 同期方向: total_units → total_cards (一方向)。
-- total_cards を直接更新しても total_units は変化しない。
-- INSERT 時に total_cards のみ指定した場合 trigger は total_cards を total_units (=0) で上書きする。
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

-- 4) method_material_types: どの手法がどのタイプに使えるかを管理する中間テーブル
CREATE TABLE method_material_types (
  method_id UUID NOT NULL REFERENCES learning_methods(id) ON DELETE CASCADE,
  material_type TEXT NOT NULL
    CHECK (material_type IN ('flashcard', 'reading', 'project', 'practice_log', 'note')),
  PRIMARY KEY (method_id, material_type)
);

-- 参照専用 RLS: 全ユーザーが読み取り可能、書き込みは admin (service_role) のみ
ALTER TABLE method_material_types ENABLE ROW LEVEL SECURITY;
CREATE POLICY "method_material_types_select_all"
  ON method_material_types
  FOR SELECT
  USING (true);

-- 5) 初期 seeds は supabase/seeds/01_master.sql で投入する。
-- migration 実行時点では learning_methods が空のため、migration 内での INSERT はスキップする。
-- (db reset 順序: migrations → seeds)

