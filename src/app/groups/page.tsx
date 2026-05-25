import { AppShell } from "@/components/AppShell";
import { GroupsClient } from "./GroupsClient";
import { USE_MOCK_DATA } from "@/lib/config";
import { mockGroupsForCurrentUser } from "@/lib/mock";
import { getGroupsForCurrentUser } from "@/lib/data/groups";

export const dynamic = "force-dynamic";

export default async function GroupsPage() {
  const groups = USE_MOCK_DATA ? mockGroupsForCurrentUser() : await getGroupsForCurrentUser();
  return (
    <AppShell title="Groups">
      <GroupsClient initialGroups={groups} />
    </AppShell>
  );
}
