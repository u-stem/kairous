"use server";

import { redirect } from "next/navigation";
import { requireAuth } from "@/lib/actions/auth-utils";

export async function signOut() {
  // 既に未認証であれば requireAuth が /auth/login へリダイレクトし、
  // 認証済みであれば supabase クライアントを取得して signOut を実行する
  const { supabase } = await requireAuth();
  const { error } = await supabase.auth.signOut();
  if (error) {
    // サインアウト失敗はセッション状態が不定になるため、エラーを記録してもログインページへ誘導する
    console.error("signOut error:", error.message);
  }
  redirect("/auth/login");
}
