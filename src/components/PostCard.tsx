"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Avatar } from "./Avatar";
import { formatCents, formatTimeRemaining, fullName } from "@/lib/format";
import type { BetSide, BetView, MediatorState, Reaction, UserLite } from "@/types/db";

interface Props {
  bet: BetView;
  currentUserId: string;
  currentUser: UserLite;
  onFaydThat: (bet: BetView) => void;
  onCounter: (bet: BetView) => void;
  onComment: (bet: BetView) => void;
  onStartNewContract: (bet: BetView) => void;
  onReact: (bet: BetView, emoji: string) => void;
  onVote: (bet: BetView, side: BetSide) => void;
  onAcceptMediator: (bet: BetView) => void;
  onMarkConcluded: (bet: BetView) => void;
  onCancelBet?: (bet: BetView) => void;
  onOpenSubContract?: (bet: BetView, subContractId: string) => void;
}

const REACTION_PICKER = ["🔥", "😂", "💀", "🙏", "👀", "🤝"];

interface ContractEntry {
  id: string;
  subContractId: string | null;
  poster: UserLite;
  poster_side: BetSide;
  yes_probability: number;
  stake_cents: number;
  filled_cents: number;
  created_at: string;
}

function buildContractList(bet: BetView): ContractEntry[] {
  const meta = bet.post_meta!;
  return [
    {
      id: "original",
      subContractId: null,
      poster: bet.creator,
      poster_side: meta.poster_side,
      yes_probability: bet.yes_probability,
      stake_cents: bet.stake_cents,
      filled_cents: meta.original_filled_cents,
      created_at: bet.created_at,
    },
    ...meta.sub_contracts.map((sc) => ({
      id: sc.id,
      subContractId: sc.id,
      poster: sc.poster,
      poster_side: sc.poster_side,
      yes_probability: sc.yes_probability,
      stake_cents: sc.stake_cents,
      filled_cents: sc.filled_cents,
      created_at: sc.created_at,
    })),
  ];
}

function pickMain(list: ContractEntry[]): ContractEntry {
  const sorted = [...list].sort(
    (a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime(),
  );
  return sorted.find((c) => c.filled_cents < c.stake_cents) ?? sorted[0];
}

/** Exactly-2-decimal dollar format ($1.00, $8.57). */
function formatDollars2dp(cents: number): string {
  return `$${(cents / 100).toFixed(2)}`;
}

/** Strip the leading "from " from a group relationship label. */
function groupNameFromMeta(label: string): string {
  return label.replace(/^from\s+/i, "").trim();
}

export function PostCard({
  bet,
  currentUserId,
  currentUser,
  onFaydThat,
  onCounter,
  onComment,
  onStartNewContract,
  onReact,
  onVote,
  onAcceptMediator,
  onMarkConcluded,
  onCancelBet,
  onOpenSubContract,
}: Props) {
  const router = useRouter();
  const [menuOpen, setMenuOpen] = useState(false);
  const [pickerOpen, setPickerOpen] = useState(false);
  const [showAcceptMediator, setShowAcceptMediator] = useState(false);
  const [showConcludeConfirm, setShowConcludeConfirm] = useState(false);
  const [showCancelConfirm, setShowCancelConfirm] = useState(false);
  void currentUser;

  const meta = bet.post_meta;
  if (!meta) return null;

  const mediatorState = meta.mediator;
  const isMediator = mediatorState?.mediator?.id === currentUserId;
  const concluded = !!meta.concluded;

  const contracts = buildContractList(bet);
  const main = pickMain(contracts);
  const rest = contracts.filter((c) => c.id !== main.id);

  const mainRemainingCents = Math.max(0, main.stake_cents - main.filled_cents);
  const expired = bet.status !== "open";
  const isMyMain = main.poster.id === currentUserId;
  const isMyBet = bet.creator_id === currentUserId;

  const originalRemainingCents = Math.max(
    0,
    bet.stake_cents - meta.original_filled_cents,
  );
  const canCancel = isMyBet && !concluded && originalRemainingCents > 0 && bet.status === "open";

  // Posted-side / taker-side derivation for the body block.
  const posterSide: BetSide = main.poster_side;
  const takerSide: BetSide = posterSide === "yes" ? "no" : "yes";
  const posterOdds = posterSide === "yes" ? main.yes_probability : 100 - main.yes_probability;
  const takerOdds = 100 - posterOdds;

  // Max counter stake — what the opposing side can put up to match the poster.
  // maxBet = (posterStake × counterOdds) / posterOdds
  const maxBetCents = posterOdds > 0
    ? Math.round((main.stake_cents * takerOdds) / posterOdds)
    : 0;
  const minBetCents = 100; // $1.00 floor

  // Filled = no more room on the main contract.
  const fullyFilled = mainRemainingCents === 0;

  // Group pill — derived from the bet's group scope. Uses the joined
  // relationship label so no extra Supabase call is needed.
  const groupName =
    bet.scope === "group" && bet.group_id && meta.relationship.kind === "group"
      ? groupNameFromMeta(meta.relationship.label)
      : null;

  const subtitleParts: string[] = [];
  if (bet.creator.username) subtitleParts.push(`@${bet.creator.username}`);
  subtitleParts.push(formatTimeRemaining(bet.expiry_at));
  const subtitle = subtitleParts.join(" · ");

  const handleMainFayd = () => {
    if (main.subContractId) {
      onOpenSubContract?.(bet, main.subContractId);
    } else {
      onFaydThat(bet);
    }
  };

  const handleDuplicate = () => {
    const params = new URLSearchParams({
      q: bet.question,
      category: bet.category,
      yes_probability: String(bet.yes_probability),
      stake_cents: String(bet.stake_cents),
    });
    router.push(`/create?${params.toString()}`);
  };

  return (
    <article className="bg-[#141414] rounded-card overflow-hidden border border-[#222]">
      {/* ── Top row: avatar + question + stake summary ─────────────────── */}
      <div className="relative px-4 pt-4 pb-3 flex items-start gap-3">
        <Avatar
          first={bet.creator.first_name}
          lastInitial={bet.creator.last_name_initial}
          color={bet.creator.avatar_color}
          size={40}
        />
        <div className="flex-1 min-w-0">
          <h2 className="text-sm font-semibold leading-tight truncate">
            {bet.question}
          </h2>
          <div className="text-text3 text-[11px] mt-1 truncate">
            {isMyBet ? "You" : fullName(bet.creator)} · {subtitle}
          </div>
        </div>
        <div className="text-right shrink-0">
          <div className="font-mono font-bold text-base tabular-nums">
            {formatCents(bet.stake_cents)}
          </div>
          <div className="text-text3 text-[10px] uppercase tracking-wide mt-0.5">
            Max staked
          </div>
        </div>
        <div className="relative shrink-0 -mr-1">
          <button
            onClick={() => setMenuOpen((v) => !v)}
            aria-label="post options"
            className="w-7 h-7 rounded-pill bg-bg3 hover:bg-bg4 inline-flex items-center justify-center text-text2 transition active:scale-[0.95]"
          >
            <DotsIcon />
          </button>
          {menuOpen ? (
            <>
              <div className="fixed inset-0 z-10" onClick={() => setMenuOpen(false)} />
              <ul className="absolute right-0 mt-1 z-20 bg-bg3 rounded-input shadow-lg overflow-hidden w-52">
                <li>
                  <button
                    onClick={() => { setMenuOpen(false); onStartNewContract(bet); }}
                    className="w-full text-left px-3 py-2.5 text-sm hover:bg-bg4 text-text"
                  >
                    Start new contract
                  </button>
                </li>
                {(bet.creator_id === currentUserId || isMediator) && !concluded ? (
                  <li>
                    <button
                      onClick={() => { setMenuOpen(false); setShowConcludeConfirm(true); }}
                      className="w-full text-left px-3 py-2.5 text-sm hover:bg-bg4 text-text"
                    >
                      Mark as concluded
                    </button>
                  </li>
                ) : null}
                {canCancel ? (
                  <li>
                    <button
                      onClick={() => { setMenuOpen(false); setShowCancelConfirm(true); }}
                      className="w-full text-left px-3 py-2.5 text-sm hover:bg-bg4 text-no"
                    >
                      Cancel bet
                    </button>
                  </li>
                ) : null}
              </ul>
            </>
          ) : null}
        </div>
      </div>

      {/* ── Mediator chip + concluded badge row ────────────────────────── */}
      {(mediatorState || concluded) ? (
        <div className="px-4 pb-2 flex items-center gap-2 flex-wrap">
          {concluded ? (
            <span className="text-[10px] font-bold uppercase tracking-wide bg-bg3 text-text2 rounded-pill px-2 py-0.5">
              Concluded
            </span>
          ) : null}
          {mediatorState ? (
            <MediatorChip
              state={mediatorState}
              canAccept={mediatorState.mode === "requested" && bet.creator_id !== currentUserId}
              onAccept={() => setShowAcceptMediator(true)}
            />
          ) : null}
        </div>
      ) : null}

      {/* ── Group tag (amber) ──────────────────────────────────────────── */}
      {groupName ? (
        <div className="px-4 pb-3">
          <span className="inline-block bg-[#1c0f00] text-[#a16207] text-[11px] font-semibold rounded-pill px-2.5 py-1">
            {groupName}
          </span>
        </div>
      ) : null}

      {/* ── Body block (only while there's still actionable side) ──────── */}
      {!fullyFilled && !expired && !concluded ? (
        <div className="px-4 pb-3 flex flex-col gap-3">
          {/* Posted/your-side summary line */}
          <div className="text-xs text-text2 leading-relaxed">
            <span className="text-text font-medium">
              {isMyMain ? "You" : main.poster.first_name ?? "Poster"}
            </span>{" "}
            posted{" "}
            <span className={posterSide === "yes" ? "text-yes font-semibold" : "text-no font-semibold"}>
              {posterSide.toUpperCase()}
            </span>{" "}
            · <span className="font-mono tabular-nums">{posterOdds}%</span>
            <span className="text-text3"> · </span>
            your side is{" "}
            <span className={takerSide === "yes" ? "text-yes font-semibold" : "text-no font-semibold"}>
              {takerSide.toUpperCase()}
            </span>{" "}
            at <span className="font-mono tabular-nums">{takerOdds}%</span>
          </div>

          {/* YOUR SIDE block — deep red bg, red border */}
          <div className="bg-[#1a0d0d] border border-no/30 rounded-input px-3 py-2.5 flex items-center justify-between">
            <div>
              <div className="text-[10px] uppercase tracking-wide text-text3 font-semibold">
                Your side
              </div>
              <div className={`text-base font-bold mt-0.5 ${takerSide === "yes" ? "text-yes" : "text-no"}`}>
                {takerSide.toUpperCase()}
              </div>
            </div>
            <div className={`text-2xl font-bold font-mono tabular-nums ${takerSide === "yes" ? "text-yes" : "text-no"}`}>
              {takerOdds}%
            </div>
          </div>

          {/* Min bet / Max bet pair */}
          <div className="grid grid-cols-2 gap-2">
            <StatBox label="Min bet" value={formatDollars2dp(minBetCents)} />
            <StatBox label="Max bet" value={formatDollars2dp(maxBetCents)} />
          </div>
        </div>
      ) : null}

      {/* ── Actions ────────────────────────────────────────────────────── */}
      <div className="px-4 pb-3 flex flex-col gap-2">
        {fullyFilled || expired ? (
          <button
            onClick={handleDuplicate}
            className="w-full rounded-input border border-yes/40 text-yes font-semibold text-sm py-2.5 hover:bg-yes/10 hover:border-yes/60 active:scale-[0.97] transition-all duration-150 ease-out"
          >
            Duplicate
          </button>
        ) : (
          <>
            <button
              onClick={handleMainFayd}
              disabled={isMyMain}
              className="fayd-pulse-once w-full rounded-input bg-no text-white font-semibold text-sm py-3 transition-all duration-150 ease-out hover:bg-[#ff8585] hover:scale-[1.02] active:scale-[0.97] active:bg-[#e05555] disabled:opacity-40 disabled:cursor-not-allowed disabled:hover:scale-100"
            >
              Fayd That · {takerOdds}% {takerSide.toUpperCase()}
            </button>
            <button
              onClick={() => onCounter(bet)}
              disabled={isMyMain}
              className="w-full rounded-input bg-bg2 border border-bg3 text-text2 font-semibold text-sm py-2.5 transition-all duration-150 ease-out hover:border-[#1a5c30] hover:text-yes active:scale-[0.97] disabled:opacity-40 disabled:cursor-not-allowed"
            >
              Counter with different odds
            </button>
          </>
        )}
      </div>

      {/* ── Reactions ──────────────────────────────────────────────────── */}
      <div className="px-4 pb-3 flex items-center gap-1.5 flex-wrap">
        {meta.reactions.map((r) => (
          <ReactionChip key={r.emoji} reaction={r} onClick={() => onReact(bet, r.emoji)} />
        ))}
        <div className="relative">
          <button
            onClick={() => setPickerOpen((v) => !v)}
            className="inline-flex items-center justify-center w-7 h-7 rounded-pill bg-bg3 hover:bg-bg4 text-text3 text-xs transition active:scale-[0.95]"
            aria-label="add reaction"
          >
            +
          </button>
          {pickerOpen ? (
            <>
              <div className="fixed inset-0 z-10" onClick={() => setPickerOpen(false)} />
              <div className="absolute left-0 mt-1 z-20 bg-bg3 rounded-pill shadow-lg px-2 py-1 flex items-center gap-1">
                {REACTION_PICKER.map((e) => (
                  <button
                    key={e}
                    onClick={() => { setPickerOpen(false); onReact(bet, e); }}
                    className="text-lg hover:scale-125 transition"
                  >
                    {e}
                  </button>
                ))}
              </div>
            </>
          ) : null}
        </div>
      </div>

      {/* ── Sub-contracts ──────────────────────────────────────────────── */}
      {rest.length > 0 ? (
        <div className="px-4 pb-3">
          <div className="text-[10px] uppercase tracking-wide text-text3 font-medium mb-2">
            Other contracts on this bet
          </div>
          <ul className="flex flex-col gap-2">
            {rest.map((c) => {
              const remaining = c.stake_cents - c.filled_cents;
              const subCounterSide: BetSide = c.poster_side === "yes" ? "no" : "yes";
              const subCounterOdds = 100 - c.yes_probability;
              const isFilled = remaining <= 0;
              const handleSubClick = () => {
                if (c.subContractId) {
                  onOpenSubContract?.(bet, c.subContractId);
                } else {
                  onFaydThat(bet);
                }
              };
              return (
                <li key={c.id}>
                  <button
                    onClick={handleSubClick}
                    disabled={isFilled}
                    className="w-full text-left bg-bg3 hover:bg-bg4 rounded-input p-3 flex items-center gap-3 transition disabled:cursor-not-allowed disabled:opacity-70"
                  >
                    <Avatar
                      first={c.poster.first_name}
                      lastInitial={c.poster.last_name_initial}
                      color={c.poster.avatar_color}
                      size={32}
                    />
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-1.5 text-sm">
                        <span className="font-semibold truncate">{fullName(c.poster)}</span>
                        <span
                          className={`text-[10px] font-bold uppercase rounded-pill px-1.5 py-px ${
                            c.poster_side === "yes" ? "bg-yes/20 text-yes" : "bg-no/20 text-no"
                          }`}
                        >
                          {c.poster_side}
                        </span>
                      </div>
                      <div className="text-text3 text-[11px] mt-0.5 font-mono">
                        {formatCents(c.stake_cents)}
                      </div>
                    </div>
                    {isFilled ? (
                      <span className="text-text3 text-xs italic whitespace-nowrap">fully filled</span>
                    ) : (
                      <span
                        className={`rounded-pill px-3 py-1.5 text-xs font-semibold whitespace-nowrap border ${
                          subCounterSide === "yes"
                            ? "bg-yes/15 text-yes border-yes/40 hover:bg-yes/25"
                            : "bg-no/15 text-no border-no/40 hover:bg-no/25"
                        }`}
                      >
                        Take {subCounterSide.toUpperCase()} @ {subCounterOdds}%
                      </span>
                    )}
                  </button>
                </li>
              );
            })}
          </ul>
        </div>
      ) : null}

      {/* ── Confirmation modals ─────────────────────────────────────────── */}
      {showAcceptMediator ? (
        <ConfirmModal
          title="Accept mediator role for this bet?"
          confirmLabel="Confirm"
          onCancel={() => setShowAcceptMediator(false)}
          onConfirm={() => {
            setShowAcceptMediator(false);
            onAcceptMediator(bet);
          }}
        />
      ) : null}
      {showConcludeConfirm ? (
        <ConfirmModal
          title="Mark this bet as concluded?"
          confirmLabel="Confirm"
          onCancel={() => setShowConcludeConfirm(false)}
          onConfirm={() => {
            setShowConcludeConfirm(false);
            onMarkConcluded(bet);
          }}
        />
      ) : null}
      {showCancelConfirm ? (
        <ConfirmModal
          title={`Cancel the unfilled ${formatCents(originalRemainingCents)} on this bet?`}
          confirmLabel="Cancel bet"
          onCancel={() => setShowCancelConfirm(false)}
          onConfirm={() => {
            setShowCancelConfirm(false);
            onCancelBet?.(bet);
          }}
        />
      ) : null}

      {/* ── Chat / comments footer ─────────────────────────────────────── */}
      <div className="px-4 py-4 border-t border-[#222] flex items-start gap-3">
        <button
          onClick={() => onComment(bet)}
          aria-label="Open chat"
          className="shrink-0 w-9 h-9 rounded-pill bg-bg3 inline-flex items-center justify-center text-[#555] hover:text-[#aaa] active:scale-[0.95] transition-all duration-150 ease-out"
        >
          <ChatIcon />
        </button>
        <div className="flex-1 min-w-0">
          {meta.comments.length === 0 ? (
            <button onClick={() => onComment(bet)} className="text-[#777] text-xs hover:text-text2 text-left">
              Be the first to comment
            </button>
          ) : (
            <ul className="flex flex-col gap-1.5">
              {meta.comments.slice(0, 2).map((c) => (
                <li key={c.id} className="text-sm flex gap-1.5">
                  <span className="font-semibold text-text2 shrink-0">{fullName(c.user)}</span>
                  <span className="text-[#bbb] break-words">{c.text}</span>
                </li>
              ))}
              {meta.comments.length > 2 ? (
                <button onClick={() => onComment(bet)} className="text-[#777] text-xs hover:text-text2 text-left">
                  View all {meta.comments.length} comments
                </button>
              ) : null}
            </ul>
          )}
        </div>
      </div>
    </article>
  );
}

function StatBox({ label, value }: { label: string; value: string }) {
  return (
    <div className="bg-[#0d0d0d] border border-[#222] rounded-input px-3 py-2">
      <div className="text-[10px] uppercase tracking-wide text-text3 font-semibold">
        {label}
      </div>
      <div className="font-mono font-bold tabular-nums text-no text-lg mt-0.5">
        {value}
      </div>
    </div>
  );
}

function ReactionChip({ reaction, onClick }: { reaction: Reaction; onClick: () => void }) {
  return (
    <button
      onClick={onClick}
      className={`inline-flex items-center gap-1 rounded-pill px-2 py-1 text-xs transition ${
        reaction.reactedByMe ? "bg-yes/15 text-yes border border-yes/30" : "bg-bg3 hover:bg-bg4 text-text2"
      }`}
    >
      <span className="text-sm leading-none">{reaction.emoji}</span>
      <span className="font-mono text-[11px]">{reaction.count}</span>
    </button>
  );
}

function DotsIcon() {
  return (
    <svg viewBox="0 0 24 24" fill="currentColor" className="w-4 h-4">
      <circle cx="5" cy="12" r="1.7" />
      <circle cx="12" cy="12" r="1.7" />
      <circle cx="19" cy="12" r="1.7" />
    </svg>
  );
}

function ChatIcon() {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="w-4 h-4" aria-hidden>
      <path d="M21 11.5a8.38 8.38 0 01-.9 3.8 8.5 8.5 0 01-7.6 4.7 8.38 8.38 0 01-3.8-.9L3 21l1.9-5.7a8.38 8.38 0 01-.9-3.8 8.5 8.5 0 014.7-7.6 8.38 8.38 0 013.8-.9h.5a8.48 8.48 0 018 8v.5z" />
    </svg>
  );
}

function ScalesIcon({ className = "w-3 h-3 text-gold shrink-0" }: { className?: string }) {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" className={className} aria-hidden>
      <path d="M12 3v18" />
      <path d="M5 21h14" />
      <path d="M5 7h14" />
      <path d="M5 7l-3 6a3 3 0 006 0L5 7z" />
      <path d="M19 7l-3 6a3 3 0 006 0L19 7z" />
    </svg>
  );
}

function MediatorChip({
  state,
  canAccept,
  onAccept,
}: {
  state: MediatorState;
  canAccept: boolean;
  onAccept: () => void;
}) {
  const label =
    state.mode === "requested"
      ? canAccept
        ? "Mediator needed"
        : "Mediator requested"
      : `Med: ${state.mediator?.first_name ?? "—"}`;
  const baseClass =
    "inline-flex items-center gap-1 rounded-pill bg-gold/15 text-gold text-[10px] font-semibold px-2 py-0.5";
  if (canAccept) {
    return (
      <button onClick={onAccept} className={`${baseClass} hover:bg-gold/25 transition`}>
        <ScalesIcon />
        <span>{label}</span>
      </button>
    );
  }
  return (
    <span className={baseClass}>
      <ScalesIcon />
      <span>{label}</span>
    </span>
  );
}

function ConfirmModal({
  title,
  confirmLabel,
  onConfirm,
  onCancel,
}: {
  title: string;
  confirmLabel: string;
  onConfirm: () => void;
  onCancel: () => void;
}) {
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center px-6 bg-black/60" onClick={onCancel}>
      <div
        className="bg-bg2 rounded-card w-full max-w-sm p-5"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="text-sm font-medium text-text mb-4">{title}</div>
        <div className="flex justify-end gap-2">
          <button
            onClick={onCancel}
            className="rounded-input bg-bg3 text-text2 px-4 py-2 text-sm hover:bg-bg4"
          >
            Cancel
          </button>
          <button
            onClick={onConfirm}
            className="rounded-input bg-yes text-bg font-semibold px-4 py-2 text-sm hover:brightness-110"
          >
            {confirmLabel}
          </button>
        </div>
      </div>
    </div>
  );
}
