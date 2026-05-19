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
