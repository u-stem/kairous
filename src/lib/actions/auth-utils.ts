import { createClient } from "@/lib/supabase/server";
import type { User } from "@supabase/supabase-js";
import { redirect } from "next/navigation";

// user が non-null であることを型で保証する認証済みコンテキスト
export type AuthenticatedContext = {
  user: User;
  supabase: Awaited<ReturnType<typeof createClient>>;
};

// 未認証時はログインページにリダイレクトし、呼び出し元に user の non-null を保証する
export async function requireAuth(): Promise<AuthenticatedContext> {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    redirect("/auth/login");
  }

  return { user, supabase };
}
