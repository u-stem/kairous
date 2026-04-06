import { createBrowserClient } from "@supabase/ssr";
import type { Database } from "@/lib/types/database";
import { env } from "@/lib/env";

// ブラウザ環境専用。Cookie ベースのトークン自動更新を SSR パッケージに委譲
export function createClient() {
  return createBrowserClient<Database>(
    env.NEXT_PUBLIC_SUPABASE_URL,
    env.NEXT_PUBLIC_SUPABASE_ANON_KEY,
  );
}
