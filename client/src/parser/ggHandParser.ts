/**
 * Direct GG Poker hand history parser (no translation layer)
 * Reads GG format natively and produces ParsedPokerStarsHand
 * This approach preserves context that line-by-line translation loses
 */

import type {
  ParsedPokerStarsHand,
  PokerAction,
  PokerActionType,
  PokerStreet,
  PokerSeat,
  PokerHandSummary,
  PokerHandCalculations,
} from "@/parser/pokerstarsParser";

interface GgParseContext {
  lines: string[];
  handId: string;
  tournamentId: string;
  heroName: string;
  heroBigBlind: number;
  heroSmallBlind: number;
}

function toNumber(input: string | undefined): number {
  if (!input) return 0;
  const normalized = input.replace(/[^\d.,-]/g, "").replace(/,/g, "");
  const value = Number(normalized);
  return Number.isFinite(value) ? value : 0;
}

function parseCards(raw: string | undefined): string[] {
  if (!raw) return [];
  const matches = raw.match(/\[([^\]]+)\]/);
  if (!matches?.[1]) return [];
  return matches[1].split(/\s+/).filter(Boolean);
}

function normalizeGgStreet(line: string): PokerStreet | null {
  if (/\*\*\*\s*HOLE CARDS\s*\*\*\*/i.test(line)) return "preflop";
  if (/\*\*\*\s*FLOP\s*\*\*\*/i.test(line)) return "flop";
  if (/\*\*\*\s*TURN\s*\*\*\*/i.test(line)) return "turn";
  if (/\*\*\*\s*RIVER\s*\*\*\*/i.test(line)) return "river";
  if (/\*\*\*\s*SHOWDOWN\s*\*\*\*/i.test(line)) return "showdown";
  if (/\*\*\*\s*SUMMARY\s*\*\*\*/i.test(line)) return "summary";
  return null;
}

/**
 * Parse GG action line directly without translation
 * Reads: "PlayerName: action_type $amount" format
 */
function parseGgActionLine(line: string, street: PokerStreet): PokerAction | null {
  const trimmed = line.trim();

  // Post ante: "PlayerName: posts the ante $10"
  const postAnte = trimmed.match(/^(.+?):\s*posts\s+(?:the\s+)?ante\s*\$?([\d.]+)/i);
  if (postAnte) {
    return {
      street,
      player: postAnte[1].trim(),
      action: "post_ante",
      amount: toNumber(postAnte[2]),
      toAmount: null,
      isAllIn: false,
      raw: line,
    };
  }

  // Post small blind: "PlayerName: posts small blind $10"
  const postSB = trimmed.match(/^(.+?):\s*posts\s+small\s+blind\s*\$?([\d.]+)/i);
  if (postSB) {
    return {
      street,
      player: postSB[1].trim(),
      action: "post_small_blind",
      amount: toNumber(postSB[2]),
      toAmount: null,
      isAllIn: false,
      raw: line,
    };
  }

  // Post big blind: "PlayerName: posts big blind $10"
  const postBB = trimmed.match(/^(.+?):\s*posts\s+big\s+blind\s*\$?([\d.]+)/i);
  if (postBB) {
    return {
      street,
      player: postBB[1].trim(),
      action: "post_big_blind",
      amount: toNumber(postBB[2]),
      toAmount: null,
      isAllIn: false,
      raw: line,
    };
  }

  // Fold: "PlayerName: folds"
  const fold = trimmed.match(/^(.+?):\s*folds/i);
  if (fold) {
    return {
      street,
      player: fold[1].trim(),
      action: "fold",
      amount: null,
      toAmount: null,
      isAllIn: false,
      raw: line,
    };
  }

  // Check: "PlayerName: checks"
  const check = trimmed.match(/^(.+?):\s*checks/i);
  if (check) {
    return {
      street,
      player: check[1].trim(),
      action: "check",
      amount: null,
      toAmount: null,
      isAllIn: false,
      raw: line,
    };
  }

  // Call: "PlayerName: calls $100" or "PlayerName: calls $100 and is all in"
  const call = trimmed.match(/^(.+?):\s*calls\s*\$?([\d.]+)(?:\s+and\s+is\s+all\s+in)?/i);
  if (call) {
    return {
      street,
      player: call[1].trim(),
      action: "call",
      amount: toNumber(call[2]),
      toAmount: null,
      isAllIn: /all\s+in/i.test(line),
      raw: line,
    };
  }

  // Bet: "PlayerName: bets $100" or all-in
  const bet = trimmed.match(/^(.+?):\s*bets\s*\$?([\d.]+)(?:\s+and\s+is\s+all\s+in)?/i);
  if (bet) {
    return {
      street,
      player: bet[1].trim(),
      action: "bet",
      amount: toNumber(bet[2]),
      toAmount: null,
      isAllIn: /all\s+in/i.test(line),
      raw: line,
    };
  }

  // Raise: "PlayerName: raises $100 to $300" or just "raises $100"
  const raiseToFormat = trimmed.match(/^(.+?):\s*raises\s*\$?([\d.]+)\s+to\s*\$?([\d.]+)(?:\s+and\s+is\s+all\s+in)?/i);
  if (raiseToFormat) {
    return {
      street,
      player: raiseToFormat[1].trim(),
      action: "raise",
      amount: toNumber(raiseToFormat[2]),
      toAmount: toNumber(raiseToFormat[3]),
      isAllIn: /all\s+in/i.test(line),
      raw: line,
    };
  }

  const raiseFormat = trimmed.match(/^(.+?):\s*raises\s*\$?([\d.]+)(?:\s+and\s+is\s+all\s+in)?/i);
  if (raiseFormat) {
    return {
      street,
      player: raiseFormat[1].trim(),
      action: "raise",
      amount: toNumber(raiseFormat[2]),
      toAmount: toNumber(raiseFormat[2]),
      isAllIn: /all\s+in/i.test(line),
      raw: line,
    };
  }

  // Show: "PlayerName: shows [As Kd]"
  const show = trimmed.match(/^(.+?):\s*shows\s*\[([^\]]+)\]/i);
  if (show) {
    return {
      street,
      player: show[1].trim(),
      action: "show",
      amount: null,
      toAmount: null,
      isAllIn: false,
      raw: line,
    };
  }

  // Collect: "PlayerName collected $500"
  const collect = trimmed.match(/^(.+?):\s*collected\s*\$?([\d.]+)/i);
  if (collect) {
    return {
      street,
      player: collect[1].trim(),
      action: "collect",
      amount: toNumber(collect[2]),
      toAmount: null,
      isAllIn: false,
      raw: line,
    };
  }

  // Returned uncalled bet
  const returned = trimmed.match(/^Uncalled bet \(\$([\d.]+)\) returned to (.+)/i);
  if (returned) {
    return {
      street,
      player: returned[2].trim(),
      action: "returned_uncalled_bet",
      amount: toNumber(returned[1]),
      toAmount: null,
      isAllIn: false,
      raw: line,
    };
  }

  return null;
}

/**
 * Parse GG header line to extract tournament and game info
 * Pattern: GGPoker Hand #XXXXX: Tournament #YYYYY, $gamestring - Level I (10/20) - DateTime
 */
function parseGgHeader(
  line: string,
): {
  handId: string;
  tournamentId: string;
  smallBlind: number;
  bigBlind: number;
  ante: number;
  level: string;
  gameInfo: string;
  dateTime: string;
} | null {
  const match = line.match(
    /(?:Poker|GGPoker|Natural8)\s+Hand\s+#([A-Z0-9]+):\s+Tournament\s+#(\d+),\s*(.+?)\s+-\s+Level\s*([IVX\d]+)\s*\(([\d,]+)\/([\d,]+)(?:\(([\d,]+)\))?\)\s+-\s+(.+)/i,
  );
  if (!match) return null;

  return {
    handId: match[1],
    tournamentId: match[2],
    gameInfo: match[3],
    level: match[4],
    smallBlind: toNumber(match[5]),
    bigBlind: toNumber(match[6]),
    ante: match[7] ? toNumber(match[7]) : 0,
    dateTime: match[8],
  };
}

/**
 * Parse table and seat info: "Table 'TournamentXXXX' 6-max Seat #5 is the button"
 */
function parseTableLine(
  line: string,
): {
  tableName: string;
  maxPlayers: number;
  buttonSeat: number;
} | null {
  const match = line.match(/Table\s+'([^']+)'\s+(\d+)-max\s+Seat\s+#(\d+)\s+is\s+the\s+button/i);
  if (!match) return null;

  return {
    tableName: match[1],
    maxPlayers: toNumber(match[2]),
    buttonSeat: toNumber(match[3]),
  };
}

/**
 * Parse seat line: "Seat 1: PlayerName ($1000 in chips)"
 */
function parseSeatLine(
  line: string,
  allLines: string[],
): PokerSeat | null {
  const match = line.match(/Seat\s+(\d+):\s+(.+?)\s+\(\s*\$?([\d.]+)\s+in\s+chips\)(?:\s+is\s+sitting\s+out)?/i);
  if (!match) return null;

  const seatNumber = toNumber(match[1]);
  const playerName = match[2];
  const stack = toNumber(match[3]);

  // Check if sitting out
  const isSittingOut = /sitting\s+out/i.test(line);

  // Determine if hero (check "Dealt to" line)
  const isHero = allLines.some(l => new RegExp(`^Dealt to ${playerName}\\s+\\[`, "i").test(l));

  return {
    seatNumber,
    playerName,
    startingStack: stack,
    isSittingOut,
    isHero,
    position: "", // Will be determined by position calculation
  };
}

/**
 * Calculate positions based on button and seat number
 */
function calculatePosition(buttonSeat: number, seatNumber: number, maxPlayers: number): string {
  const offset = (seatNumber - buttonSeat + maxPlayers) % maxPlayers;
  if (maxPlayers === 2) {
    return offset === 0 ? "BTN" : "BB";
  }
  if (offset === 0) return "BTN";
  if (offset === 1) return "SB";
  if (offset === 2) return "BB";
  if (maxPlayers <= 4) {
    return offset === 3 ? "CO" : "UTG";
  }
  if (offset === 3) return "CO";
  if (offset === 4) return "HJ";
  if (offset === 5) return "UTG";
  return `UTG+${offset - 5}`;
}

export function parseGgHandHistory(rawText: string): ParsedPokerStarsHand | null {
  const lines = rawText.split("\n").map(l => l.trimEnd());

  // Find header
  const headerIndex = lines.findIndex(l => /(?:Poker|GGPoker|Natural8)\s+Hand\s+#/i.test(l));
  if (headerIndex < 0) return null;

  const headerInfo = parseGgHeader(lines[headerIndex]);
  if (!headerInfo) return null;

  // Find table line
  const tableIndex = lines.findIndex(l => /Table\s+'/i.test(l));
  const tableInfo = tableIndex >= 0 ? parseTableLine(lines[tableIndex]) : null;
  if (!tableInfo) return null;

  // Parse seats
  const seats: PokerSeat[] = [];
  for (let i = tableIndex + 1; i < lines.length; i++) {
    const line = lines[i];
    if (!/^Seat\s+\d+:/i.test(line)) continue;

    const seat = parseSeatLine(line, lines);
    if (seat) {
      seat.position = calculatePosition(tableInfo.buttonSeat, seat.seatNumber, tableInfo.maxPlayers);
      seats.push(seat);
    }
  }

  if (seats.length === 0) return null;

  // Find hero and dealt cards
  const dealtIndex = lines.findIndex(l => /^Dealt to\s+.+\s+\[/i.test(l));
  let heroName = "";
  let heroCards: string[] = [];
  if (dealtIndex >= 0) {
    const dealtMatch = lines[dealtIndex].match(/^Dealt to\s+(.+?)\s+\[([^\]]+)\]/i);
    if (dealtMatch) {
      heroName = dealtMatch[1];
      heroCards = dealtMatch[2].split(/\s+/).filter(Boolean);
    }
  }

  if (!heroName) {
    // Fallback: find the hero from seats
    const heroSeat = seats.find(s => s.isHero);
    heroName = heroSeat?.playerName ?? "Hero";
  }

  // Parse actions by street
  const actions: PokerAction[] = [];
  let currentStreet: PokerStreet = "preflop";

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    const street = normalizeGgStreet(line);
    if (street) {
      currentStreet = street;
      continue;
    }

    // Skip non-action lines
    if (!line.includes(":")) continue;
    if (/^Seat\s+\d+:|^Table\s+|^Dealt to\s+/.test(line)) continue;

    const action = parseGgActionLine(line, currentStreet);
    if (action) {
      actions.push(action);
    }
  }

  // Parse summary
  const summaryIndex = lines.findIndex(l => /\*\*\*\s*SUMMARY\s*\*\*\*/i.test(l));
  const totalPotLine = lines.slice(summaryIndex).find(l => /^Total pot\s+/i.test(l));
  const totalPot = totalPotLine ? toNumber(totalPotLine.match(/\$?([\d.]+)/)?.[1]) : 0;

  const collected = heroName
    ? lines
        .slice(summaryIndex)
        .find(l => new RegExp(`^${heroName}.*collected.*\\$`, "i").test(l))
    : null;
  const heroCollected = collected ? toNumber(collected.match(/\$?([\d.]+)/)?.[1]) : 0;

  const heroSeat = seats.find(s => s.playerName === heroName);
  const heroInvested = heroSeat
    ? heroSeat.startingStack + (heroCollected - heroSeat.startingStack)
    : heroCollected;

  const heroResult: "won" | "lost" | "folded" =
    heroCollected > 0
      ? "won"
      : actions.some(a => a.player === heroName && a.action === "fold")
        ? "folded"
        : "lost";

  const heroShowed = lines
    .slice(summaryIndex)
    .find(l => new RegExp(`^${heroName}.*shows`, "i").test(l))
    ?.match(/\[([^\]]+)\]/)?.[1]
    ?.split(/\s+/) ?? [];

  return {
    tournamentId: headerInfo.tournamentId,
    handId: headerInfo.handId,
    heroName,
    heroSeat: heroSeat?.seatNumber ?? null,
    heroPosition: heroSeat?.position ?? "",
    heroCards,
    tableName: tableInfo.tableName,
    maxPlayers: tableInfo.maxPlayers,
    buttonSeat: tableInfo.buttonSeat,
    level: headerInfo.level,
    smallBlind: headerInfo.smallBlind,
    bigBlind: headerInfo.bigBlind,
    ante: headerInfo.ante,
    buyIn: null,
    fee: null,
    currency: "USD",
    game: "Hold'em",
    format: "Tournament",
    dateTime: headerInfo.dateTime,
    timezone: "GMT",
    seats,
    actions,
    board: {
      flop: [],
      turn: [],
      river: [],
      full: [],
    },
    summary: {
      totalPot,
      rake: 0,
      heroResult,
      heroCollected,
      heroShowed: heroShowed as string[],
      villainCards: [],
      eliminationPosition: (() => {
        const elimRegex = /finished the tournament in (\d+)(?:st|nd|rd|th) place/i;
        const heroElimLine = lines.find(l => new RegExp(`${heroName.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}\\s+finished the tournament in\\s+\\d+`, "i").test(l));
        const elimMatch = heroElimLine?.match(elimRegex) ?? lines.find(l => elimRegex.test(l))?.match(elimRegex);
        return elimMatch ? Number(elimMatch[1]) : null;
      })(),
      handEndType: "showdown",
      uncalledReturned: 0,
      showdown: false,
    },
    calculations: {
      potByStreet: { preflop: 0, flop: 0, turn: 0, river: 0 },
      heroInvested: heroInvested,
      effectiveStackStart: heroSeat?.startingStack ?? 0,
      sprFlop: null,
      sprByStreet: { preflop: null, flop: null, turn: null, river: null },
      potOddsByStreet: [],
      heroNetEstimate: heroCollected - heroInvested,
      heroEndingStackEstimate: heroCollected,
    },
    aiReview: "",
    rawHand: rawText,
  };
}
