import { notFound } from "next/navigation";
import { AppShell } from "@/components/AppShell";
import { GroupClient } from "./GroupClient";
import { USE_MOCK_DATA } from "@/lib/config";
import {
  MOCK_CURRENT_USER,
  MOCK_GROUP_MEMBERS,
  MOCK_GROUP_PENDING,
  mockBetsForGroup,
  mockGroupById,
  mockGroupView,
} from "@/lib/mock";
import { getGroupsForCurrentUser } from "@/lib/data/groups";
import { createClient } from "@/lib/supabase/server";
import { pickAvatarColor } from "@/lib/avatar";
import type { GroupView, UserLite } from "@/types/db";

export const dynamic = "force-dynamic";

export default async function GroupDetailPage({ params }: { params: { id: string } }) {
  if (USE_MOCK_DATA) {
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

  // Real Supabase path — find the group among the current user's memberships.
  const groups = await getGroupsForCurrentUser();
  const view: GroupView | undefined = groups.find((g) => g.id === params.id);
  if (!view) notFound();

  const supabase = createClient();
  const {
    data: { user: authUser },
  } = await supabase.auth.getUser();

  const members = await loadGroupMembers(params.id);

  return (
    <AppShell title={view.name}>
      <GroupClient
        group={view}
        initialMembers={members}
        initialPending={[]}
        bets={[]}
        currentUser={{
          id: authUser?.id ?? "",
          first_name: members.find((m) => m.id === authUser?.id)?.first_name ?? null,
          last_name_initial: members.find((m) => m.id === authUser?.id)?.last_name_initial ?? null,
          username: members.find((m) => m.id === authUser?.id)?.username ?? null,
          avatar_color: pickAvatarColor(authUser?.id ?? ""),
        }}
      />
    </AppShell>
  );
}

async function loadGroupMembers(groupId: string): Promise<UserLite[]> {
  const supabase = createClient();
  const { data: rows, error } = await supabase
    .from("group_members")
    .select("user_id")
    .eq("group_id", groupId);
  if (error || !rows?.length) return [];

  const userIds = rows.map((r) => r.user_id).filter((id): id is string => !!id);
  if (!userIds.length) return [];

  const { data: users, error: uErr } = await supabase
    .from("users")
    .select("id, username, full_name")
    .in("id", userIds);
  if (uErr || !users) return [];

  return users.map((u) => {
    const { first, last } = splitFullName(u.full_name ?? null);
    return {
      id: u.id,
      first_name: first,
      last_name_initial: last,
      username: u.username ?? null,
      avatar_color: pickAvatarColor(u.id),
    };
  });
}

function splitFullName(full: string | null): { first: string | null; last: string | null } {
  if (!full) return { first: null, last: null };
  const parts = full.trim().split(/\s+/);
  const first = parts[0] ?? null;
  const last = parts.length > 1 ? (parts[parts.length - 1][0] ?? "").toUpperCase() : null;
  return { first, last: last && last.length ? last : null };
}
