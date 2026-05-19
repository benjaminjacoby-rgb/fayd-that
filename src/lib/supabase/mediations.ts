import { createClient } from "@/lib/supabase/server";
import type { BetSide } from "@/types/db";

export async function getMediationsForUser(userId: string) {
  const supabase = createClient();
  const { data, error } = await supabase
    .from("mediations")
    .select(`
      *,
      bet:bets(
        *,
        participants:bet_participants(*, user:users(id, first_name, last_name_initial, username, avatar_color))
      )
    `)
    .eq("mediator_id", userId)
    .order("created_at", { ascending: false });
  if (error) throw error;
  return data ?? [];
}

export async function submitRuling(mediationId: string, ruling: BetSide, feeCents: number) {
  const supabase = createClient();
  const { error } = await supabase
    .from("mediations")
    .update({ ruling, status: "ruling_submitted", fee_cents: feeCents })
    .eq("id", mediationId);
  if (error) throw error;
}
