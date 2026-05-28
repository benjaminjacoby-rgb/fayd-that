"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { PostCard } from "@/components/PostCard";
import { FaydThatSheet } from "@/components/FaydThatSheet";
import { StartNewContractSheet } from "@/components/StartNewContractSheet";
import { Toast } from "@/components/Toast";
import { NameUpdatePrompt } from "@/components/NameUpdatePrompt";
import { addMyActiveContract } from "@/lib/sessionState";
import { formatCents } from "@/lib/format";
import { USE_MOCK_DATA } from "@/lib/config";
import { insertNotification } from "@/lib/data/notificationsClient";
import {
  acceptMediator as acceptMediatorRemote,
  cancelBet as cancelBetRemote,
  fillBet as fillBetRemote,
  markBetConcluded as markBetConcludedRemote,
  postSubContract as postSubContractRemote,
} from "@/lib/data/betsClient";
import { toggleReaction } from "@/lib/data/reactionsClient";
import type {
  BetSide,
  BetView,
  ContractView,
  Reaction,
  StakeTierCents,
  SubContractView,
  UserLite,
} from "@/types/db";

type FaydSheetState = { betId: string; subContractId: string | null } | null;
type StartSheetState = { betId: string; initialYesProbability?: number } | null;

export function HomeClient({
  bets: initialBets,
  currentUser,
  showNamePrompt: showNamePromptProp = false,
}: {
  bets: BetView[];
  currentUser: UserLite;
  showNamePrompt?: boolean;
}) {
  const router = useRouter();
  const [bets, setBets] = useState<BetView[]>(initialBets);
  const [faydSheet, setFaydSheet] = useState<FaydSheetState>(null);
  const [startSheet, setStartSheet] = useState<StartSheetState>(null);
  const [toast, setToast] = useState<string | null>(null);
  const [namePromptVisible, setNamePromptVisible] = useState(showNamePromptProp);

  // Keep local state aligned with server-fetched bets when the page is
  // re-rendered (e.g. via router.refresh on focus).
  useEffect(() => {
    setBets(initialBets);
  }, [initialBets]);

  // Refresh-on-focus: when the user navigates back to home or the tab regains
  // focus, ask Next.js to re-fetch the server component, which feeds new
  // bets back in through `initialBets`.
  useEffect(() => {
    if (USE_MOCK_DATA) return;
    function refresh() {
      router.refresh();
    }
    window.addEventListener("focus", refresh);
    const onVis = () => {
      if (!document.hidden) refresh();
    };
    document.addEventListener("visibilitychange", onVis);
    return () => {
      window.removeEventListener("focus", refresh);
      document.removeEventListener("visibilitychange", onVis);
    };
  }, [router]);

  const faydBet = useMemo(
    () => (faydSheet ? bets.find((b) => b.id === faydSheet.betId) ?? null : null),
    [bets, faydSheet],
  );
  const faydSubContract = useMemo(() => {
    if (!faydSheet?.subContractId || !faydBet?.post_meta) return null;
    return faydBet.post_meta.sub_contracts.find((s) => s.id === faydSheet.subContractId) ?? null;
  }, [faydBet, faydSheet]);
  const startBet = useMemo(
    () => (startSheet ? bets.find((b) => b.id === startSheet.betId) ?? null : null),
    [bets, startSheet],
  );

  const handlers = makeHandlers({
    currentUser,
    setBets,
    setToast,
    openFayd: setFaydSheet,
    openStart: setStartSheet,
    onRefresh: () => router.refresh(),
  });

  if (bets.length === 0) return <EmptyState />;

  return (
    <>
      <ul className="flex flex-col gap-3 px-4 mt-4 pb-4">
        {bets.map((b) => (
          <li key={b.id}>
            <PostCard
              bet={b}
              currentUserId={currentUser.id}
              currentUser={currentUser}
              onFaydThat={() => setFaydSheet({ betId: b.id, subContractId: null })}
              onCounter={(bet) => setStartSheet({ betId: bet.id, initialYesProbability: bet.yes_probability })}
              onComment={() => setToast("Comments coming soon")}
              onStartNewContract={(bet) => setStartSheet({ betId: bet.id })}
              onReact={handlers.onReact}
              onVote={handlers.onVote}
              onAcceptMediator={handlers.onAcceptMediator}
              onMarkConcluded={handlers.onMarkConcluded}
              onCancelBet={handlers.onCancelBet}
              onOpenSubContract={(bet, subContractId) =>
                setFaydSheet({ betId: bet.id, subContractId })
              }
            />
          </li>
        ))}
      </ul>

      <FaydThatSheet
        open={!!faydSheet}
        onClose={() => setFaydSheet(null)}
        bet={faydBet}
        subContract={faydSubContract}
        onConfirm={(p) => {
          handlers.onConfirmFill(p);
          setFaydSheet(null);
        }}
      />

      <StartNewContractSheet
        open={!!startSheet}
        onClose={() => setStartSheet(null)}
        bet={startBet}
        initialYesProbability={startSheet?.initialYesProbability}
        onPost={(p) => {
          handlers.onPostSubContract(p);
          setStartSheet(null);
        }}
      />

      {toast ? <Toast message={toast} onDone={() => setToast(null)} /> : null}

      {namePromptVisible ? (
        <NameUpdatePrompt
          onDone={() => {
            setNamePromptVisible(false);
            router.refresh();
          }}
        />
      ) : null}
    </>
  );
}

function EmptyState() {
  return (
    <div className="px-6 pt-16 text-center">
      <div className="text-5xl mb-3">🤝</div>
      <h2 className="text-lg font-semibold mb-1">No posts yet</h2>
      <p className="text-text2 text-sm mb-6">
        Bet posts from friends and groups will show up here.
      </p>
      <Link href="/create" className="inline-block bg-yes text-bg font-semibold px-5 py-3 rounded-input">
        Post a bet
      </Link>
    </div>
  );
}

// ────────────────────────────────────────────────
// Handlers — all mock-only. Each mutates local state to keep the feed alive.
// ────────────────────────────────────────────────
export interface FeedHandlers {
  onReact: (bet: BetView, emoji: string) => void;
  onVote: (bet: BetView, side: BetSide) => void;
  onAcceptMediator: (bet: BetView) => void;
  onMarkConcluded: (bet: BetView) => void;
  onCancelBet: (bet: BetView) => void;
  onConfirmFill: (params: {
    bet: BetView;
    subContractId: string | null;
    side: BetSide;
    amountCents: number;
  }) => void;
  onPostSubContract: (params: {
    bet: BetView;
    yesProbability: number;
    posterSide: BetSide;
    stakeCents: StakeTierCents;
  }) => void;
}

export function makeHandlers({
  currentUser,
  setBets,
  setToast,
  openFayd,
  openStart,
  onRefresh,
}: {
  currentUser: UserLite;
  setBets: React.Dispatch<React.SetStateAction<BetView[]>>;
  setToast: (msg: string | null) => void;
  openFayd?: (s: FaydSheetState) => void;
  openStart?: (s: StartSheetState) => void;
  onRefresh?: () => void;
}): FeedHandlers {
  void openFayd;
  void openStart;

  function updateBet(betId: string, fn: (b: BetView) => BetView) {
    setBets((prev) => prev.map((b) => (b.id === betId ? fn(b) : b)));
  }

  function onReact(bet: BetView, emoji: string) {
    // Optimistic toggle so the chip lights up immediately, then persist.
    let nextReactedByMe = true;
    updateBet(bet.id, (b) => {
      const meta = b.post_meta!;
      const existing = meta.reactions.find((r) => r.emoji === emoji);
      nextReactedByMe = !(existing?.reactedByMe ?? false);
      const next: Reaction[] = existing
        ? meta.reactions.map((r) =>
            r.emoji === emoji
              ? { ...r, count: r.reactedByMe ? r.count - 1 : r.count + 1, reactedByMe: !r.reactedByMe }
              : r,
          ).filter((r) => r.count > 0)
        : [...meta.reactions, { emoji, count: 1, reactedByMe: true }];
      return { ...b, post_meta: { ...meta, reactions: next } };
    });
    if (USE_MOCK_DATA) return;
    // Persist. On failure roll the optimistic state back.
    toggleReaction(bet.id, emoji).catch(() => {
      updateBet(bet.id, (b) => {
        const meta = b.post_meta!;
        const existing = meta.reactions.find((r) => r.emoji === emoji);
        const next: Reaction[] = existing
          ? meta.reactions.map((r) =>
              r.emoji === emoji
                ? { ...r, count: r.reactedByMe ? r.count - 1 : r.count + 1, reactedByMe: !r.reactedByMe }
                : r,
            ).filter((r) => r.count > 0)
          : [...meta.reactions, { emoji, count: 1, reactedByMe: !nextReactedByMe }];
        return { ...b, post_meta: { ...meta, reactions: next } };
      });
      setToast("Couldn't save reaction");
    });
  }

  function onVote(bet: BetView, side: BetSide) {
    updateBet(bet.id, (b) => {
      const meta = b.post_meta!;
      const prev = meta.poll;
      let { yes_votes, no_votes, my_vote } = prev;
      // Undo previous vote if any.
      if (my_vote === "yes") yes_votes--;
      if (my_vote === "no") no_votes--;
      // Toggle: same side again clears the vote.
      if (my_vote === side) {
        my_vote = null;
      } else {
        my_vote = side;
        if (side === "yes") yes_votes++; else no_votes++;
      }
      return { ...b, post_meta: { ...meta, poll: { yes_votes, no_votes, my_vote } } };
    });
  }

  function onConfirmFill(params: {
    bet: BetView;
    subContractId: string | null;
    side: BetSide;
    amountCents: number;
  }) {
    const { bet, subContractId, side, amountCents } = params;
    // Reject fills on bets whose poster-chosen expiration has passed. The
    // server-side fillBet repeats this check against fresh DB state.
    if (bet.expires_at && new Date(bet.expires_at).getTime() <= Date.now()) {
      setToast("This bet has expired");
      return;
    }
    if (subContractId) {
      // Filling a sub-contract.
      let pushedYesProb = 0;
      let pushedStake = 0;
      let pushedContractId = "";
      updateBet(bet.id, (b) => {
        const meta = b.post_meta!;
        const sub = meta.sub_contracts.find((s) => s.id === subContractId);
        if (!sub) return b;
        const newFilled = Math.min(sub.stake_cents, sub.filled_cents + amountCents);
        const newSubs = meta.sub_contracts.map((s) =>
          s.id === subContractId ? { ...s, filled_cents: newFilled } : s,
        );
        const newContract = buildContract({
          id: `c-sub-${sub.id}-${Date.now()}`,
          betId: bet.id,
          posterUser: sub.poster,
          posterSide: sub.poster_side,
          counterUser: currentUser,
          counterSide: side,
          yesProb: sub.yes_probability,
          stakeCents: amountCents,
        });
        pushedYesProb = sub.yes_probability;
        pushedStake = amountCents;
        pushedContractId = newContract.id;
        return {
          ...b,
          contracts: [newContract, ...(b.contracts ?? [])],
          post_meta: { ...meta, sub_contracts: newSubs },
        };
      });
      if (pushedContractId) {
        addMyActiveContract({
          id: pushedContractId,
          bet,
          side,
          yesPercent: pushedYesProb,
          stakeCents: pushedStake,
          createdAt: new Date().toISOString(),
        });
      }
      setToast(`Filled ${formatCents(amountCents)} on ${side.toUpperCase()}`);
      // Persist the sub-contract fill so the feed picks it up on refresh.
      if (!USE_MOCK_DATA) {
        fillBetRemote(amountCents, bet.id, subContractId)
          .then(() => onRefresh?.())
          .catch((e) => {
            const msg = e instanceof Error ? e.message : "Fill failed";
            setToast(msg);
          });
      }
      return;
    }
    // Filling the original line.
    let pushedContractId = "";
    let pushedStake = 0;
    updateBet(bet.id, (b) => {
      const meta = b.post_meta!;
      const cappedAmount = Math.min(amountCents, b.stake_cents - meta.original_filled_cents);
      const newContract = buildContract({
        id: `c-orig-${b.id}-${Date.now()}`,
        betId: b.id,
        posterUser: b.creator,
        posterSide: meta.poster_side,
        counterUser: currentUser,
        counterSide: side,
        yesProb: b.yes_probability,
        stakeCents: cappedAmount,
      });
      pushedContractId = newContract.id;
      pushedStake = cappedAmount;
      return {
        ...b,
        contracts: [newContract, ...(b.contracts ?? [])],
        post_meta: { ...meta, original_filled_cents: meta.original_filled_cents + cappedAmount },
      };
    });
    if (pushedContractId) {
      addMyActiveContract({
        id: pushedContractId,
        bet,
        side,
        yesPercent: bet.yes_probability,
        stakeCents: pushedStake,
        createdAt: new Date().toISOString(),
      });
    }
    setToast(`Filled ${formatCents(amountCents)} on ${side.toUpperCase()}`);
    if (!USE_MOCK_DATA) {
      // Lock the filler's stake in their wallet, then refresh so the new
      // balance reaches the top bar. The remote re-checks expires_at against
      // current DB state, so a stale UI cannot beat the cutoff.
      // Note: bet_filled notification is sent inside fillBetRemote with the
      // correct actorId — do NOT fire a second one here.
      fillBetRemote(amountCents, bet.id)
        .then(() => onRefresh?.())
        .catch((e) => {
          const msg = e instanceof Error ? e.message : "Fill failed";
          setToast(msg);
        });
    }
  }

  function onPostSubContract(params: {
    bet: BetView;
    yesProbability: number;
    posterSide: BetSide;
    stakeCents: StakeTierCents;
  }) {
    const { bet, yesProbability, posterSide, stakeCents } = params;
    const tempSubId = `sc-new-${Date.now()}`;
    updateBet(bet.id, (b) => {
      const meta = b.post_meta!;
      const newSub: SubContractView = {
        id: tempSubId,
        bet_id: bet.id,
        poster: currentUser,
        poster_side: posterSide,
        yes_probability: yesProbability,
        stake_cents: stakeCents,
        filled_cents: 0,
        created_at: new Date().toISOString(),
      };
      return { ...b, post_meta: { ...meta, sub_contracts: [newSub, ...meta.sub_contracts] } };
    });
    setToast(`Posted · ${posterSide.toUpperCase()} @ ${yesProbability}% for ${formatCents(stakeCents)}`);
    if (USE_MOCK_DATA) return;
    postSubContractRemote({
      betId: bet.id,
      posterSide,
      yesProbability,
      stakeCents,
    })
      .then(() => onRefresh?.())
      .catch((e) => {
        // Rollback optimistic sub-contract on failure.
        updateBet(bet.id, (b) => {
          const meta = b.post_meta!;
          return {
            ...b,
            post_meta: {
              ...meta,
              sub_contracts: meta.sub_contracts.filter((s) => s.id !== tempSubId),
            },
          };
        });
        setToast(e instanceof Error ? `Post failed · ${e.message}` : "Post failed");
      });
  }

  function onAcceptMediator(bet: BetView) {
    updateBet(bet.id, (b) => {
      const meta = b.post_meta!;
      return {
        ...b,
        post_meta: {
          ...meta,
          mediator: { mode: "accepted", mediator: currentUser },
        },
      };
    });
    setToast("You're now mediating this bet");
    if (USE_MOCK_DATA) return;
    acceptMediatorRemote(bet.id)
      .then(() => {
        // Notify the poster that someone took the mediator role.
        if (bet.creator_id && bet.creator_id !== currentUser.id) {
          insertNotification({
            userId: bet.creator_id,
            type: "mediator_accepted",
            actorId: currentUser.id,
            referenceId: bet.id,
            referenceType: "bet",
          }).catch(() => {});
        }
        onRefresh?.();
      })
      .catch((e) => {
        // Rollback the chip back to "requested".
        updateBet(bet.id, (b) => {
          const meta = b.post_meta!;
          return {
            ...b,
            post_meta: { ...meta, mediator: { mode: "requested" } },
          };
        });
        setToast(e instanceof Error ? `Couldn't accept · ${e.message}` : "Couldn't accept mediator");
      });
  }

  function onMarkConcluded(bet: BetView) {
    updateBet(bet.id, (b) => {
      const meta = b.post_meta!;
      return { ...b, post_meta: { ...meta, concluded: true } };
    });
    setToast("Bet marked as concluded");
    if (USE_MOCK_DATA) return;
    markBetConcludedRemote(bet.id)
      .then(() => {
        // Notify everyone who filled this bet that it was resolved.
        const counterIds = new Set<string>();
        for (const c of bet.contracts ?? []) {
          if (c.yes_user_id && c.yes_user_id !== currentUser.id) counterIds.add(c.yes_user_id);
          if (c.no_user_id && c.no_user_id !== currentUser.id) counterIds.add(c.no_user_id);
        }
        for (const uid of counterIds) {
          insertNotification({
            userId: uid,
            type: "bet_resolved",
            actorId: currentUser.id,
            referenceId: bet.id,
            referenceType: "bet",
          }).catch(() => {});
        }
        onRefresh?.();
      })
      .catch((e) => {
        // Rollback the badge.
        updateBet(bet.id, (b) => {
          const meta = b.post_meta!;
          return { ...b, post_meta: { ...meta, concluded: false } };
        });
        setToast(e instanceof Error ? `Couldn't conclude · ${e.message}` : "Couldn't mark concluded");
      });
  }

  function onCancelBet(bet: BetView) {
    const filled = bet.post_meta?.original_filled_cents ?? 0;
    const refundCents = Math.max(0, bet.stake_cents - filled);
    updateBet(bet.id, (b) => {
      const meta = b.post_meta!;
      // Cancellation only affects the unfilled portion of the original line.
      // Existing fills (sub_contracts + accepted contracts) are untouched.
      const f = meta.original_filled_cents;
      if (f === 0) {
        return { ...b, status: "cancelled" };
      }
      return { ...b, stake_cents: f };
    });
    setToast("Unfilled stake cancelled");
    if (!USE_MOCK_DATA) {
      cancelBetRemote({ betId: bet.id, refundCents })
        .then(() => onRefresh?.())
        .catch(() => {});
    }
  }

  return { onReact, onVote, onAcceptMediator, onMarkConcluded, onCancelBet, onConfirmFill, onPostSubContract };
}

function buildContract(args: {
  id: string;
  betId: string;
  posterUser: UserLite;
  posterSide: BetSide;
  counterUser: UserLite;
  counterSide: BetSide;
  yesProb: number;
  stakeCents: number;
}): ContractView {
  const yesUser = args.posterSide === "yes" ? args.posterUser : args.counterUser;
  const noUser  = args.posterSide === "yes" ? args.counterUser : args.posterUser;
  return {
    id: args.id,
    bet_id: args.betId,
    yes_user_id: yesUser.id,
    no_user_id: noUser.id,
    yes_probability: args.yesProb,
    stake_cents: args.stakeCents,
    negotiation_id: null,
    status: "active",
    yes_outcome: null,
    created_at: new Date().toISOString(),
    resolved_at: null,
    yes_user: yesUser,
    no_user: noUser,
  };
}
