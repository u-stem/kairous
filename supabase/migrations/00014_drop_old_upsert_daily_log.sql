-- 00006 で作成した 6引数版 upsert_daily_log を削除する
-- 00010 で p_session_count (DEFAULT 1) 付きの 7引数版に置き換え済みだが、
-- CREATE OR REPLACE は引数シグネチャが異なる場合に旧関数を残すため、
-- PostgreSQL が候補を選択できない "ambiguous" エラーが発生していた
DROP FUNCTION IF EXISTS public.upsert_daily_log(
  uuid, uuid, uuid, date, integer, integer
);
