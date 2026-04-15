-- RPC 刷新: get_due_counts_by_category / get_interleaving_due_cards 絞り込み拡張 /
-- upsert_daily_log 引数リネーム / daily_logs.subject_id → category_id リネーム

-- 1) daily_logs.subject_id → category_id カラムリネーム
-- FK 制約・UNIQUE 制約は PostgreSQL がリネームを追跡するため、カラムリネーム後も
-- 旧制約名のまま残る。明示リネームで名前を実態に合わせる
ALTER TABLE daily_logs RENAME COLUMN subject_id TO category_id;

ALTER TABLE daily_logs
  RENAME CONSTRAINT daily_logs_subject_id_fkey TO daily_logs_category_id_fkey;
ALTER TABLE daily_logs
  RENAME CONSTRAINT daily_logs_user_id_subject_id_method_id_log_date_key
                 TO daily_logs_user_id_category_id_method_id_log_date_key;

-- 2) get_due_counts_by_subject → get_due_counts_by_category にリネーム
-- 旧シグネチャを先に DROP し overload 競合を回避する
DROP FUNCTION IF EXISTS get_due_counts_by_subject(UUID, DATE);

-- 親カテゴリ選択時は自身 + 全子カテゴリの due を合算する。
-- 子カテゴリ選択時は自身のみ (parent_id IS NOT NULL なら子なし設計)
CREATE OR REPLACE FUNCTION get_due_counts_by_category(
  p_user_id UUID,
  p_target_date DATE
)
RETURNS TABLE(category_id UUID, category_name TEXT, due_count BIGINT)
LANGUAGE sql
SECURITY INVOKER
SET search_path = public
AS $$
  SELECT
    cat.id AS category_id,
    cat.name AS category_name,
    COUNT(cd.id) AS due_count
  FROM cards cd
  INNER JOIN materials m ON cd.material_id = m.id
  -- 親カテゴリ集約: 各教材を「ルートカテゴリ (parent_id IS NULL の祖先)」に紐付ける。
  -- 親カテゴリ選択時は自身 + 全子カテゴリの due を合算する。
  -- 子カテゴリ選択時は自身のみ (子カテゴリには親がいないため COALESCE で自分を返す)
  INNER JOIN categories cat ON cat.id = (
    SELECT COALESCE(c2.parent_id, c2.id)
    FROM categories c2
    WHERE c2.id = m.category_id
      AND c2.user_id = p_user_id
  )
  LEFT JOIN srs_states st
    ON st.card_id = cd.id AND st.user_id = p_user_id
  WHERE m.user_id = p_user_id
    AND (st.due_date IS NULL OR st.due_date <= p_target_date)
  -- 同名カテゴリでの誤集計を防ぐため id + name の複合キーで集計する
  GROUP BY cat.id, cat.name
  HAVING COUNT(cd.id) > 0
  ORDER BY cat.name;
$$;

-- 3) get_interleaving_due_cards に category_id / tag_ids 絞り込み引数を追加
-- 旧シグネチャを先に DROP し overload 競合を回避する
DROP FUNCTION IF EXISTS get_interleaving_due_cards(UUID, UUID, DATE);

-- category_id 指定時: 親カテゴリなら子カテゴリの材料も含む
-- tag_ids 指定時: 材料が全タグを持つ (AND マッチ)
-- 両方 NULL の場合は従来動作 (全教材跨ぎ)
CREATE OR REPLACE FUNCTION get_interleaving_due_cards(
  p_session_id UUID,
  p_user_id UUID,
  p_today DATE,
  p_category_id UUID DEFAULT NULL,
  p_tag_ids UUID[] DEFAULT NULL
)
RETURNS TABLE(
  card_id UUID,
  front TEXT,
  back TEXT,
  display_order INT,
  material_title TEXT
)
LANGUAGE sql
STABLE
SECURITY INVOKER
SET search_path = public
AS $$
  SELECT
    c.id AS card_id,
    c.front,
    c.back,
    c.display_order,
    m.title AS material_title
  FROM session_materials sm
  INNER JOIN materials m ON m.id = sm.material_id
  INNER JOIN cards c ON c.material_id = m.id
  -- srs_state がないカード (新規) または due_date が今日以前のカードのみ
  LEFT JOIN srs_states ss ON ss.card_id = c.id AND ss.user_id = p_user_id
  WHERE sm.session_id = p_session_id
    AND (ss.card_id IS NULL OR ss.due_date <= p_today)
    -- category_id 絞り込み: 親選択時は子カテゴリ材料も含む
    AND (
      p_category_id IS NULL
      OR m.category_id = p_category_id
      OR m.category_id IN (
        SELECT id FROM categories
        WHERE parent_id = p_category_id
      )
    )
    -- tag_ids AND マッチ: 材料が指定タグを全て持つことを確認する
    AND (
      p_tag_ids IS NULL
      OR NOT EXISTS (
        SELECT unnest(p_tag_ids) AS t
        EXCEPT
        SELECT tag_id FROM material_tags WHERE material_id = m.id
      )
    )
  ORDER BY c.display_order;
$$;

-- 4) upsert_daily_log: p_subject_id → p_category_id にリネーム
-- 旧シグネチャを先に DROP し overload 競合を回避する
DROP FUNCTION IF EXISTS upsert_daily_log(UUID, UUID, UUID, DATE, INT, INT, INT);

CREATE OR REPLACE FUNCTION upsert_daily_log(
  p_user_id UUID,
  p_category_id UUID,
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
    SELECT 1 FROM categories WHERE id = p_category_id AND user_id = p_user_id
  ) THEN
    RAISE EXCEPTION 'category % not owned by user %', p_category_id, p_user_id;
  END IF;

  INSERT INTO daily_logs (user_id, category_id, method_id, log_date, total_sec, session_count, cards_reviewed)
  VALUES (p_user_id, p_category_id, p_method_id, p_log_date, p_duration_sec, p_session_count, p_cards_reviewed)
  ON CONFLICT (user_id, category_id, method_id, log_date)
  DO UPDATE SET
    total_sec = daily_logs.total_sec + EXCLUDED.total_sec,
    session_count = daily_logs.session_count + EXCLUDED.session_count,
    cards_reviewed = daily_logs.cards_reviewed + EXCLUDED.cards_reviewed;
END;
$$;

-- 5) get_due_materials の戻り値列 subject_id/subject_name/subject_color を
--    PBI-2 タイミングで category_id/category_name/category_color にリネームする。
--    呼び出し側 (session-queries.ts) の DueMaterialRow 型も同時更新する
DROP FUNCTION IF EXISTS get_due_materials(UUID, DATE);

CREATE OR REPLACE FUNCTION get_due_materials(
  p_user_id UUID,
  p_today DATE
)
RETURNS TABLE(
  material_id UUID,
  title TEXT,
  category_id UUID,
  category_name TEXT,
  category_color TEXT,
  method_id UUID,
  method_slug TEXT,
  method_name TEXT,
  due_count BIGINT
)
LANGUAGE sql
STABLE
SECURITY INVOKER
SET search_path = public
AS $$
  SELECT
    m.id AS material_id,
    m.title,
    cat.id AS category_id,
    cat.name AS category_name,
    cat.color AS category_color,
    lm.id AS method_id,
    lm.slug AS method_slug,
    lm.name AS method_name,
    COUNT(c.id) FILTER (
      -- srs_state がないカード（新規）または due_date が今日以前のカードが due
      WHERE ss.card_id IS NULL OR ss.due_date <= p_today
    ) AS due_count
  FROM materials m
  INNER JOIN categories cat ON cat.id = m.category_id
  INNER JOIN material_methods mm ON mm.material_id = m.id
  INNER JOIN learning_methods lm ON lm.id = mm.method_id
  INNER JOIN cards c ON c.material_id = m.id
  -- ユーザーの srs_state のみ LEFT JOIN（他ユーザーのレコードを誤カウントしない）
  LEFT JOIN srs_states ss ON ss.card_id = c.id AND ss.user_id = p_user_id
  WHERE m.user_id = p_user_id
    AND lm.slug = 'srs'
  GROUP BY m.id, m.title, cat.id, cat.name, cat.color, lm.id, lm.slug, lm.name
  -- due カードが 1 枚以上ある教材のみ返す
  HAVING COUNT(c.id) FILTER (WHERE ss.card_id IS NULL OR ss.due_date <= p_today) > 0;
$$;
