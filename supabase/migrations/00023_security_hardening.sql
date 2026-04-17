-- Epic #288 PBI-1: Security High 指摘の修正
-- S2: batch_upsert_srs_states は Edge Function からも呼ばれず完全未使用のため廃止する。
--     JSONB 内の user_id を呼び出し元が任意指定できる構造で、card 所有者検証も欠落しており、
--     PostgREST 経由で直接呼び出し可能な状態を放置する合理性がない。
-- S3: card_elaborations に UPDATE/DELETE ポリシーを明示的に追加する。
--     現状は SELECT と INSERT のみポリシー定義されており、UPDATE/DELETE は暗黙拒否だが、
--     意図が明示されていないため将来的なポリシー追加時の誤解放を招きやすい。
--     elaboration は学習記録として不変であるべき (履歴の信頼性を保つ)。

-- =============================================================================
-- S2: DROP batch_upsert_srs_states
-- =============================================================================
DROP FUNCTION IF EXISTS batch_upsert_srs_states(JSONB);

-- =============================================================================
-- S3: card_elaborations の UPDATE/DELETE を明示拒否
-- TO authenticated で USING (false) を宣言することにより、認証済みユーザー経由の
-- UPDATE/DELETE が PostgREST で「行が見つからない」扱いになる。service_role からの
-- 書き換え (Edge Function / 管理操作) は RLS をバイパスするため影響なし。
-- =============================================================================
CREATE POLICY "Elaborations are immutable for users"
  ON card_elaborations FOR UPDATE TO authenticated
  USING (false)
  WITH CHECK (false);

CREATE POLICY "Elaborations cannot be deleted by users"
  ON card_elaborations FOR DELETE TO authenticated
  USING (false);
