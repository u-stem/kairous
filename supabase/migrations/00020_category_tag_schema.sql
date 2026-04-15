-- subjects を categories にリネームし、親子階層 (最大 2 段) と tags / material_tags を追加する。
-- UI 文言変更は PBI-3 に委ね、本 migration は schema + RPC 内部追従のみ。

-- 1) subjects → categories リネーム
ALTER TABLE subjects RENAME TO categories;
ALTER INDEX idx_subjects_user_id RENAME TO idx_categories_user_id;

-- テーブルリネームで制約名は自動更新されないため明示的にリネームする
ALTER TABLE categories
  RENAME CONSTRAINT subjects_pkey TO categories_pkey;
ALTER TABLE categories
  RENAME CONSTRAINT subjects_user_id_fkey TO categories_user_id_fkey;

-- 2) 親子関係
ALTER TABLE categories
  ADD COLUMN parent_id UUID REFERENCES categories(id) ON DELETE CASCADE;
CREATE INDEX idx_categories_parent_id ON categories(parent_id);

-- 深度 2 段制限: 自己参照・深さ超過・ユーザー越境をトリガで防ぐ
CREATE OR REPLACE FUNCTION enforce_category_depth()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY INVOKER
SET search_path = public
AS $$
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
$$;

DROP TRIGGER IF EXISTS enforce_category_depth_trigger ON categories;
CREATE TRIGGER enforce_category_depth_trigger
  BEFORE INSERT OR UPDATE ON categories
  FOR EACH ROW EXECUTE FUNCTION enforce_category_depth();

-- 3) materials.subject_id → category_id リネーム
ALTER TABLE materials RENAME COLUMN subject_id TO category_id;
ALTER INDEX idx_materials_subject_id RENAME TO idx_materials_category_id;

-- 4) tags テーブル
CREATE TABLE tags (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  color TEXT NOT NULL DEFAULT '#94a3b8',
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE(user_id, name)
);
CREATE INDEX idx_tags_user_id ON tags(user_id);

-- 5) material_tags 中間テーブル
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
--    関数名・引数シグネチャは PBI-2 でリネーム予定のため据え置き
--    overload 競合を防ぐため旧シグネチャを先に DROP してから再作成する
DROP FUNCTION IF EXISTS get_due_counts_by_subject(UUID, DATE);
CREATE OR REPLACE FUNCTION get_due_counts_by_subject(
  p_user_id UUID,
  p_target_date DATE
)
RETURNS TABLE(subject_name TEXT, due_count BIGINT)
LANGUAGE sql
SECURITY INVOKER
AS $$
  SELECT
    c.name AS subject_name,
    COUNT(cd.id) AS due_count
  FROM cards cd
  INNER JOIN materials m ON cd.material_id = m.id
  INNER JOIN categories c ON m.category_id = c.id
  LEFT JOIN srs_states st
    ON st.card_id = cd.id AND st.user_id = p_user_id
  WHERE m.user_id = p_user_id
    AND (st.due_date IS NULL OR st.due_date <= p_target_date)
  GROUP BY c.name
  HAVING COUNT(cd.id) > 0
  ORDER BY c.name;
$$;

-- 8) get_due_materials: subjects → categories, m.subject_id → m.category_id に追従
--    RETURN 列名 (subject_id/subject_name/subject_color) は呼び出し側互換のため PBI-2 まで据え置き
DROP FUNCTION IF EXISTS get_due_materials(UUID, DATE);
CREATE OR REPLACE FUNCTION get_due_materials(
  p_user_id UUID,
  p_today DATE
)
RETURNS TABLE(
  material_id UUID,
  title TEXT,
  subject_id UUID,
  subject_name TEXT,
  subject_color TEXT,
  method_id UUID,
  method_slug TEXT,
  method_name TEXT,
  due_count BIGINT
)
LANGUAGE sql
STABLE
AS $$
  SELECT
    m.id AS material_id,
    m.title,
    s.id AS subject_id,
    s.name AS subject_name,
    s.color AS subject_color,
    lm.id AS method_id,
    lm.slug AS method_slug,
    lm.name AS method_name,
    COUNT(c.id) FILTER (
      -- srs_state がないカード（新規）または due_date が今日以前のカードが due
      WHERE ss.card_id IS NULL OR ss.due_date <= p_today
    ) AS due_count
  FROM materials m
  INNER JOIN categories s ON s.id = m.category_id
  INNER JOIN material_methods mm ON mm.material_id = m.id
  INNER JOIN learning_methods lm ON lm.id = mm.method_id
  INNER JOIN cards c ON c.material_id = m.id
  -- ユーザーの srs_state のみ LEFT JOIN（他ユーザーのレコードを誤カウントしない）
  LEFT JOIN srs_states ss ON ss.card_id = c.id AND ss.user_id = p_user_id
  WHERE m.user_id = p_user_id
    AND lm.slug = 'srs'
  GROUP BY m.id, m.title, s.id, s.name, s.color, lm.id, lm.slug, lm.name
  -- due カードが 1 枚以上ある教材のみ返す
  HAVING COUNT(c.id) FILTER (WHERE ss.card_id IS NULL OR ss.due_date <= p_today) > 0;
$$;

-- 9) upsert_daily_log: subjects → categories に追従
--    引数名 p_subject_id・daily_logs.subject_id 列名は PBI-2 まで据え置き
DROP FUNCTION IF EXISTS upsert_daily_log(UUID, UUID, UUID, DATE, INT, INT, INT);
CREATE OR REPLACE FUNCTION upsert_daily_log(
  p_user_id UUID,
  p_subject_id UUID,
  p_method_id UUID,
  p_log_date DATE,
  p_duration_sec INT,
  p_cards_reviewed INT,
  p_session_count INT DEFAULT 1
)
RETURNS void
LANGUAGE plpgsql
SECURITY INVOKER
SET search_path = public
AS $$
BEGIN
  -- category の所有者チェック (categories.user_id = p_user_id)
  IF NOT EXISTS (
    SELECT 1 FROM categories WHERE id = p_subject_id AND user_id = p_user_id
  ) THEN
    RAISE EXCEPTION 'subject % not owned by user %', p_subject_id, p_user_id;
  END IF;

  INSERT INTO daily_logs (user_id, subject_id, method_id, log_date, total_sec, session_count, cards_reviewed)
  VALUES (p_user_id, p_subject_id, p_method_id, p_log_date, p_duration_sec, p_session_count, p_cards_reviewed)
  ON CONFLICT (user_id, subject_id, method_id, log_date)
  DO UPDATE SET
    total_sec = daily_logs.total_sec + EXCLUDED.total_sec,
    session_count = daily_logs.session_count + EXCLUDED.session_count,
    cards_reviewed = daily_logs.cards_reviewed + EXCLUDED.cards_reviewed;
END;
$$;
