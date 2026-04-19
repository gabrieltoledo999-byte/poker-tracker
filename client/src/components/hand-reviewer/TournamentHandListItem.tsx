import type { DisplayUnit } from "@/utils/displayUnit";
import { formatBlindLevel } from "@/utils/displayUnit";

function getCardStyle(card: string) {
  const clean = card.trim().toUpperCase();
  if (clean.length < 2) return { rank: "?", suit: "?", isRed: false };
  const suit = clean[clean.length - 1];
  const suitSymbol: Record<string, string> = { H: "♥", D: "♦", S: "♠", C: "♣" };
  let rank = clean.slice(0, -1);
  if (rank === "10") rank = "T";
  const isRed = suit === "H" || suit === "D";
  return { rank, suit: suitSymbol[suit] ?? suit, isRed };
}

export function TournamentHandListItem(props: {
  handNumber: number;
  heroCards: [string, string];
  smallBlind: number;
  bigBlind: number;
  heroPosition?: string;
  heroResult?: "won" | "lost" | "folded";
  isSelected: boolean;
  onClick: () => void;
  displayUnit: DisplayUnit;
}) {
  const c1 = getCardStyle(props.heroCards?.[0] ?? "?");
  const c2 = getCardStyle(props.heroCards?.[1] ?? "?");

  const resultColor =
    props.heroResult === "won" ? "bg-emerald-500" :
    props.heroResult === "lost" ? "bg-red-600" :
    props.heroResult === "folded" ? "bg-slate-500" : "bg-white/20";

  return (
    <button
      onClick={props.onClick}
      className={`w-full text-left rounded-md transition ${
        props.isSelected
          ? "bg-cyan-500/20 border border-cyan-400/50"
          : "border border-transparent hover:bg-white/5"
      }`}
    >
      <div className="flex items-center gap-1.5 px-1.5 py-1.5">
        {/* Result dot */}
        <div className={`h-2 w-2 shrink-0 rounded-full ${resultColor}`} />
        {/* Mini cards */}
        <span className={`inline-flex h-5 w-4 items-center justify-center rounded text-[10px] font-black leading-none bg-white ${c1.isRed ? "text-red-600" : "text-slate-900"}`}>
          {c1.rank}
        </span>
        <span className={`inline-flex h-5 w-4 items-center justify-center rounded text-[10px] font-black leading-none bg-white ${c2.isRed ? "text-red-600" : "text-slate-900"}`}>
          {c2.rank}
        </span>
        {/* Suit symbols */}
        <span className={`text-[10px] font-bold ${c1.isRed ? "text-red-400" : "text-slate-300"}`}>{c1.suit}</span>
        <span className={`text-[10px] font-bold ${c2.isRed ? "text-red-400" : "text-slate-300"}`}>{c2.suit}</span>
        {/* Hand number */}
        <span className={`shrink-0 text-[11px] font-bold ${props.isSelected ? "text-cyan-200" : "text-white/80"}`}>
          #{props.handNumber}
        </span>
        {/* Position */}
        {props.heroPosition && (
          <span className="shrink-0 rounded bg-white/10 px-1 py-0.5 text-[9px] font-bold text-cyan-200">
            {props.heroPosition}
          </span>
        )}
        {/* Blinds */}
        <span className="ml-auto shrink-0 text-[9px] text-white/50">
          {formatBlindLevel(props.smallBlind, props.bigBlind, props.displayUnit)}
        </span>
      </div>
    </button>
  );
}
