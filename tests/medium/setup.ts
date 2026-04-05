import { createClient } from "@supabase/supabase-js";

// Medium テストは Supabase ローカルに接続
const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

if (!supabaseUrl) {
  throw new Error(
    "NEXT_PUBLIC_SUPABASE_URL が未設定。Supabase ローカルが起動しているか確認: bunx supabase start",
  );
}
if (!serviceRoleKey) {
  throw new Error(
    "SUPABASE_SERVICE_ROLE_KEY が未設定。.env.local を確認",
  );
}

// service_role クライアント（RLS バイパス、テストデータ操作用）
export const adminClient = createClient(supabaseUrl, serviceRoleKey);

// テスト用ユーザーの作成・取得・削除ヘルパー
export async function createTestUser(): Promise<string> {
  const { data, error } = await adminClient.auth.admin.createUser({
    email: `test-${Date.now()}@kairous.local`,
    password: "test-password-12345",
    email_confirm: true,
    user_metadata: { display_name: "Test User" },
  });
  if (error) throw new Error(`テストユーザー作成失敗: ${error.message}`);
  return data.user.id;
}

export async function deleteTestUser(userId: string): Promise<void> {
  const { error } = await adminClient.auth.admin.deleteUser(userId);
  if (error) throw new Error(`テストユーザー削除失敗: ${error.message}`);
}
