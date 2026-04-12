-- Elaboration セッションの記述テキストを専用テーブルに永続化する。
-- 従来は sessions.meta.elaborations JSONB に保存していたが、
-- カード単位の履歴検索・インデックスが効かないため専用テーブルへ移行する。

CREATE TABLE card_elaborations (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  session_id UUID NOT NULL REFERENCES sessions(id) ON DELETE CASCADE,
  card_id UUID NOT NULL REFERENCES cards(id) ON DELETE CASCADE,
  elaboration_text TEXT NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- 教材詳細画面で「そのカードの elaboration 履歴」を時系列降順で取得するため
CREATE INDEX idx_card_elaborations_user_card
  ON card_elaborations (user_id, card_id, created_at DESC);

-- Review 画面で「そのセッションの elaboration 一覧」を取得するため
CREATE INDEX idx_card_elaborations_session
  ON card_elaborations (session_id);

ALTER TABLE card_elaborations ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can view own elaborations"
  ON card_elaborations FOR SELECT TO authenticated
  USING (user_id = auth.uid());

CREATE POLICY "Users can insert own elaborations"
  ON card_elaborations FOR INSERT TO authenticated
  WITH CHECK (user_id = auth.uid());

-- 既存の sessions.meta.elaborations を card_elaborations に移行する。
-- 既存 Elaboration セッションのテキストも Review 画面・履歴 UI から参照可能にする。
INSERT INTO card_elaborations (user_id, session_id, card_id, elaboration_text, created_at)
SELECT
  s.user_id,
  s.id,
  (e->>'card_id')::uuid,
  e->>'text',
  COALESCE(s.ended_at, s.started_at, now())
FROM sessions s,
  jsonb_array_elements(s.meta->'elaborations') e
WHERE s.meta ? 'elaborations'
  AND jsonb_typeof(s.meta->'elaborations') = 'array'
  AND jsonb_array_length(s.meta->'elaborations') > 0;
