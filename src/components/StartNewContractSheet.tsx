"use client";

import { useEffect, useState } from "react";
import { Sheet } from "./ui/Sheet";
import { Button } from "./ui/Button";
import { Pill } from "./ui/Pill";
import {
  DEFAULT_STAKE_TIER,
  MAX_PROBABILITY,
  MIN_PROBABILITY,
  STAKE_TIERS,
} from "@/lib/config";
import { formatCents } from "@/lib/format";
import type { BetSide, BetView, StakeTierCents } from "@/types/db";

interface Props {
  open: boolean;
  onClose: () => void;
  bet: BetView | null;
  /** Pre-fill the odds slider when launched via "Counter" instead of "Start New Contract". */
  initialYesProbability?: number;
  onPost: (params: {
    bet: BetView;
    yesProbability: number;
    posterSide: BetSide;
    stakeCents: StakeTierCents;
  }) => void;
  /** Label on the primary CTA — "Post to group" by default. */
  ctaLabel?: string;
  title?: string;
}

export function StartNewContractSheet({
  open,
  onClose,
  bet,
  initialYesProbability,
  onPost,
  ctaLabel = "Post to group",
  title = "Start a new contract",
}: Props) {
  const [yesProb, setYesProb] = useState(initialYesProbability ?? 50);
  const [stake, setStake] = useState<StakeTierCents>(DEFAULT_STAKE_TIER);

  useEffect(() => {
    if (open) setYesProb(initialYesProbability ?? 50);
  }, [open, initialYesProbability]);

  if (!bet) return null;

  // Auto-pick the poster's side based on which side of 50% they chose.
  const posterSide: BetSide = yesProb >= 50 ? "yes" : "no";

  return (
    <Sheet open={open} onClose={onClose}>
      <div className="px-5 pt-2 pb-2">
        <div className="text-xs uppercase tracking-wide text-text3 font-medium mb-2">{title}</div>
        <h2 className="text-lg font-semibold leading-snug">{bet.question}</h2>

        {/* Odds slider */}
        <div className="mt-5">
          <div className="flex items-baseline justify-between mb-1.5">
            <span className="text-xs uppercase tracking-wide text-text3 font-medium">Your odds</span>
            <span className="text-[11px] font-mono">
              <span className="text-yes font-bold">YES {yesProb}%</span>
              <span className="text-text3 mx-1">·</span>
              <span className="text-no">NO {100 - yesProb}%</span>
            </span>
          </div>
          <input
            type="range"
            min={MIN_PROBABILITY}
            max={MAX_PROBABILITY}
            value={yesProb}
            onChange={(e) => setYesProb(parseInt(e.target.value, 10))}
            className="fayd-slider"
          />
          <div className="mt-3 bg-bg3 rounded-input px-3 py-2.5 flex items-center justify-between text-sm">
            <span className="text-text3">Your position auto-selects</span>
            <span
              className={`text-[11px] font-bold uppercase rounded-pill px-2 py-0.5 ${
                posterSide === "yes" ? "bg-yes/20 text-yes" : "bg-no/20 text-no"
              }`}
            >
              {posterSide}
            </span>
          </div>
        </div>

        {/* Stake tier */}
        <div className="mt-5">
          <div className="text-xs uppercase tracking-wide text-text3 font-medium mb-2">Stake tier</div>
          <div className="flex gap-1.5 flex-wrap">
            {STAKE_TIERS.map((tier) => (
              <Pill key={tier} active={tier === stake} onClick={() => setStake(tier)}>
                {formatCents(tier)}
              </Pill>
            ))}
          </div>
          <p className="text-[11px] text-text3 mt-2">
            Fixed tiers so counter-parties can match exactly.
          </p>
        </div>

        <Button
          full
          className="mt-5"
          onClick={() =>
            onPost({ bet, yesProbability: yesProb, posterSide, stakeCents: stake })
          }
        >
          {ctaLabel} · {posterSide.toUpperCase()} @ {yesProb}% for {formatCents(stake)}
        </Button>
      </div>
    </Sheet>
  );
}
