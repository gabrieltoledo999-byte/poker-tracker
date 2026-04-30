import { useMemo } from "react";
import { calculatePotOdds } from "@/utils/potOdds";
import type { ReplayStep } from "@/utils/actionNormalizer";

interface PotOddsPanelProps {
  currentStep: ReplayStep;
  /** Índice do step atual para detectar quando há call pendente */
  bigBlind: number;
}

/** Retorna o valor de call que o herói enfrenta no step atual (0 se não há call) */
function getHeroCallAmount(step: ReplayStep): number {
  const hero = step.seats.find(s => s.isHero);
  if (!hero) return 0;

  // Se a última ação do step NÃO é do herói e é bet/raise → herói tem call pendente
  const lastAction = step.action;
  if (!lastAction) return 0;
  if (step.actingPlayer === hero.player) return 0; // herói acabou de agir

  // O amount do bet/raise é o custo máximo da call
  if (
    lastAction.action === "bet" ||
    lastAction.action === "raise" ||
    lastAction.action === "all_in"
  ) {
    return lastAction.toAmount ?? lastAction.amount ?? 0;
  }
  if (lastAction.action === "post_big_blind") {
    return lastAction.amount ?? 0;
  }
  return 0;
}

export function PotOddsPanel({ currentStep, bigBlind }: PotOddsPanelProps) {
  const hero = currentStep.seats.find(s => s.isHero);
  const heroHole = hero?.holeCards ?? [];
  const board = currentStep.board ?? [];
  const pot = currentStep.pot;
  const callAmount = getHeroCallAmount(currentStep);

  const result = useMemo(
    () => calculatePotOdds(pot, callAmount, heroHole, board),
    [pot, callAmount, heroHole, board],
  );

  // Só mostra no flop/turn/river com cartas disponíveis e call ativa
  const showFull = result.canCalculate && callAmount > 0;
  const showPassive = result.canCalculate && callAmount === 0 && board.length >= 3;

  if (!showFull && !showPassive) return null;

  const bbLabel = bigBlind > 0
    ? (v: number) => `${(v / bigBlind).toFixed(1)}bb`
    : (v: number) => String(v);

  return (
    <div className="rounded-xl border border-white/10 bg-slate-950/80 backdrop-blur-sm p-3 text-[11px] space-y-2 min-w-[200px]">
      {/* Header */}
      <div className="font-semibold uppercase tracking-wider text-cyan-300 text-[10px]">
        Pot Odds
      </div>

      {showFull && (
        <>
          {/* Call / Pot */}
          <div className="grid grid-cols-2 gap-x-3 gap-y-0.5">
            <span className="text-white/55">Call</span>
            <span className="font-semibold text-white text-right">{bbLabel(result.callAmount)}</span>
            <span className="text-white/55">Pot total</span>
            <span className="font-semibold text-white text-right">{bbLabel(result.totalPot)}</span>
            <span className="text-white/55">Ratio</span>
            <span className="font-semibold text-cyan-200 text-right">{result.oddsRatio}</span>
            <span className="text-white/55">Equity mín.</span>
            <span className="font-semibold text-yellow-300 text-right">{result.requiredEquityPct.toFixed(1)}%</span>
          </div>

          <div className="border-t border-white/10 pt-2 space-y-1">
            {/* Equity bar */}
            {result.totalOuts > 0 && (
              <>
                <div className="flex items-center justify-between mb-1">
                  <span className="text-white/55">Sua equity (rule 2/4)</span>
                  <span className={`font-bold ${result.isValueCall ? "text-emerald-400" : "text-red-400"}`}>
                    ~{result.handEquityPct}%
                  </span>
                </div>
                <div className="relative h-2 w-full rounded-full bg-white/10">
                  {/* Required equity threshold */}
                  <div
                    className="absolute top-0 bottom-0 w-0.5 bg-yellow-400 z-10"
                    style={{ left: `${Math.min(result.requiredEquityPct, 100)}%` }}
                  />
                  {/* Hand equity fill */}
                  <div
                    className={`h-2 rounded-full transition-all ${result.isValueCall ? "bg-emerald-500" : "bg-red-500"}`}
                    style={{ width: `${Math.min(result.handEquityPct, 100)}%` }}
                  />
                </div>
                <div className="text-[9px] text-white/35 flex justify-between mt-0.5">
                  <span>0%</span>
                  <span className="text-yellow-400/70">mín: {result.requiredEquityPct.toFixed(0)}%</span>
                  <span>100%</span>
                </div>
              </>
            )}

            {/* Verdict */}
            <div className={`mt-1.5 rounded-md px-2 py-1 text-center font-bold text-[10px] ${
              result.isValueCall
                ? "bg-emerald-500/20 text-emerald-300 border border-emerald-500/30"
                : result.totalOuts === 0
                  ? "bg-white/5 text-white/40 border border-white/10"
                  : "bg-red-500/20 text-red-300 border border-red-500/30"
            }`}>
              {result.isValueCall
                ? "✓ Call tem valor (EV+)"
                : result.totalOuts === 0
                  ? "Sem draws detectados"
                  : "✗ Call sem valor (EV-)"}
            </div>
          </div>
        </>
      )}

      {/* Draws */}
      {result.draws.length > 0 && (
        <div className="border-t border-white/10 pt-2 space-y-1">
          <div className="text-[9px] uppercase tracking-wider text-white/40 mb-1">Draws detectados</div>
          {result.draws.map((draw, i) => (
            <div key={i} className="flex items-center justify-between gap-2">
              <span className="text-white/70">{draw.label}</span>
              <span className="font-bold text-cyan-300">{draw.outs} outs</span>
            </div>
          ))}
          <div className="flex items-center justify-between border-t border-white/10 pt-1 mt-1">
            <span className="text-white/55">Total</span>
            <span className="font-bold text-cyan-200">{result.totalOuts} outs</span>
          </div>
          {result.streetsLeft > 0 && (
            <div className="text-[9px] text-white/35 text-right">
              Rule of {result.streetsLeft === 2 ? "4" : "2"} — {result.streetsLeft} rua{result.streetsLeft > 1 ? "s" : ""} restante{result.streetsLeft > 1 ? "s" : ""}
            </div>
          )}
        </div>
      )}

      {/* Passive mode (no call, just show outs/draws if any) */}
      {showPassive && !showFull && result.draws.length > 0 && (
        <div className="space-y-1">
          <div className="text-[9px] uppercase tracking-wider text-white/40 mb-1">Seus draws</div>
          {result.draws.map((draw, i) => (
            <div key={i} className="flex items-center justify-between gap-2">
              <span className="text-white/70">{draw.label}</span>
              <span className="font-bold text-cyan-300">{draw.outs} outs</span>
            </div>
          ))}
          {result.streetsLeft > 0 && (
            <div className="text-[9px] text-white/35 text-right mt-1">
              Equity ~{result.handEquityPct}% (rule of {result.streetsLeft === 2 ? "4" : "2"})
            </div>
          )}
        </div>
      )}
    </div>
  );
}
