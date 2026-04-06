-- card_reviews INSERT + srs_states UPSERT を原子的に実行する RPC。
-- Edge Function から 1 回の呼び出しで完結させ、部分書き込み不整合を防ぐ
CREATE FUNCTION complete_session_reviews(
  p_session_id UUID,
  p_user_id UUID,
  p_reviews JSONB,
  p_srs_states JSONB
)
RETURNS void
LANGUAGE plpgsql
SECURITY INVOKER
AS $$
BEGIN
  -- session の所有者チェック
  IF NOT EXISTS (
    SELECT 1 FROM sessions
    WHERE id = p_session_id AND user_id = p_user_id
  ) THEN
    RAISE EXCEPTION 'session % not owned by user %', p_session_id, p_user_id;
  END IF;

  -- card_reviews を一括 INSERT
  INSERT INTO card_reviews (session_id, card_id, rating, response_ms, reviewed_at)
  SELECT
    p_session_id,
    (elem->>'card_id')::UUID,
    (elem->>'rating')::INT,
    (elem->>'response_ms')::INT,
    (elem->>'reviewed_at')::TIMESTAMPTZ
  FROM jsonb_array_elements(p_reviews) AS elem;

  -- srs_states を一括 UPSERT
  INSERT INTO srs_states (card_id, user_id, stability, difficulty, due_date, state, reps, lapses, last_reviewed_at)
  SELECT
    (elem->>'card_id')::UUID,
    p_user_id,
    (elem->>'stability')::REAL,
    (elem->>'difficulty')::REAL,
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
END;
$$;

-- increment_total_cards に所有者チェックを追加
-- p_user_id が指定された場合、materials の所有者を検証する
CREATE OR REPLACE FUNCTION increment_total_cards(
  p_material_id UUID,
  p_delta INT,
  p_user_id UUID DEFAULT NULL
)
RETURNS void
LANGUAGE plpgsql
AS $$
BEGIN
  -- p_user_id が指定された場合、materials の所有者を検証する
  IF p_user_id IS NOT NULL THEN
    IF NOT EXISTS (
      SELECT 1 FROM materials WHERE id = p_material_id AND user_id = p_user_id
    ) THEN
      RAISE EXCEPTION 'material % not owned by user %', p_material_id, p_user_id;
    END IF;
  END IF;

  UPDATE materials
  SET total_cards = GREATEST(0, total_cards + p_delta)
  WHERE id = p_material_id;
END;
$$;

-- upsert_daily_log に subject 所有者チェックを追加
-- p_user_id が実際の subject 所有者であることを保証する
-- p_session_count: interleaving で教材ごとに呼ぶ際、最初の教材のみ 1、残りは 0 を渡して多重カウントを防ぐ
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
AS $$
BEGIN
  -- subject の所有者チェック (subjects.user_id = p_user_id)
  IF NOT EXISTS (
    SELECT 1 FROM subjects WHERE id = p_subject_id AND user_id = p_user_id
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
