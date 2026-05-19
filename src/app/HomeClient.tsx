"use client";

import { useMemo, useState } from "react";
import Link from "next/link";
import { BetCard } from "@/components/BetCard";
import { BetDetailSheet } from "@/components/BetDetailSheet";
import { Toast } from "@/components/Toast";
import { currentLineFor, formatCents } from "@/lib/format";
import type {
  BetSide,
  BetView,
  ContractView,
  NegotiationView,
  StakeTierCents,
  UserLite,
} from "@/types/db";

export function HomeClient({
  bets: initialBets,
  currentUser,
}: {
  bets: BetView[];
  currentUser: UserLite;
}) {
  // Owns the bets state so accept-offer / make-offer feel live (mock-only).
  const [bets, setBets] = useState<BetView[]>(initialBets);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [toast, setToast] = useState<string | null>(null);

  const selected = useMemo(
    () => (selectedId ? bets.find((b) => b.id === selectedId) ?? null : null),
    [bets, selectedId],
  );

  function updateBet(betId: string, fn: (b: BetView) => BetView) {
    setBets((prev) => prev.map((b) => (b.id === betId ? fn(b) : b)));
  }

  function onCardBet(bet: BetView, side: BetSide, stake: StakeTierCents) {
    // Tap-to-bet from the card takes the OPPOSITE side at the current weighted line.
    // (Tapping "YES" means: I think YES, so I want a contract where I'm YES.)
    const line = currentLineFor(bet, bet.contracts ?? []);
    const counterParty = bet.creator; // mock-only: the bet creator counters you.
    const newContract: ContractView = {
      id: `c-new-${Date.now()}`,
      bet_id: bet.id,
      yes_user_id: side === "yes" ? currentUser.id : counterParty.id,
      no_user_id:  side === "yes" ? counterParty.id  : currentUser.id,
      yes_probability: line.yesPercent,
      stake_cents: stake,
      negotiation_id: null,
      status: "active",
      yes_outcome: null,
      created_at: new Date().toISOString(),
      resolved_at: null,
      yes_user: side === "yes" ? currentUser : counterParty,
      no_user:  side === "yes" ? counterParty : currentUser,
    };
    updateBet(bet.id, (b) => ({ ...b, contracts: [newContract, ...(b.contracts ?? [])] }));
    setToast(
      `You took ${side.toUpperCase()} at ${line.yesPercent}% for ${formatCents(stake)}`,
    );
  }

  function onAcceptOffer(bet: BetView, offer: NegotiationView) {
    // Accept = create a contract opposite the proposer.
    const newContract: ContractView = {
      id: `c-from-${offer.id}`,
      bet_id: bet.id,
      yes_user_id: offer.proposer_id,
      no_user_id: currentUser.id,
      yes_probability: offer.proposed_yes_probability,
      stake_cents: offer.stake_tier_cents,
      negotiation_id: offer.id,
      status: "active",
      yes_outcome: null,
      created_at: new Date().toISOString(),
      resolved_at: null,
      yes_user: offer.proposer,
      no_user: currentUser,
    };
    updateBet(bet.id, (b) => ({
      ...b,
      contracts: [newContract, ...(b.contracts ?? [])],
      open_negotiations: (b.open_negotiations ?? []).filter((n) => n.id !== offer.id),
    }));
    setToast(`Contract opened with ${offer.proposer.first_name} at ${offer.proposed_yes_probability}%`);
  }

  function onMakeOffer(bet: BetView, yesProb: number, tier: StakeTierCents) {
    const newOffer: NegotiationView = {
      id: `n-new-${Date.now()}`,
      bet_id: bet.id,
      proposer_id: currentUser.id,
      proposed_yes_probability: yesProb,
      stake_tier_cents: tier,
      status: "open",
      parent_negotiation_id: null,
      created_at: new Date().toISOString(),
      proposer: currentUser,
    };
    updateBet(bet.id, (b) => ({
      ...b,
      open_negotiations: [newOffer, ...(b.open_negotiations ?? [])],
    }));
    setToast(`Offer posted · YES ${yesProb}% for ${formatCents(tier)}`);
  }

  if (bets.length === 0) return <EmptyState />;

  return (
    <>
      <ul className="flex flex-col gap-3 px-4 mt-4">
        {bets.map((b) => (
          <li key={b.id}>
            <BetCard bet={b} onOpen={() => setSelectedId(b.id)} onBet={onCardBet} />
          </li>
        ))}
      </ul>

      <BetDetailSheet
        bet={selected}
        open={!!selected}
        onClose={() => setSelectedId(null)}
        currentUserId={currentUser.id}
        onAcceptOffer={onAcceptOffer}
        onMakeOffer={onMakeOffer}
      />

      {toast ? <Toast message={toast} onDone={() => setToast(null)} /> : null}
    </>
  );
}

function EmptyState() {
  return (
    <div className="px-6 pt-16 text-center">
      <div className="text-5xl mb-3">🤝</div>
      <h2 className="text-lg font-semibold mb-1">No bets yet</h2>
      <p className="text-text2 text-sm mb-6">
        Friends' bets will show up here once you add some.
      </p>
      <Link href="/create" className="inline-block bg-yes text-bg font-semibold px-5 py-3 rounded-input">
        Create your first bet
      </Link>
    </div>
  );
}
