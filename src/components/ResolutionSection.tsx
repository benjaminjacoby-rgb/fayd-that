"use client";

import { useEffect, useMemo, useState } from "react";
import { castVote, getVotes, settleBet, type VoteRow } from "@/lib/data/resolutionClient";
import type { BetSide, BetView } from "@/types/db";

interface Props {
  bet: BetView;
  currentUserId: string;
  /** Called after a successful settle so the parent can hide pending UI / refresh. */
  onSettled?: () => void;
}

function participantIdsFor(bet: BetView): string[] {
  const ids = new Set<string>();
  if (bet.creator_id) ids.add(bet.creator_id);
  for (const c of bet.contracts ?? []) {
    if (c.yes_user_id) ids.add(c.yes_user_id);
    if (c.no_user_id) ids.add(c.no_user_id);
  }
  return Array.from(ids);
}

function tallyFor(
  votes: VoteRow[],
  participantIds: string[],
): { yes: number; no: number; total: number } {
  let yes = 0;
  let no = 0;
  const seen = new Set<string>();
  for (const v of votes) {
    if (!participantIds.includes(v.voter_id)) continue;
    if (seen.has(v.voter_id)) continue;
    seen.add(v.voter_id);
    if (v.vote === "YES") yes++;
    else if (v.vote === "NO") no++;
  }
  return { yes, no, total: seen.size };
}

export function ResolutionSection({ bet, currentUserId, onSettled }: Props) {
  const participants = useMemo(() => participantIdsFor(bet), [bet]);
  const participantCount = participants.length;
  const mediatorState = bet.post_meta?.mediator;
  const mediatorId =
    mediatorState && mediatorState.mode === "accepted"
      ? mediatorState.mediator?.id ?? null
      : null;
  const hasMediator = !!mediatorId;
  const isMediator = !!mediatorId && mediatorId === currentUserId;
  const isParticipant = participants.includes(currentUserId);

  const concluded = !!bet.post_meta?.concluded || bet.status === "resolved";

  const [votes, setVotes] = useState<VoteRow[]>([]);
  const [loaded, setLoaded] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Mediator-flow UI state.
  const [mediatorChoice, setMediatorChoice] = useState<BetSide | null>(null);

  useEffect(() => {
    if (concluded || hasMediator) {
      setLoaded(true);
      return;
    }
    let cancelled = false;
    getVotes(bet.id)
      .then((rows) => {
        if (!cancelled) {
          setVotes(rows);
          setLoaded(true);
        }
      })
      .catch(() => {
        if (!cancelled) setLoaded(true);
      });
    return () => {
      cancelled = true;
    };
  }, [bet.id, concluded, hasMediator]);

  if (concluded) return null;

  // ────────────────────────────────────────────────
  // MEDIATOR FLOW
  // ────────────────────────────────────────────────
  if (hasMediator) {
    if (!isMediator) {
      return (
        <div className="mt-3 rounded-input border border-gold/30 bg-gold/10 px-3 py-2 text-xs text-gold">
          Waiting for mediator to settle
        </div>
      );
    }
    return (
      <div className="mt-3 rounded-input border border-gold/30 bg-gold/5 px-3 py-3 flex flex-col gap-2">
        <div className="text-[10px] uppercase tracking-wide text-gold font-semibold">
          Settle this bet
        </div>
        {mediatorChoice === null ? (
          <div className="grid grid-cols-2 gap-2">
            <button
              onClick={() => setMediatorChoice("yes")}
              className="rounded-input bg-yes/15 border border-yes/40 text-yes font-bold py-2 text-sm hover:bg-yes/25 active:scale-[0.97] transition"
            >
              YES won
            </button>
            <button
              onClick={() => setMediatorChoice("no")}
              className="rounded-input bg-no/15 border border-no/40 text-no font-bold py-2 text-sm hover:bg-no/25 active:scale-[0.97] transition"
            >
              NO won
            </button>
          </div>
        ) : (
          <div className="flex flex-col gap-2">
            <div className="text-sm text-text2">
              Confirm:{" "}
              <span className={mediatorChoice === "yes" ? "text-yes font-semibold" : "text-no font-semibold"}>
                {mediatorChoice.toUpperCase()} won
              </span>
              ? Winners will be paid out.
            </div>
            <div className="flex items-center gap-2">
              <button
                disabled={busy}
                onClick={() => setMediatorChoice(null)}
                className="rounded-input bg-bg3 text-text2 px-3 py-2 text-xs hover:bg-bg4 disabled:opacity-40"
              >
                Cancel
              </button>
              <button
                disabled={busy}
                onClick={async () => {
                  setBusy(true);
                  setError(null);
                  try {
                    await settleBet({ betId: bet.id, side: mediatorChoice });
                    onSettled?.();
                  } catch (e) {
                    setError(e instanceof Error ? e.message : "Settle failed");
                  } finally {
                    setBusy(false);
                  }
                }}
                className="rounded-input bg-yes text-bg font-semibold px-3 py-2 text-xs disabled:opacity-40 active:scale-[0.97] transition"
              >
                {busy ? "Settling…" : "Confirm settle"}
              </button>
            </div>
            {error ? (
              <div className="text-xs text-no">{error}</div>
            ) : null}
          </div>
        )}
      </div>
    );
  }

  // ────────────────────────────────────────────────
  // VOTING FLOW
  // ────────────────────────────────────────────────
  if (!isParticipant) return null;
  if (!loaded) return null;

  const tally = tallyFor(votes, participants);
  const myVote = votes.find((v) => v.voter_id === currentUserId)?.vote ?? null;
  const needed = participantCount <= 2 ? participantCount : Math.floor(participantCount / 2) + 1;

  // Disputed = everyone has voted, but no side has the needed majority.
  const everyoneVoted = tally.total >= participantCount && participantCount > 0;
  const disputed =
    everyoneVoted && tally.yes < needed && tally.no < needed;

  async function handleVote(side: BetSide) {
    if (busy || myVote) return;
    setBusy(true);
    setError(null);
    try {
      const inserted = await castVote({ betId: bet.id, side });
      const nextVotes = [...votes.filter((v) => v.voter_id !== inserted.voter_id), inserted];
      setVotes(nextVotes);
      const nextTally = tallyFor(nextVotes, participants);
      // Auto-settle if majority reached on this side.
      const winnerSide = nextTally.yes >= needed ? "yes" : nextTally.no >= needed ? "no" : null;
      if (winnerSide) {
        try {
          await settleBet({ betId: bet.id, side: winnerSide });
          onSettled?.();
        } catch (e) {
          setError(e instanceof Error ? e.message : "Settle failed");
        }
      }
    } catch (e) {
      setError(e instanceof Error ? e.message : "Vote failed");
    } finally {
      setBusy(false);
    }
  }

  if (disputed) {
    return (
      <div className="mt-3 rounded-input border border-no/40 bg-no/10 px-3 py-2.5 flex flex-col gap-1">
        <span className="inline-block self-start text-[10px] font-bold uppercase tracking-wide bg-no/25 text-no rounded-pill px-2 py-0.5">
          Disputed
        </span>
        <div className="text-xs text-text2">
          Reach out to the other party to resolve
        </div>
      </div>
    );
  }

  return (
    <div className="mt-3 rounded-input border border-bg3 bg-bg3/40 px-3 py-3 flex flex-col gap-2">
      <div className="text-[10px] uppercase tracking-wide text-text3 font-semibold">
        How did this end?
      </div>
      {myVote ? (
        <div className="flex flex-col gap-1.5">
          <div className="text-xs text-text2">
            You voted{" "}
            <span className={myVote === "YES" ? "text-yes font-semibold" : "text-no font-semibold"}>
              {myVote}
            </span>{" "}
            won.
          </div>
          <div className="text-[11px] text-text3 font-mono">
            Tally · YES <span className="text-yes">{tally.yes}</span> · NO{" "}
            <span className="text-no">{tally.no}</span> · {tally.total}/{participantCount}{" "}
            voted
          </div>
        </div>
      ) : (
        <div className="grid grid-cols-2 gap-2">
          <button
            disabled={busy}
            onClick={() => handleVote("yes")}
            className="rounded-input bg-yes/15 border border-yes/40 text-yes font-bold py-2 text-sm hover:bg-yes/25 active:scale-[0.97] transition disabled:opacity-40"
          >
            YES won
          </button>
          <button
            disabled={busy}
            onClick={() => handleVote("no")}
            className="rounded-input bg-no/15 border border-no/40 text-no font-bold py-2 text-sm hover:bg-no/25 active:scale-[0.97] transition disabled:opacity-40"
          >
            NO won
          </button>
        </div>
      )}
      {error ? <div className="text-xs text-no">{error}</div> : null}
    </div>
  );
}
