"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";
import { Avatar } from "@/components/Avatar";
import { Button } from "@/components/ui/Button";
import { formatCents } from "@/lib/format";
import type { BetSide, MediationStatus } from "@/types/db";

export interface MediationView {
  id: string;
  betId: string;
  question: string;
  potCents: number;
  feeCents: number;
  status: MediationStatus;
  parties: Array<{
    userId: string;
    name: string;
    color: string;
    side: BetSide;
    evidence: string;
  }>;
}

export function MediateClient({
  mediations,
  totalEarnedCents,
}: {
  mediations: MediationView[];
  totalEarnedCents: number;
}) {
  const router = useRouter();
  const [busyId, setBusyId] = useState<string | null>(null);
  const [ruledIds, setRuledIds] = useState<Set<string>>(new Set());
  const [error, setError] = useState<string | null>(null);

  async function rule(id: string, side: BetSide, feeCents: number) {
    setBusyId(id);
    setError(null);
    try {
      const supabase = createClient();
      const { error: dbErr } = await supabase
        .from("mediations")
        .update({ ruling: side, status: "ruling_submitted", fee_cents: feeCents })
        .eq("id", id);
      if (dbErr) throw dbErr;
      setRuledIds((prev) => new Set([...prev, id]));
      router.refresh();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Couldn't submit ruling");
    } finally {
      setBusyId(null);
    }
  }

  return (
    <>
      <div className="px-4 pt-3">
        <div className="bg-gradient-to-br from-gold/15 to-bg2 border border-gold/20 rounded-card p-4 flex items-center gap-4">
          <div className="text-3xl">⚖️</div>
          <div>
            <div className="text-[10px] uppercase tracking-wide text-text3">Mediator earnings</div>
            <div className="font-mono text-2xl font-semibold text-gold">{formatCents(totalEarnedCents)}</div>
          </div>
        </div>
      </div>

      {mediations.length === 0 ? (
        <div className="px-6 pt-16 text-center">
          <div className="text-5xl mb-3">🕊️</div>
          <h2 className="text-lg font-semibold mb-1">Nothing to rule on</h2>
          <p className="text-text2 text-sm">When a bet you mediate gets disputed, it'll appear here.</p>
        </div>
      ) : (
        <ul className="flex flex-col gap-3 px-4 pt-4">
          {mediations.map((m) => (
            <li key={m.id} className="bg-bg2 rounded-card p-4 border border-gold/20">
              <div className="flex items-start justify-between gap-3">
                <p className="font-medium leading-snug flex-1">{m.question}</p>
                <span className="text-[11px] uppercase font-semibold bg-gold/20 text-gold rounded-pill px-2 py-0.5">
                  +{formatCents(m.feeCents)} fee
                </span>
              </div>

              <div className="mt-3 text-xs text-text3">
                Pot <span className="font-mono text-text2">{formatCents(m.potCents)}</span>
              </div>

              <ul className="mt-3 flex flex-col gap-2">
                {m.parties.map((p) => (
                  <li key={p.userId} className="bg-bg3 rounded-input p-3">
                    <div className="flex items-center gap-2 mb-1">
                      <Avatar first={p.name.split(" ")[0] ?? "?"} lastInitial={p.name.split(" ")[1]?.[0] ?? ""} color={p.color} size={24} />
                      <span className="text-sm flex-1">{p.name}</span>
                      <span className={`text-[11px] font-semibold uppercase rounded-pill px-2 py-0.5 ${
                        p.side === "yes" ? "bg-yes/20 text-yes" : "bg-no/20 text-no"
                      }`}>
                        {p.side}
                      </span>
                    </div>
                    <p className="text-xs text-text2 italic">"{p.evidence}"</p>
                  </li>
                ))}
              </ul>

              {m.status === "pending" && !ruledIds.has(m.id) ? (
                <>
                  <div className="grid grid-cols-2 gap-2 mt-4">
                    <Button variant="yes" disabled={busyId === m.id} onClick={() => rule(m.id, "yes", m.feeCents)}>
                      {busyId === m.id ? "Submitting…" : "Rule YES"}
                    </Button>
                    <Button variant="no" disabled={busyId === m.id} onClick={() => rule(m.id, "no", m.feeCents)}>
                      {busyId === m.id ? "Submitting…" : "Rule NO"}
                    </Button>
                  </div>
                  {error && busyId === null ? (
                    <p className="mt-2 text-xs text-no">{error}</p>
                  ) : null}
                </>
              ) : (
                <div className="mt-3 text-xs text-text3 italic">Ruling submitted.</div>
              )}
            </li>
          ))}
        </ul>
      )}
    </>
  );
}
