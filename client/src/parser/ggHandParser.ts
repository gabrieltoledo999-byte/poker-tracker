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

const POSITION_LABELS: Record<number, string[]> = {
  2: ["BTN", "BB"],
  3: ["BTN", "SB", "BB"],
  4: ["BTN", "SB", "BB", "UTG"],
  5: ["BTN", "SB", "BB", "UTG", "CO"],
  6: ["BTN", "SB", "BB", "UTG", "HJ", "CO"],
  7: ["BTN", "SB", "BB", "UTG", "MP", "HJ", "CO"],
  8: ["BTN", "SB", "BB", "UTG", "UTG+1", "MP", "HJ", "CO"],
  9: ["BTN", "SB", "BB", "UTG", "UTG+1", "MP", "MP+1", "HJ", "CO"],
};

function computePositionMap(
  seats: Array<{ seatNumber: number }>,
  buttonSeat: number,
  maxPlayers: number,
): Map<number, string> {
  const ordered = [...seats]
    .sort((a, b) => {
      const da = (a.seatNumber - buttonSeat + maxPlayers) % maxPlayers;
      const db = (b.seatNumber - buttonSeat + maxPlayers) % maxPlayers;
      return da - db;
    })
    .map(s => s.seatNumber);

  const labels = POSITION_LABELS[Math.min(Math.max(ordered.length, 2), 9)] ?? POSITION_LABELS[9];
  const map = new Map<number, string>();
  ordered.forEach((seatNumber, index) => {
    map.set(seatNumber, labels[index] ?? `P${index + 1}`);
  });
  return map;
}

function calculateGgHandMetrics(hand: {
  actions: PokerAction[];
  heroName: string;
  heroStartingStack: number;
  seats: Array<{ playerName: string; startingStack: number }>;
  summaryHeroCollected: number;
}) {
  const potByStreet: Record<"preflop" | "flop" | "turn" | "river", number> = {
    preflop: 0, flop: 0, turn: 0, river: 0,
  };

  let pot = 0;
  let heroInvested = 0;
  let currentStreet: "preflop" | "flop" | "turn" | "river" = "preflop";
  let streetContrib = new Map<string, number>();
  const heroLower = hand.heroName.toLowerCase().trim();

  for (const action of hand.actions) {
    const streetKey = action.street === "preflop" || action.street === "flop" || action.street === "turn" || action.street === "river" ? action.street : null;
    if (!streetKey) continue;

    if (streetKey !== currentStreet) {
      currentStreet = streetKey;
      streetContrib = new Map<string, number>();
      potByStreet[streetKey] = pot;
    }

    const playerKey = action.player.toLowerCase().trim();
    let delta = 0;

    if (
      action.action === "post_ante" ||
      action.action === "post_small_blind" ||
      action.action === "post_big_blind" ||
      action.action === "bet" ||
      action.action === "call"
    ) {
      delta = action.amount ?? 0;
      streetContrib.set(playerKey, (streetContrib.get(playerKey) ?? 0) + delta);
    } else if (action.action === "raise") {
      const target = action.toAmount ?? 0;
      const already = streetContrib.get(playerKey) ?? 0;
      delta = Math.max(target - already, 0);
      streetContrib.set(playerKey, target);
    } else if (action.action === "returned_uncalled_bet") {
      delta = -(action.amount ?? 0);
    }

    pot += delta;
    if (playerKey === heroLower && delta !== 0) {
      heroInvested = Math.max(heroInvested + delta, 0);
    }

    potByStreet[currentStreet] = pot;
  }

  const largestOpponent = hand.seats
    .filter(s => s.playerName.toLowerCase().trim() !== heroLower)
    .reduce((max, s) => Math.max(max, s.startingStack), 0);
  const effectiveStackStart = Math.min(hand.heroStartingStack || 0, largestOpponent || hand.heroStartingStack || 0);
  const heroNetEstimate = hand.summaryHeroCollected - heroInvested;
  const heroEndingStackEstimate = hand.heroStartingStack > 0 ? hand.heroStartingStack + heroNetEstimate : null;
  const sprFlop = potByStreet.flop > 0 ? effectiveStackStart / potByStreet.flop : null;

  return {
    potByStreet,
    heroInvested,
    effectiveStackStart,
    sprFlop,
    sprByStreet: { preflop: null, flop: sprFlop, turn: null, river: null },
    potOddsByStreet: [] as Array<{ street: PokerStreet; amountToCall: number; potBeforeCall: number; potOdds: number }>,
    heroNetEstimate,
    heroEndingStackEstimate,
  };
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
    if (seat) seats.push(seat);
  }

  // Assign positions using proper label map
  const positionMap = computePositionMap(seats, tableInfo.buttonSeat, tableInfo.maxPlayers);
  for (const seat of seats) {
    seat.position = positionMap.get(seat.seatNumber) ?? "";
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

  // Parse board cards from street markers
  const flopLine = lines.find(l => /\*\*\*\s*FLOP\s*\*\*\*/i.test(l));
  const boardFlop = flopLine ? parseCards(flopLine.match(/\[([^\]]+)\]/)?.[0]) : [];
  const turnLine = lines.find(l => /\*\*\*\s*TURN\s*\*\*\*/i.test(l));
  const turnGroups = turnLine ? Array.from(turnLine.matchAll(/\[([^\]]+)\]/g)) : [];
  const boardTurn = turnGroups.length > 1 ? parseCards(turnGroups[1][0]) : [];
  const riverLine = lines.find(l => /\*\*\*\s*RIVER\s*\*\*\*/i.test(l));
  const riverGroups = riverLine ? Array.from(riverLine.matchAll(/\[([^\]]+)\]/g)) : [];
  const boardRiver = riverGroups.length > 1 ? parseCards(riverGroups[1][0]) : [];
  const boardFull = [...boardFlop, ...boardTurn, ...boardRiver];

  // Parse summary
  const summaryIndex = lines.findIndex(l => /\*\*\*\s*SUMMARY\s*\*\*\*/i.test(l));
  const summaryLines = summaryIndex >= 0 ? lines.slice(summaryIndex + 1) : [];
  const totalPotLine = summaryLines.find(l => /^Total pot\s+/i.test(l));
  const totalPot = totalPotLine ? toNumber(totalPotLine.match(/\$?([\d.]+)/)?.[1]) : 0;

  // Collect hero winnings from actions (more reliable than summary)
  const heroCollectedFromActions = actions
    .filter(a => a.player === heroName && a.action === "collect")
    .reduce((sum, a) => sum + (a.amount ?? 0), 0);

  // Fallback: check summary for collected amount
  const collectedLine = heroName
    ? summaryLines.find(l => new RegExp(`${heroName.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}.*collected`, "i").test(l))
    : null;
  const heroCollectedFromSummary = collectedLine ? toNumber(collectedLine.match(/\$?([\d.]+)/)?.[1]) : 0;
  const heroCollected = heroCollectedFromActions > 0 ? heroCollectedFromActions : heroCollectedFromSummary;

  const heroSeat = seats.find(s => s.playerName === heroName);

  // Detect showdown and uncalled bets
  const showdown = actions.some(a => a.action === "show") || lines.some(l => /\*\*\*\s*SHOWDOWN\s*\*\*\*/i.test(l));
  const uncalledReturned = actions
    .filter(a => a.action === "returned_uncalled_bet")
    .reduce((sum, a) => sum + (a.amount ?? 0), 0);

  const heroResult: "won" | "lost" | "folded" =
    heroCollected > 0
      ? "won"
      : actions.some(a => a.player === heroName && a.action === "fold")
        ? "folded"
        : "lost";

  const heroShowed = lines
    .slice(summaryIndex)
    .find(l => new RegExp(`${heroName.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}.*shows`, "i").test(l))
    ?.match(/\[([^\]]+)\]/)?.[1]
    ?.split(/\s+/) ?? [];

  // Villain cards from showdown
  const villainCards = actions
    .filter(a => a.action === "show" && a.player !== heroName)
    .map(a => {
      const cards = a.raw.match(/\[([^\]]+)\]/)?.[1]?.split(/\s+/).filter(Boolean) ?? [];
      return { player: a.player, cards };
    })
    .filter(v => v.cards.length > 0);

  // Use proper metric calculation from actions (not broken formula)
  const calculations = calculateGgHandMetrics({
    actions,
    heroName,
    heroStartingStack: heroSeat?.startingStack ?? 0,
    seats,
    summaryHeroCollected: heroCollected,
  });

  // Summary board fallback
  const summaryBoardLine = summaryLines.find(l => /^Board\s+\[/i.test(l));
  const summaryBoard = summaryBoardLine ? parseCards(summaryBoardLine.match(/\[([^\]]+)\]/)?.[0]) : [];
  const resolvedBoard = summaryBoard.length > 0 ? summaryBoard : boardFull;

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
      flop: boardFlop,
      turn: boardTurn,
      river: boardRiver,
      full: resolvedBoard,
    },
    summary: {
      totalPot,
      rake: 0,
      heroResult,
      heroCollected,
      heroShowed: heroShowed as string[],
      villainCards,
      eliminationPosition: (() => {
        const elimRegex = /finished the tournament in (\d+)(?:st|nd|rd|th) place/i;
        const heroElimLine = lines.find(l => new RegExp(`${heroName.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}\\s+finished the tournament in\\s+\\d+`, "i").test(l));
        const elimMatch = heroElimLine?.match(elimRegex) ?? lines.find(l => elimRegex.test(l))?.match(elimRegex);
        return elimMatch ? Number(elimMatch[1]) : null;
      })(),
      handEndType: showdown ? "showdown" : "fold",
      uncalledReturned,
      showdown,
    },
    calculations,
    aiReview: "",
    rawHand: rawText,
  };
}
