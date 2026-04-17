import { BottomNav } from "@/components/navigation/bottom-nav";
import { Sidebar } from "@/components/navigation/sidebar";
import { NotificationProvider } from "@/components/notification-provider";
import { createClient } from "@/lib/supabase/server";

export default async function MainLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  // 通知設定を取得（未認証時は空にして NotificationProvider を無効化）。
  // (main) 配下だが layout レベルでは意図的に requireAuth を使わない: middleware で
  // 認証保護しつつ、ログイン直後の race でも layout が 500 にならないよう許容する。
  let notificationEnabled = false;
  let schedules: Array<{
    id: string;
    enabled: boolean;
    time: string;
    message_type: "due_today" | "review_and_preview";
    label: string;
  }> = [];

  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (user) {
    const [profileResult, schedulesResult] = await Promise.all([
      supabase
        .from("profiles")
        .select("notification_enabled")
        .eq("id", user.id)
        .single(),
      supabase
        .from("notification_schedules")
        .select("id, enabled, time, message_type, label")
        .eq("user_id", user.id)
        .order("time", { ascending: true }),
    ]);
    notificationEnabled = profileResult.data?.notification_enabled ?? false;
    schedules = (schedulesResult.data ?? []) as typeof schedules;
  }

  return (
    <div className="flex min-h-dvh">
      <Sidebar />
      <main id="main-content" className="flex-1 pb-16 md:pb-0">{children}</main>
      <BottomNav />
      <NotificationProvider
        schedules={schedules}
        enabled={notificationEnabled}
      />
    </div>
  );
}
