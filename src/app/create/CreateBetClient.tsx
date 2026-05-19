"use client";

import { useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { Avatar } from "@/components/Avatar";
import { Button } from "@/components/ui/Button";
import { Pill } from "@/components/ui/Pill";
import {
  DEFAULT_STAKE_TIER,
  EXPIRY_PRESETS,
  GEO_RADIUS_OPTIONS_M,
  MAX_PROBABILITY,
  MIN_PROBABILITY,
  STAKE_TIERS,
  USE_MOCK_DATA,
} from "@/lib/config";
import { formatCents, fullName, payoutPreview } from "@/lib/format";
import type { BetCategory, BetScope, GroupRow, StakeTierCents, UserRow } from "@/types/db";

const CATEGORIES: BetCategory[] = ["fitness", "academics", "social", "finance", "other"];

type EscrowMode = "betme" | "mediator";

export function CreateBetClient({
  walletCents,
  friends,
  groups,
}: {
  walletCents: number;
  friends: UserRow[];
  groups: GroupRow[];
}) {
  const router = useRouter();
  const [question, setQuestion] = useState("");
  const [category, setCategory] = useState<BetCategory>("social");
  const [yesProbability, setYesProbability] = useState(50);
  const [stakeTier, setStakeTier] = useState<StakeTierCents>(DEFAULT_STAKE_TIER);
  const [expiryHours, setExpiryHours] = useState(24);
  const [scope, setScope] = useState<BetScope>("friends");
  const [groupId, setGroupId] = useState<string | null>(null);
  const [radius, setRadius] = useState<number>(500);
  const [targetFriendIds, setTargetFriendIds] = useState<string[]>([]);
  const [escrow, setEscrow] = useState<EscrowMode>("betme");
  const [mediatorId, setMediatorId] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const stakeCents = stakeTier;
  const payouts = useMemo(() => payoutPreview(stakeCents, yesProbability), [stakeCents, yesProbability]);

  const canSubmit =
    question.trim().length > 4 &&
    stakeCents > 0 &&
    stakeCents <= walletCents &&
    (scope !== "group" || !!groupId) &&
    (escrow !== "mediator" || !!mediatorId);

  async function submit() {
    setError(null);
    setBusy(true);
    try {
      const expiry_at = new Date(Date.now() + expiryHours * 3600_000).toISOString();
      if (USE_MOCK_DATA) {
        // Pretend it worked — bounce back to feed.
        router.push("/");
        return;
      }
      // TODO: wire this to a server action that calls createBet() + holdStakeForBet().
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
          mediator_id: escrow === "mediator" ? mediatorId : null,
          target_friend_ids: targetFriendIds,
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
          className="betme-slider"
        />
        <div className="grid grid-cols-2 gap-2 mt-3">
          <PreviewBox color="yes" label="If YES, you win" value={formatCents(payouts.ifYesWinsCents)} />
          <PreviewBox color="no" label="If NO, you win" value={formatCents(payouts.ifNoWinsCents)} />
        </div>
        <div className="text-[11px] text-text3 mt-2">Pot of {formatCents(payouts.potCents)} after both sides stake.</div>
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
        <p className="text-text3 text-[11px] mt-2">
          Fixed tiers so contracts always match — same on both sides.
        </p>
      </Section>

      <Section label="Expiry">
        <div className="flex gap-2 flex-wrap">
          {EXPIRY_PRESETS.map((e) => (
            <Pill key={e.hours} active={expiryHours === e.hours} onClick={() => setExpiryHours(e.hours)}>
              {e.label}
            </Pill>
          ))}
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

      <Section label="Escrow">
        <div className="grid grid-cols-2 gap-2">
          <ScopeOption active={escrow === "betme"} onClick={() => setEscrow("betme")} label="BetME holds" />
          <ScopeOption active={escrow === "mediator"} onClick={() => setEscrow("mediator")} label="Mediator" />
        </div>
        {escrow === "mediator" ? (
          friends.length > 0 ? (
            <select
              value={mediatorId ?? ""}
              onChange={(e) => setMediatorId(e.target.value || null)}
              className="mt-3 bg-bg3 rounded-input px-3 py-2.5 w-full outline-none"
            >
              <option value="">Pick a mediator…</option>
              {friends.map((f) => (
                <option key={f.id} value={f.id}>{fullName(f)}</option>
              ))}
            </select>
          ) : (
            <p className="text-text3 text-xs mt-3">Add friends to assign a mediator.</p>
          )
        ) : null}
      </Section>

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

function PreviewBox({ color, label, value }: { color: "yes" | "no"; label: string; value: string }) {
  return (
    <div className={`rounded-input px-3 py-2 ${color === "yes" ? "bg-yes/10" : "bg-no/10"}`}>
      <div className={`text-[10px] uppercase tracking-wide ${color === "yes" ? "text-yes" : "text-no"}`}>{label}</div>
      <div className={`font-mono font-semibold ${color === "yes" ? "text-yes" : "text-no"}`}>{value}</div>
    </div>
  );
}
