"use client";

import { useState } from "react";
import { dismissWelcome } from "@/lib/data/profileClient";

interface Props {
  /** Called once the user finishes or dismisses the walkthrough. */
  onDone: () => void;
}

const LAST_SLIDE = 3;

/**
 * One-time, full-bleed welcome walkthrough shown the first time a user
 * reaches the feed — right after onboarding for new signups, or on next
 * login for every pre-existing user (both covered by the `has_seen_welcome`
 * column defaulting to false, see migration 026).
 */
export function WelcomeWalkthrough({ onDone }: Props) {
  const [slide, setSlide] = useState(0);
  const [busy, setBusy] = useState(false);

  async function finish() {
    if (busy) return;
    setBusy(true);
    await dismissWelcome().catch(() => {});
    onDone();
  }

  function next() {
    if (slide === LAST_SLIDE) {
      finish();
      return;
    }
    setSlide((s) => Math.min(LAST_SLIDE, s + 1));
  }

  function back() {
    setSlide((s) => Math.max(0, s - 1));
  }

  return (
    <div className="fixed inset-0 z-50 bg-bg flex justify-center">
      <div className="w-full max-w-app h-full flex flex-col overflow-hidden">
        <div className="flex gap-1.5 justify-center pt-4">
          {[0, 1, 2, 3].map((i) => (
            <span
              key={i}
              className={`h-1 rounded-pill transition-all ${
                i === slide ? "w-3.5 bg-text" : "w-1 bg-text3"
              }`}
            />
          ))}
        </div>

        <div className="flex-1 overflow-hidden relative">
          <div
            className="flex h-full transition-transform duration-300 ease-out"
            style={{ transform: `translateX(-${slide * 100}%)` }}
          >
            <WelcomeSlide />
            <PostSlide />
            <MediatorSlide />
            <PayoutSlide />
          </div>
        </div>

        <div className="flex items-center justify-between px-6 pb-8 pt-2">
          {slide > 0 ? (
            <button
              onClick={back}
              className="text-text2 text-sm font-medium py-2 px-1 hover:text-text transition"
            >
              Back
            </button>
          ) : (
            <span />
          )}
          <button
            onClick={next}
            disabled={busy}
            className="rounded-pill bg-yes text-bg font-semibold text-sm px-5 py-2.5 active:scale-[0.98] transition disabled:opacity-60"
          >
            {slide === LAST_SLIDE ? "Start Fayding" : "Next"}
          </button>
        </div>
      </div>
    </div>
  );
}

function SlideShell({ children }: { children: React.ReactNode }) {
  return (
    <div className="min-w-full h-full flex flex-col justify-center px-7 gap-4">
      {children}
    </div>
  );
}

function WelcomeSlide() {
  return (
    <SlideShell>
      <div className="flex flex-col items-center text-center gap-3">
        <ProbabilityRing />
        <h1 className="text-xl font-bold">Welcome to Fayd</h1>
        <p className="text-text2 text-sm leading-relaxed max-w-[240px]">
          Predict anything with your friends.
        </p>
      </div>
    </SlideShell>
  );
}

function PostSlide() {
  return (
    <SlideShell>
      <div className="bg-bg2 rounded-card p-4">
        <div className="h-2.5 rounded bg-bg3 w-4/5 mb-3" />
        <div className="grid grid-cols-2 gap-2">
          <div className="rounded-input bg-yes/10 border border-yes/20 py-2 text-center">
            <div className="text-[9px] font-semibold text-yes/80 uppercase tracking-wide">Yes</div>
            <div className="font-mono text-base font-bold text-yes">62%</div>
          </div>
          <div className="rounded-input bg-no/10 border border-no/20 py-2 text-center">
            <div className="text-[9px] font-semibold text-no/80 uppercase tracking-wide">No</div>
            <div className="font-mono text-base font-bold text-no">38%</div>
          </div>
        </div>
        <div className="h-1.5 rounded-pill bg-bg4 mt-3 relative">
          <div className="absolute inset-y-0 left-0 rounded-pill bg-yes" style={{ width: "62%" }} />
          <div
            className="absolute -top-1.5 w-4 h-4 rounded-pill bg-text border-[3px] border-yes -translate-x-1/2"
            style={{ left: "62%" }}
          />
        </div>
      </div>
      <div className="text-center">
        <h2 className="text-base font-bold">Post and set your line</h2>
        <p className="text-text2 text-xs mt-1.5 leading-relaxed">
          Ask anything, then drag to set your own odds.
        </p>
      </div>
    </SlideShell>
  );
}

function MediatorSlide() {
  return (
    <SlideShell>
      <div className="bg-bg2 rounded-card p-2.5 flex flex-col gap-1.5">
        <div className="rounded-input px-3 py-2.5 border bg-yes/15 border-yes/50">
          <div className="text-sm font-semibold text-yes">Self-mediate</div>
          <div className="text-[11px] text-text3 mt-0.5">You verify the outcome</div>
        </div>
        <div className="rounded-input px-3 py-2.5 border bg-bg3 border-transparent">
          <div className="text-sm font-semibold text-text">Request mediator</div>
          <div className="text-[11px] text-text3 mt-0.5">Choose a friend to make the final call</div>
        </div>
      </div>
      <div className="text-center">
        <h2 className="text-base font-bold">Choose a mediator</h2>
        <p className="text-text2 text-xs mt-1.5 leading-relaxed">
          Self-mediate, or ask a friend to make the final call.
        </p>
      </div>
    </SlideShell>
  );
}

function PayoutSlide() {
  return (
    <SlideShell>
      <div className="bg-bg2 rounded-card p-4">
        <div className="h-2.5 rounded bg-bg3 w-3/5 mb-3" />
        <div className="grid grid-cols-2 gap-2">
          <div className="rounded-input bg-yes py-2 text-center text-xs font-bold text-bg">
            Confirm YES
          </div>
          <div className="rounded-input bg-bg3 py-2 text-center text-xs font-bold text-text3">
            Confirm NO
          </div>
        </div>
        <div className="flex items-center justify-between mt-3 pt-3 border-t border-bg3">
          <span className="text-[11px] text-text2">Wallet</span>
          <span className="font-mono text-sm font-bold text-gold">$50 &rarr; $114</span>
        </div>
      </div>
      <div className="text-center">
        <h2 className="text-lg font-bold text-gold">Fayd takes no fees</h2>
        <p className="text-text font-semibold text-sm mt-1">Get paid instantly</p>
        <p className="text-text2 text-xs mt-1.5 leading-relaxed">
          100% of every pot goes to the winners.
        </p>
        <p className="text-text3 text-[11px] mt-2.5 leading-relaxed">
          All balances are imaginary Fayd credits. No real money is used in the app.
        </p>
      </div>
    </SlideShell>
  );
}

function ProbabilityRing() {
  return (
    <svg width="72" height="72" viewBox="0 0 72 72" aria-hidden="true">
      <circle cx="36" cy="36" r="32" fill="none" stroke="var(--bg3)" strokeWidth="8" />
      <path
        d="M36 4 A32 32 0 0 1 62 52"
        fill="none"
        stroke="var(--yes)"
        strokeWidth="8"
        strokeLinecap="round"
      />
      <text x="36" y="41" textAnchor="middle" fontSize="15" fontWeight="700" fill="var(--text)">
        62%
      </text>
    </svg>
  );
}
