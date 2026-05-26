"use client";

import { createClient } from "@/lib/supabase/client";
import { pickAvatarColor } from "@/lib/avatar";
import { insertNotification } from "@/lib/data/notificationsClient";
import type { CommentView, UserLite } from "@/types/db";

interface DbCommentRow {
  id: string;
  bet_id: string;
  user_id: string;
  content: string;
  created_at: string;
  user: {
    id: string;
    username: string | null;
    full_name: string | null;
    avatar_url: string | null;
  } | null;
}

function toUserLite(row: DbCommentRow["user"], fallbackId: string): UserLite {
  const id = row?.id ?? fallbackId;
  const full = row?.full_name?.trim() ?? "";
  const parts = full.length ? full.split(/\s+/) : [];
  const first = parts[0] ?? null;
  const last = parts.length > 1 ? (parts[parts.length - 1][0] ?? "").toUpperCase() : null;
  return {
    id,
    first_name: first,
    last_name_initial: last && last.length ? last : null,
    username: row?.username ?? null,
    avatar_color: pickAvatarColor(id),
    avatar_url: row?.avatar_url ?? null,
  };
}

export async function getComments(betId: string): Promise<CommentView[]> {
  const supabase = createClient();
  const { data, error } = await supabase
    .from("comments")
    .select(
      "id, bet_id, user_id, content, created_at, user:users!comments_user_id_fkey(id, username, full_name, avatar_url)",
    )
    .eq("bet_id", betId)
    .order("created_at", { ascending: false })
    .limit(50);
  if (error) throw error;
  const rows = (data ?? []) as unknown as DbCommentRow[];
  return rows.map((r) => ({
    id: r.id,
    user: toUserLite(r.user, r.user_id),
    text: r.content,
    created_at: r.created_at,
  }));
}

export interface PostedComment {
  id: string;
  bet_id: string;
  user_id: string;
  content: string;
  created_at: string;
}

/**
 * Insert a comment and return the raw row. The caller composes a CommentView
 * from this + a local UserLite, so the success path no longer depends on the
 * users! FK embed resolving (which was silently failing the optimistic update).
 */
export async function postComment(input: {
  betId: string;
  content: string;
}): Promise<PostedComment> {
  const supabase = createClient();
  const {
    data: { user: authUser },
  } = await supabase.auth.getUser();
  if (!authUser) throw new Error("Not authenticated");
  const trimmed = input.content.trim();
  if (!trimmed) throw new Error("Empty comment");
  const { data, error } = await supabase
    .from("comments")
    .insert({ bet_id: input.betId, user_id: authUser.id, content: trimmed })
    .select("id, bet_id, user_id, content, created_at")
    .single();
  if (error) throw error;

  // Notify the bet poster (skipping when the commenter is the poster).
  const { data: betRow } = await supabase
    .from("bets")
    .select("poster_id")
    .eq("id", input.betId)
    .maybeSingle();
  const posterId = (betRow as { poster_id: string | null } | null)?.poster_id ?? null;
  if (posterId) {
    await insertNotification({
      userId: posterId,
      type: "bet_commented",
      actorId: authUser.id,
      referenceId: input.betId,
      referenceType: "bet",
    });
  }

  return data as PostedComment;
}
