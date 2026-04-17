import { getAdminClient } from "./db";

export async function createTestCategory(
  userId: string,
  name = "テストカテゴリ",
  parentId?: string,
) {
  const result = await getAdminClient()
    .from("categories")
    .insert({ user_id: userId, name, color: "#6366f1", parent_id: parentId ?? null })
    .select()
    .single();
  if (result.error) throw new Error(`テストカテゴリ作成失敗: ${result.error.message}`);
  return result.data as { id: string; name: string; color: string; user_id: string; parent_id: string | null };
}

// createTestCategory の短縮エイリアス。テスト記述量削減のためテストヘルパーとしてのみ維持する
// (Epic #232 のデッドコード削除は Epic #288 PBI-3 で完了済み。本エイリアスは削除対象外)
export const createTestSubject = createTestCategory;

export async function createTestMaterial(
  categoryId: string,
  userId: string,
  title = "テスト教材",
  id?: string,
) {
  const insertData: Record<string, unknown> = {
    category_id: categoryId,
    user_id: userId,
    title,
  };
  if (id) insertData.id = id;
  const result = await getAdminClient()
    .from("materials")
    .insert(insertData)
    .select()
    .single();
  if (result.error) throw new Error(`テスト教材作成失敗: ${result.error.message}`);
  return result.data as { id: string; title: string; category_id: string; user_id: string };
}

export async function createTestCard(
  materialId: string,
  front = "テスト表面",
  back = "テスト裏面",
  displayOrder = 0,
  id?: string,
) {
  const insertData: Record<string, unknown> = {
    material_id: materialId,
    front,
    back,
    display_order: displayOrder,
  };
  if (id) insertData.id = id;
  const result = await getAdminClient()
    .from("cards")
    .insert(insertData)
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
  id?: string,
  extra?: { ended_at?: string; duration_sec?: number },
) {
  const insertData: Record<string, unknown> = {
    user_id: userId,
    material_id: materialId,
    method_id: methodId,
    status,
  };
  if (id) insertData.id = id;
  if (extra?.ended_at) insertData.ended_at = extra.ended_at;
  if (extra?.duration_sec !== undefined) insertData.duration_sec = extra.duration_sec;
  const result = await getAdminClient()
    .from("sessions")
    .insert(insertData)
    .select()
    .single();
  if (result.error) throw new Error(`テストセッション作成失敗: ${result.error.message}`);
  return result.data as { id: string; user_id: string; material_id: string; method_id: string; status: string; started_at: string };
}

export async function createTestTag(
  userId: string,
  name: string,
  color = "#94a3b8",
) {
  const result = await getAdminClient()
    .from("tags")
    .insert({ user_id: userId, name, color })
    .select()
    .single();
  if (result.error) throw new Error(`テストタグ作成失敗: ${result.error.message}`);
  return result.data as { id: string; name: string; color: string; user_id: string };
}

export async function addTestTagToMaterial(materialId: string, tagId: string) {
  const { error } = await getAdminClient()
    .from("material_tags")
    .upsert({ material_id: materialId, tag_id: tagId });
  if (error) throw new Error(`テストタグ紐付け失敗: ${error.message}`);
}

// テストデータ全削除（テスト間の独立性を保証）
// 外部キー制約の順序: 子テーブル → 親テーブル
export async function cleanupTestData(userId: string) {
  // user_id を直接持つテーブル
  const userOwnedTables = [
    "daily_logs",
    "sessions",       // card_reviews, card_elaborations, session_materials は CASCADE で連鎖削除
    "srs_states",
    "tags",           // material_tags は materials CASCADE で消えるが tags 自体は独立削除が必要
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

  // categories 削除（materials は上で削除済み）
  const { error: catErr } = await getAdminClient()
    .from("categories")
    .delete()
    .eq("user_id", userId);
  if (catErr) throw new Error(`categories クリーンアップ失敗: ${catErr.message}`);
}

export async function cleanupNotificationSchedules(userId: string) {
  await getAdminClient()
    .from("notification_schedules")
    .delete()
    .eq("user_id", userId);
}

export async function cleanupCustomMethods(userId: string) {
  const { error } = await getAdminClient()
    .from("learning_methods")
    .delete()
    .eq("user_id", userId)
    .eq("is_system", false);
  if (error) throw new Error(`カスタム手法クリーンアップ失敗: ${error.message}`);
}
