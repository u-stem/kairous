-- session_materials に紐づく全教材の due cards を 1 クエリで取得する RPC。
-- 教材ごとの cards + srs_states の N+1 クエリ (最大20往復) を集約する。
CREATE FUNCTION get_interleaving_due_cards(
  p_session_id UUID,
  p_user_id UUID,
  p_today DATE
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
  ORDER BY c.display_order;
$$;
