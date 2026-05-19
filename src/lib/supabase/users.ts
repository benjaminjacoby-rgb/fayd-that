import { createClient } from "@/lib/supabase/server";
import type { UserRow } from "@/types/db";

export async function getCurrentUser(): Promise<UserRow | null> {
  const supabase = createClient();
  const {
    data: { user: authUser },
  } = await supabase.auth.getUser();
  if (!authUser) return null;

  const { data, error } = await supabase
    .from("users")
    .select("*")
    .eq("id", authUser.id)
    .maybeSingle();

  if (error) throw error;
  return (data as UserRow | null) ?? null;
}

export async function isUsernameAvailable(username: string): Promise<boolean> {
  const supabase = createClient();
  const { data, error } = await supabase
    .from("users")
    .select("id")
    .ilike("username", username)
    .maybeSingle();
  if (error) throw error;
  return !data;
}

export interface UpsertProfileInput {
  first_name: string;
  last_name_initial: string;
  username: string;
  avatar_color: string;
  phone: string;
}

export async function upsertProfile(input: UpsertProfileInput): Promise<UserRow> {
  const supabase = createClient();
  const {
    data: { user: authUser },
  } = await supabase.auth.getUser();
  if (!authUser) throw new Error("Not authenticated");

  const { data, error } = await supabase
    .from("users")
    .upsert({
      id: authUser.id,
      phone: input.phone,
      first_name: input.first_name,
      last_name_initial: input.last_name_initial.slice(0, 1).toUpperCase(),
      username: input.username.toLowerCase(),
      avatar_color: input.avatar_color,
    })
    .select("*")
    .single();

  if (error) throw error;
  return data as UserRow;
}
