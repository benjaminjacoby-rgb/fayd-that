"use client";

import { createClient } from "@/lib/supabase/client";
import { creditWalletCents, deductWalletCents } from "@/lib/data/walletClient";
import type { BetCategory, BetScope, BetSide } from "@/types/db";

export interface CreateBetInput {
  question: string;
  category: BetCategory;
  yes_probability: number;
  stake_cents: number;
  expiry_at: string;
  scope: BetScope;
  group_id: string | null;
  geo_radius_meters: number | null;
  mediator_id: string | null;
  target_friend_ids: string[];
  poster_side: BetSide;
  mediator_type: "none" | "self" | "requested";
}

/**
 * Insert a new bet into the schema defined in
 * supabase/migrations/001_initial_schema.sql. Columns there differ from the
 * UI's BetRow shape, so we translate at the boundary (stake in dollars,
 * uppercase position, audience_type, end_date).
 *
 * Note: target_friend_ids and geo_radius_meters / category / yes_probability
 * have no column in the current schema; they're dropped here. Persisting them
 * would require a follow-up migration.
 */
export async function createBet(input: CreateBetInput): Promise<string> {
  const supabase = createClient();
  const {
    data: { user: authUser },
  } = await supabase.auth.getUser();
  if (!authUser) throw new Error("Not authenticated");

  const audience_type =
    input.scope === "group"
      ? "group"
      : input.scope === "friends" && input.target_friend_ids.length > 0
        ? "specific_friends"
        : "friends";

  const { data, error } = await supabase
    .from("bets")
    .insert({
      poster_id: authUser.id,
      question: input.question,
      poster_position: input.poster_side.toUpperCase(),
      stake_amount: input.stake_cents / 100,
      audience_type,
      group_id: input.scope === "group" ? input.group_id : null,
      end_date: input.expiry_at,
      mediator_type: input.mediator_type,
      mediator_id: input.mediator_id,
      status: "open",
    })
    .select("id")
    .single();
  if (error) throw error;
  // Lock the stake in the user's wallet as part of posting.
  await deductWalletCents(input.stake_cents);
  return data.id as string;
}

/**
 * Fill another user's bet — currently just deducts the stake from the
 * caller's wallet. Persisting the contract / fill rows is handled by the
 * caller (HomeClient) via session state for now.
 */
export async function fillBet(stakeCents: number): Promise<void> {
  await deductWalletCents(stakeCents);
}

/**
 * Cancel a bet the caller posted: marks the bet cancelled and refunds the
 * unfilled portion of the original stake back to the poster's wallet.
 */
export async function cancelBet(params: {
  betId: string;
  refundCents: number;
}): Promise<void> {
  const supabase = createClient();
  const { error } = await supabase
    .from("bets")
    .update({ status: "concluded", is_concluded: true })
    .eq("id", params.betId);
  if (error) throw error;
  if (params.refundCents > 0) {
    await creditWalletCents(params.refundCents);
  }
}
