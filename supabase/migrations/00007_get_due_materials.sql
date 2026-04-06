-- materials・cards・srs_states を結合して due_count を集計する RPC。
-- N+1 クエリ（materials→cards→srs_states の3往復）を1クエリに集約するために RPC 化した。
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
  INNER JOIN subjects s ON s.id = m.subject_id
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
