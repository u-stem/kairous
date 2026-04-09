import { createClient } from "@/lib/supabase/server";
import { signOut } from "./actions";
import Link from "next/link";

export default async function ProfilePage() {
  const supabase = await createClient();

  const {
    data: { user },
  } = await supabase.auth.getUser();

  return (
    <div className="p-4">
      <h2 className="text-lg font-bold">設定</h2>
      <div className="mt-4 space-y-4">
        <p className="text-sm text-gray-500">{user?.email}</p>
        <Link
          href="/profile/notifications"
          className="flex items-center justify-between rounded-md border px-4 py-3 text-sm hover:bg-muted"
          data-testid="notification-settings-link"
        >
          <span>通知設定</span>
          <span className="text-muted-foreground">›</span>
        </Link>
        <form action={signOut}>
          <button
            type="submit"
            className="rounded-md bg-gray-200 px-4 py-2 text-sm hover:bg-gray-300"
          >
            ログアウト
          </button>
        </form>
      </div>
    </div>
  );
}
