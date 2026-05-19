"use client";

import { useEffect, useMemo, useState } from "react";
import { Sheet } from "./ui/Sheet";
import { Button } from "./ui/Button";
import { formatCents, payoutPreview } from "@/lib/format";
import type { BetSide, BetView, SubContractView } from "@/types/db";

const MIN_STAKE_CENTS = 100;

interface Props {
  open: boolean;
  onClose: () => void;
  /**
   * Source of the partial-fill: either the bet's original line, or a
   * sub-contract on the same bet. Both expose the same shape (max stake,
   * poster side, odds).
   */
  bet: BetView | null;
  subContract?: SubContractView | null;
  onConfirm: (params: {
    bet: BetView;
    subContractId: string | null;
    side: BetSide;
    amountCents: number;
  }) => void;
}

export function FaydThatSheet({ bet, subContract, open, onClose, onConfirm }: Props) {
  const target = useTargetSummary(bet, subContract);
  const [amount, setAmount] = useState(MIN_STAKE_CENTS);

  useEffect(() => {
    if (!open || !target) return;
    setAmount(Math.min(target.remainingCents, Math.max(MIN_STAKE_CENTS, 500)));
  }, [open, target?.remainingCents]); // eslint-disable-line react-hooks/exhaustive-deps

  const payouts = useMemo(() => {
    if (!target || !bet) return null;
    return payoutPreview(amount, target.yourYesPercent);
  }, [amount, target, bet]);

  if (!bet || !target) return null;

  const yourWinCents = target.yourSide === "yes"
    ? payouts?.ifYesWinsCents ?? 0
    : payouts?.ifNoWinsCents ?? 0;

  return (
    <Sheet open={open} onClose={onClose}>
      <div className="px-5 pt-2 pb-2">
        <div className="text-xs uppercase tracking-wide text-text3 font-medium mb-2">
          Fayd That · {subContract ? "sub-contract" : "original line"}
        </div>
        <h2 className="text-lg font-semibold leading-snug">{bet.question}</h2>

        {/* Position summary */}
        <div className="mt-4 grid grid-cols-2 gap-2">
          <PositionBox
            label="Your side"
            tone={target.yourSide}
            value={target.yourSide.toUpperCase()}
            sub={`@ ${target.yourYesPercent}% YES odds`}
          />
          <PositionBox
            label="Poster's side"
            tone={target.posterSide}
            value={target.posterSide.toUpperCase()}
            sub={`${target.posterName} @ ${target.posterYesPercent}%`}
            muted
          />
        </div>

        {/* Stake slider + input */}
        <div className="mt-5">
          <div className="flex items-baseline justify-between mb-1.5">
            <span className="text-xs uppercase tracking-wide text-text3 font-medium">Your stake</span>
            <span className="text-[11px] text-text3 font-mono">
              max {formatCents(target.remainingCents)} · min {formatCents(MIN_STAKE_CENTS)}
            </span>
          </div>
          <div className="flex items-center gap-2 mb-2">
            <span className="text-text2">$</span>
            <input
              inputMode="decimal"
              value={(amount / 100).toFixed(amount % 100 === 0 ? 0 : 2)}
              onChange={(e) => {
                const cleaned = e.target.value.replace(/[^\d.]/g, "");
                const dollars = parseFloat(cleaned || "0");
                const clamped = Math.max(MIN_STAKE_CENTS, Math.min(target.remainingCents, Math.round(dollars * 100)));
                setAmount(clamped);
              }}
              className="flex-1 bg-bg3 rounded-input px-3 py-2.5 font-mono text-lg outline-none focus:ring-2 focus:ring-yes/40"
            />
          </div>
          <input
            type="range"
            min={MIN_STAKE_CENTS}
            max={Math.max(MIN_STAKE_CENTS, target.remainingCents)}
            value={amount}
            step={100}
            onChange={(e) => setAmount(parseInt(e.target.value, 10))}
            className="fayd-slider"
          />
        </div>

        {/* Payout preview */}
        <div className="mt-5 bg-bg3 rounded-input p-3">
          <div className="flex items-baseline justify-between">
            <span className="text-xs uppercase tracking-wide text-text3 font-medium">If you win</span>
            <span className={`font-mono text-xl font-bold ${target.yourSide === "yes" ? "text-yes" : "text-no"}`}>
              +{formatCents(yourWinCents)}
            </span>
          </div>
          <div className="text-[11px] text-text3 mt-1">
            You stake {formatCents(amount)} · counter-party stakes {formatCents(yourWinCents)} (less Fayd fee).
          </div>
        </div>

        <Button
          full
          className="mt-5"
          onClick={() =>
            onConfirm({
              bet,
              subContractId: subContract?.id ?? null,
              side: target.yourSide,
              amountCents: amount,
            })
          }
          disabled={amount < MIN_STAKE_CENTS || amount > target.remainingCents}
        >
          Lock it in · {formatCents(amount)} on {target.yourSide.toUpperCase()}
        </Button>
      </div>
    </Sheet>
  );
}

interface TargetSummary {
  posterName: string;
  posterSide: BetSide;
  posterYesPercent: number;
  yourSide: BetSide;
  yourYesPercent: number;
  remainingCents: number;
}

function useTargetSummary(bet: BetView | null, sub?: SubContractView | null): TargetSummary | null {
  if (!bet || !bet.post_meta) return null;
  if (sub) {
    const yourSide: BetSide = sub.poster_side === "yes" ? "no" : "yes";
    return {
      posterName: sub.poster.first_name ?? "—",
      posterSide: sub.poster_side,
      posterYesPercent: sub.yes_probability,
      yourSide,
      yourYesPercent: sub.yes_probability,
      remainingCents: Math.max(0, sub.stake_cents - sub.filled_cents),
    };
  }
  const posterSide = bet.post_meta.poster_side;
  const yourSide: BetSide = posterSide === "yes" ? "no" : "yes";
  return {
    posterName: bet.creator.first_name ?? "—",
    posterSide,
    posterYesPercent: bet.yes_probability,
    yourSide,
    yourYesPercent: bet.yes_probability,
    remainingCents: Math.max(0, bet.stake_cents - bet.post_meta.original_filled_cents),
  };
}

function PositionBox({
  label,
  tone,
  value,
  sub,
  muted = false,
}: {
  label: string;
  tone: BetSide;
  value: string;
  sub: string;
  muted?: boolean;
}) {
  const toneClass = tone === "yes" ? "text-yes" : "text-no";
  const bgClass = muted ? "bg-bg3" : tone === "yes" ? "bg-yes/10" : "bg-no/10";
  return (
    <div className={`${bgClass} rounded-input px-3 py-2.5`}>
      <div className="text-[10px] uppercase tracking-wide text-text3">{label}</div>
      <div className={`font-mono font-bold text-lg ${muted ? "text-text2" : toneClass}`}>{value}</div>
      <div className="text-[11px] text-text3 truncate">{sub}</div>
    </div>
  );
}
