-- Edge Function からのみ呼ばれる前提 (service_role key で RLS バイパス)
-- クライアントから直接呼ばれても RLS で弾かれる
CREATE FUNCTION batch_upsert_srs_states(
  p_states JSONB
)
RETURNS void
LANGUAGE sql
SECURITY INVOKER
AS $$
  INSERT INTO srs_states (card_id, user_id, stability, difficulty, due_date, state, reps, lapses, last_reviewed_at)
  SELECT
    (elem->>'card_id')::UUID,
    (elem->>'user_id')::UUID,
    (elem->>'stability')::REAL,
    (elem->>'difficulty')::REAL,
    (elem->>'due_date')::DATE,
    (elem->>'state')::TEXT,
    (elem->>'reps')::INT,
    (elem->>'lapses')::INT,
    (elem->>'last_reviewed_at')::TIMESTAMPTZ
  FROM jsonb_array_elements(p_states) AS elem
  ON CONFLICT (card_id, user_id)
  DO UPDATE SET
    stability = EXCLUDED.stability,
    difficulty = EXCLUDED.difficulty,
    due_date = EXCLUDED.due_date,
    state = EXCLUDED.state,
    reps = EXCLUDED.reps,
    lapses = EXCLUDED.lapses,
    last_reviewed_at = EXCLUDED.last_reviewed_at;
$$;
