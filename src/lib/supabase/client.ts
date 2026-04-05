import { createBrowserClient } from "@supabase/ssr";
import type { Database } from "@/lib/types/database";

// ブラウザ環境専用。Cookie ベースのトークン自動更新を SSR パッケージに委譲
export function createClient() {
  return createBrowserClient<Database>(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
  );
}
