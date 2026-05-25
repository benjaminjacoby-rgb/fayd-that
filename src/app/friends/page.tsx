import { AppShell } from "@/components/AppShell";
import { FriendsClient } from "./FriendsClient";
import { USE_MOCK_DATA } from "@/lib/config";
import {
  MOCK_FRIENDS,
  MOCK_INCOMING_FRIEND_REQUESTS,
  MOCK_SENT_FRIEND_REQUESTS,
} from "@/lib/mock";
import {
  getFriendsForCurrentUserLite,
  getIncomingFriendRequests,
  getSentFriendRequests,
} from "@/lib/data/friends";

export const dynamic = "force-dynamic";

export default async function FriendsPage() {
  const initialFriends = USE_MOCK_DATA
    ? MOCK_FRIENDS.map((u) => ({
        id: u.id,
        first_name: u.first_name,
        last_name_initial: u.last_name_initial,
        username: u.username,
        avatar_color: u.avatar_color,
      }))
    : await getFriendsForCurrentUserLite();

  const incomingRaw = USE_MOCK_DATA
    ? MOCK_INCOMING_FRIEND_REQUESTS
    : await getIncomingFriendRequests();
  const sentRaw = USE_MOCK_DATA
    ? MOCK_SENT_FRIEND_REQUESTS
    : await getSentFriendRequests();

  // Normalise both shapes (mock vs. server) to what FriendsClient expects.
  const initialIncoming = incomingRaw.map((r) => ({
    id: r.id,
    other: r.other,
    mutualCount: "mutualCount" in r ? (r as { mutualCount: number }).mutualCount : 0,
    createdAt: r.createdAt,
  }));
  const initialSent = sentRaw.map((r) => ({
    id: r.id,
    other: r.other,
    mutualCount: "mutualCount" in r ? (r as { mutualCount: number }).mutualCount : 0,
    createdAt: r.createdAt,
  }));

  return (
    <AppShell title="Friends">
      <FriendsClient
        initialFriends={initialFriends}
        initialIncoming={initialIncoming}
        initialSent={initialSent}
      />
    </AppShell>
  );
}
