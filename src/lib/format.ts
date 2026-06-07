import type { ContractView } from "@/types/db";

export function formatCents(cents: number): string {
  const dollars = cents / 100;
  return dollars.toLocaleString("en-US", {
    style: "currency",
    currency: "USD",
    minimumFractionDigits: dollars % 1 === 0 ? 0 : 2,
  });
}

/** Short volume label: $1.2k, $850, $12k */
export function formatVolume(cents: number): string {
  const dollars = cents / 100;
  if (dollars >= 10_000) return `$${Math.round(dollars / 1000)}k`;
  if (dollars >= 1_000)  return `$${(dollars / 1000).toFixed(1)}k`;
  return `$${Math.round(dollars)}`;
}

/**
 * Current "line" for a bet:
 *   yesPercent = sum(yes_probability * stake) / sum(stake) across active contracts
 *   volumeCents = sum(stake)
 * Falls back to the bet's original proposed yes_probability when there are no
 * accepted contracts yet.
 */
export function currentLineFor(
  bet: { yes_probability: number },
  contracts: Pick<ContractView, "status" | "yes_probability" | "stake_cents">[] = [],
): { yesPercent: number; volumeCents: number; contractCount: number } {
  const active = contracts.filter((c) => c.status === "active");
  if (active.length === 0) {
    return { yesPercent: bet.yes_probability, volumeCents: 0, contractCount: 0 };
  }
  const totalStake = active.reduce((s, c) => s + c.stake_cents, 0);
  const weighted = active.reduce((s, c) => s + c.yes_probability * c.stake_cents, 0);
  return {
    yesPercent: Math.round(weighted / totalStake),
    volumeCents: totalStake,
    contractCount: active.length,
  };
}

export function formatTimeRemaining(expiryIso: string, now: Date = new Date()): string {
  const expiry = new Date(expiryIso).getTime();
  const diffMs = expiry - now.getTime();
  if (diffMs <= 0) return "expired";

  const seconds = Math.floor(diffMs / 1000);
  const minutes = Math.floor(seconds / 60);
  const hours = Math.floor(minutes / 60);
  const days = Math.floor(hours / 24);

  if (days >= 1) return `${days}d ${hours % 24}h`;
  if (hours >= 1) return `${hours}h ${minutes % 60}m`;
  if (minutes >= 1) return `${minutes}m`;
  return `${seconds}s`;
}

export function fullName(u: { first_name: string | null; last_name_initial: string | null }): string {
  const first = u.first_name?.trim() ?? "";
  const last = u.last_name_initial?.trim() ?? "";
  if (!first && !last) return "—";
  if (!last) return first;
  return `${first} ${last}.`;
}

/**
 * Computes per-side payouts for a fixed-odds two-sided bet.
 * Given a YES probability p and a stake S the YES side puts up, the NO side
 * stakes S * p/(1-p) so expected value is zero. "You win $X" is the full
 * counterparty stake — no fees deducted.
 */
export function payoutPreview(
  stakeCents: number,
  yesProbability: number,
): { ifYesWinsCents: number; ifNoWinsCents: number; potCents: number } {
  const yesFrac = yesProbability / 100;
  const noFrac = 1 - yesFrac;
  if (yesFrac <= 0 || yesFrac >= 1) {
    return { ifYesWinsCents: 0, ifNoWinsCents: 0, potCents: 0 };
  }
  const noStake = Math.round((stakeCents * yesFrac) / noFrac);
  const pot = stakeCents + noStake;
  return {
    ifYesWinsCents: noStake,
    ifNoWinsCents: stakeCents,
    potCents: pot,
  };
}
