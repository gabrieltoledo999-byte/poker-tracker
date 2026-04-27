import type {
  ParsedPokerStarsHand,
  ParsedPokerStarsTournament,
  PokerAction,
  PokerStreet,
} from "@/parser/pokerstarsParser";

const MONEY_TOKEN = "[$€£]?[-+]?\\d[\\d.,]*";

function toNumber(input: string | undefined): number {
  if (!input) return 0;
  const normalized = input.replace(/[^\d.,-]/g, "").replace(/,/g, "");
  const value = Number(normalized);
  return Number.isFinite(value) ? value : 0;
}

function parseCards(raw: string | undefined): string[] {
  if (!raw) return [];
  return raw.split(/\s+/).map(card => card.trim()).filter(Boolean);
}

function normalizeName(value: string | null | undefined): string {
  return (value ?? "").trim().toLowerCase();
}

function calculateHandMetrics(hand: {
  actions: PokerAction[];
  heroName: string;
  heroStartingStack: number;
  seats: Array<{ playerName: string; startingStack: number }>;
  summaryHeroCollected: number;
}) {
  const potByStreet: Record<"preflop" | "flop" | "turn" | "river", number> = {
    preflop: 0,
    flop: 0,
    turn: 0,
    river: 0,
  };

  let pot = 0;
  let heroInvested = 0;
  let currentStreet: "preflop" | "flop" | "turn" | "river" = "preflop";
  let streetContrib = new Map<string, number>();

  const normalizedHero = normalizeName(hand.heroName);

  const normalizeStreetKey = (street: PokerStreet): "preflop" | "flop" | "turn" | "river" | null => {
    if (street === "preflop" || street === "flop" || street === "turn" || street === "river") return street;
    return null;
  };

  for (const action of hand.actions) {
    const streetKey = normalizeStreetKey(action.street);
    if (!streetKey) continue;

    if (streetKey !== currentStreet) {
      currentStreet = streetKey;
      streetContrib = new Map<string, number>();
      potByStreet[streetKey] = pot;
    }

    const normalizedPlayer = normalizeName(action.player);
    const streetPlayerKey = normalizedPlayer || action.player;
    let delta = 0;

    if (
      action.action === "post_ante" ||
      action.action === "post_small_blind" ||
      action.action === "post_big_blind" ||
      action.action === "bet" ||
      action.action === "call"
    ) {
      delta = action.amount ?? 0;
      streetContrib.set(streetPlayerKey, (streetContrib.get(streetPlayerKey) ?? 0) + delta);
    } else if (action.action === "raise") {
      const target = action.toAmount ?? 0;
      const already = streetContrib.get(streetPlayerKey) ?? 0;
      delta = Math.max(target - already, 0);
      streetContrib.set(streetPlayerKey, target);
    } else if (action.action === "returned_uncalled_bet") {
      delta = -(action.amount ?? 0);
    }

    pot += delta;

    if (normalizedPlayer === normalizedHero && delta !== 0) {
      heroInvested = Math.max(heroInvested + delta, 0);
    }

    if (currentStreet === "preflop") potByStreet.preflop = pot;
    if (currentStreet === "flop") potByStreet.flop = pot;
    if (currentStreet === "turn") potByStreet.turn = pot;
    if (currentStreet === "river") potByStreet.river = pot;
  }

  const largestOpponent = hand.seats
    .filter(seat => normalizeName(seat.playerName) !== normalizedHero)
    .reduce((max, seat) => Math.max(max, seat.startingStack), 0);

  const effectiveStackStart = Math.min(hand.heroStartingStack || 0, largestOpponent || hand.heroStartingStack || 0);
  const heroNetEstimate = hand.summaryHeroCollected - heroInvested;
  const heroEndingStackEstimate = hand.heroStartingStack > 0 ? hand.heroStartingStack + heroNetEstimate : null;

  return {
    potByStreet,
    heroInvested,
    effectiveStackStart,
    sprFlop: null,
    sprByStreet: { preflop: null, flop: null, turn: null, river: null },
    potOddsByStreet: [] as Array<{ street: PokerStreet; amountToCall: number; potBeforeCall: number; potOdds: number }>,
    heroNetEstimate,
    heroEndingStackEstimate,
  };
}

function normalizeStreet(line: string): PokerStreet | null {
  if (/\*\*\*\s*HOLE CARDS\s*\*\*\*/i.test(line)) return "preflop";
  if (/\*\*\*\s*FLOP\s*\*\*\*/i.test(line)) return "flop";
  if (/\*\*\*\s*TURN\s*\*\*\*/i.test(line)) return "turn";
  if (/\*\*\*\s*RIVER\s*\*\*\*/i.test(line)) return "river";
  if (/\*\*\*\s*SHOW DOWN\s*\*\*\*/i.test(line)) return "showdown";
  if (/\*\*\*\s*SUMMARY\s*\*\*\*/i.test(line)) return "summary";
  return null;
}

function parseAction(line: string, street: PokerStreet): PokerAction | null {
  const postAnte = line.match(new RegExp(`^(.+?): posts (?:the )?ante (${MONEY_TOKEN})`, "i"));
  if (postAnte) return { street, player: postAnte[1], action: "post_ante", amount: toNumber(postAnte[2]), toAmount: null, isAllIn: false, raw: line };

  const postSB = line.match(new RegExp(`^(.+?): posts small blind (${MONEY_TOKEN})`, "i"));
  if (postSB) return { street, player: postSB[1], action: "post_small_blind", amount: toNumber(postSB[2]), toAmount: null, isAllIn: false, raw: line };

  const postBB = line.match(new RegExp(`^(.+?): posts big blind (${MONEY_TOKEN})`, "i"));
  if (postBB) return { street, player: postBB[1], action: "post_big_blind", amount: toNumber(postBB[2]), toAmount: null, isAllIn: false, raw: line };

  const fold = line.match(/^(.+?): folds/i);
  if (fold) return { street, player: fold[1], action: "fold", amount: null, toAmount: null, isAllIn: false, raw: line };

  const check = line.match(/^(.+?): checks/i);
  if (check) return { street, player: check[1], action: "check", amount: null, toAmount: null, isAllIn: false, raw: line };

  const call = line.match(new RegExp(`^(.+?): calls (${MONEY_TOKEN})(?: and is all-in)?`, "i"));
  if (call) return { street, player: call[1], action: "call", amount: toNumber(call[2]), toAmount: null, isAllIn: /all-in/i.test(line), raw: line };

  const bet = line.match(new RegExp(`^(.+?): bets (${MONEY_TOKEN})(?: and is all-in)?`, "i"));
  if (bet) return { street, player: bet[1], action: "bet", amount: toNumber(bet[2]), toAmount: null, isAllIn: /all-in/i.test(line), raw: line };

  const raise = line.match(new RegExp(`^(.+?): raises (${MONEY_TOKEN}) to (${MONEY_TOKEN})(?: and is all-in)?`, "i"));
  if (raise) return { street, player: raise[1], action: "raise", amount: toNumber(raise[2]), toAmount: toNumber(raise[3]), isAllIn: /all-in/i.test(line), raw: line };

  const raiseTo = line.match(new RegExp(`^(.+?): raises to (${MONEY_TOKEN})(?: and is all-in)?`, "i"));
  if (raiseTo) return { street, player: raiseTo[1], action: "raise", amount: null, toAmount: toNumber(raiseTo[2]), isAllIn: /all-in/i.test(line), raw: line };

  const collect = line.match(new RegExp(`^(.+?) collected (${MONEY_TOKEN}) from (?:main |side )?pot`, "i"));
  if (collect) return { street, player: collect[1], action: "collect", amount: toNumber(collect[2]), toAmount: null, isAllIn: false, raw: line };

  const wins = line.match(new RegExp(`^(.+?) wins? (?:the )?pot \((${MONEY_TOKEN})\)`, "i"));
  if (wins) return { street, player: wins[1], action: "collect", amount: toNumber(wins[2]), toAmount: null, isAllIn: false, raw: line };

  const show = line.match(/^(.+?): shows \[[^\]]+\]/i);
  if (show) return { street, player: show[1], action: "show", amount: null, toAmount: null, isAllIn: false, raw: line };

  const uncalled = line.match(new RegExp(`^Uncalled bet \((${MONEY_TOKEN})\) returned to (.+)$`, "i"));
  if (uncalled) return { street, player: uncalled[2], action: "returned_uncalled_bet", amount: toNumber(uncalled[1]), toAmount: null, isAllIn: false, raw: line };

  if (/all-in/i.test(line)) {
    const actor = line.match(/^(.+?):/i)?.[1] ?? "event";
    return { street, player: actor, action: "all_in", amount: null, toAmount: null, isAllIn: true, raw: line };
  }

  return null;
}

function splitBlocks(rawText: string): string[] {
  const matches = Array.from(rawText.matchAll(/(?:Poker(?:Stars)?|GGPoker|Natural8) Hand #[^\r\n]*/gi));
  if (matches.length <= 1) return [rawText.trim()].filter(Boolean);
  const blocks: string[] = [];
  for (let i = 0; i < matches.length; i += 1) {
    const start = matches[i].index ?? 0;
    const end = i + 1 < matches.length ? (matches[i + 1].index ?? rawText.length) : rawText.length;
    blocks.push(rawText.slice(start, end).trim());
  }
  return blocks;
}

type SeatAliasEntry = {
  seatNumber: number;
  originalName: string;
  alias: string;
};

type SummaryShowdownEntry = {
  player: string;
  cards: string[];
  wonAmount: number;
};

function maybeReverseLinesForChronologicalOrder(lines: string[]): string[] {
  const holeIdx = lines.findIndex(line => /\*\*\*\s*HOLE CARDS\s*\*\*\*/i.test(line));
  const summaryIdx = lines.findIndex(line => /\*\*\*\s*SUMMARY\s*\*\*\*/i.test(line));

  // Some GG exports can come inverted; if SUMMARY appears before HOLE CARDS,
  // reverse the block so actions are replayed in natural order.
  if (holeIdx >= 0 && summaryIdx >= 0 && summaryIdx < holeIdx) {
    return [...lines].reverse();
  }

  return lines;
}

function buildSeatAliasEntries(
  seats: Array<{ seatNumber: number; playerName: string }>,
  heroOriginalName: string,
): { seatAliases: SeatAliasEntry[]; aliasByOriginalName: Map<string, string> } {
  const seatAliases: SeatAliasEntry[] = [];
  const aliasByOriginalName = new Map<string, string>();
  const orderedSeats = [...seats].sort((a, b) => a.seatNumber - b.seatNumber);

  let heroAssigned = false;
  let villainCounter = 1;

  for (const seat of orderedSeats) {
    const isHeroSeat = !heroAssigned && seat.playerName === heroOriginalName;
    const alias = isHeroSeat ? "Hero" : (villainCounter === 1 ? "Villain" : `Villain ${villainCounter}`);

    if (isHeroSeat) {
      heroAssigned = true;
    } else {
      villainCounter += 1;
    }

    seatAliases.push({
      seatNumber: seat.seatNumber,
      originalName: seat.playerName,
      alias,
    });

    if (!aliasByOriginalName.has(seat.playerName)) {
      aliasByOriginalName.set(seat.playerName, alias);
    }
  }

  if (!heroAssigned) {
    aliasByOriginalName.set(heroOriginalName, "Hero");
  }

  return { seatAliases, aliasByOriginalName };
}

function normalizeLevelFromHeader(header: string): string {
  return header.match(/Level\s*([^\s(]+)/i)?.[1] ?? "";
}

function parseBlindInfoFromHeader(header: string): { smallBlind: number; bigBlind: number; ante: number } {
  // GG format with nested ante: Level8(200/400(60))
  const ggAnteMatch = header.match(/Level\s*\d+\s*\(([\d,]+)\/([\d,]+)\(([\d,]+)\)\)/i);
  if (ggAnteMatch) {
    return {
      smallBlind: toNumber(ggAnteMatch[1]),
      bigBlind: toNumber(ggAnteMatch[2]),
      ante: toNumber(ggAnteMatch[3]),
    };
  }

  const ggLevelMatch = header.match(/Level\d+\(([^)]+)\)/i);
  const pokerStarsLevelMatch = header.match(/Level\s+[A-Z0-9]+\s*\(([^)]+)\)/i);
  const blindSegment = ggLevelMatch?.[1] ?? pokerStarsLevelMatch?.[1] ?? "";

  const blindTokens = blindSegment
    .split("/")
    .map(token => toNumber(token))
    .filter(value => Number.isFinite(value) && value > 0);

  return {
    smallBlind: blindTokens[0] ?? 0,
    bigBlind: blindTokens[1] ?? 0,
    ante: blindTokens[2] ?? 0,
  };
}

function parseSummaryShowdownEntries(summaryLines: string[], aliasByOriginalName: Map<string, string>): SummaryShowdownEntry[] {
  return summaryLines
    .filter(line => /^Seat\s+\d+:\s+.+\s+showed\s+\[[^\]]+\]/i.test(line))
    .map(line => {
      const originalPlayer = line.match(/^Seat\s+\d+:\s+(.+?)(?:\s+\((?:button|small blind|big blind)\))?\s+showed/i)?.[1] ?? "";
      const cards = parseCards(line.match(/\[([^\]]+)\]/)?.[1]);
      const wonAmount = toNumber(line.match(/won\s+\(([^)]+)\)/i)?.[1]);
      return {
        player: aliasByOriginalName.get(originalPlayer) ?? (originalPlayer === "Hero" ? "Hero" : originalPlayer),
        cards,
        wonAmount,
      };
    })
    .filter(entry => entry.player.length > 0);
}

function sortHandsChronologically(hands: ParsedPokerStarsHand[]): ParsedPokerStarsHand[] {
  const allNumericIds = hands.every(hand => /^\d+$/.test(hand.handId));
  if (allNumericIds) {
    return [...hands].sort((a, b) => Number(a.handId) - Number(b.handId));
  }

  const dated = hands.filter(hand => hand.dateTime).length;
  if (dated > 1) {
    return [...hands].sort((a, b) => a.dateTime.localeCompare(b.dateTime));
  }

  return hands;
}

function parseSingle(block: string, tournamentIdFallback: string, heroFallback: string): ParsedPokerStarsHand | null {
  const lines = maybeReverseLinesForChronologicalOrder(
    block.split(/\r?\n/).map(line => line.trim()).filter(Boolean),
  );
  if (lines.length === 0) return null;

  const header = lines.find(line => /Hand #/i.test(line)) ?? lines[0];
  const handId = header.match(/Hand #([A-Z0-9]+)/i)?.[1] ?? `${Date.now()}`;
  const tournamentId = header.match(/Tournament #?(\d+)/i)?.[1] ?? tournamentIdFallback;

  const maxPlayers =
    toNumber(lines.find(line => /-max/i.test(line))?.match(/(\d+)-max/i)?.[1]) ||
    toNumber(lines.find(line => /\((\d+)\s*max\)/i.test(line))?.match(/\((\d+)\s*max\)/i)?.[1]) ||
    9;
  const buttonSeat = toNumber(lines.find(line => /is the button/i.test(line))?.match(/Seat #?(\d+)/i)?.[1]) || 1;

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

  const seats = lines
    .filter(line => /^Seat\s+\d+:.*in chips\)/i.test(line))
    .map(line => {
      const seatNumber = toNumber(line.match(/^Seat\s+(\d+):/i)?.[1]);
      const playerName = line.match(/^Seat\s+\d+:\s+(.+?)\s+\(/i)?.[1] ?? `Seat ${seatNumber}`;
      const startingStack = toNumber(line.match(/\(([^)]+) in chips\)/i)?.[1]);
      return { seatNumber, playerName, startingStack, isSittingOut: /sitting out/i.test(line) };
    });

  // Compute position map using same logic as PokerStars parser
  const orderedSeats = [...seats]
    .sort((a, b) => {
      const da = (a.seatNumber - buttonSeat + maxPlayers) % maxPlayers;
      const db = (b.seatNumber - buttonSeat + maxPlayers) % maxPlayers;
      return da - db;
    })
    .map(s => s.seatNumber);
  const posLabels = POSITION_LABELS[Math.min(Math.max(orderedSeats.length, 2), 9)] ?? POSITION_LABELS[9];
  const positionBySeat = new Map<number, string>();
  orderedSeats.forEach((sn, idx) => positionBySeat.set(sn, posLabels[idx] ?? `P${idx + 1}`));

  const dealtWithCards = lines.find(line => /^Dealt to\s+.+?\s+\[[^\]]+\]/i.test(line));
  const explicitHeroSeatName = seats.find(seat => /^Hero$/i.test(seat.playerName))?.playerName;
  const heroOriginalName = dealtWithCards?.match(/^Dealt to\s+(.+?)\s+\[/i)?.[1] ?? explicitHeroSeatName ?? heroFallback;
  const { seatAliases, aliasByOriginalName } = buildSeatAliasEntries(seats, heroOriginalName);
  const seatAliasByNumber = new Map(seatAliases.map(entry => [entry.seatNumber, entry.alias]));
  const heroName = "Hero";
  const heroCards = parseCards(dealtWithCards?.match(/\[([^\]]+)\]/)?.[1]);

  const actions: PokerAction[] = [];
  let street: PokerStreet = "preflop";
  for (const line of lines) {
    const marker = normalizeStreet(line);
    if (marker) {
      street = marker;
      continue;
    }
    if (street === "summary") continue;
    const action = parseAction(line, street);
    if (action) actions.push(action);
  }

  const normalizedActions = actions.map(action => {
    return {
      ...action,
      player: aliasByOriginalName.get(action.player) ?? (action.player === heroOriginalName ? heroName : action.player),
    };
  });

  const boardFlop = parseCards(lines.find(line => /\*\*\*\s*FLOP\s*\*\*\*/i.test(line))?.match(/\[([^\]]+)\]/)?.[1]);
  const turnLine = lines.find(line => /\*\*\*\s*TURN\s*\*\*\*/i.test(line));
  const turnGroups = turnLine ? Array.from(turnLine.matchAll(/\[([^\]]+)\]/g)) : [];
  const boardTurn = turnGroups.length > 1 ? parseCards(turnGroups[1][1]) : [];
  const riverLine = lines.find(line => /\*\*\*\s*RIVER\s*\*\*\*/i.test(line));
  const riverGroups = riverLine ? Array.from(riverLine.matchAll(/\[([^\]]+)\]/g)) : [];
  const boardRiver = riverGroups.length > 1 ? parseCards(riverGroups[1][1]) : [];
  const boardFull = [...boardFlop, ...boardTurn, ...boardRiver];

  const { smallBlind, bigBlind, ante: anteFromHeader } = parseBlindInfoFromHeader(header);
  const anteFromActions = actions
    .filter(action => action.action === "post_ante")
    .map(action => action.amount ?? 0)
    .find(amount => amount > 0) ?? 0;
  const ante = anteFromHeader || anteFromActions;

  const summaryIndex = lines.findIndex(line => /\*\*\*\s*SUMMARY\s*\*\*\*/i.test(line));
  const summaryLines = summaryIndex >= 0 ? lines.slice(summaryIndex + 1) : [];
  const totalPotLine = summaryLines.find(line => /^Total pot\s+/i.test(line)) ?? lines.find(line => /^Total pot\s+/i.test(line));
  const totalPot = toNumber(totalPotLine?.match(new RegExp(`Total pot\\s+(${MONEY_TOKEN})`, "i"))?.[1]);
  const rake = toNumber(totalPotLine?.match(new RegExp(`Rake\\s+(${MONEY_TOKEN})`, "i"))?.[1]);
  const heroCollected = normalizedActions
    .filter(action => action.action === "collect" && action.player === heroName)
    .reduce((sum, action) => sum + (action.amount ?? 0), 0);
  const heroFolded = normalizedActions.some(action => action.player === heroName && action.action === "fold");
  const heroInvestedVoluntarily = normalizedActions.some(
    action => action.player === heroName && (action.action === "call" || action.action === "bet" || action.action === "raise" || action.action === "all_in"),
  );

  const summaryBoard = parseCards(summaryLines.find(line => /^Board\s+\[/i.test(line))?.match(/\[([^\]]+)\]/)?.[1]);
  const boardResolved = summaryBoard.length > 0 ? summaryBoard : boardFull;
  const summaryShowdownEntries = parseSummaryShowdownEntries(summaryLines, aliasByOriginalName);
  const heroShowed = summaryShowdownEntries.find(entry => entry.player === heroName)?.cards
    ?? parseCards(lines.find(line => /^Hero: shows \[[^\]]+\]/i.test(line))?.match(/\[([^\]]+)\]/)?.[1]);
  const villainCards = summaryShowdownEntries
    .filter(entry => entry.player !== heroName)
    .map(entry => ({ player: entry.player, cards: entry.cards }));
  const heroSummaryLine = summaryLines.find(line => /^Seat\s+\d+:\s+Hero\b/i.test(line));
  const heroWonBySummary = /\bwon\b/i.test(heroSummaryLine ?? "") || heroCollected > 0;
  const heroFoldedBySummary = (/folded before/i.test(heroSummaryLine ?? "") || heroFolded) && !heroInvestedVoluntarily;
  const showdown = normalizedActions.some(action => action.action === "show") || summaryShowdownEntries.length > 0;
  const handEndType = showdown ? "showdown" : "fold";
  const heroResult: "won" | "lost" | "folded" = heroWonBySummary ? "won" : (heroFoldedBySummary ? "folded" : "lost");

  const seatMap = new Map(seats.map(seat => [seat.seatNumber, seat]));

  // Refine positions: override SB/BB from blind post actions
  for (const action of normalizedActions) {
    if (action.action === "post_small_blind") {
      const seat = seats.find(s => (aliasByOriginalName.get(s.playerName) ?? s.playerName) === action.player);
      if (seat) positionBySeat.set(seat.seatNumber, "SB");
    }
    if (action.action === "post_big_blind") {
      const seat = seats.find(s => (aliasByOriginalName.get(s.playerName) ?? s.playerName) === action.player);
      if (seat) positionBySeat.set(seat.seatNumber, "BB");
    }
  }
  positionBySeat.set(buttonSeat, "BTN");

  const parsedSeats = seats.map(seat => ({
    seatNumber: seat.seatNumber,
    playerName: seatAliasByNumber.get(seat.seatNumber) ?? seat.playerName,
    startingStack: seat.startingStack,
    isSittingOut: seat.isSittingOut,
    isHero: (seatAliasByNumber.get(seat.seatNumber) ?? seat.playerName) === heroName,
    position: positionBySeat.get(seat.seatNumber) ?? "",
  }));

  const heroSeat = parsedSeats.find(seat => seat.isHero)?.seatNumber ?? null;
  const heroPosition = heroSeat != null ? (positionBySeat.get(heroSeat) ?? "") : "";
  const heroStartingStack = parsedSeats.find(seat => seat.isHero)?.startingStack ?? 0;
  const calculations = calculateHandMetrics({
    actions: normalizedActions,
    heroName,
    heroStartingStack,
    seats: parsedSeats,
    summaryHeroCollected: heroCollected,
  });

  const eliminationRegex = /finished the tournament in (\d+)(?:st|nd|rd|th) place/i;
  const heroEliminationLine = lines.find(line => new RegExp(`${heroOriginalName.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}\\s+finished the tournament in\\s+\\d+(?:st|nd|rd|th)\\s+place`, "i").test(line));
  const eliminationMatch = heroEliminationLine?.match(eliminationRegex) ?? lines.find(line => eliminationRegex.test(line))?.match(eliminationRegex);
  const eliminationPosition = eliminationMatch ? Number(eliminationMatch[1]) : null;

  const hand: ParsedPokerStarsHand = {
    tournamentId,
    handId,
    heroName,
    heroSeat,
    heroPosition: heroPosition,
    heroCards,
    tableName: lines.find(line => /^Table\s+'/.test(line))?.match(/^Table\s+'([^']+)'/i)?.[1] ?? "",
    maxPlayers,
    buttonSeat,
    level: normalizeLevelFromHeader(header),
    smallBlind,
    bigBlind,
    ante,
    buyIn: null,
    fee: null,
    currency: "USD",
    game: "Hold'em",
    format: "No Limit",
    dateTime: header.match(/-\s+(\d{4}\/\d{2}\/\d{2}\s+\d{2}:\d{2}:\d{2})(?:\s+[A-Z]{2,5})?$/)?.[1] ?? "",
    timezone: header.match(/\b([A-Z]{2,5})$/)?.[1] ?? "",
    seats: parsedSeats,
    actions: normalizedActions,
    board: {
      flop: boardFlop,
      turn: boardTurn,
      river: boardRiver,
      full: boardResolved,
    },
    summary: {
      totalPot,
      rake,
      heroResult,
      heroCollected,
      heroShowed,
      villainCards,
      eliminationPosition,
      handEndType,
      uncalledReturned: normalizedActions.filter(action => action.action === "returned_uncalled_bet").reduce((sum, action) => sum + (action.amount ?? 0), 0),
      showdown,
    },
    calculations,
    aiReview: "Parser alternativo aplicado para formato nao PokerStars; revisar campos antes de publicar analise final.",
    rawHand: block,
    ignoredEvents: [],
  };

  return hand;
}

export function parseOtherPlatformHandHistory(rawTextInput: string): ParsedPokerStarsTournament {
  const rawText = rawTextInput.trim();
  const tournamentId = rawText.match(/Tournament #?(\d+)/i)?.[1] ?? "";
  const heroName = "Hero";

  const blocks = splitBlocks(rawText);
  const unsortedHands = blocks
    .map(block => parseSingle(block, tournamentId, heroName))
    .filter((hand): hand is ParsedPokerStarsHand => Boolean(hand));
  const hands = sortHandsChronologically(unsortedHands);

  const finalPosition = hands.map(hand => hand.summary.eliminationPosition).find(value => value != null) ?? null;

  return {
    header: {
      source: "PokerStars",
      tournamentId,
      heroName,
    },
    hands,
    tournamentInfo: {
      tournamentId,
      buyIn: null,
      fee: null,
      currency: "USD",
      site: "PokerStars",
      handsImported: hands.length,
      heroName,
      stackInitial: hands[0]?.seats.find(seat => seat.isHero)?.startingStack ?? null,
      stackFinalKnown: hands[hands.length - 1]?.calculations.heroEndingStackEstimate ?? null,
      evolutionByHand: hands.map(hand => {
        const before = hand.seats.find(seat => seat.isHero)?.startingStack ?? null;
        return {
          handId: hand.handId,
          stackBefore: before,
          stackAfter: hand.calculations.heroEndingStackEstimate,
          net: hand.calculations.heroNetEstimate,
        };
      }),
      markedForReviewCount: 0,
      bigHandsCount: hands.filter(hand => hand.summary.totalPot >= hand.bigBlind * 20).length,
      allInsCount: hands.reduce((sum, hand) => sum + hand.actions.filter(action => action.isAllIn).length, 0),
      showdownCount: hands.filter(hand => hand.summary.showdown).length,
      finalPosition,
      totalPlayers: finalPosition,
      playersRemainingOnElimination: finalPosition != null ? Math.max(finalPosition - 1, 0) : null,
      eliminationsUntilFinish: finalPosition != null ? Math.max(finalPosition - 2, 0) : null,
    },
    warnings: [
      "Formato alternativo detectado. Parser isolado usado para manter compatibilidade sem alterar o parser principal.",
      ...(hands.length === 0 ? ["Nenhuma mao valida encontrada pelo parser alternativo."] : []),
    ],
  };
}
