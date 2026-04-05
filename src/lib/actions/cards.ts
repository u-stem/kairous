"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { cardSchema } from "@/lib/validations/materials";
import type { ActionResult } from "@/lib/validations/materials";
import type { Card } from "@/lib/types/materials";
import { SRS_DEFAULTS, CARD_BASED_SLUGS } from "@/lib/constants";

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
      error: "入力内容を確認してください",
      fieldErrors: parsed.error.flatten().fieldErrors,
    };
  }

  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { success: false, error: "認証が必要です" };

  // RLSに加えてuser_idで絞り込み、他ユーザーの教材への追加を防ぐ
  const { data: material, error: materialError } = await supabase
    .from("materials")
    .select("id, total_cards")
    .eq("id", materialId)
    .eq("user_id", user.id)
    .single();

  if (materialError || !material)
    return { success: false, error: "教材が見つかりません" };

  const { data: card, error: cardError } = await supabase
    .from("cards")
    .insert({
      material_id: materialId,
      front: parsed.data.front,
      back: parsed.data.back,
      // 挿入時点のtotal_cardsを末尾インデックスとして使用する
      display_order: material.total_cards,
    })
    .select("id")
    .single();

  if (cardError || !card) return { success: false, error: "カードの作成に失敗しました" };

  const { error: countError } = await supabase
    .from("materials")
    .update({ total_cards: material.total_cards + 1 })
    .eq("id", materialId);

  if (countError) return { success: false, error: "カード数の更新に失敗しました" };

  // SRS手法が紐付いている場合、初期srs_statesを自動生成する
  // カード作成直後から復習スケジュールが有効になるよう即日due_dateを設定する
  const { data: boundMethods } = await supabase
    .from("material_methods")
    .select("learning_methods!inner(slug, default_config)")
    .eq("material_id", materialId);

  if (boundMethods) {
    const srsMethod = boundMethods.find((mm) => {
      const lm = mm.learning_methods as unknown as {
        slug: string;
        default_config: Record<string, unknown> | null;
      };
      return (CARD_BASED_SLUGS as readonly string[]).includes(lm.slug);
    });

    if (srsMethod) {
      const lm = srsMethod.learning_methods as unknown as {
        slug: string;
        default_config: Record<string, unknown> | null;
      };
      const config = lm.default_config ?? {};
      const today = new Date().toISOString().split("T")[0];

      await supabase.from("srs_states").insert({
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
    }
  }

  revalidatePath(`/materials/${materialId}`);
  return { success: true, data: { id: card.id } };
}

export async function getCards(materialId: string): Promise<Card[]> {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return [];

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
      error: "入力内容を確認してください",
      fieldErrors: parsed.error.flatten().fieldErrors,
    };
  }

  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { success: false, error: "認証が必要です" };

  // cardsにuser_idがないため、materials JOINで所有権を確認する
  const { data: cardRow } = await supabase
    .from("cards")
    .select("id, material_id, materials!inner(user_id)")
    .eq("id", id)
    .single();

  if (!cardRow) return { success: false, error: "カードが見つかりません" };

  const materialOwner = (
    cardRow.materials as unknown as { user_id: string }
  ).user_id;
  if (materialOwner !== user.id) return { success: false, error: "権限がありません" };

  const { error } = await supabase
    .from("cards")
    .update({ front: parsed.data.front, back: parsed.data.back })
    .eq("id", id);

  if (error) return { success: false, error: "カードの更新に失敗しました" };

  revalidatePath(`/materials/${cardRow.material_id}`);
  return { success: true, data: undefined };
}

export async function deleteCard(id: string): Promise<ActionResult<undefined>> {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { success: false, error: "認証が必要です" };

  // cardsにuser_idがないため、materials JOINで所有権を確認する
  const { data: cardRow } = await supabase
    .from("cards")
    .select("id, material_id, materials!inner(user_id, total_cards)")
    .eq("id", id)
    .single();

  if (!cardRow) return { success: false, error: "カードが見つかりません" };

  const mat = cardRow.materials as unknown as {
    user_id: string;
    total_cards: number;
  };
  if (mat.user_id !== user.id) return { success: false, error: "権限がありません" };

  // srs_statesとcard_reviewsはCASCADEで自動削除される
  const { error: deleteError } = await supabase
    .from("cards")
    .delete()
    .eq("id", id);

  if (deleteError) return { success: false, error: "カードの削除に失敗しました" };

  // total_cardsが負にならないようにguardを設ける
  const { error: countError } = await supabase
    .from("materials")
    .update({ total_cards: Math.max(0, mat.total_cards - 1) })
    .eq("id", cardRow.material_id);

  if (countError) return { success: false, error: "カード数の更新に失敗しました" };

  revalidatePath(`/materials/${cardRow.material_id}`);
  return { success: true, data: undefined };
}
