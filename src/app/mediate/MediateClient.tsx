"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Avatar } from "@/components/Avatar";
import { ResolutionSection } from "@/components/ResolutionSection";
import { formatCents, fullName } from "@/lib/format";
import type { BetSide, BetView, UserLite } from "@/types/db";

function partiesFor(bet: BetView): Array<{ user: UserLite; side: BetSide }> {
  const byId = new Map<string, { user: UserLite; side: BetSide }>();
  if (bet.creator_id && bet.post_meta) {
    byId.set(bet.creator_id, { user: bet.creator, side: bet.post_meta.poster_side });
  }
  for (const c of bet.contracts ?? []) {
    if (c.yes_user_id && !byId.has(c.yes_user_id)) {
      byId.set(c.yes_user_id, { user: c.yes_user, side: "yes" });
    }
    if (c.no_user_id && !byId.has(c.no_user_id)) {
      byId.set(c.no_user_id, { user: c.no_user, side: "no" });
    }
  }
  return Array.from(byId.values());
}

export function MediateClient({
  bets: initialBets,
  currentUserId,
}: {
  bets: BetView[];
  currentUserId: string;
}) {
  const router = useRouter();
  const [bets, setBets] = useState<BetView[]>(initialBets);

  function handleSettled(betId: string) {
    // Drop it from the queue immediately; a background refresh re-syncs
    // the server-fetched list (e.g. any other bet that just became due).
    setBets((prev) => prev.filter((b) => b.id !== betId));
    router.refresh();
  }

  return (
    <>
      <div className="px-4 pt-3">
        <div className="bg-gradient-to-br from-gold/15 to-bg2 border border-gold/20 rounded-card p-4 flex items-center gap-4">
          <div className="text-3xl">⚖️</div>
          <div>
            <div className="text-[10px] uppercase tracking-wide text-text3">Mediator queue</div>
            <div className="font-mono text-2xl font-semibold text-gold">{bets.length}</div>
          </div>
        </div>
      </div>

      {bets.length === 0 ? (
        <div className="px-6 pt-16 text-center">
          <div className="text-5xl mb-3">🕊️</div>
          <h2 className="text-lg font-semibold mb-1">Nothing to rule on</h2>
          <p className="text-text2 text-sm">When a bet you mediate closes, it'll appear here.</p>
        </div>
      ) : (
        <ul className="flex flex-col gap-3 px-4 pt-4">
          {bets.map((bet) => (
            <li key={bet.id} className="bg-bg2 rounded-card p-4 border border-gold/20">
              <div className="flex items-start justify-between gap-3">
                <p className="font-medium leading-snug flex-1">{bet.question}</p>
                <span className="text-[11px] uppercase font-semibold bg-gold/20 text-gold rounded-pill px-2 py-0.5 whitespace-nowrap">
                  {formatCents(bet.stake_cents)} staked
                </span>
              </div>
              <span
                className={`inline-block mt-1.5 text-[10px] font-bold uppercase tracking-wide rounded-pill px-2 py-0.5 ${
                  bet.status === "closed"
                    ? "bg-no/15 text-no"
                    : "bg-bg3 text-text3"
                }`}
              >
                {bet.status === "closed" ? "Ready to rule" : "Still open — waiting to close"}
              </span>

              <ul className="mt-3 flex flex-col gap-2">
                {partiesFor(bet).map(({ user, side }) => (
                  <li key={user.id} className="bg-bg3 rounded-input p-3 flex items-center gap-2">
                    <Avatar
                      first={user.first_name}
                      lastInitial={user.last_name_initial}
                      color={user.avatar_color}
                      imageUrl={user.avatar_url}
                      size={24}
                    />
                    <span className="text-sm flex-1">
                      {user.id === currentUserId ? "You" : fullName(user)}
                    </span>
                    <span
                      className={`text-[11px] font-semibold uppercase rounded-pill px-2 py-0.5 ${
                        side === "yes" ? "bg-yes/20 text-yes" : "bg-no/20 text-no"
                      }`}
                    >
                      {side}
                    </span>
                  </li>
                ))}
              </ul>

              <ResolutionSection
                bet={bet}
                currentUserId={currentUserId}
                onSettled={() => handleSettled(bet.id)}
              />
            </li>
          ))}
        </ul>
      )}
    </>
  );
}
