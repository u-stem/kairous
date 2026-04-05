import { createClient } from "@/lib/supabase/server";
import { signOut } from "./actions";

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
