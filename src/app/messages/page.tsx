import { AppShell } from "@/components/AppShell";
import { MessagesClient } from "./MessagesClient";
import { USE_MOCK_DATA } from "@/lib/config";
import { MOCK_BETS, MOCK_CURRENT_USER, mockInboxFor } from "@/lib/mock";

export const dynamic = "force-dynamic";

export default async function MessagesPage() {
  // Mock-only for now — when wired, swap in a server-side query against
  // a future `conversations` table.
  const dms = USE_MOCK_DATA ? mockInboxFor("dm") : [];
  const groups = USE_MOCK_DATA ? mockInboxFor("group") : [];
  const me = MOCK_CURRENT_USER;
  const activeCount = MOCK_BETS.filter(
    (b) => b.status === "open" || b.status === "locked",
  ).length;

  return (
    <AppShell title="Messages" pendingCount={activeCount}>
      <MessagesClient dms={dms} groups={groups} currentUserId={me.id} />
    </AppShell>
  );
}
