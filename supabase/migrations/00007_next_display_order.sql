-- display_order の一意性を保証し、並行リクエスト時の重複を防ぐ
ALTER TABLE cards ADD CONSTRAINT cards_material_display_order_unique
  UNIQUE (material_id, display_order);

-- カード作成と display_order 決定を単一トランザクションで実行する RPC
-- MAX+1 と INSERT が分離すると並行リクエストで重複するため、1文で完結させる
-- SECURITY INVOKER (デフォルト): RLS が有効な状態で実行される
CREATE FUNCTION create_card_with_order(
  p_material_id UUID,
  p_front TEXT,
  p_back TEXT
)
RETURNS UUID
LANGUAGE plpgsql
SECURITY INVOKER
AS $$
DECLARE
  v_id UUID;
  v_retries INT := 0;
BEGIN
  LOOP
    BEGIN
      INSERT INTO cards (material_id, front, back, display_order)
      SELECT p_material_id, p_front, p_back,
             COALESCE(MAX(display_order), -1) + 1
      FROM cards
      WHERE material_id = p_material_id
      RETURNING id INTO v_id;

      RETURN v_id;
    EXCEPTION WHEN unique_violation THEN
      -- 並行リクエストで display_order が衝突した場合、リトライして次の値を取得する
      v_retries := v_retries + 1;
      IF v_retries >= 5 THEN
        RAISE EXCEPTION 'create_card_with_order: max retries exceeded for material %', p_material_id;
      END IF;
    END;
  END LOOP;
END;
$$;
