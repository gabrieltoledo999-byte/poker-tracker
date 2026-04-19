import { Bot } from "lucide-react";
import type { ParsedPokerStarsHand } from "@/parser/pokerstarsParser";

export function AIReviewPanel({ hand }: { hand: ParsedPokerStarsHand }) {
  const hasPossibleError = hand.summary.heroResult === "lost" && hand.summary.showdown;
  const alternative = hasPossibleError
    ? "Alternativa sugerida: avaliar linhas de controle de pote em streets finais contra ranges fortes no showdown."
    : "Alternativa sugerida: manter pressão em nós onde os ranges adversários ficam capped após checks sequenciais.";

  return (
    <section className="rounded-2xl border border-emerald-400/25 bg-emerald-500/8 p-4 text-emerald-950 dark:text-emerald-100">
      <p className="mb-2 flex items-center gap-2 text-sm font-semibold">
        <Bot className="h-4 w-4" />
        Análise da IA
      </p>
      <p className="text-sm">{hand.aiReview}</p>
      <p className="mt-2 text-sm"><strong>Linha do hero:</strong> {hand.summary.heroResult === "won" ? "coerente com captura de valor/fold equity" : "pressionada em street final; revisar thresholds"}.</p>
      <p className="mt-1 text-sm"><strong>{hasPossibleError ? "Possível erro:" : "Confirmação:"}</strong> {hasPossibleError ? "valor de showdown adversário superou a linha do hero." : "linha aceitável para o contexto desta mão."}</p>
      <p className="mt-1 text-sm">{alternative}</p>
    </section>
  );
}
