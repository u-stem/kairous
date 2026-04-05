-- ts-fsrs の Card.state に対応するカラムを追加
-- FSRS-5 アルゴリズムが入力として state を要求するため
ALTER TABLE srs_states ADD COLUMN state TEXT NOT NULL DEFAULT 'New'
  CHECK (state IN ('New', 'Learning', 'Review', 'Relearning'));
