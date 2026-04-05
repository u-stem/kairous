-- daily_logs を原子的に upsert する RPC（SELECT->UPDATE/INSERT の race condition を防止）
CREATE OR REPLACE FUNCTION upsert_daily_log(
  p_user_id UUID,
  p_subject_id UUID,
  p_method_id UUID,
  p_log_date DATE,
  p_duration_sec INT,
  p_cards_reviewed INT
)
RETURNS void
LANGUAGE sql
AS $$
  INSERT INTO daily_logs (user_id, subject_id, method_id, log_date, total_sec, session_count, cards_reviewed)
  VALUES (p_user_id, p_subject_id, p_method_id, p_log_date, p_duration_sec, 1, p_cards_reviewed)
  ON CONFLICT (user_id, subject_id, method_id, log_date)
  DO UPDATE SET
    total_sec = daily_logs.total_sec + EXCLUDED.total_sec,
    session_count = daily_logs.session_count + 1,
    cards_reviewed = daily_logs.cards_reviewed + EXCLUDED.cards_reviewed;
$$;
