// Hand-written DB types mirroring supabase/migrations/0001_initial_schema.sql
// and supabase/migrations/0002_negotiations_and_contracts.sql.
// TODO: regenerate with `supabase gen types typescript` once the project is linked.

export type BetCategory = "fitness" | "academics" | "social" | "finance" | "other";
export type BetStatus = "open" | "locked" | "resolved" | "disputed" | "cancelled";
export type BetScope = "friends" | "group" | "geo";
export type BetSide = "yes" | "no";
export type BetOutcome = "win" | "lose";
export type MediationStatus = "pending" | "ruling_submitted" | "complete";
export type FriendshipStatus = "pending" | "accepted";

// ── Phase 2: negotiations + contracts ──
export type StakeTierCents = 500 | 1000 | 2500 | 5000 | 10000;
export type NegotiationStatus = "open" | "accepted" | "countered" | "cancelled";
export type ContractStatus = "active" | "resolved";
// "pending" = awaiting admin approval — surfaced via group_members.status
export type GroupMemberStatus = "active" | "pending";

export interface UserRow {
  id: string;
  phone: string;
  username: string | null;
  first_name: string | null;
  last_name_initial: string | null;
  avatar_color: string;
  stripe_customer_id: string | null;
  wallet_balance_cents: number;
  created_at: string;
}

export type UserLite = Pick<
  UserRow,
  "id" | "first_name" | "last_name_initial" | "username" | "avatar_color"
>;

export interface BetRow {
  id: string;
  creator_id: string;
  question: string;
  category: BetCategory;
  yes_probability: number;
  stake_cents: number;
  expiry_at: string;
  resolution_notes: string | null;
  status: BetStatus;
  scope: BetScope;
  group_id: string | null;
  geo_lat: number | null;
  geo_lng: number | null;
  geo_radius_meters: number | null;
  created_at: string;
  resolved_at: string | null;
}

export interface BetParticipantRow {
  id: string;
  bet_id: string;
  user_id: string;
  side: BetSide;
  stake_cents: number;
  stripe_payment_intent_id: string | null;
  paid_at: string | null;
  outcome: BetOutcome | null;
}

export interface FriendshipRow {
  id: string;
  requester_id: string;
  addressee_id: string;
  status: FriendshipStatus;
  created_at: string;
}

export interface GroupRow {
  id: string;
  name: string;
  invite_code: string;
  admin_id: string;
  created_at: string;
}

export interface GroupMemberRow {
  id: string;
  group_id: string;
  user_id: string;
  status: GroupMemberStatus;
  joined_at: string;
}

export interface MediationRow {
  id: string;
  bet_id: string;
  mediator_id: string;
  status: MediationStatus;
  ruling: BetSide | null;
  fee_cents: number;
  created_at: string;
}

export interface NotificationRow {
  id: string;
  user_id: string;
  type: string;
  payload: Record<string, unknown>;
  read: boolean;
  created_at: string;
}

// ── Phase 2 ──
export interface NegotiationRow {
  id: string;
  bet_id: string;
  proposer_id: string;
  proposed_yes_probability: number;
  stake_tier_cents: StakeTierCents;
  status: NegotiationStatus;
  parent_negotiation_id: string | null;
  created_at: string;
}

export interface ContractRow {
  id: string;
  bet_id: string;
  yes_user_id: string;
  no_user_id: string;
  yes_probability: number;
  stake_cents: number;
  negotiation_id: string | null;
  status: ContractStatus;
  yes_outcome: BetOutcome | null;
  created_at: string;
  resolved_at: string | null;
}

// ────────────────────────────────────────────────
// View models (joined shapes consumed by the UI)
// ────────────────────────────────────────────────
export interface BetView extends BetRow {
  creator: UserLite;
  participants: Array<BetParticipantRow & { user: UserLite }>;
  // Phase 2 — present when the UI loads contract/negotiation context for the bet.
  contracts?: ContractView[];
  open_negotiations?: NegotiationView[];
  // Phase 3 (social feed) — present on the home/group feed.
  post_meta?: PostMeta;
}

export interface ContractView extends ContractRow {
  yes_user: UserLite;
  no_user: UserLite;
}

export interface NegotiationView extends NegotiationRow {
  proposer: UserLite;
}

// Friendship view with the "other" party already joined in.
export interface FriendshipView extends FriendshipRow {
  other_user: UserLite;
}

// Group view with admin + member count baked in.
export interface GroupView extends GroupRow {
  admin: UserLite;
  member_count: number;
  is_admin: boolean;
  pending_join_count: number;
}

// ────────────────────────────────────────────────
// Social-feed view models — purely UI shapes, hand-rolled for mock data.
// Live data will derive these from the existing tables + new posts /
// post_reactions / post_comments / post_poll_votes tables we'll add
// later. No backend wiring yet.
// ────────────────────────────────────────────────
export interface Reaction {
  emoji: string;
  count: number;
  reactedByMe: boolean;
}

export interface CommentView {
  id: string;
  user: UserLite;
  text: string;
  created_at: string;
}

export interface PollView {
  yes_votes: number;
  no_votes: number;
  my_vote: BetSide | null;
}

/**
 * A sub-contract spawned via the "Start New Contract" flow on a post.
 * Independent from the original contract — its own line, stake, and fill state.
 */
export interface SubContractView {
  id: string;
  bet_id: string;
  poster: UserLite;
  poster_side: BetSide;
  yes_probability: number;
  stake_cents: number;        // total face value (one tier)
  filled_cents: number;       // amount filled by counter-parties so far
  created_at: string;
}

/** Label describing how the viewer knows the poster, shown under their name. */
export interface RelationshipLabel {
  kind: "friend" | "group" | "self";
  label: string;
}

/**
 * Mediator state on a post.
 *   - "self"      — poster decides outcome at resolution; mediator === poster
 *   - "requested" — open request; anyone viewing the post can accept
 *   - "accepted"  — someone (or the poster, when self-mediating) is locked in
 * UI-only; the eventual backend will model this via the existing mediations table.
 */
export interface MediatorState {
  mode: "self" | "requested" | "accepted";
  mediator?: UserLite;
}

/**
 * Everything the Instagram-style PostCard needs that isn't already on
 * BetRow / BetView. Attached as an optional `post_meta` field on BetView
 * so we don't break Phase 1/2 pages that still read the older shape.
 */
export interface PostMeta {
  relationship: RelationshipLabel;
  /** Which side the original poster took. */
  poster_side: BetSide;
  /** Total filled on the *original* contract (counter-party side). */
  original_filled_cents: number;
  reactions: Reaction[];
  comments: CommentView[];
  poll: PollView;
  sub_contracts: SubContractView[];
  /** Absent when the poster declined to pick a mediator option. */
  mediator?: MediatorState;
  /** Optional explicit end date/time for the bet, set at post time. */
  end_at?: string | null;
  /** True once the poster or mediator has manually marked the bet concluded. */
  concluded?: boolean;
}

// ────────────────────────────────────────────────
// Messaging (Phase 4) — UI-only shapes; no Supabase tables yet.
// TODO: add `conversations`, `conversation_members`, `messages` tables.
// ────────────────────────────────────────────────
export type ConversationKind = "dm" | "group";
export type ChatMessageKind = "text" | "bet";

export interface ChatMessageView {
  id: string;
  conversation_id: string;
  sender: UserLite;
  kind: ChatMessageKind;
  /** Present when kind === "text". */
  text?: string;
  /** Present when kind === "bet" — references a BetView by id. */
  bet_id?: string;
  created_at: string;
}

export interface ConversationView {
  id: string;
  kind: ConversationKind;
  /** For DMs: the other participant. */
  other_user?: UserLite;
  /** For group chats: the underlying group. */
  group?: GroupView;
  /** Inbox label — "Sarah K." or "EH7 House". */
  title: string;
  unread_count: number;
  /** Newest message (for the inbox preview). */
  last_message?: ChatMessageView;
}
