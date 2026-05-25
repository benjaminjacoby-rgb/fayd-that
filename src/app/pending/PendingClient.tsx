"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { CategoryPill } from "@/components/CategoryPill";
import { formatCents, formatTimeRemaining } from "@/lib/format";
import {
  getMyActiveContracts,
  getMyPosts,
  useSessionStore,
  type MyPostView,
  type PendingContractView,
} from "@/lib/sessionState";
import type { UserLite } from "@/types/db";

export function PendingClient({ currentUser: _currentUser }: { currentUser: UserLite }) {
  useSessionStore(); // re-render on session-store changes
  // Defer reading store state until after mount so SSR + hydration match.
  const [mounted, setMounted] = useState(false);
  useEffect(() => setMounted(true), []);

  const actives: PendingContractView[] = mounted ? getMyActiveContracts() : [];
  const posts: MyPostView[] = mounted ? getMyPosts() : [];

  if (mounted && actives.length === 0 && posts.length === 0) {
    return <EmptyState />;
  }

  return (
    <div className="px-4 pt-4 pb-6 flex flex-col gap-6">
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
                <ActiveRow row={a} />
              </li>
            ))}
          </ul>
        )}
      </section>

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
                <PostRow row={p} />
              </li>
            ))}
          </ul>
        )}
      </section>
    </div>
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

function ActiveRow({ row }: { row: PendingContractView }) {
  const { bet, side, yesPercent, stakeCents } = row;
  // Display the taker's odds — flip if user is on NO.
  const userOdds = side === "yes" ? yesPercent : 100 - yesPercent;
  const sideClass = side === "yes" ? "bg-yes/20 text-yes" : "bg-no/20 text-no";
  return (
    <article className="bg-bg2 rounded-card p-4">
      <div className="flex items-center gap-2 mb-2">
        <CategoryPill category={bet.category} />
        {row.source === "session" ? (
          <span className="text-[10px] uppercase tracking-wide bg-yes/20 text-yes rounded-pill px-1.5 py-px font-semibold">
            new
          </span>
        ) : null}
        <span className="ml-auto text-xs text-text3 font-mono">
          {formatTimeRemaining(bet.expiry_at)}
        </span>
      </div>
      <p className="font-medium leading-snug">{bet.question}</p>

      <div className="mt-3 grid grid-cols-3 gap-2 text-xs">
        <Stat label="Your side">
          <span className={`text-[11px] font-bold uppercase rounded-pill px-2 py-0.5 ${sideClass}`}>
            {side}
          </span>
        </Stat>
        <Stat label="Your odds">
          <span className="font-mono text-text">{userOdds}%</span>
        </Stat>
        <Stat label="Stake">
          <span className="font-mono text-gold">{formatCents(stakeCents)}</span>
        </Stat>
      </div>
    </article>
  );
}

function PostRow({ row }: { row: MyPostView }) {
  const { bet } = row;
  const filled = bet.post_meta?.original_filled_cents ?? 0;
  const remaining = Math.max(0, bet.stake_cents - filled);
  const filledPct = bet.stake_cents > 0 ? Math.round((filled / bet.stake_cents) * 100) : 0;
  // Each contract with negotiation_id null is a fill on the original line.
  const fillCount = (bet.contracts ?? []).filter((c) => c.negotiation_id === null).length;
  return (
    <article className="bg-bg2 rounded-card p-4">
      <div className="flex items-center gap-2 mb-2">
        <CategoryPill category={bet.category} />
        {row.source === "session" ? (
          <span className="text-[10px] uppercase tracking-wide bg-yes/20 text-yes rounded-pill px-1.5 py-px font-semibold">
            new
          </span>
        ) : null}
        <span className="ml-auto text-xs text-text3 font-mono">
          {formatTimeRemaining(bet.expiry_at)}
        </span>
      </div>
      <p className="font-medium leading-snug">{bet.question}</p>

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
      <div className="text-5xl mb-3">⏳</div>
      <h2 className="text-lg font-semibold mb-1">No pending activity</h2>
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
