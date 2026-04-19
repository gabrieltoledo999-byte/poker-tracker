import type { ParsedPokerStarsHand } from "@/parser/pokerstarsParser";

export function TechnicalAnalysisPanel({ hand }: { hand: ParsedPokerStarsHand }) {
  const breakEven = hand.calculations.potOddsByStreet.length > 0
    ? hand.calculations.potOddsByStreet.map(item => ({
        ...item,
        breakEvenPct: item.amountToCall > 0 ? (item.amountToCall / (item.potBeforeCall + item.amountToCall)) * 100 : 0,
      }))
    : [];

  return (
    <section className="rounded-2xl border border-cyan-400/20 bg-cyan-500/5 p-4">
      <p className="mb-3 text-sm font-semibold text-cyan-700 dark:text-cyan-300">Cálculos técnicos</p>
      <div className="grid gap-2 text-sm md:grid-cols-2 xl:grid-cols-3">
        <div className="rounded-xl border border-cyan-400/25 px-3 py-2">Pote total: <strong>{hand.summary.totalPot}</strong></div>
        <div className="rounded-xl border border-cyan-400/25 px-3 py-2">Hero investiu: <strong>{hand.calculations.heroInvested}</strong></div>
        <div className="rounded-xl border border-cyan-400/25 px-3 py-2">Stack efetivo: <strong>{hand.calculations.effectiveStackStart}</strong></div>
        <div className="rounded-xl border border-cyan-400/25 px-3 py-2">SPR flop: <strong>{hand.calculations.sprFlop != null ? hand.calculations.sprFlop.toFixed(2) : "-"}</strong></div>
        <div className="rounded-xl border border-cyan-400/25 px-3 py-2">Sizing médio de aposta: <strong>{Math.round((hand.actions.filter(a => a.action === "bet" || a.action === "raise").reduce((sum, action) => sum + (action.toAmount ?? action.amount ?? 0), 0) / Math.max(hand.actions.filter(a => a.action === "bet" || a.action === "raise").length, 1)) || 0)}</strong></div>
        <div className="rounded-xl border border-cyan-400/25 px-3 py-2">Net estimado: <strong>{hand.calculations.heroNetEstimate >= 0 ? "+" : ""}{hand.calculations.heroNetEstimate}</strong></div>
      </div>

      <div className="mt-3 rounded-xl border border-cyan-400/25 px-3 py-2 text-sm">
        <p className="mb-1 text-xs uppercase tracking-[0.2em] text-cyan-700 dark:text-cyan-300">Pot odds e break-even</p>
        {breakEven.length > 0 ? breakEven.map(item => (
          <p key={`${item.street}-${item.amountToCall}`}>
            {item.street.toUpperCase()}: call {item.amountToCall} para pote {item.potBeforeCall} | break-even {item.breakEvenPct.toFixed(1)}%
          </p>
        )) : (
          <p className="text-muted-foreground">Sem spots de call para cálculo de pot odds nesta mão.</p>
        )}
      </div>
    </section>
  );
}
