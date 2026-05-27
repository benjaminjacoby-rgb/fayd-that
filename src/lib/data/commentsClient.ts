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

  const [commentsRes, authRes] = await Promise.all([
    supabase
      .from("comments")
      .select(
        "id, bet_id, user_id, content, created_at, user:users!comments_user_id_fkey(id, username, full_name, avatar_url)",
      )
      .eq("bet_id", betId)
      .order("created_at", { ascending: false })
      .limit(50),
    supabase.auth.getUser(),
  ]);
  if (commentsRes.error) throw commentsRes.error;
  const rows = (commentsRes.data ?? []) as unknown as DbCommentRow[];
  if (rows.length === 0) return [];

  const currentUserId = authRes.data.user?.id ?? null;
  const commentIds = rows.map((r) => r.id);

  // Fetch like counts and current-user likes in one query.
  const { data: likesData } = await supabase
    .from("comment_likes")
    .select("comment_id, user_id")
    .in("comment_id", commentIds);
  const likes = (likesData ?? []) as { comment_id: string; user_id: string }[];

  const likeCountMap = new Map<string, number>();
  const likedByMeSet = new Set<string>();
  for (const l of likes) {
    likeCountMap.set(l.comment_id, (likeCountMap.get(l.comment_id) ?? 0) + 1);
    if (currentUserId && l.user_id === currentUserId) likedByMeSet.add(l.comment_id);
  }

  return rows.map((r) => ({
    id: r.id,
    user: toUserLite(r.user, r.user_id),
    text: r.content,
    created_at: r.created_at,
    like_count: likeCountMap.get(r.id) ?? 0,
    liked_by_me: likedByMeSet.has(r.id),
  }));
}

/** Like a comment. No-op if already liked (unique constraint handles duplicate inserts). */
export async function likeComment(commentId: string): Promise<void> {
  const supabase = createClient();
  const {
    data: { user: authUser },
  } = await supabase.auth.getUser();
  if (!authUser) throw new Error("Not authenticated");
  const { error } = await supabase
    .from("comment_likes")
    .insert({ comment_id: commentId, user_id: authUser.id });
  // Ignore unique-violation (23505) — already liked is a no-op.
  if (error && error.code !== "23505") throw error;
}

/** Unlike a comment. No-op if the user hadn't liked it. */
export async function unlikeComment(commentId: string): Promise<void> {
  const supabase = createClient();
  const {
    data: { user: authUser },
  } = await supabase.auth.getUser();
  if (!authUser) throw new Error("Not authenticated");
  const { error } = await supabase
    .from("comment_likes")
    .delete()
    .match({ comment_id: commentId, user_id: authUser.id });
  if (error) throw error;
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
