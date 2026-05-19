import { AppShell } from "@/components/AppShell";
import { GroupsClient } from "./GroupsClient";
import { mockGroupsForCurrentUser } from "@/lib/mock";

export const dynamic = "force-dynamic";

export default function GroupsPage() {
  return (
    <AppShell title="Groups">
      <GroupsClient initialGroups={mockGroupsForCurrentUser()} />
    </AppShell>
  );
}
