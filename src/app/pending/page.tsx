import { AppShell } from "@/components/AppShell";
import { PendingClient } from "./PendingClient";
import { MOCK_CURRENT_USER } from "@/lib/mock";

export const dynamic = "force-dynamic";

export default function PendingPage() {
  // All pending content now comes from the client-side session store so it
  // stays in sync with in-session activity (Fayd That fills + new posts).
  const me = MOCK_CURRENT_USER;
  return (
    <AppShell title="Pending">
      <PendingClient
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
