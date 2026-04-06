-- Master data: learning methods
INSERT INTO learning_methods (slug, name, category, default_config, is_system) VALUES
  ('srs', '間隔反復 (FSRS)', 'memory', '{"initial_stability": 1.0, "initial_difficulty": 5.0}', true),
  ('active_recall', 'アクティブリコール', 'memory', '{}', true),
  ('interleaving', 'インターリービング', 'comprehension', '{"shuffle": true}', true),
  ('elaboration', '精緻化', 'comprehension', '{}', true),
  ('pomodoro', 'ポモドーロ', 'focus', '{"work_minutes": 25, "break_minutes": 5}', true),
  ('wakeful_rest', '覚醒的休息', 'consolidation', '{"default_minutes": 10}', true),
  ('free_study', '自由学習', 'general', '{}', true)
ON CONFLICT (slug) DO NOTHING;
