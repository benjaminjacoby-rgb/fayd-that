import { AppShell } from "@/components/AppShell";
import { PendingClient } from "./PendingClient";
import { USE_MOCK_DATA } from "@/lib/config";
import { MOCK_BETS, MOCK_CURRENT_USER } from "@/lib/mock";
import { getCurrentUser } from "@/lib/supabase/users";
import { getPendingBetsForUser } from "@/lib/supabase/bets";

export const dynamic = "force-dynamic";

export default async function PendingPage() {
  const me = USE_MOCK_DATA ? MOCK_CURRENT_USER : (await getCurrentUser()) ?? MOCK_CURRENT_USER;
  const bets = USE_MOCK_DATA
    ? MOCK_BETS.filter((b) => b.participants.some((p) => p.user_id === me.id) || b.creator_id === me.id)
    : await getPendingBetsForUser(me.id);

  return (
    <AppShell title="Pending" pendingCount={bets.length}>
      <PendingClient bets={bets} currentUserId={me.id} />
    </AppShell>
  );
}
