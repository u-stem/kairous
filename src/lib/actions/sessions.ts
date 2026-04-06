"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import {
  createSessionSchema,
  completeSessionSchema,
  createRestSessionSchema,
  completeRestSessionSchema,
  extractFieldErrors,
} from "@/lib/validations/sessions";
import {
  completeElaborationSchema,
  type ElaborationInput,
} from "@/lib/validations/elaboration";
import { createInterleavingSessionSchema } from "@/lib/validations/interleaving";
import type { ActionResult } from "@/lib/validations/materials";
import type { CardReview, DueMaterial, SessionCard, InterleavingCard, SessionDetail } from "@/lib/types/sessions";
import { SESSION_MAX_CARDS, REST_DURATION_SEC, JST_OFFSET_MS } from "@/lib/constants";
import { completePomodoroSchema } from "@/lib/validations/pomodoro";

export type SessionInfo = {
  id: string;
  methodSlug: string;
  materialId: string | null;
};

export async function getSessionInfo(sessionId: string): Promise<SessionInfo | null> {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return null;

  const { data: session } = await supabase
    .from("sessions")
    .select("id, material_id, learning_methods(slug)")
    .eq("id", sessionId)
    .eq("user_id", user.id)
    .eq("status", "in_progress")
    .single();

  if (!session) return null;

  const method = session.learning_methods as unknown as { slug: string } | null;

  // method が null になるのは learning_methods が削除された孤立データのみ
  // notFound() でハンドルするため、呼び出し元に null を返す
  if (!method?.slug) return null;

  return {
    id: session.id,
    methodSlug: method.slug,
    materialId: session.material_id,
  };
}

export async function getDueMaterials(): Promise<DueMaterial[]> {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return [];

  // N+1 回避: materials→cards→srs_states の3クエリを RPC で1クエリに集約
  const today = new Date().toISOString().split("T")[0];
  const { data: rows, error } = await supabase.rpc("get_due_materials", {
    p_user_id: user.id,
    p_today: today,
  });

  if (error) {
    console.error("getDueMaterials RPC failed:", error.message);
    return [];
  }

  if (!rows || rows.length === 0) return [];

  return rows.map((row) => ({
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

  // RLS に加えてアプリ層でも所有者を確認し、RLS 緩和時の誤操作を防ぐ
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

export async function getSessionCards(sessionId: string, methodSlug?: string): Promise<SessionCard[]> {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return [];

  // RLS に加えてアプリ層でも所有者を確認し、RLS 緩和時の誤操作を防ぐ
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

  // RLS に加えてアプリ層でも所有者と status を確認し、二重完了を防ぐ
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

  // FSRS 計算と統計更新を原子的に実行するため、Edge Function に処理を委譲する。
  // supabase.functions.invoke はユーザーの JWT を Authorization ヘッダーに自動付与する
  const fnResult = await supabase.functions.invoke("complete-session", {
    body: {
      session_id: parsed.data.sessionId,
      reviews: parsed.data.reviews,
    },
  });

  if (fnResult.error) {
    // Edge Function 失敗時はセッションを in_progress に戻す
    const { error: compensationError } = await supabase
      .from("sessions")
      .update({ status: "in_progress", ended_at: null, self_rating: null, duration_sec: 0 })
      .eq("id", parsed.data.sessionId);
    if (compensationError) {
      // 補償処理も失敗した場合、セッションが completed のまま残る可能性がある
      console.error(
        `completeSession compensation failed for session ${parsed.data.sessionId}:`,
        compensationError,
      );
    }
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
  const mat = session.materials as unknown as {
    id: string;
    title: string;
    subjects: { name: string };
  } | null;

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
        title: (sm.materials as unknown as { title: string })?.title ?? "",
      }));
    }
  }

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

  // RLS に加えてアプリ層でも所有者を確認し、他ユーザーのセッションへの紐付けを防ぐ
  const { data: parentSession } = await supabase
    .from("sessions")
    .select("id")
    .eq("id", parsed.data.parentSessionId)
    .eq("user_id", user.id)
    .single();

  if (!parentSession) return { success: false, error: "セッションが見つかりません" };

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

export async function completeElaborationSession(
  sessionId: string,
  reviews: CardReview[],
  elaborations: ElaborationInput[],
  selfRating: number,
): Promise<ActionResult<undefined>> {
  const parsed = completeElaborationSchema.safeParse({ sessionId, reviews, elaborations, selfRating });
  if (!parsed.success) {
    return { success: false, error: "入力内容を確認してください" };
  }

  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { success: false, error: "認証が必要です" };

  // RLS に加えてアプリ層でも所有者と status を確認し、二重完了を防ぐ
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

  // elaborations を meta に保存し、セッションを完了する
  const { error: updateError } = await supabase
    .from("sessions")
    .update({
      status: "completed",
      duration_sec: durationSec,
      self_rating: parsed.data.selfRating,
      ended_at: now.toISOString(),
      meta: { elaborations: parsed.data.elaborations },
    })
    .eq("id", parsed.data.sessionId);

  if (updateError) return { success: false, error: "セッションの更新に失敗しました" };

  // Edge Function で card_reviews + daily_logs を記録 (FSRS はスキップ)
  const fnResult = await supabase.functions.invoke("complete-session", {
    body: {
      session_id: parsed.data.sessionId,
      reviews: parsed.data.reviews,
    },
  });

  if (fnResult.error) {
    // Edge Function 失敗時はセッションを in_progress に戻す
    const { error: compensationError } = await supabase
      .from("sessions")
      // meta: null でリセットするのは、セッション完了前に保存した elaborations を破棄するため
      .update({ status: "in_progress", ended_at: null, self_rating: null, duration_sec: 0, meta: null })
      .eq("id", parsed.data.sessionId);
    if (compensationError) {
      // 補償処理も失敗した場合、セッションが completed のまま残る可能性がある
      console.error(
        `completeElaborationSession compensation failed for session ${parsed.data.sessionId}:`,
        compensationError,
      );
    }
    return { success: false, error: "カードレビューの処理に失敗しました" };
  }

  revalidatePath("/");
  return { success: true, data: undefined };
}

export async function completePomodoroSession(
  sessionId: string,
  selfRating: number,
  pomodorosCompleted: number,
  totalFocusSec: number,
  totalBreakSec: number,
): Promise<ActionResult<undefined>> {
  const parsed = completePomodoroSchema.safeParse({
    sessionId,
    selfRating,
    pomodorosCompleted,
    totalFocusSec,
    totalBreakSec,
  });
  if (!parsed.success) {
    return { success: false, error: "入力内容を確認してください" };
  }

  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { success: false, error: "認証が必要です" };

  // RLS に加えてアプリ層でも所有者と status を確認し、二重完了を防ぐ
  const { data: session } = await supabase
    .from("sessions")
    .select("id, started_at, status, material_id, method_id")
    .eq("id", parsed.data.sessionId)
    .eq("user_id", user.id)
    .single();

  if (!session) return { success: false, error: "セッションが見つかりません" };
  if (session.status !== "in_progress") {
    return { success: false, error: "このセッションは既に完了しています" };
  }

  // クライアント値は表示用 meta にのみ使用し、duration_sec は改ざん耐性のためサーバー側で計算する
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
      meta: {
        pomodoros_completed: parsed.data.pomodorosCompleted,
        total_focus_sec: parsed.data.totalFocusSec,
        total_break_sec: parsed.data.totalBreakSec,
      },
    })
    .eq("id", parsed.data.sessionId);

  if (updateError) return { success: false, error: "セッションの更新に失敗しました" };

  // Pomodoro は card_reviews がないため Edge Function を呼ばず、直接 daily_logs を記録する
  if (session.material_id) {
    const { data: material } = await supabase
      .from("materials")
      .select("subject_id")
      .eq("id", session.material_id)
      .single();

    if (material) {
      const logDate = new Date(Date.now() + JST_OFFSET_MS).toISOString().split("T")[0];

      const { error: logError } = await supabase.rpc("upsert_daily_log", {
        p_user_id: user.id,
        p_subject_id: material.subject_id,
        p_method_id: session.method_id,
        p_log_date: logDate,
        p_duration_sec: durationSec,
        p_cards_reviewed: 0,
      });
      if (logError) {
        // daily_log 失敗はセッション完了をブロックしないが、データ欠損を追跡するためログに記録する
        console.error(
          `completePomodoroSession daily_log upsert failed for session ${parsed.data.sessionId}:`,
          logError,
        );
      }
    }
  }

  revalidatePath("/");
  return { success: true, data: undefined };
}

export async function completeRestSession(
  sessionId: string,
): Promise<ActionResult<undefined>> {
  const parsed = completeRestSessionSchema.safeParse({ sessionId });
  if (!parsed.success) {
    return { success: false, error: "入力内容を確認してください" };
  }

  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { success: false, error: "認証が必要です" };

  // 所有者・進行中・安静セッションの3条件を同時に検証し、不正な完了を防ぐ
  const { data: session } = await supabase
    .from("sessions")
    .select("id, learning_methods!inner(slug)")
    .eq("id", parsed.data.sessionId)
    .eq("user_id", user.id)
    .eq("status", "in_progress")
    .single();

  if (!session) return { success: false, error: "セッションが見つかりません" };

  const method = session.learning_methods as unknown as { slug: string };
  if (method.slug !== "wakeful_rest") {
    return { success: false, error: "安静セッションではありません" };
  }

  const { error } = await supabase
    .from("sessions")
    .update({
      status: "completed",
      duration_sec: REST_DURATION_SEC,
      ended_at: new Date().toISOString(),
    })
    .eq("id", parsed.data.sessionId);

  if (error) return { success: false, error: "セッションの完了に失敗しました" };

  revalidatePath("/");
  return { success: true, data: undefined };
}

export async function createInterleavingSession(
  materialIds: string[],
): Promise<ActionResult<{ id: string }>> {
  const parsed = createInterleavingSessionSchema.safeParse({ materialIds });
  if (!parsed.success) {
    return { success: false, error: "インターリービングには2つ以上の教材が必要です" };
  }

  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { success: false, error: "認証が必要です" };

  // interleaving の method_id を取得
  const { data: method } = await supabase
    .from("learning_methods")
    .select("id")
    .eq("slug", "interleaving")
    .single();

  if (!method) return { success: false, error: "インターリービング手法が見つかりません" };

  // RLS に加えてアプリ層でも全教材の所有権を確認する
  const { data: ownedMaterials } = await supabase
    .from("materials")
    .select("id")
    .eq("user_id", user.id)
    .in("id", parsed.data.materialIds);

  if (!ownedMaterials || ownedMaterials.length !== parsed.data.materialIds.length) {
    return { success: false, error: "教材が見つかりません" };
  }

  // material_id = NULL で interleaving セッションを作成
  const { data: session, error: sessionError } = await supabase
    .from("sessions")
    .insert({
      user_id: user.id,
      method_id: method.id,
      status: "in_progress",
    })
    .select("id")
    .single();

  if (sessionError || !session) {
    return { success: false, error: "セッションの作成に失敗しました" };
  }

  // session_materials に対象教材を一括登録
  const sessionMaterialRows = parsed.data.materialIds.map((mid) => ({
    session_id: session.id,
    material_id: mid,
  }));

  const { error: smError } = await supabase
    .from("session_materials")
    .insert(sessionMaterialRows);

  if (smError) {
    // session_materials 挿入に失敗した場合、セッションを放棄状態にする
    await supabase
      .from("sessions")
      .update({ status: "abandoned" })
      .eq("id", session.id);
    return { success: false, error: "セッションの作成に失敗しました" };
  }

  return { success: true, data: { id: session.id } };
}

export async function getInterleavingCards(sessionId: string): Promise<InterleavingCard[]> {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return [];

  // session_materials からセッションに紐づく教材一覧を取得
  const { data: sessionMaterials } = await supabase
    .from("session_materials")
    .select("material_id, materials(title)")
    .eq("session_id", sessionId);

  if (!sessionMaterials || sessionMaterials.length === 0) return [];

  const today = new Date().toISOString().split("T")[0];
  const allCards: InterleavingCard[] = [];

  for (const sm of sessionMaterials) {
    const materialTitle = (sm.materials as unknown as { title: string })?.title ?? "";

    const { data: cards } = await supabase
      .from("cards")
      .select("id, front, back, display_order")
      .eq("material_id", sm.material_id)
      .order("display_order");

    if (!cards || cards.length === 0) continue;

    // SRS の due_date フィルタを適用
    const cardIds = cards.map((c) => c.id);
    const { data: notDueStates } = await supabase
      .from("srs_states")
      .select("card_id")
      .eq("user_id", user.id)
      .gt("due_date", today)
      .in("card_id", cardIds);

    const notDueCardIds = new Set((notDueStates ?? []).map((s) => s.card_id));

    const dueCards = cards
      .filter((c) => !notDueCardIds.has(c.id))
      .map((c) => ({
        ...c,
        material_title: materialTitle,
      }));

    allCards.push(...dueCards);
  }

  // 交互配置効果を生むため、教材を跨いでシャッフルする (Fisher-Yates)
  for (let i = allCards.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [allCards[i], allCards[j]] = [allCards[j], allCards[i]];
  }

  return allCards.slice(0, SESSION_MAX_CARDS);
}
