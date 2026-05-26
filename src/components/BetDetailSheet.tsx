"use client";

import { useState } from "react";
import { Avatar } from "./Avatar";
import { CategoryPill } from "./CategoryPill";
import { ProbabilityBar } from "./ProbabilityBar";
import { Sheet } from "./ui/Sheet";
import { Button } from "./ui/Button";
import { Pill } from "./ui/Pill";
import { DEFAULT_STAKE_TIER, MAX_PROBABILITY, MIN_PROBABILITY, STAKE_TIERS } from "@/lib/config";
import {
  currentLineFor,
  formatCents,
  formatTimeRemaining,
  formatVolume,
  fullName,
} from "@/lib/format";
import type {
  BetView,
  ContractView,
  NegotiationView,
  StakeTierCents,
  UserLite,
} from "@/types/db";

interface Props {
  bet: BetView | null;
  open: boolean;
  onClose: () => void;
  currentUserId: string;
  /** Called when the user accepts an open offer — should create a contract. */
  onAcceptOffer?: (bet: BetView, negotiation: NegotiationView) => void;
  /** Called when the user submits a fresh offer. */
  onMakeOffer?: (
    bet: BetView,
    proposedYesProbability: number,
    stakeTier: StakeTierCents,
  ) => void;
}

function timeAgo(iso: string, ref: number = Date.now()): string {
  const diff = ref - new Date(iso).getTime();
  const m = Math.floor(diff / 60_000);
  if (m < 1) return "just now";
  if (m < 60) return `${m}m ago`;
  const h = Math.floor(m / 60);
  if (h < 24) return `${h}h ago`;
  return `${Math.floor(h / 24)}d ago`;
}

export function BetDetailSheet({
  bet,
  open,
  onClose,
  currentUserId,
  onAcceptOffer,
  onMakeOffer,
}: Props) {
  const [composerOpen, setComposerOpen] = useState(false);
  const [offerYes, setOfferYes] = useState(50);
  const [offerStake, setOfferStake] = useState<StakeTierCents>(DEFAULT_STAKE_TIER);

  if (!bet) return null;

  const contracts = bet.contracts ?? [];
  const offers = (bet.open_negotiations ?? [])
    .slice()
    .sort((a, b) => +new Date(b.created_at) - +new Date(a.created_at));
  const line = currentLineFor(bet, contracts);
  const myContracts = contracts.filter(
    (c) => c.yes_user_id === currentUserId || c.no_user_id === currentUserId,
  );

  return (
    <Sheet open={open} onClose={onClose}>
      <div className="px-5 pt-2 pb-2">
        {/* Header */}
        <div className="flex items-center gap-2 mb-2">
          <Avatar
            first={bet.creator.first_name}
            lastInitial={bet.creator.last_name_initial}
            color={bet.creator.avatar_color}
            imageUrl={bet.creator.avatar_url}
            size={28}
          />
          <span className="text-sm text-text2">{fullName(bet.creator)}</span>
          <CategoryPill category={bet.category} />
          <span className="ml-auto text-[11px] text-text3 font-mono">
            {formatTimeRemaining(bet.expiry_at)}
          </span>
        </div>
        <h2 className="text-xl font-bold leading-snug">{bet.question}</h2>

        {/* Current line */}
        <div className="mt-4">
          <div className="text-[10px] uppercase tracking-wide text-text3 font-medium mb-1.5">
            Current line · weighted avg of all contracts
          </div>
          <ProbabilityBar yesPercent={line.yesPercent} />
        </div>

        {/* Stats grid */}
        <dl className="mt-4 grid grid-cols-3 gap-2 text-sm">
          <DlRow label="Volume" value={<span className="font-mono text-text">{formatVolume(line.volumeCents)}</span>} />
          <DlRow label="Contracts" value={<span className="font-mono">{line.contractCount}</span>} />
          <DlRow
            label="Your side"
            value={
              myContracts.length > 0 ? (
                <span className="font-mono text-yes">{myContracts.length}×</span>
              ) : (
                <span className="text-text3 text-xs">none</span>
              )
            }
          />
        </dl>

        {/* Open offers */}
        <Section
          title="Open offers"
          subtitle={offers.length > 0 ? `${offers.length} waiting for a counter-party` : undefined}
        >
          {offers.length === 0 ? (
            <EmptyHint>No open offers — be the first to propose a line.</EmptyHint>
          ) : (
            <ul className="flex flex-col gap-2">
              {offers.map((n) => (
                <OfferRow
                  key={n.id}
                  offer={n}
                  isMine={n.proposer_id === currentUserId}
                  onAccept={() => onAcceptOffer?.(bet, n)}
                />
              ))}
            </ul>
          )}

          {composerOpen ? (
            <OfferComposer
              yesProbability={offerYes}
              onYesChange={setOfferYes}
              stake={offerStake}
              onStakeChange={setOfferStake}
              onCancel={() => setComposerOpen(false)}
              onSubmit={() => {
                onMakeOffer?.(bet, offerYes, offerStake);
                setComposerOpen(false);
              }}
            />
          ) : (
            <Button variant="secondary" full className="mt-2" onClick={() => setComposerOpen(true)}>
              + Make an offer
            </Button>
          )}
        </Section>

        {/* Contracts */}
        <Section title="Contracts" subtitle={contracts.length > 0 ? `${contracts.length} accepted` : undefined}>
          {contracts.length === 0 ? (
            <EmptyHint>No contracts yet — once an offer is accepted, it'll show here.</EmptyHint>
          ) : (
            <ul className="flex flex-col gap-2">
              {contracts.map((c) => (
                <ContractRow key={c.id} contract={c} currentUserId={currentUserId} />
              ))}
            </ul>
          )}
        </Section>
      </div>
    </Sheet>
  );
}

// ────────────────────────────────────────────────
function OfferRow({
  offer,
  isMine,
  onAccept,
}: {
  offer: NegotiationView;
  isMine: boolean;
  onAccept: () => void;
}) {
  return (
    <li className="bg-bg3 rounded-input p-3">
      <div className="flex items-center gap-2 mb-2">
        <Avatar
          first={offer.proposer.first_name}
          lastInitial={offer.proposer.last_name_initial}
          color={offer.proposer.avatar_color}
          imageUrl={offer.proposer.avatar_url}
          size={24}
        />
        <span className="text-sm flex-1 truncate">{fullName(offer.proposer)}</span>
        <span className="text-[10px] text-text3 font-mono">{timeAgo(offer.created_at)}</span>
      </div>
      <div className="flex items-center gap-3 text-sm">
        <div className="font-mono">
          <span className="text-yes font-bold">YES {offer.proposed_yes_probability}%</span>
          <span className="text-text3 mx-1.5">·</span>
          <span className="text-text2">{formatCents(offer.stake_tier_cents)}</span>
        </div>
        <button
          onClick={onAccept}
          disabled={isMine}
          className={`ml-auto rounded-pill px-3 py-1 text-xs font-semibold transition ${
            isMine
              ? "bg-bg4 text-text3 cursor-not-allowed"
              : "bg-yes text-bg hover:brightness-110"
          }`}
        >
          {isMine ? "Your offer" : `Take NO`}
        </button>
      </div>
    </li>
  );
}

function ContractRow({
  contract,
  currentUserId,
}: {
  contract: ContractView;
  currentUserId: string;
}) {
  const youAreYes = contract.yes_user_id === currentUserId;
  const youAreNo = contract.no_user_id === currentUserId;

  return (
    <li className="bg-bg3 rounded-input p-3">
      <div className="flex items-center gap-3 mb-1">
        <SideBadge side="yes" highlight={youAreYes} user={contract.yes_user} />
        <span className="text-text3 text-xs">vs</span>
        <SideBadge side="no" highlight={youAreNo} user={contract.no_user} />
      </div>
      <div className="flex items-center justify-between text-xs">
        <span className="font-mono text-text2">
          <span className="text-yes">{contract.yes_probability}%</span>
          <span className="text-text3 mx-1">·</span>
          <span className="text-text">{formatCents(contract.stake_cents)}</span>
        </span>
        <span className="text-text3 font-mono">{timeAgo(contract.created_at)}</span>
      </div>
    </li>
  );
}

function SideBadge({
  side,
  highlight,
  user,
}: {
  side: "yes" | "no";
  highlight: boolean;
  user: UserLite;
}) {
  return (
    <div className="flex items-center gap-1.5">
      <Avatar first={user.first_name} lastInitial={user.last_name_initial} color={user.avatar_color} imageUrl={user.avatar_url} size={22} />
      <span className={`text-sm ${highlight ? "font-semibold" : ""}`}>
        {highlight ? "You" : fullName(user)}
      </span>
      <span
        className={`text-[10px] font-bold uppercase rounded-pill px-1.5 py-px ${
          side === "yes" ? "bg-yes/20 text-yes" : "bg-no/20 text-no"
        }`}
      >
        {side}
      </span>
    </div>
  );
}

function OfferComposer({
  yesProbability,
  onYesChange,
  stake,
  onStakeChange,
  onSubmit,
  onCancel,
}: {
  yesProbability: number;
  onYesChange: (n: number) => void;
  stake: StakeTierCents;
  onStakeChange: (s: StakeTierCents) => void;
  onSubmit: () => void;
  onCancel: () => void;
}) {
  return (
    <div className="mt-2 bg-bg3 rounded-input p-3">
      <div className="flex items-baseline justify-between mb-2">
        <div className="text-xs uppercase tracking-wide text-text3 font-medium">Make an offer</div>
        <button onClick={onCancel} className="text-text3 text-xs hover:text-text">cancel</button>
      </div>

      <div className="mb-3">
        <div className="text-xs font-mono text-text2 mb-1.5">
          <span className="text-yes">YES {yesProbability}%</span>
          <span className="text-text3 mx-1.5">·</span>
          <span className="text-no">NO {100 - yesProbability}%</span>
        </div>
        <input
          type="range"
          min={MIN_PROBABILITY}
          max={MAX_PROBABILITY}
          value={yesProbability}
          onChange={(e) => onYesChange(parseInt(e.target.value, 10))}
          className="fayd-slider"
        />
      </div>

      <div className="mb-3">
        <div className="text-[10px] uppercase tracking-wide text-text3 font-medium mb-1.5">Stake tier</div>
        <div className="flex gap-1.5 flex-wrap">
          {STAKE_TIERS.map((tier) => (
            <Pill key={tier} active={tier === stake} onClick={() => onStakeChange(tier)}>
              {formatCents(tier)}
            </Pill>
          ))}
        </div>
      </div>

      <Button full onClick={onSubmit}>
        Post offer · YES {yesProbability}% for {formatCents(stake)}
      </Button>
    </div>
  );
}

function Section({
  title,
  subtitle,
  children,
}: {
  title: string;
  subtitle?: string;
  children: React.ReactNode;
}) {
  return (
    <section className="mt-5">
      <div className="flex items-baseline justify-between mb-2">
        <h3 className="text-xs uppercase tracking-wide text-text3 font-medium">{title}</h3>
        {subtitle ? <span className="text-[11px] text-text3">{subtitle}</span> : null}
      </div>
      {children}
    </section>
  );
}

function EmptyHint({ children }: { children: React.ReactNode }) {
  return <div className="text-text3 text-xs italic">{children}</div>;
}

function DlRow({ label, value }: { label: string; value: React.ReactNode }) {
  return (
    <div className="bg-bg3 rounded-input px-3 py-2">
      <dt className="text-[10px] uppercase tracking-wide text-text3">{label}</dt>
      <dd className="mt-0.5">{value}</dd>
    </div>
  );
}
