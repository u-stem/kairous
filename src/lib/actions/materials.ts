"use server";

import { revalidatePath } from "next/cache";
import {
  createMaterialSchema,
  updateMaterialSchema,
  extractFieldErrors,
} from "@/lib/validations/materials";
import type { ActionResult } from "@/lib/validations/materials";
import type { MaterialWithMethods, MaterialDetail } from "@/lib/types/materials";
import { ACTION_ERRORS } from "@/lib/constants";
import { requireAuth } from "@/lib/actions/auth-utils";
import { toJstDateString } from "@/lib/utils/date";

// Supabase JOIN 結果の型: SDK は joined テーブルを unknown として推論するため名前付き型で上書きする
type JoinedSubject = { id: string; name: string; color: string };
type JoinedLearningMethod = { id: string; slug: string; name: string; category: string };
type JoinedCardMaterialId = { material_id: string };
type JoinedMethodSlugName = { slug: string; name: string };

export async function createMaterial(
  formData: FormData,
): Promise<ActionResult<{ id: string }>> {
  const parsed = createMaterialSchema.safeParse({
    title: formData.get("title"),
    description: formData.get("description") || undefined,
    subject_id: formData.get("subject_id"),
    // JSON文字列をパース。クライアントからは配列をJSON化して送る。改ざん対策で try-catch する
    method_ids: (() => {
      try {
        return JSON.parse((formData.get("method_ids") as string) ?? "[]") as unknown;
      } catch {
        return [];
      }
    })(),
  });

  if (!parsed.success) {
    return {
      success: false,
      error: ACTION_ERRORS.INVALID_INPUT,
      fieldErrors: extractFieldErrors(parsed.error),
    };
  }

  const { user, supabase } = await requireAuth();

  // material_methods が material_id FK を必要とするため、教材を先に作成する
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

  if (materialError) return { success: false, error: ACTION_ERRORS.CREATE_FAILED("教材") };

  const methodRows = parsed.data.method_ids.map((methodId) => ({
    material_id: material.id,
    method_id: methodId,
  }));

  const { error: mmError } = await supabase
    .from("material_methods")
    .insert(methodRows);

  if (mmError) {
    // material_methods の挿入失敗時は孤立を防ぐため教材ごと削除する
    const { error: rollbackError } = await supabase.from("materials").delete().eq("id", material.id);
    if (rollbackError) {
      console.error(`Orphan material cleanup failed for ${material.id}:`, rollbackError.message);
    }
    return { success: false, error: "学習手法の紐付けに失敗しました" };
  }

  revalidatePath("/materials");
  return { success: true, data: { id: material.id } };
}

export async function getMaterials(
  options?: { subjectId?: string; search?: string },
): Promise<MaterialWithMethods[]> {
  const { user, supabase } = await requireAuth();

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
    // LIKE メタ文字（%, _, \）をエスケープし、意図しないパターンマッチを防ぐ
    const escaped = options.search.replace(/[%_\\]/g, "\\$&");
    query = query.ilike("title", `%${escaped}%`);
  }

  const { data, error } = await query;
  if (error) throw new Error(`getMaterials failed: ${error.message}`);
  if (!data) return [];

  // 一覧画面で復習が必要なカード数を表示し、学習優先度を判断できるようにする
  const materialIds = data.map((m) => m.id);
  const dueMap = new Map<string, number>();

  // 空配列での .in() は PostgreSQL シンタックスエラーになるためガードする
  if (materialIds.length > 0) {
    const today = toJstDateString(new Date());

    const { data: dueCounts } = await supabase
      .from("srs_states")
      .select("card_id, cards!inner(material_id)")
      .eq("user_id", user.id)
      .lte("due_date", today)
      .in("cards.material_id", materialIds);

    if (dueCounts) {
      for (const row of dueCounts) {
        const materialId = (row.cards as JoinedCardMaterialId).material_id;
        dueMap.set(materialId, (dueMap.get(materialId) ?? 0) + 1);
      }
    }
  }

  // 一覧カードの副題に最終学習日時を表示するため、各教材の最新セッションを取得する
  // 各教材につき最新1件のみ必要だが、Supabase は DISTINCT ON 未対応のため上限で制御する
  const lastStudiedMap = new Map<string, string>();
  if (materialIds.length > 0) {
    const { data: sessions } = await supabase
      .from("sessions")
      .select("material_id, started_at")
      .eq("user_id", user.id)
      .eq("status", "completed")
      .in("material_id", materialIds)
      .order("started_at", { ascending: false })
      .limit(materialIds.length * 5);

    if (sessions) {
      for (const s of sessions) {
        if (s.material_id && !lastStudiedMap.has(s.material_id)) {
          lastStudiedMap.set(s.material_id, s.started_at);
        }
      }
    }
  }

  return data.map((m) => ({
    id: m.id,
    title: m.title,
    description: m.description,
    subject_id: m.subject_id,
    subject: m.subjects as JoinedSubject,
    total_cards: m.total_cards,
    due_count: dueMap.get(m.id) ?? 0,
    methods: (m.material_methods ?? []).map((mm: Record<string, unknown>) => {
      const lm = mm.learning_methods as JoinedLearningMethod;
      return { id: lm.id, slug: lm.slug, name: lm.name, category: lm.category };
    }),
    last_studied_at: lastStudiedMap.get(m.id) ?? null,
    created_at: m.created_at,
  }));
}

export async function getMaterial(id: string): Promise<MaterialDetail | null> {
  const { user, supabase } = await requireAuth();

  const { data: material, error } = await supabase
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

  if (error) throw new Error(`getMaterial failed: ${error.message}`);
  if (!material) return null;

  // 詳細ページで復習が必要なカード数を表示し、セッション開始の判断材料にする
  const today = toJstDateString(new Date());
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

  // 学習パターンの振り返りに使うため、直近セッション履歴を取得する
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

  // FSRS の Good(3)/Easy(4) を正解とし、教材全体の理解度を数値化する
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
    subject: material.subjects as JoinedSubject,
    total_cards: material.total_cards,
    due_count: dueCount,
    methods: (material.material_methods ?? []).map(
      (mm: Record<string, unknown>) => {
        const lm = mm.learning_methods as JoinedLearningMethod;
        return { id: lm.id, slug: lm.slug, name: lm.name, category: lm.category };
      },
    ),
    last_studied_at: sessions?.[0]?.started_at ?? null,
    created_at: material.created_at,
    recent_sessions: (sessions ?? []).map((s) => ({
      id: s.id,
      method: s.learning_methods as JoinedMethodSlugName,
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
      error: ACTION_ERRORS.INVALID_INPUT,
      fieldErrors: extractFieldErrors(parsed.error),
    };
  }

  const { user, supabase } = await requireAuth();

  const { error } = await supabase
    .from("materials")
    .update({
      title: parsed.data.title,
      description: parsed.data.description ?? null,
      subject_id: parsed.data.subject_id,
    })
    .eq("id", id)
    .eq("user_id", user.id);

  if (error) return { success: false, error: ACTION_ERRORS.UPDATE_FAILED("教材") };

  // 更新後のデータを即座に反映するため、関連する全ページのキャッシュを無効化する
  revalidatePath(`/materials/${id}`);
  revalidatePath("/materials");
  return { success: true, data: undefined };
}

export async function deleteMaterial(id: string): Promise<ActionResult<undefined>> {
  const { user, supabase } = await requireAuth();

  const { error } = await supabase
    .from("materials")
    .delete()
    .eq("id", id)
    .eq("user_id", user.id);

  if (error) return { success: false, error: ACTION_ERRORS.DELETE_FAILED("教材") };

  revalidatePath("/materials");
  return { success: true, data: undefined };
}
