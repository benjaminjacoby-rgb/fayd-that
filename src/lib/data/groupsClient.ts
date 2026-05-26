"use client";

import { createClient } from "@/lib/supabase/client";
import { pickAvatarColor } from "@/lib/avatar";
import type { GroupView, UserLite } from "@/types/db";

export interface CreateGroupInput {
  name: string;
  invitedUserIds?: string[];
}

/**
 * Insert a row into `groups`, then insert the creator (as admin) plus any
 * invited members into `group_members`. Returns a GroupView for optimistic
 * insertion into the UI.
 */
export async function createGroup(input: CreateGroupInput): Promise<GroupView> {
  const supabase = createClient();
  const {
    data: { user: authUser },
    error: authErr,
  } = await supabase.auth.getUser();
  if (authErr) throw authErr;
  if (!authUser) throw new Error("Not authenticated");

  const joinCode = randomCode();

  const { data: group, error: gErr } = await supabase
    .from("groups")
    .insert({
      name: input.name.trim(),
      join_code: joinCode,
      admin_id: authUser.id,
    })
    .select("id, name, join_code, admin_id, created_at")
    .single();
  if (gErr) throw gErr;

  const memberRows = [
    { group_id: group.id, user_id: authUser.id, role: "admin" as const },
    ...(input.invitedUserIds ?? []).map((uid) => ({
      group_id: group.id,
      user_id: uid,
      role: "member" as const,
    })),
  ];

  const { error: mErr } = await supabase.from("group_members").insert(memberRows);
  if (mErr) throw mErr;
  // The backing group chat conversation + participant rows are created by
  // Postgres triggers (see migration 008): one trigger on `groups` spins up
  // the conversation, another on `group_members` adds each new member to
  // `conversation_participants`. Nothing more to do client-side.

  // Fetch the admin's profile so the returned GroupView has a real `admin` UserLite.
  const { data: meProfile } = await supabase
    .from("users")
    .select("id, username, full_name, avatar_url")
    .eq("id", authUser.id)
    .maybeSingle();

  const admin: UserLite = toUserLite(authUser.id, meProfile ?? null);

  return {
    id: group.id,
    name: group.name,
    invite_code: group.join_code,
    admin_id: group.admin_id ?? authUser.id,
    created_at: group.created_at,
    admin,
    member_count: memberRows.length,
    is_admin: true,
    pending_join_count: 0,
  };
}

/**
 * Add a user to a group as a regular member. The Postgres trigger from
 * migration 008 automatically inserts the user into the group's
 * `conversation_participants`, so the group chat stays in sync. RLS on
 * `group_members` allows this only for the group's admin.
 */
export async function addGroupMember(groupId: string, userId: string): Promise<void> {
  const supabase = createClient();
  const { error } = await supabase
    .from("group_members")
    .insert({ group_id: groupId, user_id: userId, role: "member" });
  if (error) throw error;
}

/**
 * Remove a user from a group. The trigger from migration 011 automatically
 * removes them from `conversation_participants` for that group's
 * conversation, so they lose access to the group chat as well.
 */
export async function removeGroupMember(groupId: string, userId: string): Promise<void> {
  const supabase = createClient();
  const { error } = await supabase
    .from("group_members")
    .delete()
    .match({ group_id: groupId, user_id: userId });
  if (error) throw error;
}

/**
 * Submit a join request for the group with the given invite code.
 * Inserts a group_members row with status='pending'; the group admin
 * can then approve or reject it from the Pending tab.
 */
export async function requestJoinGroup(inviteCode: string): Promise<void> {
  const supabase = createClient();
  const {
    data: { user: authUser },
    error: authErr,
  } = await supabase.auth.getUser();
  if (authErr) throw authErr;
  if (!authUser) throw new Error("Not authenticated");

  const { data: group, error: gErr } = await supabase
    .from("groups")
    .select("id")
    .eq("join_code", inviteCode.toUpperCase())
    .maybeSingle();
  if (gErr) throw gErr;
  if (!group) throw new Error("Invalid invite code");

  // Prevent duplicate requests.
  const { data: existing } = await supabase
    .from("group_members")
    .select("id, status")
    .eq("group_id", (group as { id: string }).id)
    .eq("user_id", authUser.id)
    .maybeSingle();
  if (existing) {
    const status = (existing as { id: string; status: string }).status;
    if (status === "active") throw new Error("You're already a member of this group");
    if (status === "pending") throw new Error("You already have a pending request for this group");
  }

  const { error: iErr } = await supabase
    .from("group_members")
    .insert({ group_id: (group as { id: string }).id, user_id: authUser.id, role: "member", status: "pending" });
  if (iErr) throw iErr;
}

/**
 * Approve a pending join request. Deletes the pending row and inserts an
 * active one so the member gains full group access. RLS requires the caller
 * to be the group's admin.
 */
export async function approveJoinRequest(groupId: string, userId: string): Promise<void> {
  const supabase = createClient();
  const { error: delErr } = await supabase
    .from("group_members")
    .delete()
    .match({ group_id: groupId, user_id: userId, status: "pending" });
  if (delErr) throw delErr;
  const { error: insErr } = await supabase
    .from("group_members")
    .insert({ group_id: groupId, user_id: userId, role: "member", status: "active" });
  if (insErr) throw insErr;
}

/**
 * Transfer admin to another member. RLS requires the caller to be the
 * current admin. Schema only allows one admin per group, so this is a
 * single column update.
 */
export async function transferGroupAdmin(groupId: string, newAdminId: string): Promise<void> {
  const supabase = createClient();
  const { error } = await supabase
    .from("groups")
    .update({ admin_id: newAdminId })
    .eq("id", groupId);
  if (error) throw error;
}

/**
 * Reject (delete) a pending join request. RLS requires the caller to be the
 * group's admin or the requesting user themselves.
 */
export async function rejectJoinRequest(groupId: string, userId: string): Promise<void> {
  const supabase = createClient();
  const { error } = await supabase
    .from("group_members")
    .delete()
    .match({ group_id: groupId, user_id: userId, status: "pending" });
  if (error) throw error;
}

function randomCode(): string {
  const chars = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";
  let out = "";
  for (let i = 0; i < 6; i++) out += chars[Math.floor(Math.random() * chars.length)];
  return out;
}

function toUserLite(
  id: string,
  u: { id: string; username: string | null; full_name: string | null; avatar_url: string | null } | null,
): UserLite {
  const full = u?.full_name ?? null;
  const parts = full ? full.trim().split(/\s+/) : [];
  const first = parts[0] ?? null;
  const last =
    parts.length > 1 ? (parts[parts.length - 1][0] ?? "").toUpperCase() : null;
  return {
    id,
    first_name: first,
    last_name_initial: last && last.length ? last : null,
    username: u?.username ?? null,
    avatar_color: pickAvatarColor(id),
    avatar_url: u?.avatar_url ?? null,
  };
}
