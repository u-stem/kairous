-- supabase/migrations/00002_session_recording.sql

-- 学習活動の記録単位。SRS/ポモドーロ/安静など全手法で共通の構造を使う
CREATE TABLE sessions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
  material_id UUID REFERENCES materials(id),  -- インターリービング時は NULL
  method_id UUID NOT NULL REFERENCES learning_methods(id),
  duration_sec INT NOT NULL DEFAULT 0,
  status TEXT NOT NULL DEFAULT 'in_progress'
    CHECK (status IN ('in_progress', 'completed', 'abandoned')),
  self_rating INT CHECK (self_rating >= 1 AND self_rating <= 4),  -- wakeful_rest/free_study では NULL
  meta JSONB NOT NULL DEFAULT '{}',
  started_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  ended_at TIMESTAMPTZ
);

-- セッション x 教材（インターリービング用）
CREATE TABLE session_materials (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  session_id UUID NOT NULL REFERENCES sessions(id) ON DELETE CASCADE,
  material_id UUID NOT NULL REFERENCES materials(id),
  UNIQUE(session_id, material_id)
);

-- FSRS の response_ms を記録し、復習スケジュール計算の入力にする
CREATE TABLE card_reviews (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  session_id UUID NOT NULL REFERENCES sessions(id) ON DELETE CASCADE,
  card_id UUID NOT NULL REFERENCES cards(id),
  rating INT NOT NULL CHECK (rating >= 1 AND rating <= 4),
  response_ms INT NOT NULL DEFAULT 0,
  reviewed_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- FSRS-5 の計算状態を保持し、次回の復習間隔を決定する
CREATE TABLE srs_states (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  card_id UUID NOT NULL REFERENCES cards(id) ON DELETE CASCADE,
  user_id UUID NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
  stability REAL NOT NULL DEFAULT 0,
  difficulty REAL NOT NULL DEFAULT 0,
  reps INT NOT NULL DEFAULT 0,
  lapses INT NOT NULL DEFAULT 0,
  due_date DATE NOT NULL DEFAULT CURRENT_DATE,
  last_reviewed_at TIMESTAMPTZ,
  UNIQUE(card_id, user_id)
);

-- Stats 画面で学習傾向を表示するための日次集計。Edge Function で upsert される
CREATE TABLE daily_logs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
  subject_id UUID NOT NULL REFERENCES subjects(id) ON DELETE CASCADE,
  method_id UUID NOT NULL REFERENCES learning_methods(id),
  log_date DATE NOT NULL DEFAULT CURRENT_DATE,
  total_sec INT NOT NULL DEFAULT 0,
  session_count INT NOT NULL DEFAULT 0,
  cards_reviewed INT NOT NULL DEFAULT 0,
  UNIQUE(user_id, subject_id, method_id, log_date)
);

CREATE INDEX idx_sessions_user_id ON sessions(user_id);
CREATE INDEX idx_sessions_material_id ON sessions(material_id);
CREATE INDEX idx_session_materials_session_id ON session_materials(session_id);
CREATE INDEX idx_card_reviews_session_id ON card_reviews(session_id);
CREATE INDEX idx_card_reviews_card_id ON card_reviews(card_id);
CREATE INDEX idx_srs_states_user_due ON srs_states(user_id, due_date);
CREATE INDEX idx_daily_logs_user_date ON daily_logs(user_id, log_date);
