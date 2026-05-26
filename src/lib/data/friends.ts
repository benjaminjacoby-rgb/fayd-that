import { createClient } from "@/lib/supabase/server";
import { pickAvatarColor } from "@/lib/avatar";
import type { UserLite } from "@/types/db";

interface DbUser {
  id: string;
  username: string | null;
  full_name: string | null;
  avatar_url: string | null;
}

export interface PendingFriendRequest {
  id: string;
  other: UserLite;
  createdAt: string;
}

/**
 * Returns the current user's accepted friends as UserLite for the
 * FriendsClient list view.
 */
export async function getFriendsForCurrentUserLite(): Promise<UserLite[]> {
  const supabase = createClient();
  const {
    data: { user: authUser },
  } = await supabase.auth.getUser();
  if (!authUser) return [];

  const { data: edges, error } = await supabase
    .from("friendships")
    .select("requester_id, addressee_id, status")
    .eq("status", "accepted")
    .or(`requester_id.eq.${authUser.id},addressee_id.eq.${authUser.id}`);
  if (error) throw error;

  const friendIds = (edges ?? [])
    .map((e) => (e.requester_id === authUser.id ? e.addressee_id : e.requester_id))
    .filter((id): id is string => !!id);
  if (friendIds.length === 0) return [];

  const { data: users, error: uErr } = await supabase
    .from("users")
    .select("id, username, full_name, avatar_url")
    .in("id", friendIds);
  if (uErr) throw uErr;

  return ((users ?? []) as DbUser[]).map(toUserLite);
}

/**
 * Incoming pending friend requests — rows where the current user is the
 * addressee. Each row carries the requester profile as `other`.
 */
export async function getIncomingFriendRequests(): Promise<PendingFriendRequest[]> {
  const supabase = createClient();
  const {
    data: { user: authUser },
  } = await supabase.auth.getUser();
  if (!authUser) return [];

  const { data, error } = await supabase
    .from("friendships")
    .select("id, requester_id, created_at")
    .eq("addressee_id", authUser.id)
    .eq("status", "pending")
    .order("created_at", { ascending: false });
  if (error) throw error;

  const rows = (data ?? []) as Array<{ id: string; requester_id: string | null; created_at: string }>;
  const requesterIds = rows.map((r) => r.requester_id).filter((x): x is string => !!x);
  if (requesterIds.length === 0) return [];

  const { data: usersData, error: uErr } = await supabase
    .from("users")
    .select("id, username, full_name, avatar_url")
    .in("id", requesterIds);
  if (uErr) throw uErr;
  const byId = new Map(((usersData ?? []) as DbUser[]).map((u) => [u.id, u]));

  return rows
    .filter((r) => !!r.requester_id)
    .map((r) => ({
      id: r.id,
      other: toUserLite(byId.get(r.requester_id!) ?? { id: r.requester_id!, username: null, full_name: null, avatar_url: null }),
      createdAt: r.created_at,
    }));
}

/**
 * Outgoing pending friend requests — rows where the current user is the
 * requester. Each row carries the addressee profile as `other`.
 */
export async function getSentFriendRequests(): Promise<PendingFriendRequest[]> {
  const supabase = createClient();
  const {
    data: { user: authUser },
  } = await supabase.auth.getUser();
  if (!authUser) return [];

  const { data, error } = await supabase
    .from("friendships")
    .select("id, addressee_id, created_at")
    .eq("requester_id", authUser.id)
    .eq("status", "pending")
    .order("created_at", { ascending: false });
  if (error) throw error;

  const rows = (data ?? []) as Array<{ id: string; addressee_id: string | null; created_at: string }>;
  const ids = rows.map((r) => r.addressee_id).filter((x): x is string => !!x);
  if (ids.length === 0) return [];

  const { data: usersData, error: uErr } = await supabase
    .from("users")
    .select("id, username, full_name, avatar_url")
    .in("id", ids);
  if (uErr) throw uErr;
  const byId = new Map(((usersData ?? []) as DbUser[]).map((u) => [u.id, u]));

  return rows
    .filter((r) => !!r.addressee_id)
    .map((r) => ({
      id: r.id,
      other: toUserLite(byId.get(r.addressee_id!) ?? { id: r.addressee_id!, username: null, full_name: null, avatar_url: null }),
      createdAt: r.created_at,
    }));
}

function toUserLite(u: DbUser): UserLite {
  const parts = (u.full_name ?? "").trim().split(/\s+/).filter(Boolean);
  const first = parts[0] ?? null;
  const last = parts.length > 1 ? (parts[parts.length - 1][0] ?? "").toUpperCase() : null;
  return {
    id: u.id,
    first_name: first,
    last_name_initial: last && last.length ? last : null,
    username: u.username,
    avatar_color: pickAvatarColor(u.id),
    avatar_url: u.avatar_url ?? null,
  };
}
