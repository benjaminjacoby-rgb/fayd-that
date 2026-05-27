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

/** Detect names that were stored in the old "First L." / "First L" format. */
function hasOldNameFormat(fullName: string | null): boolean {
  if (!fullName) return false;
  const words = fullName.trim().split(/\s+/).filter(Boolean);
  if (words.length < 2) return false;
  // Last word is a single letter (optionally followed by a period).
  return /^[A-Za-z]\.?$/.test(words[words.length - 1]);
}

export default async function HomePage() {
  let me = USE_MOCK_DATA ? MOCK_CURRENT_USER : await getCurrentUserRow();
  if (!me) me = MOCK_CURRENT_USER;

  const bets = USE_MOCK_DATA ? MOCK_BETS : await getFeedBets();
  const baseUnread = USE_MOCK_DATA ? 2 : await getUnreadCount(me.id);
  // Phase 2: incoming friend requests bump the bell badge.
  const unread = baseUnread + (USE_MOCK_DATA ? MOCK_INCOMING_FRIEND_REQUESTS.length : 0);

  const activeCount = bets.filter((b) => b.status === "open" || b.status === "locked").length;

  // Show the one-time name-update prompt if the user hasn't seen it yet AND
  // their stored name looks like the old "First L." format.
  const showNamePrompt =
    !USE_MOCK_DATA &&
    !me.has_seen_name_prompt &&
    hasOldNameFormat(me.first_name);

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
          avatar_url: me.avatar_url ?? null,
        }}
        showNamePrompt={showNamePrompt}
      />
    </AppShell>
  );
}
