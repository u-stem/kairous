"use server";

import { revalidatePath } from "next/cache";
import type { ActionResult } from "@/lib/types/action-result";
import type { LearningMethod } from "@/lib/types/materials";
import type { Json } from "@/lib/types/database";
import { MATERIAL_METHOD_SLUGS, ACTION_ERRORS, PG_ERROR_CODES } from "@/lib/constants";
import { requireAuth } from "@/lib/actions/auth-utils";

export async function addMaterialMethod(
  materialId: string,
  methodId: string,
  config?: Record<string, unknown>,
): Promise<ActionResult<undefined>> {
  const { user, supabase } = await requireAuth();

  // RLSに加えてuser_idで絞り込み、他ユーザーの教材への追加を防ぐ
  const { data: material } = await supabase
    .from("materials")
    .select("id")
    .eq("id", materialId)
    .eq("user_id", user.id)
    .single();

  if (!material) return { success: false, error: ACTION_ERRORS.NOT_FOUND("教材") };

  // ウィザード外から不正なスラッグを紐付けられないよう、許可リストで検証する
  const { data: methodRow } = await supabase
    .from("learning_methods")
    .select("id, slug, is_system, user_id")
    .eq("id", methodId)
    .single();

  if (!methodRow) return { success: false, error: ACTION_ERRORS.NOT_FOUND("学習手法") };

  // システム手法はスラッグ許可リスト、ユーザー定義手法はオーナーチェック
  const isAllowedSystem =
    methodRow.is_system &&
    (MATERIAL_METHOD_SLUGS as readonly string[]).includes(methodRow.slug);
  const isOwnCustom = !methodRow.is_system && methodRow.user_id === user.id;

  if (!isAllowedSystem && !isOwnCustom) {
    return { success: false, error: "この学習手法は紐付けできません" };
  }

  const { error } = await supabase.from("material_methods").insert({
    material_id: materialId,
    method_id: methodId,
    // config は NOT NULL でデフォルト '{}' のため、未指定時は空オブジェクトで明示する
    config: (config ?? {}) as Json,
  });

  if (error) {
    // PostgreSQL unique violation: 既に同じ手法が紐付けられている
    if (error.code === PG_ERROR_CODES.UNIQUE_VIOLATION) {
      return { success: false, error: "この手法は既に紐付けされています" };
    }
    return { success: false, error: ACTION_ERRORS.CREATE_FAILED("学習手法") };
  }

  revalidatePath(`/materials/${materialId}`);
  return { success: true, data: undefined };
}

export async function removeMaterialMethod(
  materialId: string,
  methodId: string,
): Promise<ActionResult<undefined>> {
  const { user, supabase } = await requireAuth();

  // RPC で所有者チェック + 残数チェック + 削除を原子的に実行し TOCTOU を防ぐ
  const { error } = await supabase.rpc("remove_material_method", {
    p_material_id: materialId,
    p_method_id: methodId,
    p_user_id: user.id,
  });

  if (error) {
    if (error.message.includes("not owned by user")) {
      return { success: false, error: ACTION_ERRORS.NOT_FOUND("教材") };
    }
    if (error.message.includes("at least one method required")) {
      return { success: false, error: "最低1つの学習手法が必要です" };
    }
    if (error.message.includes("not found for material")) {
      return { success: false, error: "この手法は紐付けされていません" };
    }
    return { success: false, error: ACTION_ERRORS.DELETE_FAILED("学習手法") };
  }

  revalidatePath(`/materials/${materialId}`);
  return { success: true, data: undefined };
}

export async function getMethods(): Promise<LearningMethod[]> {
  // RLS がシステム手法 + 自分のカスタム手法のみ返すため、認証コンテキストが必要
  const { supabase } = await requireAuth();
  const { data, error } = await supabase
    .from("learning_methods")
    .select("*")
    .order("is_system", { ascending: false })
    .order("category", { ascending: true });

  // DB 障害時に空配列を返すと、呼び出し側で「手法が 0 件」と区別できず
  // ユーザーは原因不明の選択不能状態に陥る。error は throw して errorBoundary に伝播させる。
  // DB の内部メッセージ (テーブル名・カラム名) がクライアントへ漏れないよう、throw する
  // 文言は汎用化し、詳細は server ログにのみ残す
  if (error) {
    console.error("getMethods failed:", error.message);
    throw new Error("学習手法の取得に失敗しました");
  }
  return data ?? [];
}
