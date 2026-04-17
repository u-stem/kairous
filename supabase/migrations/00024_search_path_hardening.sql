-- Epic #288 PBI-4: Medium セキュリティ指摘の修正 (search_path hardening)
-- 旧 migration で定義された関数群に search_path 固定が欠けており、
-- スキーマインジェクション (不正な search_path 設定で意図しないスキーマを参照させる攻撃) に
-- 脆弱な状態となっていた。最新 migration (00020 以降) と同じく SET search_path = public
-- を明示する。Supabase マネージド環境では実現難度は低いがベストプラクティスとして固定する。

-- =============================================================================
-- 対象関数: create_card_with_order / increment_total_cards /
--          remove_material_method / complete_session_reviews
-- 方針: 関数本体は変更せず ALTER FUNCTION ... SET で search_path のみ設定する。
--      signature (引数型) は最終定義と一致させる必要がある。
-- =============================================================================

ALTER FUNCTION create_card_with_order(UUID, TEXT, TEXT)
  SET search_path = public;

-- 00005 で 2 引数版、00010 で 3 引数版が CREATE OR REPLACE されており、PostgreSQL は
-- これらを別関数として共存させる。両シグネチャに search_path を固定する。
ALTER FUNCTION increment_total_cards(UUID, INT)
  SET search_path = public;

ALTER FUNCTION increment_total_cards(UUID, INT, UUID)
  SET search_path = public;

ALTER FUNCTION remove_material_method(UUID, UUID, UUID)
  SET search_path = public;

-- 00018 で旧 4 引数版を DROP してから 5 引数版を作成しているため、現存するのは
-- 5 引数版のみ。
ALTER FUNCTION complete_session_reviews(UUID, UUID, JSONB, JSONB, JSONB)
  SET search_path = public;
