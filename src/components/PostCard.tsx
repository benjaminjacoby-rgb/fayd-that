"use client";

import { useState } from "react";
import { Avatar } from "./Avatar";
import { currentLineFor, formatCents, fullName } from "@/lib/format";
import type { BetSide, BetView, Reaction, UserLite } from "@/types/db";

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
  onOpenSubContract?: (bet: BetView, subContractId: string) => void;
}

const POSTER_AGE = (iso: string): string => {
  const diff = Date.now() - new Date(iso).getTime();
  const m = Math.floor(diff / 60_000);
  if (m < 1) return "just now";
  if (m < 60) return `${m}m ago`;
  const h = Math.floor(m / 60);
  if (h < 24) return `${h}h ago`;
  return `${Math.floor(h / 24)}d ago`;
};

const REACTION_PICKER = ["🔥", "😂", "💀", "🙏", "👀", "🤝"];

interface ContractEntry {
  /** Stable id: "original" for the bet's original line, or sub-contract id. */
  id: string;
  /** Null when this is the bet's original line. */
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

// Most-recent-not-fully-filled, else most-recent overall.
function pickMain(list: ContractEntry[]): ContractEntry {
  const sorted = [...list].sort(
    (a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime(),
  );
  return sorted.find((c) => c.filled_cents < c.stake_cents) ?? sorted[0];
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
  onOpenSubContract,
}: Props) {
  const [menuOpen, setMenuOpen] = useState(false);
  const [pickerOpen, setPickerOpen] = useState(false);
  const [showAcceptMediator, setShowAcceptMediator] = useState(false);
  const [showConcludeConfirm, setShowConcludeConfirm] = useState(false);
  void currentUser;

  const meta = bet.post_meta;
  if (!meta) return null;

  const mediatorState = meta.mediator;
  const isMediator = mediatorState?.mediator?.id === currentUserId;
  const concluded = !!meta.concluded;

  const contracts = buildContractList(bet);
  const main = pickMain(contracts);
  const rest = contracts.filter((c) => c.id !== main.id);

  const line = currentLineFor(bet, bet.contracts ?? []);

  const mainRemainingCents = Math.max(0, main.stake_cents - main.filled_cents);
  const expired = bet.status !== "open";
  const isMyMain = main.poster.id === currentUserId;
  const isMyBet = bet.creator_id === currentUserId;

  // Taker is always on the opposite side of the main contract's poster.
  const takerSide: BetSide = main.poster_side === "yes" ? "no" : "yes";
  const takerOdds = 100 - main.yes_probability;

  const handleMainFayd = () => {
    if (main.subContractId) {
      onOpenSubContract?.(bet, main.subContractId);
    } else {
      onFaydThat(bet);
    }
  };

  return (
    <article className="bg-bg2 rounded-card overflow-hidden">
      {/* Header */}
      <header className="px-4 pt-4 pb-3 flex items-center gap-3">
        <Avatar
          first={bet.creator.first_name}
          lastInitial={bet.creator.last_name_initial}
          color={bet.creator.avatar_color}
          size={40}
        />
        <div className="flex-1 min-w-0">
          <div className="flex items-baseline gap-1.5 text-sm">
            <span className="font-semibold truncate">
              {isMyBet ? "You" : fullName(bet.creator)}
            </span>
            <span className="text-text3">·</span>
            <span className="text-text3 text-[11px] font-mono">{POSTER_AGE(bet.created_at)}</span>
          </div>
          <div className="text-text3 text-[11px]">
            {meta.relationship.label}
            {bet.creator.username ? <> · @{bet.creator.username}</> : null}
          </div>
        </div>
        <div className="relative">
          <button
            onClick={() => setMenuOpen((v) => !v)}
            aria-label="post options"
            className="w-8 h-8 rounded-pill bg-bg3 hover:bg-bg4 inline-flex items-center justify-center text-text2"
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
              </ul>
            </>
          ) : null}
        </div>
      </header>

      {/* Question */}
      <div className="px-4 pb-3">
        <div className="flex items-start gap-2">
          <h2 className="text-lg font-semibold leading-snug flex-1">{bet.question}</h2>
          {concluded ? (
            <span className="text-[10px] font-bold uppercase tracking-wide bg-bg3 text-text2 rounded-pill px-2 py-1 shrink-0">
              Concluded
            </span>
          ) : null}
        </div>
        {meta.end_at ? (
          <div className="text-text3 text-[11px] mt-1">Ends {formatEndAt(meta.end_at)}</div>
        ) : null}
      </div>

      {/* Main contract — poster's position */}
      <div className="px-4 pb-3">
        <div className="bg-bg3 rounded-input px-3 py-2.5 flex items-center gap-2 text-sm flex-wrap">
          <span className="text-text2">
            {isMyMain ? "You're" : `${main.poster.first_name} is`} on
          </span>
          <span
            className={`text-[11px] font-bold uppercase rounded-pill px-2 py-0.5 ${
              main.poster_side === "yes" ? "bg-yes/20 text-yes" : "bg-no/20 text-no"
            }`}
          >
            {main.poster_side}
          </span>
          <span className="text-text3">·</span>
          <span className="text-text font-bold text-base font-mono">
            {formatCents(main.stake_cents)}
          </span>
        </div>
      </div>

      {/* Group line bar with percentage marker */}
      <div className="px-4 pb-3">
        <div className="mb-1.5">
          <span className="text-[10px] uppercase tracking-wide text-text3 font-medium">Group line</span>
        </div>
        <div className="relative pb-4">
          <div className="h-2 w-full rounded-pill bg-bg3 overflow-hidden flex">
            <div className="bg-yes h-full" style={{ width: `${line.yesPercent}%` }} />
            <div className="bg-no h-full"  style={{ width: `${100 - line.yesPercent}%` }} />
          </div>
          {/* vertical marker at the YES/NO boundary */}
          <div
            className="absolute h-4 w-px bg-text"
            style={{ left: `${line.yesPercent}%`, top: "-2px", transform: "translateX(-50%)" }}
            aria-hidden
          />
          {/* percentage label under the marker */}
          <div
            className="absolute text-yes text-[10px] font-mono font-semibold whitespace-nowrap"
            style={{ left: `${line.yesPercent}%`, top: "10px", transform: "translateX(-50%)" }}
          >
            {line.yesPercent}%
          </div>
        </div>
      </div>

      {/* Mediator status bar */}
      {mediatorState ? (
        <div className="mx-4 mb-3 rounded-input bg-gold/15 border border-gold/40 px-3 py-2 flex items-center gap-2">
          <ScalesIcon />
          <div className="flex-1 text-xs font-medium text-gold">
            {mediatorState.mode === "requested"
              ? "Mediator requested"
              : `Mediated by ${mediatorState.mediator ? mediatorState.mediator.first_name : "—"}`}
          </div>
          {mediatorState.mode === "requested" && bet.creator_id !== currentUserId ? (
            <button
              onClick={() => setShowAcceptMediator(true)}
              className="rounded-pill bg-gold text-bg text-[11px] font-semibold px-3 py-1 hover:brightness-110"
            >
              Accept
            </button>
          ) : null}
        </div>
      ) : null}

      {/* Buttons */}
      <div className="px-4 pb-3 grid grid-cols-[1fr_auto_auto] gap-2">
        <button
          onClick={handleMainFayd}
          disabled={mainRemainingCents === 0 || expired || isMyMain}
          className={`rounded-input text-bg font-semibold text-sm py-2.5 hover:brightness-110 active:scale-[0.98] transition disabled:opacity-40 disabled:cursor-not-allowed ${
            mainRemainingCents === 0 || expired
              ? "bg-bg3 text-text2"
              : takerSide === "yes"
                ? "bg-yes"
                : "bg-no"
          }`}
        >
          {mainRemainingCents === 0
            ? "Fully Filled"
            : expired
              ? "Expired"
              : `Fayd That · ${takerOdds}% ${takerSide.toUpperCase()}`}
        </button>
        <button
          onClick={() => onCounter(bet)}
          disabled={expired || isMyMain}
          className="rounded-input border border-yes/40 text-yes font-semibold text-sm px-3 py-2.5 hover:bg-yes/10 transition disabled:opacity-40 disabled:cursor-not-allowed"
        >
          Duplicate
        </button>
        <button
          onClick={() => onComment(bet)}
          className="rounded-input bg-bg3 text-text2 hover:bg-bg4 text-sm px-3 py-2.5 transition"
          aria-label="comment"
        >
          <CommentIcon />
        </button>
      </div>

      {/* Reactions */}
      <div className="px-4 pb-3 flex items-center gap-1.5 flex-wrap">
        {meta.reactions.map((r) => (
          <ReactionChip key={r.emoji} reaction={r} onClick={() => onReact(bet, r.emoji)} />
        ))}
        <div className="relative">
          <button
            onClick={() => setPickerOpen((v) => !v)}
            className="inline-flex items-center justify-center w-7 h-7 rounded-pill bg-bg3 hover:bg-bg4 text-text3 text-xs"
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

      {/* Sub-contracts (includes demoted originals) */}
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
                        className={`rounded-pill px-3 py-1.5 text-xs font-semibold whitespace-nowrap border cursor-pointer ${
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

      {/* Confirmation modals */}
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

      {/* Comments preview */}
      <div className="px-4 pb-4">
        {meta.comments.length === 0 ? (
          <button onClick={() => onComment(bet)} className="text-text3 text-xs hover:text-text2">
            Be the first to comment
          </button>
        ) : (
          <ul className="flex flex-col gap-1.5">
            {meta.comments.slice(0, 2).map((c) => (
              <li key={c.id} className="text-sm flex gap-1.5">
                <span className="font-semibold text-text2 shrink-0">{fullName(c.user)}</span>
                <span className="text-text break-words">{c.text}</span>
              </li>
            ))}
            {meta.comments.length > 2 ? (
              <button onClick={() => onComment(bet)} className="text-text3 text-xs hover:text-text2 text-left">
                View all {meta.comments.length} comments
              </button>
            ) : null}
          </ul>
        )}
      </div>
    </article>
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

function CommentIcon() {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="w-4 h-4">
      <path d="M21 11.5a8.38 8.38 0 01-.9 3.8 8.5 8.5 0 01-7.6 4.7 8.38 8.38 0 01-3.8-.9L3 21l1.9-5.7a8.38 8.38 0 01-.9-3.8 8.5 8.5 0 014.7-7.6 8.38 8.38 0 013.8-.9h.5a8.48 8.48 0 018 8v.5z" />
    </svg>
  );
}

function ScalesIcon() {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" className="w-4 h-4 text-gold shrink-0" aria-hidden>
      <path d="M12 3v18" />
      <path d="M5 21h14" />
      <path d="M5 7h14" />
      <path d="M5 7l-3 6a3 3 0 006 0L5 7z" />
      <path d="M19 7l-3 6a3 3 0 006 0L19 7z" />
    </svg>
  );
}

function formatEndAt(iso: string): string {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return "";
  const datePart = d.toLocaleDateString("en-US", { month: "short", day: "numeric" });
  const timePart = d.toLocaleTimeString("en-US", { hour: "numeric", minute: "2-digit" });
  return `${datePart} at ${timePart}`;
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
