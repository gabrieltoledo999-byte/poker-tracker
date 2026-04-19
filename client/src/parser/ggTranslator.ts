export interface GgTranslationResult {
  translatedText: string;
  warnings: string[];
  translatorApplied: boolean;
}

const GG_HAND_START_REGEX = /^(?:Poker Hand #|GGPoker Hand #|Natural8 Hand #)/i;

function stripMarkdownCodeFences(input: string): string {
  return input.replace(/^```[a-zA-Z0-9_-]*\s*/gm, "").replace(/```$/gm, "");
}

function normalizeWhitespace(input: string): string {
  return input
    .replace(/\u00A0/g, " ")
    .replace(/\r\n/g, "\n")
    .replace(/\r/g, "\n");
}

function toRoman(value: number): string {
  if (!Number.isFinite(value) || value <= 0) return "";

  const numerals: Array<[number, string]> = [
    [1000, "M"],
    [900, "CM"],
    [500, "D"],
    [400, "CD"],
    [100, "C"],
    [90, "XC"],
    [50, "L"],
    [40, "XL"],
    [10, "X"],
    [9, "IX"],
    [5, "V"],
    [4, "IV"],
    [1, "I"],
  ];

  let remaining = Math.trunc(value);
  let result = "";

  for (const [amount, symbol] of numerals) {
    while (remaining >= amount) {
      result += symbol;
      remaining -= amount;
    }
  }

  return result;
}

function removeNumericCommas(input: string): string {
  return input.replace(/(?<=\d),(?=\d)/g, "");
}

function splitGgBlocks(rawText: string): string[] {
  const lines = rawText.split("\n");
  const blocks: string[] = [];
  let currentBlock: string[] = [];

  for (const line of lines) {
    if (GG_HAND_START_REGEX.test(line) && currentBlock.length > 0) {
      blocks.push(currentBlock.join("\n").trim());
      currentBlock = [line];
      continue;
    }

    currentBlock.push(line);
  }

  if (currentBlock.length > 0) {
    blocks.push(currentBlock.join("\n").trim());
  }

  return blocks.filter(Boolean);
}

function translateHeaderLine(line: string): string {
  const normalized = removeNumericCommas(line);
  const match = normalized.match(/^(?:Poker Hand|GGPoker Hand|Natural8 Hand) #([A-Z0-9]+): Tournament #(\d+),\s*(.+?)\s+-\s+Level(\d+)\((\d+)\/(\d+)\((\d+)\)\)\s+-\s+(\d{4}\/\d{2}\/\d{2}\s+\d{2}:\d{2}:\d{2})(?:\s+([A-Z]{2,5}))?$/i);

  if (!match) {
    return normalized.replace(/^Poker Hand #/i, "PokerStars Hand #");
  }

  const [, handId, tournamentId, rawGameSegment, levelNumber, smallBlind, bigBlind, _ante, dateTime, timezoneRaw] = match;
  const timezone = timezoneRaw ?? "GMT";
  const gameSegment = /\bUSD\b/i.test(rawGameSegment)
    ? rawGameSegment
    : rawGameSegment.replace(/(\$\d+(?:\.\d+)?)(\s+Hold'em)/i, "$1 USD$2");

  return `PokerStars Hand #${handId}: Tournament #${tournamentId}, ${gameSegment} - Level ${toRoman(Number(levelNumber))} (${smallBlind}/${bigBlind}) - ${dateTime} ${timezone}`;
}

function translateSummaryLine(line: string): string {
  const normalized = removeNumericCommas(line);
  const totalPot = normalized.match(/Total pot\s+([^|]+)/i)?.[1]?.trim() ?? "0";
  const rake = normalized.match(/Rake\s+([^|]+)/i)?.[1]?.trim() ?? "0";
  return `Total pot ${totalPot} | Rake ${rake}`;
}

function translateLine(line: string): string {
  if (!line.trim()) return "";
  if (GG_HAND_START_REGEX.test(line)) return translateHeaderLine(line);
  if (/^\*\*\*\s*SHOWDOWN\s*\*\*\*/i.test(line)) return "*** SHOW DOWN ***";
  if (/^Total pot\s+/i.test(line)) return translateSummaryLine(line);
  
  // ─ Convert GG action format to PokerStars format
  // Remove $ symbols from player actions: "Player: bets $50" -> "Player: bets 50"
  let normalized = removeNumericCommas(line);
  
  // Convert action lines with $ currency
  // Pattern: "PlayerName: action_type $amount" -> "PlayerName: action_type amount"
  normalized = normalized.replace(/:\s*(bets?|calls?|raises?|folds?|checks?)\s*\$(\d+(?:\.\d+)?)/gi, 
    ": $1 $2");
  
  // Convert "raises to" format: "raises $50 to $100" -> "raises 50 to 100"
  normalized = normalized.replace(/raises\s*\$(\d+(?:\.\d+)?)\s+to\s+\$(\d+(?:\.\d+)?)/gi,
    "raises $1 to $2");
  
  // Remove $ from remaining currency amounts in actions
  normalized = normalized.replace(/\$(\d+(?:\.\d+)?)/g, "$1");
  
  return normalized;
}

function filterHoleCardLines(lines: string[]): string[] {
  const output: string[] = [];
  let inHoleCards = false;

  for (const line of lines) {
    if (/^\*\*\*\s*HOLE CARDS\s*\*\*\*/i.test(line)) {
      inHoleCards = true;
      output.push(line);
      continue;
    }

    if (inHoleCards && /^\*\*\*/.test(line) && !/^\*\*\*\s*HOLE CARDS\s*\*\*\*/i.test(line)) {
      inHoleCards = false;
    }

    if (inHoleCards && /^Dealt to /i.test(line) && !/\[[^\]]+\]/.test(line)) {
      continue;
    }

    output.push(line);
  }

  return output;
}

export function translateGgToPokerStars(rawText: string): GgTranslationResult {
  const normalized = normalizeWhitespace(stripMarkdownCodeFences(rawText.trim()));
  if (!normalized) {
    return { translatedText: "", warnings: [], translatorApplied: false };
  }

  const blocks = splitGgBlocks(normalized);
  if (blocks.length === 0) {
    return { translatedText: normalized, warnings: [], translatorApplied: false };
  }

  const tournamentId = normalized.match(/Tournament #(\d+)/i)?.[1] ?? "";
  const heroName = normalized.match(/Dealt to\s+(.+?)\s+\[[^\]]+\]/i)?.[1] ?? "Hero";

  const translatedBlocks = blocks.map((block, index) => {
    const filteredLines = filterHoleCardLines(block.split("\n").map(line => line.trimEnd()));
    const translatedLines = filteredLines.map(translateLine);
    return [`*********** # ${index + 1} **************`, ...translatedLines].join("\n").trim();
  });

  return {
    translatedText: [`Transcript for tournament #${tournamentId} requested by ${heroName}`, "", ...translatedBlocks].join("\n").trim(),
    warnings: ["Tradutor GG -> PokerStars aplicado antes do parser principal."],
    translatorApplied: true,
  };
}

export function preprocessGgHandHistory(rawText: string): GgTranslationResult {
  const trimmed = rawText.trim();
  if (!trimmed) {
    return {
      translatedText: "",
      warnings: [],
      translatorApplied: false,
    };
  }

  return translateGgToPokerStars(trimmed);
}