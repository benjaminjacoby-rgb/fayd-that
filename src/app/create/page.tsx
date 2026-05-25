import { AppShell } from "@/components/AppShell";
import { CreateBetClient } from "./CreateBetClient";
import { USE_MOCK_DATA } from "@/lib/config";
import { MOCK_FRIENDS, MOCK_CURRENT_USER, mockGroupsForCurrentUser } from "@/lib/mock";
import { getCurrentUserRow, getFriendsForCurrentUser } from "@/lib/data/profile";
import { getGroupsForUser } from "@/lib/supabase/groups";

export const dynamic = "force-dynamic";

export default async function CreatePage() {
  // The older getCurrentUser / getFriendsForUser helpers returned raw rows
  // using the obsolete first_name/last_name_initial/avatar_color/
  // wallet_balance_cents shape. The DB actually uses the migration-001 columns
  // (full_name, avatar_url, wallet_balance), so we use the boundary-mapped
  // helpers here — otherwise walletCents is undefined (blocking the submit
  // button) and friend avatars/names render as "?-".
  const me = USE_MOCK_DATA ? MOCK_CURRENT_USER : (await getCurrentUserRow()) ?? MOCK_CURRENT_USER;
  const friends = USE_MOCK_DATA ? MOCK_FRIENDS : await getFriendsForCurrentUser();
  // CreateBetClient only needs id/name/invite_code for the dropdown; GroupView is a superset.
  const groups = USE_MOCK_DATA ? mockGroupsForCurrentUser() : await getGroupsForUser(me.id);

  return (
    <AppShell title="Post a Bet">
      <CreateBetClient
        walletCents={me.wallet_balance_cents}
        friends={friends}
        groups={groups}
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
