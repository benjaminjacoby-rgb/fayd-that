"use client";

import { createClient } from "@/lib/supabase/client";

export interface UpdateProfileInput {
  fullName?: string | null;
  username?: string | null;
  avatarUrl?: string | null;
}

/**
 * Patch the signed-in user's row in `public.users`. Only fields present in
 * the input are written, so callers can update one column at a time. RLS
 * already restricts updates to `auth.uid() = id`, so a logged-in user can
 * only edit their own row.
 */
export async function updateProfile(input: UpdateProfileInput): Promise<void> {
  const supabase = createClient();
  const {
    data: { user: authUser },
  } = await supabase.auth.getUser();
  if (!authUser) throw new Error("Not authenticated");

  const patch: Record<string, string | null> = {};
  if (input.fullName !== undefined) patch.full_name = input.fullName?.trim() || null;
  if (input.username !== undefined) patch.username = input.username?.trim() || null;
  if (input.avatarUrl !== undefined) patch.avatar_url = input.avatarUrl;
  if (Object.keys(patch).length === 0) return;

  const { error } = await supabase.from("users").update(patch).eq("id", authUser.id);
  if (error) throw error;
}

/**
 * Upload an avatar image to the `avatars` storage bucket. The file is placed
 * under `<uid>/<timestamp>.<ext>` so the RLS policy can verify ownership by
 * folder name. Returns the public URL of the uploaded object.
 */
export async function uploadAvatar(file: File): Promise<string> {
  const supabase = createClient();
  const {
    data: { user: authUser },
  } = await supabase.auth.getUser();
  if (!authUser) throw new Error("Not authenticated");

  // Strip everything but ext from the original filename; the file may have an
  // arbitrary name we don't want to round-trip into storage.
  const dotIdx = file.name.lastIndexOf(".");
  const ext = (dotIdx > 0 ? file.name.slice(dotIdx + 1) : "jpg").toLowerCase();
  const path = `${authUser.id}/${Date.now()}.${ext}`;

  const { error: upErr } = await supabase.storage
    .from("avatars")
    .upload(path, file, { upsert: true, cacheControl: "3600", contentType: file.type });
  if (upErr) throw upErr;

  const { data } = supabase.storage.from("avatars").getPublicUrl(path);
  return data.publicUrl;
}

/**
 * Mark `has_seen_name_prompt = true` so the one-time name-update popup is
 * never shown again for this user.
 */
export async function dismissNamePrompt(): Promise<void> {
  const supabase = createClient();
  const {
    data: { user: authUser },
  } = await supabase.auth.getUser();
  if (!authUser) return;
  await supabase.from("users").update({ has_seen_name_prompt: true }).eq("id", authUser.id);
}

/**
 * Mark `has_seen_welcome = true` so the one-time welcome walkthrough is
 * never shown again for this user.
 */
export async function dismissWelcome(): Promise<void> {
  const supabase = createClient();
  const {
    data: { user: authUser },
  } = await supabase.auth.getUser();
  if (!authUser) return;
  await supabase.from("users").update({ has_seen_welcome: true }).eq("id", authUser.id);
}

/**
 * Check whether a username is available. Returns true if no other user has
 * it (case-insensitive). Used to give the user immediate feedback in the
 * edit-profile sheet instead of failing at save-time on the unique index.
 */
export async function isUsernameAvailable(username: string, currentUserId: string): Promise<boolean> {
  const trimmed = username.trim();
  if (!trimmed) return false;
  const supabase = createClient();
  const { data, error } = await supabase
    .from("users")
    .select("id")
    .ilike("username", trimmed)
    .neq("id", currentUserId)
    .limit(1);
  if (error) return true; // be permissive — final unique-index check still applies
  return (data ?? []).length === 0;
}
