import { AppShell } from "@/components/AppShell";
import { MediateClient, type MediationView } from "./MediateClient";
import { USE_MOCK_DATA, MEDIATOR_FEE_BPS, MEDIATOR_FEE_MIN_CENTS } from "@/lib/config";
import { MOCK_MEDIATIONS, MOCK_CURRENT_USER } from "@/lib/mock";
import { getCurrentUser } from "@/lib/supabase/users";
import { getMediationsForUser } from "@/lib/supabase/mediations";

export const dynamic = "force-dynamic";

export default async function MediatePage() {
  const me = USE_MOCK_DATA ? MOCK_CURRENT_USER : (await getCurrentUser()) ?? MOCK_CURRENT_USER;

  let views: MediationView[];
  if (USE_MOCK_DATA) {
    views = MOCK_MEDIATIONS.map((m) => ({
      id: m.id,
      betId: m.bet_id,
      question: m.bet.question,
      potCents: m.bet.pot_cents,
      feeCents: Math.max(MEDIATOR_FEE_MIN_CENTS, Math.round((m.bet.pot_cents * MEDIATOR_FEE_BPS) / 10_000)),
      status: m.status,
      parties: m.bet.parties.map((p) => ({
        userId: p.user.id,
        name: `${p.user.first_name ?? "?"} ${p.user.last_name_initial ?? ""}.`,
        color: p.user.avatar_color,
        side: p.side,
        evidence: p.evidence,
      })),
    }));
  } else {
    const rows = await getMediationsForUser(me.id);
    views = rows.map((m) => {
      const pot = (m.bet?.participants ?? []).reduce(
        (s: number, p: { stake_cents: number }) => s + p.stake_cents,
        0,
      );
      return {
        id: m.id,
        betId: m.bet_id,
        question: m.bet?.question ?? "",
        potCents: pot,
        feeCents: Math.max(MEDIATOR_FEE_MIN_CENTS, Math.round((pot * MEDIATOR_FEE_BPS) / 10_000)),
        status: m.status,
        parties: (m.bet?.participants ?? []).map(
          (p: {
            user_id: string;
            user: { first_name: string | null; last_name_initial: string | null; avatar_color: string };
            side: "yes" | "no";
          }) => ({
            userId: p.user_id,
            name: `${p.user.first_name ?? "?"} ${p.user.last_name_initial ?? ""}.`,
            color: p.user.avatar_color,
            side: p.side,
            evidence: "—",
          }),
        ),
      };
    });
  }

  const totalEarnedCents = 0; // TODO: sum from complete mediations for this user

  return (
    <AppShell title="Mediate">
      <MediateClient mediations={views} totalEarnedCents={totalEarnedCents} />
    </AppShell>
  );
}
