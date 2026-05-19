import { notFound } from "next/navigation";
import { AppShell } from "@/components/AppShell";
import { GroupClient } from "./GroupClient";
import {
  MOCK_CURRENT_USER,
  MOCK_GROUP_MEMBERS,
  MOCK_GROUP_PENDING,
  mockBetsForGroup,
  mockGroupById,
  mockGroupView,
} from "@/lib/mock";

export const dynamic = "force-dynamic";

export default function GroupDetailPage({ params }: { params: { id: string } }) {
  const group = mockGroupById(params.id);
  if (!group) notFound();

  const view = mockGroupView(group);
  const members = MOCK_GROUP_MEMBERS[group.id] ?? [];
  const pending = MOCK_GROUP_PENDING[group.id] ?? [];
  const bets = mockBetsForGroup(group.id);

  return (
    <AppShell title={view.name}>
      <GroupClient
        group={view}
        initialMembers={members}
        initialPending={pending}
        bets={bets}
        currentUser={{
          id: MOCK_CURRENT_USER.id,
          first_name: MOCK_CURRENT_USER.first_name,
          last_name_initial: MOCK_CURRENT_USER.last_name_initial,
          username: MOCK_CURRENT_USER.username,
          avatar_color: MOCK_CURRENT_USER.avatar_color,
        }}
      />
    </AppShell>
  );
}
