"use client";

import { useState } from "react";
import { dismissNamePrompt } from "@/lib/data/profileClient";
import { updateProfile } from "@/lib/data/profileClient";

interface Props {
  /** Called after the user saves a new name or explicitly dismisses the prompt. */
  onDone: () => void;
}

/**
 * One-time popup shown to users whose stored name looks like the old
 * "First L." format (single-letter last word). Lets them enter their full
 * name and save it, or dismiss without changing anything.
 */
export function NameUpdatePrompt({ onDone }: Props) {
  const [first, setFirst] = useState("");
  const [last, setLast] = useState("");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const canSave = first.trim().length > 0 && last.trim().length > 0;

  async function handleSave() {
    if (!canSave || saving) return;
    setSaving(true);
    setError(null);
    try {
      const fullName = `${first.trim()} ${last.trim()}`;
      await updateProfile({ fullName });
      await dismissNamePrompt();
      onDone();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Could not save name");
      setSaving(false);
    }
  }

  async function handleDismiss() {
    // Mark as seen even if the user skips — we won't pester them again.
    await dismissNamePrompt().catch(() => {});
    onDone();
  }

  return (
    /* Full-screen overlay */
    <div className="fixed inset-0 z-50 flex items-end sm:items-center justify-center bg-black/60 px-4 pb-6 sm:pb-0">
      <div className="w-full max-w-sm bg-bg2 rounded-card p-6 flex flex-col gap-4 shadow-xl">
        <div>
          <h2 className="text-base font-bold">Update your display name</h2>
          <p className="text-text2 text-sm mt-1">
            We now show full names. Enter yours below — it'll replace your old
            first&nbsp;+&nbsp;initial display.
          </p>
        </div>

        <div className="grid grid-cols-2 gap-3">
          <label className="block">
            <span className="text-xs uppercase tracking-wide text-text3 font-medium mb-1 block">
              First name
            </span>
            <input
              value={first}
              onChange={(e) => setFirst(e.target.value)}
              placeholder="e.g. John"
              className="bg-bg3 rounded-input px-3 py-2.5 w-full outline-none focus:ring-2 focus:ring-yes/40 text-sm"
              autoFocus
            />
          </label>
          <label className="block">
            <span className="text-xs uppercase tracking-wide text-text3 font-medium mb-1 block">
              Last name
            </span>
            <input
              value={last}
              onChange={(e) => setLast(e.target.value)}
              placeholder="e.g. Johnson"
              className="bg-bg3 rounded-input px-3 py-2.5 w-full outline-none focus:ring-2 focus:ring-yes/40 text-sm"
            />
          </label>
        </div>

        {error ? <p className="text-no text-xs">{error}</p> : null}

        <div className="flex flex-col gap-2">
          <button
            onClick={handleSave}
            disabled={!canSave || saving}
            className="w-full rounded-pill bg-yes text-bg font-semibold py-3 text-sm disabled:opacity-40 disabled:cursor-not-allowed active:scale-[0.98] transition"
          >
            {saving ? "Saving…" : "Save full name"}
          </button>
          <button
            onClick={handleDismiss}
            className="w-full rounded-pill bg-bg3 text-text2 font-medium py-3 text-sm hover:bg-bg4 active:scale-[0.98] transition"
          >
            Keep current name
          </button>
        </div>
      </div>
    </div>
  );
}
