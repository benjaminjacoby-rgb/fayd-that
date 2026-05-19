// In-memory mock data used when NEXT_PUBLIC_USE_MOCK_DATA=true (or Supabase
// env vars are missing). Lets the UI run end-to-end without a backend.
// TODO: delete once Supabase is wired in production.

import type {
  BetView,
  ContractView,
  GroupRow,
  GroupView,
  NegotiationView,
  StakeTierCents,
  UserLite,
  UserRow,
} from "@/types/db";

const now = Date.now();
const hours = (n: number) => new Date(now + n * 3600_000).toISOString();
const hoursAgo = (n: number) => new Date(now - n * 3600_000).toISOString();
const minutesAgo = (n: number) => new Date(now - n * 60_000).toISOString();

// ────────────────────────────────────────────────
// Cast of characters
// ────────────────────────────────────────────────
function makeUser(
  id: string,
  first: string,
  last: string,
  color: string,
  opts: { phone?: string; username?: string; wallet?: number } = {},
): UserRow {
  return {
    id,
    phone: opts.phone ?? "",
    username: opts.username ?? first.toLowerCase(),
    first_name: first,
    last_name_initial: last,
    avatar_color: color,
    stripe_customer_id: null,
    wallet_balance_cents: opts.wallet ?? 0,
    created_at: hoursAgo(720),
  };
}

export const MOCK_USER_DIRECTORY: Record<string, UserRow> = {
  "mock-me": makeUser("mock-me", "You", "Y", "yes", { phone: "+15555550100", username: "you", wallet: 4_250 }),
  "u-max":    makeUser("u-max",    "Max",    "T", "blue",   { phone: "+15555550101", username: "maxt" }),
  "u-sarah":  makeUser("u-sarah",  "Sarah",  "K", "purple", { phone: "+15555550102", username: "sarahk" }),
  "u-noor":   makeUser("u-noor",   "Noor",   "A", "orange", { phone: "+15555550103", username: "noor" }),
  "u-jay":    makeUser("u-jay",    "Jay",    "P", "gold",   { phone: "+15555550104", username: "jayp" }),
  "u-emma":   makeUser("u-emma",   "Emma",   "R", "yes",    { phone: "+15555550105", username: "emmar" }),
  "u-liam":   makeUser("u-liam",   "Liam",   "C", "no",     { phone: "+15555550106", username: "liamc" }),
  "u-aisha":  makeUser("u-aisha",  "Aisha",  "B", "purple", { phone: "+15555550107", username: "aishab" }),
  "u-diego":  makeUser("u-diego",  "Diego",  "M", "orange", { phone: "+15555550108", username: "diegom" }),
  "u-priya":  makeUser("u-priya",  "Priya",  "S", "gold",   { phone: "+15555550109", username: "priyas" }),
  "u-ben":    makeUser("u-ben",    "Ben",    "H", "blue",   { phone: "+15555550110", username: "benh" }),
  "u-chloe":  makeUser("u-chloe",  "Chloe",  "W", "yes",    { phone: "+15555550111", username: "chloew" }),
  "u-marcus": makeUser("u-marcus", "Marcus", "D", "purple", { phone: "+15555550112", username: "marcusd" }),
};

export const MOCK_CURRENT_USER: UserRow = MOCK_USER_DIRECTORY["mock-me"];

const FRIEND_IDS = ["u-max", "u-sarah", "u-noor", "u-jay"] as const;
export const MOCK_FRIENDS: UserRow[] = FRIEND_IDS.map((id) => MOCK_USER_DIRECTORY[id]);

function u(id: string): UserLite {
  const x = MOCK_USER_DIRECTORY[id];
  return {
    id: x.id,
    first_name: x.first_name,
    last_name_initial: x.last_name_initial,
    username: x.username,
    avatar_color: x.avatar_color,
  };
}

// ────────────────────────────────────────────────
// Friend requests
// ────────────────────────────────────────────────
export interface MockFriendRequest {
  id: string;
  other: UserLite;
  mutualCount: number;
  createdAt: string;
}

export const MOCK_INCOMING_FRIEND_REQUESTS: MockFriendRequest[] = [
  { id: "fr-in-1", other: u("u-emma"),   mutualCount: 3, createdAt: hoursAgo(4) },
  { id: "fr-in-2", other: u("u-marcus"), mutualCount: 1, createdAt: hoursAgo(28) },
];

export const MOCK_SENT_FRIEND_REQUESTS: MockFriendRequest[] = [
  { id: "fr-out-1", other: u("u-aisha"), mutualCount: 2, createdAt: hoursAgo(12) },
];

/** Mock user-directory search by name / username / phone substring. */
export function mockSearchUsers(query: string): UserRow[] {
  const q = query.trim().toLowerCase();
  if (!q) return [];
  return Object.values(MOCK_USER_DIRECTORY)
    .filter((x) => x.id !== MOCK_CURRENT_USER.id)
    .filter((x) =>
      (x.username ?? "").toLowerCase().includes(q) ||
      (x.first_name ?? "").toLowerCase().includes(q) ||
      (x.last_name_initial ?? "").toLowerCase().includes(q) ||
      (x.phone ?? "").includes(q),
    )
    .slice(0, 10);
}

// ────────────────────────────────────────────────
// Groups
// ────────────────────────────────────────────────
export const MOCK_GROUPS_DIRECTORY: GroupRow[] = [
  { id: "g-trading", name: "The Trading Floor", invite_code: "TRADE2", admin_id: "mock-me", created_at: hoursAgo(96) },
  { id: "g-eh7",     name: "EH7 House",         invite_code: "EH7BAR", admin_id: "u-sarah", created_at: hoursAgo(240) },
  { id: "g-run",     name: "Sunday Run Club",   invite_code: "RUN888", admin_id: "u-emma",  created_at: hoursAgo(600) },
];

// Members per group (active only; pending listed separately).
export const MOCK_GROUP_MEMBERS: Record<string, UserLite[]> = {
  "g-trading": [u("mock-me"), u("u-max"), u("u-sarah"), u("u-ben"), u("u-jay")],
  "g-eh7":     [u("u-sarah"), u("mock-me"), u("u-jay"), u("u-noor"), u("u-emma")],
  "g-run":     [u("u-emma"),  u("u-noor"), u("u-sarah")],
};

// Pending join requests (only meaningful for groups the current user admins).
export interface MockPendingJoin {
  id: string;
  user: UserLite;
  createdAt: string;
}
export const MOCK_GROUP_PENDING: Record<string, MockPendingJoin[]> = {
  "g-trading": [
    { id: "pj-1", user: u("u-diego"), createdAt: hoursAgo(1) },
    { id: "pj-2", user: u("u-priya"), createdAt: hoursAgo(20) },
  ],
};

/** Groups the current user is an active member of, with computed view fields. */
export function mockGroupsForCurrentUser(): GroupView[] {
  return MOCK_GROUPS_DIRECTORY
    .filter((g) => (MOCK_GROUP_MEMBERS[g.id] ?? []).some((m) => m.id === MOCK_CURRENT_USER.id))
    .map(mockGroupView);
}

export function mockGroupView(g: GroupRow): GroupView {
  return {
    ...g,
    admin: u(g.admin_id),
    member_count: (MOCK_GROUP_MEMBERS[g.id] ?? []).length,
    is_admin: g.admin_id === MOCK_CURRENT_USER.id,
    pending_join_count: (MOCK_GROUP_PENDING[g.id] ?? []).length,
  };
}

export function mockGroupById(id: string): GroupRow | undefined {
  return MOCK_GROUPS_DIRECTORY.find((g) => g.id === id);
}

// ────────────────────────────────────────────────
// Bets
// ────────────────────────────────────────────────
function contract(
  id: string,
  betId: string,
  yesId: string,
  noId: string,
  yesProb: number,
  stakeCents: number,
  createdHoursAgo: number,
): ContractView {
  return {
    id,
    bet_id: betId,
    yes_user_id: yesId,
    no_user_id: noId,
    yes_probability: yesProb,
    stake_cents: stakeCents,
    negotiation_id: null,
    status: "active",
    yes_outcome: null,
    created_at: hoursAgo(createdHoursAgo),
    resolved_at: null,
    yes_user: u(yesId),
    no_user: u(noId),
  };
}

function negotiation(
  id: string,
  betId: string,
  proposerId: string,
  yesProb: number,
  tier: StakeTierCents,
  proposedMinutesAgo: number,
): NegotiationView {
  return {
    id,
    bet_id: betId,
    proposer_id: proposerId,
    proposed_yes_probability: yesProb,
    stake_tier_cents: tier,
    status: "open",
    parent_negotiation_id: null,
    created_at: minutesAgo(proposedMinutesAgo),
    proposer: u(proposerId),
  };
}

export const MOCK_BETS: BetView[] = [
  {
    id: "b-1",
    creator_id: "u-max",
    question: "Max gets the Goldman SA internship",
    category: "academics",
    yes_probability: 35,
    stake_cents: 2_500,
    expiry_at: hours(72),
    resolution_notes: null,
    status: "open",
    scope: "friends",
    group_id: null,
    geo_lat: null, geo_lng: null, geo_radius_meters: null,
    created_at: hoursAgo(2),
    resolved_at: null,
    creator: u("u-max"),
    participants: [
      { id: "p-1", bet_id: "b-1", user_id: "u-max", side: "yes", stake_cents: 2_500, stripe_payment_intent_id: null, paid_at: hoursAgo(2), outcome: null, user: u("u-max") },
    ],
    contracts: [
      contract("c-1-1", "b-1", "u-max", "u-sarah", 35, 2_500, 2),
      contract("c-1-2", "b-1", "u-max", "u-jay",   40, 1_000, 1),
    ],
    open_negotiations: [
      negotiation("n-1-1", "b-1", "u-noor", 25, 5_000, 35),
      negotiation("n-1-2", "b-1", "u-liam", 30, 2_500, 180),
    ],
  },
  {
    id: "b-2",
    creator_id: "u-sarah",
    question: "I'll do 100 pushups every day for a week",
    category: "fitness",
    yes_probability: 65,
    stake_cents: 1_000,
    expiry_at: hours(168),
    resolution_notes: null,
    status: "open",
    scope: "friends",
    group_id: null,
    geo_lat: null, geo_lng: null, geo_radius_meters: null,
    created_at: hoursAgo(5),
    resolved_at: null,
    creator: u("u-sarah"),
    participants: [
      { id: "p-2", bet_id: "b-2", user_id: "u-sarah", side: "yes", stake_cents: 1_000, stripe_payment_intent_id: null, paid_at: hoursAgo(5), outcome: null, user: u("u-sarah") },
      { id: "p-3", bet_id: "b-2", user_id: "u-noor",  side: "no",  stake_cents: 1_000, stripe_payment_intent_id: null, paid_at: hoursAgo(4), outcome: null, user: u("u-noor") },
    ],
    contracts: [
      contract("c-2-1", "b-2", "u-sarah", "u-noor",  65, 1_000, 4),
      contract("c-2-2", "b-2", "u-sarah", "u-diego", 70, 2_500, 2),
    ],
    open_negotiations: [
      negotiation("n-2-1", "b-2", "u-priya", 55, 5_000, 32),
    ],
  },
  {
    id: "b-3",
    creator_id: "mock-me",
    question: "I beat Jay in chess by Friday",
    category: "social",
    yes_probability: 55,
    stake_cents: 2_500,
    expiry_at: hours(96),
    resolution_notes: null,
    status: "locked",
    scope: "friends",
    group_id: null,
    geo_lat: null, geo_lng: null, geo_radius_meters: null,
    created_at: hoursAgo(20),
    resolved_at: null,
    creator: u("mock-me"),
    participants: [
      { id: "p-4", bet_id: "b-3", user_id: "mock-me", side: "yes", stake_cents: 2_500, stripe_payment_intent_id: null, paid_at: hoursAgo(20), outcome: null, user: u("mock-me") },
      { id: "p-5", bet_id: "b-3", user_id: "u-jay",   side: "no",  stake_cents: 2_500, stripe_payment_intent_id: null, paid_at: hoursAgo(18), outcome: null, user: u("u-jay") },
    ],
    contracts: [
      contract("c-3-1", "b-3", "mock-me", "u-jay", 55, 2_500, 18),
    ],
    open_negotiations: [],
  },
  {
    id: "b-4",
    creator_id: "u-noor",
    question: "Bitcoin closes above $80k this Friday",
    category: "finance",
    yes_probability: 40,
    stake_cents: 5_000,
    expiry_at: hours(-2),
    resolution_notes: null,
    status: "locked",
    scope: "friends",
    group_id: null,
    geo_lat: null, geo_lng: null, geo_radius_meters: null,
    created_at: hoursAgo(72),
    resolved_at: null,
    creator: u("u-noor"),
    participants: [
      { id: "p-6", bet_id: "b-4", user_id: "u-noor",  side: "yes", stake_cents: 5_000, stripe_payment_intent_id: null, paid_at: hoursAgo(72), outcome: null, user: u("u-noor") },
      { id: "p-7", bet_id: "b-4", user_id: "mock-me", side: "no",  stake_cents: 5_000, stripe_payment_intent_id: null, paid_at: hoursAgo(70), outcome: null, user: u("mock-me") },
    ],
    contracts: [
      contract("c-4-1", "b-4", "u-noor", "mock-me", 40, 5_000, 70),
      contract("c-4-2", "b-4", "u-noor", "u-emma",  35, 2_500, 48),
    ],
    open_negotiations: [
      negotiation("n-4-1", "b-4", "u-marcus", 50, 10_000, 12),
    ],
  },
  {
    id: "b-g1",
    creator_id: "mock-me",
    question: "Fed cuts rates by 50bps at next FOMC",
    category: "finance",
    yes_probability: 30,
    stake_cents: 5_000,
    expiry_at: hours(36),
    resolution_notes: null,
    status: "open",
    scope: "group",
    group_id: "g-trading",
    geo_lat: null, geo_lng: null, geo_radius_meters: null,
    created_at: hoursAgo(8),
    resolved_at: null,
    creator: u("mock-me"),
    participants: [
      { id: "p-g1-1", bet_id: "b-g1", user_id: "mock-me", side: "yes", stake_cents: 5_000, stripe_payment_intent_id: null, paid_at: hoursAgo(8), outcome: null, user: u("mock-me") },
    ],
    contracts: [
      contract("c-g1-1", "b-g1", "mock-me", "u-ben", 30, 5_000, 6),
      contract("c-g1-2", "b-g1", "mock-me", "u-max", 35, 2_500, 4),
    ],
    open_negotiations: [
      negotiation("n-g1-1", "b-g1", "u-sarah", 20, 2_500, 90),
      negotiation("n-g1-2", "b-g1", "u-ben",   25, 5_000, 240),
    ],
  },
  {
    id: "b-g2",
    creator_id: "u-sarah",
    question: "Someone breaks a dish at Friday dinner",
    category: "social",
    yes_probability: 75,
    stake_cents: 500,
    expiry_at: hours(50),
    resolution_notes: null,
    status: "open",
    scope: "group",
    group_id: "g-eh7",
    geo_lat: null, geo_lng: null, geo_radius_meters: null,
    created_at: hoursAgo(3),
    resolved_at: null,
    creator: u("u-sarah"),
    participants: [
      { id: "p-g2-1", bet_id: "b-g2", user_id: "u-sarah", side: "yes", stake_cents: 500, stripe_payment_intent_id: null, paid_at: hoursAgo(3), outcome: null, user: u("u-sarah") },
    ],
    contracts: [
      contract("c-g2-1", "b-g2", "u-sarah", "u-jay",  75, 500, 2),
      contract("c-g2-2", "b-g2", "u-sarah", "u-noor", 70, 1_000, 1),
    ],
    open_negotiations: [
      negotiation("n-g2-1", "b-g2", "mock-me", 80, 1_000, 45),
    ],
  },
];

/** Bets posted to a specific group (group feed). */
export function mockBetsForGroup(groupId: string): BetView[] {
  return MOCK_BETS.filter((b) => b.group_id === groupId);
}

// ────────────────────────────────────────────────
// Mediations — unchanged (Phase 3 territory; do not touch)
// ────────────────────────────────────────────────
export const MOCK_MEDIATIONS = [
  {
    id: "m-1",
    bet_id: "b-mediate-1",
    mediator_id: "mock-me",
    status: "pending" as const,
    ruling: null,
    fee_cents: 200,
    created_at: hoursAgo(6),
    bet: {
      id: "b-mediate-1",
      question: "Sarah hits 5k under 25 min this Sunday",
      stake_cents: 3_000,
      pot_cents: 6_000,
      parties: [
        { user: u("u-sarah"), side: "yes" as const, evidence: "Strava screenshot pending" },
        { user: u("u-jay"),   side: "no" as const,  evidence: "Said she's been injured" },
      ],
    },
  },
];
