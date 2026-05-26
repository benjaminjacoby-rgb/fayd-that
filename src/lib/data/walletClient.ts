"use client";

import { createClient } from "@/lib/supabase/client";

// Wallet adjustments. Uses the adjust_wallet_balance RPC (migration 005) so
// the read-modify-write happens atomically server-side. Amounts cross the
// boundary as cents; the DB column stores dollars.

export async function adjustWalletCents(deltaCents: number): Promise<void> {
  const supabase = createClient();
  const { error } = await supabase.rpc("adjust_wallet_balance", {
    delta: deltaCents / 100,
  });
  if (error) throw error;
}

export async function deductWalletCents(amountCents: number): Promise<void> {
  return adjustWalletCents(-Math.abs(amountCents));
}

export async function creditWalletCents(amountCents: number): Promise<void> {
  return adjustWalletCents(Math.abs(amountCents));
}
