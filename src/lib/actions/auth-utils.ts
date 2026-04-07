import { createClient } from "@/lib/supabase/server";
import type { User } from "@supabase/supabase-js";
import { redirect } from "next/navigation";

type AuthResult = {
  user: User | null;
  supabase: Awaited<ReturnType<typeof createClient>>;
};

// user が non-null であることを型で保証する認証済みコンテキスト
export type AuthenticatedContext = {
  user: User;
  supabase: Awaited<ReturnType<typeof createClient>>;
};

// 各 Server Action で繰り返す auth パターンを集約し、変更点を一箇所に限定する
/** @deprecated requireAuth() を使うこと。こちらは user が null になり得るため型安全でない */
export async function getAuthenticatedUser(): Promise<AuthResult> {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  return { user, supabase };
}

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
