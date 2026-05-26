"use client";

import { createClient } from "@/lib/supabase/client";
import { pickAvatarColor } from "@/lib/avatar";
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
  };
}

export async function getComments(betId: string): Promise<CommentView[]> {
  const supabase = createClient();
  const { data, error } = await supabase
    .from("comments")
    .select(
      "id, bet_id, user_id, content, created_at, user:users!comments_user_id_fkey(id, username, full_name)",
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

export async function postComment(input: {
  betId: string;
  content: string;
}): Promise<CommentView> {
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
    .select(
      "id, bet_id, user_id, content, created_at, user:users!comments_user_id_fkey(id, username, full_name)",
    )
    .single();
  if (error) throw error;
  const row = data as unknown as DbCommentRow;
  return {
    id: row.id,
    user: toUserLite(row.user, row.user_id),
    text: row.content,
    created_at: row.created_at,
  };
}
