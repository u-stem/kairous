-- 通知用の科目別 due カード数集計を DB 側で実行する。
-- 従来は JS 側で全カードを取得して絞り込んでいたため、カード数が 1000 を超えると
-- PostgREST のデフォルト上限で静かに切り捨てられ、IN 句の URL 長にも当たる問題があった。

CREATE FUNCTION get_due_counts_by_subject(
  p_user_id UUID,
  p_target_date DATE
)
RETURNS TABLE(subject_name TEXT, due_count BIGINT)
LANGUAGE sql
SECURITY INVOKER
AS $$
  -- srs_states を LEFT JOIN することで、未学習のカード (state なし) も due 扱いにする。
  -- due_date > target のカードのみを「未来の due」として除外する
  SELECT
    s.name AS subject_name,
    COUNT(c.id) AS due_count
  FROM cards c
  INNER JOIN materials m ON c.material_id = m.id
  INNER JOIN subjects s ON m.subject_id = s.id
  LEFT JOIN srs_states st
    ON st.card_id = c.id AND st.user_id = p_user_id
  WHERE m.user_id = p_user_id
    AND (st.due_date IS NULL OR st.due_date <= p_target_date)
  GROUP BY s.name
  HAVING COUNT(c.id) > 0
  ORDER BY s.name;
$$;
