import { createClient } from "@/lib/supabase/server";
import { IS_PAYMENTS_LIVE } from "@/lib/config";

/**
 * Place a hold on the user's wallet for a bet stake.
 *
 * Mock mode (IS_PAYMENTS_LIVE=false): just deducts wallet_balance_cents and
 * marks the participant row paid. No real money moves.
 *
 * Live mode (TODO): create a Stripe PaymentIntent against the user's saved
 * payment method, transfer to platform escrow account, save the
 * payment_intent_id on the bet_participants row.
 */
export async function holdStakeForBet(opts: {
  betId: string;
  userId: string;
  stakeCents: number;
}): Promise<{ paymentIntentId: string | null }> {
  const supabase = createClient();

  if (!IS_PAYMENTS_LIVE) {
    const { data: user, error: e1 } = await supabase
      .from("users")
      .select("wallet_balance_cents")
      .eq("id", opts.userId)
      .single();
    if (e1) throw e1;
    if ((user?.wallet_balance_cents ?? 0) < opts.stakeCents) {
      throw new Error("Insufficient wallet balance");
    }
    await supabase
      .from("users")
      .update({ wallet_balance_cents: user.wallet_balance_cents - opts.stakeCents })
      .eq("id", opts.userId);
    await supabase
      .from("bet_participants")
      .update({ paid_at: new Date().toISOString() })
      .eq("bet_id", opts.betId)
      .eq("user_id", opts.userId);
    return { paymentIntentId: null };
  }

  // TODO: live Stripe path
  throw new Error("Live Stripe path not implemented yet");
}

export async function releaseEscrowToWinners(_betId: string): Promise<void> {
  // TODO: walk bet_participants, credit winners' wallet_balance_cents with their
  // share of the pot (less the mediator's cut, when applicable). In live mode,
  // transfer funds out of platform escrow.
}
