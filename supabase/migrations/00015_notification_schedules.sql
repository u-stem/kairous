-- profiles テーブルにマスタートグルを追加
ALTER TABLE profiles
  ADD COLUMN notification_enabled BOOLEAN NOT NULL DEFAULT false;

-- 通知スケジュールテーブル
CREATE TABLE notification_schedules (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  label TEXT NOT NULL,
  enabled BOOLEAN NOT NULL DEFAULT true,
  time TIME NOT NULL,
  message_type TEXT NOT NULL
    CHECK (message_type IN ('due_today', 'review_and_preview')),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX idx_notification_schedules_user_id
  ON notification_schedules(user_id);

ALTER TABLE notification_schedules ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can manage own schedules"
  ON notification_schedules FOR ALL
  USING (auth.uid() = user_id)
  WITH CHECK (auth.uid() = user_id);
