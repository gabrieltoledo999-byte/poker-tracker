import { formatValue } from "@/utils/displayUnit";

interface ChipStackProps {
  amount: number;
  denominations?: number[];
  size?: "sm" | "md" | "lg";
  displayUnit?: "chips" | "bb";
  bigBlind?: number;
}

const CHIP_COLORS = {
  0.5: "#b91c1c",   // red
  1: "#1f2937",     // dark gray
  5: "#dc2626",     // bright red
  10: "#1e40af",    // dark blue
  25: "#059669",    // green
  50: "#7c3aed",    // purple
  100: "#d97706",   // amber
  500: "#be185d",   // pink
  1000: "#1e293b",  // slate
};

export function ChipStack(props: ChipStackProps) {
  const { amount, denominations = [5, 1, 0.5], size = "md", displayUnit = "chips", bigBlind = 0 } = props;

  // Calculate chip breakdown by denomination
  const chips: Array<{ value: number; color: string }> = [];
  let remaining = Math.round(amount * 2) / 2; // Handle decimals

  for (const denom of denominations) {
    while (remaining >= denom) {
      chips.push({
        value: denom,
        color: CHIP_COLORS[denom as keyof typeof CHIP_COLORS] || "#6b7280",
      });
      remaining = Math.round((remaining - denom) * 2) / 2;
    }
  }

  const sizeMap = {
    sm: { chip: 22, layer: 4, textSize: "text-xs" },
    md: { chip: 30, layer: 5, textSize: "text-sm" },
    lg: { chip: 36, layer: 6, textSize: "text-base" },
  };

  const config = sizeMap[size];

  const grouped = chips.reduce<Record<string, { value: number; color: string; count: number }>>((acc, chip) => {
    const key = String(chip.value);
    if (!acc[key]) acc[key] = { value: chip.value, color: chip.color, count: 0 };
    acc[key].count += 1;
    return acc;
  }, {});

  const stacks = Object.values(grouped)
    .sort((a, b) => b.value - a.value)
    .slice(0, 4);

  if (amount === 0) {
    return (
      <div className="flex items-center justify-center gap-1">
        <div className="text-xs text-muted-foreground">—</div>
      </div>
    );
  }

  return (
    <div className="flex items-end gap-2">
      <div className="flex min-h-[68px] items-end gap-1.5">
        {stacks.map((stack, stackIndex) => {
          const visibleCount = Math.min(stack.count, 7);
          const stackHeight = visibleCount * config.layer + config.chip;

          return (
            <div
              key={`${stack.value}-${stackIndex}`}
              className="relative"
              style={{ width: config.chip, height: stackHeight }}
              title={`${stack.count} x ${stack.value}`}
            >
              {Array.from({ length: visibleCount }).map((_, idx) => {
                const bottom = idx * config.layer;
                const stripe = "repeating-conic-gradient(from 0deg, #ffffff 0deg 16deg, transparent 16deg 44deg)";
                return (
                  <div
                    key={`${stack.value}-${idx}`}
                    className="absolute left-0 rounded-full border border-black/35"
                    style={{
                      width: config.chip,
                      height: config.chip,
                      bottom,
                      background: `radial-gradient(circle at 30% 28%, rgba(255,255,255,0.4), transparent 45%), ${stack.color}`,
                      boxShadow: "0 2px 4px rgba(0,0,0,0.45), inset 0 -2px 2px rgba(0,0,0,0.25)",
                      zIndex: 100 - idx,
                    }}
                  >
                    <div
                      className="absolute inset-[3px] rounded-full"
                      style={{
                        background: stripe,
                        opacity: 0.85,
                        mixBlendMode: "screen",
                      }}
                    />
                    <div className="absolute inset-[8px] rounded-full border border-white/70 bg-black/10" />
                  </div>
                );
              })}
            </div>
          );
        })}
      </div>

      <div className={`font-bold text-white/90 ${config.textSize}`}>
        {formatValue(amount, displayUnit, bigBlind)}
      </div>
    </div>
  );
}
