import { AppShell } from "@/components/AppShell";
import { CreateBetClient } from "./CreateBetClient";
import { USE_MOCK_DATA } from "@/lib/config";
import { MOCK_FRIENDS, MOCK_CURRENT_USER, mockGroupsForCurrentUser } from "@/lib/mock";
import { getCurrentUser } from "@/lib/supabase/users";
import { getFriendsForUser } from "@/lib/supabase/friends";
import { getGroupsForUser } from "@/lib/supabase/groups";

export const dynamic = "force-dynamic";

export default async function CreatePage() {
  const me = USE_MOCK_DATA ? MOCK_CURRENT_USER : (await getCurrentUser()) ?? MOCK_CURRENT_USER;
  const friends = USE_MOCK_DATA ? MOCK_FRIENDS : await getFriendsForUser(me.id);
  // CreateBetClient only needs id/name/invite_code for the dropdown; GroupView is a superset.
  const groups = USE_MOCK_DATA ? mockGroupsForCurrentUser() : await getGroupsForUser(me.id);

  return (
    <AppShell title="New bet">
      <CreateBetClient walletCents={me.wallet_balance_cents} friends={friends} groups={groups} />
    </AppShell>
  );
}
