"use server";

import { revalidatePath } from "next/cache";
import { cardSchema, extractFieldErrors } from "@/lib/validations/materials";
import type { ActionResult } from "@/lib/validations/materials";
import type { Card } from "@/lib/types/materials";
import { SRS_DEFAULTS, CARD_BASED_SLUGS, ACTION_ERRORS } from "@/lib/constants";
import { requireAuth } from "@/lib/actions/auth-utils";
import { toJstDateString } from "@/lib/utils/date";

// Supabase JOIN 結果の型: SDK は joined テーブルを unknown として推論するため名前付き型で上書きする
type JoinedMaterialOwner = { user_id: string };
type JoinedMethodConfig = { slug: string; default_config: Record<string, unknown> | null };

export async function createCard(
  materialId: string,
  formData: FormData,
): Promise<ActionResult<{ id: string }>> {
  const parsed = cardSchema.safeParse({
    front: formData.get("front"),
    back: formData.get("back"),
  });

  if (!parsed.success) {
    return {
      success: false,
      error: ACTION_ERRORS.INVALID_INPUT,
      fieldErrors: extractFieldErrors(parsed.error),
    };
  }

  const { user, supabase } = await requireAuth();

  // RLSに加えてuser_idで絞り込み、他ユーザーの教材への追加を防ぐ
  const { data: material, error: materialError } = await supabase
    .from("materials")
    .select("id")
    .eq("id", materialId)
    .eq("user_id", user.id)
    .single();

  if (materialError || !material)
    return { success: false, error: ACTION_ERRORS.NOT_FOUND("教材") };

  // display_order の決定と INSERT を単一トランザクションで実行し、並行リクエスト時の重複を防ぐ
  const { data: cardId, error: cardError } = await supabase.rpc("create_card_with_order", {
    p_material_id: materialId,
    p_front: parsed.data.front,
    p_back: parsed.data.back,
  });

  if (cardError || !cardId) return { success: false, error: ACTION_ERRORS.CREATE_FAILED("カード") };

  const card = { id: cardId };

  // read-then-write ではなく RPC で原子的に増減し、並行リクエスト時の race condition を防ぐ
  const { error: countError } = await supabase.rpc("increment_total_cards", {
    p_material_id: materialId,
    p_delta: 1,
    p_user_id: user.id,
  });

  if (countError) return { success: false, error: "カード数の更新に失敗しました" };

  // SRS手法が紐付いている場合、初期srs_statesを自動生成する
  // カード作成直後から復習スケジュールが有効になるよう即日due_dateを設定する
  const { data: boundMethods } = await supabase
    .from("material_methods")
    .select("learning_methods!inner(slug, default_config)")
    .eq("material_id", materialId);

  if (boundMethods) {
    const srsMethod = boundMethods.find((mm) => {
      const lm = mm.learning_methods as JoinedMethodConfig;
      return (CARD_BASED_SLUGS as readonly string[]).includes(lm.slug);
    });

    if (srsMethod) {
      const lm = srsMethod.learning_methods as JoinedMethodConfig;
      const config = lm.default_config ?? {};
      const today = toJstDateString(new Date());

      const { error: srsError } = await supabase.from("srs_states").insert({
        card_id: card.id,
        user_id: user.id,
        stability:
          typeof config["initial_stability"] === "number"
            ? config["initial_stability"]
            : SRS_DEFAULTS.stability,
        difficulty:
          typeof config["initial_difficulty"] === "number"
            ? config["initial_difficulty"]
            : SRS_DEFAULTS.difficulty,
        due_date: today,
        reps: 0,
        lapses: 0,
      });

      if (srsError) {
        // カードは作成済みだが SRS 状態が欠落し復習キューに出現しなくなるため、エラー扱いにする
        console.error(`srs_states insert failed for card ${card.id}:`, srsError);
        return { success: false, error: "カードは作成されましたが、SRS初期状態の設定に失敗しました" };
      }
    }
  }

  revalidatePath(`/materials/${materialId}`);
  return { success: true, data: { id: card.id } };
}

export async function getCard(cardId: string): Promise<Card | null> {
  const { user, supabase } = await requireAuth();

  // cards に user_id がないため、materials JOIN で所有権を確認する
  // !inner により他ユーザーのカードは RLS + JOIN で除外される
  const { data } = await supabase
    .from("cards")
    .select("*, materials!inner(user_id)")
    .eq("id", cardId)
    .single();

  if (!data) return null;

  // RLS に加えてアプリレベルでも所有権を確認 (RLS 緩和時の防御)
  const owner = (data.materials as JoinedMaterialOwner).user_id;
  if (owner !== user.id) return null;

  const { materials: _materials, ...card } = data;
  return card as Card;
}

export async function getCards(materialId: string): Promise<Card[]> {
  const { user, supabase } = await requireAuth();

  // 所有権の確認と同時にカード一覧を取得する（2クエリを1クエリに統合できないためJOINで代替）
  const { data: material } = await supabase
    .from("materials")
    .select("id")
    .eq("id", materialId)
    .eq("user_id", user.id)
    .single();

  if (!material) return [];

  const { data } = await supabase
    .from("cards")
    .select("*")
    .eq("material_id", materialId)
    .order("display_order", { ascending: true });

  return data ?? [];
}

export async function updateCard(
  id: string,
  formData: FormData,
): Promise<ActionResult<undefined>> {
  const parsed = cardSchema.safeParse({
    front: formData.get("front"),
    back: formData.get("back"),
  });

  if (!parsed.success) {
    return {
      success: false,
      error: ACTION_ERRORS.INVALID_INPUT,
      fieldErrors: extractFieldErrors(parsed.error),
    };
  }

  const { user, supabase } = await requireAuth();

  // cardsにuser_idがないため、materials JOINで所有権を確認する
  const { data: cardRow } = await supabase
    .from("cards")
    .select("id, material_id, materials!inner(user_id)")
    .eq("id", id)
    .single();

  if (!cardRow) return { success: false, error: ACTION_ERRORS.NOT_FOUND("カード") };

  const materialOwner = (cardRow.materials as JoinedMaterialOwner).user_id;
  if (materialOwner !== user.id) return { success: false, error: ACTION_ERRORS.PERMISSION_DENIED };

  const { error } = await supabase
    .from("cards")
    .update({ front: parsed.data.front, back: parsed.data.back })
    .eq("id", id);

  if (error) return { success: false, error: ACTION_ERRORS.UPDATE_FAILED("カード") };

  revalidatePath(`/materials/${cardRow.material_id}`);
  return { success: true, data: undefined };
}

export async function deleteCard(id: string): Promise<ActionResult<undefined>> {
  const { user, supabase } = await requireAuth();

  // cardsにuser_idがないため、materials JOINで所有権を確認する
  // total_cards は RPC で原子的に更新するため SELECT 不要
  const { data: cardRow } = await supabase
    .from("cards")
    .select("id, material_id, materials!inner(user_id)")
    .eq("id", id)
    .single();

  if (!cardRow) return { success: false, error: ACTION_ERRORS.NOT_FOUND("カード") };

  const mat = cardRow.materials as JoinedMaterialOwner;
  if (mat.user_id !== user.id) return { success: false, error: ACTION_ERRORS.PERMISSION_DENIED };

  // srs_statesとcard_reviewsはCASCADEで自動削除される
  const { error: deleteError } = await supabase
    .from("cards")
    .delete()
    .eq("id", id);

  if (deleteError) return { success: false, error: ACTION_ERRORS.DELETE_FAILED("カード") };

  // read-then-write ではなく RPC で原子的に増減し、並行リクエスト時の race condition を防ぐ
  // GREATEST(0, ...) により負数にはならない
  const { error: countError } = await supabase.rpc("increment_total_cards", {
    p_material_id: cardRow.material_id,
    p_delta: -1,
    p_user_id: user.id,
  });

  if (countError) return { success: false, error: "カード数の更新に失敗しました" };

  revalidatePath(`/materials/${cardRow.material_id}`);
  return { success: true, data: undefined };
}
