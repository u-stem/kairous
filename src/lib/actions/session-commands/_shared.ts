import type { createClient } from "@/lib/supabase/server";
import { toJstDateString } from "@/lib/utils/date";

type SupabaseClient = Awaited<ReturnType<typeof createClient>>;

// Supabase JOIN (learning_methods) 結果の型
export type JoinedMethod = { slug: string };

type UpsertDailyLogParams = {
  userId: string;
  materialId: string;
  methodId: string;
  durationSec: number;
  // 旧実装と同じエラーログ形式 (監視 grep パターンとの互換性を保つ) を組み立てるための識別子
  actionName: string;
  sessionId: string;
};

// timer-based (pomodoro / custom / free_study) 完了アクション共通の daily_logs 記録。
// カードレビューを伴わないためセッション完了とは独立した補助処理として扱い、
// 失敗時もセッション更新の成功を保つ (データ欠損は console で追跡)。
export async function upsertDailyLog(
  supabase: SupabaseClient,
  { userId, materialId, methodId, durationSec, actionName, sessionId }: UpsertDailyLogParams,
): Promise<void> {
  const { data: material, error: fetchError } = await supabase
    .from("materials")
    .select("category_id")
    .eq("id", materialId)
    .single();

  // 接続断 / RLS 違反 / PostgREST エラーで error が返るケース。
  // daily_log 書き込みはセッション完了の補助処理なので throw せず log のみ出す
  if (fetchError) {
    console.error(
      `${actionName} daily_log material fetch failed for session ${sessionId}:`,
      fetchError,
    );
    return;
  }

  // error なしで material が null のケースは、教材が削除されたタイミングでの race や
  // RLS ポリシー変更で 0 件となる。接続断 (fetchError) との区別のため warn を分ける
  if (!material) {
    console.warn(
      `${actionName} daily_log material not found for session ${sessionId}: materialId=${materialId}`,
    );
    return;
  }

  const { error } = await supabase.rpc("upsert_daily_log", {
    p_user_id: userId,
    p_category_id: material.category_id,
    p_method_id: methodId,
    p_log_date: toJstDateString(new Date()),
    p_duration_sec: durationSec,
    p_cards_reviewed: 0,
  });

  if (error) {
    console.error(
      `${actionName} daily_log upsert failed for session ${sessionId}:`,
      error,
    );
  }
}
