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

export interface RevoteRequestRow {
  id: string;
  bet_id: string;
  user_id: string;
  created_at: string;
}

export async function getRevoteRequests(betId: string): Promise<RevoteRequestRow[]> {
  const supabase = createClient();
  const { data, error } = await supabase
    .from("revote_requests")
    .select("id, bet_id, user_id, created_at")
    .eq("bet_id", betId);
  if (error) throw error;
  return (data ?? []) as RevoteRequestRow[];
}

/**
 * Insert a revote request for the current user, then call the
 * `reset_votes_if_all_requested` RPC. Returns true if all participants
 * agreed and votes were cleared (ready for a fresh round), false otherwise.
 */
export async function requestRevote(betId: string): Promise<boolean> {
  const supabase = createClient();
  const {
    data: { user: authUser },
  } = await supabase.auth.getUser();
  if (!authUser) throw new Error("Not authenticated");
  const { error: insErr } = await supabase
    .from("revote_requests")
    .insert({ bet_id: betId, user_id: authUser.id });
  if (insErr) throw insErr;
  const { data: didReset, error: rpcErr } = await supabase.rpc(
    "reset_votes_if_all_requested",
    { target_bet_id: betId },
  );
  if (rpcErr) throw rpcErr;
  return !!didReset;
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
