export function ProbabilityBar({ yesPercent }: { yesPercent: number }) {
  const yes = Math.max(0, Math.min(100, yesPercent));
  const no = 100 - yes;
  return (
    <div className="w-full">
      <div className="flex justify-between text-[11px] font-mono mb-1">
        <span className="text-yes">YES {yes}%</span>
        <span className="text-no">NO {no}%</span>
      </div>
      <div className="h-2 w-full rounded-pill bg-bg3 overflow-hidden flex">
        <div className="bg-yes h-full" style={{ width: `${yes}%` }} />
        <div className="bg-no h-full" style={{ width: `${no}%` }} />
      </div>
    </div>
  );
}
