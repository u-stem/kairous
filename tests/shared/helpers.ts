import { getAdminClient } from "./db";

export async function createTestSubject(userId: string, name = "テスト分野") {
  const result = await getAdminClient()
    .from("subjects")
    .insert({ user_id: userId, name, color: "#6366f1" })
    .select()
    .single();
  if (result.error) throw new Error(`テスト分野作成失敗: ${result.error.message}`);
  return result.data as { id: string; name: string; color: string; user_id: string };
}

export async function createTestMaterial(
  subjectId: string,
  userId: string,
  title = "テスト教材",
) {
  const result = await getAdminClient()
    .from("materials")
    .insert({ subject_id: subjectId, user_id: userId, title })
    .select()
    .single();
  if (result.error) throw new Error(`テスト教材作成失敗: ${result.error.message}`);
  return result.data as { id: string; title: string; subject_id: string; user_id: string };
}

export async function createTestCard(
  materialId: string,
  front = "テスト表面",
  back = "テスト裏面",
  displayOrder = 0,
) {
  const result = await getAdminClient()
    .from("cards")
    .insert({ material_id: materialId, front, back, display_order: displayOrder })
    .select()
    .single();
  if (result.error) throw new Error(`テストカード作成失敗: ${result.error.message}`);
  return result.data as { id: string; material_id: string; front: string; back: string; display_order: number };
}

export async function getSrsMethodId(): Promise<string> {
  const { data } = await getAdminClient()
    .from("learning_methods")
    .select("id")
    .eq("slug", "srs")
    .single();
  if (!data) throw new Error("SRS method not found in seed data");
  return data.id as string;
}

export async function getWakefulRestMethodId(): Promise<string> {
  const { data } = await getAdminClient()
    .from("learning_methods")
    .select("id")
    .eq("slug", "wakeful_rest")
    .single();
  if (!data) throw new Error("wakeful_rest method not found in seed data");
  return data.id as string;
}

export async function getMethodIdBySlug(slug: string): Promise<string> {
  const { data } = await getAdminClient()
    .from("learning_methods")
    .select("id")
    .eq("slug", slug)
    .single();
  if (!data) throw new Error(`learning_methods に slug="${slug}" が見つからない`);
  return data.id as string;
}

export async function linkMaterialMethod(materialId: string, methodId: string) {
  const { error } = await getAdminClient()
    .from("material_methods")
    .insert({ material_id: materialId, method_id: methodId });
  if (error) throw new Error(`material_methods 紐付け失敗: ${error.message}`);
}

export async function createTestSrsState(
  cardId: string,
  userId: string,
  dueDate: string,
  state = "New",
) {
  const { error } = await getAdminClient()
    .from("srs_states")
    .insert({
      card_id: cardId,
      user_id: userId,
      due_date: dueDate,
      state,
      stability: 1.0,
      difficulty: 5.0,
    });
  if (error) throw new Error(`テスト srs_state 作成失敗: ${error.message}`);
}

export async function createTestSession(
  userId: string,
  materialId: string,
  methodId: string,
  status = "in_progress",
) {
  const result = await getAdminClient()
    .from("sessions")
    .insert({ user_id: userId, material_id: materialId, method_id: methodId, status })
    .select()
    .single();
  if (result.error) throw new Error(`テストセッション作成失敗: ${result.error.message}`);
  return result.data as { id: string; user_id: string; material_id: string; method_id: string; status: string; started_at: string };
}

// テストデータ全削除（テスト間の独立性を保証）
// 外部キー制約の順序: 子テーブル → 親テーブル
export async function cleanupTestData(userId: string) {
  // user_id を直接持つテーブル
  const userOwnedTables = [
    "daily_logs",
    "sessions",       // card_reviews, session_materials は CASCADE で連鎖削除
    "srs_states",
  ] as const;

  for (const table of userOwnedTables) {
    const { error } = await getAdminClient().from(table).delete().eq("user_id", userId);
    if (error) throw new Error(`${table} クリーンアップ失敗: ${error.message}`);
  }

  // materials 経由で削除（cards, material_methods は CASCADE で連鎖削除）
  const { error: matErr } = await getAdminClient()
    .from("materials")
    .delete()
    .eq("user_id", userId);
  if (matErr) throw new Error(`materials クリーンアップ失敗: ${matErr.message}`);

  // subjects 削除（materials は上で削除済み）
  const { error: subErr } = await getAdminClient()
    .from("subjects")
    .delete()
    .eq("user_id", userId);
  if (subErr) throw new Error(`subjects クリーンアップ失敗: ${subErr.message}`);
}

export async function cleanupNotificationSchedules(userId: string) {
  await getAdminClient()
    .from("notification_schedules")
    .delete()
    .eq("user_id", userId);
}
