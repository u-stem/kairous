-- active_recall を srs に統合し、learning_methods から完全削除する
-- SRS と active_recall のコードパスが同一のため、別メソッドとして維持するコストを排除する

DO $$
DECLARE
  v_srs_id UUID;
  v_ar_id UUID;
BEGIN
  SELECT id INTO v_srs_id FROM learning_methods WHERE slug = 'srs';
  SELECT id INTO v_ar_id FROM learning_methods WHERE slug = 'active_recall';

  -- active_recall が既に削除済みの場合はスキップ（冪等性のため）
  IF v_ar_id IS NOT NULL THEN
    -- active_recall を参照している material_methods を srs に移行
    -- ON CONFLICT: 同一教材に srs と active_recall 両方ある場合は active_recall 側を削除
    DELETE FROM material_methods
    WHERE method_id = v_ar_id
      AND material_id IN (
        SELECT material_id FROM material_methods WHERE method_id = v_srs_id
      );

    UPDATE material_methods SET method_id = v_srs_id WHERE method_id = v_ar_id;

    -- sessions, daily_logs の method_id も移行
    UPDATE sessions SET method_id = v_srs_id WHERE method_id = v_ar_id;
    UPDATE daily_logs SET method_id = v_srs_id WHERE method_id = v_ar_id;

    -- learning_methods から active_recall を削除
    DELETE FROM learning_methods WHERE slug = 'active_recall';
  END IF;
END;
$$;
