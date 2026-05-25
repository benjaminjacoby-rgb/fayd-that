"use client";

import { createClient } from "@/lib/supabase/client";
import { pickAvatarColor } from "@/lib/avatar";
import { insertNotification } from "@/lib/data/notificationsClient";
import type { UserRow } from "@/types/db";

interface DbUser {
  id: string;
  username: string | null;
  full_name: string | null;
  phone_number: string | null;
  avatar_url: string | null;
}

/**
 * Search users by username, full_name, or phone_number prefix. Excludes the
 * current user. Returns at most 10 matches.
 */
export async function searchUsers(query: string): Promise<UserRow[]> {
  const q = query.trim();
  if (!q) return [];
  const supabase = createClient();
  const {
    data: { user: authUser },
  } = await supabase.auth.getUser();

  const like = `%${q}%`;
  const { data, error } = await supabase
    .from("users")
    .select("id, username, full_name, phone_number, avatar_url")
    .or(`username.ilike.${like},full_name.ilike.${like},phone_number.ilike.${like}`)
    .limit(10);
  if (error) throw error;
  const rows = (data ?? []) as DbUser[];
  return rows
    .filter((u) => !authUser || u.id !== authUser.id)
    .map(toUserRow);
}

export async function sendFriendRequest(addresseeId: string): Promise<string> {
  const supabase = createClient();
  const {
    data: { user: authUser },
  } = await supabase.auth.getUser();
  if (!authUser) throw new Error("Not authenticated");

  const { data, error } = await supabase
    .from("friendships")
    .insert({
      requester_id: authUser.id,
      addressee_id: addresseeId,
      status: "pending",
    })
    .select("id")
    .single();
  if (error) throw error;

  // Notify the recipient.
  await insertNotification({
    userId: addresseeId,
    type: "friend_request",
    referenceId: data.id,
    referenceType: "friendship",
  });

  return data.id;
}

export async function acceptFriendRequest(friendshipId: string): Promise<void> {
  const supabase = createClient();
  const {
    data: { user: authUser },
  } = await supabase.auth.getUser();
  if (!authUser) throw new Error("Not authenticated");

  const { data, error } = await supabase
    .from("friendships")
    .update({ status: "accepted" })
    .eq("id", friendshipId)
    .select("requester_id, addressee_id")
    .single();
  if (error) throw error;

  // Notify the original requester that the request was accepted.
  if (data?.requester_id && data.requester_id !== authUser.id) {
    await insertNotification({
      userId: data.requester_id,
      type: "friend_request_accepted",
      referenceId: friendshipId,
      referenceType: "friendship",
    });
  }
}

/**
 * The schema only allows status in ('pending','accepted'), so "decline" is a
 * delete rather than a status update.
 */
export async function declineFriendRequest(friendshipId: string): Promise<void> {
  const supabase = createClient();
  const { error } = await supabase.from("friendships").delete().eq("id", friendshipId);
  if (error) throw error;
}

export async function cancelSentFriendRequest(friendshipId: string): Promise<void> {
  // Same as decline — remove the pending row.
  return declineFriendRequest(friendshipId);
}

function toUserRow(u: DbUser): UserRow {
  const parts = (u.full_name ?? "").trim().split(/\s+/).filter(Boolean);
  const first = parts[0] ?? null;
  const last = parts.length > 1 ? (parts[parts.length - 1][0] ?? "").toUpperCase() : null;
  return {
    id: u.id,
    phone: u.phone_number ?? "",
    username: u.username,
    first_name: first,
    last_name_initial: last && last.length ? last : null,
    avatar_color: pickAvatarColor(u.id),
    stripe_customer_id: null,
    wallet_balance_cents: 0,
    created_at: "",
  };
}
