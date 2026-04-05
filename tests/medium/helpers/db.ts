import { adminClient } from "../setup";

// テストデータ作成ヘルパー
export async function createTestSubject(userId: string, name = "テスト分野") {
  const result = await adminClient
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
  const result = await adminClient
    .from("materials")
    .insert({ subject_id: subjectId, user_id: userId, title })
    .select()
    .single();
  if (result.error) throw new Error(`テスト教材作成失敗: ${result.error.message}`);
  return result.data as { id: string; title: string; subject_id: string; user_id: string };
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
    const { error } = await adminClient.from(table).delete().eq("user_id", userId);
    if (error) throw new Error(`${table} クリーンアップ失敗: ${error.message}`);
  }

  // materials 経由で削除（cards, material_methods は CASCADE で連鎖削除）
  const { error: matErr } = await adminClient
    .from("materials")
    .delete()
    .eq("user_id", userId);
  if (matErr) throw new Error(`materials クリーンアップ失敗: ${matErr.message}`);

  // subjects 削除（materials は上で削除済み）
  const { error: subErr } = await adminClient
    .from("subjects")
    .delete()
    .eq("user_id", userId);
  if (subErr) throw new Error(`subjects クリーンアップ失敗: ${subErr.message}`);
}
