import { formatCents } from "@/lib/format";

export function StatsStrip({
  walletCents,
  activeBets,
  totalWonCents,
}: {
  walletCents: number;
  activeBets: number;
  totalWonCents: number;
}) {
  return (
    <div className="grid grid-cols-3 gap-2 px-4 pt-3">
      <Stat label="Wallet" value={formatCents(walletCents)} accent="text-yes" />
      <Stat label="Active" value={String(activeBets)} accent="text-blue" />
      <Stat label="Won" value={formatCents(totalWonCents)} accent="text-gold" />
    </div>
  );
}

function Stat({ label, value, accent }: { label: string; value: string; accent: string }) {
  return (
    <div className="bg-bg2 rounded-card p-3">
      <div className="text-[10px] uppercase tracking-wide text-text3 font-medium">{label}</div>
      <div className={`font-mono text-lg font-semibold ${accent}`}>{value}</div>
    </div>
  );
}
