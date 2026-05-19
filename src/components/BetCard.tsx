"use client";

import { useState } from "react";
import { STAKE_TIERS, DEFAULT_STAKE_TIER } from "@/lib/config";
import { currentLineFor, formatCents, formatVolume } from "@/lib/format";
import type { BetSide, BetView, StakeTierCents } from "@/types/db";

interface Props {
  bet: BetView;
  onOpen: (bet: BetView) => void;
  onBet: (bet: BetView, side: BetSide, stake: StakeTierCents) => void;
}

export function BetCard({ bet, onOpen, onBet }: Props) {
  const [stake, setStake] = useState<StakeTierCents>(DEFAULT_STAKE_TIER);
  const [stakePickerOpen, setStakePickerOpen] = useState(false);
  const line = currentLineFor(bet, bet.contracts ?? []);
  const yes = line.yesPercent;
  const no = 100 - yes;

  return (
    <div className="bg-bg2 rounded-card overflow-hidden">
      {/* Tap area: question + chevron — opens detail sheet */}
      <button
        onClick={() => onOpen(bet)}
        className="w-full text-left px-4 pt-4 pb-3 flex items-start gap-2 hover:bg-bg2/60 transition"
      >
        <p className="flex-1 font-medium leading-snug pr-1">{bet.question}</p>
        <Chevron className="text-text3 shrink-0 mt-1" />
      </button>

      {/* YES / NO buttons — direct bet at the current weighted-avg line */}
      <div className="px-4 grid grid-cols-2 gap-2">
        <button
          onClick={() => onBet(bet, "yes", stake)}
          className="flex flex-col items-center justify-center py-2.5 rounded-input bg-yes/10 hover:bg-yes/20 active:scale-[0.98] transition border border-yes/20"
        >
          <span className="text-[10px] uppercase tracking-wide text-yes/80 font-semibold">YES</span>
          <span className="font-mono text-lg font-bold text-yes leading-none mt-0.5">{yes}%</span>
        </button>
        <button
          onClick={() => onBet(bet, "no", stake)}
          className="flex flex-col items-center justify-center py-2.5 rounded-input bg-no/10 hover:bg-no/20 active:scale-[0.98] transition border border-no/20"
        >
          <span className="text-[10px] uppercase tracking-wide text-no/80 font-semibold">NO</span>
          <span className="font-mono text-lg font-bold text-no leading-none mt-0.5">{no}%</span>
        </button>
      </div>

      {/* Bottom strip: stake selector + volume */}
      <div className="px-4 pt-2.5 pb-3 mt-1 flex items-center justify-between text-xs">
        <div className="relative">
          <button
            onClick={() => setStakePickerOpen((v) => !v)}
            className="inline-flex items-center gap-1 bg-bg3 hover:bg-bg4 rounded-pill px-2.5 py-1 font-mono text-text"
          >
            <span className="text-text3 text-[10px] uppercase tracking-wide font-sans mr-0.5">Stake</span>
            {formatCents(stake)}
            <Caret />
          </button>
          {stakePickerOpen ? (
            <>
              <div className="fixed inset-0 z-10" onClick={() => setStakePickerOpen(false)} />
              <ul className="absolute left-0 mt-1 z-20 bg-bg3 rounded-input shadow-lg overflow-hidden w-32">
                {STAKE_TIERS.map((tier) => (
                  <li key={tier}>
                    <button
                      onClick={() => { setStake(tier); setStakePickerOpen(false); }}
                      className={`w-full text-left px-3 py-2 text-sm font-mono hover:bg-bg4 ${
                        tier === stake ? "text-yes" : "text-text"
                      }`}
                    >
                      {formatCents(tier)}
                    </button>
                  </li>
                ))}
              </ul>
            </>
          ) : null}
        </div>
        <div className="text-text3 font-mono">
          <span className="text-text2">{formatVolume(line.volumeCents)}</span>
          <span className="mx-1">vol</span>
          <span>·</span>
          <span className="ml-1">{line.contractCount} contract{line.contractCount === 1 ? "" : "s"}</span>
        </div>
      </div>
    </div>
  );
}

function Chevron({ className = "" }: { className?: string }) {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className={`w-4 h-4 ${className}`}>
      <path d="M9 18l6-6-6-6" />
    </svg>
  );
}

function Caret() {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="w-3 h-3 text-text3">
      <path d="M6 9l6 6 6-6" />
    </svg>
  );
}
