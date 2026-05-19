import type { BetCategory } from "@/types/db";

const META: Record<BetCategory, { label: string; cls: string }> = {
  fitness:   { label: "fitness",   cls: "bg-yes/15 text-yes" },
  academics: { label: "academics", cls: "bg-blue/15 text-blue" },
  social:    { label: "social",    cls: "bg-purple/15 text-purple" },
  finance:   { label: "finance",   cls: "bg-gold/15 text-gold" },
  other:     { label: "other",     cls: "bg-bg4 text-text2" },
};

export function CategoryPill({ category }: { category: BetCategory }) {
  const m = META[category];
  return (
    <span className={`inline-flex items-center px-2 py-0.5 rounded-pill text-[11px] font-medium uppercase tracking-wide ${m.cls}`}>
      {m.label}
    </span>
  );
}
