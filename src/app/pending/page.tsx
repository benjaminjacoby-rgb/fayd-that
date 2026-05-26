import { AppShell } from "@/components/AppShell";
import { PendingClient } from "./PendingClient";
import { USE_MOCK_DATA } from "@/lib/config";
import { MOCK_CURRENT_USER } from "@/lib/mock";
import { getCurrentUserRow } from "@/lib/data/profile";
import { getPendingActivity } from "@/lib/data/pending";
import { pickAvatarColor } from "@/lib/avatar";
import type { UserLite } from "@/types/db";

export const dynamic = "force-dynamic";

export default async function PendingPage() {
  if (USE_MOCK_DATA) {
    const me = MOCK_CURRENT_USER;
    return (
      <AppShell title="My Bets">
        <PendingClient
          currentUser={{
            id: me.id,
            first_name: me.first_name,
            last_name_initial: me.last_name_initial,
            username: me.username,
            avatar_color: me.avatar_color,
          }}
          initialPosts={[]}
          initialContracts={[]}
          initialResolvedPosts={[]}
          initialResolvedContracts={[]}
        />
      </AppShell>
    );
  }

  const userRow = await getCurrentUserRow();
  const { posts, contracts, resolvedPosts, resolvedContracts } = await getPendingActivity();

  const currentUser: UserLite = userRow
    ? {
        id: userRow.id,
        first_name: userRow.first_name,
        last_name_initial: userRow.last_name_initial,
        username: userRow.username,
        avatar_color: userRow.avatar_color ?? pickAvatarColor(userRow.id),
      }
    : {
        id: MOCK_CURRENT_USER.id,
        first_name: MOCK_CURRENT_USER.first_name,
        last_name_initial: MOCK_CURRENT_USER.last_name_initial,
        username: MOCK_CURRENT_USER.username,
        avatar_color: MOCK_CURRENT_USER.avatar_color,
      };

  return (
    <AppShell title="My Bets">
      <PendingClient
        currentUser={currentUser}
        initialPosts={posts}
        initialContracts={contracts}
        initialResolvedPosts={resolvedPosts}
        initialResolvedContracts={resolvedContracts}
      />
    </AppShell>
  );
}
