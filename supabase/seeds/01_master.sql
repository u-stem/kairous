-- Master data: learning methods
INSERT INTO learning_methods (slug, name, category, default_config, is_system) VALUES
  ('srs', '間隔反復 (FSRS)', 'memory', '{"initial_stability": 1.0, "initial_difficulty": 5.0}', true),
  ('interleaving', 'インターリービング', 'comprehension', '{"shuffle": true}', true),
  ('elaboration', '精緻化', 'comprehension', '{}', true),
  ('pomodoro', 'ポモドーロ', 'focus', '{"work_minutes": 25, "break_minutes": 5}', true),
  ('wakeful_rest', '覚醒的休息', 'consolidation', '{"default_minutes": 10}', true),
  ('free_study', '自由学習', 'general', '{}', true)
ON CONFLICT (slug) DO NOTHING;

-- method_material_types: 手法ごとに利用できる教材タイプを定義する (migration 00022)
-- srs / interleaving / elaboration は flashcard 専用。pomodoro / free_study / wakeful_rest は全 5 タイプ対応。
INSERT INTO method_material_types (method_id, material_type)
SELECT lm.id, mt.material_type
FROM learning_methods lm
CROSS JOIN (VALUES
  ('srs', 'flashcard'),
  ('interleaving', 'flashcard'),
  ('elaboration', 'flashcard'),
  ('pomodoro', 'flashcard'),
  ('pomodoro', 'reading'),
  ('pomodoro', 'project'),
  ('pomodoro', 'practice_log'),
  ('pomodoro', 'note'),
  ('free_study', 'flashcard'),
  ('free_study', 'reading'),
  ('free_study', 'project'),
  ('free_study', 'practice_log'),
  ('free_study', 'note'),
  ('wakeful_rest', 'flashcard'),
  ('wakeful_rest', 'reading'),
  ('wakeful_rest', 'project'),
  ('wakeful_rest', 'practice_log'),
  ('wakeful_rest', 'note')
) AS mt(slug, material_type)
WHERE lm.slug = mt.slug
ON CONFLICT DO NOTHING;
