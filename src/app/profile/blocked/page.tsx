import { AppShell } from "@/components/AppShell";
import { BlockedUsersClient } from "./BlockedUsersClient";
import { USE_MOCK_DATA } from "@/lib/config";
import { getBlockedUsers } from "@/lib/data/blocked";

export const dynamic = "force-dynamic";

export default async function BlockedUsersPage() {
  const initialBlocked = USE_MOCK_DATA ? [] : await getBlockedUsers();

  return (
    <AppShell title="Blocked Users">
      <BlockedUsersClient initialBlocked={initialBlocked} />
    </AppShell>
  );
}
