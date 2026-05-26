"use client";

import { createClient } from "@/lib/supabase/client";
import type { Reaction } from "@/types/db";

interface DbReactionRow {
  id: string;
  bet_id: string;
  user_id: string;
  emoji: string;
}

/**
 * Fetch reactions for a set of bets. Returns a map of bet_id → Reaction[]
 * collapsing rows into per-emoji counts and tagging the rows the current
 * user contributed (so the chip can light up).
 *
 * Server-side bets loader uses this to seed `bet.post_meta.reactions` with
 * real data instead of an empty array.
 */
export async function getReactionsForBets(
  betIds: string[],
  currentUserId: string,
): Promise<Map<string, Reaction[]>> {
  const out = new Map<string, Reaction[]>();
  if (betIds.length === 0) return out;
  const supabase = createClient();
  const { data, error } = await supabase
    .from("bet_reactions")
    .select("id, bet_id, user_id, emoji")
    .in("bet_id", betIds);
  if (error) return out;
  const rows = (data ?? []) as DbReactionRow[];
  // bet_id → emoji → { count, reactedByMe }
  const grouped = new Map<string, Map<string, { count: number; reactedByMe: boolean }>>();
  for (const r of rows) {
    const byEmoji = grouped.get(r.bet_id) ?? new Map();
    const cell = byEmoji.get(r.emoji) ?? { count: 0, reactedByMe: false };
    cell.count += 1;
    if (r.user_id === currentUserId) cell.reactedByMe = true;
    byEmoji.set(r.emoji, cell);
    grouped.set(r.bet_id, byEmoji);
  }
  for (const [betId, byEmoji] of grouped) {
    const arr: Reaction[] = [];
    for (const [emoji, { count, reactedByMe }] of byEmoji) {
      arr.push({ emoji, count, reactedByMe });
    }
    arr.sort((a, b) => b.count - a.count || a.emoji.localeCompare(b.emoji));
    out.set(betId, arr);
  }
  return out;
}

/**
 * Toggle the current user's reaction with `emoji` on `betId`. Returns the new
 * state so callers can optimistically update without an extra round-trip.
 *
 * Implementation: try to delete first (idempotent). If nothing was deleted,
 * insert. The (bet_id, user_id, emoji) unique index in migration 011 enforces
 * the "one of each emoji per bet" invariant even under racy double-taps.
 */
export async function toggleReaction(
  betId: string,
  emoji: string,
): Promise<{ reactedByMe: boolean }> {
  const supabase = createClient();
  const {
    data: { user: authUser },
  } = await supabase.auth.getUser();
  if (!authUser) throw new Error("Not authenticated");

  const { data: deleted } = await supabase
    .from("bet_reactions")
    .delete()
    .match({ bet_id: betId, user_id: authUser.id, emoji })
    .select("id");
  if (deleted && deleted.length > 0) {
    return { reactedByMe: false };
  }
  const { error: insErr } = await supabase
    .from("bet_reactions")
    .insert({ bet_id: betId, user_id: authUser.id, emoji });
  if (insErr) {
    // Unique-violation = a concurrent toggle already inserted it. Treat as
    // "reacted" instead of bubbling the error.
    const isDup =
      (insErr as { code?: string }).code === "23505" ||
      /duplicate key/i.test((insErr as { message?: string }).message ?? "");
    if (!isDup) throw insErr;
  }
  return { reactedByMe: true };
}
