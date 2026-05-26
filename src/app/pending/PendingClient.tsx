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
import type { BetView, UserLite } from "@/types/db";

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
        <div className="px-4 pt-4 pb-6 flex flex-col gap-6">
          {!hasHistory ? (
            <p className="text-text3 text-sm italic mt-4">
              Resolved bets will show up here.
            </p>
          ) : (
            <>
              {resolvedPosts.length > 0 ? (
                <section>
                  <SectionHeader title="My Posts" count={resolvedPosts.length} />
                  <ul className="flex flex-col gap-3 mt-3">
                    {resolvedPosts.map((p) => (
                      <li key={p.bet.id}>
                        <PostRow
                          row={p}
                          currentUserId={currentUser.id}
                          onSettled={onSettled}
                          resolved
                        />
                      </li>
                    ))}
                  </ul>
                </section>
              ) : null}
              {resolvedActives.length > 0 ? (
                <section>
                  <SectionHeader title="Filled" count={resolvedActives.length} />
                  <ul className="flex flex-col gap-3 mt-3">
                    {resolvedActives.map((a) => (
                      <li key={a.id}>
                        <ActiveRow
                          row={a}
                          currentUserId={currentUser.id}
                          onSettled={onSettled}
                          resolved
                        />
                      </li>
                    ))}
                  </ul>
                </section>
              ) : null}
            </>
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

  async function handleClose() {
    if (!onClose) return;
    setClosing(true);
    setCloseError(null);
    try {
      await onClose();
    } catch (e) {
      setCloseError(e instanceof Error ? e.message : "Couldn't close bet");
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
              <button
                disabled={closing}
                onClick={handleClose}
                className="w-full rounded-input border border-gold/50 text-gold font-semibold text-sm py-2.5 hover:bg-gold/10 active:scale-[0.97] transition disabled:opacity-40"
              >
                {closing ? "Closing…" : "Close Bet"}
              </button>
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
