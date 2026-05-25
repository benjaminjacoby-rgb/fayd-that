import { AppShell } from "@/components/AppShell";
import { MessagesClient } from "./MessagesClient";
import { USE_MOCK_DATA } from "@/lib/config";
import { MOCK_BETS, MOCK_CURRENT_USER, MOCK_FRIENDS, mockInboxFor } from "@/lib/mock";
import { getCurrentUserRow, getFriendsForCurrentUser } from "@/lib/data/profile";
import { getInbox } from "@/lib/data/messages";
import { getFeedBets } from "@/lib/data/bets";
import type { UserLite } from "@/types/db";

export const dynamic = "force-dynamic";

export default async function MessagesPage() {
  if (USE_MOCK_DATA) {
    const dms = mockInboxFor("dm");
    const groups = mockInboxFor("group");
    const me = MOCK_CURRENT_USER;
    const activeCount = MOCK_BETS.filter(
      (b) => b.status === "open" || b.status === "locked",
    ).length;
    const friends: UserLite[] = MOCK_FRIENDS.map((f) => ({
      id: f.id,
      first_name: f.first_name,
      last_name_initial: f.last_name_initial,
      username: f.username,
      avatar_color: f.avatar_color,
    }));
    return (
      <AppShell title="Messages" pendingCount={activeCount}>
        <MessagesClient
          dms={dms}
          groups={groups}
          currentUserId={me.id}
          friends={friends}
        />
      </AppShell>
    );
  }

  const me = (await getCurrentUserRow()) ?? MOCK_CURRENT_USER;
  const [{ dms, groups }, bets, friendRows] = await Promise.all([
    getInbox(),
    getFeedBets(),
    getFriendsForCurrentUser(),
  ]);
  const activeCount = bets.filter((b) => b.status === "open" || b.status === "locked").length;
  const friends: UserLite[] = friendRows.map((f) => ({
    id: f.id,
    first_name: f.first_name,
    last_name_initial: f.last_name_initial,
    username: f.username,
    avatar_color: f.avatar_color,
  }));

  return (
    <AppShell title="Messages" pendingCount={activeCount}>
      <MessagesClient
        dms={dms}
        groups={groups}
        currentUserId={me.id}
        friends={friends}
      />
    </AppShell>
  );
}
