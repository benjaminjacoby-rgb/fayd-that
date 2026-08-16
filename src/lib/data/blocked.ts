import { createClient } from "@/lib/supabase/server";
import { pickAvatarColor } from "@/lib/avatar";
import type { UserLite } from "@/types/db";

interface DbUser {
  id: string;
  username: string | null;
  full_name: string | null;
  avatar_url: string | null;
}

/** Users the current user has blocked, for the /profile/blocked page. */
export async function getBlockedUsers(): Promise<UserLite[]> {
  const supabase = createClient();
  const {
    data: { user: authUser },
  } = await supabase.auth.getUser();
  if (!authUser) return [];

  const { data: rows, error } = await supabase
    .from("blocked_users")
    .select("blocked_id")
    .eq("blocker_id", authUser.id);
  if (error) throw error;

  const ids = (rows ?? [])
    .map((r) => (r as { blocked_id: string | null }).blocked_id)
    .filter((x): x is string => !!x);
  if (ids.length === 0) return [];

  const { data: users, error: uErr } = await supabase
    .from("users")
    .select("id, username, full_name, avatar_url")
    .in("id", ids);
  if (uErr) throw uErr;

  return ((users ?? []) as DbUser[]).map(toUserLite);
}

function toUserLite(u: DbUser): UserLite {
  return {
    id: u.id,
    first_name: u.full_name?.trim() ?? null,
    last_name_initial: null,
    username: u.username,
    avatar_color: pickAvatarColor(u.id),
    avatar_url: u.avatar_url ?? null,
  };
}
