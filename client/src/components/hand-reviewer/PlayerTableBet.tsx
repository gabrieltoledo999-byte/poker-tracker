import { formatValue, type DisplayUnit } from "@/utils/displayUnit";

const BET_DENOMS = [100, 25, 5, 1, 0.5] as const;
const CHIP_COLORS: Record<number, string> = {
  100: "bg-[radial-gradient(circle_at_30%_30%,#ede9fe_0%,#8b5cf6_50%,#4c1d95_100%)]",
  25: "bg-[radial-gradient(circle_at_30%_30%,#ecfeff_0%,#06b6d4_50%,#155e75_100%)]",
  5: "bg-[radial-gradient(circle_at_30%_30%,#fef9c3_0%,#f59e0b_55%,#78350f_100%)]",
  1: "bg-[radial-gradient(circle_at_30%_30%,#f8fafc_0%,#94a3b8_55%,#334155_100%)]",
  0.5: "bg-[radial-gradient(circle_at_30%_30%,#fee2e2_0%,#ef4444_55%,#7f1d1d_100%)]",
};

export function PlayerTableBet(props: {
  amount: number;
  displayUnit: DisplayUnit;
  bigBlind: number;
}) {
  if (props.amount <= 0) return null;

  let remaining = Math.round(props.amount * 2) / 2;
  const stacks: Array<{ value: number; count: number }> = [];
  for (const denom of BET_DENOMS) {
    const count = Math.floor(remaining / denom);
    if (count > 0) {
      stacks.push({ value: denom, count });
      remaining = Math.round((remaining - count * denom) * 2) / 2;
    }
  }

  const visibleStacks = stacks.slice(0, 3);

  return (
    <div className="pointer-events-none flex flex-col items-center gap-1">
      <div className="flex items-end gap-1">
        {visibleStacks.map(stack => {
          const visible = Math.min(stack.count, 6);
          return (
            <div key={`stack-${stack.value}`} className="relative" style={{ width: 16, height: 16 + visible * 3 }}>
              {Array.from({ length: visible }).map((_, idx) => (
                <span
                  key={`chip-${stack.value}-${idx}`}
                  className={`absolute left-0 h-4 w-4 rounded-full border border-white/80 shadow-[0_2px_6px_rgba(0,0,0,0.4)] ${CHIP_COLORS[stack.value]}`}
                  style={{ bottom: idx * 3 }}
                >
                  <span className="absolute inset-[2px] rounded-full border border-white/80 bg-[repeating-conic-gradient(from_0deg,#ffffff_0deg_18deg,transparent_18deg_40deg)] opacity-90" />
                </span>
              ))}
            </div>
          );
        })}
      </div>
      <div className="rounded-md bg-black/45 px-1.5 py-0.5 text-[10px] font-black text-white/90 shadow-[0_2px_6px_rgba(0,0,0,0.35)]">
        {formatValue(props.amount, props.displayUnit, props.bigBlind)}
      </div>
    </div>
  );
}
