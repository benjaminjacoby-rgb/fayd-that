import { createClient } from "@/lib/supabase/server";
import type { NotificationRow } from "@/types/db";

interface DbNotificationRow {
  id: string;
  user_id: string;
  type: string;
  reference_id: string | null;
  reference_type: string | null;
  is_read: boolean;
  created_at: string;
}

interface DbFriendshipWithRequester {
  id: string;
  requester_id: string;
  requester: {
    id: string;
    username: string | null;
    full_name: string | null;
    avatar_url: string | null;
  } | null;
}

export async function getUnreadCount(userId: string): Promise<number> {
  const supabase = createClient();
  const { count, error } = await supabase
    .from("notifications")
    .select("*", { count: "exact", head: true })
    .eq("user_id", userId)
    .eq("is_read", false);
  if (error) throw error;
  return count ?? 0;
}

export async function getNotifications(userId: string): Promise<NotificationRow[]> {
  const supabase = createClient();
  const { data, error } = await supabase
    .from("notifications")
    .select("*")
    .eq("user_id", userId)
    .order("created_at", { ascending: false })
    .limit(50);
  if (error) throw error;
  const rows = (data ?? []) as DbNotificationRow[];

  // For friend-request notifications, hydrate the actor (requester) so the
  // UI can render their name + avatar without an extra round-trip.
  const friendshipIds = rows
    .filter((r) => r.type === "friend_request" && r.reference_type === "friendship" && r.reference_id)
    .map((r) => r.reference_id as string);

  const actorByFriendshipId = new Map<string, { name: string | null; avatarUrl: string | null; userId: string }>();
  if (friendshipIds.length > 0) {
    const { data: friendships } = await supabase
      .from("friendships")
      .select("id, requester_id, requester:users!friendships_requester_id_fkey(id, username, full_name, avatar_url)")
      .in("id", friendshipIds);
    for (const f of (friendships ?? []) as unknown as DbFriendshipWithRequester[]) {
      actorByFriendshipId.set(f.id, {
        userId: f.requester?.id ?? f.requester_id,
        name: f.requester?.full_name ?? f.requester?.username ?? null,
        avatarUrl: f.requester?.avatar_url ?? null,
      });
    }
  }

  return rows.map((r) => {
    const actor = r.reference_id ? actorByFriendshipId.get(r.reference_id) : undefined;
    return {
      id: r.id,
      user_id: r.user_id,
      type: r.type,
      payload: {
        reference_id: r.reference_id,
        reference_type: r.reference_type,
        actor_user_id: actor?.userId ?? null,
        actor_name: actor?.name ?? null,
        actor_avatar_url: actor?.avatarUrl ?? null,
      },
      read: r.is_read,
      created_at: r.created_at,
    };
  });
}
