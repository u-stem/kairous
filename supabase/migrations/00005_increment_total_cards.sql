-- total_cards を原子的に増減する RPC
CREATE OR REPLACE FUNCTION increment_total_cards(
  p_material_id UUID,
  p_delta INT
)
RETURNS void
LANGUAGE sql
AS $$
  UPDATE materials
  SET total_cards = GREATEST(0, total_cards + p_delta)
  WHERE id = p_material_id;
$$;
