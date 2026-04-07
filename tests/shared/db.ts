import { createClient } from "@supabase/supabase-js";

function getRequiredEnv(key: string): string {
  const value = process.env[key];
  if (!value) {
    throw new Error(`${key} が未設定。.env.local または CI 環境変数を確認`);
  }
  return value;
}

export function createAdminClient() {
  return createClient(
    getRequiredEnv("NEXT_PUBLIC_SUPABASE_URL"),
    getRequiredEnv("SUPABASE_SERVICE_ROLE_KEY"),
  );
}

// env 読み込み後に初めてアクセスされるよう遅延初期化
let _adminClient: ReturnType<typeof createAdminClient> | null = null;

export function getAdminClient() {
  if (!_adminClient) {
    _adminClient = createAdminClient();
  }
  return _adminClient;
}

// 後方互換: Medium テストが adminClient を直接参照している
// getter で遅延評価するため、import 時点では env 未設定でも問題ない
export const adminClient = new Proxy({} as ReturnType<typeof createAdminClient>, {
  get(_target, prop, receiver): unknown {
    return Reflect.get(getAdminClient(), prop, receiver);
  },
});

export async function createTestUser(
  email = `test-${Date.now()}@kairous.local`,
  password = "test-password-12345",
): Promise<string> {
  const { data, error } = await adminClient.auth.admin.createUser({
    email,
    password,
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

export async function createUserClient(email: string, password: string) {
  const anonKey = getRequiredEnv("NEXT_PUBLIC_SUPABASE_ANON_KEY");
  const supabaseUrl = getRequiredEnv("NEXT_PUBLIC_SUPABASE_URL");
  const client = createClient(supabaseUrl, anonKey);
  const { error } = await client.auth.signInWithPassword({ email, password });
  if (error) throw new Error(`サインイン失敗: ${error.message}`);
  return client;
}
