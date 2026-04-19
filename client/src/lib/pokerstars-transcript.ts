export type PokerStreet = "preflop" | "flop" | "turn" | "river" | "showdown" | "summary";

export type PokerActionType =
  | "fold"
  | "check"
  | "call"
  | "bet"
  | "raise"
  | "post_ante"
  | "post_small_blind"
  | "post_big_blind"
  | "all_in"
  | "show"
  | "collect"
  | "returned_uncalled_bet"
  | "event";

export interface PokerAction {
  street: PokerStreet;
  player: string;
  action: PokerActionType;
  amount: number | null;
  toAmount: number | null;
  isAllIn: boolean;
  raw: string;
}

export interface PokerSeat {
  seatNumber: number;
  playerName: string;
  startingStack: number;
  isSittingOut: boolean;
  isHero: boolean;
  position: string;
}

export interface PokerHandSummary {
  totalPot: number;
  rake: number;
  heroResult: "won" | "lost" | "folded";
  heroCollected: number;
  heroShowed: string[];
  villainCards: Array<{ player: string; cards: string[] }>;
  eliminationPosition: number | null;
  handEndType: "fold" | "showdown" | "split";
  uncalledReturned: number;
  showdown: boolean;
}

export interface PokerHandCalculations {
  potByStreet: Record<"preflop" | "flop" | "turn" | "river", number>;
  heroInvested: number;
  effectiveStackStart: number;
  sprFlop: number | null;
  sprByStreet: Record<"preflop" | "flop" | "turn" | "river", number | null>;
  potOddsByStreet: Array<{ street: PokerStreet; amountToCall: number; potBeforeCall: number; potOdds: number }>;
  heroNetEstimate: number;
  heroEndingStackEstimate: number | null;
}

export interface PokerTranscriptHeader {
  source: "PokerStars";
  tournamentId: string;
  heroName: string;
  importEmail?: string;
}

export interface ParsedPokerStarsHand {
  tournamentId: string;
  handId: string;
  heroName: string;
  heroSeat: number | null;
  heroPosition: string;
  heroCards: string[];
  tableName: string;
  maxPlayers: number;
  buttonSeat: number;
  level: string;
  smallBlind: number;
  bigBlind: number;
  ante: number;
  buyIn: number | null;
  fee: number | null;
  currency: string;
  game: string;
  format: string;
  dateTime: string;
  timezone: string;
  seats: PokerSeat[];
  actions: PokerAction[];
  board: {
    flop: string[];
    turn: string[];
    river: string[];
    full: string[];
  };
  summary: PokerHandSummary;
  calculations: PokerHandCalculations;
  aiReview: string;
  rawHand: string;
  ignoredEvents: string[];
}

export interface ParsedPokerStarsTournament {
  header: PokerTranscriptHeader;
  hands: ParsedPokerStarsHand[];
  tournamentInfo: {
    tournamentId: string;
    buyIn: number | null;
    fee: number | null;
    currency: string;
    site: "PokerStars";
    handsImported: number;
    heroName: string;
    stackInitial: number | null;
    stackFinalKnown: number | null;
    evolutionByHand: Array<{ handId: string; stackBefore: number | null; stackAfter: number | null; net: number }>;
    markedForReviewCount: number;
    bigHandsCount: number;
    allInsCount: number;
    showdownCount: number;
    finalPosition: number | null;
    totalPlayers: number | null;
    playersRemainingOnElimination: number | null;
    eliminationsUntilFinish: number | null;
  };
  warnings: string[];
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

const OPERATIONAL_EVENT_REGEX = /(disconnected|connected|has returned|timed out while disconnected|sitting out|moved from another table)/i;

function parseNumber(token: string | undefined): number {
  if (!token) return 0;
  const normalized = token.replace(/[^\d.,-]/g, "").replace(/,/g, "");
  const value = Number(normalized);
  return Number.isFinite(value) ? value : 0;
}

function parseCards(cardsRaw: string | undefined): string[] {
  if (!cardsRaw) return [];
  return cardsRaw.trim().split(/\s+/).filter(Boolean);
}

function normalizeName(name: string | undefined): string {
  if (!name) return "";
  return name
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .trim()
    .replace(/[^a-z0-9]/g, "");
}

function escapeRegExp(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

function mapSuit(card: string): string {
  const rank = card.slice(0, -1);
  const suit = card.slice(-1).toLowerCase();
  const symbol = suit === "h" ? "♥" : suit === "d" ? "♦" : suit === "c" ? "♣" : suit === "s" ? "♠" : suit;
  return `${rank}${symbol}`;
}

export function formatCardForUI(card: string): string {
  return mapSuit(card);
}

function normalizeStreetFromMarker(line: string): PokerStreet | null {
  if (line.includes("*** HOLE CARDS ***")) return "preflop";
  if (line.includes("*** FLOP ***")) return "flop";
  if (line.includes("*** TURN ***")) return "turn";
  if (line.includes("*** RIVER ***")) return "river";
  if (line.includes("*** SHOW DOWN ***")) return "showdown";
  if (line.includes("*** SUMMARY ***")) return "summary";
  return null;
}

function parseGeneralHeader(rawText: string): PokerTranscriptHeader {
  const firstLine = rawText.split(/\r?\n/).find(line => line.trim().length > 0) ?? "";
  const tournamentId = firstLine.match(/tournament\s+#(\d+)/i)?.[1] ?? "";
  const heroName = firstLine.match(/requested by\s+([^\s(]+)/i)?.[1] ?? "Hero";
  const importEmail = firstLine.match(/\(([^)]+@[^)]+)\)/)?.[1];

  return {
    source: "PokerStars",
    tournamentId,
    heroName,
    importEmail,
  };
}

function splitHandBlocks(rawText: string): string[] {
  const separatorRegex = /^\*{5,}\s*#\s*\d+\s*\*{5,}$/gm;
  const matches = Array.from(rawText.matchAll(separatorRegex));
  if (matches.length === 0) {
    return rawText.includes("PokerStars Hand #") ? [rawText] : [];
  }

  const blocks: string[] = [];
  for (let index = 0; index < matches.length; index += 1) {
    const start = matches[index].index ?? 0;
    const end = index + 1 < matches.length ? (matches[index + 1].index ?? rawText.length) : rawText.length;
    const block = rawText.slice(start, end).trim();
    if (block.includes("PokerStars Hand #")) blocks.push(block);
  }

  return blocks;
}

function computePositionMap(seats: Array<{ seatNumber: number }>, buttonSeat: number, maxPlayers: number): Map<number, string> {
  const ordered = [...seats]
    .sort((a, b) => {
      const da = (a.seatNumber - buttonSeat + maxPlayers) % maxPlayers;
      const db = (b.seatNumber - buttonSeat + maxPlayers) % maxPlayers;
      return da - db;
    })
    .map(seat => seat.seatNumber);

  const labels = POSITION_LABELS[Math.min(Math.max(ordered.length, 2), 9)] ?? POSITION_LABELS[9];
  const map = new Map<number, string>();
  ordered.forEach((seatNumber, index) => {
    map.set(seatNumber, labels[index] ?? `P${index + 1}`);
  });
  return map;
}

function computePositionMapForHand(
  seats: Array<{ seatNumber: number; playerName: string }>,
  buttonSeat: number,
  maxPlayers: number,
  smallBlindPlayer: string | null,
  bigBlindPlayer: string | null,
): Map<number, string> {
  const baseMap = computePositionMap(seats, buttonSeat, maxPlayers);
  const byNormalizedPlayer = new Map<string, number>();
  seats.forEach(seat => {
    byNormalizedPlayer.set(normalizeName(seat.playerName), seat.seatNumber);
  });

  const sbSeat = smallBlindPlayer ? byNormalizedPlayer.get(normalizeName(smallBlindPlayer)) ?? null : null;
  const bbSeat = bigBlindPlayer ? byNormalizedPlayer.get(normalizeName(bigBlindPlayer)) ?? null : null;

  if (sbSeat != null) baseMap.set(sbSeat, "SB");
  if (bbSeat != null) baseMap.set(bbSeat, "BB");
  baseMap.set(buttonSeat, "BTN");

  return baseMap;
}

function parseActionLine(line: string, street: PokerStreet): PokerAction | null {
  const postAnte = line.match(/^(.+?): posts the ante (\d+)/i);
  if (postAnte) {
    return { street, player: postAnte[1], action: "post_ante", amount: parseNumber(postAnte[2]), toAmount: null, isAllIn: false, raw: line };
  }

  const postSB = line.match(/^(.+?): posts small blind (\d+)/i);
  if (postSB) {
    return { street, player: postSB[1], action: "post_small_blind", amount: parseNumber(postSB[2]), toAmount: null, isAllIn: false, raw: line };
  }

  const postBB = line.match(/^(.+?): posts big blind (\d+)/i);
  if (postBB) {
    return { street, player: postBB[1], action: "post_big_blind", amount: parseNumber(postBB[2]), toAmount: null, isAllIn: false, raw: line };
  }

  const fold = line.match(/^(.+?): folds/i);
  if (fold) {
    return { street, player: fold[1], action: "fold", amount: null, toAmount: null, isAllIn: false, raw: line };
  }

  const check = line.match(/^(.+?): checks/i);
  if (check) {
    return { street, player: check[1], action: "check", amount: null, toAmount: null, isAllIn: false, raw: line };
  }

  const call = line.match(/^(.+?): calls (\d+)/i);
  if (call) {
    return { street, player: call[1], action: "call", amount: parseNumber(call[2]), toAmount: null, isAllIn: false, raw: line };
  }

  const bet = line.match(/^(.+?): bets (\d+)(?: and is all-in)?/i);
  if (bet) {
    return {
      street,
      player: bet[1],
      action: "bet",
      amount: parseNumber(bet[2]),
      toAmount: null,
      isAllIn: /all-in/i.test(line),
      raw: line,
    };
  }

  const raise = line.match(/^(.+?): raises (\d+) to (\d+)(?: and is all-in)?/i);
  if (raise) {
    return {
      street,
      player: raise[1],
      action: "raise",
      amount: parseNumber(raise[2]),
      toAmount: parseNumber(raise[3]),
      isAllIn: /all-in/i.test(line),
      raw: line,
    };
  }

  const show = line.match(/^(.+?): shows \[([^\]]+)\]/i);
  if (show) {
    return { street, player: show[1], action: "show", amount: null, toAmount: null, isAllIn: false, raw: line };
  }

  const collect = line.match(/^(.+?) collected (\d+) from pot/i);
  if (collect) {
    return {
      street,
      player: collect[1],
      action: "collect",
      amount: parseNumber(collect[2]),
      toAmount: null,
      isAllIn: false,
      raw: line,
    };
  }

  const uncalled = line.match(/^Uncalled bet \((\d+)\) returned to (.+)$/i);
  if (uncalled) {
    return {
      street,
      player: uncalled[2],
      action: "returned_uncalled_bet",
      amount: parseNumber(uncalled[1]),
      toAmount: null,
      isAllIn: false,
      raw: line,
    };
  }

  const allInEvent = line.match(/^(.+?): .*all-in/i);
  if (allInEvent) {
    return { street, player: allInEvent[1], action: "all_in", amount: null, toAmount: null, isAllIn: true, raw: line };
  }

  return null;
}

function calculateHandMetrics(hand: {
  actions: PokerAction[];
  heroName: string;
  heroStartingStack: number;
  seats: Array<{ playerName: string; startingStack: number }>;
  summaryHeroCollected: number;
}): PokerHandCalculations {
  const potByStreet: Record<"preflop" | "flop" | "turn" | "river", number> = {
    preflop: 0,
    flop: 0,
    turn: 0,
    river: 0,
  };
  const sprByStreet: Record<"preflop" | "flop" | "turn" | "river", number | null> = {
    preflop: null,
    flop: null,
    turn: null,
    river: null,
  };

  let pot = 0;
  let heroInvested = 0;
  let currentStreet: "preflop" | "flop" | "turn" | "river" = "preflop";
  let streetContrib = new Map<string, number>();
  const potOddsByStreet: Array<{ street: PokerStreet; amountToCall: number; potBeforeCall: number; potOdds: number }> = [];

  const normalizedHero = normalizeName(hand.heroName);
  const stacks = new Map<string, number>();
  const activePlayers = new Set<string>();
  hand.seats.forEach(seat => {
    const key = normalizeName(seat.playerName);
    stacks.set(key, seat.startingStack);
    activePlayers.add(key);
  });

  const normalizeStreetKey = (street: PokerStreet): "preflop" | "flop" | "turn" | "river" | null => {
    if (street === "preflop" || street === "flop" || street === "turn" || street === "river") return street;
    return null;
  };

  const heroEffectiveStack = (): number | null => {
    if (!activePlayers.has(normalizedHero)) return null;
    const heroStack = stacks.get(normalizedHero) ?? 0;
    const opponents = [...activePlayers].filter(player => player !== normalizedHero);
    if (opponents.length === 0) return null;
    const maxOpponent = opponents.reduce((max, player) => Math.max(max, stacks.get(player) ?? 0), 0);
    return Math.min(heroStack, maxOpponent);
  };

  const maybeCaptureSpr = (street: "preflop" | "flop" | "turn" | "river", isVoluntaryAction: boolean): void => {
    if (sprByStreet[street] != null) return;
    if (street === "preflop" && !isVoluntaryAction) return;
    if (pot <= 0) {
      sprByStreet[street] = null;
      return;
    }
    const effective = heroEffectiveStack();
    sprByStreet[street] = effective != null ? effective / pot : null;
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
    const isForcedPreflopPosting =
      streetKey === "preflop" &&
      (action.action === "post_ante" || action.action === "post_small_blind" || action.action === "post_big_blind");
    maybeCaptureSpr(streetKey, !isForcedPreflopPosting);

    let delta = 0;
    if (action.action === "post_ante" || action.action === "post_small_blind" || action.action === "post_big_blind" || action.action === "bet" || action.action === "call") {
      delta = action.amount ?? 0;
      streetContrib.set(action.player, (streetContrib.get(action.player) ?? 0) + delta);
    } else if (action.action === "raise") {
      const target = action.toAmount ?? 0;
      const already = streetContrib.get(action.player) ?? 0;
      delta = Math.max(target - already, 0);
      streetContrib.set(action.player, target);
    } else if (action.action === "returned_uncalled_bet") {
      delta = -(action.amount ?? 0);
    }

    if (action.action === "call" && action.player === hand.heroName && (action.amount ?? 0) > 0) {
      const amountToCall = action.amount ?? 0;
      potOddsByStreet.push({
        street: action.street,
        amountToCall,
        potBeforeCall: pot,
        potOdds: amountToCall > 0 ? pot / amountToCall : 0,
      });
    }

    if (action.action === "fold") {
      activePlayers.delete(normalizedPlayer);
    }

    if (delta !== 0) {
      const currentStack = stacks.get(normalizedPlayer);
      if (currentStack != null) {
        const nextStack = Math.max(currentStack - delta, 0);
        stacks.set(normalizedPlayer, nextStack);
      }
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
    .filter(seat => seat.playerName !== hand.heroName)
    .reduce((max, seat) => Math.max(max, seat.startingStack), 0);

  const effectiveStackStart = Math.min(hand.heroStartingStack || 0, largestOpponent || hand.heroStartingStack || 0);
  const preflopInvested = hand.actions
    .filter(action => action.street === "preflop" && action.player === hand.heroName)
    .reduce((sum, action) => {
      if (action.action === "raise") {
        const to = action.toAmount ?? 0;
        const already = sum;
        return sum + Math.max(to - already, 0);
      }
      return sum + (action.amount ?? 0);
    }, 0);

  const potAtFlopStart = potByStreet.flop > 0 ? potByStreet.flop : null;
  const sprFlop = potAtFlopStart && potAtFlopStart > 0 ? (effectiveStackStart - preflopInvested) / potAtFlopStart : null;
  if (sprByStreet.flop == null) sprByStreet.flop = sprFlop;

  const heroNetEstimate = hand.summaryHeroCollected - heroInvested;
  const heroEndingStackEstimate = hand.heroStartingStack > 0 ? hand.heroStartingStack + heroNetEstimate : null;

  return {
    potByStreet,
    heroInvested,
    effectiveStackStart,
    sprFlop,
    sprByStreet,
    potOddsByStreet,
    heroNetEstimate,
    heroEndingStackEstimate,
  };
}

function buildAiReview(hand: ParsedPokerStarsHand): string {
  const hasRiverAggression = hand.actions.some(action => action.street === "river" && action.player === hand.heroName && (action.action === "bet" || action.action === "raise"));
  const sawShowdown = hand.summary.showdown;
  const won = hand.summary.heroResult === "won";

  if (won && !sawShowdown && hasRiverAggression) {
    return "Linha agressiva consistente: hero construiu fold equity no river e capturou o pote sem showdown. Spot sugere boa leitura de range capped do vilao.";
  }

  if (!won && sawShowdown) {
    return "Mao foi ate showdown. Vale revisar selecao de sizings e thresholds de call nas streets finais para reduzir spots de dominacao.";
  }

  if (hand.calculations.potOddsByStreet.length > 0) {
    const lastOdds = hand.calculations.potOddsByStreet[hand.calculations.potOddsByStreet.length - 1];
    return `Hero enfrentou decisao de call com pot odds de aproximadamente ${lastOdds.potOdds.toFixed(2)}:1 no ${lastOdds.street}. Conferir se a equidade minima foi atendida.`;
  }

  return "Linha jogada sem desvios extremos visiveis. Revisao recomendada focando ordem de acoes e eficiencia de sizings por street.";
}

function parseSingleHand(block: string, header: PokerTranscriptHeader): ParsedPokerStarsHand | null {
  const lines = block.split(/\r?\n/).map(line => line.trim()).filter(Boolean);
  const handHeader = lines.find(line => line.startsWith("PokerStars Hand #"));
  if (!handHeader) return null;

  const handMatch = handHeader.match(/^PokerStars Hand #(\d+): Tournament #(\d+),\s*(.+?)\s+-\s+Level\s+([^\s]+)\s+\((\d+)\/(\d+)\)\s+-\s+(\d{4}\/\d{2}\/\d{2}\s+\d{2}:\d{2}:\d{2})\s+([A-Z]+)/);
  if (!handMatch) return null;

  const handId = handMatch[1];
  const tournamentId = handMatch[2];
  const buyinSegment = handMatch[3];
  const level = handMatch[4];
  const smallBlind = parseNumber(handMatch[5]);
  const bigBlind = parseNumber(handMatch[6]);
  const dateTime = handMatch[7];
  const timezone = handMatch[8];

  const buyInMatch = buyinSegment.match(/\$?(\d+(?:\.\d+)?)\+\$?(\d+(?:\.\d+)?)\s+([A-Z]{3})\s+(.+)/i);
  const buyIn = buyInMatch ? Number(buyInMatch[1]) : null;
  const fee = buyInMatch ? Number(buyInMatch[2]) : null;
  const currency = buyInMatch?.[3] ?? "USD";
  const gameFormatText = buyInMatch?.[4] ?? "Hold'em No Limit";
  const game = gameFormatText.includes("Hold'em") ? "Hold'em" : gameFormatText;
  const format = gameFormatText.replace("Hold'em", "").trim() || "No Limit";

  const tableLine = lines.find(line => /^Table '.+' \d+-max Seat #\d+ is the button$/i.test(line)) ?? "";
  const tableMatch = tableLine.match(/^Table '([^']+)'\s+(\d+)-max\s+Seat #(\d+) is the button/i);
  const tableName = tableMatch?.[1] ?? "";
  const maxPlayers = tableMatch ? parseNumber(tableMatch[2]) : 9;
  const buttonSeat = tableMatch ? parseNumber(tableMatch[3]) : 1;

  const seatsBase = lines
    .filter(line => /^Seat \d+: .+\(\d+ in chips\)/i.test(line))
    .map(line => {
      const seatMatch = line.match(/^Seat\s+(\d+):\s+(.+?)\s+\((\d+) in chips\)(.*)$/i);
      if (!seatMatch) return null;
      return {
        seatNumber: parseNumber(seatMatch[1]),
        playerName: seatMatch[2],
        startingStack: parseNumber(seatMatch[3]),
        isSittingOut: /sitting out/i.test(seatMatch[4] ?? ""),
      };
    })
    .filter((seat): seat is NonNullable<typeof seat> => Boolean(seat));

  // Auto-detect hero from "Dealt to X [cards]" when header defaults to "Hero"
  // (multi-hand exports without "requested by" header line)
  const dealtToHeroName =
    lines.find(line => /^Dealt to\s+.+\s+\[/i.test(line))
      ?.match(/^Dealt to\s+(.+?)\s+\[/i)?.[1] ?? null;
  const effectiveHeroName = dealtToHeroName ?? header.heroName;
  const normalizedHeroFromHeader = normalizeName(effectiveHeroName);
  const seatsWithoutPosition: PokerSeat[] = seatsBase.map(seat => ({
    ...seat,
    isHero: normalizeName(seat.playerName) === normalizedHeroFromHeader,
    position: "",
  }));

  const dealtLines = lines
    .map(line => {
      const dealtMatch = line.match(/^Dealt to\s+(.+?)\s+\[([^\]]+)\]/i);
      if (!dealtMatch) return null;
      return {
        player: dealtMatch[1],
        cards: parseCards(dealtMatch[2]),
      };
    })
    .filter((item): item is { player: string; cards: string[] } => item != null);

  const heroCards = dealtLines.find(item => normalizeName(item.player) === normalizedHeroFromHeader)?.cards ?? [];

  const boardFlop = parseCards(lines.find(line => line.includes("*** FLOP ***"))?.match(/\[([^\]]+)\]/)?.[1]);
  const turnLine = lines.find(line => line.includes("*** TURN ***"));
  const turnGroups = turnLine ? Array.from(turnLine.matchAll(/\[([^\]]+)\]/g)) : [];
  const boardTurn = turnGroups.length > 1 ? parseCards(turnGroups[1][1]) : [];
  const riverLine = lines.find(line => line.includes("*** RIVER ***"));
  const riverGroups = riverLine ? Array.from(riverLine.matchAll(/\[([^\]]+)\]/g)) : [];
  const boardRiver = riverGroups.length > 1 ? parseCards(riverGroups[1][1]) : [];

  const boardSummaryLine = lines.find(line => /^Board \[.+\]$/i.test(line));
  const boardFull = boardSummaryLine ? parseCards(boardSummaryLine.match(/\[([^\]]+)\]/)?.[1]) : [...boardFlop, ...boardTurn, ...boardRiver];

  const actions: PokerAction[] = [];
  const ignoredEvents: string[] = [];
  let currentStreet: PokerStreet = "preflop";

  for (const line of lines) {
    const marker = normalizeStreetFromMarker(line);
    if (marker) {
      currentStreet = marker;
      continue;
    }

    if (OPERATIONAL_EVENT_REGEX.test(line)) {
      ignoredEvents.push(line);
      continue;
    }

    // Skip summary section � those lines are not game actions.
    if (currentStreet === "summary") continue;

    const action = parseActionLine(line, currentStreet);
    if (action) {
      actions.push(action);
    }
  }

  // Rebuild seat positions from this hand only: button + posted blinds + seat map.
  const smallBlindPlayer = actions.find(action => action.action === "post_small_blind")?.player ?? null;
  const bigBlindPlayer = actions.find(action => action.action === "post_big_blind")?.player ?? null;
  const positionMap = computePositionMapForHand(seatsBase, buttonSeat, maxPlayers, smallBlindPlayer, bigBlindPlayer);

  const seats: PokerSeat[] = seatsWithoutPosition.map(seat => ({
    ...seat,
    position: positionMap.get(seat.seatNumber) ?? "",
  }));

  const heroSeat = seats.find(seat => seat.isHero)?.seatNumber ?? null;
  const heroPosition = heroSeat ? positionMap.get(heroSeat) ?? "" : "";
  const heroRuntimeName = seats.find(seat => seat.isHero)?.playerName ?? header.heroName;

  const ante = actions.find(action => action.action === "post_ante")?.amount ?? 0;

  const totalPotLine = lines.find(line => /^Total pot\s+\d+/i.test(line));
  const totalPot = parseNumber(totalPotLine?.match(/Total pot\s+(\d+)/i)?.[1]);
  const rake = parseNumber(totalPotLine?.match(/Rake\s+(\d+)/i)?.[1]);
  const uncalledReturned = actions
    .filter(action => action.action === "returned_uncalled_bet")
    .reduce((sum, action) => sum + (action.amount ?? 0), 0);

  const heroCollected = actions
    .filter(action => action.action === "collect" && normalizeName(action.player) === normalizedHeroFromHeader)
    .reduce((sum, action) => sum + (action.amount ?? 0), 0);

  const showedSeatLines = lines
    .filter(line => /^Seat\s+\d+:\s+.+\s+showed\s+\[[^\]]+\]/i.test(line))
    .map(line => {
      const player = line.match(/^Seat\s+\d+:\s+(.+?)\s+showed/i)?.[1] ?? "";
      const cards = parseCards(line.match(/\[([^\]]+)\]/)?.[1]);
      return { player, cards };
    });

  const heroShowed = showedSeatLines.find(item => normalizeName(item.player) === normalizedHeroFromHeader)?.cards ?? [];

  const villainCards = showedSeatLines.filter(item => normalizeName(item.player) !== normalizedHeroFromHeader);

  const eliminationRegex = /finished the tournament in (\d+)(?:st|nd|rd|th) place/i;
  const heroEliminationLine = lines.find(line => new RegExp(`^${escapeRegExp(heroRuntimeName)}\\s+finished the tournament in\\s+\\d+(?:st|nd|rd|th)\\s+place`, "i").test(line));
  const heroWonTournament = lines.some(line => new RegExp(`^${escapeRegExp(heroRuntimeName)}\\s+wins the tournament\\b`, "i").test(line));
  const eliminationMatch = heroEliminationLine?.match(eliminationRegex) ?? null;
  const eliminationPosition = heroWonTournament ? 1 : (eliminationMatch ? parseNumber(eliminationMatch[1]) : null);

  const showdown = lines.some(line => line.includes("*** SHOW DOWN ***")) || villainCards.length > 0 || heroShowed.length > 0;
  const heroFolded = actions.some(action => action.player === header.heroName && action.action === "fold");
  const heroResult: "won" | "lost" | "folded" = heroCollected > 0 ? "won" : heroFolded ? "folded" : "lost";

  let handEndType: "fold" | "showdown" | "split" = showdown ? "showdown" : "fold";
  if (lines.some(line => /split/i.test(line))) handEndType = "split";

  const summary: PokerHandSummary = {
    totalPot,
    rake,
    heroResult,
    heroCollected,
    heroShowed,
    villainCards,
    eliminationPosition,
    handEndType,
    uncalledReturned,
    showdown,
  };

  const heroStartingStack = seats.find(seat => seat.isHero)?.startingStack ?? 0;
  const calculations = calculateHandMetrics({
    actions,
    heroName: heroRuntimeName,
    heroStartingStack,
    seats,
    summaryHeroCollected: summary.heroCollected,
  });

  const hand: ParsedPokerStarsHand = {
    tournamentId,
    handId,
    heroName: heroRuntimeName,
    heroSeat,
    heroPosition,
    heroCards,
    tableName,
    maxPlayers,
    buttonSeat,
    level,
    smallBlind,
    bigBlind,
    ante,
    buyIn,
    fee,
    currency,
    game,
    format,
    dateTime,
    timezone,
    seats,
    actions,
    board: {
      flop: boardFlop,
      turn: boardTurn,
      river: boardRiver,
      full: boardFull,
    },
    summary,
    calculations,
    aiReview: "",
    rawHand: block,
    ignoredEvents,
  };

  hand.aiReview = buildAiReview(hand);
  return hand;
}

export function parsePokerStarsTranscript(rawTextInput: string): ParsedPokerStarsTournament {
  const rawText = rawTextInput.trim();
  const header = parseGeneralHeader(rawText);
  const blocks = splitHandBlocks(rawText);
  const warnings: string[] = [];

  if (!header.tournamentId) warnings.push("Cabecalho do transcript sem tournamentId reconhecido.");
  if (!header.heroName) warnings.push("Cabecalho do transcript sem hero reconhecido.");
  if (blocks.length === 0) warnings.push("Nenhum bloco de mao encontrado. Verifique o separador *********** # X **************.");

  const hands = blocks
    .map(block => parseSingleHand(block, header))
    .filter((hand): hand is ParsedPokerStarsHand => Boolean(hand));

  if (hands.length === 0) {
    warnings.push("Nenhuma mao PokerStars valida foi extraida do transcript.");
  }

  // Propagate actual hero name discovered per-hand back to the header so
  // downstream consumers (buildReplayPayload) can use header.heroName correctly.
  const heroNameFromHands = hands.find(h => h.heroName && normalizeName(h.heroName) !== "hero")?.heroName;
  if (heroNameFromHands && (!header.heroName || normalizeName(header.heroName) === "hero")) {
    header.heroName = heroNameFromHands;
  }
  if (!header.tournamentId && hands[0]?.tournamentId) {
    header.tournamentId = hands[0].tournamentId;
  }

  const stackInitial = hands[0]?.seats.find(seat => seat.isHero)?.startingStack ?? null;
  const stackFinalKnown = hands.length > 0 ? hands[hands.length - 1].calculations.heroEndingStackEstimate : null;

  const evolutionByHand = hands.map(hand => {
    const before = hand.seats.find(seat => seat.isHero)?.startingStack ?? null;
    const after = hand.calculations.heroEndingStackEstimate;
    return {
      handId: hand.handId,
      stackBefore: before,
      stackAfter: after,
      net: hand.calculations.heroNetEstimate,
    };
  });

  const allInsCount = hands.reduce((sum, hand) => sum + hand.actions.filter(action => action.isAllIn).length, 0);
  const showdownCount = hands.filter(hand => hand.summary.showdown).length;
  const bigHandsCount = hands.filter(hand => hand.summary.totalPot >= hand.bigBlind * 20).length;
  const finalPosition = hands.map(hand => hand.summary.eliminationPosition).find(position => position != null) ?? null;
  const allObservedPlacings = Array.from(rawText.matchAll(/finished the tournament in\s+(\d+)(?:st|nd|rd|th)\s+place/gi))
    .map(match => parseNumber(match[1]))
    .filter(position => Number.isFinite(position) && position > 0);
  const uniqueObservedPlacings = Array.from(new Set(allObservedPlacings)).sort((a, b) => a - b);
  const nearestObservedPlacing = uniqueObservedPlacings.length > 0 ? uniqueObservedPlacings[0] : null;
  const hasPlacementJumps = uniqueObservedPlacings.some((placement, index) => {
    if (index === 0) return false;
    return placement - uniqueObservedPlacings[index - 1] > 1;
  });
  const totalPlayersRaw = parseNumber(rawText.match(/total number of players\s*:?\s*(\d+)/i)?.[1]);
  const totalPlayers = totalPlayersRaw > 0 ? totalPlayersRaw : (finalPosition != null ? finalPosition : nearestObservedPlacing);
  const playersRemainingOnElimination =
    finalPosition != null && finalPosition > 1
      ? Math.max(finalPosition - 1, 0)
      : (finalPosition === 1
          ? (nearestObservedPlacing != null ? Math.max(nearestObservedPlacing - 1, 0) : 0)
          : (nearestObservedPlacing != null ? Math.max(nearestObservedPlacing - 1, 0) : null));
  const eliminationsUntilFinish = playersRemainingOnElimination != null ? Math.max(playersRemainingOnElimination - 1, 0) : null;

  if (totalPlayersRaw <= 0) {
    warnings.push("Total de jogadores nao encontrado explicitamente; valor inferido a partir da colocacao final quando disponivel.");
  }
  if (hasPlacementJumps) {
    warnings.push("Foram detectados saltos nas colocacoes observadas (outras mesas); calculo de 'Restavam' usa a menor colocacao observada e ignora os saltos.");
  }

  return {
    header,
    hands,
    tournamentInfo: {
      tournamentId: header.tournamentId || hands[0]?.tournamentId || "",
      buyIn: hands[0]?.buyIn ?? null,
      fee: hands[0]?.fee ?? null,
      currency: hands[0]?.currency ?? "USD",
      site: "PokerStars",
      handsImported: hands.length,
      heroName: header.heroName,
      stackInitial,
      stackFinalKnown,
      evolutionByHand,
      markedForReviewCount: 0,
      bigHandsCount,
      allInsCount,
      showdownCount,
      finalPosition,
      totalPlayers,
      playersRemainingOnElimination,
      eliminationsUntilFinish,
    },
    warnings,
  };
}

function describeAction(action: PokerAction): string {
  if (action.action === "raise") {
    return `${action.player} aumentou para ${action.toAmount ?? 0}${action.isAllIn ? " (all-in)" : ""}.`;
  }
  if (action.action === "bet") {
    return `${action.player} apostou ${action.amount ?? 0}${action.isAllIn ? " (all-in)" : ""}.`;
  }
  if (action.action === "call") return `${action.player} pagou ${action.amount ?? 0}.`;
  if (action.action === "fold") return `${action.player} foldou.`;
  if (action.action === "check") return `${action.player} deu check.`;
  if (action.action === "post_ante") return `${action.player} postou ante ${action.amount ?? 0}.`;
  if (action.action === "post_small_blind") return `${action.player} postou small blind ${action.amount ?? 0}.`;
  if (action.action === "post_big_blind") return `${action.player} postou big blind ${action.amount ?? 0}.`;
  if (action.action === "show") return `${action.player} mostrou cartas.`;
  if (action.action === "collect") return `${action.player} puxou ${action.amount ?? 0} do pote.`;
  if (action.action === "returned_uncalled_bet") return `Aposta nao paga ${action.amount ?? 0} foi devolvida para ${action.player}.`;
  if (action.action === "all_in") return `${action.player} ficou all-in.`;
  return action.raw;
}

export function buildFriendlyStreetTimeline(hand: ParsedPokerStarsHand): Record<"preflop" | "flop" | "turn" | "river", string[]> {
  const byStreet: Record<"preflop" | "flop" | "turn" | "river", string[]> = {
    preflop: [],
    flop: [],
    turn: [],
    river: [],
  };

  hand.actions.forEach(action => {
    if (action.street === "preflop" || action.street === "flop" || action.street === "turn" || action.street === "river") {
      byStreet[action.street].push(describeAction(action));
    }
  });

  return byStreet;
}

export const POKERSTARS_TRANSCRIPT_SAMPLE = `Transcript for tournament #3988660295 requested by G_TTeixeira999 (g.tteixeira999@email.com)

*********** # 1 **************
PokerStars Hand #260318983223: Tournament #3988660295, $0.45+$0.05 USD Hold'em No Limit - Level I (10/20) - 2026/04/02 13:54:38 ET
Table '3988660295 2' 8-max Seat #1 is the button
Seat 1: lamps0707 (1562 in chips)
Seat 2: nandojoga (1497 in chips)
Seat 3: fieldCrusher (1482 in chips)
Seat 4: riverline77 (1504 in chips)
Seat 5: vilao_tight (1538 in chips)
Seat 6: G_TTeixeira999 (1500 in chips)
Seat 7: spinKid (1420 in chips)
Seat 8: offsuite89 (1499 in chips)
lamps0707: posts the ante 3
nandojoga: posts the ante 3
fieldCrusher: posts the ante 3
riverline77: posts the ante 3
vilao_tight: posts the ante 3
G_TTeixeira999: posts the ante 3
spinKid: posts the ante 3
offsuite89: posts the ante 3
lamps0707: posts small blind 10
nandojoga: posts big blind 20
*** HOLE CARDS ***
Dealt to G_TTeixeira999 [9h Ac]
fieldCrusher: folds
riverline77: folds
vilao_tight: calls 20
G_TTeixeira999: raises 20 to 40
spinKid: calls 40
offsuite89: folds
lamps0707: calls 30
nandojoga: calls 20
vilao_tight: calls 20
*** FLOP *** [7c 5h Qd]
lamps0707: checks
nandojoga: checks
vilao_tight: checks
G_TTeixeira999: checks
spinKid: checks
*** TURN *** [7c 5h Qd] [3h]
lamps0707: checks
nandojoga: checks
vilao_tight: checks
G_TTeixeira999: bets 120
spinKid: folds
lamps0707: calls 120
nandojoga: folds
vilao_tight: folds
*** RIVER *** [7c 5h Qd 3h] [Jd]
lamps0707: checks
G_TTeixeira999: bets 400
lamps0707: folds
Uncalled bet (400) returned to G_TTeixeira999
G_TTeixeira999 collected 434 from pot
*** SUMMARY ***
Total pot 434 | Rake 0
Board [7c 5h Qd 3h Jd]
Seat 6: G_TTeixeira999 collected (434)

*********** # 2 **************
PokerStars Hand #260318983224: Tournament #3988660295, $0.45+$0.05 USD Hold'em No Limit - Level I (10/20) - 2026/04/02 13:57:02 ET
Table '3988660295 2' 8-max Seat #5 is the button
Seat 1: lamps0707 (1432 in chips)
Seat 2: nandojoga (1407 in chips)
Seat 3: fieldCrusher (1462 in chips)
Seat 4: riverline77 (1484 in chips)
Seat 5: vilao_tight (1495 in chips)
Seat 6: G_TTeixeira999 (1771 in chips)
Seat 7: spinKid (1380 in chips)
Seat 8: offsuite89 (1489 in chips)
lamps0707: posts the ante 3
nandojoga: posts the ante 3
fieldCrusher: posts the ante 3
riverline77: posts the ante 3
vilao_tight: posts the ante 3
G_TTeixeira999: posts the ante 3
spinKid: posts the ante 3
offsuite89: posts the ante 3
vilao_tight: posts small blind 10
G_TTeixeira999: posts big blind 20
*** HOLE CARDS ***
Dealt to G_TTeixeira999 [Ad 6c]
spinKid: raises 20 to 40
offsuite89: folds
lamps0707: calls 40
nandojoga: folds
fieldCrusher: folds
riverline77: folds
vilao_tight: calls 30
G_TTeixeira999: calls 20
*** FLOP *** [8d 8h 2s]
vilao_tight: checks
G_TTeixeira999: checks
spinKid: bets 80
lamps0707: calls 80
vilao_tight: folds
G_TTeixeira999: calls 80
*** TURN *** [8d 8h 2s] [9d]
G_TTeixeira999: checks
spinKid: bets 160
lamps0707: folds
G_TTeixeira999: calls 160
*** RIVER *** [8d 8h 2s 9d] [4d]
G_TTeixeira999: checks
spinKid: checks
*** SHOW DOWN ***
G_TTeixeira999: shows [Ad 6c]
spinKid: shows [9h 4h]
spinKid collected 1026 from pot
*** SUMMARY ***
Total pot 1026 | Rake 0
Board [8d 8h 2s 9d 4d]
Seat 6: G_TTeixeira999 showed [Ad 6c] and lost with a pair of Eights
Seat 7: spinKid showed [9h 4h] and won with two pair, Nines and Eights
lamps0707 finished the tournament in 30th place`;
