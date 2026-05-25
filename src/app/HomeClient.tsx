"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { PostCard } from "@/components/PostCard";
import { FaydThatSheet } from "@/components/FaydThatSheet";
import { StartNewContractSheet } from "@/components/StartNewContractSheet";
import { Toast } from "@/components/Toast";
import { addMyActiveContract } from "@/lib/sessionState";
import { formatCents } from "@/lib/format";
import { USE_MOCK_DATA } from "@/lib/config";
import { insertNotification } from "@/lib/data/notificationsClient";
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
}: {
  bets: BetView[];
  currentUser: UserLite;
}) {
  const router = useRouter();
  const [bets, setBets] = useState<BetView[]>(initialBets);
  const [faydSheet, setFaydSheet] = useState<FaydSheetState>(null);
  const [startSheet, setStartSheet] = useState<StartSheetState>(null);
  const [toast, setToast] = useState<string | null>(null);

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
}: {
  currentUser: UserLite;
  setBets: React.Dispatch<React.SetStateAction<BetView[]>>;
  setToast: (msg: string | null) => void;
  openFayd?: (s: FaydSheetState) => void;
  openStart?: (s: StartSheetState) => void;
}): FeedHandlers {
  void openFayd;
  void openStart;

  function updateBet(betId: string, fn: (b: BetView) => BetView) {
    setBets((prev) => prev.map((b) => (b.id === betId ? fn(b) : b)));
  }

  function onReact(bet: BetView, emoji: string) {
    updateBet(bet.id, (b) => {
      const meta = b.post_meta!;
      const existing = meta.reactions.find((r) => r.emoji === emoji);
      const next: Reaction[] = existing
        ? meta.reactions.map((r) =>
            r.emoji === emoji
              ? { ...r, count: r.reactedByMe ? r.count - 1 : r.count + 1, reactedByMe: !r.reactedByMe }
              : r,
          ).filter((r) => r.count > 0)
        : [...meta.reactions, { emoji, count: 1, reactedByMe: true }];
      return { ...b, post_meta: { ...meta, reactions: next } };
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
    // Notify the original poster that someone faded their bet.
    if (!USE_MOCK_DATA && bet.creator_id && bet.creator_id !== currentUser.id) {
      insertNotification({
        userId: bet.creator_id,
        type: "bet_filled",
        referenceId: bet.id,
        referenceType: "bet",
      }).catch(() => {});
    }
  }

  function onPostSubContract(params: {
    bet: BetView;
    yesProbability: number;
    posterSide: BetSide;
    stakeCents: StakeTierCents;
  }) {
    const { bet, yesProbability, posterSide, stakeCents } = params;
    updateBet(bet.id, (b) => {
      const meta = b.post_meta!;
      const newSub: SubContractView = {
        id: `sc-new-${Date.now()}`,
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
  }

  function onMarkConcluded(bet: BetView) {
    updateBet(bet.id, (b) => {
      const meta = b.post_meta!;
      return { ...b, post_meta: { ...meta, concluded: true } };
    });
    setToast("Bet marked as concluded");
    // Notify everyone who filled this bet that it was resolved.
    if (!USE_MOCK_DATA) {
      const counterIds = new Set<string>();
      for (const c of bet.contracts ?? []) {
        if (c.yes_user_id && c.yes_user_id !== currentUser.id) counterIds.add(c.yes_user_id);
        if (c.no_user_id && c.no_user_id !== currentUser.id) counterIds.add(c.no_user_id);
      }
      for (const uid of counterIds) {
        insertNotification({
          userId: uid,
          type: "bet_resolved",
          referenceId: bet.id,
          referenceType: "bet",
        }).catch(() => {});
      }
    }
  }

  return { onReact, onVote, onAcceptMediator, onMarkConcluded, onConfirmFill, onPostSubContract };
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
