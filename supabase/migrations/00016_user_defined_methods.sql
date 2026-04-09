-- ユーザー定義手法のためのカラム追加・RLS ポリシー設定
-- learning_methods は 00001_core_domain.sql で作成済み。is_system カラムも既存

ALTER TABLE learning_methods
  ADD COLUMN user_id UUID REFERENCES auth.users(id) ON DELETE CASCADE,
  ADD COLUMN description TEXT,
  ADD COLUMN default_duration_sec INTEGER CHECK (default_duration_sec >= 60 AND default_duration_sec <= 10800);

-- システム手法は user_id=NULL、ユーザー定義手法は user_id 必須
ALTER TABLE learning_methods
  ADD CONSTRAINT chk_user_method
  CHECK (is_system = true OR user_id IS NOT NULL);

-- 同一ユーザーの手法名重複を防ぐ (システム手法は対象外)
CREATE UNIQUE INDEX uq_user_method_name
  ON learning_methods (user_id, name)
  WHERE is_system = false;

-- 既存ポリシー (00003: "Authenticated users can view methods") は SELECT のみ。
-- ユーザー定義手法の書き込みポリシーを追加する

-- SELECT: 既存ポリシーは USING(true) なのでシステム手法+全ユーザー手法を返す。
-- ユーザー定義手法は自分のものだけ見えるよう、既存ポリシーを置き換える
DROP POLICY "Authenticated users can view methods" ON learning_methods;

CREATE POLICY "Users can view system and own methods"
  ON learning_methods FOR SELECT TO authenticated
  USING (is_system = true OR user_id = auth.uid());

CREATE POLICY "Users can insert own custom methods"
  ON learning_methods FOR INSERT TO authenticated
  WITH CHECK (is_system = false AND user_id = auth.uid());

CREATE POLICY "Users can update own custom methods"
  ON learning_methods FOR UPDATE TO authenticated
  USING (is_system = false AND user_id = auth.uid())
  WITH CHECK (is_system = false AND user_id = auth.uid());

CREATE POLICY "Users can delete own custom methods"
  ON learning_methods FOR DELETE TO authenticated
  USING (is_system = false AND user_id = auth.uid());

-- material_methods の FK に ON DELETE CASCADE を追加
-- (既存 FK には CASCADE がないため、作り直す)
ALTER TABLE material_methods
  DROP CONSTRAINT material_methods_method_id_fkey,
  ADD CONSTRAINT material_methods_method_id_fkey
    FOREIGN KEY (method_id) REFERENCES learning_methods(id) ON DELETE CASCADE;

-- RLS クエリ (WHERE user_id = auth.uid()) のパフォーマンス用
CREATE INDEX idx_learning_methods_user_id ON learning_methods(user_id)
  WHERE user_id IS NOT NULL;
