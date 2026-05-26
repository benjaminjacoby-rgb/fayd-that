import { createClient } from "@/lib/supabase/server";
import { getFeedBets } from "@/lib/data/bets";
import type { BetSide, BetView } from "@/types/db";

export interface PendingPostRow {
  bet: BetView;
}

export interface PendingContractRow {
  /** Stable id — the contract row id from the DB. */
  id: string;
  bet: BetView;
  /** Whichever side this user took on the contract. */
  side: BetSide;
  /** Always YES probability — UI flips when showing the taker's side. */
  yesPercent: number;
  stakeCents: number;
  createdAt: string;
}

/**
 * Pending activity for the signed-in user: bets they posted (still unsettled)
 * and contracts they've taken on someone else's bet (still unsettled).
 *
 * Used by the Pending page so that resolution UI works for bets created across
 * sessions, not just things from the in-memory session store.
 */
export async function getPendingActivity(): Promise<{
  posts: PendingPostRow[];
  contracts: PendingContractRow[];
}> {
  const supabase = createClient();
  const {
    data: { user: authUser },
  } = await supabase.auth.getUser();
  if (!authUser) return { posts: [], contracts: [] };

  // Pull all feed-visible bets and partition. getFeedBets already maps the DB
  // schema to BetView and excludes bets the user can't see (RLS). We treat
  // "pending" as anything not concluded/settled.
  const allBets = await getFeedBets();
  const unresolved = allBets.filter(
    (b) => !b.post_meta?.concluded && b.status !== "resolved",
  );

  const posts: PendingPostRow[] = unresolved
    .filter((b) => b.creator_id === authUser.id)
    .map((b) => ({ bet: b }));

  // Build active contracts via fills the user has placed against contracts
  // they don't own (i.e., taking the other side of a bet/sub-contract).
  const unresolvedIds = unresolved.map((b) => b.id);
  if (unresolvedIds.length === 0) return { posts, contracts: [] };

  const { data: contractRows } = await supabase
    .from("contracts")
    .select("id, bet_id, creator_id, position, odds")
    .in("bet_id", unresolvedIds);

  const contractMap = new Map<
    string,
    { id: string; bet_id: string; creator_id: string | null; position: "YES" | "NO" | null; odds: number }
  >();
  for (const c of (contractRows ?? []) as Array<{
    id: string;
    bet_id: string;
    creator_id: string | null;
    position: "YES" | "NO" | null;
    odds: number;
  }>) {
    contractMap.set(c.id, c);
  }

  const { data: fillRows } = contractRows && contractRows.length
    ? await supabase
        .from("fills")
        .select("id, contract_id, filler_id, amount, created_at")
        .eq("filler_id", authUser.id)
        .in("contract_id", contractRows.map((c) => c.id))
    : { data: [] as Array<{
        id: string;
        contract_id: string;
        filler_id: string | null;
        amount: number;
        created_at: string;
      }> };

  const byBet = new Map(unresolved.map((b) => [b.id, b] as const));
  const contracts: PendingContractRow[] = [];
  for (const f of (fillRows ?? []) as Array<{
    id: string;
    contract_id: string;
    filler_id: string | null;
    amount: number;
    created_at: string;
  }>) {
    const c = contractMap.get(f.contract_id);
    if (!c) continue;
    // Self-fills (filler === creator) are the poster's own stake marker;
    // those bets show in `posts`, not as active contracts.
    if (c.creator_id === authUser.id) continue;
    const bet = byBet.get(c.bet_id);
    if (!bet) continue;
    // Filler took the opposite of the contract's stated position.
    const fillerSide: BetSide = c.position === "YES" ? "no" : "yes";
    contracts.push({
      id: f.id,
      bet,
      side: fillerSide,
      yesPercent: Math.round(c.odds),
      stakeCents: Math.round(Number(f.amount) * 100),
      createdAt: f.created_at,
    });
  }
  contracts.sort((a, b) => b.createdAt.localeCompare(a.createdAt));

  return { posts, contracts };
}
