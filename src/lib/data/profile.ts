import { createClient } from "@/lib/supabase/server";
import { pickAvatarColor } from "@/lib/avatar";
import type { UserRow } from "@/types/db";

interface DbUser {
  id: string;
  username: string | null;
  full_name: string | null;
  phone_number: string | null;
  avatar_url: string | null;
  wallet_balance: number | null;
  created_at: string;
  has_seen_name_prompt: boolean | null;
}

/**
 * Fetch the signed-in user and map the row from supabase/migrations/001's
 * schema (full_name, phone_number, avatar_url, wallet_balance) onto the UI's
 * historical UserRow shape (first_name/last_name_initial/avatar_color/
 * wallet_balance_cents). Returns null when no session.
 */
export async function getCurrentUserRow(): Promise<UserRow | null> {
  const supabase = createClient();
  const {
    data: { user: authUser },
  } = await supabase.auth.getUser();
  if (!authUser) return null;

  const { data, error } = await supabase
    .from("users")
    .select("id, username, full_name, phone_number, avatar_url, wallet_balance, created_at, has_seen_name_prompt")
    .eq("id", authUser.id)
    .maybeSingle();
  if (error) throw error;
  if (!data) return null;
  return dbUserToUserRow(data as DbUser);
}

/**
 * Friends of the signed-in user (accepted friendships), mapped to UserRow.
 */
export async function getFriendsForCurrentUser(): Promise<UserRow[]> {
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

  const friendIds = (edges ?? []).map((e) =>
    e.requester_id === authUser.id ? e.addressee_id : e.requester_id,
  ).filter((id): id is string => !!id);
  if (friendIds.length === 0) return [];

  const { data: users, error: uErr } = await supabase
    .from("users")
    .select("id, username, full_name, phone_number, avatar_url, wallet_balance, created_at")
    .in("id", friendIds);
  if (uErr) throw uErr;
  return ((users ?? []) as DbUser[]).map(dbUserToUserRow);
}

export interface ProfileStats {
  activeBetsCount: number;
  friendsCount: number;
  groupsCount: number;
}

/** Counts shown on the profile screen. */
export async function getProfileStats(userId: string): Promise<ProfileStats> {
  const supabase = createClient();
  const [activeBets, friends, groups] = await Promise.all([
    supabase
      .from("bets")
      .select("id", { count: "exact", head: true })
      .eq("poster_id", userId)
      .eq("is_concluded", false),
    supabase
      .from("friendships")
      .select("id", { count: "exact", head: true })
      .eq("status", "accepted")
      .or(`requester_id.eq.${userId},addressee_id.eq.${userId}`),
    supabase
      .from("group_members")
      .select("id", { count: "exact", head: true })
      .eq("user_id", userId),
  ]);

  if (activeBets.error) throw activeBets.error;
  if (friends.error) throw friends.error;
  if (groups.error) throw groups.error;

  return {
    activeBetsCount: activeBets.count ?? 0,
    friendsCount: friends.count ?? 0,
    groupsCount: groups.count ?? 0,
  };
}

export function dbUserToUserRow(u: {
  id: string;
  username: string | null;
  full_name: string | null;
  phone_number: string | null;
  avatar_url: string | null;
  wallet_balance: number | null;
  created_at: string;
  has_seen_name_prompt?: boolean | null;
}): UserRow {
  const { first, last } = splitFullName(u.full_name);
  return {
    id: u.id,
    phone: u.phone_number ?? "",
    username: u.username,
    first_name: first,
    last_name_initial: last,
    avatar_color: pickAvatarColor(u.id),
    avatar_url: u.avatar_url,
    stripe_customer_id: null,
    wallet_balance_cents: Math.round(Number(u.wallet_balance ?? 0) * 100),
    created_at: u.created_at,
    has_seen_name_prompt: u.has_seen_name_prompt ?? false,
  };
}

function splitFullName(full: string | null): { first: string | null; last: string | null } {
  if (!full) return { first: null, last: null };
  // Store the entire full name in `first`; `last` is no longer used.
  return { first: full.trim(), last: null };
}
