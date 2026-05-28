"use client";

import { createClient } from "@/lib/supabase/client";
import type { BetSide } from "@/types/db";

/**
 * Toggle the signed-in user's poll vote on a bet.
 *
 * - If the user hasn't voted: inserts a new row.
 * - If the user voted the same side: deletes the row (un-vote).
 * - If the user voted the other side: updates to the new side.
 *
 * Returns the resulting vote side (null if the vote was cleared).
 */
export async function togglePollVote(
  betId: string,
  side: BetSide,
): Promise<BetSide | null> {
  const supabase = createClient();
  const {
    data: { user: authUser },
  } = await supabase.auth.getUser();
  if (!authUser) throw new Error("Not authenticated");

  // Check for an existing vote.
  const { data: existing, error: selErr } = await supabase
    .from("bet_poll_votes")
    .select("id, vote")
    .eq("bet_id", betId)
    .eq("user_id", authUser.id)
    .maybeSingle();
  if (selErr) throw selErr;

  if (!existing) {
    // No vote yet — insert.
    const { error } = await supabase.from("bet_poll_votes").insert({
      bet_id: betId,
      user_id: authUser.id,
      vote: side,
    });
    if (error) throw error;
    return side;
  }

  if (existing.vote === side) {
    // Same side — toggle off (delete).
    const { error } = await supabase
      .from("bet_poll_votes")
      .delete()
      .eq("id", existing.id);
    if (error) throw error;
    return null;
  }

  // Different side — update.
  const { error } = await supabase
    .from("bet_poll_votes")
    .update({ vote: side })
    .eq("id", existing.id);
  if (error) throw error;
  return side;
}
