"use client";

import { useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { useRouter } from "next/navigation";
import { Avatar } from "./Avatar";
import { CommentsSection } from "./CommentsSection";
import { ReportModal } from "./ReportModal";
import { Toast } from "./Toast";
import { formatCents, fullName } from "@/lib/format";
import { USE_MOCK_DATA } from "@/lib/config";
import { reportBet, type ReportReason } from "@/lib/data/reportsClient";
import { blockUser } from "@/lib/data/blockedClient";
import { blockUserMock } from "@/lib/sessionState";
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
  const [showReportModal, setShowReportModal] = useState(false);
  const [showBlockConfirm, setShowBlockConfirm] = useState(false);
  const [blocking, setBlocking] = useState(false);
  const [toast, setToast] = useState<string | null>(null);
  const meta = bet.post_meta;
  if (!meta) return null;

  const mediatorState = meta.mediator;
  const isMediator = mediatorState?.mediator?.id === currentUserId;
  const concluded = !!meta.concluded;

  const contracts = buildContractList(bet);
  const main = pickMain(contracts);
  const rest = contracts.filter((c) => c.id !== main.id);

  const mainRemainingCents = Math.max(0, main.stake_cents - main.filled_cents);
  // Poster-chosen expiry. Treat null/undefined as "no expiry". A past timestamp
  // makes the bet behave like a closed bet — no more fills.
  const expiresAt = bet.expires_at ?? null;
  const isExpiredByDate =
    expiresAt !== null && new Date(expiresAt).getTime() <= Date.now();
  const expired = bet.status !== "open" || isExpiredByDate;
  const isMyMain = main.poster.id === currentUserId;
  const isMyBet = bet.creator_id === currentUserId;

  const originalRemainingCents = Math.max(
    0,
    bet.stake_cents - meta.original_filled_cents,
  );
  const canCancel = isMyBet && !concluded && originalRemainingCents > 0 && bet.status === "open";
  const canAcceptMediator =
    mediatorState?.mode === "requested" && bet.creator_id !== currentUserId;

  // Posted-side / taker-side derivation for the body block.
  const posterSide: BetSide = main.poster_side;
  const takerSide: BetSide = posterSide === "yes" ? "no" : "yes";
  const posterOdds = posterSide === "yes" ? main.yes_probability : 100 - main.yes_probability;
  const takerOdds = 100 - posterOdds;

  // Filled = no more room on the main contract (which `pickMain` always
  // chooses as the first still-unfilled contract, falling back to the most
  // recent when every contract on the bet is full).
  const fullyFilled = mainRemainingCents === 0;
  const allContractsFilled =
    contracts.length > 0 && contracts.every((c) => c.filled_cents >= c.stake_cents);

  // Group pill — derived from the bet's group scope. Uses the joined
  // relationship label so no extra Supabase call is needed.
  const groupName =
    bet.scope === "group" && bet.group_id && meta.relationship.kind === "group"
      ? groupNameFromMeta(meta.relationship.label)
      : null;

  // "Sent to N friends" pill — only when the bet was targeted to a specific
  // subset of friends (not a group post, not a broadcast to all friends).
  const targetedFriendCount =
    bet.scope === "friends" && !bet.group_id ? meta.target_friend_ids?.length ?? 0 : 0;

  // The username portion is static and safe to render on the server. The
  // time-remaining portion is computed against `Date.now()` and would cause
  // a hydration mismatch, so it's rendered through <RelativeTime/> below.
  const usernameLabel = bet.creator.username ? `@${bet.creator.username}` : null;

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

  const handleReportSubmit = async ({ reason, details }: { reason: ReportReason; details: string }) => {
    if (!USE_MOCK_DATA) {
      await reportBet({ betId: bet.id, reason, details: details || undefined });
    }
    setToast("Report submitted — thanks for flagging this.");
  };

  const handleBlock = async () => {
    if (blocking) return;
    setBlocking(true);
    try {
      if (USE_MOCK_DATA) {
        blockUserMock(bet.creator_id);
      } else {
        await blockUser(bet.creator_id);
      }
      setShowBlockConfirm(false);
      setToast(`Blocked ${bet.creator.first_name ?? "user"} — you won't see each other's bets anymore.`);
      router.refresh();
    } catch (e) {
      setToast(e instanceof Error ? `Couldn't block · ${e.message}` : "Couldn't block user");
    } finally {
      setBlocking(false);
    }
  };

  return (
    <article
      className={`bg-[#141414] rounded-card overflow-hidden border border-[#222] ${
        isExpiredByDate ? "opacity-60" : allContractsFilled ? "opacity-80" : ""
      }`}
    >
      {/* ── Top row: avatar + question + stake summary ─────────────────── */}
      <div className="relative px-4 pt-4 pb-3 flex items-start gap-3">
        <Avatar
          first={bet.creator.first_name}
          lastInitial={bet.creator.last_name_initial}
          color={bet.creator.avatar_color}
          imageUrl={bet.creator.avatar_url}
          size={40}
        />
        <div className="flex-1 min-w-0">
          <BetTitle text={bet.question} />
          <div className="text-text3 text-[11px] mt-1 truncate">
            {isMyBet ? "You" : fullName(bet.creator)}
            {usernameLabel ? <> · {usernameLabel}</> : null}
          </div>
        </div>
        <div className="text-right shrink-0">
          <div className="font-mono font-bold text-base tabular-nums">
            {formatCents(bet.stake_cents)}
          </div>
          <div className="text-text3 text-[10px] uppercase tracking-wide mt-0.5">
            Staked
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
                {(bet.creator_id === currentUserId || isMediator) && !concluded && bet.status === "closed" ? (
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
                {!isMyBet ? (
                  <>
                    <li>
                      <button
                        onClick={() => { setMenuOpen(false); setShowReportModal(true); }}
                        className="w-full text-left px-3 py-2.5 text-sm hover:bg-bg4 text-text"
                      >
                        Report post
                      </button>
                    </li>
                    <li>
                      <button
                        onClick={() => { setMenuOpen(false); setShowBlockConfirm(true); }}
                        className="w-full text-left px-3 py-2.5 text-sm hover:bg-bg4 text-no"
                      >
                        Block {bet.creator.first_name ?? "user"}
                      </button>
                    </li>
                  </>
                ) : null}
              </ul>
            </>
          ) : null}
        </div>
      </div>

      {/* ── Group tag (amber) ──────────────────────────────────────────── */}
      {groupName ? (
        <div className="px-4 pb-3">
          <span className="inline-block bg-[#1c0f00] text-[#a16207] text-[11px] font-semibold rounded-pill px-2.5 py-1">
            {groupName}
          </span>
        </div>
      ) : null}

      {/* ── "Sent to N friends" pill ───────────────────────────────────── */}
      {targetedFriendCount > 0 ? (
        <div className="px-4 pb-3">
          <span className="inline-flex items-center gap-1 bg-bg3 text-text2 text-[10px] font-medium rounded-pill px-2 py-0.5">
            Sent to {targetedFriendCount} {targetedFriendCount === 1 ? "friend" : "friends"}
          </span>
        </div>
      ) : null}

      {/* ── Body block (only while there's still actionable side) ──────── */}
      {!fullyFilled && !expired && !concluded ? (
        <div className="px-4 pb-3 flex flex-col gap-3">
          {/* Posted-side summary line */}
          <div className="text-xs text-text2 leading-relaxed">
            <span className="text-text font-medium">
              {isMyMain ? "You" : main.poster.first_name ?? "Poster"}
            </span>{" "}
            posted{" "}
            <span className={posterSide === "yes" ? "text-yes font-semibold" : "text-no font-semibold"}>
              {posterSide.toUpperCase()}
            </span>{" "}
            · <span className="font-mono tabular-nums">{posterOdds}%</span>
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
              className={`fayd-pulse-once w-full rounded-input text-white font-semibold text-sm py-3 transition-all duration-150 ease-out hover:scale-[1.02] active:scale-[0.97] disabled:opacity-40 disabled:cursor-not-allowed disabled:hover:scale-100 ${
                takerSide === "yes"
                  ? "bg-yes hover:bg-[#3ee07a] active:bg-[#1a9c4d]"
                  : "bg-no hover:bg-[#ff8585] active:bg-[#e05555]"
              }`}
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

      {/* ── Poll vote ──────────────────────────────────────────────────── */}
      {(expired || concluded) ? (
        <div className="px-4 pb-3">
          <div className="text-[10px] uppercase tracking-wide text-text3 font-medium mb-2">
            Community poll · Who wins?
          </div>
          <div className="grid grid-cols-2 gap-2">
            <button
              onClick={() => onVote(bet, "yes")}
              className={`rounded-input py-2 text-sm font-semibold transition-all active:scale-[0.97] border ${
                meta.poll.my_vote === "yes"
                  ? "bg-yes/20 text-yes border-yes/50"
                  : "bg-bg3 text-text2 border-bg4 hover:border-yes/40 hover:text-yes"
              }`}
            >
              👍 YES · {meta.poll.yes_votes}
            </button>
            <button
              onClick={() => onVote(bet, "no")}
              className={`rounded-input py-2 text-sm font-semibold transition-all active:scale-[0.97] border ${
                meta.poll.my_vote === "no"
                  ? "bg-no/20 text-no border-no/50"
                  : "bg-bg3 text-text2 border-bg4 hover:border-no/40 hover:text-no"
              }`}
            >
              👎 NO · {meta.poll.no_votes}
            </button>
          </div>
        </div>
      ) : null}

      {/* ── Mediator Needed CTA ─────────────────────────────────────────── */}
      {canAcceptMediator ? (
        <div className="px-4 pb-3">
          <button
            onClick={() => setShowAcceptMediator(true)}
            className="w-full rounded-input border-2 border-gold bg-gold/10 text-gold font-bold text-sm py-3 flex items-center justify-center gap-2 hover:bg-gold/20 active:scale-[0.97] transition"
          >
            <ScalesIcon className="w-4 h-4 text-gold shrink-0" />
            Mediator Needed · Volunteer
          </button>
        </div>
      ) : null}

      {/* ── Mediator chip + concluded/expired/expiry/filled badge row ──── */}
      {(mediatorState || concluded || isExpiredByDate || expiresAt || allContractsFilled) ? (
        <div className="px-4 pb-2 flex items-center gap-2 flex-wrap">
          {concluded ? (
            <span className="text-[10px] font-bold uppercase tracking-wide bg-bg3 text-text2 rounded-pill px-2 py-0.5">
              Concluded
            </span>
          ) : null}
          {allContractsFilled && !concluded ? (
            <span className="text-[10px] font-bold uppercase tracking-wide bg-yes/15 text-yes rounded-pill px-2 py-0.5">
              Fully filled
            </span>
          ) : null}
          {isExpiredByDate ? (
            <span className="text-[10px] font-bold uppercase tracking-wide bg-no/15 text-no rounded-pill px-2 py-0.5">
              Expired
            </span>
          ) : expiresAt ? (
            <span className="text-[10px] font-medium uppercase tracking-wide bg-bg3 text-text3 rounded-pill px-2 py-0.5">
              Expires {formatExpiresDate(expiresAt)}
            </span>
          ) : null}
          {mediatorState && !canAcceptMediator ? (
            <MediatorChip
              state={mediatorState}
              canAccept={false}
              onAccept={() => setShowAcceptMediator(true)}
            />
          ) : null}
        </div>
      ) : null}

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
                      imageUrl={c.poster.avatar_url}
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
      {showBlockConfirm ? (
        <ConfirmModal
          title={`Block ${bet.creator.first_name ?? "this user"}? You won't see each other's bets anymore.`}
          confirmLabel={blocking ? "Blocking…" : "Block"}
          onCancel={() => setShowBlockConfirm(false)}
          onConfirm={handleBlock}
        />
      ) : null}
      {showReportModal ? (
        <ReportModal onClose={() => setShowReportModal(false)} onSubmit={handleReportSubmit} />
      ) : null}
      {toast ? <Toast message={toast} onDone={() => setToast(null)} /> : null}

      {/* ── Comments footer ─────────────────────────────────────────────── */}
      <div className="px-4 py-4 border-t border-[#222]">
        <CommentsSection
          betId={bet.id}
          currentUser={currentUser}
          initial={meta.comments}
        />
      </div>
    </article>
  );
}

/**
 * Bet title that wraps onto multiple lines and offers a "see more" toggle when
 * the rendered text is taller than the collapsed clamp. Avoids the old
 * single-line `truncate` that silently hid long titles.
 */
function BetTitle({ text }: { text: string }) {
  const [expanded, setExpanded] = useState(false);
  const [overflowing, setOverflowing] = useState(false);
  const ref = useRef<HTMLHeadingElement | null>(null);

  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    // While collapsed (line-clamp-3 applied), scrollHeight > clientHeight when
    // the text overflows three lines. While expanded, the heights match.
    if (expanded) {
      setOverflowing(true);
      return;
    }
    setOverflowing(el.scrollHeight - el.clientHeight > 1);
  }, [text, expanded]);

  return (
    <div className="flex flex-col">
      <h2
        ref={ref}
        className={`text-sm font-semibold leading-snug break-words ${
          expanded ? "" : "line-clamp-3"
        }`}
      >
        {text}
      </h2>
      {overflowing ? (
        <button
          type="button"
          onClick={() => setExpanded((v) => !v)}
          className="text-text3 hover:text-text2 text-[11px] font-semibold mt-0.5 self-start"
        >
          {expanded ? "Show less" : "See more"}
        </button>
      ) : null}
    </div>
  );
}

function formatExpiresDate(iso: string): string {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return "—";
  return d.toLocaleDateString(undefined, { month: "short", day: "numeric" });
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
  if (canAccept) {
    return (
      <button
        onClick={onAccept}
        className="inline-flex items-center gap-1 rounded-pill border-2 border-gold text-gold text-[10px] font-bold px-2.5 py-1 hover:bg-gold/15 active:scale-95 transition"
      >
        <ScalesIcon className="w-3.5 h-3.5 text-gold shrink-0" />
        <span>{label}</span>
      </button>
    );
  }
  return (
    <span className="inline-flex items-center gap-1 rounded-pill bg-gold/15 text-gold text-[10px] font-semibold px-2 py-0.5">
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
  return createPortal(
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
    </div>,
    document.body,
  );
}
