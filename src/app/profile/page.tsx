import { AppShell } from "@/components/AppShell";
import { ProfileClient } from "./ProfileClient";
import { USE_MOCK_DATA } from "@/lib/config";
import {
  MOCK_CURRENT_USER,
  MOCK_FRIENDS,
  MOCK_INCOMING_FRIEND_REQUESTS,
  mockGroupsForCurrentUser,
} from "@/lib/mock";
import { getCurrentUser } from "@/lib/supabase/users";
import { getFriendsForUser, getPendingFriendRequests } from "@/lib/supabase/friends";

export const dynamic = "force-dynamic";

export default async function ProfilePage() {
  const me = USE_MOCK_DATA ? MOCK_CURRENT_USER : (await getCurrentUser()) ?? MOCK_CURRENT_USER;
  const friends = USE_MOCK_DATA ? MOCK_FRIENDS : await getFriendsForUser(me.id);
  const incomingCount = USE_MOCK_DATA
    ? MOCK_INCOMING_FRIEND_REQUESTS.length
    : (await getPendingFriendRequests(me.id)).length;
  const groups = USE_MOCK_DATA ? mockGroupsForCurrentUser() : [];

  // TODO: derive these from resolved bet_participants rows for this user.
  const stats = { totalBets: 0, winRate: 0, totalWonCents: 0, currentStreak: 0 };

  return (
    <AppShell title="Profile">
      <ProfileClient
        me={me}
        stats={stats}
        friends={friends}
        pendingRequestsCount={incomingCount}
        groups={groups}
      />
    </AppShell>
  );
}
