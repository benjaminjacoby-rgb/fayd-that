"use client";

// In-session client store for cross-page state that doesn't yet have a backend:
//   - Which conversations the user has opened (→ unread badges drop to 0).
//   - Extra messages auto-posted or sent this session.
//   - Bets the user has created or filled this session (→ Pending page).
// All reads happen via `useSessionStore()` + the selector helpers below.
// TODO: replace with Supabase queries + realtime channels.

import { useSyncExternalStore } from "react";
import {
  MOCK_BETS,
  MOCK_CONVERSATIONS,
  MOCK_CURRENT_USER,
} from "@/lib/mock";
import type { BetSide, BetView, ChatMessageView } from "@/types/db";

export interface PendingContractView {
  /** Stable id (the contract id or a synthesized one for fills) */
  id: string;
  bet: BetView;
  side: BetSide;
  /** Always stored as YES probability — UI converts when displaying the taker's side. */
  yesPercent: number;
  stakeCents: number;
  createdAt: string;
  /** Pre-seeded vs. taken this session — drives a subtle "new" tag. */
  source: "seed" | "session";
}

export interface MyPostView {
  bet: BetView;
  source: "seed" | "session";
}

interface State {
  readConversationIds: Set<string>;
  extraMessagesByConversation: Record<string, ChatMessageView[]>;
  /** Bets created this session so chat views can hydrate inline cards. */
  sessionBetsById: Record<string, BetView>;
  myPosts: MyPostView[];
  myActiveContracts: PendingContractView[];
  /** Mock-mode-only block list — live mode is enforced by RLS instead. */
  blockedUserIds: Set<string>;
}

// ────────────────────────────────────────────────
// Seed: derive pre-existing "my posts" + "my active contracts" from the mock
// bet data so the Pending page never looks empty on first visit.
// ────────────────────────────────────────────────
function seed(): State {
  const me = MOCK_CURRENT_USER.id;
  const myPosts: MyPostView[] = MOCK_BETS
    .filter((b) => b.creator_id === me)
    .map((b) => ({ bet: b, source: "seed" as const }));

  const myActiveContracts: PendingContractView[] = [];
  for (const b of MOCK_BETS) {
    for (const c of b.contracts ?? []) {
      if (c.yes_user_id === me) {
        myActiveContracts.push({
          id: c.id,
          bet: b,
          side: "yes",
          yesPercent: c.yes_probability,
          stakeCents: c.stake_cents,
          createdAt: c.created_at,
          source: "seed",
        });
      } else if (c.no_user_id === me) {
        myActiveContracts.push({
          id: c.id,
          bet: b,
          side: "no",
          yesPercent: c.yes_probability,
          stakeCents: c.stake_cents,
          createdAt: c.created_at,
          source: "seed",
        });
      }
    }
  }
  // Newest first.
  myActiveContracts.sort((a, b) => b.createdAt.localeCompare(a.createdAt));

  return {
    readConversationIds: new Set(),
    extraMessagesByConversation: {},
    sessionBetsById: {},
    myPosts,
    myActiveContracts,
    blockedUserIds: new Set(),
  };
}

let state: State = seed();
let version = 0;
const listeners = new Set<() => void>();

function notify() {
  version++;
  listeners.forEach((fn) => fn());
}
function subscribe(fn: () => void) {
  listeners.add(fn);
  return () => {
    listeners.delete(fn);
  };
}
function getVersion() {
  return version;
}

// ────────────────────────────────────────────────
// Mutators
// ────────────────────────────────────────────────
export function markConversationRead(id: string) {
  if (state.readConversationIds.has(id)) return;
  state.readConversationIds = new Set([...state.readConversationIds, id]);
  notify();
}

export function addChatMessage(conversationId: string, msg: ChatMessageView) {
  const arr = state.extraMessagesByConversation[conversationId] ?? [];
  state.extraMessagesByConversation = {
    ...state.extraMessagesByConversation,
    [conversationId]: [...arr, msg],
  };
  notify();
}

/**
 * After the server confirms a message, swap out the optimistic temp entry
 * (which has a `m-new-…` id) for the real message from the DB so that if
 * the user navigates away and back this session the conversation list stays
 * deduplicated and consistent with what the server knows about.
 */
export function replaceChatMessage(
  conversationId: string,
  tempId: string,
  realMsg: ChatMessageView,
) {
  const arr = state.extraMessagesByConversation[conversationId] ?? [];
  const next = arr.map((m) => (m.id === tempId ? realMsg : m));
  state.extraMessagesByConversation = {
    ...state.extraMessagesByConversation,
    [conversationId]: next,
  };
  notify();
}

export function registerSessionBet(bet: BetView) {
  state.sessionBetsById = { ...state.sessionBetsById, [bet.id]: bet };
  notify();
}

export function addMyPost(bet: BetView) {
  state.sessionBetsById = { ...state.sessionBetsById, [bet.id]: bet };
  state.myPosts = [{ bet, source: "session" }, ...state.myPosts];
  notify();
}

export function addMyActiveContract(c: Omit<PendingContractView, "source">) {
  state.myActiveContracts = [
    { ...c, source: "session" },
    ...state.myActiveContracts,
  ];
  notify();
}

export function blockUserMock(userId: string) {
  if (state.blockedUserIds.has(userId)) return;
  state.blockedUserIds = new Set([...state.blockedUserIds, userId]);
  notify();
}

export function unblockUserMock(userId: string) {
  if (!state.blockedUserIds.has(userId)) return;
  const next = new Set(state.blockedUserIds);
  next.delete(userId);
  state.blockedUserIds = next;
  notify();
}

// ────────────────────────────────────────────────
// Selectors — must be called inside a component that subscribed via
// useSessionStore(), otherwise updates won't trigger re-renders.
// ────────────────────────────────────────────────
export function isConversationRead(id: string): boolean {
  return state.readConversationIds.has(id);
}

export function getExtraMessages(conversationId: string): ChatMessageView[] {
  return state.extraMessagesByConversation[conversationId] ?? [];
}

export function getSessionBetById(id: string): BetView | undefined {
  return state.sessionBetsById[id];
}

export function getMyPosts(): MyPostView[] {
  return state.myPosts;
}

export function getMyActiveContracts(): PendingContractView[] {
  return state.myActiveContracts;
}

export function isBlockedMock(userId: string): boolean {
  return state.blockedUserIds.has(userId);
}

export function getBlockedUserIdsMock(): string[] {
  return Array.from(state.blockedUserIds);
}

/** Total inbox unread, counting opened conversations as zero. */
export function getTotalUnread(): number {
  let total = 0;
  for (const c of Object.values(MOCK_CONVERSATIONS)) {
    if (state.readConversationIds.has(c.id)) continue;
    total += c.unread_count;
  }
  return total;
}

// ────────────────────────────────────────────────
// Hook — call from any client component to re-render on store changes.
// SSR snapshot is fixed at 0 so initial server / client render agree.
// ────────────────────────────────────────────────
export function useSessionStore(): number {
  return useSyncExternalStore(subscribe, getVersion, () => 0);
}
