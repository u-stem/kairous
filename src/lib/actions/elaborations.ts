"use server";

import { requireAuth } from "@/lib/actions/auth-utils";

// Supabase JOIN 結果の型: SDK は joined テーブルを unknown として推論するため名前付き型で上書きする
type JoinedCard = { front: string; material_id: string };

export type MaterialElaboration = {
  id: string;
  card_id: string;
  card_front: string;
  elaboration_text: string;
  created_at: string;
};

// 教材に属する全カードの elaboration を時系列降順で取得する
export async function getMaterialElaborations(
  materialId: string,
): Promise<MaterialElaboration[]> {
  const { user, supabase } = await requireAuth();

  const { data, error } = await supabase
    .from("card_elaborations")
    .select(
      "id, card_id, elaboration_text, created_at, cards!inner(front, material_id)",
    )
    .eq("user_id", user.id)
    .eq("cards.material_id", materialId)
    .order("created_at", { ascending: false });

  if (error) throw new Error(`getMaterialElaborations failed: ${error.message}`);

  return (data ?? []).map((row) => ({
    id: row.id,
    card_id: row.card_id,
    card_front: (row.cards as unknown as JoinedCard)?.front ?? "",
    elaboration_text: row.elaboration_text,
    created_at: row.created_at,
  }));
}
