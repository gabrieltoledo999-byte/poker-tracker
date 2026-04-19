export type SupportedHandPlatform = "PokerStars" | "GGPoker" | "WPN" | "Generic";
export type TableSeatCount = 6 | 9;

export interface HandParserCoordinates {
  platformHints: string[];
  seatLineRegex: string;
  seatCountRegex: string;
  dealerRegex: string;
  heroCardsRegex: string;
  boardRegex: string;
  potRegex: string;
  blindRegex: string;
  tournamentRegex: string;
  tableRegex: string;
  actionLineRegex: string;
}

export interface SeatSnapshot {
  seatNumber: number;
  label: string;
  playerName: string;
  stack: string;
  status: "active" | "folded" | "all-in" | "empty";
  isHero?: boolean;
  isDealer?: boolean;
  cards?: string[];
  lastAction?: string;
  contribution?: string;
  highlight?: string;
}

export interface ParsedHandSnapshot {
  platform: SupportedHandPlatform;
  seatCount: TableSeatCount;
  tournamentName?: string;
  tableName?: string;
  blinds?: string;
  pot?: string;
  street: string;
  board: string[];
  heroName?: string;
  heroSeat?: number;
  dealerSeat?: number;
  actions: string[];
  seats: SeatSnapshot[];
  warnings: string[];
  summary: string[];
  parserConfidence: number;
  coordinatesApplied: string[];
  rawText: string;
}

const DEFAULT_COORDINATES: Record<SupportedHandPlatform, HandParserCoordinates> = {
  PokerStars: {
    platformHints: ["pokerstars"],
    seatLineRegex: "Seat\\s+(\\d+)\\s*:\\s*(.+?)\\s+\\(([^\\n)]*?)\\)",
    seatCountRegex: "\\b([69])[- ]?max\\b",
    dealerRegex: "Seat\\s+#?(\\d+)\\s+is\\s+the\\s+button|button\\s+is\\s+in\\s+seat\\s+#?(\\d+)",
    heroCardsRegex: "Dealt\\s+to\\s+(.+?)\\s+\\[([^\\]]+)\\]",
    boardRegex: "Board\\s+\\[([^\\]]+)\\]|\\*\\*\\*\\s+(?:FLOP|TURN|RIVER)\\s+\\*\\*\\*[^\\[]*\\[([^\\]]+)\\]",
    potRegex: "Total\\s+pot\\s+([^\\n|]+)|collected\\s+([^\\n]+?)\\s+from\\s+pot",
    blindRegex: "\\(([^\\n)]*?/[^\\n)]*?)\\)|Blinds?\\s+([^\\n]+)",
    tournamentRegex: "Tournament\\s+#?[^,\\n]*,\\s*([^\\n]+)|Tournament\\s+([^\\n]+)",
    tableRegex: "Table\\s+'([^']+)'|Table\\s+([^\\n]+)",
    actionLineRegex: "^[^\\n]*(posts|checks|bets|calls|raises|folds|all-in|collected)[^\\n]*$",
  },
  GGPoker: {
    platformHints: ["ggpoker", "gg network", "natural8"],
    seatLineRegex: "Seat\\s+(\\d+)\\s*:\\s*(.+?)\\s+\\(([^\\n)]*?)\\)",
    seatCountRegex: "\\b([69])[- ]?max\\b",
    dealerRegex: "Seat\\s+#?(\\d+)\\s+is\\s+the\\s+button|button\\s+is\\s+in\\s+seat\\s+#?(\\d+)",
    heroCardsRegex: "Dealt\\s+to\\s+(.+?)\\s+\\[([^\\]]+)\\]",
    boardRegex: "Board\\s+\\[([^\\]]+)\\]|\\*\\*\\*\\s+(?:FLOP|TURN|RIVER)\\s+\\*\\*\\*[^\\[]*\\[([^\\]]+)\\]",
    potRegex: "Total\\s+pot\\s+([^\\n|]+)|collected\\s+([^\\n]+?)\\s+from\\s+pot",
    blindRegex: "\\(([^\\n)]*?/[^\\n)]*?)\\)|Blinds?\\s+([^\\n]+)",
    tournamentRegex: "Tournament\\s+#?[^,\\n]*,\\s*([^\\n]+)|Tournament\\s+([^\\n]+)",
    tableRegex: "Table\\s+'([^']+)'|Table\\s+([^\\n]+)",
    actionLineRegex: "^[^\\n]*(posts|checks|bets|calls|raises|folds|all-in|collected)[^\\n]*$",
  },
  WPN: {
    platformHints: ["winning poker network", "america's cardroom", "acr", "black chip poker"],
    seatLineRegex: "Seat\\s+(\\d+)\\s*:\\s*(.+?)\\s+\\(([^\\n)]*?)\\)",
    seatCountRegex: "\\b([69])[- ]?max\\b",
    dealerRegex: "Seat\\s+#?(\\d+)\\s+is\\s+the\\s+button|button\\s+is\\s+in\\s+seat\\s+#?(\\d+)",
    heroCardsRegex: "Dealt\\s+to\\s+(.+?)\\s+\\[([^\\]]+)\\]",
    boardRegex: "Board\\s+\\[([^\\]]+)\\]|\\*\\*\\*\\s+(?:FLOP|TURN|RIVER)\\s+\\*\\*\\*[^\\[]*\\[([^\\]]+)\\]",
    potRegex: "Total\\s+pot\\s+([^\\n|]+)|collected\\s+([^\\n]+?)\\s+from\\s+pot",
    blindRegex: "\\(([^\\n)]*?/[^\\n)]*?)\\)|Blinds?\\s+([^\\n]+)",
    tournamentRegex: "Tournament\\s+#?[^,\\n]*,\\s*([^\\n]+)|Tournament\\s+([^\\n]+)",
    tableRegex: "Table\\s+'([^']+)'|Table\\s+([^\\n]+)",
    actionLineRegex: "^[^\\n]*(posts|checks|bets|calls|raises|folds|all-in|collected)[^\\n]*$",
  },
  Generic: {
    platformHints: [],
    seatLineRegex: "Seat\\s+(\\d+)\\s*:\\s*(.+?)\\s+\\(([^\\n)]*?)\\)",
    seatCountRegex: "\\b([69])[- ]?max\\b",
    dealerRegex: "Seat\\s+#?(\\d+)\\s+is\\s+the\\s+button|button\\s+is\\s+in\\s+seat\\s+#?(\\d+)",
    heroCardsRegex: "Dealt\\s+to\\s+(.+?)\\s+\\[([^\\]]+)\\]",
    boardRegex: "Board\\s+\\[([^\\]]+)\\]|\\*\\*\\*\\s+(?:FLOP|TURN|RIVER)\\s+\\*\\*\\*[^\\[]*\\[([^\\]]+)\\]",
    potRegex: "Total\\s+pot\\s+([^\\n|]+)|collected\\s+([^\\n]+?)\\s+from\\s+pot",
    blindRegex: "\\(([^\\n)]*?/[^\\n)]*?)\\)|Blinds?\\s+([^\\n]+)",
    tournamentRegex: "Tournament\\s+#?[^,\\n]*,\\s*([^\\n]+)|Tournament\\s+([^\\n]+)",
    tableRegex: "Table\\s+'([^']+)'|Table\\s+([^\\n]+)",
    actionLineRegex: "^[^\\n]*(posts|checks|bets|calls|raises|folds|all-in|collected)[^\\n]*$",
  },
};

export const HAND_REVIEWER_SAMPLES: Record<Exclude<SupportedHandPlatform, "Generic">, string> = {
  PokerStars: `PokerStars Hand #251002001: Tournament #455001122, Sunday Storm Deepstack - Level XII (600/1200) - 2026/04/18 22:14:08 BRT
Table 'Sunday Storm Deepstack' 9-max Seat #3 is the button
Seat 1: BrunoCosta (28144 in chips)
Seat 2: AnaRiver (19620 in chips)
Seat 3: HeroRail (34455 in chips)
Seat 4: TioRange (18332 in chips)
Seat 5: FoldFactory (22890 in chips)
Seat 6: NeoGrinder (25410 in chips)
Seat 7: PioStudy (16705 in chips)
Seat 8: ValueHunter (30990 in chips)
Seat 9: JamMachine (21200 in chips)
HeroRail: posts small blind 600
TioRange: posts big blind 1200
*** HOLE CARDS ***
Dealt to HeroRail [As Kd]
FoldFactory: folds
NeoGrinder: folds
PioStudy: raises 1800 to 3000
ValueHunter: folds
JamMachine: calls 3000
BrunoCosta: folds
AnaRiver: folds
HeroRail: raises 4200 to 7200
TioRange: folds
PioStudy: calls 4200
JamMachine: folds
*** FLOP *** [Ah 9c 4d]
HeroRail: bets 5800
PioStudy: calls 5800
*** TURN *** [Ah 9c 4d] [2s]
HeroRail: checks
PioStudy: checks
*** RIVER *** [Ah 9c 4d 2s] [Kh]
HeroRail: bets 10800
PioStudy: folds
Uncalled bet (10800) returned to HeroRail
HeroRail collected 23600 from pot
*** SUMMARY ***
Total pot 23600 | Rake 0
Board [Ah 9c 4d 2s Kh]`,
  GGPoker: `GGPoker Hand #9902101: Bounty Hunters HR - Level 18 (1500/3000) - 2026/04/18 22:40:10 UTC
Table 'Bounty Hunters HR' 6-max Seat #5 is the button
Seat 1: HeroRail (96420)
Seat 2: EastRiver (41500)
Seat 3: SnapFold (50220)
Seat 4: SizeUp (71210)
Seat 5: CutoffLab (33800)
Seat 6: RiverNode (27140)
HeroRail: posts big blind 3000
CutoffLab: posts small blind 1500
*** HOLE CARDS ***
Dealt to HeroRail [Qc Qh]
RiverNode: folds
HeroRail: raises 4500 to 7500
EastRiver: calls 7500
SnapFold: folds
SizeUp: folds
CutoffLab: folds
*** FLOP *** [Qs 8d 3c]
HeroRail: bets 6200
EastRiver: calls 6200
*** TURN *** [Qs 8d 3c] [Td]
HeroRail: checks
EastRiver: bets 9600
HeroRail: calls 9600
*** RIVER *** [Qs 8d 3c Td] [2c]
HeroRail: checks
EastRiver: checks
HeroRail collected 48600 from pot
*** SUMMARY ***
Total pot 48600 | Rake 0
Board [Qs 8d 3c Td 2c]`,
  WPN: `Winning Poker Network Hand #78122001: Venom Warm-Up - Level 21 (1000/2000) - 2026/04/18 23:11:44 ET
Table 'Venom Warm-Up' 9-max Seat #8 is the button
Seat 1: DeltaFlow (44800)
Seat 2: HeroRail (55350)
Seat 3: IceRiver (22100)
Seat 4: CBetOnly (60440)
Seat 5: ButtonEdge (17800)
Seat 6: SolverKid (39220)
Seat 7: NightReg (18600)
Seat 8: OrbitBoss (51150)
Seat 9: ThinValue (29810)
NightReg: posts small blind 1000
OrbitBoss: posts big blind 2000
*** HOLE CARDS ***
Dealt to HeroRail [Jh Jc]
HeroRail: raises 2600 to 4600
IceRiver: folds
CBetOnly: calls 4600
ButtonEdge: folds
SolverKid: folds
NightReg: folds
OrbitBoss: calls 2600
*** FLOP *** [Js 7h 4s]
OrbitBoss: checks
HeroRail: bets 5400
CBetOnly: folds
OrbitBoss: calls 5400
*** TURN *** [Js 7h 4s] [Ad]
OrbitBoss: checks
HeroRail: checks
*** RIVER *** [Js 7h 4s Ad] [6h]
OrbitBoss: bets 6200
HeroRail: raises 13800 to 20000
OrbitBoss: folds
HeroRail collected 37800 from pot
*** SUMMARY ***
Total pot 37800 | Rake 0
Board [Js 7h 4s Ad 6h]`,
};

function buildRegex(source: string, flags: string): RegExp | null {
  try {
    return new RegExp(source, flags);
  } catch {
    return null;
  }
}

function firstCapturedValue(match: RegExpMatchArray | null): string | undefined {
  if (!match) return undefined;
  for (let index = 1; index < match.length; index += 1) {
    const value = match[index]?.trim();
    if (value) return value;
  }
  return undefined;
}

function cleanPlayerName(input: string | undefined): string {
  if (!input) return "";
  return input
    .replace(/\s+\[ME\]$/i, "")
    .replace(/\s+\(button\)$/i, "")
    .replace(/\s{2,}/g, " ")
    .trim();
}

function normalizeMoney(input: string | undefined): string | undefined {
  if (!input) return undefined;
  return input.replace(/\s+/g, " ").trim();
}

function parseCards(rawCards: string | undefined): string[] {
  if (!rawCards) return [];
  return rawCards
    .split(/\s+/)
    .map(card => card.trim())
    .filter(Boolean);
}

function detectPlatform(rawText: string, preferredPlatform?: SupportedHandPlatform): SupportedHandPlatform {
  const normalized = rawText.toLowerCase();
  if (preferredPlatform && preferredPlatform !== "Generic") {
    const preferredHints = DEFAULT_COORDINATES[preferredPlatform].platformHints;
    if (preferredHints.length === 0 || preferredHints.some(hint => normalized.includes(hint))) {
      return preferredPlatform;
    }
  }

  const orderedPlatforms: SupportedHandPlatform[] = ["PokerStars", "GGPoker", "WPN"];
  for (const platform of orderedPlatforms) {
    if (DEFAULT_COORDINATES[platform].platformHints.some(hint => normalized.includes(hint))) {
      return platform;
    }
  }

  return preferredPlatform ?? "Generic";
}

function extractBoard(rawText: string, coordinates: HandParserCoordinates): { board: string[]; street: string } {
  const lines = rawText.split(/\r?\n/);
  const board: string[] = [];
  let street = "preflop";

  for (const line of lines) {
    const upperLine = line.toUpperCase();
    if (upperLine.includes("*** FLOP ***")) street = "flop";
    if (upperLine.includes("*** TURN ***")) street = "turn";
    if (upperLine.includes("*** RIVER ***")) street = "river";

    if (!upperLine.includes("*** FLOP ***") && !upperLine.includes("*** TURN ***") && !upperLine.includes("*** RIVER ***") && !upperLine.includes("BOARD")) {
      continue;
    }

    const groups = Array.from(line.matchAll(/\[([^\]]+)\]/g));
    for (const group of groups) {
      const cards = parseCards(group[1]);
      for (const card of cards) {
        if (!board.includes(card)) board.push(card);
      }
    }
  }

  if (board.length > 0) {
    return { board, street };
  }

  const fallbackBoardRegex = buildRegex(coordinates.boardRegex, "im");
  const fallbackBoard = fallbackBoardRegex ? firstCapturedValue(rawText.match(fallbackBoardRegex)) : undefined;
  return { board: parseCards(fallbackBoard), street };
}

function extractActionLines(rawText: string, coordinates: HandParserCoordinates): string[] {
  const actionRegex = buildRegex(coordinates.actionLineRegex, "gim");
  if (!actionRegex) return [];

  return rawText
    .split(/\r?\n/)
    .map(line => line.trim())
    .filter(Boolean)
    .filter(line => actionRegex.test(line))
    .slice(0, 12);
}

function deriveSeatCount(rawText: string, detectedSeats: number[], coordinates: HandParserCoordinates): TableSeatCount {
  const explicitRegex = buildRegex(coordinates.seatCountRegex, "im");
  const explicitMatch = explicitRegex ? rawText.match(explicitRegex) : null;
  const explicitValue = Number(firstCapturedValue(explicitMatch));
  if (explicitValue === 6 || explicitValue === 9) return explicitValue;

  const maxSeat = detectedSeats.length > 0 ? Math.max(...detectedSeats) : 0;
  if (maxSeat > 6) return 9;
  return 6;
}

function buildSummary(parsed: {
  platform: SupportedHandPlatform;
  seatCount: TableSeatCount;
  tournamentName?: string;
  tableName?: string;
  heroName?: string;
  pot?: string;
  street: string;
  board: string[];
}): string[] {
  const summary = [`${parsed.platform} ${parsed.seatCount}-max`, `Street atual: ${parsed.street.toUpperCase()}`];
  if (parsed.tournamentName) summary.push(`Torneio: ${parsed.tournamentName}`);
  if (parsed.tableName) summary.push(`Mesa: ${parsed.tableName}`);
  if (parsed.heroName) summary.push(`Hero: ${parsed.heroName}`);
  if (parsed.pot) summary.push(`Pote lido: ${parsed.pot}`);
  if (parsed.board.length > 0) summary.push(`Board: ${parsed.board.join(" ")}`);
  return summary;
}

export function getCoordinatesTemplate(platform: SupportedHandPlatform): string {
  return JSON.stringify(DEFAULT_COORDINATES[platform], null, 2);
}

export function parseHandHistory(options: {
  rawText: string;
  preferredPlatform?: SupportedHandPlatform;
  seatCountOverride?: TableSeatCount;
  coordinatesOverride?: Partial<HandParserCoordinates>;
}): ParsedHandSnapshot {
  const rawText = options.rawText.trim();
  const detectedPlatform = detectPlatform(rawText, options.preferredPlatform);
  const coordinates: HandParserCoordinates = {
    ...DEFAULT_COORDINATES[detectedPlatform],
    ...(options.coordinatesOverride ?? {}),
    platformHints: options.coordinatesOverride?.platformHints ?? DEFAULT_COORDINATES[detectedPlatform].platformHints,
  };
  const warnings: string[] = [];

  if (!rawText) {
    return {
      platform: detectedPlatform,
      seatCount: options.seatCountOverride ?? 6,
      street: "preflop",
      board: [],
      actions: [],
      seats: Array.from({ length: options.seatCountOverride ?? 6 }, (_, index) => ({
        seatNumber: index + 1,
        label: `Seat ${index + 1}`,
        playerName: "Assento livre",
        stack: "--",
        status: "empty",
      })),
      warnings: ["Cole um historico bruto para ativar o parser."],
      summary: ["Aguardando texto bruto"],
      parserConfidence: 0.2,
      coordinatesApplied: Object.keys(coordinates),
      rawText,
    };
  }

  const seatRegex = buildRegex(coordinates.seatLineRegex, "gim");
  const dealerRegex = buildRegex(coordinates.dealerRegex, "im");
  const heroRegex = buildRegex(coordinates.heroCardsRegex, "im");
  const tournamentRegex = buildRegex(coordinates.tournamentRegex, "im");
  const tableRegex = buildRegex(coordinates.tableRegex, "im");
  const blindRegex = buildRegex(coordinates.blindRegex, "im");
  const potRegex = buildRegex(coordinates.potRegex, "im");

  const detectedSeatRows = seatRegex
    ? Array.from(rawText.matchAll(seatRegex)).map(match => ({
        seatNumber: Number(match[1]),
        playerName: cleanPlayerName(match[2]),
        stack: normalizeMoney(match[3]) ?? "--",
      }))
    : [];

  if (detectedSeatRows.length === 0) {
    warnings.push("Nenhuma linha de assento foi reconhecida. Ajuste as coordenadas de seatLineRegex.");
  }

  const parsedSeatCount = deriveSeatCount(rawText, detectedSeatRows.map(seat => seat.seatNumber), coordinates);
  const seatCount = options.seatCountOverride ?? parsedSeatCount;
  const seats: SeatSnapshot[] = Array.from({ length: seatCount }, (_, index) => ({
    seatNumber: index + 1,
    label: `Seat ${index + 1}`,
    playerName: "Assento livre",
    stack: "--",
    status: "empty",
  }));

  for (const seatRow of detectedSeatRows) {
    if (seatRow.seatNumber < 1 || seatRow.seatNumber > seatCount) continue;
    seats[seatRow.seatNumber - 1] = {
      seatNumber: seatRow.seatNumber,
      label: `Seat ${seatRow.seatNumber}`,
      playerName: seatRow.playerName,
      stack: seatRow.stack,
      status: "active",
    };
  }

  const heroMatch = heroRegex ? rawText.match(heroRegex) : null;
  const heroName = cleanPlayerName(heroMatch?.[1]);
  const heroCards = parseCards(heroMatch?.[2]);
  const heroSeat = heroName ? seats.find(seat => cleanPlayerName(seat.playerName) === heroName)?.seatNumber : undefined;
  if (!heroName) {
    warnings.push("O parser nao encontrou a linha 'Dealt to'. A mesa ainda renderiza, mas o hero pode ficar sem destaque.");
  }

  const dealerSeatValue = Number(firstCapturedValue(dealerRegex ? rawText.match(dealerRegex) : null));
  const dealerSeat = Number.isFinite(dealerSeatValue) && dealerSeatValue > 0 ? dealerSeatValue : undefined;
  const tournamentName = firstCapturedValue(tournamentRegex ? rawText.match(tournamentRegex) : null);
  const rawTableName = firstCapturedValue(tableRegex ? rawText.match(tableRegex) : null);
  const tableName = rawTableName?.replace(/\s+Seat\s+#?\d+\s+is\s+the\s+button.*$/i, "").trim();
  const blinds = normalizeMoney(firstCapturedValue(blindRegex ? rawText.match(blindRegex) : null));
  const pot = normalizeMoney(firstCapturedValue(potRegex ? rawText.match(potRegex) : null));
  const { board, street } = extractBoard(rawText, coordinates);
  const actions = extractActionLines(rawText, coordinates);

  const actionByPlayer = new Map<string, string>();
  const contributionByPlayer = new Map<string, string>();

  for (const action of actions) {
    const actorMatch = action.match(/^([^:\n]+?)(?::)?\s+(posts|checks|bets|calls|raises|folds|all-in|is all-in|collected)\b(.*)$/i);
    if (!actorMatch) continue;

    const actorName = cleanPlayerName(actorMatch[1]);
    const verb = actorMatch[2].toLowerCase();
    const amountTokens = Array.from(action.matchAll(/(?:\$|USD\s*)?(\d[\d,.]*)/g));
    const lastAmount = amountTokens.at(-1)?.[1];
    const label = lastAmount ? `${verb} ${lastAmount}` : verb;

    actionByPlayer.set(actorName, label);
    if (lastAmount) contributionByPlayer.set(actorName, lastAmount);
  }

  for (const seat of seats) {
    if (seat.status === "empty") continue;

    const canonicalName = cleanPlayerName(seat.playerName);
    seat.lastAction = actionByPlayer.get(canonicalName);
    seat.contribution = contributionByPlayer.get(canonicalName);
    seat.isDealer = dealerSeat === seat.seatNumber;
    seat.isHero = heroSeat === seat.seatNumber;

    const latestAction = seat.lastAction?.toLowerCase() ?? "";
    if (latestAction.includes("fold")) seat.status = "folded";
    if (latestAction.includes("all-in")) seat.status = "all-in";
    if (latestAction.includes("collected")) seat.highlight = "Puxou o pote";
    if (seat.isHero && heroCards.length > 0) seat.cards = heroCards;
  }

  const signals = [
    detectedSeatRows.length > 0,
    Boolean(heroName),
    Boolean(tournamentName),
    Boolean(tableName),
    Boolean(blinds),
    Boolean(pot),
    board.length > 0,
    actions.length > 0,
  ];
  const parserConfidence = Math.min(0.98, 0.18 + signals.filter(Boolean).length * 0.1);

  return {
    platform: detectedPlatform,
    seatCount,
    tournamentName,
    tableName,
    blinds,
    pot,
    street,
    board,
    heroName: heroName || undefined,
    heroSeat,
    dealerSeat,
    actions,
    seats,
    warnings,
    summary: buildSummary({
      platform: detectedPlatform,
      seatCount,
      tournamentName,
      tableName,
      heroName: heroName || undefined,
      pot,
      street,
      board,
    }),
    parserConfidence,
    coordinatesApplied: Object.entries(coordinates)
      .filter(([, value]) => Array.isArray(value) ? value.length > 0 : Boolean(value))
      .map(([key]) => key),
    rawText,
  };
}