import { formatValue, type DisplayUnit } from "@/utils/displayUnit";

type PotChip = { value: number; colorClass: string; edgeClass: string };

const POT_DENOMS = [100, 25, 5, 1] as const;

const POT_CHIP_STYLE: Record<number, { colorClass: string; edgeClass: string }> = {
  100: { colorClass: "bg-gradient-to-b from-violet-300 to-violet-600", edgeClass: "border-violet-100/70" },
  25: { colorClass: "bg-gradient-to-b from-cyan-300 to-cyan-600", edgeClass: "border-cyan-100/70" },
  5: { colorClass: "bg-gradient-to-b from-amber-200 to-amber-500", edgeClass: "border-amber-100/75" },
  1: { colorClass: "bg-gradient-to-b from-slate-200 to-slate-400", edgeClass: "border-slate-100/70" },
};

function buildPotChips(pot: number): PotChip[] {
  const chips: PotChip[] = [];
  let remaining = Math.max(0, Math.floor(pot));

  for (const denom of POT_DENOMS) {
    const count = Math.floor(remaining / denom);
    remaining -= count * denom;
    for (let i = 0; i < count; i += 1) {
      chips.push({ value: denom, ...POT_CHIP_STYLE[denom] });
    }
  }

  if (remaining > 0) {
    chips.push({ value: 1, ...POT_CHIP_STYLE[1] });
  }

  if (chips.length <= 24) return chips;

  // Keep visual density stable: sample larger stacks while preserving chip mix.
  const step = chips.length / 24;
  return Array.from({ length: 24 }, (_, index) => chips[Math.floor(index * step)]);
}

export function PotDisplay(props: { pot: number; street: string; displayUnit: DisplayUnit; bigBlind: number }) {
  const chips = buildPotChips(props.pot);
  const columns = Math.max(1, Math.min(4, Math.ceil(chips.length / 5)));

  return (
    <div className="flex flex-col items-center gap-1 rounded-2xl border border-white/10 bg-slate-950/72 px-2 py-1.5 shadow-[0_10px_24px_rgba(2,6,23,0.45)] backdrop-blur-[2px]">
      <div className="relative h-11 w-24">
        <div className="absolute left-1/2 top-[68%] h-3.5 w-16 -translate-x-1/2 rounded-full bg-black/35 blur-[1px]" />
        {Array.from({ length: columns }).map((_, col) => {
          const start = col * 5;
          const stack = chips.slice(start, start + 5);
          const colOffset = (col - (columns - 1) / 2) * 14;

          return (
            <div key={`pot-stack-${col}`} className="absolute bottom-0 left-1/2" style={{ transform: `translateX(${colOffset}px)` }}>
              {stack.map((chip, idx) => (
                <div
                  key={`pot-chip-${col}-${chip.value}-${idx}`}
                  className="absolute"
                  style={{ bottom: `${idx * 3.8}px`, left: "-10px" }}
                >
                  <div className={`relative h-5 w-5 rounded-full border shadow-[0_2px_6px_rgba(0,0,0,0.35)] ${chip.colorClass} ${chip.edgeClass}`}>
                    <div className="absolute inset-[3px] rounded-full border border-white/75 bg-[repeating-conic-gradient(from_0deg,#ffffff_0deg_18deg,transparent_18deg_40deg)] opacity-90" />
                  </div>
                </div>
              ))}
            </div>
          );
        })}
      </div>
      <p className="text-[9px] font-semibold uppercase tracking-[0.24em] text-cyan-100/80">POT</p>
      <p className="text-sm font-black leading-none text-amber-300 sm:text-base">{formatValue(props.pot, props.displayUnit, props.bigBlind)}</p>
    </div>
  );
}
