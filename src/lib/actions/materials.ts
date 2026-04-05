"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import {
  createMaterialSchema,
  updateMaterialSchema,
  extractFieldErrors,
} from "@/lib/validations/materials";
import type { ActionResult } from "@/lib/validations/materials";
import type { MaterialWithMethods, MaterialDetail } from "@/lib/types/materials";

export async function createMaterial(
  formData: FormData,
): Promise<ActionResult<{ id: string }>> {
  const parsed = createMaterialSchema.safeParse({
    title: formData.get("title"),
    description: formData.get("description") || undefined,
    subject_id: formData.get("subject_id"),
    // JSON文字列をパース。クライアントからは配列をJSON化して送る
    method_ids: JSON.parse((formData.get("method_ids") as string) ?? "[]") as unknown,
  });

  if (!parsed.success) {
    return {
      success: false,
      error: "入力内容を確認してください",
      fieldErrors: extractFieldErrors(parsed.error),
    };
  }

  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { success: false, error: "認証が必要です" };

  // 教材を先に作成し、IDを取得してから material_methods を挿入する
  const { data: material, error: materialError } = await supabase
    .from("materials")
    .insert({
      title: parsed.data.title,
      description: parsed.data.description ?? null,
      subject_id: parsed.data.subject_id,
      user_id: user.id,
    })
    .select("id")
    .single();

  if (materialError) return { success: false, error: "教材の作成に失敗しました" };

  const methodRows = parsed.data.method_ids.map((methodId) => ({
    material_id: material.id,
    method_id: methodId,
  }));

  const { error: mmError } = await supabase
    .from("material_methods")
    .insert(methodRows);

  if (mmError) {
    // material_methods の挿入失敗時は孤立を防ぐため教材ごと削除する
    await supabase.from("materials").delete().eq("id", material.id);
    return { success: false, error: "学習手法の紐付けに失敗しました" };
  }

  revalidatePath("/materials");
  return { success: true, data: { id: material.id } };
}

export async function getMaterials(
  options?: { subjectId?: string; search?: string },
): Promise<MaterialWithMethods[]> {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return [];

  let query = supabase
    .from("materials")
    .select(`
      id, title, description, subject_id, total_cards, created_at,
      subjects!inner(id, name, color),
      material_methods(
        learning_methods(id, slug, name, category)
      )
    `)
    .eq("user_id", user.id)
    .order("created_at", { ascending: false });

  if (options?.subjectId) {
    query = query.eq("subject_id", options.subjectId);
  }
  if (options?.search) {
    query = query.ilike("title", `%${options.search}%`);
  }

  const { data } = await query;
  if (!data) return [];

  // due_count を srs_states から集計。cards テーブルを経由して material_id に紐付ける
  const materialIds = data.map((m) => m.id);
  const today = new Date().toISOString().split("T")[0];

  const { data: dueCounts } = await supabase
    .from("srs_states")
    .select("card_id, cards!inner(material_id)")
    .eq("user_id", user.id)
    .lte("due_date", today)
    .in("cards.material_id", materialIds);

  const dueMap = new Map<string, number>();
  if (dueCounts) {
    for (const row of dueCounts) {
      const materialId = (row.cards as unknown as { material_id: string })
        .material_id;
      dueMap.set(materialId, (dueMap.get(materialId) ?? 0) + 1);
    }
  }

  return data.map((m) => ({
    id: m.id,
    title: m.title,
    description: m.description,
    subject_id: m.subject_id,
    subject: m.subjects as unknown as { id: string; name: string; color: string },
    total_cards: m.total_cards,
    due_count: dueMap.get(m.id) ?? 0,
    methods: (m.material_methods ?? []).map((mm: Record<string, unknown>) => {
      const lm = mm.learning_methods as {
        id: string;
        slug: string;
        name: string;
        category: string;
      };
      return { id: lm.id, slug: lm.slug, name: lm.name, category: lm.category };
    }),
    created_at: m.created_at,
  }));
}

export async function getMaterial(id: string): Promise<MaterialDetail | null> {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return null;

  const { data: material } = await supabase
    .from("materials")
    .select(`
      id, title, description, subject_id, total_cards, created_at,
      subjects!inner(id, name, color),
      material_methods(
        learning_methods(id, slug, name, category)
      )
    `)
    .eq("id", id)
    .eq("user_id", user.id)
    .single();

  if (!material) return null;

  // due_count: 当日以前に期限を迎えたカードを集計する
  const today = new Date().toISOString().split("T")[0];
  const cardIds =
    (await supabase.from("cards").select("id").eq("material_id", id)).data?.map(
      (c) => c.id,
    ) ?? [];

  let dueCount = 0;
  if (cardIds.length > 0) {
    const { count } = await supabase
      .from("srs_states")
      .select("id", { count: "exact", head: true })
      .eq("user_id", user.id)
      .lte("due_date", today)
      .in("card_id", cardIds);
    dueCount = count ?? 0;
  }

  // 直近5件のセッションを取得し、詳細ページで学習履歴として表示する
  const { data: sessions } = await supabase
    .from("sessions")
    .select(`
      id, duration_sec, self_rating, started_at,
      learning_methods(slug, name)
    `)
    .eq("material_id", id)
    .eq("user_id", user.id)
    .order("started_at", { ascending: false })
    .limit(5);

  // accuracy_rate: rating >= 3 を正解として全レビューに対する割合を算出する
  let accuracyRate: number | null = null;
  if (cardIds.length > 0) {
    const { count: totalReviews } = await supabase
      .from("card_reviews")
      .select("id", { count: "exact", head: true })
      .in("card_id", cardIds);

    if (totalReviews && totalReviews > 0) {
      const { count: correctReviews } = await supabase
        .from("card_reviews")
        .select("id", { count: "exact", head: true })
        .in("card_id", cardIds)
        .gte("rating", 3);
      accuracyRate = (correctReviews ?? 0) / totalReviews;
    }
  }

  return {
    id: material.id,
    title: material.title,
    description: material.description,
    subject_id: material.subject_id,
    subject: material.subjects as unknown as {
      id: string;
      name: string;
      color: string;
    },
    total_cards: material.total_cards,
    due_count: dueCount,
    methods: (material.material_methods ?? []).map(
      (mm: Record<string, unknown>) => {
        const lm = mm.learning_methods as {
          id: string;
          slug: string;
          name: string;
          category: string;
        };
        return { id: lm.id, slug: lm.slug, name: lm.name, category: lm.category };
      },
    ),
    created_at: material.created_at,
    recent_sessions: (sessions ?? []).map((s) => ({
      id: s.id,
      method: s.learning_methods as unknown as { slug: string; name: string },
      duration_sec: s.duration_sec,
      self_rating: s.self_rating,
      started_at: s.started_at,
    })),
    accuracy_rate: accuracyRate,
  };
}

export async function updateMaterial(
  id: string,
  formData: FormData,
): Promise<ActionResult<undefined>> {
  const parsed = updateMaterialSchema.safeParse({
    title: formData.get("title"),
    description: formData.get("description") || undefined,
    subject_id: formData.get("subject_id"),
  });

  if (!parsed.success) {
    return {
      success: false,
      error: "入力内容を確認してください",
      fieldErrors: extractFieldErrors(parsed.error),
    };
  }

  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { success: false, error: "認証が必要です" };

  const { error } = await supabase
    .from("materials")
    .update({
      title: parsed.data.title,
      description: parsed.data.description ?? null,
      subject_id: parsed.data.subject_id,
    })
    .eq("id", id)
    .eq("user_id", user.id);

  if (error) return { success: false, error: "教材の更新に失敗しました" };

  // 詳細ページと一覧ページのキャッシュを両方無効化する
  revalidatePath(`/materials/${id}`);
  revalidatePath("/materials");
  return { success: true, data: undefined };
}

export async function deleteMaterial(id: string): Promise<ActionResult<undefined>> {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { success: false, error: "認証が必要です" };

  const { error } = await supabase
    .from("materials")
    .delete()
    .eq("id", id)
    .eq("user_id", user.id);

  if (error) return { success: false, error: "教材の削除に失敗しました" };

  revalidatePath("/materials");
  return { success: true, data: undefined };
}
