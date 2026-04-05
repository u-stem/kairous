"use server";

import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";

export async function signOut() {
  const supabase = await createClient();
  const { error } = await supabase.auth.signOut();
  if (error) {
    // サインアウト失敗はセッション状態が不定になるため、エラーを記録してもログインページへ誘導する
    console.error("signOut error:", error.message);
  }
  redirect("/auth/login");
}
