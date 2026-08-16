import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";

const REPORT_REASONS = ["spam", "harassment", "inappropriate", "scam", "other"] as const;
type ReportReason = (typeof REPORT_REASONS)[number];

const ADMIN_EMAIL = "benjamin.jacoby@gmail.com";
const ADMIN_URL = "https://faydthat.com/admin";

export async function POST(request: Request) {
  let body: { betId?: unknown; reason?: unknown; details?: unknown };
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid request body" }, { status: 400 });
  }

  const betId = typeof body.betId === "string" ? body.betId : null;
  const reason = typeof body.reason === "string" ? body.reason : null;
  const details = typeof body.details === "string" ? body.details.trim().slice(0, 2000) : null;

  if (!betId) {
    return NextResponse.json({ error: "betId is required" }, { status: 400 });
  }
  if (!reason || !REPORT_REASONS.includes(reason as ReportReason)) {
    return NextResponse.json({ error: "Invalid reason" }, { status: 400 });
  }

  const supabase = createClient();
  const {
    data: { user: authUser },
  } = await supabase.auth.getUser();
  if (!authUser) {
    return NextResponse.json({ error: "Not authenticated" }, { status: 401 });
  }

  // Best-effort context for the email — RLS still applies, so this can come
  // back null if the bet isn't visible to the reporter, which just means a
  // slightly less detailed email; the report row itself still gets written.
  const { data: bet } = await supabase
    .from("bets")
    .select("question")
    .eq("id", betId)
    .maybeSingle();

  const { data: report, error } = await supabase
    .from("reports")
    .insert({
      bet_id: betId,
      reporter_id: authUser.id,
      reason,
      details: details || null,
    })
    .select("id")
    .single();

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 400 });
  }

  // Fire-and-forget: the DB row above is the durable record the admin
  // dashboard reads, so a misconfigured or down email provider must never
  // fail the report itself.
  sendReportEmail({
    reportId: report.id as string,
    betId,
    betQuestion: (bet as { question?: string } | null)?.question ?? "(bet not visible to reporter)",
    reason: reason as ReportReason,
    details,
    reporterId: authUser.id,
  }).catch((e) => {
    console.error("Report email failed to send (report was still saved):", e);
  });

  return NextResponse.json({ id: report.id });
}

async function sendReportEmail(input: {
  reportId: string;
  betId: string;
  betQuestion: string;
  reason: ReportReason;
  details: string | null;
  reporterId: string;
}) {
  const apiKey = process.env.RESEND_API_KEY;
  if (!apiKey) {
    console.warn("RESEND_API_KEY not set — skipping report email; report is still saved to the DB.");
    return;
  }

  const res = await fetch("https://api.resend.com/emails", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${apiKey}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      from: process.env.REPORTS_FROM_EMAIL || "Fayd Reports <onboarding@resend.dev>",
      to: ADMIN_EMAIL,
      subject: `Fayd report: ${input.reason}`,
      html: `
        <p><strong>Reason:</strong> ${escapeHtml(input.reason)}</p>
        <p><strong>Reported bet:</strong> ${escapeHtml(input.betQuestion)}</p>
        ${input.details ? `<p><strong>Reporter's details:</strong> ${escapeHtml(input.details)}</p>` : ""}
        <p><strong>Bet id:</strong> ${escapeHtml(input.betId)}<br/>
           <strong>Reporter user id:</strong> ${escapeHtml(input.reporterId)}<br/>
           <strong>Report id:</strong> ${escapeHtml(input.reportId)}</p>
        <p><a href="${ADMIN_URL}">Review in the admin dashboard</a></p>
      `,
    }),
  });

  if (!res.ok) {
    const text = await res.text().catch(() => "");
    throw new Error(`Resend API error ${res.status}: ${text}`);
  }
}

function escapeHtml(s: string): string {
  return s
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}
