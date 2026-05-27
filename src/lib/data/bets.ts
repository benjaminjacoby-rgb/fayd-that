import { createClient } from "@/lib/supabase/server";
import { pickAvatarColor } from "@/lib/avatar";
import type {
  BetSide,
  BetStatus,
  BetView,
  ContractView,
  PostMeta,
  Reaction,
  RelationshipLabel,
  SubContractView,
  UserLite,
} from "@/types/db";
import type { SupabaseClient } from "@supabase/supabase-js";

// ────────────────────────────────────────────────
// Row shapes from the schema in supabase/migrations/001_initial_schema.sql.
// These differ from the UI's BetView/UserLite, so we map below.
// ────────────────────────────────────────────────
interface DbUser {
  id: string;
  username: string | null;
  full_name: string | null;
  phone_number: string | null;
  avatar_url: string | null;
  wallet_balance: number | null;
}

interface DbFill {
  id: string;
  contract_id: string;
  filler_id: string | null;
  amount: number;
  created_at: string;
}

interface DbContract {
  id: string;
  bet_id: string;
  creator_id: string | null;
  position: "YES" | "NO" | null;
  odds: number;
  stake_amount: number;
  amount_remaining: number;
  is_filled: boolean;
  created_at: string;
}

interface DbBet {
  id: string;
  poster_id: string | null;
  question: string;
  poster_position: "YES" | "NO" | null;
  stake_amount: number;
  audience_type: "friends" | "group" | "specific_friends" | null;
  group_id: string | null;
  end_date: string | null;
  expires_at: string | null;
  is_concluded: boolean;
  mediator_type: "none" | "self" | "requested";
  mediator_id: string | null;
  status: "open" | "filled" | "closed" | "concluded" | "settled";
  winning_side: "YES" | "NO" | null;
  created_at: string;
}

interface DbGroup {
  id: string;
  name: string;
}

// ────────────────────────────────────────────────
// Public API
// ────────────────────────────────────────────────
export async function getFeedBets(): Promise<BetView[]> {
  const supabase = createClient();

  const { data: betsData, error: betsError } = await supabase
    .from("bets")
    .select("*")
    .order("created_at", { ascending: false })
    .limit(50);
  if (betsError) throw betsError;
  const bets = (betsData ?? []) as DbBet[];
  if (bets.length === 0) return [];

  const betIds = bets.map((b) => b.id);
  const groupIds = uniq(bets.map((b) => b.group_id).filter(isString));

  const [contractsRes, posterUserIds, groupsRes] = await Promise.all([
    supabase.from("contracts").select("*").in("bet_id", betIds),
    Promise.resolve(uniq(bets.map((b) => b.poster_id).filter(isString))),
    groupIds.length
      ? supabase.from("groups").select("id, name").in("id", groupIds)
      : Promise.resolve({ data: [] as DbGroup[], error: null }),
  ]);
  if (contractsRes.error) throw contractsRes.error;
  if (groupsRes.error) throw groupsRes.error;

  const contracts = (contractsRes.data ?? []) as DbContract[];
  const groupsById = new Map(((groupsRes.data ?? []) as DbGroup[]).map((g) => [g.id, g]));

  const contractIds = contracts.map((c) => c.id);
  const { data: fillsData, error: fillsErr } = contractIds.length
    ? await supabase.from("fills").select("*").in("contract_id", contractIds)
    : { data: [] as DbFill[], error: null };
  if (fillsErr) throw fillsErr;
  const fills = (fillsData ?? []) as DbFill[];

  // Collect every user id we need (posters, contract creators, mediators, fillers).
  const userIds = uniq([
    ...posterUserIds,
    ...bets.map((b) => b.mediator_id).filter(isString),
    ...contracts.map((c) => c.creator_id).filter(isString),
    ...fills.map((f) => f.filler_id).filter(isString),
  ]);

  const { data: usersData, error: usersErr } = userIds.length
    ? await supabase.from("users").select("id, username, full_name, phone_number, avatar_url, wallet_balance").in("id", userIds)
    : { data: [] as DbUser[], error: null };
  if (usersErr) throw usersErr;
  const usersById = new Map(((usersData ?? []) as DbUser[]).map((u) => [u.id, u]));

  const fillsByContract = groupBy(fills, (f) => f.contract_id);
  const contractsByBet = groupBy(contracts, (c) => c.bet_id);

  // Reactions: pull all bet_reactions rows for the feed in one query, group by
  // (bet_id, emoji), and tag the chips the current user contributed.
  const { data: { user: authUser } } = await supabase.auth.getUser();
  const reactionsByBet = await loadReactionsForBets(supabase, betIds, authUser?.id ?? null);

  const views = bets.map((bet) =>
    buildBetView(
      bet,
      contractsByBet.get(bet.id) ?? [],
      fillsByContract,
      usersById,
      groupsById,
      reactionsByBet.get(bet.id) ?? [],
    ),
  );
  // Fully-filled (locked) bets sink to the bottom; all others keep their
  // original created_at DESC order.
  views.sort((a, b) => {
    const aFilled = a.status === "locked" ? 1 : 0;
    const bFilled = b.status === "locked" ? 1 : 0;
    return aFilled - bFilled;
  });
  return views;
}

async function loadReactionsForBets(
  supabase: SupabaseClient,
  betIds: string[],
  currentUserId: string | null,
): Promise<Map<string, Reaction[]>> {
  const out = new Map<string, Reaction[]>();
  if (betIds.length === 0) return out;
  const { data } = await supabase
    .from("bet_reactions")
    .select("bet_id, user_id, emoji")
    .in("bet_id", betIds);
  const rows = (data ?? []) as Array<{ bet_id: string; user_id: string; emoji: string }>;
  const grouped = new Map<string, Map<string, { count: number; reactedByMe: boolean }>>();
  for (const r of rows) {
    const byEmoji = grouped.get(r.bet_id) ?? new Map();
    const cell = byEmoji.get(r.emoji) ?? { count: 0, reactedByMe: false };
    cell.count += 1;
    if (currentUserId && r.user_id === currentUserId) cell.reactedByMe = true;
    byEmoji.set(r.emoji, cell);
    grouped.set(r.bet_id, byEmoji);
  }
  for (const [betId, byEmoji] of grouped) {
    const arr: Reaction[] = [];
    for (const [emoji, v] of byEmoji) arr.push({ emoji, count: v.count, reactedByMe: v.reactedByMe });
    arr.sort((a, b) => b.count - a.count || a.emoji.localeCompare(b.emoji));
    out.set(betId, arr);
  }
  return out;
}

// ────────────────────────────────────────────────
// Mapping helpers
// ────────────────────────────────────────────────
function buildBetView(
  bet: DbBet,
  betContracts: DbContract[],
  fillsByContract: Map<string, DbFill[]>,
  usersById: Map<string, DbUser>,
  groupsById: Map<string, DbGroup>,
  reactions: Reaction[],
): BetView {
  const posterUser = usersById.get(bet.poster_id ?? "");
  const creator = toUserLite(bet.poster_id, posterUser);
  const posterSide: BetSide = (bet.poster_position ?? "YES").toLowerCase() as BetSide;

  // Original (creator's) contracts vs sub-contracts (other posters' lines).
  const originalContracts = betContracts.filter((c) => c.creator_id === bet.poster_id);
  const subContractRows = betContracts.filter((c) => c.creator_id !== bet.poster_id);

  // `createBet` writes a synthetic fill where filler_id === contract.creator_id
  // to mark the poster's own stake as locked. That isn't a counter-party fill
  // and must be excluded when computing how much of the line is taken.
  const isCounterFill = (f: DbFill, contractCreatorId: string | null) =>
    f.filler_id !== null && f.filler_id !== contractCreatorId;

  const originalFilledCents = sumCents(
    originalContracts
      .flatMap((c) => (fillsByContract.get(c.id) ?? []).filter((f) => isCounterFill(f, c.creator_id)))
      .map((f) => f.amount),
  );

  const subContracts: SubContractView[] = subContractRows.map((c) => {
    const subPoster = toUserLite(c.creator_id, usersById.get(c.creator_id ?? ""));
    const filled = sumCents(
      (fillsByContract.get(c.id) ?? [])
        .filter((f) => isCounterFill(f, c.creator_id))
        .map((f) => f.amount),
    );
    return {
      id: c.id,
      bet_id: c.bet_id,
      poster: subPoster,
      poster_side: ((c.position ?? "YES").toLowerCase()) as BetSide,
      yes_probability: Math.round(c.odds),
      stake_cents: toCents(c.stake_amount),
      filled_cents: filled,
      created_at: c.created_at,
    };
  });

  // ContractView entries — one per *counter-party* fill, sized to that fill.
  // Self-fills (the poster's own stake-lock marker) are excluded so the line
  // bar doesn't read 100% filled the instant a bet is posted.
  const contractViews: ContractView[] = betContracts.flatMap((c) => {
    const cFills = (fillsByContract.get(c.id) ?? []).filter((f) =>
      isCounterFill(f, c.creator_id),
    );
    return cFills.map((f) => {
      const posterLite = toUserLite(c.creator_id, usersById.get(c.creator_id ?? ""));
      const fillerLite = toUserLite(f.filler_id, usersById.get(f.filler_id ?? ""));
      const isYesPoster = (c.position ?? "YES") === "YES";
      return {
        id: f.id,
        bet_id: c.bet_id,
        yes_user_id: isYesPoster ? posterLite.id : fillerLite.id,
        no_user_id: isYesPoster ? fillerLite.id : posterLite.id,
        yes_probability: Math.round(c.odds),
        stake_cents: toCents(f.amount),
        negotiation_id: null,
        status: "active",
        yes_outcome: null,
        created_at: f.created_at,
        resolved_at: null,
        yes_user: isYesPoster ? posterLite : fillerLite,
        no_user: isYesPoster ? fillerLite : posterLite,
      };
    });
  });

  const relationship = relationshipLabel(bet, groupsById);
  const mediator = mediatorState(bet, usersById);

  const post_meta: PostMeta = {
    relationship,
    poster_side: posterSide,
    original_filled_cents: originalFilledCents,
    reactions: reactions ?? [],
    comments: [],
    poll: { yes_votes: 0, no_votes: 0, my_vote: null },
    sub_contracts: subContracts,
    mediator,
    end_at: bet.end_date,
    concluded: bet.is_concluded,
    winning_side: bet.winning_side ?? null,
  };

  return {
    id: bet.id,
    creator_id: bet.poster_id ?? "",
    question: bet.question,
    category: "other",
    yes_probability: originalContracts[0] != null ? Math.round(originalContracts[0].odds) : 50,
    stake_cents: toCents(bet.stake_amount),
    expiry_at: bet.end_date ?? bet.created_at,
    resolution_notes: null,
    status: mapBetStatus(bet.status),
    scope: mapScope(bet.audience_type),
    group_id: bet.group_id,
    expires_at: bet.expires_at,
    winning_side: bet.winning_side ?? null,
    created_at: bet.created_at,
    resolved_at: null,
    creator,
    participants: [],
    contracts: contractViews,
    open_negotiations: [],
    post_meta,
  };
}

function mapBetStatus(status: DbBet["status"]): BetStatus {
  if (status === "filled") return "locked";
  if (status === "closed") return "closed";
  if (status === "concluded" || status === "settled") return "resolved";
  return "open";
}

function mapScope(audience: DbBet["audience_type"]): BetView["scope"] {
  if (audience === "group") return "group";
  return "friends";
}

function relationshipLabel(
  bet: DbBet,
  groupsById: Map<string, DbGroup>,
): RelationshipLabel {
  if (bet.audience_type === "group" && bet.group_id) {
    const g = groupsById.get(bet.group_id);
    return { kind: "group", label: g ? `from ${g.name}` : "from group" };
  }
  return { kind: "friend", label: "Friend" };
}

function mediatorState(bet: DbBet, usersById: Map<string, DbUser>): PostMeta["mediator"] {
  if (bet.mediator_type === "none") return undefined;
  if (bet.mediator_type === "requested") {
    if (bet.mediator_id) {
      const m = toUserLite(bet.mediator_id, usersById.get(bet.mediator_id));
      return { mode: "accepted", mediator: m };
    }
    return { mode: "requested" };
  }
  // self-mediated → poster is mediator
  if (bet.poster_id) {
    const m = toUserLite(bet.poster_id, usersById.get(bet.poster_id));
    return { mode: "accepted", mediator: m };
  }
  return undefined;
}

function toUserLite(id: string | null | undefined, u: DbUser | undefined): UserLite {
  const safeId = id ?? u?.id ?? "unknown";
  const { first, last } = splitFullName(u?.full_name ?? null);
  return {
    id: safeId,
    first_name: first,
    last_name_initial: last,
    username: u?.username ?? null,
    avatar_color: pickAvatarColor(safeId),
    avatar_url: u?.avatar_url ?? null,
  };
}

function splitFullName(full: string | null): { first: string | null; last: string | null } {
  if (!full) return { first: null, last: null };
  const parts = full.trim().split(/\s+/);
  const first = parts[0] ?? null;
  const last = parts.length > 1 ? (parts[parts.length - 1][0] ?? "").toUpperCase() : null;
  return { first, last: last && last.length ? last : null };
}

// Amounts in the DB are stored as numeric dollar units; UI works in cents.
function toCents(amount: number | null | undefined): number {
  if (amount == null) return 0;
  return Math.round(Number(amount) * 100);
}

function sumCents(amounts: number[]): number {
  return amounts.reduce((s, a) => s + toCents(a), 0);
}

function uniq<T>(xs: T[]): T[] {
  return Array.from(new Set(xs));
}

function isString(x: string | null | undefined): x is string {
  return typeof x === "string" && x.length > 0;
}

function groupBy<T, K>(xs: T[], key: (x: T) => K): Map<K, T[]> {
  const out = new Map<K, T[]>();
  for (const x of xs) {
    const k = key(x);
    const arr = out.get(k);
    if (arr) arr.push(x);
    else out.set(k, [x]);
  }
  return out;
}
