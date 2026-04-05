"use server";

import { createClient } from "@/lib/supabase/server";
import type { DueMaterial } from "@/lib/types/sessions";

export async function getDueMaterials(): Promise<DueMaterial[]> {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return [];

  // SRS 手法が紐付いている教材を取得
  const { data: materials } = await supabase
    .from("materials")
    .select(`
      id, title,
      subjects!inner(id, name, color),
      material_methods!inner(
        learning_methods!inner(id, slug)
      )
    `)
    .eq("user_id", user.id);

  if (!materials || materials.length === 0) return [];

  // SRS 手法を持つ教材のみ抽出
  const srsMaterials: Array<{
    id: string;
    title: string;
    subject: { id: string; name: string; color: string };
    srs_method_id: string;
  }> = [];

  for (const m of materials) {
    const methods = m.material_methods as unknown as Array<{
      learning_methods: { id: string; slug: string };
    }>;
    const srsMethod = methods.find((mm) => mm.learning_methods.slug === "srs");
    if (srsMethod) {
      srsMaterials.push({
        id: m.id,
        title: m.title,
        subject: m.subjects as unknown as { id: string; name: string; color: string },
        srs_method_id: srsMethod.learning_methods.id,
      });
    }
  }

  if (srsMaterials.length === 0) return [];

  // due_count 集計: srs_state なし (新規) or due_date <= today なら due
  const materialIds = srsMaterials.map((m) => m.id);
  const today = new Date().toISOString().split("T")[0];

  const { data: allCards } = await supabase
    .from("cards")
    .select("id, material_id")
    .in("material_id", materialIds);

  if (!allCards || allCards.length === 0) return [];

  // due_date が明日以降のカード (= 今日は due でない) を取得
  const cardIds = allCards.map((c) => c.id);
  const { data: notDueStates } = await supabase
    .from("srs_states")
    .select("card_id")
    .eq("user_id", user.id)
    .gt("due_date", today)
    .in("card_id", cardIds);

  const notDueCardIds = new Set((notDueStates ?? []).map((s) => s.card_id));

  // due_count = 全カード - not due カード
  const dueCountMap = new Map<string, number>();
  for (const card of allCards) {
    if (!notDueCardIds.has(card.id)) {
      dueCountMap.set(card.material_id, (dueCountMap.get(card.material_id) ?? 0) + 1);
    }
  }

  return srsMaterials
    .map((m) => ({ ...m, due_count: dueCountMap.get(m.id) ?? 0 }))
    .filter((m) => m.due_count > 0);
}
