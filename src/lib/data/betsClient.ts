"use client";

import { createClient } from "@/lib/supabase/client";
import { creditWalletCents, deductWalletCents } from "@/lib/data/walletClient";
import { insertNotification } from "@/lib/data/notificationsClient";
import type { BetScope, BetSide } from "@/types/db";

export interface CreateBetInput {
  question: string;
  yes_probability: number;
  stake_cents: number;
  expiry_at: string;
  /** Poster-chosen expiration date (ISO). Null when the poster left the
   *  "Expires on" field blank — bet has no expiry. */
  expires_at: string | null;
  scope: BetScope;
  group_id: string | null;
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
 * Note: target_friend_ids and yes_probability have no column in the current
 * schema; they're dropped here. The category column was deprecated from the
 * composer in the Social Composer rewrite — the DB column keeps its NOT NULL
 * default of 'other' for legacy compatibility.
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
      expires_at: input.expires_at,
      mediator_type: input.mediator_type,
      mediator_id: input.mediator_id,
      status: "open",
    })
    .select("id")
    .single();
  if (error) throw error;
  // For specific_friends audience, persist the recipient list so RLS can
  // filter the feed. The bet itself is now selectable to the poster (poster
  // branch of user_can_see_bet); the rows below open it up to targets.
  if (audience_type === "specific_friends" && input.target_friend_ids.length > 0) {
    const targetRows = input.target_friend_ids.map((uid) => ({
      bet_id: (data as { id: string }).id,
      user_id: uid,
    }));
    const { error: tgtErr } = await supabase.from("bet_targets").insert(targetRows);
    if (tgtErr) throw tgtErr;

    // Fan out a "bet_targeted" notification to each recipient. insertNotification
    // already short-circuits self-notifications, so passing the poster's own id
    // (theoretically possible via a UI bug) won't ping them.
    await Promise.all(
      input.target_friend_ids.map((uid) =>
        insertNotification({
          userId: uid,
          type: "bet_targeted",
          actorId: authUser.id,
          referenceId: (data as { id: string }).id,
          referenceType: "bet",
        }),
      ),
    );
  }
  // Create an originating contract for the poster reflecting their chosen
  // odds and stake so the feed's weighted-line math can pick it up. We also
  // insert a fill for that contract representing the poster's stake.
  const betId = (data as any).id as string;
  const { data: contractData, error: contractErr } = await supabase
    .from("contracts")
    .insert({
      bet_id: betId,
      creator_id: authUser.id,
      position: input.poster_side.toUpperCase(),
      odds: input.yes_probability,
      stake_amount: input.stake_cents / 100,
      amount_remaining: 0,
      is_filled: true,
    })
    .select("id")
    .single();
  if (contractErr) throw contractErr;
  const contractId = (contractData as any).id as string;
  const { error: fillErr } = await supabase.from("fills").insert({
    contract_id: contractId,
    filler_id: authUser.id,
    amount: input.stake_cents / 100,
  });
  if (fillErr) throw fillErr;
  // Lock the stake in the user's wallet as part of posting.
  await deductWalletCents(input.stake_cents);
  return data.id as string;
}

/**
 * Fill another user's bet — currently just deducts the stake from the
 * caller's wallet. Persisting the contract / fill rows is handled by the
 * caller (HomeClient) via session state for now.
 *
 * When called with a betId, the server-side `expires_at` is re-checked so we
 * can't race a stale UI: if the bet's expiration has passed, the wallet is
 * not touched and the caller receives a BetExpiredError.
 */
export class BetExpiredError extends Error {
  constructor() {
    super("This bet has expired");
    this.name = "BetExpiredError";
  }
}

export async function fillBet(
  stakeCents: number,
  betId?: string,
  /** When provided, fill targets this sub-contract instead of the bet's
   *  original (poster-created) contract. */
  subContractId?: string | null,
): Promise<void> {
  // Legacy callers without betId — preserve old wallet-only behaviour.
  if (!betId) {
    await deductWalletCents(stakeCents);
    return;
  }

  const supabase = createClient();
  const {
    data: { user: authUser },
  } = await supabase.auth.getUser();
  if (!authUser) throw new Error("Not authenticated");

  // 1. Re-check the bet against fresh DB state — closes the stale-UI race
  //    where the user clicks Fayd That just after the bet expired/settled.
  const { data: betData, error: betErr } = await supabase
    .from("bets")
    .select("expires_at, status, is_concluded, poster_id")
    .eq("id", betId)
    .single();
  if (betErr) throw betErr;
  const bet = betData as {
    expires_at: string | null;
    status: string;
    is_concluded: boolean;
    poster_id: string | null;
  } | null;
  if (!bet) throw new Error("Bet not found");
  const isExpired =
    (bet.expires_at !== null && new Date(bet.expires_at).getTime() <= Date.now()) ||
    bet.is_concluded ||
    bet.status === "settled" ||
    bet.status === "concluded";
  if (isExpired) throw new BetExpiredError();

  // 2. Resolve which contract row this fill attaches to. Sub-contract fills
  //    target the sub-contract directly; original-line fills target the
  //    poster's own contract (creator_id === poster_id).
  let contractId: string;
  if (subContractId) {
    contractId = subContractId;
  } else {
    if (!bet.poster_id) throw new Error("Bet has no poster");
    const { data: contractRow, error: cErr } = await supabase
      .from("contracts")
      .select("id")
      .eq("bet_id", betId)
      .eq("creator_id", bet.poster_id)
      .order("created_at", { ascending: true })
      .limit(1)
      .maybeSingle();
    if (cErr) throw cErr;
    if (!contractRow) throw new Error("Original contract not found for bet");
    contractId = (contractRow as { id: string }).id;
  }

  // 3. Persist the fill. Without this row the feed query has no way to know
  //    the bet's open amount changed; that was the visible bug — the card
  //    re-rendered against unchanged DB state on refresh.
  const { error: fillErr } = await supabase.from("fills").insert({
    contract_id: contractId,
    filler_id: authUser.id,
    amount: stakeCents / 100,
  });
  if (fillErr) throw fillErr;

  // 4. Lock the stake in the filler's wallet.
  await deductWalletCents(stakeCents);

  // 5. Notify the bet poster that someone fayded them. For sub-contract fills,
  //    the recipient is the sub-contract creator (whoever posted that line);
  //    for original-line fills, it's the bet poster. Self-fills are silently
  //    skipped by insertNotification, so cancelling/topping-up your own bet
  //    doesn't ping you.
  let recipientId: string | null = bet.poster_id;
  if (subContractId) {
    const { data: subContract } = await supabase
      .from("contracts")
      .select("creator_id")
      .eq("id", subContractId)
      .maybeSingle();
    recipientId = (subContract as { creator_id: string | null } | null)?.creator_id ?? null;
  }
  if (recipientId) {
    await insertNotification({
      userId: recipientId,
      type: "bet_filled",
      actorId: authUser.id,
      referenceId: betId,
      referenceType: "bet",
    });
  }
}

/**
 * Close a bet the caller posted (or mediates): transitions status to "closed"
 * so that resolution voting / mediation becomes available to participants.
 * No wallet changes at this step — funds settle via settleBet.
 */
/**
 * Poster or mediator closes an open bet to new fills. Routed through the
 * `close_bet` RPC (not a plain update) because the caller here is often the
 * mediator, not the poster — the only bets UPDATE policy in RLS
 * (`bets_update_self`) is poster-only, so a direct `.update()` from a
 * mediator would silently match zero rows.
 */
export async function closeBet(betId: string): Promise<void> {
  const supabase = createClient();
  const { error } = await supabase.rpc("close_bet", { target_bet_id: betId });
  if (error) throw error;
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

/**
 * Poster or mediator marks the bet as concluded — flips is_concluded and
 * status='concluded' so the feed surface treats it as done. Wallet settlement
 * is a separate flow (settleBet RPC). Routed through `conclude_bet` for the
 * same reason as closeBet above — a mediator isn't the poster, so a plain
 * `.update()` would silently no-op under RLS.
 */
export async function markBetConcluded(betId: string): Promise<void> {
  const supabase = createClient();
  const { error } = await supabase.rpc("conclude_bet", { target_bet_id: betId });
  if (error) throw error;
}

/**
 * Accept an open mediator-request slot on a bet. Routed through the
 * `accept_mediator` RPC: the accepting user is never the poster (self-
 * mediation is a separate flow), so a plain `.update()` — gated by the
 * poster-only `bets_update_self` RLS policy — would silently match zero
 * rows and leave `mediator_id` unset, even though the call "succeeds".
 */
export async function acceptMediator(betId: string): Promise<void> {
  const supabase = createClient();
  const { error } = await supabase.rpc("accept_mediator", { target_bet_id: betId });
  if (error) throw error;
}

/**
 * Post a new sub-contract (a counter-line) on an existing bet. Inserts the
 * contract row + a self-fill marker (matches how createBet locks the poster's
 * stake), then deducts the stake from the caller's wallet.
 */
export async function postSubContract(input: {
  betId: string;
  posterSide: BetSide;
  yesProbability: number;
  stakeCents: number;
}): Promise<string> {
  const supabase = createClient();
  const {
    data: { user: authUser },
  } = await supabase.auth.getUser();
  if (!authUser) throw new Error("Not authenticated");

  const { data: contract, error: cErr } = await supabase
    .from("contracts")
    .insert({
      bet_id: input.betId,
      creator_id: authUser.id,
      position: input.posterSide.toUpperCase(),
      odds: input.yesProbability,
      stake_amount: input.stakeCents / 100,
      amount_remaining: 0,
      is_filled: true,
    })
    .select("id")
    .single();
  if (cErr) throw cErr;
  const contractId = (contract as { id: string }).id;

  const { error: fErr } = await supabase.from("fills").insert({
    contract_id: contractId,
    filler_id: authUser.id,
    amount: input.stakeCents / 100,
  });
  if (fErr) throw fErr;

  await deductWalletCents(input.stakeCents);
  return contractId;
}
