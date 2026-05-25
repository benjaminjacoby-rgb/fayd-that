"use client";

import { createClient } from "@/lib/supabase/client";
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
  return data.id as string;
}
