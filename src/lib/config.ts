// Centralized feature flags + tunables.
// Keep these reachable from both client and server components.

import type { StakeTierCents } from "@/types/db";

export const IS_PAYMENTS_LIVE = process.env.NEXT_PUBLIC_IS_PAYMENTS_LIVE === "true";

// When true, pages substitute in-memory mock data when Supabase env vars are missing.
export const USE_MOCK_DATA =
  process.env.NEXT_PUBLIC_USE_MOCK_DATA === "true" || !process.env.NEXT_PUBLIC_SUPABASE_URL;

// Platform fees
export const PLATFORM_FEE_BPS = 500; // 5%
export const MEDIATOR_FEE_BPS = 500; // 5% of pot
export const MEDIATOR_FEE_MIN_CENTS = 50;

// Bet constraints
export const MIN_PROBABILITY = 5;
export const MAX_PROBABILITY = 95;

export const EXPIRY_PRESETS: Array<{ label: string; hours: number }> = [
  { label: "1h", hours: 1 },
  { label: "6h", hours: 6 },
  { label: "24h", hours: 24 },
  { label: "3d", hours: 72 },
  { label: "1w", hours: 168 },
];

// Phase 2 — fixed stake tiers eliminate mismatched-stake problems in negotiations.
export const STAKE_TIERS: readonly StakeTierCents[] = [500, 1000, 2500, 5000, 10000];
export const DEFAULT_STAKE_TIER: StakeTierCents = 1000;
