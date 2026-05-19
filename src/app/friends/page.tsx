import { AppShell } from "@/components/AppShell";
import { FriendsClient } from "./FriendsClient";
import {
  MOCK_FRIENDS,
  MOCK_INCOMING_FRIEND_REQUESTS,
  MOCK_SENT_FRIEND_REQUESTS,
} from "@/lib/mock";

export const dynamic = "force-dynamic";

export default function FriendsPage() {
  return (
    <AppShell title="Friends">
      <FriendsClient
        initialFriends={MOCK_FRIENDS.map((u) => ({
          id: u.id,
          first_name: u.first_name,
          last_name_initial: u.last_name_initial,
          username: u.username,
          avatar_color: u.avatar_color,
        }))}
        initialIncoming={MOCK_INCOMING_FRIEND_REQUESTS}
        initialSent={MOCK_SENT_FRIEND_REQUESTS}
      />
    </AppShell>
  );
}
