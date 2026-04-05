-- supabase/migrations/00003_rls_policies.sql

-- 全テーブルで RLS を有効化
ALTER TABLE profiles ENABLE ROW LEVEL SECURITY;
ALTER TABLE subjects ENABLE ROW LEVEL SECURITY;
ALTER TABLE materials ENABLE ROW LEVEL SECURITY;
ALTER TABLE learning_methods ENABLE ROW LEVEL SECURITY;
ALTER TABLE material_methods ENABLE ROW LEVEL SECURITY;
ALTER TABLE cards ENABLE ROW LEVEL SECURITY;
ALTER TABLE sessions ENABLE ROW LEVEL SECURITY;
ALTER TABLE session_materials ENABLE ROW LEVEL SECURITY;
ALTER TABLE card_reviews ENABLE ROW LEVEL SECURITY;
ALTER TABLE srs_states ENABLE ROW LEVEL SECURITY;
ALTER TABLE daily_logs ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can view own profile"
  ON profiles FOR SELECT USING (auth.uid() = id);
CREATE POLICY "Users can update own profile"
  ON profiles FOR UPDATE USING (auth.uid() = id);
CREATE POLICY "Users can insert own profile"
  ON profiles FOR INSERT WITH CHECK (auth.uid() = id);

CREATE POLICY "Users can manage own subjects"
  ON subjects FOR ALL USING (auth.uid() = user_id);

CREATE POLICY "Authenticated users can view methods"
  ON learning_methods FOR SELECT TO authenticated USING (true);

CREATE POLICY "Users can manage own materials"
  ON materials FOR ALL USING (auth.uid() = user_id);

CREATE POLICY "Users can manage own material methods"
  ON material_methods FOR ALL
  USING (
    EXISTS (
      SELECT 1 FROM materials WHERE materials.id = material_methods.material_id AND materials.user_id = auth.uid()
    )
  );

CREATE POLICY "Users can manage own cards"
  ON cards FOR ALL
  USING (
    EXISTS (
      SELECT 1 FROM materials WHERE materials.id = cards.material_id AND materials.user_id = auth.uid()
    )
  );

CREATE POLICY "Users can manage own sessions"
  ON sessions FOR ALL USING (auth.uid() = user_id);

CREATE POLICY "Users can manage own session materials"
  ON session_materials FOR ALL
  USING (
    EXISTS (
      SELECT 1 FROM sessions WHERE sessions.id = session_materials.session_id AND sessions.user_id = auth.uid()
    )
  );

CREATE POLICY "Users can manage own card reviews"
  ON card_reviews FOR ALL
  USING (
    EXISTS (
      SELECT 1 FROM sessions WHERE sessions.id = card_reviews.session_id AND sessions.user_id = auth.uid()
    )
  );

CREATE POLICY "Users can manage own srs states"
  ON srs_states FOR ALL USING (auth.uid() = user_id);

CREATE POLICY "Users can manage own daily logs"
  ON daily_logs FOR ALL USING (auth.uid() = user_id);

-- サインアップ時にプロフィールを自動作成
CREATE OR REPLACE FUNCTION handle_new_user()
RETURNS TRIGGER AS $$
BEGIN
  INSERT INTO profiles (id, display_name)
  VALUES (NEW.id, NEW.raw_user_meta_data->>'display_name');
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

CREATE TRIGGER on_auth_user_created
  AFTER INSERT ON auth.users
  FOR EACH ROW EXECUTE FUNCTION handle_new_user();
