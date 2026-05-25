import { AppShell } from "@/components/AppShell";
import { HomeClient } from "./HomeClient";
import { USE_MOCK_DATA } from "@/lib/config";
import {
  MOCK_BETS,
  MOCK_CURRENT_USER,
  MOCK_INCOMING_FRIEND_REQUESTS,
} from "@/lib/mock";
import { getCurrentUserRow } from "@/lib/data/profile";
import { getFeedBets } from "@/lib/data/bets";
import { getUnreadCount } from "@/lib/supabase/notifications";

export const dynamic = "force-dynamic";

export default async function HomePage() {
  let me = USE_MOCK_DATA ? MOCK_CURRENT_USER : await getCurrentUserRow();
  if (!me) me = MOCK_CURRENT_USER;

  const bets = USE_MOCK_DATA ? MOCK_BETS : await getFeedBets();
  const baseUnread = USE_MOCK_DATA ? 2 : await getUnreadCount(me.id);
  // Phase 2: incoming friend requests bump the bell badge.
  const unread = baseUnread + (USE_MOCK_DATA ? MOCK_INCOMING_FRIEND_REQUESTS.length : 0);

  const activeCount = bets.filter((b) => b.status === "open" || b.status === "locked").length;

  return (
    <AppShell
      title="Feed"
      unread={unread}
      pendingCount={activeCount}
      walletCents={me.wallet_balance_cents}
    >
      <HomeClient
        bets={bets}
        currentUser={{
          id: me.id,
          first_name: me.first_name,
          last_name_initial: me.last_name_initial,
          username: me.username,
          avatar_color: me.avatar_color,
        }}
      />
    </AppShell>
  );
}
