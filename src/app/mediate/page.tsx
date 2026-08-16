import { AppShell } from "@/components/AppShell";
import { MediateClient } from "./MediateClient";
import { USE_MOCK_DATA } from "@/lib/config";
import { MOCK_CURRENT_USER, mockMediationQueue } from "@/lib/mock";
import { getCurrentUserRow } from "@/lib/data/profile";
import { getMediationQueue } from "@/lib/data/bets";

export const dynamic = "force-dynamic";

export default async function MediatePage() {
  const me = USE_MOCK_DATA ? MOCK_CURRENT_USER : (await getCurrentUserRow()) ?? MOCK_CURRENT_USER;
  const bets = USE_MOCK_DATA ? mockMediationQueue() : await getMediationQueue(me.id);

  return (
    <AppShell title="Mediate">
      <MediateClient bets={bets} currentUserId={me.id} />
    </AppShell>
  );
}
