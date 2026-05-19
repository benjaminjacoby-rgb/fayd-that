import { createClient } from "@/lib/supabase/server";
import type { UserRow } from "@/types/db";

export async function getFriendsForUser(userId: string): Promise<UserRow[]> {
  const supabase = createClient();
  const { data: edges, error } = await supabase
    .from("friendships")
    .select("requester_id, addressee_id, status")
    .eq("status", "accepted")
    .or(`requester_id.eq.${userId},addressee_id.eq.${userId}`);
  if (error) throw error;

  const friendIds = (edges ?? []).map((e) =>
    e.requester_id === userId ? e.addressee_id : e.requester_id,
  );
  if (friendIds.length === 0) return [];

  const { data: users, error: e2 } = await supabase
    .from("users")
    .select("*")
    .in("id", friendIds);
  if (e2) throw e2;
  return (users ?? []) as UserRow[];
}

export async function getPendingFriendRequests(userId: string) {
  const supabase = createClient();
  const { data, error } = await supabase
    .from("friendships")
    .select("*, requester:users!friendships_requester_id_fkey(*)")
    .eq("addressee_id", userId)
    .eq("status", "pending");
  if (error) throw error;
  return data ?? [];
}
