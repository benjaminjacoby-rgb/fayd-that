"use client";

import { useMemo, useState } from "react";
import { Avatar } from "@/components/Avatar";
import { Button } from "@/components/ui/Button";
import { CategoryPill } from "@/components/CategoryPill";
import { formatCents, formatTimeRemaining, fullName } from "@/lib/format";
import type { BetSide, BetView } from "@/types/db";

type Status = "awaiting_payment" | "locked" | "awaiting_outcome" | "disputed";

function statusFor(bet: BetView, userId: string, now: number): Status {
  if (bet.status === "disputed") return "disputed";
  const me = bet.participants.find((p) => p.user_id === userId);
  if (me && !me.paid_at) return "awaiting_payment";
  const expired = new Date(bet.expiry_at).getTime() < now;
  return expired ? "awaiting_outcome" : "locked";
}

const STATUS_META: Record<Status, { label: string; cls: string }> = {
  awaiting_payment: { label: "Awaiting payment", cls: "bg-orange/20 text-orange" },
  locked:           { label: "Locked",            cls: "bg-yes/20 text-yes" },
  awaiting_outcome: { label: "Confirm outcome",   cls: "bg-gold/20 text-gold" },
  disputed:         { label: "Disputed",          cls: "bg-no/20 text-no" },
};

export function PendingClient({
  bets,
  currentUserId,
}: {
  bets: BetView[];
  currentUserId: string;
}) {
  const now = Date.now();
  const rows = useMemo(() => bets.map((b) => ({ bet: b, status: statusFor(b, currentUserId, now) })), [bets, currentUserId, now]);
  const [busyId, setBusyId] = useState<string | null>(null);

  async function pay(_betId: string) {
    setBusyId(_betId);
    // TODO: server action — call holdStakeForBet(); refresh page.
    setTimeout(() => setBusyId(null), 600);
  }

  async function confirmOutcome(_betId: string, _side: BetSide) {
    setBusyId(_betId);
    // TODO: server action — call submitOutcome(); refresh page.
    setTimeout(() => setBusyId(null), 600);
  }

  if (rows.length === 0) {
    return (
      <div className="px-6 pt-16 text-center">
        <div className="text-5xl mb-3">⏳</div>
        <h2 className="text-lg font-semibold mb-1">No pending bets</h2>
        <p className="text-text2 text-sm">Bets you're in will show up here until they resolve.</p>
      </div>
    );
  }

  return (
    <ul className="flex flex-col gap-3 px-4 pt-4">
      {rows.map(({ bet, status }) => {
        const meta = STATUS_META[status];
        const myPart = bet.participants.find((p) => p.user_id === currentUserId);
        const otherParts = bet.participants.filter((p) => p.user_id !== currentUserId);
        return (
          <li key={bet.id} className="bg-bg2 rounded-card p-4">
            <div className="flex items-center gap-2 mb-2">
              <span className={`text-[11px] font-semibold uppercase rounded-pill px-2 py-0.5 ${meta.cls}`}>
                {meta.label}
              </span>
              <CategoryPill category={bet.category} />
              <span className="ml-auto text-xs text-text3 font-mono">{formatTimeRemaining(bet.expiry_at)}</span>
            </div>
            <p className="font-medium leading-snug">{bet.question}</p>

            <div className="mt-3 flex items-center gap-2 flex-wrap text-xs text-text2">
              <span>vs</span>
              {otherParts.length === 0 ? (
                <span className="text-text3">no one yet</span>
              ) : (
                otherParts.map((p) => (
                  <span key={p.id} className="inline-flex items-center gap-1 bg-bg3 rounded-pill px-2 py-0.5">
                    <Avatar first={p.user.first_name} lastInitial={p.user.last_name_initial} color={p.user.avatar_color} size={18} />
                    {fullName(p.user)}
                  </span>
                ))
              )}
            </div>

            <div className="mt-3 flex items-center gap-3 text-xs">
              <span className="text-text3">Your side</span>
              <span className={`font-semibold uppercase rounded-pill px-2 py-0.5 ${myPart?.side === "yes" ? "bg-yes/20 text-yes" : "bg-no/20 text-no"}`}>
                {myPart?.side ?? "—"}
              </span>
              <span className="ml-auto font-mono text-gold">{formatCents(myPart?.stake_cents ?? 0)} staked</span>
            </div>

            {status === "awaiting_payment" ? (
              <Button full className="mt-4" disabled={busyId === bet.id} onClick={() => pay(bet.id)}>
                Pay {formatCents(myPart?.stake_cents ?? 0)} to lock
              </Button>
            ) : null}

            {status === "awaiting_outcome" ? (
              <div className="grid grid-cols-2 gap-2 mt-4">
                <Button variant="yes" disabled={busyId === bet.id} onClick={() => confirmOutcome(bet.id, "yes")}>
                  YES happened
                </Button>
                <Button variant="no" disabled={busyId === bet.id} onClick={() => confirmOutcome(bet.id, "no")}>
                  NO happened
                </Button>
              </div>
            ) : null}

            {status === "disputed" ? (
              <p className="mt-3 text-xs text-text2">
                Your mediator has been notified and will rule on the outcome.
              </p>
            ) : null}
          </li>
        );
      })}
    </ul>
  );
}
