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
  const [unread, rawNotifications] = await Promise.all([
    getUnreadCount(me.id),
    getNotifications(me.id),
  ]);
  // The server fetcher returns Supabase rows; coerce to the UI's NotificationRow.
  const initialNotifications: NotificationRow[] = (rawNotifications as unknown as Array<{
    id: string;
    user_id: string;
    type: string;
    reference_id: string | null;
    reference_type: string | null;
    is_read: boolean;
    created_at: string;
  }>).map((n) => ({
    id: n.id,
    user_id: n.user_id,
    type: n.type,
    payload: { reference_id: n.reference_id, reference_type: n.reference_type },
    read: n.is_read,
    created_at: n.created_at,
  }));

  return (
    <AppShell title="Notifications" unread={unread}>
      <NotificationsClient initialNotifications={initialNotifications} />
    </AppShell>
  );
}
