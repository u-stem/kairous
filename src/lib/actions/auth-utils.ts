import { createClient } from "@/lib/supabase/server";
import type { User } from "@supabase/supabase-js";

type AuthResult = {
  user: User | null;
  supabase: Awaited<ReturnType<typeof createClient>>;
};

// 各 Server Action で繰り返す auth パターンを集約し、変更点を一箇所に限定する
export async function getAuthenticatedUser(): Promise<AuthResult> {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  return { user, supabase };
}
