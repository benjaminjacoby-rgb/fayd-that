"use client";

import { useState } from "react";
import { Avatar } from "./Avatar";
import { currentLineFor, formatCents, fullName } from "@/lib/format";
import type { BetSide, BetView, Reaction } from "@/types/db";

interface Props {
  bet: BetView;
  currentUserId: string;
  onFaydThat: (bet: BetView) => void;
  onCounter: (bet: BetView) => void;
  onComment: (bet: BetView) => void;
  onStartNewContract: (bet: BetView) => void;
  onReact: (bet: BetView, emoji: string) => void;
  onVote: (bet: BetView, side: BetSide) => void;
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

export function PostCard({
  bet,
  currentUserId,
  onFaydThat,
  onCounter,
  onComment,
  onStartNewContract,
  onReact,
  onVote,
  onOpenSubContract,
}: Props) {
  const [menuOpen, setMenuOpen] = useState(false);
  const [pickerOpen, setPickerOpen] = useState(false);

  const meta = bet.post_meta;
  if (!meta) return null;

  const line = currentLineFor(bet, bet.contracts ?? []);
  const remainingCents = Math.max(0, bet.stake_cents - meta.original_filled_cents);
  const filledPct = bet.stake_cents > 0
    ? Math.round((meta.original_filled_cents / bet.stake_cents) * 100)
    : 0;

  const isMyPost = bet.creator_id === currentUserId;
  const expired = bet.status !== "open";
  // Taker is always on the opposite side of the poster, at complementary odds.
  const takerSide: BetSide = meta.poster_side === "yes" ? "no" : "yes";
  const takerOdds = 100 - bet.yes_probability;

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
              {isMyPost ? "You" : fullName(bet.creator)}
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
              </ul>
            </>
          ) : null}
        </div>
      </header>

      {/* Question */}
      <div className="px-4 pb-3">
        <h2 className="text-lg font-semibold leading-snug">{bet.question}</h2>
      </div>

      {/* Poster's position */}
      <div className="px-4 pb-3">
        <div className="bg-bg3 rounded-input px-3 py-2.5 flex items-center gap-2 text-sm flex-wrap">
          <span className="text-text2">
            {isMyPost ? "You're" : `${bet.creator.first_name} is`} on
          </span>
          <span
            className={`text-[11px] font-bold uppercase rounded-pill px-2 py-0.5 ${
              meta.poster_side === "yes" ? "bg-yes/20 text-yes" : "bg-no/20 text-no"
            }`}
          >
            {meta.poster_side}
          </span>
          <span className="text-text3">·</span>
          {remainingCents > 0 ? (
            <span className="text-yes font-bold text-base font-mono">
              {formatCents(remainingCents)} still open
            </span>
          ) : (
            <span className="text-text3 font-bold text-base">fully filled</span>
          )}
        </div>
      </div>

      {/* Group line bar */}
      <div className="px-4 pb-3">
        <div className="mb-1.5">
          <span className="text-[10px] uppercase tracking-wide text-text3 font-medium">Group line</span>
        </div>
        <div className="h-2 w-full rounded-pill bg-bg3 overflow-hidden flex">
          <div className="bg-yes h-full" style={{ width: `${line.yesPercent}%` }} />
          <div className="bg-no h-full"  style={{ width: `${100 - line.yesPercent}%` }} />
        </div>
        {/* fill progress */}
        <div className="mt-1 h-1 w-full rounded-pill bg-bg3 overflow-hidden">
          <div className="h-full bg-yes/40" style={{ width: `${filledPct}%` }} />
        </div>
      </div>

      {/* Buttons */}
      <div className="px-4 pb-3 grid grid-cols-[1fr_auto_auto] gap-2">
        <button
          onClick={() => onFaydThat(bet)}
          disabled={remainingCents === 0 || expired || isMyPost}
          className={`rounded-input text-bg font-semibold text-sm py-2.5 hover:brightness-110 active:scale-[0.98] transition disabled:opacity-40 disabled:cursor-not-allowed ${
            remainingCents === 0 || expired
              ? "bg-bg3 text-text2"
              : takerSide === "yes"
                ? "bg-yes"
                : "bg-no"
          }`}
        >
          {remainingCents === 0
            ? "Fully Filled"
            : expired
              ? "Expired"
              : `Fayd That · ${takerOdds}% ${takerSide.toUpperCase()}`}
        </button>
        <button
          onClick={() => onCounter(bet)}
          disabled={expired || isMyPost}
          className="rounded-input border border-yes/40 text-yes font-semibold text-sm px-3 py-2.5 hover:bg-yes/10 transition disabled:opacity-40 disabled:cursor-not-allowed"
        >
          Counter
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

      {/* Sub-contracts */}
      {meta.sub_contracts.length > 0 ? (
        <div className="px-4 pb-3">
          <div className="text-[10px] uppercase tracking-wide text-text3 font-medium mb-2">
            New contracts on this bet
          </div>
          <ul className="flex flex-col gap-2">
            {meta.sub_contracts.map((sc) => {
              const remaining = sc.stake_cents - sc.filled_cents;
              const subCounterSide: BetSide = sc.poster_side === "yes" ? "no" : "yes";
              const subCounterOdds = 100 - sc.yes_probability;
              return (
                <li key={sc.id}>
                  <button
                    onClick={() => onOpenSubContract?.(bet, sc.id)}
                    className="w-full text-left bg-bg3 hover:bg-bg4 rounded-input p-3 flex items-center gap-3 transition"
                  >
                    <Avatar
                      first={sc.poster.first_name}
                      lastInitial={sc.poster.last_name_initial}
                      color={sc.poster.avatar_color}
                      size={32}
                    />
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-1.5 text-sm">
                        <span className="font-semibold truncate">{fullName(sc.poster)}</span>
                        <span
                          className={`text-[10px] font-bold uppercase rounded-pill px-1.5 py-px ${
                            sc.poster_side === "yes" ? "bg-yes/20 text-yes" : "bg-no/20 text-no"
                          }`}
                        >
                          {sc.poster_side}
                        </span>
                      </div>
                      <div className="text-text3 text-[11px] mt-0.5 font-mono">
                        {formatCents(sc.stake_cents)}
                      </div>
                    </div>
                    {remaining > 0 ? (
                      <span className="text-yes text-sm font-semibold whitespace-nowrap">
                        Take {subCounterSide.toUpperCase()} @ {subCounterOdds}%
                      </span>
                    ) : (
                      <span className="text-text3 text-xs italic whitespace-nowrap">fully filled</span>
                    )}
                  </button>
                </li>
              );
            })}
          </ul>
        </div>
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
