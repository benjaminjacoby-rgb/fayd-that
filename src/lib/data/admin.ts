import { createClient } from "@/lib/supabase/server";

export interface AdminReportRow {
  id: string;
  status: "open" | "resolved" | "dismissed";
  reason: string;
  details: string | null;
  createdAt: string;
  bet: { id: string; question: string; isRemoved: boolean } | null;
  reporter: { id: string; name: string; username: string | null } | null;
}

/** Server-side admin gate — calls the same is_admin() RPC that backs the RLS policies below, so the app-level check and the enforcement never drift apart. */
export async function checkIsAdmin(): Promise<boolean> {
  const supabase = createClient();
  const {
    data: { user: authUser },
  } = await supabase.auth.getUser();
  if (!authUser) return false;

  const { data, error } = await supabase.rpc("is_admin", { uid: authUser.id });
  if (error) return false;
  return !!data;
}

export async function getReports(): Promise<AdminReportRow[]> {
  const supabase = createClient();

  const { data, error } = await supabase
    .from("reports")
    .select("id, status, reason, details, created_at, reporter_id, bet_id")
    .order("created_at", { ascending: false });
  if (error) throw error;

  const rows = (data ?? []) as Array<{
    id: string;
    status: "open" | "resolved" | "dismissed";
    reason: string;
    details: string | null;
    created_at: string;
    reporter_id: string | null;
    bet_id: string | null;
  }>;

  const reporterIds = Array.from(
    new Set(rows.map((r) => r.reporter_id).filter((x): x is string => !!x)),
  );
  const betIds = Array.from(new Set(rows.map((r) => r.bet_id).filter((x): x is string => !!x)));

  const [usersRes, betsRes] = await Promise.all([
    reporterIds.length
      ? supabase.from("users").select("id, username, full_name").in("id", reporterIds)
      : Promise.resolve({ data: [] as Array<{ id: string; username: string | null; full_name: string | null }> }),
    betIds.length
      ? supabase.from("bets").select("id, question, is_removed").in("id", betIds)
      : Promise.resolve({ data: [] as Array<{ id: string; question: string; is_removed: boolean }> }),
  ]);
  const usersById = new Map((usersRes.data ?? []).map((u) => [u.id, u]));
  const betsById = new Map((betsRes.data ?? []).map((b) => [b.id, b]));

  return rows.map((r) => {
    const reporter = r.reporter_id ? usersById.get(r.reporter_id) : null;
    const bet = r.bet_id ? betsById.get(r.bet_id) : null;
    return {
      id: r.id,
      status: r.status,
      reason: r.reason,
      details: r.details,
      createdAt: r.created_at,
      bet: bet ? { id: bet.id, question: bet.question, isRemoved: bet.is_removed } : null,
      reporter: reporter
        ? { id: reporter.id, name: reporter.full_name?.trim() || "—", username: reporter.username }
        : null,
    };
  });
}
