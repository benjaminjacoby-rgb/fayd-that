"use client";

import { createClient } from "@/lib/supabase/client";
import type { NotificationRow } from "@/types/db";

interface DbNotification {
  id: string;
  user_id: string;
  type: string;
  reference_id: string | null;
  reference_type: string | null;
  is_read: boolean;
  created_at: string;
}

export interface InsertNotificationInput {
  userId: string;
  type: string;
  referenceId?: string | null;
  referenceType?: string | null;
}

export async function insertNotification(input: InsertNotificationInput): Promise<void> {
  const supabase = createClient();
  const { error } = await supabase.from("notifications").insert({
    user_id: input.userId,
    type: input.type,
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
  return ((data ?? []) as DbNotification[]).map(toNotificationRow);
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

function toNotificationRow(n: DbNotification): NotificationRow {
  return {
    id: n.id,
    user_id: n.user_id,
    type: n.type,
    payload: {
      reference_id: n.reference_id,
      reference_type: n.reference_type,
    },
    read: n.is_read,
    created_at: n.created_at,
  };
}
