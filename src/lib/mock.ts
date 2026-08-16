// In-memory mock data used when NEXT_PUBLIC_USE_MOCK_DATA=true (or Supabase
// env vars are missing). Lets the UI run end-to-end without a backend.
// TODO: delete once Supabase is wired in production.

import type {
  BetSide,
  BetView,
  ChatMessageView,
  CommentView,
  ContractView,
  ConversationView,
  GroupRow,
  GroupView,
  NegotiationView,
  PollView,
  PostMeta,
  Reaction,
  RelationshipLabel,
  StakeTierCents,
  SubContractView,
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
  "mock-me": makeUser("mock-me", "You",   "Y", "yes",    { phone: "+15555550100", username: "you",     wallet: 4_250 }),
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

function groupNameById(id: string | null | undefined): string {
  if (!id) return "";
  return MOCK_GROUPS_DIRECTORY.find((g) => g.id === id)?.name ?? "";
}

// ────────────────────────────────────────────────
// Contracts + negotiations factories
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

// ────────────────────────────────────────────────
// Social post factories (reactions, comments, polls, sub-contracts)
// ────────────────────────────────────────────────
function reaction(emoji: string, count: number, reactedByMe = false): Reaction {
  return { emoji, count, reactedByMe };
}

function comment(id: string, userId: string, text: string, ago: number): CommentView {
  return { id, user: u(userId), text, created_at: hoursAgo(ago) };
}

function poll(yesVotes: number, noVotes: number, myVote: BetSide | null = null): PollView {
  return { yes_votes: yesVotes, no_votes: noVotes, my_vote: myVote };
}

function subContract(
  id: string,
  betId: string,
  posterId: string,
  posterSide: BetSide,
  yesProb: number,
  stakeCents: StakeTierCents,
  filledCents: number,
  minutesAgoNum: number,
): SubContractView {
  return {
    id,
    bet_id: betId,
    poster: u(posterId),
    poster_side: posterSide,
    yes_probability: yesProb,
    stake_cents: stakeCents,
    filled_cents: filledCents,
    created_at: minutesAgo(minutesAgoNum),
  };
}

/**
 * Derive a relationship label for the viewer from the bet's scope/creator.
 * - own post     → "You"
 * - friend scope → "Friend"
 * - group scope  → "from <group name>"
 */
function relFor(creatorId: string, scope: "friends" | "group", groupId: string | null): RelationshipLabel {
  if (creatorId === MOCK_CURRENT_USER.id) return { kind: "self", label: "You" };
  if (scope === "group" && groupId) return { kind: "group", label: `from ${groupNameById(groupId)}` };
  return { kind: "friend", label: "Friend" };
}

// ────────────────────────────────────────────────
// Bets (= social posts)
// ────────────────────────────────────────────────
export const MOCK_BETS: BetView[] = [
  // ── b-1: Max bets YES on Goldman, partially filled ──
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
    created_at: minutesAgo(14),
    resolved_at: null,
    creator: u("u-max"),
    participants: [
      { id: "p-1", bet_id: "b-1", user_id: "u-max", side: "yes", stake_cents: 2_500, stripe_payment_intent_id: null, paid_at: hoursAgo(2), outcome: null, user: u("u-max") },
    ],
    contracts: [
      contract("c-1-1", "b-1", "u-max", "u-sarah", 35, 1_000, 1),
      contract("c-1-2", "b-1", "u-max", "u-jay",   35,   500, 1),
    ],
    open_negotiations: [],
    post_meta: {
      relationship: relFor("u-max", "friends", null),
      poster_side: "yes",
      original_filled_cents: 1_500, // $15 of $25 filled on the NO side
      reactions: [reaction("🔥", 7, true), reaction("🙏", 4), reaction("😭", 2)],
      comments: [
        comment("cm-1-1", "u-sarah", "praying for u 🙏", 1),
        comment("cm-1-2", "u-noor", "didn't u bomb the leetcode tho", 0.5),
      ],
      poll: poll(4, 11, null),
      sub_contracts: [],
      mediator: { mode: "requested" },
      end_at: hours(72),
    },
  },

  // ── b-2: Sarah bets YES on pushups, fully filled, one sub-contract ──
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
    created_at: hoursAgo(5),
    resolved_at: null,
    creator: u("u-sarah"),
    participants: [
      { id: "p-2", bet_id: "b-2", user_id: "u-sarah", side: "yes", stake_cents: 1_000, stripe_payment_intent_id: null, paid_at: hoursAgo(5), outcome: null, user: u("u-sarah") },
    ],
    contracts: [
      contract("c-2-1", "b-2", "u-sarah", "u-noor",  65, 1_000, 4),
    ],
    open_negotiations: [],
    post_meta: {
      relationship: relFor("u-sarah", "friends", null),
      poster_side: "yes",
      original_filled_cents: 1_000, // fully filled
      reactions: [reaction("💀", 12), reaction("🔥", 5, true), reaction("😂", 3)],
      comments: [
        comment("cm-2-1", "u-diego", "doing this with you 💪", 4),
        comment("cm-2-2", "u-jay", "lock in girl", 3),
      ],
      poll: poll(8, 6, "yes"),
      sub_contracts: [
        subContract("sc-2-1", "b-2", "u-priya", "no", 55, 5_000, 1_500, 32),
      ],
    },
  },

  // ── b-3: You bet YES on chess, fully filled, locked ──
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
    post_meta: {
      relationship: relFor("mock-me", "friends", null),
      poster_side: "yes",
      original_filled_cents: 2_500, // fully filled
      reactions: [reaction("♟️", 6), reaction("🤝", 4, true), reaction("😂", 2)],
      comments: [
        comment("cm-3-1", "u-jay", "lol bring it", 18),
        comment("cm-3-2", "u-sarah", "i want video evidence", 15),
      ],
      poll: poll(5, 9, null),
      sub_contracts: [],
    },
  },

  // ── b-4: Noor bets YES on BTC, expired, fully filled ──
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
    created_at: hoursAgo(72),
    resolved_at: null,
    creator: u("u-noor"),
    participants: [
      { id: "p-6", bet_id: "b-4", user_id: "u-noor",  side: "yes", stake_cents: 5_000, stripe_payment_intent_id: null, paid_at: hoursAgo(72), outcome: null, user: u("u-noor") },
      { id: "p-7", bet_id: "b-4", user_id: "mock-me", side: "no",  stake_cents: 5_000, stripe_payment_intent_id: null, paid_at: hoursAgo(70), outcome: null, user: u("mock-me") },
    ],
    contracts: [
      contract("c-4-1", "b-4", "u-noor", "mock-me", 40, 5_000, 70),
    ],
    open_negotiations: [],
    post_meta: {
      relationship: relFor("u-noor", "friends", null),
      poster_side: "yes",
      original_filled_cents: 5_000, // fully filled
      reactions: [reaction("📉", 8, true), reaction("🚀", 4), reaction("💀", 3)],
      comments: [
        comment("cm-4-1", "u-marcus", "rip", 4),
        comment("cm-4-2", "u-max", "told u", 6),
      ],
      poll: poll(6, 11, "no"),
      sub_contracts: [],
    },
  },

  // ── b-5: Jay bets NO on Knicks (poster on NO side), partially filled, sub-contract ──
  {
    id: "b-5",
    creator_id: "u-jay",
    question: "Knicks make the Eastern Conference Finals",
    category: "other",
    yes_probability: 45,
    stake_cents: 2_500,
    expiry_at: hours(360),
    resolution_notes: null,
    status: "open",
    scope: "friends",
    group_id: null,
    created_at: minutesAgo(220),
    resolved_at: null,
    creator: u("u-jay"),
    participants: [
      { id: "p-5-1", bet_id: "b-5", user_id: "u-jay", side: "no", stake_cents: 2_500, stripe_payment_intent_id: null, paid_at: hoursAgo(3), outcome: null, user: u("u-jay") },
    ],
    contracts: [
      // Jay on NO; counter-party on YES. Two partial fills totalling $10 of $25.
      contract("c-5-1", "b-5", "u-sarah",  "u-jay", 45,   500, 2),
      contract("c-5-2", "b-5", "u-noor",   "u-jay", 45,   500, 1),
    ],
    open_negotiations: [],
    post_meta: {
      relationship: relFor("u-jay", "friends", null),
      poster_side: "no",
      original_filled_cents: 1_000, // $10 filled of $25 on the YES side
      reactions: [reaction("🏀", 8), reaction("😂", 3, true), reaction("🙏", 2)],
      comments: [
        comment("cm-5-1", "u-sarah", "brunson cooking rn", 2),
        comment("cm-5-2", "u-max", "no defense bro be serious", 1),
      ],
      poll: poll(10, 7, "yes"),
      sub_contracts: [
        subContract("sc-5-1", "b-5", "u-marcus", "yes", 65, 2_500, 0, 18),
      ],
    },
  },

  // ── b-6: Noor bets YES on Taylor Swift album, fully filled, sub-contract ──
  {
    id: "b-6",
    creator_id: "u-noor",
    question: "Taylor Swift drops a surprise album before July 4",
    category: "social",
    yes_probability: 70,
    stake_cents: 1_000,
    expiry_at: hours(900),
    resolution_notes: null,
    status: "open",
    scope: "friends",
    group_id: null,
    created_at: hoursAgo(6),
    resolved_at: null,
    creator: u("u-noor"),
    participants: [
      { id: "p-6-1", bet_id: "b-6", user_id: "u-noor", side: "yes", stake_cents: 1_000, stripe_payment_intent_id: null, paid_at: hoursAgo(6), outcome: null, user: u("u-noor") },
    ],
    contracts: [
      contract("c-6-1", "b-6", "u-noor", "u-jay", 70, 1_000, 5),
    ],
    open_negotiations: [],
    post_meta: {
      relationship: relFor("u-noor", "friends", null),
      poster_side: "yes",
      original_filled_cents: 1_000,
      reactions: [reaction("🎤", 9, true), reaction("💖", 4), reaction("😂", 3)],
      comments: [
        comment("cm-6-1", "u-sarah", "wishful thinking 💀", 5),
        comment("cm-6-2", "u-jay", "didn't she literally just drop one", 4),
      ],
      poll: poll(11, 4, "yes"),
      sub_contracts: [
        subContract("sc-6-1", "b-6", "u-max", "no", 80, 1_000, 500, 90),
      ],
    },
  },

  // ── b-g1: You bet YES on Fed in Trading Floor group, partial, sub-contract ──
  {
    id: "b-g1",
    creator_id: "mock-me",
    question: "Fed cuts rates by 50bps at the next FOMC",
    category: "finance",
    yes_probability: 30,
    stake_cents: 5_000,
    expiry_at: hours(36),
    resolution_notes: null,
    status: "open",
    scope: "group",
    group_id: "g-trading",
    created_at: hoursAgo(8),
    resolved_at: null,
    creator: u("mock-me"),
    participants: [
      { id: "p-g1-1", bet_id: "b-g1", user_id: "mock-me", side: "yes", stake_cents: 5_000, stripe_payment_intent_id: null, paid_at: hoursAgo(8), outcome: null, user: u("mock-me") },
    ],
    contracts: [
      contract("c-g1-1", "b-g1", "mock-me", "u-ben", 30, 2_000, 6),
      contract("c-g1-2", "b-g1", "mock-me", "u-max", 30, 1_000, 4),
    ],
    open_negotiations: [],
    post_meta: {
      relationship: relFor("mock-me", "group", "g-trading"),
      poster_side: "yes",
      original_filled_cents: 3_000, // $30 of $50 filled
      reactions: [reaction("📈", 5, true), reaction("💰", 3), reaction("🤡", 2)],
      comments: [
        comment("cm-g1-1", "u-ben", "powell has no spine", 5),
        comment("cm-g1-2", "u-max", "lock in", 4),
      ],
      poll: poll(7, 14, null),
      sub_contracts: [
        subContract("sc-g1-1", "b-g1", "u-ben", "no", 25, 5_000, 2_500, 240),
      ],
      mediator: { mode: "accepted", mediator: u("mock-me") },
      end_at: hours(36),
    },
  },

  // ── b-g2: Sarah bets YES on dish-breaking in EH7 House, partial, sub-contract ──
  {
    id: "b-g2",
    creator_id: "u-sarah",
    question: "Someone breaks a dish at Friday family dinner",
    category: "social",
    yes_probability: 75,
    stake_cents: 500,
    expiry_at: hours(50),
    resolution_notes: null,
    status: "open",
    scope: "group",
    group_id: "g-eh7",
    created_at: hoursAgo(3),
    resolved_at: null,
    creator: u("u-sarah"),
    participants: [
      { id: "p-g2-1", bet_id: "b-g2", user_id: "u-sarah", side: "yes", stake_cents: 500, stripe_payment_intent_id: null, paid_at: hoursAgo(3), outcome: null, user: u("u-sarah") },
    ],
    contracts: [
      contract("c-g2-1", "b-g2", "u-sarah", "u-jay",  75, 300, 2),
    ],
    open_negotiations: [],
    post_meta: {
      relationship: relFor("u-sarah", "group", "g-eh7"),
      poster_side: "yes",
      original_filled_cents: 300, // $3 of $5 filled
      reactions: [reaction("🍽️", 6, true), reaction("💀", 4), reaction("😂", 5)],
      comments: [
        comment("cm-g2-1", "u-jay", "we don't even own real plates", 2),
        comment("cm-g2-2", "u-noor", "happens every week istg", 1),
      ],
      poll: poll(9, 2, "yes"),
      sub_contracts: [
        subContract("sc-g2-1", "b-g2", "mock-me", "yes", 80, 1_000, 0, 45),
      ],
      mediator: { mode: "accepted", mediator: u("u-noor") },
    },
  },

  // ── b-mediate-1: Closed bet awaiting your ruling as mediator ──
  {
    id: "b-mediate-1",
    creator_id: "u-sarah",
    question: "Sarah hits 5k under 25 min this Sunday",
    category: "fitness",
    yes_probability: 60,
    stake_cents: 3_000,
    expiry_at: hoursAgo(1),
    resolution_notes: null,
    status: "closed",
    scope: "friends",
    group_id: null,
    created_at: hoursAgo(30),
    resolved_at: null,
    creator: u("u-sarah"),
    participants: [],
    contracts: [
      contract("c-mediate-1-1", "b-mediate-1", "u-sarah", "u-jay", 60, 3_000, 28),
    ],
    open_negotiations: [],
    post_meta: {
      relationship: relFor("u-sarah", "friends", null),
      poster_side: "yes",
      original_filled_cents: 3_000,
      reactions: [],
      comments: [],
      poll: poll(0, 0, null),
      sub_contracts: [],
      mediator: { mode: "accepted", mediator: u("mock-me") },
      end_at: null,
    },
  },
];

/** Bets posted to a specific group (group feed). */
export function mockBetsForGroup(groupId: string): BetView[] {
  return MOCK_BETS.filter((b) => b.group_id === groupId);
}

// ────────────────────────────────────────────────
// Messaging — DMs + group chats. Auto-posted bets show up as bet messages
// in their group's chat. DMs can have shared bets.
// ────────────────────────────────────────────────
function textMsg(
  id: string,
  conversationId: string,
  senderId: string,
  text: string,
  minutesAgoNum: number,
): ChatMessageView {
  return {
    id,
    conversation_id: conversationId,
    sender: u(senderId),
    kind: "text",
    text,
    created_at: minutesAgo(minutesAgoNum),
  };
}

function betMsg(
  id: string,
  conversationId: string,
  senderId: string,
  betId: string,
  minutesAgoNum: number,
): ChatMessageView {
  return {
    id,
    conversation_id: conversationId,
    sender: u(senderId),
    kind: "bet",
    bet_id: betId,
    created_at: minutesAgo(minutesAgoNum),
  };
}

/**
 * Conversations indexed by id. DM ids look like "dm-<friendId>"; group chat
 * ids match the group id directly (so a chat link can deep-link to the group).
 */
export const MOCK_CONVERSATIONS: Record<string, ConversationView> = {
  "dm-u-max": {
    id: "dm-u-max",
    kind: "dm",
    other_user: u("u-max"),
    title: "Max T.",
    unread_count: 0,
  },
  "dm-u-sarah": {
    id: "dm-u-sarah",
    kind: "dm",
    other_user: u("u-sarah"),
    title: "Sarah K.",
    unread_count: 1,
  },
  "dm-u-noor": {
    id: "dm-u-noor",
    kind: "dm",
    other_user: u("u-noor"),
    title: "Noor A.",
    unread_count: 2,
  },
  "dm-u-jay": {
    id: "dm-u-jay",
    kind: "dm",
    other_user: u("u-jay"),
    title: "Jay P.",
    unread_count: 2,
  },
  "g-trading": {
    id: "g-trading",
    kind: "group",
    group: mockGroupView(MOCK_GROUPS_DIRECTORY[0]),
    title: "The Trading Floor",
    unread_count: 0,
  },
  "g-eh7": {
    id: "g-eh7",
    kind: "group",
    group: mockGroupView(MOCK_GROUPS_DIRECTORY[1]),
    title: "EH7 House",
    unread_count: 3,
  },
  "g-run": {
    id: "g-run",
    kind: "group",
    group: mockGroupView(MOCK_GROUPS_DIRECTORY[2]),
    title: "Sunday Run Club",
    unread_count: 0,
  },
};

/**
 * Messages indexed by conversation id, oldest first.
 * Group chats include the auto-posted bet card for any bet scoped to that
 * group (b-g1 in Trading Floor, b-g2 in EH7 House). DMs include at least one
 * shared bet card.
 */
export const MOCK_CHAT_MESSAGES: Record<string, ChatMessageView[]> = {
  "dm-u-max": [
    textMsg("m-dm-max-1", "dm-u-max", "u-max",   "yo did u see the goldman post lol", 18),
    textMsg("m-dm-max-2", "dm-u-max", "mock-me", "literally", 17),
    betMsg ("m-dm-max-3", "dm-u-max", "u-max",   "b-1", 16),
    textMsg("m-dm-max-4", "dm-u-max", "u-max",   "praying for me 🙏", 14),
    textMsg("m-dm-max-5", "dm-u-max", "mock-me", "if you don't get it i'm taking the $15", 12),
  ],
  "dm-u-sarah": [
    textMsg("m-dm-sa-1", "dm-u-sarah", "u-sarah", "i'm starting the pushups challenge today", 320),
    betMsg ("m-dm-sa-2", "dm-u-sarah", "u-sarah", "b-2", 318),
    textMsg("m-dm-sa-3", "dm-u-sarah", "mock-me", "good luck 😬 don't blow your shoulders", 290),
    textMsg("m-dm-sa-4", "dm-u-sarah", "u-sarah", "i'm dying already day 1", 60),
  ],
  "dm-u-noor": [
    textMsg("m-dm-no-1", "dm-u-noor", "u-noor",  "wait you actually faded my BTC bet", 130),
    textMsg("m-dm-no-2", "dm-u-noor", "mock-me", "told u 📉", 90),
    betMsg ("m-dm-no-3", "dm-u-noor", "u-noor",  "b-4", 55),
    textMsg("m-dm-no-4", "dm-u-noor", "u-noor",  "i hate u so much", 22),
  ],
  "dm-u-jay": [
    textMsg("m-dm-jay-1", "dm-u-jay", "u-jay",   "rematch tomorrow?", 34),
    textMsg("m-dm-jay-2", "dm-u-jay", "u-jay",   "if i win again we double", 30),
    betMsg ("m-dm-jay-3", "dm-u-jay", "u-jay",   "b-3", 22),
  ],
  "g-trading": [
    textMsg("m-g-tr-1", "g-trading", "u-ben",    "anyone catch the FOMC speech?", 540),
    textMsg("m-g-tr-2", "g-trading", "u-max",    "powell looked terrified ngl", 510),
    betMsg ("m-g-tr-3", "g-trading", "mock-me",  "b-g1", 480),
    textMsg("m-g-tr-4", "g-trading", "u-max",    "lock in", 410),
    textMsg("m-g-tr-5", "g-trading", "u-ben",    "i'm opening the other side", 360),
    textMsg("m-g-tr-6", "g-trading", "mock-me",  "ben i can see u doing it rn", 300),
  ],
  "g-eh7": [
    textMsg("m-g-eh-1", "g-eh7", "u-sarah",  "friday dinner squad assemble 🍝", 245),
    betMsg ("m-g-eh-2", "g-eh7", "u-sarah",  "b-g2", 180),
    textMsg("m-g-eh-3", "g-eh7", "u-jay",    "we don't even have real plates lmao", 120),
    textMsg("m-g-eh-4", "g-eh7", "mock-me",  "i'm taking yes obv", 75),
    textMsg("m-g-eh-5", "g-eh7", "u-noor",   "the bowls count as dishes", 30),
    textMsg("m-g-eh-6", "g-eh7", "u-emma",   "wait who's cooking", 12),
  ],
  "g-run": [
    textMsg("m-g-rn-1", "g-run", "u-emma",   "who's running sunday morning", 1440),
    textMsg("m-g-rn-2", "g-run", "u-sarah",  "i'm in if it's not raining", 1380),
    textMsg("m-g-rn-3", "g-run", "u-noor",   "we should bet on the average pace", 1320),
  ],
};

/** All messages for a conversation, oldest first, with last_message attached. */
export function mockMessagesFor(conversationId: string): ChatMessageView[] {
  return MOCK_CHAT_MESSAGES[conversationId] ?? [];
}

export function mockConversationById(id: string): ConversationView | undefined {
  const c = MOCK_CONVERSATIONS[id];
  if (!c) return undefined;
  const msgs = MOCK_CHAT_MESSAGES[id] ?? [];
  return { ...c, last_message: msgs[msgs.length - 1] };
}

/** Inbox lists for the two tabs, ordered by last-message timestamp desc. */
export function mockInboxFor(kind: "dm" | "group"): ConversationView[] {
  return Object.values(MOCK_CONVERSATIONS)
    .filter((c) => c.kind === kind)
    .map((c) => mockConversationById(c.id)!)
    .sort((a, b) => {
      const ta = a.last_message?.created_at ?? "";
      const tb = b.last_message?.created_at ?? "";
      return tb.localeCompare(ta);
    });
}

/**
 * Bets the current user can share into a DM — anything they created or
 * are participating in that's still live (open or locked).
 */
export function mockShareableBetsForCurrentUser(): BetView[] {
  return MOCK_BETS.filter(
    (b) =>
      (b.creator_id === MOCK_CURRENT_USER.id ||
        b.participants.some((p) => p.user_id === MOCK_CURRENT_USER.id) ||
        (b.contracts ?? []).some(
          (c) => c.yes_user_id === MOCK_CURRENT_USER.id || c.no_user_id === MOCK_CURRENT_USER.id,
        )) &&
      (b.status === "open" || b.status === "locked"),
  );
}

/** Look up a bet referenced from a chat message. */
export function mockBetById(id: string): BetView | undefined {
  return MOCK_BETS.find((b) => b.id === id);
}

// ────────────────────────────────────────────────
// Mediations — unchanged (Phase 3 territory; do not touch)
// ────────────────────────────────────────────────
/** Bets where `mock-me` is the assigned mediator and a ruling is pending. */
export function mockMediationQueue(): BetView[] {
  return MOCK_BETS.filter(
    (b) =>
      b.status === "closed" &&
      !b.post_meta?.concluded &&
      b.post_meta?.mediator?.mode === "accepted" &&
      b.post_meta.mediator.mediator?.id === MOCK_CURRENT_USER.id,
  );
}

/** Demo data for the /admin reports dashboard in mock mode. */
export interface MockReport {
  id: string;
  status: "open" | "resolved" | "dismissed";
  reason: string;
  details: string | null;
  createdAt: string;
  bet: { id: string; question: string; isRemoved: boolean } | null;
  reporter: { id: string; name: string; username: string | null };
}

export const MOCK_REPORTS: MockReport[] = [
  {
    id: "rep-1",
    status: "open",
    reason: "inappropriate",
    details: "This is targeting someone specific in a mean way.",
    createdAt: hoursAgo(2),
    bet: { id: "b-1", question: MOCK_BETS.find((b) => b.id === "b-1")?.question ?? "—", isRemoved: false },
    reporter: { id: "u-jay", name: "Jay P.", username: "jayp" },
  },
];
