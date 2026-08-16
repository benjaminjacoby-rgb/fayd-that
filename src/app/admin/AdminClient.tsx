"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Toast } from "@/components/Toast";
import { REPORT_REASONS } from "@/lib/data/reportsClient";
import { takeDownBet, dismissReport } from "@/lib/data/adminClient";
import { USE_MOCK_DATA } from "@/lib/config";

export interface AdminReportRow {
  id: string;
  status: "open" | "resolved" | "dismissed";
  reason: string;
  details: string | null;
  createdAt: string;
  bet: { id: string; question: string; isRemoved: boolean } | null;
  reporter: { id: string; name: string; username: string | null } | null;
}

function reasonLabel(value: string): string {
  return REPORT_REASONS.find((r) => r.value === value)?.label ?? value;
}

function ago(iso: string): string {
  const diff = Date.now() - new Date(iso).getTime();
  const m = Math.floor(diff / 60_000);
  if (m < 1) return "just now";
  if (m < 60) return `${m}m ago`;
  const h = Math.floor(m / 60);
  if (h < 24) return `${h}h ago`;
  return `${Math.floor(h / 24)}d ago`;
}

export function AdminClient({ initialReports }: { initialReports: AdminReportRow[] }) {
  const router = useRouter();
  const [reports, setReports] = useState<AdminReportRow[]>(initialReports);
  const [busyId, setBusyId] = useState<string | null>(null);
  const [toast, setToast] = useState<string | null>(null);

  const open = reports.filter((r) => r.status === "open");
  const resolved = reports
    .filter((r) => r.status !== "open")
    .sort((a, b) => b.createdAt.localeCompare(a.createdAt));

  async function handleTakeDown(r: AdminReportRow) {
    if (!r.bet || busyId) return;
    setBusyId(r.id);
    try {
      if (!USE_MOCK_DATA) {
        await takeDownBet({ betId: r.bet.id, reportId: r.id });
      }
      setReports((prev) =>
        prev.map((x) =>
          x.id === r.id
            ? { ...x, status: "resolved", bet: x.bet ? { ...x.bet, isRemoved: true } : null }
            : x,
        ),
      );
      setToast("Bet taken down.");
      router.refresh();
    } catch (e) {
      setToast(e instanceof Error ? `Couldn't take down · ${e.message}` : "Couldn't take down bet");
    } finally {
      setBusyId(null);
    }
  }

  async function handleDismiss(r: AdminReportRow) {
    if (busyId) return;
    setBusyId(r.id);
    try {
      if (!USE_MOCK_DATA) {
        await dismissReport(r.id);
      }
      setReports((prev) => prev.map((x) => (x.id === r.id ? { ...x, status: "dismissed" } : x)));
      setToast("Report dismissed.");
      router.refresh();
    } catch (e) {
      setToast(e instanceof Error ? `Couldn't dismiss · ${e.message}` : "Couldn't dismiss report");
    } finally {
      setBusyId(null);
    }
  }

  return (
    <div className="max-w-2xl mx-auto px-4 py-6">
      <h1 className="text-xl font-bold text-text mb-1">Reports</h1>
      <p className="text-text3 text-sm mb-6">
        {open.length} open · {resolved.length} resolved
      </p>

      {open.length === 0 ? (
        <p className="text-text3 text-sm italic mb-8">No open reports.</p>
      ) : (
        <ul className="flex flex-col gap-3 mb-8">
          {open.map((r) => (
            <li key={r.id} className="bg-bg2 rounded-card p-4 border border-no/20">
              <div className="flex items-start justify-between gap-3 mb-2">
                <span className="text-[11px] font-bold uppercase tracking-wide bg-no/15 text-no rounded-pill px-2 py-0.5">
                  {reasonLabel(r.reason)}
                </span>
                <span className="text-text3 text-xs shrink-0">{ago(r.createdAt)}</span>
              </div>

              <p className="text-text text-sm font-medium leading-snug mb-1">
                {r.bet?.question ?? "(bet no longer exists)"}
              </p>
              {r.details ? <p className="text-text2 text-xs italic mb-2">"{r.details}"</p> : null}
              <p className="text-text3 text-xs mb-3">
                Reported by {r.reporter?.name ?? "unknown"}
                {r.reporter?.username ? ` · @${r.reporter.username}` : ""}
              </p>

              <div className="flex items-center gap-2">
                <button
                  disabled={!r.bet || busyId === r.id}
                  onClick={() => handleTakeDown(r)}
                  className="rounded-input bg-no text-white font-semibold text-xs px-3 py-2 hover:brightness-110 disabled:opacity-40 disabled:cursor-not-allowed transition"
                >
                  {busyId === r.id ? "Working…" : "Take down bet"}
                </button>
                <button
                  disabled={busyId === r.id}
                  onClick={() => handleDismiss(r)}
                  className="rounded-input bg-bg3 text-text2 font-semibold text-xs px-3 py-2 hover:bg-bg4 disabled:opacity-40 transition"
                >
                  Dismiss
                </button>
              </div>
            </li>
          ))}
        </ul>
      )}

      {resolved.length > 0 ? (
        <>
          <h2 className="text-sm font-semibold text-text2 mb-2">History</h2>
          <ul className="flex flex-col gap-2">
            {resolved.map((r) => (
              <li key={r.id} className="bg-bg2/60 rounded-card p-3 flex items-center justify-between gap-3">
                <div className="min-w-0">
                  <p className="text-text2 text-sm truncate">{r.bet?.question ?? "(bet no longer exists)"}</p>
                  <p className="text-text3 text-[11px]">
                    {reasonLabel(r.reason)} · {ago(r.createdAt)}
                  </p>
                </div>
                <span
                  className={`text-[10px] font-bold uppercase tracking-wide rounded-pill px-2 py-0.5 shrink-0 ${
                    r.status === "resolved" ? "bg-no/15 text-no" : "bg-bg3 text-text3"
                  }`}
                >
                  {r.status === "resolved" ? "Taken down" : "Dismissed"}
                </span>
              </li>
            ))}
          </ul>
        </>
      ) : null}

      {toast ? <Toast message={toast} onDone={() => setToast(null)} /> : null}
    </div>
  );
}
