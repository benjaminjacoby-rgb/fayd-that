import { createClient } from "@/lib/supabase/server";
import type { GroupRow } from "@/types/db";

export async function getGroupsForUser(userId: string): Promise<GroupRow[]> {
  const supabase = createClient();
  const { data, error } = await supabase
    .from("group_members")
    .select("group:groups(*)")
    .eq("user_id", userId);
  if (error) throw error;
  // PostgREST returns nested rows as arrays; flatten and coerce.
  return ((data ?? []).flatMap((r: { group: GroupRow | GroupRow[] | null }) =>
    Array.isArray(r.group) ? r.group : r.group ? [r.group] : [],
  )) as GroupRow[];
}
