"use client";

import { Sheet } from "./ui/Sheet";
import { Avatar } from "./Avatar";
import { currentLineFor, formatCents, fullName } from "@/lib/format";
import type { BetView } from "@/types/db";

export function BetSharePicker({
  open,
  onClose,
  bets,
  onPick,
}: {
  open: boolean;
  onClose: () => void;
  bets: BetView[];
  onPick: (bet: BetView) => void;
}) {
  return (
    <Sheet open={open} onClose={onClose}>
      <div className="px-5 pt-2 pb-3">
        <div className="text-xs uppercase tracking-wide text-text3 font-medium mb-3">
          Share a bet
        </div>
        {bets.length === 0 ? (
          <p className="text-text3 text-sm italic py-6 text-center">
            You don't have any active bets to share.
          </p>
        ) : (
          <ul className="flex flex-col gap-2 max-h-[60vh] overflow-y-auto">
            {bets.map((b) => {
              const line = currentLineFor(b, b.contracts ?? []);
              return (
                <li key={b.id}>
                  <button
                    onClick={() => onPick(b)}
                    className="w-full text-left bg-bg3 hover:bg-bg4 rounded-input p-3 flex items-center gap-3 transition"
                  >
                    <Avatar
                      first={b.creator.first_name}
                      lastInitial={b.creator.last_name_initial}
                      color={b.creator.avatar_color}
                      size={36}
                    />
                    <div className="flex-1 min-w-0">
                      <div className="text-sm font-medium truncate">{b.question}</div>
                      <div className="text-text3 text-[11px] mt-0.5">
                        {fullName(b.creator)} · YES {line.yesPercent}% · {formatCents(b.stake_cents)} stake
                      </div>
                    </div>
                  </button>
                </li>
              );
            })}
          </ul>
        )}
      </div>
    </Sheet>
  );
}
