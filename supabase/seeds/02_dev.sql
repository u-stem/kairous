-- Dev/test seed data: test user, subjects, daily_logs
-- Provides realistic data for local development and UI verification

-- Test user (email: test@example.com / password: testpass123)
-- auth.users insert triggers handle_new_user() which creates profiles row
-- GoTrue requires certain text columns to be non-NULL (empty string, not NULL)
INSERT INTO auth.users (
  id, instance_id, aud, role,
  email, encrypted_password, email_confirmed_at,
  raw_app_meta_data, raw_user_meta_data,
  created_at, updated_at,
  confirmation_token, recovery_token,
  email_change, email_change_token_new, email_change_token_current,
  phone, phone_change, phone_change_token,
  reauthentication_token,
  is_sso_user, is_anonymous
) VALUES (
  '00000000-0000-0000-0000-000000000001',
  '00000000-0000-0000-0000-000000000000',
  'authenticated', 'authenticated',
  'test@example.com',
  crypt('testpass123', gen_salt('bf')),
  now(),
  '{"provider":"email","providers":["email"]}',
  '{"display_name":"Test User","email":"test@example.com","email_verified":true,"phone_verified":false,"sub":"00000000-0000-0000-0000-000000000001"}',
  now(), now(),
  '', '',
  '', '', '',
  '', '', '',
  '',
  false, false
) ON CONFLICT (id) DO NOTHING;

INSERT INTO auth.identities (
  id, user_id, provider_id, provider,
  identity_data, last_sign_in_at,
  created_at, updated_at
) VALUES (
  '00000000-0000-0000-0000-000000000001',
  '00000000-0000-0000-0000-000000000001',
  '00000000-0000-0000-0000-000000000001',
  'email',
  '{"sub":"00000000-0000-0000-0000-000000000001","email":"test@example.com","email_verified":true,"phone_verified":false}',
  now(), now(), now()
) ON CONFLICT (id) DO NOTHING;

-- Subjects
INSERT INTO subjects (id, user_id, name, color, display_order) VALUES
  ('a0000000-0000-0000-0000-000000000001', '00000000-0000-0000-0000-000000000001', '英語', '#6366f1', 1),
  ('a0000000-0000-0000-0000-000000000002', '00000000-0000-0000-0000-000000000001', '数学', '#f43f5e', 2),
  ('a0000000-0000-0000-0000-000000000003', '00000000-0000-0000-0000-000000000001', '物理', '#22c55e', 3)
ON CONFLICT (id) DO NOTHING;

-- Daily logs: 14 days of study data for Stats page verification
DO $$
DECLARE
  v_user_id UUID := '00000000-0000-0000-0000-000000000001';
  v_english UUID := 'a0000000-0000-0000-0000-000000000001';
  v_math UUID := 'a0000000-0000-0000-0000-000000000002';
  v_physics UUID := 'a0000000-0000-0000-0000-000000000003';
  v_srs UUID;
  v_pomodoro UUID;
  v_active_recall UUID;
  v_d DATE;
BEGIN
  SELECT id INTO v_srs FROM learning_methods WHERE slug = 'srs';
  SELECT id INTO v_pomodoro FROM learning_methods WHERE slug = 'pomodoro';
  SELECT id INTO v_active_recall FROM learning_methods WHERE slug = 'active_recall';

  FOR i IN 1..14 LOOP
    v_d := CURRENT_DATE - i;

    -- English + SRS (daily, 20-50min, 15-45 cards)
    INSERT INTO daily_logs (user_id, subject_id, method_id, log_date, total_sec, session_count, cards_reviewed)
    VALUES (v_user_id, v_english, v_srs, v_d, 1200 + (random() * 1800)::int, 1 + (random() * 2)::int, 15 + (random() * 30)::int)
    ON CONFLICT (user_id, subject_id, method_id, log_date) DO NOTHING;

    -- Math + Pomodoro (every other day, 25-50min)
    IF i % 2 = 0 THEN
      INSERT INTO daily_logs (user_id, subject_id, method_id, log_date, total_sec, session_count, cards_reviewed)
      VALUES (v_user_id, v_math, v_pomodoro, v_d, 1500 + (random() * 1500)::int, 1, 0)
      ON CONFLICT (user_id, subject_id, method_id, log_date) DO NOTHING;
    END IF;

    -- Physics + Active Recall (every 3 days, 15-30min, 10-25 cards)
    IF i % 3 = 0 THEN
      INSERT INTO daily_logs (user_id, subject_id, method_id, log_date, total_sec, session_count, cards_reviewed)
      VALUES (v_user_id, v_physics, v_active_recall, v_d, 900 + (random() * 900)::int, 1, 10 + (random() * 15)::int)
      ON CONFLICT (user_id, subject_id, method_id, log_date) DO NOTHING;
    END IF;
  END LOOP;
END $$;
