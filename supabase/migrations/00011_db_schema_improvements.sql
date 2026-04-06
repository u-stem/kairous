-- #67: DB schema improvements
-- S4: remove_material_method RPC (TOCTOU fix)
-- S11: sessions composite index
-- S12: srs_states REAL -> DOUBLE PRECISION
-- RLS: WITH CHECK on all FOR ALL / FOR UPDATE policies

-- =============================================================================
-- S4: remove_material_method RPC
-- Count check + delete in a single transaction to prevent TOCTOU race
-- =============================================================================
CREATE FUNCTION remove_material_method(
  p_material_id UUID,
  p_method_id UUID,
  p_user_id UUID
)
RETURNS void
LANGUAGE plpgsql
SECURITY INVOKER
AS $$
DECLARE
  v_count INT;
  v_deleted INT;
BEGIN
  -- materials は user_id の変更がないため FOR UPDATE 不要
  IF NOT EXISTS (
    SELECT 1 FROM materials
    WHERE id = p_material_id AND user_id = p_user_id
  ) THEN
    RAISE EXCEPTION 'material % not owned by user %', p_material_id, p_user_id;
  END IF;

  -- FOR UPDATE locks rows to prevent concurrent deletes
  SELECT COUNT(*) INTO v_count
  FROM material_methods
  WHERE material_id = p_material_id
  FOR UPDATE;

  IF v_count <= 1 THEN
    RAISE EXCEPTION 'at least one method required for material %', p_material_id;
  END IF;

  DELETE FROM material_methods
  WHERE material_id = p_material_id AND method_id = p_method_id;

  GET DIAGNOSTICS v_deleted = ROW_COUNT;
  IF v_deleted = 0 THEN
    RAISE EXCEPTION 'method % not found for material %', p_method_id, p_material_id;
  END IF;
END;
$$;

-- =============================================================================
-- S11: sessions composite index
-- Today page filters by (user_id, status) via get_due_materials RPC
-- =============================================================================
CREATE INDEX idx_sessions_user_id_status ON sessions(user_id, status);

-- =============================================================================
-- S12: srs_states REAL -> DOUBLE PRECISION
-- FSRS stability/difficulty accumulate precision loss with 32-bit floats
-- =============================================================================
ALTER TABLE srs_states
  ALTER COLUMN stability TYPE DOUBLE PRECISION,
  ALTER COLUMN difficulty TYPE DOUBLE PRECISION;

-- Update batch_upsert_srs_states to cast to DOUBLE PRECISION
CREATE OR REPLACE FUNCTION batch_upsert_srs_states(
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
    (elem->>'stability')::DOUBLE PRECISION,
    (elem->>'difficulty')::DOUBLE PRECISION,
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

-- Update complete_session_reviews to cast to DOUBLE PRECISION
CREATE OR REPLACE FUNCTION complete_session_reviews(
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
END;
$$;

-- =============================================================================
-- RLS: Add WITH CHECK to all FOR ALL and FOR UPDATE policies
-- PostgreSQL FOR ALL without WITH CHECK implicitly uses the USING expression,
-- but explicit WITH CHECK makes the intent clear and prevents future confusion
-- =============================================================================

-- profiles: FOR UPDATE was missing WITH CHECK
DROP POLICY "Users can update own profile" ON profiles;
CREATE POLICY "Users can update own profile"
  ON profiles FOR UPDATE
  USING (auth.uid() = id)
  WITH CHECK (auth.uid() = id);

-- subjects
DROP POLICY "Users can manage own subjects" ON subjects;
CREATE POLICY "Users can manage own subjects"
  ON subjects FOR ALL
  USING (auth.uid() = user_id)
  WITH CHECK (auth.uid() = user_id);

-- materials
DROP POLICY "Users can manage own materials" ON materials;
CREATE POLICY "Users can manage own materials"
  ON materials FOR ALL
  USING (auth.uid() = user_id)
  WITH CHECK (auth.uid() = user_id);

-- material_methods
DROP POLICY "Users can manage own material methods" ON material_methods;
CREATE POLICY "Users can manage own material methods"
  ON material_methods FOR ALL
  USING (
    EXISTS (
      SELECT 1 FROM materials WHERE materials.id = material_methods.material_id AND materials.user_id = auth.uid()
    )
  )
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM materials WHERE materials.id = material_methods.material_id AND materials.user_id = auth.uid()
    )
  );

-- cards
DROP POLICY "Users can manage own cards" ON cards;
CREATE POLICY "Users can manage own cards"
  ON cards FOR ALL
  USING (
    EXISTS (
      SELECT 1 FROM materials WHERE materials.id = cards.material_id AND materials.user_id = auth.uid()
    )
  )
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM materials WHERE materials.id = cards.material_id AND materials.user_id = auth.uid()
    )
  );

-- sessions
DROP POLICY "Users can manage own sessions" ON sessions;
CREATE POLICY "Users can manage own sessions"
  ON sessions FOR ALL
  USING (auth.uid() = user_id)
  WITH CHECK (auth.uid() = user_id);

-- session_materials
DROP POLICY "Users can manage own session materials" ON session_materials;
CREATE POLICY "Users can manage own session materials"
  ON session_materials FOR ALL
  USING (
    EXISTS (
      SELECT 1 FROM sessions WHERE sessions.id = session_materials.session_id AND sessions.user_id = auth.uid()
    )
  )
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM sessions WHERE sessions.id = session_materials.session_id AND sessions.user_id = auth.uid()
    )
  );

-- card_reviews
DROP POLICY "Users can manage own card reviews" ON card_reviews;
CREATE POLICY "Users can manage own card reviews"
  ON card_reviews FOR ALL
  USING (
    EXISTS (
      SELECT 1 FROM sessions WHERE sessions.id = card_reviews.session_id AND sessions.user_id = auth.uid()
    )
  )
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM sessions WHERE sessions.id = card_reviews.session_id AND sessions.user_id = auth.uid()
    )
  );

-- srs_states
DROP POLICY "Users can manage own srs states" ON srs_states;
CREATE POLICY "Users can manage own srs states"
  ON srs_states FOR ALL
  USING (auth.uid() = user_id)
  WITH CHECK (auth.uid() = user_id);

-- daily_logs
DROP POLICY "Users can manage own daily logs" ON daily_logs;
CREATE POLICY "Users can manage own daily logs"
  ON daily_logs FOR ALL
  USING (auth.uid() = user_id)
  WITH CHECK (auth.uid() = user_id);
