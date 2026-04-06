import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { createClient } from "@supabase/supabase-js";

// .env.local から環境変数を読み込む (vitest は Next.js の env 自動読み込みを持たないため)
const envPath = resolve(process.cwd(), ".env.local");
try {
  const envContent = readFileSync(envPath, "utf-8");
  for (const line of envContent.split("\n")) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith("#")) continue;
    const eqIndex = trimmed.indexOf("=");
    if (eqIndex === -1) continue;
    const key = trimmed.slice(0, eqIndex);
    // = 以降全体が値 (値に = を含む URL 等に対応)
    const value = trimmed.slice(eqIndex + 1).replace(/^["']|["']$/g, "");
    if (!process.env[key]) {
      process.env[key] = value;
    }
  }
} catch {
  // .env.local がない場合は環境変数が既に設定されている前提
}

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

// Edge Function の JWT 認証テスト用。ユーザーとしてサインインしたクライアントを返す
export async function createUserClient(
  email: string,
  password: string,
) {
  const anonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
  if (!anonKey) throw new Error("NEXT_PUBLIC_SUPABASE_ANON_KEY が未設定");
  const client = createClient(supabaseUrl!, anonKey);
  const { error } = await client.auth.signInWithPassword({ email, password });
  if (error) throw new Error(`サインイン失敗: ${error.message}`);
  return client;
}
