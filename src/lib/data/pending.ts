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
 * Activity for the signed-in user: bets they posted and contracts they've
 * taken on someone else's bet, split into active (unresolved) and history
 * (resolved). Used by the My Bets page so that resolution UI works across
 * sessions.
 */
export async function getPendingActivity(): Promise<{
  posts: PendingPostRow[];
  contracts: PendingContractRow[];
  resolvedPosts: PendingPostRow[];
  resolvedContracts: PendingContractRow[];
}> {
  const supabase = createClient();
  const {
    data: { user: authUser },
  } = await supabase.auth.getUser();
  if (!authUser) return { posts: [], contracts: [], resolvedPosts: [], resolvedContracts: [] };

  const allBets = await getFeedBets();

  // Partition into active (unresolved/closed) vs resolved.
  const unresolved = allBets.filter(
    (b) => !b.post_meta?.concluded && b.status !== "resolved",
  );
  const resolved = allBets.filter(
    (b) => b.post_meta?.concluded || b.status === "resolved",
  );

  const posts: PendingPostRow[] = unresolved
    .filter((b) => b.creator_id === authUser.id)
    .map((b) => ({ bet: b }));

  const resolvedPosts: PendingPostRow[] = resolved
    .filter((b) => b.creator_id === authUser.id)
    .map((b) => ({ bet: b }));

  // Build active + resolved contracts from fills the user placed on other
  // people's bets.
  const allRelevantBets = [...unresolved, ...resolved];
  const allRelevantIds = allRelevantBets.map((b) => b.id);
  if (allRelevantIds.length === 0) {
    return { posts, contracts: [], resolvedPosts, resolvedContracts: [] };
  }

  const { data: contractRows } = await supabase
    .from("contracts")
    .select("id, bet_id, creator_id, position, odds")
    .in("bet_id", allRelevantIds);

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
    : {
        data: [] as Array<{
          id: string;
          contract_id: string;
          filler_id: string | null;
          amount: number;
          created_at: string;
        }>,
      };

  const unresolvedById = new Map(unresolved.map((b) => [b.id, b] as const));
  const resolvedById = new Map(resolved.map((b) => [b.id, b] as const));

  const contracts: PendingContractRow[] = [];
  const resolvedContracts: PendingContractRow[] = [];

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
    // those show in `posts`/`resolvedPosts`, not as contracts.
    if (c.creator_id === authUser.id) continue;
    // Filler took the opposite side of the contract's stated position.
    const fillerSide: BetSide = c.position === "YES" ? "no" : "yes";
    const row: PendingContractRow = {
      id: f.id,
      bet: (unresolvedById.get(c.bet_id) ?? resolvedById.get(c.bet_id))!,
      side: fillerSide,
      yesPercent: Math.round(c.odds),
      stakeCents: Math.round(Number(f.amount) * 100),
      createdAt: f.created_at,
    };
    if (!row.bet) continue;
    if (unresolvedById.has(c.bet_id)) {
      contracts.push(row);
    } else {
      resolvedContracts.push(row);
    }
  }

  contracts.sort((a, b) => b.createdAt.localeCompare(a.createdAt));
  resolvedContracts.sort((a, b) => b.createdAt.localeCompare(a.createdAt));

  return { posts, contracts, resolvedPosts, resolvedContracts };
}
