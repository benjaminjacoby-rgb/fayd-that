"use client";

import { useState } from "react";
import { REPORT_REASONS, type ReportReason } from "@/lib/data/reportsClient";

export function ReportModal({
  onClose,
  onSubmit,
}: {
  onClose: () => void;
  /** Throws on failure — the modal surfaces the error and stays open. */
  onSubmit: (input: { reason: ReportReason; details: string }) => Promise<void>;
}) {
  const [reason, setReason] = useState<ReportReason | null>(null);
  const [details, setDetails] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function submit() {
    if (!reason || busy) return;
    setBusy(true);
    setError(null);
    try {
      await onSubmit({ reason, details: details.trim() });
      onClose();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Couldn't submit report");
    } finally {
      setBusy(false);
    }
  }

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center px-6 bg-black/60"
      onClick={onClose}
    >
      <div
        className="bg-bg2 rounded-card w-full max-w-sm p-5"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="text-sm font-semibold text-text mb-1">Report this bet</div>
        <p className="text-text3 text-xs mb-4">
          We'll review it and take action if it violates our rules.
        </p>

        <div className="flex flex-col gap-1.5 mb-3">
          {REPORT_REASONS.map((r) => (
            <button
              key={r.value}
              type="button"
              onClick={() => setReason(r.value)}
              className={`text-left rounded-input px-3 py-2 text-sm transition border ${
                reason === r.value
                  ? "bg-no/15 border-no/40 text-no font-medium"
                  : "bg-bg3 border-transparent text-text2 hover:bg-bg4"
              }`}
            >
              {r.label}
            </button>
          ))}
        </div>

        <textarea
          value={details}
          onChange={(e) => setDetails(e.target.value)}
          placeholder="Anything else we should know? (optional)"
          rows={3}
          maxLength={2000}
          className="w-full bg-bg3 rounded-input px-3 py-2 text-sm text-text placeholder:text-text3 outline-none focus:ring-2 focus:ring-no/30 resize-none mb-3"
        />

        {error ? <p className="text-no text-xs mb-3">{error}</p> : null}

        <div className="flex justify-end gap-2">
          <button
            type="button"
            onClick={onClose}
            disabled={busy}
            className="rounded-input bg-bg3 text-text2 px-4 py-2 text-sm hover:bg-bg4 disabled:opacity-40"
          >
            Cancel
          </button>
          <button
            type="button"
            onClick={submit}
            disabled={!reason || busy}
            className="rounded-input bg-no text-white font-semibold px-4 py-2 text-sm hover:brightness-110 disabled:opacity-40 disabled:cursor-not-allowed"
          >
            {busy ? "Submitting…" : "Submit report"}
          </button>
        </div>
      </div>
    </div>
  );
}
