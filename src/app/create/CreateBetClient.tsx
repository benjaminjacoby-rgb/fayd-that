"use client";

import { useMemo, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { Avatar } from "@/components/Avatar";
import { Button } from "@/components/ui/Button";
import { Pill } from "@/components/ui/Pill";
import {
  DEFAULT_STAKE_TIER,
  GEO_RADIUS_OPTIONS_M,
  MAX_PROBABILITY,
  MIN_PROBABILITY,
  STAKE_TIERS,
  USE_MOCK_DATA,
} from "@/lib/config";
import { formatCents, fullName } from "@/lib/format";
import { addChatMessage, addMyPost } from "@/lib/sessionState";
import type {
  BetCategory,
  BetScope,
  BetSide,
  BetView,
  ChatMessageView,
  GroupRow,
  MediatorState,
  StakeTierCents,
  UserLite,
  UserRow,
} from "@/types/db";

const CATEGORIES: BetCategory[] = ["fitness", "academics", "social", "finance", "other"];
const VALID_CATEGORIES = new Set<BetCategory>(CATEGORIES);

type MediatorChoice = "none" | "self" | "request";

function snapToStakeTier(cents: number): StakeTierCents {
  let best: StakeTierCents = DEFAULT_STAKE_TIER;
  let bestDiff = Infinity;
  for (const tier of STAKE_TIERS) {
    const d = Math.abs(tier - cents);
    if (d < bestDiff) {
      bestDiff = d;
      best = tier;
    }
  }
  return best;
}

export function CreateBetClient({
  walletCents,
  friends,
  groups,
  currentUser,
}: {
  walletCents: number;
  friends: UserRow[];
  groups: GroupRow[];
  currentUser: UserLite;
}) {
  const router = useRouter();
  const searchParams = useSearchParams();

  // Pre-fill from query string (used by "Duplicate" on a post card).
  const initialQuestion = searchParams.get("q") ?? "";
  const qCategory = searchParams.get("category");
  const initialCategory: BetCategory =
    qCategory && VALID_CATEGORIES.has(qCategory as BetCategory)
      ? (qCategory as BetCategory)
      : "social";
  const qYesProb = Number(searchParams.get("yes_probability"));
  const initialYesProb =
    Number.isFinite(qYesProb) && qYesProb >= MIN_PROBABILITY && qYesProb <= MAX_PROBABILITY
      ? qYesProb
      : 50;
  const qStake = Number(searchParams.get("stake_cents"));
  const initialStake: StakeTierCents = Number.isFinite(qStake) && qStake > 0
    ? snapToStakeTier(qStake)
    : DEFAULT_STAKE_TIER;

  const [question, setQuestion] = useState(initialQuestion);
  const [category, setCategory] = useState<BetCategory>(initialCategory);
  const [yesProbability, setYesProbability] = useState(initialYesProb);
  const [stakeTier, setStakeTier] = useState<StakeTierCents>(initialStake);
  const [posterSide, setPosterSide] = useState<BetSide>("yes");
  const [scope, setScope] = useState<BetScope>("friends");
  const [groupId, setGroupId] = useState<string | null>(null);
  const [radius, setRadius] = useState<number>(500);
  const [targetFriendIds, setTargetFriendIds] = useState<string[]>([]);
  const [mediatorChoice, setMediatorChoice] = useState<MediatorChoice>("none");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Mediator picker is only meaningful for wider audiences:
  //   - posting to a group
  //   - posting to "all friends" (scope=friends, no specific targets)
  //   - targeting more than 2 specific friends
  const showMediatorPicker =
    scope === "group" ||
    (scope === "friends" && targetFriendIds.length === 0) ||
    (scope === "friends" && targetFriendIds.length > 2);

  const stakeCents = stakeTier;

  // Payout if correct = your stake + the counterparty stake matched against you.
  // No platform fee.
  const payoutIfCorrectCents = useMemo(() => {
    const posterFrac =
      posterSide === "yes" ? yesProbability / 100 : (100 - yesProbability) / 100;
    const counterFrac = 1 - posterFrac;
    if (counterFrac <= 0 || counterFrac >= 1) return 0;
    return Math.round(stakeCents / counterFrac);
  }, [stakeCents, yesProbability, posterSide]);

  const canSubmit =
    question.trim().length > 4 &&
    stakeCents > 0 &&
    stakeCents <= walletCents &&
    (scope !== "group" || !!groupId);

  async function submit() {
    setError(null);
    setBusy(true);
    try {
      // Default expiry kept for backend compatibility (24h).
      const expiry_at = new Date(Date.now() + 24 * 3600_000).toISOString();
      const effectiveMediatorChoice: MediatorChoice = showMediatorPicker ? mediatorChoice : "none";
      const mediatorState: MediatorState | undefined =
        effectiveMediatorChoice === "self"
          ? { mode: "accepted", mediator: currentUser }
          : effectiveMediatorChoice === "request"
            ? { mode: "requested" }
            : undefined;
      if (USE_MOCK_DATA) {
        const newBet: BetView = {
          id: `b-new-${Date.now()}`,
          creator_id: currentUser.id,
          question: question.trim(),
          category,
          yes_probability: yesProbability,
          stake_cents: stakeCents,
          expiry_at,
          resolution_notes: null,
          status: "open",
          scope,
          group_id: scope === "group" ? groupId : null,
          geo_lat: null,
          geo_lng: null,
          geo_radius_meters: scope === "geo" ? radius : null,
          created_at: new Date().toISOString(),
          resolved_at: null,
          creator: currentUser,
          participants: [],
          contracts: [],
          open_negotiations: [],
          post_meta: {
            relationship: { kind: "self", label: "You" },
            poster_side: posterSide,
            original_filled_cents: 0,
            reactions: [],
            comments: [],
            poll: { yes_votes: 0, no_votes: 0, my_vote: null },
            sub_contracts: [],
            mediator: mediatorState,
            end_at: null,
            concluded: false,
          },
        };
        addMyPost(newBet);
        if (scope === "group" && groupId) {
          const msg: ChatMessageView = {
            id: `m-auto-${newBet.id}`,
            conversation_id: groupId,
            sender: currentUser,
            kind: "bet",
            bet_id: newBet.id,
            created_at: new Date().toISOString(),
          };
          addChatMessage(groupId, msg);
        }
        router.push("/");
        return;
      }
      const res = await fetch("/api/bets", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          question: question.trim(),
          category,
          yes_probability: yesProbability,
          stake_cents: stakeCents,
          expiry_at,
          scope,
          group_id: scope === "group" ? groupId : null,
          geo_radius_meters: scope === "geo" ? radius : null,
          mediator_id: null,
          target_friend_ids: targetFriendIds,
          poster_side: posterSide,
        }),
      });
      if (!res.ok) throw new Error(await res.text());
      router.push("/");
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed to create bet");
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="px-4 pt-4 pb-8 flex flex-col gap-5">
      <Section label="Question">
        <textarea
          value={question}
          onChange={(e) => setQuestion(e.target.value)}
          placeholder="I bet Max gets the Goldman internship"
          rows={3}
          className="bg-bg3 rounded-input px-3 py-2.5 w-full outline-none focus:ring-2 focus:ring-yes/40 resize-none"
        />
      </Section>

      <Section label="Category">
        <div className="flex gap-2 flex-wrap">
          {CATEGORIES.map((c) => (
            <Pill key={c} active={category === c} onClick={() => setCategory(c)}>
              {c}
            </Pill>
          ))}
        </div>
      </Section>

      <Section label={`Probability — YES ${yesProbability}% · NO ${100 - yesProbability}%`}>
        <input
          type="range"
          min={MIN_PROBABILITY}
          max={MAX_PROBABILITY}
          value={yesProbability}
          onChange={(e) => setYesProbability(parseInt(e.target.value, 10))}
          className="fayd-slider"
        />
      </Section>

      <Section label={`Your stake · wallet ${formatCents(walletCents)}`}>
        <div className="flex gap-2 flex-wrap">
          {STAKE_TIERS.map((tier) => (
            <Pill key={tier} active={stakeTier === tier} onClick={() => setStakeTier(tier)}>
              {formatCents(tier)}
            </Pill>
          ))}
        </div>
        {stakeCents > walletCents ? (
          <p className="text-no text-xs mt-1">Stake exceeds wallet balance.</p>
        ) : null}
      </Section>

      <Section label="Your position">
        <div className="grid grid-cols-2 gap-2">
          <ScopeOption active={posterSide === "yes"} onClick={() => setPosterSide("yes")} label="YES" />
          <ScopeOption active={posterSide === "no"}  onClick={() => setPosterSide("no")}  label="NO" />
        </div>
        <div className="text-sm text-text2 mt-2">
          Payout if correct: <span className="font-mono font-semibold text-yes">{formatCents(payoutIfCorrectCents)}</span>
        </div>
      </Section>

      <Section label="Who can see this?">
        <div className="grid grid-cols-3 gap-2">
          <ScopeOption active={scope === "friends"} onClick={() => setScope("friends")} label="Friends" />
          <ScopeOption active={scope === "group"}   onClick={() => setScope("group")}   label="Group" />
          <ScopeOption active={scope === "geo"}     onClick={() => setScope("geo")}     label="Near Me" />
        </div>

        {scope === "group" ? (
          groups.length > 0 ? (
            <select
              value={groupId ?? ""}
              onChange={(e) => setGroupId(e.target.value || null)}
              className="mt-3 bg-bg3 rounded-input px-3 py-2.5 w-full outline-none"
            >
              <option value="">Select a group…</option>
              {groups.map((g) => (
                <option key={g.id} value={g.id}>{g.name}</option>
              ))}
            </select>
          ) : (
            <p className="mt-3 text-text3 text-xs">You're not in any groups yet — create one from Profile.</p>
          )
        ) : null}

        {scope === "geo" ? (
          <div className="mt-3">
            <div className="text-xs uppercase tracking-wide text-text3 mb-2">Radius</div>
            <div className="flex gap-2">
              {GEO_RADIUS_OPTIONS_M.map((m) => (
                <Pill key={m} active={radius === m} onClick={() => setRadius(m)}>{m}m</Pill>
              ))}
            </div>
            <div className="mt-3 bg-bg3 rounded-input h-32 flex items-center justify-center text-text3 text-xs">
              {/* TODO: Phase 3 — Mapbox pin drop. */}
              Map pin drop — coming in Phase 3
            </div>
          </div>
        ) : null}
      </Section>

      {scope === "friends" ? (
        <Section label="Target friends">
          {friends.length === 0 ? (
            <p className="text-text3 text-xs">Add friends first to target them in a bet.</p>
          ) : (
            <div className="flex gap-2 flex-wrap">
              {friends.map((f) => {
                const active = targetFriendIds.includes(f.id);
                return (
                  <button
                    key={f.id}
                    onClick={() =>
                      setTargetFriendIds((ids) => (active ? ids.filter((x) => x !== f.id) : [...ids, f.id]))
                    }
                    className={`flex items-center gap-2 px-2 py-1 rounded-pill border ${
                      active ? "bg-yes/15 border-yes text-yes" : "bg-bg3 border-transparent text-text2"
                    }`}
                  >
                    <Avatar first={f.first_name} lastInitial={f.last_name_initial} color={f.avatar_color} size={20} />
                    <span className="text-xs">{fullName(f)}</span>
                  </button>
                );
              })}
            </div>
          )}
        </Section>
      ) : null}

      {showMediatorPicker ? (
        <Section label="Select mediator">
          <div className="grid grid-cols-2 gap-2">
            <ScopeOption
              active={mediatorChoice === "self"}
              onClick={() => setMediatorChoice(mediatorChoice === "self" ? "none" : "self")}
              label="Self-mediate"
            />
            <ScopeOption
              active={mediatorChoice === "request"}
              onClick={() => setMediatorChoice(mediatorChoice === "request" ? "none" : "request")}
              label="Request mediator"
            />
          </div>
          <p className="text-text3 text-[11px] mt-2">
            {mediatorChoice === "self"
              ? "You'll decide the outcome at resolution."
              : mediatorChoice === "request"
                ? "Anyone viewing the post can accept the mediator role."
                : "Optional — pick a mediator to decide the outcome."}
          </p>
        </Section>
      ) : null}

      {error && <div className="text-no text-sm">{error}</div>}

      <Button full disabled={!canSubmit || busy} onClick={submit}>
        {busy ? "Posting…" : `Post bet — lock ${formatCents(stakeCents)}`}
      </Button>
    </div>
  );
}

function Section({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div>
      <div className="text-xs uppercase tracking-wide text-text3 font-medium mb-2">{label}</div>
      {children}
    </div>
  );
}

function ScopeOption({ active, onClick, label }: { active: boolean; onClick: () => void; label: string }) {
  return (
    <button
      onClick={onClick}
      className={`rounded-input px-3 py-2.5 text-sm font-medium border transition ${
        active ? "bg-yes/15 text-yes border-yes/40" : "bg-bg3 text-text2 border-transparent"
      }`}
    >
      {label}
    </button>
  );
}
