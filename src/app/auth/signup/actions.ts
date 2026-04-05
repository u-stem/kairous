"use server";

import { redirect } from "next/navigation";
import { z } from "zod";
import { createClient } from "@/lib/supabase/server";

const signupSchema = z.object({
  displayName: z.string().min(1).max(50),
  email: z.email(),
  password: z.string().min(8).max(128),
});

export async function signup(formData: FormData) {
  const parsed = signupSchema.safeParse({
    displayName: formData.get("displayName"),
    email: formData.get("email"),
    password: formData.get("password"),
  });

  if (!parsed.success) {
    return { error: "入力内容を確認してください" };
  }

  const supabase = await createClient();

  const { error } = await supabase.auth.signUp({
    email: parsed.data.email,
    password: parsed.data.password,
    options: {
      data: {
        display_name: parsed.data.displayName,
      },
    },
  });

  if (error) {
    // 認証エラーの詳細をクライアントに公開しない
    return { error: "アカウントの作成に失敗しました" };
  }

  redirect("/");
}
