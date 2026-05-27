import { createClient } from "@/lib/supabase/server";
import { pickAvatarColor } from "@/lib/avatar";
import type { GroupView, UserLite } from "@/types/db";

interface DbGroup {
  id: string;
  name: string;
  join_code: string;
  admin_id: string | null;
  created_at: string;
}

interface DbUser {
  id: string;
  username: string | null;
  full_name: string | null;
  avatar_url: string | null;
}

/**
 * Groups the signed-in user is a member of, shaped for the existing
 * GroupsClient/ProfileClient components (GroupView).
 */
export async function getGroupsForCurrentUser(): Promise<GroupView[]> {
  const supabase = createClient();
  const {
    data: { user: authUser },
  } = await supabase.auth.getUser();
  if (!authUser) return [];

  const { data: memberships, error: mErr } = await supabase
    .from("group_members")
    .select("group_id")
    .eq("user_id", authUser.id);
  if (mErr) throw mErr;

  const groupIds = (memberships ?? []).map((m) => m.group_id).filter((g): g is string => !!g);
  if (groupIds.length === 0) return [];

  const [groupsRes, countsRes] = await Promise.all([
    supabase.from("groups").select("*").in("id", groupIds),
    supabase.from("group_members").select("group_id").in("group_id", groupIds),
  ]);
  if (groupsRes.error) throw groupsRes.error;
  if (countsRes.error) throw countsRes.error;

  const groups = (groupsRes.data ?? []) as DbGroup[];

  const memberCounts = new Map<string, number>();
  for (const row of (countsRes.data ?? []) as Array<{ group_id: string | null }>) {
    if (!row.group_id) continue;
    memberCounts.set(row.group_id, (memberCounts.get(row.group_id) ?? 0) + 1);
  }

  // Pull admin user rows in one shot so each group's `admin` UserLite is real.
  const adminIds = Array.from(
    new Set(groups.map((g) => g.admin_id).filter((id): id is string => !!id)),
  );
  const adminsById = new Map<string, DbUser>();
  if (adminIds.length) {
    const { data: adminsData, error: aErr } = await supabase
      .from("users")
      .select("id, username, full_name, avatar_url")
      .in("id", adminIds);
    if (aErr) throw aErr;
    for (const a of (adminsData ?? []) as DbUser[]) adminsById.set(a.id, a);
  }

  return groups.map((g) => toGroupView(g, memberCounts.get(g.id) ?? 0, adminsById, authUser.id));
}

function toGroupView(
  g: DbGroup,
  memberCount: number,
  adminsById: Map<string, DbUser>,
  currentUserId: string,
): GroupView {
  const adminUser = g.admin_id ? adminsById.get(g.admin_id) : undefined;
  const admin = toUserLite(g.admin_id, adminUser);
  return {
    id: g.id,
    name: g.name,
    invite_code: g.join_code,
    admin_id: g.admin_id ?? "",
    created_at: g.created_at,
    admin,
    member_count: memberCount,
    is_admin: g.admin_id === currentUserId,
    pending_join_count: 0,
  };
}

function toUserLite(id: string | null | undefined, u: DbUser | undefined): UserLite {
  const safeId = id ?? u?.id ?? "unknown";
  const { first, last } = splitFullName(u?.full_name ?? null);
  return {
    id: safeId,
    first_name: first,
    last_name_initial: last,
    username: u?.username ?? null,
    avatar_color: pickAvatarColor(safeId),
    avatar_url: u?.avatar_url ?? null,
  };
}

function splitFullName(full: string | null): { first: string | null; last: string | null } {
  if (!full) return { first: null, last: null };
  // Store the entire full name in `first`; `last` is no longer used.
  return { first: full.trim(), last: null };
}
