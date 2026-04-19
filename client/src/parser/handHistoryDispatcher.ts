import { parsePokerStarsTranscript, type ParsedPokerStarsTournament } from "@/parser/pokerstarsParser";
import { parseOtherPlatformHandHistory } from "@/parser/otherPlatformParser";
import { parseGgHandHistory } from "@/parser/ggHandParser";

export type HandHistoryPlatform = "POKERSTARS" | "OTHER_PLATFORM" | "UNKNOWN";
export type ParserSelection = "AUTO" | "POKERSTARS" | "GG";

interface ParseHandHistoryOptions {
  preferredPlatform?: ParserSelection;
}

export function detectHandHistoryPlatform(rawText: string): HandHistoryPlatform {
  const text = rawText ?? "";
  if (text.includes("PokerStars Hand #")) return "POKERSTARS";
  if (
    text.includes("Poker Hand #TM") ||
    text.includes("GGPoker Hand #") ||
    text.includes("Natural8 Hand #") ||
    text.includes("Tournament Director") ||
    text.includes("*** SUMMARY ***")
  ) {
    return "OTHER_PLATFORM";
  }
  return "UNKNOWN";
}

function withExtraWarnings(base: ParsedPokerStarsTournament, extraWarnings: string[]): ParsedPokerStarsTournament {
  if (extraWarnings.length === 0) return base;
  return {
    ...base,
    warnings: [...base.warnings, ...extraWarnings],
  };
}

function parseGgDirect(rawText: string): ParsedPokerStarsTournament {
  const hand = parseGgHandHistory(rawText);
  if (!hand) {
    return {
      hands: [],
      warnings: ["GG parser não conseguiu fazer parse do texto fornecido"],
      tournamentInfo: null,
      source: "GG",
    };
  }

  return {
    hands: [hand],
    warnings: ["Parser direto GG aplicado - sem camada de tradução"],
    tournamentInfo: null,
    source: "GG",
  };
}

export function parseHandHistoryTranscript(rawText: string, options: ParseHandHistoryOptions = {}): ParsedPokerStarsTournament {
  const preferredPlatform = options.preferredPlatform ?? "AUTO";

  if (preferredPlatform === "POKERSTARS") {
    const pokerStarsParsed = parsePokerStarsTranscript(rawText);
    if (pokerStarsParsed.hands.length > 0) return pokerStarsParsed;

    const ggParsed = parseOtherPlatformHandHistory(rawText);
    if (ggParsed.hands.length > 0) {
      return withExtraWarnings(ggParsed, ["Plataforma selecionada: PokerStars. Conteudo parece GG/alternativo; parser correspondente aplicado por fallback."]);
    }

    return withExtraWarnings(pokerStarsParsed, ["Plataforma selecionada: PokerStars, mas nenhuma mao valida foi encontrada."]);
  }

  if (preferredPlatform === "GG") {
    const ggParsed = parseOtherPlatformHandHistory(rawText);
    if (ggParsed.hands.length > 0) {
      return withExtraWarnings(ggParsed, ["Parser direto GG aplicado."]);
    }

    const pokerStarsParsed = parsePokerStarsTranscript(rawText);
    if (pokerStarsParsed.hands.length > 0) {
      return withExtraWarnings(pokerStarsParsed, ["Plataforma selecionada: GG. Conteudo parece PokerStars; parser correspondente aplicado por fallback."]);
    }

    return withExtraWarnings(ggParsed, ["Plataforma selecionada: GG, mas nenhuma mao valida foi encontrada."]);
  }

  const platform = detectHandHistoryPlatform(rawText);

  if (platform === "POKERSTARS") {
    return parsePokerStarsTranscript(rawText);
  }

  if (platform === "OTHER_PLATFORM") {
    const otherPlatformParsed = parseOtherPlatformHandHistory(rawText);
    if (otherPlatformParsed.hands.length > 0) {
      return withExtraWarnings(otherPlatformParsed, ["Parser direto GG/alternativo aplicado."]);
    }

    const pokerStarsFallback = parsePokerStarsTranscript(rawText);
    if (pokerStarsFallback.hands.length > 0) {
      return withExtraWarnings(pokerStarsFallback, ["Parser PokerStars aplicado como fallback para formato alternativo."]);
    }

    return otherPlatformParsed;
  }

  const current = parsePokerStarsTranscript(rawText);
  if (current.hands.length > 0) return current;

  const other = parseOtherPlatformHandHistory(rawText);
  if (other.hands.length > 0) {
    return withExtraWarnings(other, ["Formato nao identificado com certeza; parser alternativo aplicado por fallback."]);
  }

  return withExtraWarnings(current, ["Formato de hand history desconhecido. Fallback para parser atual sem resultados validos."]);
}
