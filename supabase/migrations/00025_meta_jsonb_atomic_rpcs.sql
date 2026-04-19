-- Issue #321: meta JSONB の read-modify-write を PostgreSQL 関数で原子化
-- ===================================================================
-- 同一教材への concurrent Server Action (practice_log entry 追加 / project
-- milestone toggle 等) が client-side read-modify-write では entry を失う
-- 可能性がある (PR #315 Claude PR Review note)。cards.ts の
-- `increment_total_cards` 同様、SELECT FOR UPDATE + UPDATE を plpgsql 関数に
-- 閉じ込めて行ロックで serialize する。
--
-- 方針:
-- - SECURITY INVOKER + RLS 依存 (cards.ts RPC と同じ)
-- - SELECT FOR UPDATE で行ロック取得 → 検証 → UPDATE の plpgsql 関数
-- - 所有権チェックは materials.user_id vs auth.uid() を RLS に委譲
--   (materials の RLS ポリシーは FOR ALL USING/WITH CHECK = auth.uid() のため
--    SELECT FOR UPDATE と後続 UPDATE に同一条件が適用される。オーナー外の
--    呼び出しは SELECT が 0 行を返し 'material not found' に倒れる)
-- - search_path = public を固定 (00024 hardening と方針揃える)
-- - JSONB 配列追加は `v_arr || p_elem` で行う。PostgreSQL の `||` 演算子は
--   片方が配列・もう片方がオブジェクト/scalar の場合、オブジェクト/scalar を
--   配列要素として append する (両辺 object の merge ルールには該当しない)

-- ===================================================================
-- 1) practice_log_append_entry
--    entries 配列に 1 件追加 + completed_units = 新 length
-- ===================================================================
CREATE OR REPLACE FUNCTION practice_log_append_entry(
  p_material_id UUID,
  p_entry JSONB
)
RETURNS VOID
LANGUAGE plpgsql
SECURITY INVOKER
SET search_path = public
AS $$
DECLARE
  v_type TEXT;
  v_meta JSONB;
  v_entries JSONB;
  v_max CONSTANT INT := 10000;
BEGIN
  -- 配列要素として append するため、JSON 配列が渡されると `||` が配列結合に
  -- 倒れる (`[a]||[b,c]`→`[a,b,c]`)。RPC は直接呼び出し可能なので境界で型チェック
  -- (CLAUDE.md security rules: JSONB 書き込み時の型チェック)
  IF jsonb_typeof(p_entry) <> 'object' THEN
    RAISE EXCEPTION 'p_entry must be a JSON object, got %', jsonb_typeof(p_entry)
      USING ERRCODE = 'P0001';
  END IF;

  -- FOR UPDATE で行ロック。RLS により所有者以外からは 0 行返る
  SELECT type, COALESCE(meta, '{}'::jsonb)
    INTO v_type, v_meta
  FROM materials
  WHERE id = p_material_id
  FOR UPDATE;

  IF v_type IS NULL THEN
    RAISE EXCEPTION 'material not found' USING ERRCODE = 'P0002';
  END IF;
  IF v_type <> 'practice_log' THEN
    RAISE EXCEPTION 'material type is not practice_log (got %)', v_type
      USING ERRCODE = 'P0001';
  END IF;

  v_entries := COALESCE(v_meta->'entries', '[]'::jsonb);
  IF jsonb_array_length(v_entries) >= v_max THEN
    RAISE EXCEPTION 'practice_log entries exceeded max (%)', v_max
      USING ERRCODE = 'P0001';
  END IF;

  v_entries := v_entries || p_entry;

  UPDATE materials
  SET
    meta = jsonb_set(v_meta, '{entries}', v_entries),
    completed_units = jsonb_array_length(v_entries)
  WHERE id = p_material_id;
END;
$$;

-- ===================================================================
-- 2) practice_log_delete_entry
--    entries[index] を削除 + completed_units = 新 length
-- ===================================================================
CREATE OR REPLACE FUNCTION practice_log_delete_entry(
  p_material_id UUID,
  p_entry_index INT
)
RETURNS VOID
LANGUAGE plpgsql
SECURITY INVOKER
SET search_path = public
AS $$
DECLARE
  v_type TEXT;
  v_meta JSONB;
  v_entries JSONB;
  v_len INT;
BEGIN
  SELECT type, COALESCE(meta, '{}'::jsonb)
    INTO v_type, v_meta
  FROM materials
  WHERE id = p_material_id
  FOR UPDATE;

  IF v_type IS NULL THEN
    RAISE EXCEPTION 'material not found' USING ERRCODE = 'P0002';
  END IF;
  IF v_type <> 'practice_log' THEN
    RAISE EXCEPTION 'material type is not practice_log (got %)', v_type
      USING ERRCODE = 'P0001';
  END IF;

  v_entries := COALESCE(v_meta->'entries', '[]'::jsonb);
  v_len := jsonb_array_length(v_entries);
  IF p_entry_index < 0 OR p_entry_index >= v_len THEN
    RAISE EXCEPTION 'entry index % out of range (length=%)', p_entry_index, v_len
      USING ERRCODE = 'P0001';
  END IF;

  -- jsonb の `-` 演算子 (int) は配列から index を除外した新配列を返す
  v_entries := v_entries - p_entry_index;

  UPDATE materials
  SET
    meta = jsonb_set(v_meta, '{entries}', v_entries),
    completed_units = jsonb_array_length(v_entries)
  WHERE id = p_material_id;
END;
$$;

-- ===================================================================
-- 3) project_add_milestone
--    milestones 配列に 1 件追加 + completed_units = done 件数
-- ===================================================================
CREATE OR REPLACE FUNCTION project_add_milestone(
  p_material_id UUID,
  p_milestone JSONB
)
RETURNS VOID
LANGUAGE plpgsql
SECURITY INVOKER
SET search_path = public
AS $$
DECLARE
  v_type TEXT;
  v_meta JSONB;
  v_milestones JSONB;
  v_max CONSTANT INT := 50;
  v_done_count INT;
BEGIN
  -- 配列要素として append するため、JSON 配列が渡されると `||` が配列結合に
  -- 倒れる (`[a]||[b,c]`→`[a,b,c]`)。practice_log_append_entry と同方針で
  -- RPC 境界で型チェックする
  IF jsonb_typeof(p_milestone) <> 'object' THEN
    RAISE EXCEPTION 'p_milestone must be a JSON object, got %', jsonb_typeof(p_milestone)
      USING ERRCODE = 'P0001';
  END IF;

  SELECT type, COALESCE(meta, '{}'::jsonb)
    INTO v_type, v_meta
  FROM materials
  WHERE id = p_material_id
  FOR UPDATE;

  IF v_type IS NULL THEN
    RAISE EXCEPTION 'material not found' USING ERRCODE = 'P0002';
  END IF;
  IF v_type <> 'project' THEN
    RAISE EXCEPTION 'material type is not project (got %)', v_type
      USING ERRCODE = 'P0001';
  END IF;

  v_milestones := COALESCE(v_meta->'milestones', '[]'::jsonb);
  IF jsonb_array_length(v_milestones) >= v_max THEN
    RAISE EXCEPTION 'project milestones exceeded max (%)', v_max
      USING ERRCODE = 'P0001';
  END IF;

  v_milestones := v_milestones || p_milestone;

  SELECT COUNT(*)::INT INTO v_done_count
  FROM jsonb_array_elements(v_milestones) m
  WHERE (m->>'done')::boolean = true;

  UPDATE materials
  SET
    meta = jsonb_set(v_meta, '{milestones}', v_milestones),
    completed_units = v_done_count
  WHERE id = p_material_id;
END;
$$;

-- ===================================================================
-- 4) project_toggle_milestone
--    milestones[index].done を反転 + completed_units 再計算
-- ===================================================================
CREATE OR REPLACE FUNCTION project_toggle_milestone(
  p_material_id UUID,
  p_milestone_index INT
)
RETURNS VOID
LANGUAGE plpgsql
SECURITY INVOKER
SET search_path = public
AS $$
DECLARE
  v_type TEXT;
  v_meta JSONB;
  v_milestones JSONB;
  v_len INT;
  v_target JSONB;
  v_done_count INT;
BEGIN
  SELECT type, COALESCE(meta, '{}'::jsonb)
    INTO v_type, v_meta
  FROM materials
  WHERE id = p_material_id
  FOR UPDATE;

  IF v_type IS NULL THEN
    RAISE EXCEPTION 'material not found' USING ERRCODE = 'P0002';
  END IF;
  IF v_type <> 'project' THEN
    RAISE EXCEPTION 'material type is not project (got %)', v_type
      USING ERRCODE = 'P0001';
  END IF;

  v_milestones := COALESCE(v_meta->'milestones', '[]'::jsonb);
  v_len := jsonb_array_length(v_milestones);
  IF p_milestone_index < 0 OR p_milestone_index >= v_len THEN
    RAISE EXCEPTION 'milestone index % out of range (length=%)', p_milestone_index, v_len
      USING ERRCODE = 'P0001';
  END IF;

  -- index 位置の done を反転して jsonb_set で書き戻す。
  -- jsonb_set の path は text[] で配列 index を渡す (ARRAY['0'] 等)
  v_target := v_milestones->p_milestone_index;
  v_target := jsonb_set(
    v_target,
    '{done}',
    to_jsonb(NOT COALESCE((v_target->>'done')::boolean, false))
  );
  v_milestones := jsonb_set(v_milestones, ARRAY[p_milestone_index::text], v_target);

  SELECT COUNT(*)::INT INTO v_done_count
  FROM jsonb_array_elements(v_milestones) m
  WHERE (m->>'done')::boolean = true;

  UPDATE materials
  SET
    meta = jsonb_set(v_meta, '{milestones}', v_milestones),
    completed_units = v_done_count
  WHERE id = p_material_id;
END;
$$;

-- ===================================================================
-- 5) project_delete_milestone
--    milestones[index] を削除 + completed_units 再計算
-- ===================================================================
CREATE OR REPLACE FUNCTION project_delete_milestone(
  p_material_id UUID,
  p_milestone_index INT
)
RETURNS VOID
LANGUAGE plpgsql
SECURITY INVOKER
SET search_path = public
AS $$
DECLARE
  v_type TEXT;
  v_meta JSONB;
  v_milestones JSONB;
  v_len INT;
  v_done_count INT;
BEGIN
  SELECT type, COALESCE(meta, '{}'::jsonb)
    INTO v_type, v_meta
  FROM materials
  WHERE id = p_material_id
  FOR UPDATE;

  IF v_type IS NULL THEN
    RAISE EXCEPTION 'material not found' USING ERRCODE = 'P0002';
  END IF;
  IF v_type <> 'project' THEN
    RAISE EXCEPTION 'material type is not project (got %)', v_type
      USING ERRCODE = 'P0001';
  END IF;

  v_milestones := COALESCE(v_meta->'milestones', '[]'::jsonb);
  v_len := jsonb_array_length(v_milestones);
  IF p_milestone_index < 0 OR p_milestone_index >= v_len THEN
    RAISE EXCEPTION 'milestone index % out of range (length=%)', p_milestone_index, v_len
      USING ERRCODE = 'P0001';
  END IF;

  v_milestones := v_milestones - p_milestone_index;

  SELECT COUNT(*)::INT INTO v_done_count
  FROM jsonb_array_elements(v_milestones) m
  WHERE (m->>'done')::boolean = true;

  UPDATE materials
  SET
    meta = jsonb_set(v_meta, '{milestones}', v_milestones),
    completed_units = v_done_count
  WHERE id = p_material_id;
END;
$$;
