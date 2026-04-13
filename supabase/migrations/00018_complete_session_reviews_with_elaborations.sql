-- Elaboration セッションの card_reviews と card_elaborations を同一トランザクションで
-- 書き込めるよう complete_session_reviews RPC を拡張する。
-- 従来は Edge Function 側で 2 回 INSERT していたため、card_reviews 成功後に
-- card_elaborations が失敗した場合に partial success が発生する問題があった。

CREATE OR REPLACE FUNCTION complete_session_reviews(
  p_session_id UUID,
  p_user_id UUID,
  p_reviews JSONB,
  p_srs_states JSONB,
  p_elaborations JSONB DEFAULT '[]'::jsonb
)
RETURNS void
LANGUAGE plpgsql
SECURITY INVOKER
AS $$
BEGIN
  -- session ownership check
  IF NOT EXISTS (
    SELECT 1 FROM sessions
    WHERE id = p_session_id AND user_id = p_user_id
  ) THEN
    RAISE EXCEPTION 'session % not owned by user %', p_session_id, p_user_id;
  END IF;

  -- card_reviews batch INSERT
  INSERT INTO card_reviews (session_id, card_id, rating, response_ms, reviewed_at)
  SELECT
    p_session_id,
    (elem->>'card_id')::UUID,
    (elem->>'rating')::INT,
    (elem->>'response_ms')::INT,
    (elem->>'reviewed_at')::TIMESTAMPTZ
  FROM jsonb_array_elements(p_reviews) AS elem;

  -- srs_states batch UPSERT
  INSERT INTO srs_states (card_id, user_id, stability, difficulty, due_date, state, reps, lapses, last_reviewed_at)
  SELECT
    (elem->>'card_id')::UUID,
    p_user_id,
    (elem->>'stability')::DOUBLE PRECISION,
    (elem->>'difficulty')::DOUBLE PRECISION,
    (elem->>'due_date')::DATE,
    (elem->>'state')::TEXT,
    (elem->>'reps')::INT,
    (elem->>'lapses')::INT,
    (elem->>'last_reviewed_at')::TIMESTAMPTZ
  FROM jsonb_array_elements(p_srs_states) AS elem
  ON CONFLICT (card_id, user_id)
  DO UPDATE SET
    stability = EXCLUDED.stability,
    difficulty = EXCLUDED.difficulty,
    due_date = EXCLUDED.due_date,
    state = EXCLUDED.state,
    reps = EXCLUDED.reps,
    lapses = EXCLUDED.lapses,
    last_reviewed_at = EXCLUDED.last_reviewed_at;

  -- card_elaborations batch INSERT (Elaboration セッションのみ non-empty)
  -- card_reviews と同一トランザクションで実行することで partial success を防ぐ
  INSERT INTO card_elaborations (user_id, session_id, card_id, elaboration_text)
  SELECT
    p_user_id,
    p_session_id,
    (elem->>'card_id')::UUID,
    elem->>'text'
  FROM jsonb_array_elements(p_elaborations) AS elem;
END;
$$;
