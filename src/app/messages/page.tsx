import { AppShell } from "@/components/AppShell";
import { MessagesClient } from "./MessagesClient";
import { USE_MOCK_DATA } from "@/lib/config";
import { MOCK_BETS, MOCK_CURRENT_USER, mockInboxFor } from "@/lib/mock";
import { getCurrentUserRow } from "@/lib/data/profile";
import { getInbox } from "@/lib/data/messages";
import { getFeedBets } from "@/lib/data/bets";

export const dynamic = "force-dynamic";

export default async function MessagesPage() {
  if (USE_MOCK_DATA) {
    const dms = mockInboxFor("dm");
    const groups = mockInboxFor("group");
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

  const me = (await getCurrentUserRow()) ?? MOCK_CURRENT_USER;
  const [{ dms, groups }, bets] = await Promise.all([getInbox(), getFeedBets()]);
  const activeCount = bets.filter((b) => b.status === "open" || b.status === "locked").length;

  return (
    <AppShell title="Messages" pendingCount={activeCount}>
      <MessagesClient dms={dms} groups={groups} currentUserId={me.id} />
    </AppShell>
  );
}
