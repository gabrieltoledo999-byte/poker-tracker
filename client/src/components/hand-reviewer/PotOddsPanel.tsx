import { useMemo } from "react";
import { calculatePotOdds } from "@/utils/potOdds";
import type { ReplayStep } from "@/utils/actionNormalizer";

interface PotOddsPanelProps {
  currentStep: ReplayStep;
  previousStep: ReplayStep | null;
  bigBlind: number;
}

/**
 * Detecta se há um bet/raise pendente que o herói precisa responder.
 * Analisa o step atual: se a ação registrada é de um não-herói e é bet/raise.
 */
function getHeroCallAmount(step: ReplayStep): number {
  const hero = step.seats.find(s => s.isHero);
  if (!hero) return 0;
  if (!step.action) return 0;

  // A ação registrada neste step é do oponente (não do herói)?
  const isOpponentAction = step.actingPlayer !== hero.player && step.actingPlayer !== null;
  if (!isOpponentAction) return 0;

  const a = step.action;
  if (a.action === "bet" || a.action === "raise") {
    // toAmount é o valor total que o herói precisaria colocar
    return a.toAmount ?? a.amount ?? 0;
  }
  if (a.action === "all_in") {
    return a.toAmount ?? a.amount ?? 0;
  }
  // Big blind preflop — herói pode fazer raise ou call
  if (a.action === "post_big_blind") {
    return a.amount ?? 0;
  }
  return 0;
}

export function PotOddsPanel({ currentStep }: PotOddsPanelProps) {
  const hero = currentStep.seats.find(s => s.isHero);
  const heroIsActiveInHand = hero?.status === "active";
  const heroHole = hero?.holeCards ?? [];
  const board = currentStep.board ?? [];
  const pot = currentStep.pot;
  const callAmount = getHeroCallAmount(currentStep);

  const result = useMemo(
    () => calculatePotOdds(pot, callAmount, heroHole, board),
    [pot, callAmount, heroHole, board],
  );

  const onPostFlop = board.length >= 3;
  const hasHeroCards = heroHole.length === 2;
  const canAnalyzeBoard = onPostFlop && hasHeroCards && heroIsActiveInHand;
  const hasCallSpot = canAnalyzeBoard && callAmount > 0;
  const edgePct = result.handEquityPct - result.requiredEquityPct;
  const topDraws = result.draws.slice(0, 2);

  if (!heroIsActiveInHand) return null;

  return (
    <div className="rounded-xl border border-white/10 bg-slate-950/80 backdrop-blur-sm p-3 text-[11px] space-y-2 min-w-[200px]">
      <div className="font-semibold uppercase tracking-wider text-cyan-300 text-[10px]">
        Pot Odds
      </div>

      {!canAnalyzeBoard ? (
        <div className="rounded-md border border-white/10 bg-white/5 px-2 py-1.5 text-[10px] text-white/60">
          Aguardando flop para calcular percentual.
        </div>
      ) : (
        <>
          <div className="grid grid-cols-2 gap-x-3 gap-y-1">
            <span className="text-white/55">Pot odds (%)</span>
            <span className="text-right font-bold text-cyan-200">
              {hasCallSpot ? `${result.requiredEquityPct.toFixed(1)}%` : "--"}
            </span>
            <span className="text-white/55">Sua equity</span>
            <span className="text-right font-semibold text-white">~{result.handEquityPct.toFixed(1)}%</span>
            <span className="text-white/55">Vantagem</span>
            <span className={`text-right font-semibold ${hasCallSpot ? (edgePct >= 0 ? "text-emerald-300" : "text-red-300") : "text-white/60"}`}>
              {hasCallSpot ? `${edgePct >= 0 ? "+" : ""}${edgePct.toFixed(1)} pp` : "Sem spot"}
            </span>
            <span className="text-white/55">Outs</span>
            <span className="text-right font-semibold text-cyan-200">{result.totalOuts}</span>
          </div>

          {topDraws.length > 0 && (
            <div className="border-t border-white/10 pt-2 space-y-1">
              {topDraws.map((draw, i) => (
                <div key={i} className="flex items-center justify-between gap-2 text-[10px]">
                  <span className="text-white/65 truncate">{draw.label}</span>
                  <span className="font-bold text-cyan-300">{draw.outs} outs</span>
                </div>
              ))}
            </div>
          )}

          {hasCallSpot && (
            <div className={`rounded-md px-2 py-1 text-center font-bold text-[10px] ${
              edgePct >= 0
                ? "bg-emerald-500/20 text-emerald-300 border border-emerald-500/30"
                : "bg-red-500/20 text-red-300 border border-red-500/30"
            }`}>
              {edgePct >= 0 ? "Call favoravel" : "Call desfavoravel"}
            </div>
          )}
        </>
      )}
    </div>
  );
}
