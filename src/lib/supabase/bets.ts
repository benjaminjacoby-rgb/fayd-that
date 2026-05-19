import { createClient } from "@/lib/supabase/server";
import type { BetRow, BetSide, BetView } from "@/types/db";

const BET_SELECT = `
  *,
  creator:users!bets_creator_id_fkey(id, first_name, last_name_initial, username, avatar_color),
  participants:bet_participants(
    *,
    user:users(id, first_name, last_name_initial, username, avatar_color)
  )
`;

export async function getFeedBets(): Promise<BetView[]> {
  const supabase = createClient();
  // RLS enforces visibility — caller only sees bets they're allowed to see.
  const { data, error } = await supabase
    .from("bets")
    .select(BET_SELECT)
    .in("status", ["open", "locked"])
    .order("created_at", { ascending: false })
    .limit(50);
  if (error) throw error;
  return (data ?? []) as unknown as BetView[];
}

export async function getPendingBetsForUser(userId: string): Promise<BetView[]> {
  const supabase = createClient();
  const { data, error } = await supabase
    .from("bets")
    .select(BET_SELECT)
    .in("status", ["open", "locked", "disputed"])
    .or(`creator_id.eq.${userId},id.in.(${await participantBetIds(userId)})`);
  if (error) throw error;
  return (data ?? []) as unknown as BetView[];
}

async function participantBetIds(userId: string): Promise<string> {
  const supabase = createClient();
  const { data } = await supabase
    .from("bet_participants")
    .select("bet_id")
    .eq("user_id", userId);
  const ids = (data ?? []).map((r) => r.bet_id);
  return ids.length ? ids.join(",") : "00000000-0000-0000-0000-000000000000";
}

export interface CreateBetInput {
  question: string;
  category: BetRow["category"];
  yes_probability: number;
  stake_cents: number;
  expiry_at: string;
  scope: BetRow["scope"];
  group_id?: string | null;
  geo_lat?: number | null;
  geo_lng?: number | null;
  geo_radius_meters?: number | null;
  mediator_id?: string | null;
}

export async function createBet(input: CreateBetInput): Promise<BetRow> {
  const supabase = createClient();
  const {
    data: { user: authUser },
  } = await supabase.auth.getUser();
  if (!authUser) throw new Error("Not authenticated");

  const { data: bet, error } = await supabase
    .from("bets")
    .insert({
      creator_id: authUser.id,
      question: input.question,
      category: input.category,
      yes_probability: input.yes_probability,
      stake_cents: input.stake_cents,
      expiry_at: input.expiry_at,
      scope: input.scope,
      group_id: input.group_id ?? null,
      geo_lat: input.geo_lat ?? null,
      geo_lng: input.geo_lng ?? null,
      geo_radius_meters: input.geo_radius_meters ?? null,
    })
    .select("*")
    .single();
  if (error) throw error;

  // Creator joins as YES by default.
  await supabase.from("bet_participants").insert({
    bet_id: bet.id,
    user_id: authUser.id,
    side: "yes",
    stake_cents: input.stake_cents,
  });

  if (input.mediator_id) {
    await supabase.from("mediations").insert({
      bet_id: bet.id,
      mediator_id: input.mediator_id,
    });
  }
  return bet as BetRow;
}

export async function joinBet(betId: string, side: BetSide, stakeCents: number) {
  const supabase = createClient();
  const {
    data: { user: authUser },
  } = await supabase.auth.getUser();
  if (!authUser) throw new Error("Not authenticated");
  const { error } = await supabase.from("bet_participants").insert({
    bet_id: betId,
    user_id: authUser.id,
    side,
    stake_cents: stakeCents,
  });
  if (error) throw error;
}

export async function submitOutcome(betId: string, outcome: BetSide) {
  // Each side records their claimed outcome; backend reconciles in a follow-up
  // job (or via a Postgres trigger). For Phase 1, both participants flagging
  // the same outcome should resolve the bet; mismatches mark it disputed.
  // TODO: move this reconciliation into a Supabase Edge Function.
  const supabase = createClient();
  const {
    data: { user: authUser },
  } = await supabase.auth.getUser();
  if (!authUser) throw new Error("Not authenticated");

  const { data: parts, error } = await supabase
    .from("bet_participants")
    .select("user_id, side, outcome")
    .eq("bet_id", betId);
  if (error) throw error;

  const myPart = parts?.find((p) => p.user_id === authUser.id);
  if (!myPart) throw new Error("Not a participant");
  const iWin = myPart.side === outcome;

  await supabase
    .from("bet_participants")
    .update({ outcome: iWin ? "win" : "lose" })
    .eq("bet_id", betId)
    .eq("user_id", authUser.id);

  const updated = (parts ?? []).map((p) =>
    p.user_id === authUser.id ? { ...p, outcome: iWin ? "win" : "lose" } : p,
  );

  const allReported = updated.every((p) => p.outcome != null);
  if (!allReported) return;

  const winners = updated.filter((p) => p.outcome === "win").map((p) => p.side);
  const consistent = winners.every((s) => s === outcome);
  await supabase
    .from("bets")
    .update({
      status: consistent ? "resolved" : "disputed",
      resolved_at: consistent ? new Date().toISOString() : null,
    })
    .eq("id", betId);
}
