"use client";

import { createClient } from "@/lib/supabase/client";
import type { NotificationRow } from "@/types/db";

interface DbNotification {
  id: string;
  user_id: string;
  type: string;
  actor_id: string | null;
  reference_id: string | null;
  reference_type: string | null;
  is_read: boolean;
  created_at: string;
}

export interface InsertNotificationInput {
  userId: string;
  type: string;
  /** The user who performed the action (filler, commenter, settler, etc.). */
  actorId?: string | null;
  referenceId?: string | null;
  referenceType?: string | null;
}

export async function insertNotification(input: InsertNotificationInput): Promise<void> {
  // Reject self-notifications at the call site so every event handler doesn't
  // need to remember to guard. A user shouldn't be pinged for things they did
  // themselves (their own fill, their own comment, their own settle, etc.).
  if (input.actorId && input.actorId === input.userId) return;

  const supabase = createClient();
  const { error } = await supabase.from("notifications").insert({
    user_id: input.userId,
    type: input.type,
    actor_id: input.actorId ?? null,
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

interface DbUserMini {
  id: string;
  username: string | null;
  full_name: string | null;
  avatar_url: string | null;
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

  // Hydrate actors in one round-trip. `actor_id` covers everything written by
  // the new code paths; rows that pre-date migration 010 get backfilled by
  // that migration, so we don't need a per-type fallback any more.
  const actorIds = Array.from(
    new Set(rows.map((r) => r.actor_id).filter((x): x is string => !!x)),
  );
  const usersById = new Map<string, DbUserMini>();
  if (actorIds.length > 0) {
    const { data: users } = await supabase
      .from("users")
      .select("id, username, full_name, avatar_url")
      .in("id", actorIds);
    for (const u of (users ?? []) as DbUserMini[]) usersById.set(u.id, u);
  }

  // Bet-typed notifications carry the bet question in the payload so the UI
  // can render "filled your bet: <question>" without a per-row lookup.
  const betIds = Array.from(
    new Set(
      rows
        .filter((r) => r.reference_type === "bet" && r.reference_id)
        .map((r) => r.reference_id as string),
    ),
  );
  const betQuestionById = new Map<string, string>();
  if (betIds.length > 0) {
    const { data: bets } = await supabase
      .from("bets")
      .select("id, question")
      .in("id", betIds);
    for (const b of (bets ?? []) as Array<{ id: string; question: string }>) {
      betQuestionById.set(b.id, b.question);
    }
  }

  return rows.map((n) => buildRow(n, usersById, betQuestionById));
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

function buildRow(
  n: DbNotification,
  usersById: Map<string, DbUserMini>,
  betQuestionById: Map<string, string>,
): NotificationRow {
  const actor = n.actor_id ? usersById.get(n.actor_id) : undefined;
  const betQuestion =
    n.reference_type === "bet" && n.reference_id
      ? betQuestionById.get(n.reference_id) ?? null
      : null;
  return {
    id: n.id,
    user_id: n.user_id,
    type: n.type,
    payload: {
      reference_id: n.reference_id,
      reference_type: n.reference_type,
      actor_user_id: actor?.id ?? n.actor_id ?? null,
      actor_name: actor?.full_name ?? actor?.username ?? null,
      actor_avatar_url: actor?.avatar_url ?? null,
      bet_question: betQuestion,
    },
    read: n.is_read,
    created_at: n.created_at,
  };
}
