import { CreateBetClient } from "./CreateBetClient";
import { USE_MOCK_DATA } from "@/lib/config";
import { MOCK_FRIENDS, MOCK_CURRENT_USER, mockGroupsForCurrentUser } from "@/lib/mock";
import { getCurrentUserRow, getFriendsForCurrentUser } from "@/lib/data/profile";
import { getGroupsForUser } from "@/lib/supabase/groups";
import { createClient } from "@/lib/supabase/server";

export const dynamic = "force-dynamic";

export default async function CreatePage() {
  const me = USE_MOCK_DATA ? MOCK_CURRENT_USER : (await getCurrentUserRow()) ?? MOCK_CURRENT_USER;
  const friends = USE_MOCK_DATA ? MOCK_FRIENDS : await getFriendsForCurrentUser();
  const groups = USE_MOCK_DATA ? mockGroupsForCurrentUser() : await getGroupsForUser(me.id);

  // Member counts for the group picker cards. Single query, grouped client-side.
  const groupMemberCounts: Record<string, number> = {};
  if (!USE_MOCK_DATA && groups.length > 0) {
    const supabase = createClient();
    const { data } = await supabase
      .from("group_members")
      .select("group_id")
      .in(
        "group_id",
        groups.map((g) => g.id),
      );
    for (const row of (data ?? []) as Array<{ group_id: string }>) {
      groupMemberCounts[row.group_id] = (groupMemberCounts[row.group_id] ?? 0) + 1;
    }
  }

  return (
    <CreateBetClient
      walletCents={me.wallet_balance_cents}
      friends={friends}
      groups={groups}
      groupMemberCounts={groupMemberCounts}
      currentUser={{
        id: me.id,
        first_name: me.first_name,
        last_name_initial: me.last_name_initial,
        username: me.username,
        avatar_color: me.avatar_color,
        avatar_url: me.avatar_url ?? null,
      }}
    />
  );
}
