"use client";

import { createClient } from "@/lib/supabase/client";

export async function blockUser(userId: string): Promise<void> {
  const supabase = createClient();
  const {
    data: { user: authUser },
  } = await supabase.auth.getUser();
  if (!authUser) throw new Error("Not authenticated");

  const { error } = await supabase
    .from("blocked_users")
    .insert({ blocker_id: authUser.id, blocked_id: userId });
  if (error) throw error;
}

export async function unblockUser(userId: string): Promise<void> {
  const supabase = createClient();
  const {
    data: { user: authUser },
  } = await supabase.auth.getUser();
  if (!authUser) throw new Error("Not authenticated");

  const { error } = await supabase
    .from("blocked_users")
    .delete()
    .eq("blocker_id", authUser.id)
    .eq("blocked_id", userId);
  if (error) throw error;
}
