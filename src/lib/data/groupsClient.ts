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
    .select("id, username, full_name")
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

function randomCode(): string {
  const chars = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";
  let out = "";
  for (let i = 0; i < 6; i++) out += chars[Math.floor(Math.random() * chars.length)];
  return out;
}

function toUserLite(
  id: string,
  u: { id: string; username: string | null; full_name: string | null } | null,
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
  };
}
