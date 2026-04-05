"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import {
  createSessionSchema,
  completeSessionSchema,
  createRestSessionSchema,
  extractFieldErrors,
} from "@/lib/validations/sessions";
import type { ActionResult } from "@/lib/validations/materials";
import type { CardReview, DueMaterial, SessionCard, SessionDetail } from "@/lib/types/sessions";
import { SESSION_MAX_CARDS, REST_DURATION_SEC } from "@/lib/constants";

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

export async function createSession(
  materialId: string,
  methodId: string,
): Promise<ActionResult<{ id: string }>> {
  const parsed = createSessionSchema.safeParse({ materialId, methodId });
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

  // 教材の所有権確認
  const { data: material } = await supabase
    .from("materials")
    .select("id")
    .eq("id", parsed.data.materialId)
    .eq("user_id", user.id)
    .single();

  if (!material) return { success: false, error: "教材が見つかりません" };

  const { data: session, error } = await supabase
    .from("sessions")
    .insert({
      material_id: parsed.data.materialId,
      method_id: parsed.data.methodId,
      user_id: user.id,
      status: "in_progress",
    })
    .select("id")
    .single();

  if (error) return { success: false, error: "セッションの作成に失敗しました" };

  return { success: true, data: { id: session.id } };
}

export async function getSessionCards(sessionId: string): Promise<SessionCard[]> {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return [];

  // セッションの所有権確認 + material_id 取得
  const { data: session } = await supabase
    .from("sessions")
    .select("material_id")
    .eq("id", sessionId)
    .eq("user_id", user.id)
    .single();

  if (!session?.material_id) return [];

  const today = new Date().toISOString().split("T")[0];

  const { data: allCards } = await supabase
    .from("cards")
    .select("id, front, back, display_order")
    .eq("material_id", session.material_id)
    .order("display_order");

  if (!allCards || allCards.length === 0) return [];

  // due_date が明日以降のカードを除外
  const cardIds = allCards.map((c) => c.id);
  const { data: notDueStates } = await supabase
    .from("srs_states")
    .select("card_id")
    .eq("user_id", user.id)
    .gt("due_date", today)
    .in("card_id", cardIds);

  const notDueCardIds = new Set((notDueStates ?? []).map((s) => s.card_id));

  return allCards
    .filter((c) => !notDueCardIds.has(c.id))
    .slice(0, SESSION_MAX_CARDS);
}

export async function completeSession(
  sessionId: string,
  reviews: CardReview[],
  selfRating: number,
): Promise<ActionResult<undefined>> {
  const parsed = completeSessionSchema.safeParse({ sessionId, reviews, selfRating });
  if (!parsed.success) {
    return { success: false, error: "入力内容を確認してください" };
  }

  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { success: false, error: "認証が必要です" };

  // セッションの所有権 + status 確認
  const { data: session } = await supabase
    .from("sessions")
    .select("id, started_at, status")
    .eq("id", parsed.data.sessionId)
    .eq("user_id", user.id)
    .single();

  if (!session) return { success: false, error: "セッションが見つかりません" };
  if (session.status !== "in_progress") {
    return { success: false, error: "このセッションは既に完了しています" };
  }

  const now = new Date();
  const durationSec = Math.floor(
    (now.getTime() - new Date(session.started_at).getTime()) / 1000,
  );

  const { error: updateError } = await supabase
    .from("sessions")
    .update({
      status: "completed",
      duration_sec: durationSec,
      self_rating: parsed.data.selfRating,
      ended_at: now.toISOString(),
    })
    .eq("id", parsed.data.sessionId);

  if (updateError) return { success: false, error: "セッションの更新に失敗しました" };

  // Edge Function で card_reviews INSERT + FSRS 計算 + daily_logs upsert
  const fnResult = await supabase.functions.invoke("complete-session", {
    body: {
      session_id: parsed.data.sessionId,
      reviews: parsed.data.reviews,
    },
  });

  if (fnResult.error) {
    return { success: false, error: "カードレビューの処理に失敗しました" };
  }

  revalidatePath("/");
  return { success: true, data: undefined };
}

export async function getSession(sessionId: string): Promise<SessionDetail | null> {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return null;

  const { data: session } = await supabase
    .from("sessions")
    .select(`
      id, method_id, status, duration_sec, self_rating, started_at, ended_at,
      materials(id, title, subjects(name)),
      learning_methods(slug, name)
    `)
    .eq("id", sessionId)
    .eq("user_id", user.id)
    .single();

  if (!session) return null;

  const { data: reviews } = await supabase
    .from("card_reviews")
    .select("card_id, rating, response_ms, cards(front, back)")
    .eq("session_id", sessionId);

  // 残りの due カード数を算出
  let remainingDueCount = 0;
  const mat = session.materials as unknown as {
    id: string;
    title: string;
    subjects: { name: string };
  } | null;

  if (mat) {
    const today = new Date().toISOString().split("T")[0];

    const { data: allCards } = await supabase
      .from("cards")
      .select("id")
      .eq("material_id", mat.id);

    if (allCards && allCards.length > 0) {
      const cardIds = allCards.map((c: { id: string }) => c.id);
      const { data: notDueStates } = await supabase
        .from("srs_states")
        .select("card_id")
        .eq("user_id", user.id)
        .gt("due_date", today)
        .in("card_id", cardIds);

      const notDueCardIds = new Set(
        (notDueStates ?? []).map((s: { card_id: string }) => s.card_id),
      );
      const reviewedCardIds = new Set(
        (reviews ?? []).map((r: { card_id: string }) => r.card_id),
      );
      remainingDueCount = allCards.filter(
        (c: { id: string }) => !notDueCardIds.has(c.id) && !reviewedCardIds.has(c.id),
      ).length;
    }
  }

  const method = session.learning_methods as unknown as { slug: string; name: string };

  return {
    id: session.id,
    material: mat
      ? { id: mat.id, title: mat.title, subject: { name: mat.subjects.name } }
      : null,
    method,
    method_id: session.method_id,
    status: session.status as "in_progress" | "completed" | "abandoned",
    duration_sec: session.duration_sec,
    self_rating: session.self_rating as 1 | 2 | 3 | 4 | null,
    started_at: session.started_at,
    ended_at: session.ended_at,
    card_reviews: (reviews ?? []).map((r: {
      card_id: string;
      rating: number;
      response_ms: number;
      cards: unknown;
    }) => ({
      card_id: r.card_id,
      rating: r.rating,
      response_ms: r.response_ms,
      card: r.cards as { front: string; back: string },
    })),
    remaining_due_count: remainingDueCount,
  };
}

export async function createRestSession(
  parentSessionId: string,
): Promise<ActionResult<{ id: string }>> {
  const parsed = createRestSessionSchema.safeParse({ parentSessionId });
  if (!parsed.success) {
    return { success: false, error: "入力内容を確認してください" };
  }

  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { success: false, error: "認証が必要です" };

  // 親セッションの所有権確認
  const { data: parentSession } = await supabase
    .from("sessions")
    .select("id")
    .eq("id", parsed.data.parentSessionId)
    .eq("user_id", user.id)
    .single();

  if (!parentSession) return { success: false, error: "セッションが見つかりません" };

  // wakeful_rest の method_id を取得
  const { data: restMethod } = await supabase
    .from("learning_methods")
    .select("id")
    .eq("slug", "wakeful_rest")
    .single();

  if (!restMethod) return { success: false, error: "安静タイマー手法が見つかりません" };

  const { data: session, error } = await supabase
    .from("sessions")
    .insert({
      user_id: user.id,
      method_id: restMethod.id,
      status: "in_progress",
      meta: { parent_session_id: parsed.data.parentSessionId },
    })
    .select("id")
    .single();

  if (error) return { success: false, error: "安静セッションの作成に失敗しました" };

  return { success: true, data: { id: session.id } };
}

export async function completeRestSession(
  sessionId: string,
): Promise<ActionResult<undefined>> {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { success: false, error: "認証が必要です" };

  const { error } = await supabase
    .from("sessions")
    .update({
      status: "completed",
      duration_sec: REST_DURATION_SEC,
      ended_at: new Date().toISOString(),
    })
    .eq("id", sessionId)
    .eq("user_id", user.id)
    .eq("status", "in_progress");

  if (error) return { success: false, error: "セッションの完了に失敗しました" };

  revalidatePath("/");
  return { success: true, data: undefined };
}
