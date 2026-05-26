import { AppShell } from "@/components/AppShell";
import { NotificationsClient } from "./NotificationsClient";
import { USE_MOCK_DATA } from "@/lib/config";
import { MOCK_CURRENT_USER } from "@/lib/mock";
import { getCurrentUserRow } from "@/lib/data/profile";
import { getNotifications, getUnreadCount } from "@/lib/supabase/notifications";
import type { NotificationRow } from "@/types/db";

export const dynamic = "force-dynamic";

export default async function NotificationsPage() {
  if (USE_MOCK_DATA) {
    return (
      <AppShell title="Notifications">
        <NotificationsClient initialNotifications={[]} />
      </AppShell>
    );
  }

  const me = (await getCurrentUserRow()) ?? MOCK_CURRENT_USER;
  const [unread, initialNotifications] = await Promise.all([
    getUnreadCount(me.id),
    getNotifications(me.id),
  ]);

  return (
    <AppShell title="Notifications" unread={unread}>
      <NotificationsClient initialNotifications={initialNotifications as NotificationRow[]} />
    </AppShell>
  );
}
