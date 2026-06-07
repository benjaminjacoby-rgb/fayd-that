"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { Avatar } from "@/components/Avatar";
import { CategoryPill } from "@/components/CategoryPill";
import { ResolutionSection } from "@/components/ResolutionSection";
import { formatCents, fullName } from "@/lib/format";
import {
  getMyActiveContracts,
  getMyPosts,
  useSessionStore,
  type MyPostView,
  type PendingContractView,
} from "@/lib/sessionState";
import { closeBet } from "@/lib/data/betsClient";
import type { BetSide, BetView, UserLite } from "@/types/db";

// ── History helpers ───────────────────────────────────────────────────────────

interface HistoryItem {
  /** Unique key for React lists */
  id: string;
  bet: BetView;
  /** Which side the current user was on */
  userSide: BetSide;
  /** How much they staked (cents) */
  userStakeCents: number;
  /** Their implied odds as a percentage (e.g. 60 for 60%) */
  userOdds: number;
  /** True when the current user posted this bet */
  isPost: boolean;
  /** ISO string used for sorting: resolved_at > created_at */
  sortKey: string;
}

/**
 * Returns the total payout in cents from the user's perspective:
 *   positive  = they received this amount (green)
 *   negative  = they lost this amount (red)
 */
function computePayoutCents(item: HistoryItem): number {
  const ws = item.bet.winning_side;
  if (!ws) return 0;
  const won = ws.toLowerCase() === item.userSide;

  if (item.isPost) {
    const fillerOdds = 100 - item.userOdds;
    const filledCents = item.bet.post_meta?.original_filled_cents ?? 0;
    if (won) {
      // Poster receives their stake back + everything the fillers put in.
      return item.userStakeCents + filledCents;
    } else {
      // Poster loses only the matched portion of their stake.
      if (fillerOdds <= 0) return 0;
      return -Math.round(filledCents * item.userOdds / fillerOdds);
    }
  } else {
    // Filler
    if (won) {
      if (item.userOdds <= 0) return 0;
      return Math.round(item.userStakeCents / (item.userOdds / 100));
    } else {
      return -item.userStakeCents;
    }
  }
}

function formatHistoryDate(iso: string): string {
  const d = new Date(iso);
  return d.toLocaleDateString("en-US", {
    month: "short",
    day: "numeric",
    year: "2-digit",
  });
}

export interface PendingPostSeed {
  bet: BetView;
}

export interface PendingContractSeed {
  id: string;
  bet: BetView;
  side: PendingContractView["side"];
  yesPercent: number;
  stakeCents: number;
  createdAt: string;
}

type Tab = "active" | "history";

export function PendingClient({
  currentUser,
  initialPosts,
  initialContracts,
  initialResolvedPosts,
  initialResolvedContracts,
}: {
  currentUser: UserLite;
  initialPosts: PendingPostSeed[];
  initialContracts: PendingContractSeed[];
  initialResolvedPosts: PendingPostSeed[];
  initialResolvedContracts: PendingContractSeed[];
}) {
  useSessionStore(); // re-render on session-store changes
  const router = useRouter();
  const [mounted, setMounted] = useState(false);
  const [tab, setTab] = useState<Tab>("active");
  const [historySearch, setHistorySearch] = useState("");
  useEffect(() => setMounted(true), []);
  const onSettled = () => router.refresh();

  // Active (unresolved) bets — session store wins over stale server snapshot.
  const sessionPosts = mounted ? getMyPosts().filter((p) => p.source === "session") : [];
  const sessionActives = mounted ? getMyActiveContracts().filter((a) => a.source === "session") : [];

  const sessionPostBetIds = new Set(sessionPosts.map((p) => p.bet.id));
  const serverPosts: MyPostView[] = initialPosts
    .filter((p) => !sessionPostBetIds.has(p.bet.id))
    .map((p) => ({ bet: p.bet, source: "seed" as const }));
  const posts: MyPostView[] = [...sessionPosts, ...serverPosts];

  const postedBetIds = new Set(posts.map((p) => p.bet.id));
  const sessionActiveIds = new Set(sessionActives.map((a) => a.id));
  const serverActives: PendingContractView[] = initialContracts
    .filter((c) => !postedBetIds.has(c.bet.id) && !sessionActiveIds.has(c.id))
    .map((c) => ({
      id: c.id,
      bet: c.bet,
      side: c.side,
      yesPercent: c.yesPercent,
      stakeCents: c.stakeCents,
      createdAt: c.createdAt,
      source: "seed" as const,
    }));
  const actives: PendingContractView[] = [
    ...sessionActives.filter((a) => !postedBetIds.has(a.bet.id)),
    ...serverActives,
  ];

  // History (resolved) bets — server only, no session-store equivalent.
  const resolvedPosts: MyPostView[] = initialResolvedPosts.map((p) => ({
    bet: p.bet,
    source: "seed" as const,
  }));
  const resolvedActives: PendingContractView[] = initialResolvedContracts.map((c) => ({
    id: c.id,
    bet: c.bet,
    side: c.side,
    yesPercent: c.yesPercent,
    stakeCents: c.stakeCents,
    createdAt: c.createdAt,
    source: "seed" as const,
  }));

  const hasActive = actives.length > 0 || posts.length > 0;
  const hasHistory = resolvedActives.length > 0 || resolvedPosts.length > 0;

  // Unified, sorted history list for the History tab.
  const historyItems: HistoryItem[] = [
    ...resolvedPosts.map((p): HistoryItem => {
      const posterSide = (p.bet.post_meta?.poster_side ?? "yes") as BetSide;
      const userOdds =
        posterSide === "yes" ? p.bet.yes_probability : 100 - p.bet.yes_probability;
      return {
        id: `post-${p.bet.id}`,
        bet: p.bet,
        userSide: posterSide,
        userStakeCents: p.bet.stake_cents,
        userOdds,
        isPost: true,
        sortKey: p.bet.resolved_at ?? p.bet.created_at,
      };
    }),
    ...resolvedActives.map((a): HistoryItem => ({
      id: `active-${a.id}`,
      bet: a.bet,
      userSide: a.side,
      userStakeCents: a.stakeCents,
      userOdds: a.side === "yes" ? a.yesPercent : 100 - a.yesPercent,
      isPost: false,
      sortKey: a.bet.resolved_at ?? a.bet.created_at,
    })),
  ].sort((a, b) => b.sortKey.localeCompare(a.sortKey));

  const historyQuery = historySearch.toLowerCase().trim();
  const filteredHistory = historyQuery
    ? historyItems.filter((item) => {
        if (item.bet.question.toLowerCase().includes(historyQuery)) return true;
        const name = fullName(item.bet.creator).toLowerCase();
        const username = (item.bet.creator.username ?? "").toLowerCase();
        return name.includes(historyQuery) || username.includes(historyQuery);
      })
    : historyItems;

  if (mounted && !hasActive && !hasHistory) {
    return <EmptyState />;
  }

  return (
    <div className="flex flex-col">
      {/* Tab bar */}
      <div className="flex border-b border-bg3 px-4 pt-4 gap-4">
        <TabButton active={tab === "active"} onClick={() => setTab("active")}>
          Active
        </TabButton>
        <TabButton active={tab === "history"} onClick={() => setTab("history")}>
          History
        </TabButton>
      </div>

      {tab === "active" ? (
        <div className="px-4 pt-4 pb-6 flex flex-col gap-6">
          <section>
            <SectionHeader title="My Posts" count={posts.length} />
            {posts.length === 0 ? (
              <p className="text-text3 text-sm italic mt-2">
                Bets you create will show up here.
              </p>
            ) : (
              <ul className="flex flex-col gap-3 mt-3">
                {posts.map((p) => (
                  <li key={p.bet.id}>
                    <PostRow
                      row={p}
                      currentUserId={currentUser.id}
                      onSettled={onSettled}
                      onClose={async () => {
                        await closeBet(p.bet.id);
                        router.refresh();
                      }}
                    />
                  </li>
                ))}
              </ul>
            )}
          </section>

          <section>
            <SectionHeader title="Active" count={actives.length} />
            {actives.length === 0 ? (
              <p className="text-text3 text-sm italic mt-2">
                Bets you've locked in this session will show up here.
              </p>
            ) : (
              <ul className="flex flex-col gap-3 mt-3">
                {actives.map((a) => (
                  <li key={a.id}>
                    <ActiveRow row={a} currentUserId={currentUser.id} onSettled={onSettled} />
                  </li>
                ))}
              </ul>
            )}
          </section>
        </div>
      ) : (
        <div className="px-4 pt-3 pb-6 flex flex-col gap-4">
          {/* Search bar */}
          <div className="relative">
            <span className="absolute left-3 top-1/2 -translate-y-1/2 text-text3 pointer-events-none text-sm">
              🔍
            </span>
            <input
              type="text"
              value={historySearch}
              onChange={(e) => setHistorySearch(e.target.value)}
              placeholder="Search by question or poster…"
              className="w-full bg-bg3 rounded-pill pl-9 pr-4 py-2.5 text-sm text-text placeholder:text-text3 focus:outline-none focus:ring-2 focus:ring-yes/30"
            />
            {historySearch ? (
              <button
                onClick={() => setHistorySearch("")}
                className="absolute right-3 top-1/2 -translate-y-1/2 text-text3 hover:text-text2 text-lg leading-none"
                aria-label="Clear search"
              >
                ×
              </button>
            ) : null}
          </div>

          {/* Results */}
          {!hasHistory ? (
            <p className="text-text3 text-sm italic pt-4 text-center">
              Resolved bets will show up here.
            </p>
          ) : filteredHistory.length === 0 ? (
            <p className="text-text3 text-sm italic pt-4 text-center">
              No bets match "{historySearch}"
            </p>
          ) : (
            <ul className="flex flex-col gap-3">
              {filteredHistory.map((item) => (
                <li key={item.id}>
                  <HistoryCard item={item} currentUserId={currentUser.id} />
                </li>
              ))}
            </ul>
          )}
        </div>
      )}
    </div>
  );
}

function TabButton({
  active,
  onClick,
  children,
}: {
  active: boolean;
  onClick: () => void;
  children: React.ReactNode;
}) {
  return (
    <button
      onClick={onClick}
      className={`pb-2.5 text-sm font-semibold border-b-2 transition ${
        active
          ? "border-yes text-yes"
          : "border-transparent text-text3 hover:text-text2"
      }`}
    >
      {children}
    </button>
  );
}

function SectionHeader({ title, count }: { title: string; count: number }) {
  return (
    <div className="flex items-baseline gap-2">
      <h2 className="text-xs uppercase tracking-wide text-text3 font-bold">{title}</h2>
      {count > 0 ? (
        <span className="text-[11px] font-mono text-text3">· {count}</span>
      ) : null}
    </div>
  );
}

function ActiveRow({
  row,
  currentUserId,
  onSettled,
  resolved = false,
}: {
  row: PendingContractView;
  currentUserId: string;
  onSettled: () => void;
  resolved?: boolean;
}) {
  const { bet, side, yesPercent, stakeCents } = row;
  const userOdds = side === "yes" ? yesPercent : 100 - yesPercent;
  const sideTextClass = side === "yes" ? "text-yes" : "text-no";
  const sideBgClass = side === "yes" ? "bg-yes/15 border-yes/30" : "bg-no/15 border-no/30";
  const showPoster = bet.creator?.id && bet.creator.id !== currentUserId;
  const winCents = userOdds > 0 ? Math.round(stakeCents / (userOdds / 100)) : 0;

  return (
    <article className="bg-bg2 rounded-card p-4">
      {showPoster ? (
        <div className="flex items-center gap-2 mb-3">
          <Avatar
            first={bet.creator.first_name}
            lastInitial={bet.creator.last_name_initial}
            color={bet.creator.avatar_color}
            imageUrl={bet.creator.avatar_url}
            size={28}
          />
          <div className="flex flex-col leading-tight">
            <span className="text-[10px] uppercase tracking-wide text-text3 font-semibold">
              Posted by
            </span>
            <span className="text-sm text-text font-medium">{fullName(bet.creator)}</span>
          </div>
        </div>
      ) : null}

      <div className={`rounded-input border ${sideBgClass} px-3 py-3 flex items-center justify-between`}>
        <span className="text-[10px] uppercase tracking-wide text-text3 font-semibold">
          Your side
        </span>
        <span className={`text-2xl font-extrabold tracking-wide ${sideTextClass}`}>
          {side.toUpperCase()}
        </span>
      </div>

      <div className="mt-3 flex items-center gap-2">
        <CategoryPill category={bet.category} />
        {row.source === "session" ? (
          <span className="text-[10px] uppercase tracking-wide bg-yes/20 text-yes rounded-pill px-1.5 py-px font-semibold">
            new
          </span>
        ) : null}
        {resolved ? (
          <span className="text-[10px] uppercase tracking-wide bg-bg3 text-text3 rounded-pill px-1.5 py-px font-semibold">
            resolved
          </span>
        ) : null}
      </div>
      <p className="font-medium leading-snug mt-2">{bet.question}</p>

      {resolved && bet.winning_side ? (
        <WinnerBanner bet={bet} />
      ) : null}

      <div className="mt-3 grid grid-cols-3 gap-2 text-xs">
        <Stat label="Odds">
          <span className="font-mono text-text">{userOdds}%</span>
        </Stat>
        <Stat label="Staked">
          <span className="font-mono text-gold">{formatCents(stakeCents)}</span>
        </Stat>
        <Stat label="Win">
          <span className={`font-mono ${sideTextClass}`}>{formatCents(winCents)}</span>
        </Stat>
      </div>

      {!resolved ? (
        <ResolutionSection bet={bet} currentUserId={currentUserId} onSettled={onSettled} />
      ) : null}
    </article>
  );
}

function PostRow({
  row,
  currentUserId,
  onSettled,
  onClose,
  resolved = false,
}: {
  row: MyPostView;
  currentUserId: string;
  onSettled: () => void;
  onClose?: () => Promise<void>;
  resolved?: boolean;
}) {
  const { bet } = row;
  const filled = bet.post_meta?.original_filled_cents ?? 0;
  const remaining = Math.max(0, bet.stake_cents - filled);
  const filledPct = bet.stake_cents > 0 ? Math.round((filled / bet.stake_cents) * 100) : 0;
  const fillCount = (bet.contracts ?? []).filter((c) => c.negotiation_id === null).length;
  const isClosed = bet.status === "closed";
  const posterSide = bet.post_meta?.poster_side ?? "yes";
  const posterOdds =
    posterSide === "yes" ? bet.yes_probability : 100 - bet.yes_probability;
  const posterSideClass = posterSide === "yes" ? "text-yes" : "text-no";

  const mediatorId =
    bet.post_meta?.mediator?.mode === "accepted"
      ? bet.post_meta.mediator.mediator?.id ?? null
      : null;
  const canClose =
    !resolved &&
    !isClosed &&
    (bet.creator_id === currentUserId || mediatorId === currentUserId);

  const [closing, setClosing] = useState(false);
  const [closeError, setCloseError] = useState<string | null>(null);
  const [confirmClose, setConfirmClose] = useState(false);

  async function handleClose() {
    if (!onClose) return;
    setClosing(true);
    setCloseError(null);
    try {
      await onClose();
    } catch (e) {
      setCloseError(e instanceof Error ? e.message : "Couldn't close bet");
      setConfirmClose(false);
    } finally {
      setClosing(false);
    }
  }

  return (
    <article className="bg-bg2 rounded-card p-4">
      <div className="flex items-center gap-2 mb-2">
        <CategoryPill category={bet.category} />
        {row.source === "session" ? (
          <span className="text-[10px] uppercase tracking-wide bg-yes/20 text-yes rounded-pill px-1.5 py-px font-semibold">
            new
          </span>
        ) : null}
        {isClosed ? (
          <span className="text-[10px] uppercase tracking-wide bg-gold/20 text-gold rounded-pill px-1.5 py-px font-semibold">
            closed
          </span>
        ) : null}
        {resolved ? (
          <span className="text-[10px] uppercase tracking-wide bg-bg3 text-text3 rounded-pill px-1.5 py-px font-semibold">
            resolved
          </span>
        ) : null}
      </div>
      <p className="font-medium leading-snug">{bet.question}</p>

      <div className="mt-2 flex items-center gap-1.5 text-xs">
        <span className="text-text3 uppercase tracking-wide text-[10px] font-semibold">
          Your side
        </span>
        <span
          className={`font-bold uppercase rounded-pill px-1.5 py-px text-[10px] ${
            posterSide === "yes" ? "bg-yes/15 text-yes" : "bg-no/15 text-no"
          }`}
        >
          {posterSide}
        </span>
        <span className={`font-mono ${posterSideClass}`}>{posterOdds}%</span>
      </div>

      {resolved && bet.winning_side ? (
        <WinnerBanner bet={bet} />
      ) : null}

      {!resolved ? (
        <>
          <div className="mt-3 flex items-center justify-between text-xs">
            {remaining > 0 ? (
              <span className="text-yes font-bold font-mono text-base">
                {formatCents(remaining)} still open
              </span>
            ) : (
              <span className="text-text3 font-bold text-base">fully filled</span>
            )}
            <span className="text-text3">
              {fillCount} {fillCount === 1 ? "person" : "people"} fayded
            </span>
          </div>

          <div className="mt-2 h-1 w-full rounded-pill bg-bg3 overflow-hidden">
            <div className="h-full bg-yes/60" style={{ width: `${filledPct}%` }} />
          </div>

          {canClose ? (
            <div className="mt-3">
              {!confirmClose ? (
                <button
                  onClick={() => setConfirmClose(true)}
                  className="w-full rounded-input border border-gold/50 text-gold font-semibold text-sm py-2.5 hover:bg-gold/10 active:scale-[0.97] transition"
                >
                  Close Bet
                </button>
              ) : (
                <div className="rounded-input border border-gold/50 bg-gold/10 px-3 py-2.5">
                  <p className="text-gold text-xs font-semibold text-center mb-2.5">
                    Close this bet to resolution? No new fills will be accepted.
                  </p>
                  <div className="flex gap-2">
                    <button
                      onClick={() => setConfirmClose(false)}
                      className="flex-1 rounded-input border border-bg4 text-text3 font-semibold text-sm py-2 hover:bg-bg3 active:scale-[0.97] transition"
                    >
                      Cancel
                    </button>
                    <button
                      disabled={closing}
                      onClick={handleClose}
                      className="flex-1 rounded-input bg-gold text-bg font-bold text-sm py-2 hover:bg-gold/80 active:scale-[0.97] transition disabled:opacity-40"
                    >
                      {closing ? "Closing…" : "Confirm Close"}
                    </button>
                  </div>
                </div>
              )}
              {closeError ? (
                <p className="text-no text-xs mt-1">{closeError}</p>
              ) : null}
            </div>
          ) : null}

          <ResolutionSection bet={bet} currentUserId={currentUserId} onSettled={onSettled} />
        </>
      ) : null}
    </article>
  );
}

function Stat({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="bg-bg3 rounded-input px-2.5 py-1.5">
      <div className="text-[10px] uppercase tracking-wide text-text3">{label}</div>
      <div className="mt-0.5">{children}</div>
    </div>
  );
}

// ── HistoryCard ───────────────────────────────────────────────────────────────

function HistoryCard({
  item,
  currentUserId,
}: {
  item: HistoryItem;
  currentUserId: string;
}) {
  const { bet, userSide, isPost, userOdds } = item;
  const ws = bet.winning_side; // "YES" | "NO" | null
  const won = ws ? ws.toLowerCase() === userSide : null;
  const payout = computePayoutCents(item);
  const dateStr = formatHistoryDate(bet.resolved_at ?? bet.created_at);

  const posterName = isPost
    ? "Your bet"
    : fullName(bet.creator) !== "—"
      ? fullName(bet.creator)
      : bet.creator.username
        ? `@${bet.creator.username}`
        : "Unknown poster";

  return (
    <article className="bg-bg2 rounded-card p-4 flex flex-col gap-2.5">
      {/* Row 1: poster info + date */}
      <div className="flex items-center justify-between gap-2">
        <div className="flex items-center gap-1.5 min-w-0">
          {!isPost ? (
            <Avatar
              first={bet.creator.first_name}
              lastInitial={bet.creator.last_name_initial}
              color={bet.creator.avatar_color}
              imageUrl={bet.creator.avatar_url}
              size={20}
            />
          ) : null}
          <span
            className={`text-xs font-medium truncate ${
              isPost ? "text-text3" : "text-text2"
            }`}
          >
            {posterName}
          </span>
        </div>
        <span className="text-[10px] text-text3 font-mono shrink-0">{dateStr}</span>
      </div>

      {/* Row 2: question */}
      <p className="text-sm font-medium leading-snug text-text">{bet.question}</p>

      {/* Row 3: winner pill + payout */}
      <div className="flex items-center justify-between gap-2">
        {/* Left: winner + user's side badge */}
        <div className="flex items-center gap-1.5 flex-wrap">
          {ws ? (
            <span
              className={`text-[11px] font-bold uppercase tracking-wide rounded-pill px-2 py-0.5 ${
                ws === "YES"
                  ? "bg-yes/15 text-yes"
                  : "bg-no/15 text-no"
              }`}
            >
              {ws} won
            </span>
          ) : (
            <span className="text-[11px] text-text3 italic">Concluded</span>
          )}
          <span
            className={`text-[10px] font-semibold uppercase tracking-wide rounded-pill px-1.5 py-px ${
              userSide === "yes"
                ? "bg-yes/10 text-yes/70"
                : "bg-no/10 text-no/70"
            }`}
          >
            You: {userSide.toUpperCase()} · {userOdds}%
          </span>
        </div>

        {/* Right: payout */}
        {ws && payout !== 0 ? (
          <span
            className={`text-sm font-bold font-mono shrink-0 ${
              won ? "text-yes" : "text-no"
            }`}
          >
            {won
              ? `+${formatCents(payout)}`
              : `-${formatCents(Math.abs(payout))}`}
          </span>
        ) : null}
      </div>
    </article>
  );
}

/** Displays the winning side and the names of winning participants. */
function WinnerBanner({ bet }: { bet: BetView }) {
  const ws = bet.winning_side; // "YES" | "NO"
  if (!ws) return null;

  const isYes = ws === "YES";
  const winnerColor = isYes ? "text-yes" : "text-no";
  const winnerBg = isYes ? "bg-yes/10 border-yes/30" : "bg-no/10 border-no/30";

  // Collect unique winner UserLite entries from all ContractView entries.
  const contracts = bet.contracts ?? [];
  const winnerMap = new Map<string, { first_name: string | null; last_name_initial: string | null; username: string | null }>();
  for (const c of contracts) {
    const u = isYes ? c.yes_user : c.no_user;
    if (u && !winnerMap.has(u.id)) winnerMap.set(u.id, u);
  }
  const winners = Array.from(winnerMap.values());

  const winnerNames =
    winners.length > 0
      ? winners.map((u) => fullName(u) ?? u.username ?? "—").join(", ")
      : null;

  return (
    <div className={`mt-3 rounded-input border px-3 py-2.5 flex items-center gap-2 ${winnerBg}`}>
      <span className={`text-lg leading-none`}>{isYes ? "✅" : "❌"}</span>
      <div>
        <span className={`text-sm font-bold ${winnerColor}`}>{ws} won</span>
        {winnerNames ? (
          <span className="text-text3 text-xs ml-1.5">· {winnerNames}</span>
        ) : null}
      </div>
    </div>
  );
}

function EmptyState() {
  return (
    <div className="px-6 pt-16 text-center">
      <div className="text-5xl mb-3">🎲</div>
      <h2 className="text-lg font-semibold mb-1">No bets yet</h2>
      <p className="text-text2 text-sm mb-6">
        Bets you join or post will show up here.
      </p>
      <Link
        href="/"
        className="inline-block bg-yes text-bg font-semibold px-5 py-3 rounded-input"
      >
        Browse the feed
      </Link>
    </div>
  );
}
