"use client";

import { createClient } from "@/lib/supabase/client";

/** Soft-deletes the bet and resolves the report. Succeeds only for admins — enforced by RLS (`bets_update_admin` / `reports_update_admin`), not just this check. */
export async function takeDownBet(input: { betId: string; reportId: string }): Promise<void> {
  const supabase = createClient();
  const {
    data: { user: authUser },
  } = await supabase.auth.getUser();
  if (!authUser) throw new Error("Not authenticated");

  const { error: betErr } = await supabase
    .from("bets")
    .update({ is_removed: true, removed_at: new Date().toISOString(), removed_by: authUser.id })
    .eq("id", input.betId);
  if (betErr) throw betErr;

  const { error: reportErr } = await supabase
    .from("reports")
    .update({ status: "resolved", resolved_at: new Date().toISOString(), resolved_by: authUser.id })
    .eq("id", input.reportId);
  if (reportErr) throw reportErr;
}

export async function dismissReport(reportId: string): Promise<void> {
  const supabase = createClient();
  const {
    data: { user: authUser },
  } = await supabase.auth.getUser();
  if (!authUser) throw new Error("Not authenticated");

  const { error } = await supabase
    .from("reports")
    .update({ status: "dismissed", resolved_at: new Date().toISOString(), resolved_by: authUser.id })
    .eq("id", reportId);
  if (error) throw error;
}
