import { AppShell } from "@/components/AppShell";
import { ProfileClient } from "./ProfileClient";
import { USE_MOCK_DATA } from "@/lib/config";
import {
  MOCK_CURRENT_USER,
  MOCK_FRIENDS,
  MOCK_INCOMING_FRIEND_REQUESTS,
  mockGroupsForCurrentUser,
} from "@/lib/mock";
import {
  getCurrentUserRow,
  getFriendsForCurrentUser,
  getProfileStats,
} from "@/lib/data/profile";
import { getGroupsForCurrentUser } from "@/lib/data/groups";

export const dynamic = "force-dynamic";

export default async function ProfilePage() {
  if (USE_MOCK_DATA) {
    const me = MOCK_CURRENT_USER;
    return (
      <AppShell title="Profile">
        <ProfileClient
          me={me}
          stats={{ totalBets: 0, winRate: 0, totalWonCents: 0, currentStreak: 0 }}
          friends={MOCK_FRIENDS}
          pendingRequestsCount={MOCK_INCOMING_FRIEND_REQUESTS.length}
          groups={mockGroupsForCurrentUser()}
        />
      </AppShell>
    );
  }

  const me = (await getCurrentUserRow()) ?? MOCK_CURRENT_USER;
  const [friends, groups, statCounts] = await Promise.all([
    getFriendsForCurrentUser(),
    getGroupsForCurrentUser(),
    getProfileStats(me.id),
  ]);

  // The existing stat grid surfaces "Total bets" — map active-bets count there.
  // Friends and groups counts are surfaced through the friends/groups sections.
  const stats = {
    totalBets: statCounts.activeBetsCount,
    winRate: 0,
    totalWonCents: 0,
    currentStreak: 0,
  };

  return (
    <AppShell title="Profile">
      <ProfileClient
        me={me}
        stats={stats}
        friends={friends}
        pendingRequestsCount={0}
        groups={groups}
      />
    </AppShell>
  );
}
