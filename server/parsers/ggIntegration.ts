import { parseGGHandHistory, GGHandData } from "./ggHandHistory";

/**
 * Detecta se o texto é uma hand history raw do GG
 */
export function isGGHandHistory(text: string): boolean {
  // Detecta padrões típicos de GG hand history
  return (
    /GGPoker\s+#\d+/i.test(text) || // Hand ID do GG
    /\*\*Hole Cards\*\*/i.test(text) || // Marcação de cards
    /\*\*(Flop|Turn|River|Preflop)\*\*/i.test(text) || // Street markers
    /Seat\s+\d+:/i.test(text) // Seat listings
  );
}

/**
 * Converte uma hand history do GG em dados de sessão
 */
export function ggHandHistoryToSessionData(
  rawText: string
): {
  buyIn: number;
  cashOut: number;
  stakes: string;
  notes: string;
  warnings: string[];
} | null {
  if (!isGGHandHistory(rawText)) return null;

  const parsed = parseGGHandHistory(rawText);
  if (!parsed) {
    return {
      buyIn: 0,
      cashOut: 0,
      stakes: "desconhecido",
      notes: "Hand history do GG não parseada corretamente",
      warnings: [
        "Falha ao extrair dados da hand history",
        "Herói não identificado",
        "Stakes ou stacks incorretos",
      ],
    };
  }

  // Calcular buy-in e cash-out
  const buyIn = parsed.heroStartStack || 0;
  const cashOut = parsed.heroFinalStack || 0;

  // Construir notas detalhadas
  const notes = `
GG Hand #${parsed.handId}
Herói: ${parsed.hero || "desconhecido"}
Posição: ${parsed.heroPosicao || "?"}
Cards: ${parsed.heroCards?.join("-") || "??"}
Stacks: ${(buyIn / 100).toFixed(2)} → ${(cashOut / 100).toFixed(2)}
Resultado: ${parsed.result}
Apostas:
${parsed.streets
  ?.map((street) => {
    const actions = street.actions
      ?.map((a) => `  ${a.player}: ${a.action}${a.amount ? ` $${(a.amount / 100).toFixed(2)}` : ""}`)
      .join("\n");
    return `  ${street.name.toUpperCase()}${street.cards ? ` [${street.cards}]` : ""}\n${actions}`;
  })
  .join("\n")}
Pot Final: $${(parsed.potSize / 100).toFixed(2)}
  `.trim();

  const warnings: string[] = [];

  // Validações
  if (!parsed.hero) {
    warnings.push("Herói não foi identificado corretamente");
  }
  if (buyIn === 0 || cashOut === 0) {
    warnings.push("Stacks iniciais ou finais não identificados");
  }
  if (!parsed.heroCards || parsed.heroCards.length === 0) {
    warnings.push("Cartas do herói não encontradas");
  }
  if (!parsed.streets || parsed.streets.length === 0) {
    warnings.push("Streets não parseadas corretamente");
  }

  return {
    buyIn,
    cashOut,
    stakes: parsed.stakes || "desconhecido",
    notes,
    warnings,
  };
}

/**
 * Valida qualidade do parse da hand history
 */
export function validateGGParse(data: GGHandData): string[] {
  const errors: string[] = [];

  if (!data.hero) errors.push("Herói não identificado");
  if (!data.heroCards || data.heroCards.length === 0) errors.push("Cartas do herói não encontradas");
  if (data.heroStartStack === 0) errors.push("Stack inicial não encontrado");
  if (data.heroFinalStack === 0) errors.push("Stack final não encontrado");
  if (!data.stakes) errors.push("Stakes não identificados");
  if (!data.streets || data.streets.length === 0) errors.push("Nenhuma street parseada");

  return errors;
}
