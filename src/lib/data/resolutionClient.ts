"use client";

import { createClient } from "@/lib/supabase/client";
import type { BetSide } from "@/types/db";

export interface VoteRow {
  id: string;
  bet_id: string;
  voter_id: string;
  vote: "YES" | "NO";
  created_at: string;
}

export async function getVotes(betId: string): Promise<VoteRow[]> {
  const supabase = createClient();
  const { data, error } = await supabase
    .from("votes")
    .select("id, bet_id, voter_id, vote, created_at")
    .eq("bet_id", betId);
  if (error) throw error;
  return (data ?? []) as VoteRow[];
}

export async function castVote(input: {
  betId: string;
  side: BetSide;
}): Promise<VoteRow> {
  const supabase = createClient();
  const {
    data: { user: authUser },
  } = await supabase.auth.getUser();
  if (!authUser) throw new Error("Not authenticated");
  const { data, error } = await supabase
    .from("votes")
    .insert({
      bet_id: input.betId,
      voter_id: authUser.id,
      vote: input.side.toUpperCase(),
    })
    .select("id, bet_id, voter_id, vote, created_at")
    .single();
  if (error) throw error;
  return data as VoteRow;
}

export async function settleBet(input: {
  betId: string;
  side: BetSide;
}): Promise<void> {
  const supabase = createClient();
  const { error } = await supabase.rpc("settle_bet", {
    target_bet_id: input.betId,
    winning_side: input.side.toUpperCase(),
  });
  if (error) throw error;
}
