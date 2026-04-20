import { Badge } from "@/components/ui/badge";
import type { ReplaySeatState } from "@/utils/actionNormalizer";
import { formatValue, type DisplayUnit } from "@/utils/displayUnit";

function getPositionBadgeClass(position: string): string {
  if (position === "BTN") {
    return "h-4 border-amber-300/70 bg-amber-200/25 px-1 text-[10px] text-amber-100";
  }
  if (position === "SB") {
    return "h-4 border-sky-300/70 bg-sky-400/20 px-1 text-[10px] text-sky-100";
  }
  if (position === "BB") {
    return "h-4 border-emerald-300/70 bg-emerald-400/20 px-1 text-[10px] text-emerald-100";
  }

  const earlyPositions = new Set(["UTG", "EP"]);
  if (earlyPositions.has(position)) {
    return "h-4 border-rose-300/70 bg-rose-400/20 px-1 text-[10px] text-rose-100";
  }

  const middlePositions = new Set(["UTG+1", "UTG+2", "MP", "MP1", "MP2", "LJ", "HJ"]);
  if (middlePositions.has(position)) {
    return "h-4 border-indigo-300/70 bg-indigo-400/20 px-1 text-[10px] text-indigo-100";
  }

  if (position === "CO") {
    return "h-4 border-fuchsia-300/70 bg-fuchsia-400/20 px-1 text-[10px] text-fuchsia-100";
  }

  return "h-4 border-white/25 bg-white/10 px-1 text-[10px] text-white/90";
}

export function PlayerSeat(props: {
  seat: ReplaySeatState;
  isActing: boolean;
  isSelected: boolean;
  displayUnit: DisplayUnit;
  bigBlind: number;
  onClick: () => void;
}) {
  const { seat } = props;
  const heroShowedDown = seat.isHero && seat.revealedCards.length > 0;

  const tone = seat.status === "folded"
    ? "border-white/15 bg-slate-900/75 text-zinc-300"
    : seat.status === "all-in"
      ? "border-amber-400/40 bg-amber-500/12 text-amber-50"
      : seat.isHero
        ? "border-cyan-400/45 bg-cyan-500/14 text-cyan-50"
        : "border-white/15 bg-slate-950/78 text-white";

  return (
    <button
      onClick={props.onClick}
      className={`w-[122px] sm:w-[172px] overflow-visible rounded-xl sm:rounded-2xl border px-2 py-1.5 sm:px-3 sm:py-2.5 text-left transition ${tone} ${props.isSelected ? "ring-2 ring-cyan-400/40" : ""} ${props.isActing ? "scale-[1.02] shadow-[0_0_24px_rgba(34,211,238,0.25)]" : ""}`}
    >
      <div className="mb-1 flex items-center gap-1">
        {seat.position ? (
          <Badge variant="outline" className={getPositionBadgeClass(seat.position)}>
            {seat.position}
          </Badge>
        ) : null}
      </div>
      <p className="truncate text-[11px] sm:text-base font-bold">{seat.name}</p>
      <div className="mt-1 inline-flex max-w-full items-center rounded-md border border-cyan-200/45 bg-cyan-300/16 px-1.5 py-0.5 sm:px-2 shadow-[0_0_14px_rgba(34,211,238,0.22)]">
        <p className="truncate text-[10px] sm:text-sm font-extrabold tracking-wide text-cyan-50">{formatValue(seat.stackApprox, props.displayUnit, props.bigBlind)}</p>
      </div>

      {heroShowedDown && (
        <div className="mt-2 flex items-center gap-1">
          <Badge variant="outline" className="border-cyan-300/50 bg-cyan-400/15 text-cyan-100 text-xs">
            Mostrou
          </Badge>
        </div>
      )}
    </button>
  );
}
