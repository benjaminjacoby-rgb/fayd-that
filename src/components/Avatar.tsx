import { initials } from "@/lib/avatar";

const COLOR_TO_CLASS: Record<string, string> = {
  yes: "bg-yes/15 text-yes",
  blue: "bg-blue/15 text-blue",
  orange: "bg-orange/15 text-orange",
  purple: "bg-purple/15 text-purple",
  gold: "bg-gold/15 text-gold",
  no: "bg-no/15 text-no",
};

export function Avatar({
  first,
  lastInitial,
  color = "yes",
  size = 32,
}: {
  first: string | null;
  lastInitial: string | null;
  color?: string;
  size?: number;
}) {
  const cls = COLOR_TO_CLASS[color] ?? COLOR_TO_CLASS.yes;
  return (
    <div
      className={`inline-flex items-center justify-center rounded-pill font-semibold ${cls}`}
      style={{ width: size, height: size, fontSize: size * 0.4 }}
    >
      {initials(first, lastInitial)}
    </div>
  );
}
