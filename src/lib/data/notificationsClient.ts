"use client";

import { createClient } from "@/lib/supabase/client";
import type { NotificationRow } from "@/types/db";

interface DbNotification {
  id: string;
  user_id: string;
  type: string;
  reference_id: string | null;
  reference_type: string | null;
  is_read: boolean;
  created_at: string;
}

export interface InsertNotificationInput {
  userId: string;
  type: string;
  referenceId?: string | null;
  referenceType?: string | null;
}

export async function insertNotification(input: InsertNotificationInput): Promise<void> {
  const supabase = createClient();
  const { error } = await supabase.from("notifications").insert({
    user_id: input.userId,
    type: input.type,
    reference_id: input.referenceId ?? null,
    reference_type: input.referenceType ?? null,
  });
  if (error) {
    // Notifications failing should not block the originating action.
    console.warn("insertNotification failed", error);
  }
}

export async function getUnreadCount(): Promise<number> {
  const supabase = createClient();
  const {
    data: { user: authUser },
  } = await supabase.auth.getUser();
  if (!authUser) return 0;
  const { count, error } = await supabase
    .from("notifications")
    .select("*", { count: "exact", head: true })
    .eq("user_id", authUser.id)
    .eq("is_read", false);
  if (error) return 0;
  return count ?? 0;
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

export async function getNotifications(): Promise<NotificationRow[]> {
  const supabase = createClient();
  const {
    data: { user: authUser },
  } = await supabase.auth.getUser();
  if (!authUser) return [];
  const { data, error } = await supabase
    .from("notifications")
    .select("*")
    .eq("user_id", authUser.id)
    .order("created_at", { ascending: false })
    .limit(50);
  if (error) return [];
  const rows = (data ?? []) as DbNotification[];

  const friendshipIds = rows
    .filter(
      (r) => r.type === "friend_request" && r.reference_type === "friendship" && r.reference_id,
    )
    .map((r) => r.reference_id as string);
  const actorByFriendshipId = new Map<
    string,
    { userId: string; name: string | null; avatarUrl: string | null }
  >();
  if (friendshipIds.length > 0) {
    const { data: friendships } = await supabase
      .from("friendships")
      .select(
        "id, requester_id, requester:users!friendships_requester_id_fkey(id, username, full_name, avatar_url)",
      )
      .in("id", friendshipIds);
    for (const f of (friendships ?? []) as unknown as DbFriendshipWithRequester[]) {
      actorByFriendshipId.set(f.id, {
        userId: f.requester?.id ?? f.requester_id,
        name: f.requester?.full_name ?? f.requester?.username ?? null,
        avatarUrl: f.requester?.avatar_url ?? null,
      });
    }
  }

  return rows.map((n) => {
    const actor = n.reference_id ? actorByFriendshipId.get(n.reference_id) : undefined;
    return {
      id: n.id,
      user_id: n.user_id,
      type: n.type,
      payload: {
        reference_id: n.reference_id,
        reference_type: n.reference_type,
        actor_user_id: actor?.userId ?? null,
        actor_name: actor?.name ?? null,
        actor_avatar_url: actor?.avatarUrl ?? null,
      },
      read: n.is_read,
      created_at: n.created_at,
    };
  });
}

export async function markAllRead(): Promise<void> {
  const supabase = createClient();
  const {
    data: { user: authUser },
  } = await supabase.auth.getUser();
  if (!authUser) return;
  const { error } = await supabase
    .from("notifications")
    .update({ is_read: true })
    .eq("user_id", authUser.id)
    .eq("is_read", false);
  if (error) console.warn("markAllRead failed", error);
}

function toNotificationRow(n: DbNotification): NotificationRow {
  return {
    id: n.id,
    user_id: n.user_id,
    type: n.type,
    payload: {
      reference_id: n.reference_id,
      reference_type: n.reference_type,
    },
    read: n.is_read,
    created_at: n.created_at,
  };
}
