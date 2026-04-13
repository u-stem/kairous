"use server";

import { requireAuth } from "@/lib/actions/auth-utils";
import type { DueMaterial, SessionCard, InterleavingCard, SessionDetail } from "@/lib/types/sessions";
import { SESSION_MAX_CARDS } from "@/lib/constants";
import { toJstDateString } from "@/lib/utils/date";

// RPC 戻り値の行型: database.ts の自動生成型と同期する。IDE の型推論補助のため明示的に定義する
type DueMaterialRow = {
  due_count: number;
  material_id: string;
  method_id: string;
  method_name: string;
  method_slug: string;
  subject_color: string;
  subject_id: string;
  subject_name: string;
  title: string;
};
type InterleavingCardRow = {
  back: string;
  card_id: string;
  display_order: number;
  front: string;
  material_title: string;
};

// Supabase JOIN 結果の型: SDK は joined テーブルを unknown として推論するため名前付き型で上書きする
type JoinedMethod = { slug: string };
type JoinedMethodWithName = { slug: string; name: string };
type JoinedMethodWithDetails = { slug: string; name: string; default_duration_sec: number | null };
type JoinedMaterial = { id: string; title: string; subjects: { name: string } };
type JoinedMaterialTitle = { title: string };

export type SessionInfo = {
  id: string;
  methodSlug: string;
  materialId: string | null;
  methodName: string;
  materialTitle: string | null;
  defaultDurationSec: number | null;
};

export async function getSessionInfo(sessionId: string): Promise<SessionInfo | null> {
  const { user, supabase } = await requireAuth();

  const { data: session } = await supabase
    .from("sessions")
    .select("id, material_id, learning_methods(slug, name, default_duration_sec), materials(title)")
    .eq("id", sessionId)
    .eq("user_id", user.id)
    .eq("status", "in_progress")
    .single();

  if (!session) return null;

  const method = session.learning_methods as JoinedMethodWithDetails | null;

  // method が null になるのは learning_methods が削除された孤立データのみ
  // notFound() でハンドルするため、呼び出し元に null を返す
  if (!method?.slug) return null;

  const materialData = session.materials as { title: string } | null;

  return {
    id: session.id,
    methodSlug: method.slug,
    materialId: session.material_id,
    methodName: method.name,
    materialTitle: materialData?.title ?? null,
    defaultDurationSec: method.default_duration_sec ?? null,
  };
}

export type TodaySession = {
  id: string;
  methodName: string;
  materialTitle: string | null;
  durationSec: number;
  startedAt: string;
};

type JoinedMethodName = { name: string };

export async function getTodaySessions(): Promise<TodaySession[]> {
  const { user, supabase } = await requireAuth();
  const today = toJstDateString(new Date());

  // JST の翌日0時を上限にして当日分のみに限定する
  const tomorrow = toJstDateString(new Date(Date.now() + 24 * 60 * 60 * 1000));

  const { data, error } = await supabase
    .from("sessions")
    .select("id, duration_sec, started_at, learning_methods(name), materials(title)")
    .eq("user_id", user.id)
    .eq("status", "completed")
    .gte("started_at", `${today}T00:00:00+09:00`)
    .lt("started_at", `${tomorrow}T00:00:00+09:00`)
    .order("started_at", { ascending: false });

  if (error || !data) return [];

  return data.map((s: {
    id: string;
    duration_sec: number;
    started_at: string;
    learning_methods: unknown;
    materials: unknown;
  }) => ({
    id: s.id,
    methodName: (s.learning_methods as JoinedMethodName | null)?.name ?? "---",
    materialTitle: (s.materials as JoinedMaterialTitle | null)?.title ?? null,
    durationSec: s.duration_sec,
    startedAt: s.started_at,
  }));
}

export async function getDueMaterials(): Promise<DueMaterial[]> {
  const { user, supabase } = await requireAuth();

  // N+1 回避: materials→cards→srs_states の3クエリを RPC で1クエリに集約
  const today = toJstDateString(new Date());
  const { data: rows, error } = await supabase.rpc("get_due_materials", {
    p_user_id: user.id,
    p_today: today,
  });

  if (error) {
    console.error("getDueMaterials RPC failed:", error.message);
    return [];
  }

  if (!rows || rows.length === 0) return [];

  return rows.map((row: DueMaterialRow) => ({
    id: row.material_id,
    title: row.title,
    subject: {
      id: row.subject_id,
      name: row.subject_name,
      color: row.subject_color,
    },
    srs_method_id: row.method_id,
    due_count: Number(row.due_count),
  }));
}

export async function getSessionCards(sessionId: string, methodSlug?: string): Promise<SessionCard[]> {
  const { user, supabase } = await requireAuth();

  // RLS に加えてアプリ層でも所有者を確認し、RLS 緩和時の誤操作を防ぐ
  const { data: session } = await supabase
    .from("sessions")
    .select("material_id")
    .eq("id", sessionId)
    .eq("user_id", user.id)
    .single();

  if (!session?.material_id) return [];

  const today = toJstDateString(new Date());

  const { data: allCards } = await supabase
    .from("cards")
    .select("id, front, back, display_order")
    .eq("material_id", session.material_id)
    .order("display_order");

  if (!allCards || allCards.length === 0) return [];

  // Elaboration は SRS スケジュールに依存しないため、全カードを対象にする
  if (methodSlug && methodSlug !== "srs") {
    return allCards.slice(0, SESSION_MAX_CARDS);
  }

  // SRS: 復習予定がまだ先のカードはセッション対象外にする
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

export async function getSession(sessionId: string): Promise<SessionDetail | null> {
  const { user, supabase } = await requireAuth();

  const { data: session } = await supabase
    .from("sessions")
    .select(`
      id, method_id, status, duration_sec, self_rating, started_at, ended_at, meta,
      materials(id, title, subjects(name)),
      learning_methods(slug, name)
    `)
    .eq("id", sessionId)
    .eq("user_id", user.id)
    .single();

  if (!session) return null;

  // 上の session クエリで所有権を検証済みだが、TOCTOU の多重防御として card_reviews 側でも検証する
  const { data: reviews } = await supabase
    .from("card_reviews")
    .select("card_id, rating, response_ms, cards(front, back), sessions!inner(user_id)")
    .eq("session_id", sessionId)
    .eq("sessions.user_id", user.id);

  // サマリー画面で「続けて学習」の判断材料を表示するため、残りの due 数を算出する
  let remainingDueCount = 0;
  const mat = session.materials as JoinedMaterial | null;

  // Interleaving セッションは material_id=NULL のため、session_materials から教材一覧を取得
  let interleavingMaterials: Array<{ id: string; title: string }> | null = null;
  if (!mat) {
    const { data: smRows } = await supabase
      .from("session_materials")
      .select("material_id, materials(title)")
      .eq("session_id", sessionId);

    if (smRows && smRows.length > 0) {
      interleavingMaterials = smRows.map((sm) => ({
        id: sm.material_id,
        title: (sm.materials as JoinedMaterialTitle | null)?.title ?? "",
      }));
    }
  }

  if (mat) {
    const today = toJstDateString(new Date());

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

  const method = session.learning_methods as JoinedMethodWithName;

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
      sessions: unknown;
    }) => ({
      card_id: r.card_id,
      rating: r.rating,
      response_ms: r.response_ms,
      card: r.cards as { front: string; back: string },
    })),
    remaining_due_count: remainingDueCount,
    meta: session.meta as Record<string, unknown> | null,
    interleaving_materials: interleavingMaterials,
  };
}

export type SessionElaboration = {
  id: string;
  card_id: string;
  card_front: string;
  elaboration_text: string;
  created_at: string;
};

export async function getSessionElaborations(sessionId: string): Promise<SessionElaboration[]> {
  const { user, supabase } = await requireAuth();

  const { data, error } = await supabase
    .from("card_elaborations")
    .select("id, card_id, elaboration_text, created_at, cards!inner(front)")
    .eq("session_id", sessionId)
    .eq("user_id", user.id)
    .order("created_at", { ascending: true });

  if (error) throw new Error(`getSessionElaborations failed: ${error.message}`);

  return (data ?? []).map((row: {
    id: string;
    card_id: string;
    elaboration_text: string;
    created_at: string;
    cards: unknown;
  }) => ({
    id: row.id,
    card_id: row.card_id,
    card_front: (row.cards as { front: string } | null)?.front ?? "",
    elaboration_text: row.elaboration_text,
    created_at: row.created_at,
  }));
}

export async function getInterleavingCards(sessionId: string): Promise<InterleavingCard[]> {
  const { user, supabase } = await requireAuth();

  // RLS に加えてアプリ層でも所有者を確認し、RLS 緩和時の誤操作を防ぐ
  const { data: session } = await supabase
    .from("sessions")
    .select("id")
    .eq("id", sessionId)
    .eq("user_id", user.id)
    .single();

  if (!session) return [];

  // 全教材の due cards を RPC 1 回で取得し、N+1 クエリを回避する
  const today = toJstDateString(new Date());
  const { data: rpcCards, error: rpcError } = await supabase.rpc("get_interleaving_due_cards", {
    p_session_id: sessionId,
    p_user_id: user.id,
    p_today: today,
  });

  if (rpcError) {
    console.error("getInterleavingCards RPC failed:", rpcError.message);
    return [];
  }

  const allCards: InterleavingCard[] = (rpcCards ?? []).map((c: InterleavingCardRow) => ({
    id: c.card_id,
    front: c.front,
    back: c.back,
    display_order: c.display_order,
    material_title: c.material_title,
  }));

  // 交互配置効果を生むため、教材を跨いでシャッフルする (Fisher-Yates)
  for (let i = allCards.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [allCards[i], allCards[j]] = [allCards[j], allCards[i]];
  }

  return allCards.slice(0, SESSION_MAX_CARDS);
}
