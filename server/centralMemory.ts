import { and, asc, desc, eq, isNotNull, or, sql } from "drizzle-orm";
import {
  centralHandActions,
  centralHands,
  centralTournaments,
  dataAccessAuditLogs,
  fieldAggregateStatsByAbi,
  playerAggregateStats,
  playerLeakFlags,
  playerPositionStats,
  playerTournamentStats,
  playerStatsByAbi,
  playerStatsByPositionAndAbi,
  showdownRecords,
  userConsents,
  userDataAccessGrants,
  users,
} from "../drizzle/schema";
import { getDb } from "./db";
import { equityAtAllIn } from "./equity";

type AbiBucket = "micro" | "low" | "low_mid" | "mid" | "high" | "high_roller";

const ABI_BUCKETS: Array<{ name: AbiBucket; min: number; max: number | null }> = [
  { name: "micro", min: 0, max: 300 },
  { name: "low", min: 301, max: 1000 },
  { name: "low_mid", min: 1001, max: 3000 },
  { name: "mid", min: 3001, max: 10000 },
  { name: "high", min: 10001, max: 30000 },
  { name: "high_roller", min: 30001, max: null },
];

export type ReplayActionInput = {
  handRef: string;
  street: "preflop" | "flop" | "turn" | "river" | "showdown" | "summary";
  actionOrder: number;
  playerName: string;
  seat?: number;
  position?: string;
  actionType:
    | "fold"
    | "check"
    | "call"
    | "bet"
    | "raise"
    | "all_in"
    | "post_blind"
    | "post_ante"
    | "straddle"
    | "show"
    | "muck"
    | "collect"
    | "other";
  amount?: number;
  toAmount?: number;
  stackBefore?: number;
  stackAfter?: number;
  potBefore?: number;
  potAfter?: number;
  isAllIn?: boolean;
  isForced?: boolean;
  facingActionType?: string;
  facingSizeBb?: number;
  heroInHand?: boolean;
  showdownVisible?: boolean;
  contextJson?: string;
};

export type ReplayShowdownInput = {
  handRef: string;
  playerName: string;
  seat?: number;
  position?: string;
  holeCards?: string;
  finalHandDescription?: string;
  wonPot?: boolean;
  amountWon?: number;
};

export type ReplayHandInput = {
  handRef: string;
  externalHandId?: string;
  handNumber?: string;
  datetimeOriginal?: Date;
  buttonSeat?: number;
  heroSeat?: number;
  heroPosition?: string;
  smallBlind?: number;
  bigBlind?: number;
  ante?: number;
  board?: string;
  heroCards?: string;
  totalPot?: number;
  rake?: number;
  result?: number;
  showdown?: boolean;
  rawText?: string;
  parsedJson?: string;
  handContextJson?: string;
};

export type ImportReplayInput = {
  tournament: {
    externalTournamentId?: string;
    heroName?: string;
    site: string;
    format: string;
    buyIn: number;
    fee?: number;
    currency: "BRL" | "USD" | "CAD" | "JPY" | "CNY" | "EUR";
    importedAt?: Date;
    totalHands?: number;
    finalPosition?: number;
    wasEliminated?: boolean;
    eliminationHandRef?: string;
    rawSourceId?: string;
  };
  hands: ReplayHandInput[];
  actions: ReplayActionInput[];
  showdowns: ReplayShowdownInput[];
};

function normalizePlayerName(name: string | undefined): string {
  return String(name ?? "")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .trim();
}

function normalizeStoredPosition(position: string | undefined): "UTG" | "UTG1" | "UTG2" | "LJ" | "HJ" | "CO" | "BTN" | "SB" | "BB" | "UNKNOWN" {
  const normalized = String(position ?? "")
    .trim()
    .toUpperCase()
    .replace(/\s+/g, "")
    .replace(/\+/g, "");

  switch (normalized) {
    case "UTG":
      return "UTG";
    case "UTG1":
    case "EP":
      return "UTG1";
    case "UTG2":
    case "EP1":
      return "UTG2";
    case "MP":
    case "MP1":
    case "LJ":
      return "LJ";
    case "MP2":
    case "HJ":
      return "HJ";
    case "CO":
      return "CO";
    case "BTN":
    case "BU":
      return "BTN";
    case "SB":
      return "SB";
    case "BB":
      return "BB";
    default:
      return "UNKNOWN";
  }
}

function resolveHeroPositionWithFallback<T extends { position?: string | null }>(
  handHeroPosition: string | undefined,
  preflopActions: T[],
  isHeroAction: (action: T) => boolean,
): "UTG" | "UTG1" | "UTG2" | "LJ" | "HJ" | "CO" | "BTN" | "SB" | "BB" | "UNKNOWN" {
  const direct = normalizeStoredPosition(handHeroPosition);
  if (direct !== "UNKNOWN") return direct;

  const firstHeroActionWithPosition = preflopActions.find(
    (action) => isHeroAction(action) && normalizeStoredPosition(action.position ?? undefined) !== "UNKNOWN",
  );

  return normalizeStoredPosition(firstHeroActionWithPosition?.position ?? undefined);
}

function inferHeroFromFlags(actions: ReplayActionInput[]): string {
  const counts = new Map<string, number>();
  for (const action of actions) {
    if (!action.heroInHand) continue;
    const normalized = normalizePlayerName(action.playerName);
    if (!normalized) continue;
    counts.set(normalized, (counts.get(normalized) ?? 0) + 1);
  }

  let best = "";
  let bestCount = 0;
  for (const [name, count] of counts.entries()) {
    if (count > bestCount) {
      best = name;
      bestCount = count;
    }
  }
  return best;
}

const DUPLICATE_HAND_WINDOW = 10;
const DUPLICATE_SCAN_HAND_LIMIT = 20;
const HISTORICAL_PROFILE_SYNC_MAX_HANDS = Number(process.env.HAND_REVIEW_SYNC_MAX_HANDS ?? 4000);
const REPLAY_RECALC_IMPORT_DELAY_MS = 60 * 60 * 1000;
const HISTORICAL_PROFILE_CACHE_TTL_MS = Number(process.env.HAND_REVIEW_PROFILE_CACHE_TTL_MS ?? (5 * 60 * 1000));

const replayRecalcTimers = new Map<number, ReturnType<typeof setTimeout>>();
const replayRecalcRunning = new Set<number>();
const historicalProfileCache = new Map<number, { value: any; expiresAt: number }>();

function getHistoricalProfileFromCache(userId: number) {
  const cached = historicalProfileCache.get(userId);
  if (!cached) return null;
  if (cached.expiresAt <= Date.now()) {
    historicalProfileCache.delete(userId);
    return null;
  }
  return cached.value;
}

function setHistoricalProfileCache(userId: number, value: any) {
  historicalProfileCache.set(userId, {
    value,
    expiresAt: Date.now() + HISTORICAL_PROFILE_CACHE_TTL_MS,
  });
}

function invalidateHistoricalProfileCache(userId: number) {
  historicalProfileCache.delete(userId);
}

function normalizeCards(value: string | undefined): string {
  return String(value ?? "")
    .replace(/\s+/g, " ")
    .trim()
    .toUpperCase();
}

function normalizeId(value: string | undefined): string {
  return String(value ?? "").trim();
}

function getFirstAggressiveActionIndex(actions: ReplayActionInput[]): number {
  return actions.findIndex((action) => isAggressiveAction(action));
}

function getTrueFlopCbetActor(flopActions: ReplayActionInput[], preflopAggressorName: string): string {
  const firstAggressiveIndex = getFirstAggressiveActionIndex(flopActions);
  if (firstAggressiveIndex < 0) return "";

  const firstAggressiveAction = flopActions[firstAggressiveIndex];
  if (!firstAggressiveAction || isOutlierCbetAction(firstAggressiveAction)) return "";

  const actorName = normalizePlayerName(firstAggressiveAction.playerName);
  return actorName === preflopAggressorName ? actorName : "";
}

function getFlopCbetOpportunityAndMade(
  flopActions: ReplayActionInput[],
  isAggressorAction: (action: ReplayActionInput) => boolean,
): { hasOpportunity: boolean; madeCbet: boolean } {
  if (flopActions.length === 0) {
    return { hasOpportunity: false, madeCbet: false };
  }

  const aggressorFirstActionIndex = flopActions.findIndex((action) => isAggressorAction(action));
  if (aggressorFirstActionIndex < 0) {
    return { hasOpportunity: false, madeCbet: false };
  }

  const facedLeadBeforeActing = flopActions
    .slice(0, aggressorFirstActionIndex)
    .some((action) => !isAggressorAction(action) && isAggressiveAction({ actionType: action.actionType ?? undefined }));

  if (facedLeadBeforeActing) {
    return { hasOpportunity: false, madeCbet: false };
  }

  const firstAggressorAction = flopActions[aggressorFirstActionIndex];
  const madeCbet = !!firstAggressorAction && isAggressiveAction({ actionType: firstAggressorAction.actionType ?? undefined });

  return { hasOpportunity: true, madeCbet };
}

function didStreetBetGetCalled(
  streetActions: ReplayActionInput[],
  isAggressorAction: (action: ReplayActionInput) => boolean,
): boolean {
  const aggressorBetIndex = streetActions.findIndex(
    (action) => isAggressorAction(action) && isAggressiveAction({ actionType: action.actionType ?? undefined }),
  );
  if (aggressorBetIndex < 0) return false;

  const reactions = streetActions.slice(aggressorBetIndex + 1);
  for (const action of reactions) {
    if (isAggressorAction(action)) continue;
    if (isCallAction({ actionType: action.actionType ?? undefined })) return true;
    if (isAggressiveAction({ actionType: action.actionType ?? undefined })) return false;
  }

  return false;
}

function didStreetBetWinImmediately(
  streetActions: ReplayActionInput[],
  isAggressorAction: (action: ReplayActionInput) => boolean,
): boolean {
  const aggressorBetIndex = streetActions.findIndex(
    (action) => isAggressorAction(action) && isAggressiveAction({ actionType: action.actionType ?? undefined }),
  );
  if (aggressorBetIndex < 0) return false;

  let foldedOpponent = false;
  const reactions = streetActions.slice(aggressorBetIndex + 1);
  for (const action of reactions) {
    if (isAggressorAction(action)) continue;
    if (isCallAction({ actionType: action.actionType ?? undefined }) || isAggressiveAction({ actionType: action.actionType ?? undefined })) {
      return false;
    }
    if (isFoldAction({ actionType: action.actionType ?? undefined })) {
      foldedOpponent = true;
    }
  }

  return foldedOpponent;
}

function getDirectHeroResponseToFlopCbetIndex(
  flopActions: ReplayActionInput[],
  villainCbetIndex: number,
  isHeroAction: (action: ReplayActionInput) => boolean,
): number {
  for (let index = villainCbetIndex + 1; index < flopActions.length; index += 1) {
    const action = flopActions[index];
    if (!action) continue;

    if (isHeroAction(action)) {
      return index;
    }

    const normalizedType = String(action.actionType ?? "").trim().toLowerCase();
    if (normalizedType === "fold" || normalizedType === "check") {
      continue;
    }

    return -1;
  }

  return -1;
}

type ReplayHandFingerprint = {
  handRef: string;
  signature: string;
};

function buildInputDedupFingerprint(input: ImportReplayInput) {
  const heroName = normalizePlayerName(input.tournament.heroName);
  const actionsByHand = new Map<string, ReplayActionInput[]>();

  for (const action of input.actions) {
    const bucket = actionsByHand.get(action.handRef) ?? [];
    bucket.push(action);
    actionsByHand.set(action.handRef, bucket);
  }

  for (const bucket of actionsByHand.values()) {
    bucket.sort((a, b) => a.actionOrder - b.actionOrder);
  }

  const opponentNames = new Set<string>();
  const handFingerprints: ReplayHandFingerprint[] = [];

  for (const hand of input.hands.slice(0, DUPLICATE_SCAN_HAND_LIMIT)) {
    const actions = actionsByHand.get(hand.handRef) ?? [];
    const actionCount = actions.length;
    const betLikeCount = actions.filter((a) => a.actionType === "bet" || a.actionType === "raise" || a.actionType === "all_in").length;
    const playersSignature = Array.from(
      new Set(
        actions
          .map((a) => normalizePlayerName(a.playerName))
          .filter(Boolean),
      ),
    )
      .sort()
      .join(",");
    const actionsSignature = actions
      .filter((a) => !a.isForced)
      .slice(0, 60)
      .map((a) => {
        const player = normalizePlayerName(a.playerName);
        const type = normalizeActionType(a.actionType ?? undefined);
        const amount = Number(a.amount ?? 0);
        const toAmount = Number(a.toAmount ?? 0);
        return `${player}:${type}:${amount}:${toAmount}`;
      })
      .join(";");

    for (const action of actions) {
      const normalized = normalizePlayerName(action.playerName);
      if (normalized && normalized !== heroName) {
        opponentNames.add(normalized);
      }
    }

    handFingerprints.push({
      handRef: hand.handRef,
      signature: [
        normalizeCards(hand.heroCards),
        Number(hand.smallBlind ?? 0),
        Number(hand.bigBlind ?? 0),
        Number(hand.ante ?? 0),
        playersSignature,
        actionsSignature,
        actionCount,
        betLikeCount,
      ].join("|"),
    });
  }

  return {
    heroName,
    totalHands: Number(input.tournament.totalHands ?? input.hands.length ?? 0),
    opponentSignature: Array.from(opponentNames).sort().join("|"),
    handFingerprints,
    externalTournamentId: normalizeId(input.tournament.externalTournamentId),
    rawSourceId: normalizeId(input.tournament.rawSourceId),
  };
}

async function buildStoredTournamentDedupFingerprint(db: any, tournamentId: number, heroName: string) {
  const storedHands = await db
    .select({
      id: centralHands.id,
      heroCards: centralHands.heroCards,
      smallBlind: centralHands.smallBlind,
      bigBlind: centralHands.bigBlind,
      ante: centralHands.ante,
    })
    .from(centralHands)
    .where(eq(centralHands.tournamentId, tournamentId))
    .orderBy(asc(centralHands.id))
    .limit(DUPLICATE_SCAN_HAND_LIMIT);

  if (storedHands.length === 0) {
    return { opponentSignature: "", handFingerprints: [] as string[] };
  }

  const handIds = storedHands.map((h) => h.id);
  const actionRows = await db
    .select({
      handId: centralHandActions.handId,
      actionType: centralHandActions.actionType,
      playerName: centralHandActions.playerName,
      amount: centralHandActions.amount,
      toAmount: centralHandActions.toAmount,
      isForced: centralHandActions.isForced,
      actionOrder: centralHandActions.actionOrder,
    })
    .from(centralHandActions)
    .where(eq(centralHandActions.tournamentId, tournamentId))
    .orderBy(asc(centralHandActions.handId), asc(centralHandActions.actionOrder));

  const filteredActions = actionRows.filter((a: any) => handIds.includes(Number(a.handId)));
  const byHand = new Map<number, Array<{ actionType: string; playerName: string; amount: number | null; toAmount: number | null; isForced: number | null }>>();
  for (const action of filteredActions) {
    const bucket = byHand.get(Number(action.handId)) ?? [];
    bucket.push({
      actionType: action.actionType,
      playerName: action.playerName,
      amount: action.amount,
      toAmount: action.toAmount,
      isForced: action.isForced,
    });
    byHand.set(Number(action.handId), bucket);
  }

  const opponentNames = new Set<string>();
  const handFingerprints = storedHands.map((hand) => {
    const actions = byHand.get(hand.id) ?? [];
    const actionCount = actions.length;
    const betLikeCount = actions.filter((a) => a.actionType === "bet" || a.actionType === "raise" || a.actionType === "all_in").length;
    const playersSignature = Array.from(
      new Set(
        actions
          .map((a) => normalizePlayerName(a.playerName))
          .filter(Boolean),
      ),
    )
      .sort()
      .join(",");
    const actionsSignature = actions
      .filter((a) => Number(a.isForced ?? 0) !== 1)
      .slice(0, 60)
      .map((a) => {
        const player = normalizePlayerName(a.playerName);
        const type = normalizeActionType(a.actionType ?? undefined);
        const amount = Number(a.amount ?? 0);
        const toAmount = Number(a.toAmount ?? 0);
        return `${player}:${type}:${amount}:${toAmount}`;
      })
      .join(";");

    for (const action of actions) {
      const normalized = normalizePlayerName(action.playerName);
      if (normalized && normalized !== heroName) {
        opponentNames.add(normalized);
      }
    }

    return [
      normalizeCards(hand.heroCards ?? undefined),
      Number(hand.smallBlind ?? 0),
      Number(hand.bigBlind ?? 0),
      Number(hand.ante ?? 0),
      playersSignature,
      actionsSignature,
      actionCount,
      betLikeCount,
    ].join("|");
  });

  return {
    opponentSignature: Array.from(opponentNames).sort().join("|"),
    handFingerprints,
  };
}

function hasConsecutiveFingerprintMatch(a: string[], b: string[], windowSize: number): boolean {
  if (a.length < windowSize || b.length < windowSize) return false;

  let streak = 0;
  const maxLen = Math.min(a.length, b.length);
  for (let i = 0; i < maxLen; i += 1) {
    if (a[i] === b[i]) {
      streak += 1;
      if (streak >= windowSize) return true;
    } else {
      streak = 0;
    }
  }
  return false;
}

async function deleteTournamentCascade(db: any, userId: number, tournamentId: number) {
  await db.delete(centralHandActions).where(and(eq(centralHandActions.userId, userId), eq(centralHandActions.tournamentId, tournamentId)));
  await db.delete(showdownRecords).where(and(eq(showdownRecords.userId, userId), eq(showdownRecords.tournamentId, tournamentId)));
  await db.delete(playerTournamentStats).where(and(eq(playerTournamentStats.userId, userId), eq(playerTournamentStats.tournamentId, tournamentId)));
  await db.delete(centralHands).where(and(eq(centralHands.userId, userId), eq(centralHands.tournamentId, tournamentId)));
  await db.delete(centralTournaments).where(and(eq(centralTournaments.userId, userId), eq(centralTournaments.id, tournamentId)));
}

async function persistTournamentStats(
  db: any,
  userId: number,
  tournamentId: number,
  input: ImportReplayInput,
  abiBucket: string,
  totalCost: number,
) {
  const tournamentAnalysis = await analyzeReplayTournament(input);

  await db.delete(playerTournamentStats).where(
    and(eq(playerTournamentStats.userId, userId), eq(playerTournamentStats.tournamentId, tournamentId)),
  );

  await db.insert(playerTournamentStats).values({
    userId,
    tournamentId,
    handsPlayed: input.hands.length,
    vpip: Number(tournamentAnalysis.stats.vpip ?? 0),
    pfr: Number(tournamentAnalysis.stats.pfr ?? 0),
    threeBet: Number(tournamentAnalysis.stats.threeBet ?? 0),
    cbetFlop: Number(tournamentAnalysis.stats.cbetFlop ?? 0),
    cbetTurn: Number(tournamentAnalysis.stats.cbetTurn ?? 0),
    foldToCbet: Number(tournamentAnalysis.stats.foldToCbet ?? 0),
    bbDefense: Number(tournamentAnalysis.stats.bbDefense ?? 0),
    stealAttempt: Number(tournamentAnalysis.stats.attemptToSteal ?? 0),
    aggressionFactor: Math.round(Number(tournamentAnalysis.stats.aggressionFactor ?? 0)),
    wtsd: Number(tournamentAnalysis.stats.wtsd ?? 0),
    wsd: Number(tournamentAnalysis.stats.wsd ?? 0),
    finalPosition: input.tournament.finalPosition ?? null,
    abiBucket,
    totalCost,
  });
}

async function finalizeImportedReplay(
  db: any,
  userId: number,
  tournamentId: number,
  input: ImportReplayInput,
  abiBucket: string,
  totalCost: number,
  site: string,
  allowFieldAggregation: boolean,
) {
  await persistTournamentStats(db, userId, tournamentId, input, abiBucket, totalCost);
  enqueueReplayStatsRecalculation(userId, {
    delayMs: REPLAY_RECALC_IMPORT_DELAY_MS,
    reason: "import_replay",
  });
  if (allowFieldAggregation) {
    await refreshFieldAbiAggregates(site, abiBucket);
  }
}

async function reuseExistingReplayImport(
  db: any,
  userId: number,
  tournamentId: number,
  input: ImportReplayInput,
  abiBucket: string,
  totalCost: number,
  site: string,
  allowFieldAggregation: boolean,
) {
  await finalizeImportedReplay(db, userId, tournamentId, input, abiBucket, totalCost, site, allowFieldAggregation);
  return {
    tournamentId,
    handsImported: input.hands.length,
    reusedExisting: true,
  };
}

function toPct(numerator: number, denominator: number): number {
  if (denominator <= 0) return 0;
  return Math.round((numerator / denominator) * 100);
}

function round2(value: number): number {
  return Math.round(value * 100) / 100;
}

function normalizeStreet(value: string | undefined): string {
  return String(value ?? "").trim().toLowerCase();
}

function normalizeActionType(value: string | undefined): string {
  return String(value ?? "").trim().toLowerCase();
}

function isAggressiveAction(action: { actionType?: string }): boolean {
  const type = normalizeActionType(action.actionType);
  return type === "bet" || type === "raise" || type === "all_in";
}

function isCallAction(action: { actionType?: string }): boolean {
  return normalizeActionType(action.actionType) === "call";
}

function isFoldAction(action: { actionType?: string }): boolean {
  return normalizeActionType(action.actionType) === "fold";
}

function isVoluntaryPreflopAction(action: { actionType?: string; isForced?: boolean | null }): boolean {
  if (action.isForced) return false;
  const type = normalizeActionType(action.actionType);
  return type === "call" || type === "bet" || type === "raise" || type === "all_in";
}

function isStealBlockingPreflopAction(action: { actionType?: string; isForced?: boolean | null }): boolean {
  if (action.isForced) return false;
  const type = normalizeActionType(action.actionType);
  return type === "call" || type === "bet" || type === "raise" || type === "all_in" || type === "straddle" || type === "post_blind";
}

const CBET_ALL_IN_OUTLIER_MULTIPLIER = 10;

function getActionCommitAmount(action: { amount?: number | null; toAmount?: number | null }): number {
  const amount = Number(action.amount ?? 0);
  if (amount > 0) return amount;
  const toAmount = Number(action.toAmount ?? 0);
  return toAmount > 0 ? toAmount : 0;
}

function isOutlierCbetAction(action: {
  actionType?: string;
  isAllIn?: boolean | number | null;
  amount?: number | null;
  toAmount?: number | null;
  potBefore?: number | null;
}): boolean {
  if (!isAggressiveAction({ actionType: action.actionType })) return false;
  const isAllInFlag = action.isAllIn === true || Number(action.isAllIn ?? 0) === 1;
  if (!isAllInFlag) return false;

  const potBefore = Number(action.potBefore ?? 0);
  if (potBefore <= 0) return false;

  const commitAmount = getActionCommitAmount(action);
  if (commitAmount <= 0) return false;

  return commitAmount >= (potBefore * CBET_ALL_IN_OUTLIER_MULTIPLIER);
}

type LiveHistoricalStats = {
  hands: number;
  vpip: number;
  pfr: number;
  threeBet: number;
  cbetFlop: number;
  cbetTurn: number;
  foldToCbet: number;
  bbDefense: number;
  attemptToSteal: number;
  aggressionFactor: number;
  wtsd: number;
  wsd: number;
  allInAdjBb100: number;
  opportunities: {
    hands: number;
    cbetFlop: number;
    cbetTurn: number;
    foldToCbet: number;
    bbDefense: number;
    steal: number;
    aggressionActions: number;
    aggressionCalls: number;
    showdownHands: number;
    allInAdjOpportunities: number;
    allInAdjSample: number;
    allInAdjSkipped: number;
  };
};

async function computeLiveHistoricalStatsFromHands(db: any, userId: number): Promise<LiveHistoricalStats | null> {
  const [userRow] = await db
    .select({
      name: users.name,
    })
    .from(users)
    .where(eq(users.id, userId))
    .limit(1);

  const profileHeroName = normalizePlayerName(userRow?.name ?? undefined);

  const hands = await db
    .select({
      id: centralHands.id,
      tournamentId: centralHands.tournamentId,
      heroSeat: centralHands.heroSeat,
      heroCards: centralHands.heroCards,
      heroPosition: centralHands.heroPosition,
      board: centralHands.board,
      bigBlind: centralHands.bigBlind,
      totalPot: centralHands.totalPot,
      showdown: centralHands.showdown,
      result: centralHands.result,
    })
    .from(centralHands)
    .where(eq(centralHands.userId, userId));

  if (hands.length === 0) return null;

  const actions = await db
    .select({
      handId: centralHandActions.handId,
      street: centralHandActions.street,
      actionOrder: centralHandActions.actionOrder,
      playerName: centralHandActions.playerName,
      seat: centralHandActions.seat,
      position: centralHandActions.position,
      actionType: centralHandActions.actionType,
      amount: centralHandActions.amount,
      toAmount: centralHandActions.toAmount,
      potBefore: centralHandActions.potBefore,
      isAllIn: centralHandActions.isAllIn,
      isForced: centralHandActions.isForced,
      heroInHand: centralHandActions.heroInHand,
    })
    .from(centralHandActions)
    .where(eq(centralHandActions.userId, userId))
    .orderBy(asc(centralHandActions.handId), asc(centralHandActions.actionOrder));

  const actionsByHand = new Map<number, Array<{
    street: string | null;
    playerName: string | null;
    seat: number | null;
    position: string | null;
    actionType: string | null;
    amount: number | null;
    toAmount: number | null;
    potBefore: number | null;
    isAllIn: number | null;
    isForced: number | null;
    heroInHand: number | null;
  }>>();

  for (const action of actions) {
    const handId = Number(action.handId);
    const bucket = actionsByHand.get(handId) ?? [];
    bucket.push({
      street: action.street,
      playerName: action.playerName,
      seat: action.seat,
      position: action.position,
      actionType: action.actionType,
      amount: action.amount,
      toAmount: action.toAmount,
      potBefore: action.potBefore,
      isAllIn: action.isAllIn,
      isForced: action.isForced,
      heroInHand: action.heroInHand,
    });
    actionsByHand.set(handId, bucket);
  }

  const showdowns = await db
    .select({
      handId: showdownRecords.handId,
      playerName: showdownRecords.playerName,
      seat: showdownRecords.seat,
      holeCards: showdownRecords.holeCards,
    })
    .from(showdownRecords)
    .where(eq(showdownRecords.userId, userId));

  const showdownsByHand = new Map<number, Array<{
    playerName: string | null;
    seat: number | null;
    holeCards: string | null;
  }>>();

  for (const showdown of showdowns) {
    const handId = Number(showdown.handId ?? 0);
    if (!handId) continue;
    const bucket = showdownsByHand.get(handId) ?? [];
    bucket.push({
      playerName: showdown.playerName,
      seat: showdown.seat,
      holeCards: showdown.holeCards,
    });
    showdownsByHand.set(handId, bucket);
  }

  let vpipHands = 0;
  let pfrHands = 0;
  let threeBetHands = 0;
  let cbetOpportunities = 0;
  let cbetMade = 0;
  let cbetTurnOpportunities = 0;
  let cbetTurnMade = 0;
  let foldToCbetOpportunities = 0;
  let foldToCbetCount = 0;
  let bbDefenseOpportunities = 0;
  let bbDefenseCount = 0;
  let stealOpportunities = 0;
  let stealAttemptCount = 0;
  let aggressionActions = 0;
  let callActions = 0;
  let allInAdjTotalBb = 0;
  let allInAdjHandsCount = 0;
  let allInAdjSkipped = 0;

  for (const hand of hands) {
    const handId = Number(hand.id);
    const heroName = profileHeroName;
    const handActions = actionsByHand.get(handId) ?? [];
    const heroSeat = Number(hand.heroSeat ?? 0);
    const hasHeroCards = String(hand.heroCards ?? "").trim().length > 0;
    const isHeroAction = (action: { heroInHand?: number | null; seat?: number | null; playerName?: string | null }) => Number(action.heroInHand ?? 0) === 1
      || (heroSeat > 0 && Number(action.seat ?? 0) === heroSeat)
      || (heroName.length > 0 && normalizePlayerName(action.playerName ?? undefined) === heroName);
    const hasHeroNonForcedAction = handActions.some(
      (action) => isHeroAction(action) && Number(action.isForced ?? 0) !== 1,
    );
    if (!hasHeroCards && !hasHeroNonForcedAction) continue;

    const preflop = handActions.filter((a) => normalizeStreet(a.street ?? undefined) === "preflop");
    const heroPreflop = preflop.filter((a) => isHeroAction(a));

    const voluntaryPreflop = heroPreflop.some((a) => isVoluntaryPreflopAction({ actionType: a.actionType ?? undefined, isForced: Number(a.isForced ?? 0) === 1 }));
    if (voluntaryPreflop) vpipHands += 1;

    const heroPreflopAggression = heroPreflop.some((a) => isAggressiveAction({ actionType: a.actionType ?? undefined }));
    if (heroPreflopAggression) pfrHands += 1;

    const firstHeroRaiseIndex = preflop.findIndex((a) => isHeroAction(a) && isAggressiveAction({ actionType: a.actionType ?? undefined }));
    if (firstHeroRaiseIndex >= 0) {
      const hadPriorRaise = preflop.slice(0, firstHeroRaiseIndex).some((a) => !isHeroAction(a) && isAggressiveAction({ actionType: a.actionType ?? undefined }));
      if (hadPriorRaise) threeBetHands += 1;
    }

    const preflopAggressor = [...preflop].reverse().find((a) => Number(a.isForced ?? 0) !== 1 && isAggressiveAction({ actionType: a.actionType ?? undefined }));
    const preflopAggressorIsHero = preflopAggressor ? isHeroAction(preflopAggressor) : false;
    const preflopAggressorName = normalizePlayerName(preflopAggressor?.playerName ?? undefined);

    const flop = handActions.filter((a) => normalizeStreet(a.street ?? undefined) === "flop");
    const flopCbetActor = flop.length > 0 ? getTrueFlopCbetActor(flop as ReplayActionInput[], preflopAggressorName) : "";
    let heroCbetFlopThisHand = false;
    if (preflopAggressorIsHero && flop.length > 0) {
      const cbetEval = getFlopCbetOpportunityAndMade(
        flop as ReplayActionInput[],
        (action) => isHeroAction(action),
      );
      if (cbetEval.hasOpportunity) {
        cbetOpportunities += 1;
      }
      // Historical profile must trust hero markers in hand actions (heroInHand/seat),
      // not profile display name matching, which can differ from hand-history aliases.
      const heroFlopCbet = cbetEval.hasOpportunity && cbetEval.madeCbet;
      if (heroFlopCbet) cbetMade += 1;
      heroCbetFlopThisHand = heroFlopCbet;
    } else if (preflopAggressorName && !preflopAggressorIsHero && flopCbetActor === preflopAggressorName) {
      const villainCbetIndex = flop.findIndex(
        (a) => normalizePlayerName(a.playerName ?? undefined) === preflopAggressorName
          && isAggressiveAction({ actionType: a.actionType ?? undefined }),
      );
      if (villainCbetIndex >= 0) {
        const firstHeroResponseIndex = getDirectHeroResponseToFlopCbetIndex(
          flop,
          villainCbetIndex,
          isHeroAction,
        );
        if (firstHeroResponseIndex >= 0) {
          foldToCbetOpportunities += 1;
          const heroResponse = flop[firstHeroResponseIndex];
          if (heroResponse && isFoldAction({ actionType: heroResponse.actionType ?? undefined })) {
            foldToCbetCount += 1;
          }
        }
      }
    }

    const turn = handActions.filter((a) => normalizeStreet(a.street ?? undefined) === "turn");
    const flopCbetCalled = heroCbetFlopThisHand && didStreetBetGetCalled(
      flop as ReplayActionInput[],
      (action) => isHeroAction(action),
    );
    if (flopCbetCalled && turn.length > 0) {
      const turnBarrelEval = getFlopCbetOpportunityAndMade(
        turn as ReplayActionInput[],
        (action) => isHeroAction(action),
      );
      if (turnBarrelEval.hasOpportunity) {
        cbetTurnOpportunities += 1;
        if (turnBarrelEval.madeCbet) cbetTurnMade += 1;
      }
    }

    const heroPosition = resolveHeroPositionWithFallback(
      hand.heroPosition ?? undefined,
      preflop,
      isHeroAction,
    );
    const handBigBlind = Number(hand.bigBlind ?? 0);
    const handResult = Number(hand.result ?? 0);
    const handResultBb = handBigBlind > 0 ? handResult / handBigBlind : 0;
    if (heroPosition === "BB") {
      const heroVoluntaryPreflopIndex = preflop.findIndex((a) => isHeroAction(a) && Number(a.isForced ?? 0) !== 1);
      if (heroVoluntaryPreflopIndex >= 0) {
        const facedOpenBeforeActing = preflop.slice(0, heroVoluntaryPreflopIndex).some((a) => !isHeroAction(a) && isAggressiveAction({ actionType: a.actionType ?? undefined }));
        if (facedOpenBeforeActing) {
          bbDefenseOpportunities += 1;
          const heroAction = preflop[heroVoluntaryPreflopIndex];
          if (heroAction && (isCallAction({ actionType: heroAction.actionType ?? undefined }) || isAggressiveAction({ actionType: heroAction.actionType ?? undefined }))) {
            bbDefenseCount += 1;
          }
        }
      }
    }

    const inStealPosition = heroPosition === "CO" || heroPosition === "BTN" || heroPosition === "SB";
    if (inStealPosition) {
      const firstHeroDecisionIndex = preflop.findIndex(
        (a) => isHeroAction(a) && Number(a.isForced ?? 0) !== 1,
      );
      if (firstHeroDecisionIndex >= 0) {
        const action = preflop[firstHeroDecisionIndex];
        const hadPriorEntry = preflop
          .slice(0, firstHeroDecisionIndex)
          .some((a) => !isHeroAction(a) && isStealBlockingPreflopAction({ actionType: a.actionType ?? undefined, isForced: Number(a.isForced ?? 0) === 1 }));
        if (!hadPriorEntry) {
          stealOpportunities += 1;
          if (action && isAggressiveAction({ actionType: action.actionType ?? undefined })) {
            stealAttemptCount += 1;
          }
        }
      }
    }

    for (const action of handActions) {
      if (!isHeroAction(action)) continue;
      if (isCallAction({ actionType: action.actionType ?? undefined })) callActions += 1;
      if (isAggressiveAction({ actionType: action.actionType ?? undefined })) aggressionActions += 1;
    }

    // Historical All-in Adj (EV BB/100): non-all-in hands use real result in BB,
    // all-in hands attempt equity replacement when showdown hole cards are available.
    let adjustedBb = handResultBb;
    if (handBigBlind > 0) {
      const heroAllInIdx = handActions.findIndex(
        (a) => isHeroAction(a)
          && (Number(a.isAllIn ?? 0) === 1 || normalizeActionType(a.actionType ?? undefined) === "all_in")
          && normalizeStreet(a.street ?? undefined) !== "showdown"
          && normalizeStreet(a.street ?? undefined) !== "summary",
      );

      if (heroAllInIdx >= 0) {
        const handShowdowns = showdownsByHand.get(handId) ?? [];
        const heroShowdown = handShowdowns.find((s) => {
          const bySeat = heroSeat > 0 && Number(s.seat ?? 0) === heroSeat;
          const byName = heroName.length > 0 && normalizePlayerName(s.playerName ?? undefined) === heroName;
          return bySeat || byName;
        });
        const villainShowdowns = handShowdowns.filter((s) => {
          const isHero = (heroSeat > 0 && Number(s.seat ?? 0) === heroSeat)
            || (heroName.length > 0 && normalizePlayerName(s.playerName ?? undefined) === heroName);
          return !isHero && typeof s.holeCards === "string" && s.holeCards.trim().length >= 4;
        });

        const heroCardsRaw = heroShowdown?.holeCards ?? hand.heroCards;
        const heroCards = normalizeCards(heroCardsRaw).split(/\s+/).filter(Boolean);
        const villainCards = villainShowdowns.map((s) => normalizeCards(s.holeCards).split(/\s+/).filter(Boolean));

        const boardFull = normalizeCards(hand.board).split(/\s+/).filter(Boolean);
        const streetAtAllIn = normalizeStreet(handActions[heroAllInIdx].street ?? undefined);
        const knownBoardLen = streetAtAllIn === "preflop"
          ? 0
          : streetAtAllIn === "flop"
          ? 3
          : streetAtAllIn === "turn"
          ? 4
          : 5;
        const knownBoard = boardFull.slice(0, Math.min(knownBoardLen, boardFull.length));

        const qualified = heroCards.length === 2
          && villainCards.length >= 1
          && villainCards.every((v) => v.length === 2);

        if (qualified) {
          try {
            const eq = equityAtAllIn({
              heroHole: heroCards,
              villainHoles: villainCards,
              knownBoard,
              maxSamples: 20000,
            });
            if (eq && Number.isFinite(eq.hero)) {
              let heroInvested = 0;
              for (const a of handActions) {
                if (!isHeroAction(a)) continue;
                const t = normalizeActionType(a.actionType ?? undefined);
                if (t === "fold" || t === "check" || t === "show" || t === "muck" || t === "collect" || t === "other") continue;
                const amt = Number(a.amount ?? 0);
                if (Number.isFinite(amt) && amt > 0) heroInvested += amt;
              }
              const totalPot = Math.max(0, Number(hand.totalPot ?? 0));
              if (totalPot > 0 && heroInvested > 0) {
                const evChips = eq.hero * totalPot - heroInvested;
                adjustedBb = evChips / handBigBlind;
                allInAdjHandsCount += 1;
              } else {
                allInAdjSkipped += 1;
              }
            } else {
              allInAdjSkipped += 1;
            }
          } catch {
            allInAdjSkipped += 1;
          }
        } else {
          allInAdjSkipped += 1;
        }
      }
    }
    allInAdjTotalBb += adjustedBb;
  }

  const eligibleHands = hands.filter((hand) => {
    const handId = Number(hand.id ?? 0);
    const heroName = profileHeroName;
    const handActions = actionsByHand.get(handId) ?? [];
    const heroSeat = Number(hand.heroSeat ?? 0);
    const hasHeroCards = String(hand.heroCards ?? "").trim().length > 0;
    const hasHeroNonForcedAction = handActions.some((action) => {
      const isHero = Number(action.heroInHand ?? 0) === 1
        || (heroSeat > 0 && Number(action.seat ?? 0) === heroSeat)
        || (heroName.length > 0 && normalizePlayerName(action.playerName ?? undefined) === heroName);
      return isHero && Number(action.isForced ?? 0) !== 1;
    });
    return hasHeroCards || hasHeroNonForcedAction;
  });

  const handsCount = eligibleHands.length;
  const showdownHands = eligibleHands.filter((h) => Number(h.showdown ?? 0) === 1);
  const wonAtShowdown = showdownHands.filter((h) => Number(h.result ?? 0) > 0).length;

  return {
    hands: handsCount,
    vpip: toPct(vpipHands, handsCount),
    pfr: toPct(pfrHands, handsCount),
    threeBet: toPct(threeBetHands, handsCount),
    cbetFlop: toPct(cbetMade, cbetOpportunities),
    cbetTurn: toPct(cbetTurnMade, cbetTurnOpportunities),
    foldToCbet: toPct(foldToCbetCount, foldToCbetOpportunities),
    bbDefense: toPct(bbDefenseCount, bbDefenseOpportunities),
    attemptToSteal: toPct(stealAttemptCount, stealOpportunities),
    aggressionFactor: callActions > 0 ? round2(aggressionActions / callActions) : (aggressionActions > 0 ? round2(aggressionActions) : 0),
    wtsd: toPct(showdownHands.length, handsCount),
    wsd: toPct(wonAtShowdown, showdownHands.length),
    allInAdjBb100: handsCount > 0 ? round2((allInAdjTotalBb / handsCount) * 100) : 0,
    opportunities: {
      hands: handsCount,
      cbetFlop: cbetOpportunities,
      cbetTurn: cbetTurnOpportunities,
      foldToCbet: foldToCbetOpportunities,
      bbDefense: bbDefenseOpportunities,
      steal: stealOpportunities,
      aggressionActions,
      aggressionCalls: callActions,
      showdownHands: showdownHands.length,
      allInAdjOpportunities: allInAdjHandsCount + allInAdjSkipped,
      allInAdjSample: allInAdjHandsCount,
      allInAdjSkipped,
    },
  };
}

export async function analyzeReplayTournament(input: ImportReplayInput) {
  let heroName = normalizePlayerName(input.tournament.heroName);
  const inferredHero = inferHeroFromFlags(input.actions);
  if (!heroName && inferredHero) {
    heroName = inferredHero;
  }

  const explicitHeroActionCount = input.actions.filter((a) => normalizePlayerName(a.playerName) === heroName).length;
  if (heroName && explicitHeroActionCount === 0 && inferredHero) {
    heroName = inferredHero;
  }

  if (!heroName) {
    throw new Error("HERO_REQUIRED");
  }

  const hands = input.hands;
  const actionsByHand = new Map<string, ReplayActionInput[]>();
  for (const action of input.actions) {
    const bucket = actionsByHand.get(action.handRef) ?? [];
    bucket.push(action);
    actionsByHand.set(action.handRef, bucket);
  }
  for (const bucket of actionsByHand.values()) {
    bucket.sort((a, b) => a.actionOrder - b.actionOrder);
  }

  const positionNet = new Map<string, number>();
  const positionNetBb = new Map<string, number>();
  const positionHands = new Map<string, number>();
  let vpipHands = 0;
  let pfrHands = 0;
  let threeBetHands = 0;
  let cbetOpportunities = 0;
  let cbetMade = 0;
  let cbetTurnOpportunities = 0;
  let cbetTurnMade = 0;
  let foldToCbetOpportunities = 0;
  let foldToCbetCount = 0;
  let bbDefenseOpportunities = 0;
  let bbDefenseCount = 0;
  let stealOpportunities = 0;
  let stealAttemptCount = 0;
  let aggressionActions = 0;
  let callActions = 0;
  // extended metrics
  let rfiOpportunities = 0;
  let rfiAttempts = 0;
  let coldCallOpportunities = 0;
  let coldCallCount = 0;
  let squeezeOpportunities = 0;
  let squeezeCount = 0;
  let restealOpportunities = 0;
  let restealCount = 0;
  let foldToStealOpportunities = 0;
  let foldToStealCount = 0;
  let foldTo3BetOpportunities = 0;
  let foldTo3BetCount = 0;
  let fourBetRatioOpportunities = 0;
  let fourBetRatioCount = 0;
  let foldTo4BetOpportunities = 0;
  let foldTo4BetCount = 0;
  let cbetIpOpportunities = 0;
  let cbetIpMade = 0;
  let cbetOopOpportunities = 0;
  let cbetOopMade = 0;
  let cbetFlopSuccessOpportunities = 0;
  let cbetFlopSuccessCount = 0;
  let floatFlopOpportunities = 0;
  let floatFlopCount = 0;
  let checkRaiseFlopOpportunities = 0;
  let checkRaiseFlopCount = 0;
  let sawFlopHands = 0;
  let wonWhenSawFlopCount = 0;

  // === All-in Adj (EV BB/100) ===
  // Soma o resultado em BB "ajustado pela sorte":
  //  - Para mãos sem all-in do hero pré-showdown: usa o resultado real em BB.
  //  - Para mãos com all-in do hero e cartas dos vilões visíveis: usa EV em BB
  //    (equity × pote total − investimento do hero), dividido pelo big blind.
  let allInAdjTotalBb = 0;
  let allInAdjHandsCount = 0; // mãos cujo EV foi recalculado (amostra de all-in)
  let allInAdjSkipped = 0; // mãos de all-in descartadas por falta de dados

  // indexa showdowns por handRef
  const showdownsByHand = new Map<string, ReplayShowdownInput[]>();
  for (const sd of input.showdowns) {
    const bucket = showdownsByHand.get(sd.handRef) ?? [];
    bucket.push(sd);
    showdownsByHand.set(sd.handRef, bucket);
  }

  for (const hand of hands) {
    const handActions = actionsByHand.get(hand.handRef) ?? [];
    const heroActions = handActions.filter((a) => normalizePlayerName(a.playerName) === heroName);
    const preflop = handActions.filter((a) => normalizeStreet(a.street) === "preflop");
    const heroPreflop = preflop.filter((a) => normalizePlayerName(a.playerName) === heroName);

    const voluntaryPreflop = heroPreflop.some(
      (a) => isVoluntaryPreflopAction(a),
    );
    if (voluntaryPreflop) vpipHands += 1;

    const heroPreflopAggression = heroPreflop.some(
      (a) => isAggressiveAction(a),
    );
    if (heroPreflopAggression) pfrHands += 1;

    const firstHeroRaiseIndex = preflop.findIndex(
      (a) => normalizePlayerName(a.playerName) === heroName && isAggressiveAction(a),
    );
    if (firstHeroRaiseIndex >= 0) {
      const hadPriorRaise = preflop.slice(0, firstHeroRaiseIndex).some(
        (a) => normalizePlayerName(a.playerName) !== heroName && isAggressiveAction(a),
      );
      if (hadPriorRaise) threeBetHands += 1;
    }

    const heroPosition = resolveHeroPositionWithFallback(
      hand.heroPosition?.trim() || undefined,
      preflop,
      (action) => normalizePlayerName(action.playerName) === heroName,
    );
    const handResult = Number(hand.result ?? 0);
    const handBigBlind = Number(hand.bigBlind ?? 0);
    const handResultBb = handBigBlind > 0 ? handResult / handBigBlind : 0;

    positionNet.set(heroPosition, (positionNet.get(heroPosition) ?? 0) + handResult);
    positionNetBb.set(heroPosition, (positionNetBb.get(heroPosition) ?? 0) + handResultBb);
    positionHands.set(heroPosition, (positionHands.get(heroPosition) ?? 0) + 1);

    const preflopAggressor = [...preflop].reverse().find(
      (a) => !a.isForced && isAggressiveAction(a),
    );
    const preflopAggressorName = normalizePlayerName(preflopAggressor?.playerName);

    const flop = handActions.filter((a) => normalizeStreet(a.street) === "flop");
    if (flop.length > 0) {
      sawFlopHands += 1;
      if (handResult > 0) wonWhenSawFlopCount += 1;
    }
    let heroCbetFlopThisHand = false;
    const flopCbetActor = flop.length > 0 ? getTrueFlopCbetActor(flop, preflopAggressorName) : "";

    if (preflopAggressorName === heroName && flop.length > 0) {
      const cbetEval = getFlopCbetOpportunityAndMade(
        flop,
        (action) => normalizePlayerName(action.playerName) === heroName,
      );
      if (cbetEval.hasOpportunity) {
        cbetOpportunities += 1;
      }
      const heroFlopCbet = cbetEval.hasOpportunity && cbetEval.madeCbet && flopCbetActor === heroName;
      if (heroFlopCbet) cbetMade += 1;
      heroCbetFlopThisHand = heroFlopCbet;
      if (heroFlopCbet) {
        cbetFlopSuccessOpportunities += 1;
        if (didStreetBetWinImmediately(flop, (action) => normalizePlayerName(action.playerName) === heroName)) {
          cbetFlopSuccessCount += 1;
        }
      }
    } else if (preflopAggressorName && preflopAggressorName !== heroName && flopCbetActor === preflopAggressorName) {
      const villainCbetIndex = flop.findIndex(
        (a) => normalizePlayerName(a.playerName) === preflopAggressorName && isAggressiveAction(a),
      );
      if (villainCbetIndex >= 0) {
        const firstHeroResponseIndex = getDirectHeroResponseToFlopCbetIndex(
          flop,
          villainCbetIndex,
          (action) => normalizePlayerName(action.playerName) === heroName,
        );
        if (firstHeroResponseIndex >= 0) {
          foldToCbetOpportunities += 1;
          const heroResponse = flop[firstHeroResponseIndex];
          if (heroResponse && isFoldAction(heroResponse)) {
            foldToCbetCount += 1;
          }
        }
      }
    }

    const turn = handActions.filter((a) => normalizeStreet(a.street) === "turn");
    const flopCbetCalled = heroCbetFlopThisHand && didStreetBetGetCalled(
      flop,
      (action) => normalizePlayerName(action.playerName) === heroName,
    );
    if (flopCbetCalled && turn.length > 0) {
      const turnBarrelEval = getFlopCbetOpportunityAndMade(
        turn,
        (action) => normalizePlayerName(action.playerName) === heroName,
      );
      if (turnBarrelEval.hasOpportunity) {
        cbetTurnOpportunities += 1;
        if (turnBarrelEval.madeCbet) cbetTurnMade += 1;
      }
    }

    if (heroPosition === "BB") {
      // BB Defense (teoria): só existe oportunidade quando BB enfrenta open/agressão
      // antes da sua primeira ação voluntária pré-flop.
      // Defesa contabiliza call/raise/all-in (fold = não defesa).
      const heroVoluntaryPreflopIndex = preflop.findIndex(
        (a) => normalizePlayerName(a.playerName) === heroName && !a.isForced,
      );
      if (heroVoluntaryPreflopIndex >= 0) {
        const facedOpenBeforeActing = preflop.slice(0, heroVoluntaryPreflopIndex).some(
          (a) => normalizePlayerName(a.playerName) !== heroName
            && isAggressiveAction(a),
        );
        if (facedOpenBeforeActing) {
          bbDefenseOpportunities += 1;
          const heroAction = preflop[heroVoluntaryPreflopIndex];
          if (heroAction && (isCallAction(heroAction) || isAggressiveAction(heroAction))) {
            bbDefenseCount += 1;
          }
        }
      }
    }

    const inStealPosition = heroPosition === "CO" || heroPosition === "BTN" || heroPosition === "SB";
    if (inStealPosition) {
      const firstHeroDecisionIndex = preflop.findIndex(
        (a) => normalizePlayerName(a.playerName) === heroName && !a.isForced,
      );
      if (firstHeroDecisionIndex >= 0) {
        const action = preflop[firstHeroDecisionIndex];
        const hadPriorEntry = preflop
          .slice(0, firstHeroDecisionIndex)
          .some((a) => normalizePlayerName(a.playerName) !== heroName && isStealBlockingPreflopAction(a));
        if (!hadPriorEntry) {
          stealOpportunities += 1;
          if (action && isAggressiveAction(action)) {
            stealAttemptCount += 1;
          }
        }
      }
    }

    // === Extended preflop metrics (RFI / Cold Call / Squeeze / Fold-to-Steal / Resteal) ===
    const heroFirstVoluntaryIdx = preflop.findIndex(
      (a) => normalizePlayerName(a.playerName) === heroName && !a.isForced,
    );
    if (heroFirstVoluntaryIdx >= 0) {
      const priorActions = preflop.slice(0, heroFirstVoluntaryIdx);
      const priorVoluntary = priorActions.filter((a) => !a.isForced);
      const priorRaises = priorVoluntary.filter((a) => isAggressiveAction(a));
      const priorCalls = priorVoluntary.filter((a) => isCallAction(a));
      const heroFirstAction = preflop[heroFirstVoluntaryIdx];

      // RFI: hero é o primeiro a entrar voluntariamente no pote via raise
      if (priorVoluntary.length === 0 && heroPosition !== "BB") {
        rfiOpportunities += 1;
        if (heroFirstAction && isAggressiveAction(heroFirstAction)) rfiAttempts += 1;
      }

      // Cold Call: enfrenta 1 raise, sem callers prévios, decide
      if (priorRaises.length === 1 && priorCalls.length === 0) {
        coldCallOpportunities += 1;
        if (heroFirstAction && isCallAction(heroFirstAction)) coldCallCount += 1;
      }

      // Squeeze: 1 raise + >=1 caller na frente, decide aumentar
      if (priorRaises.length === 1 && priorCalls.length >= 1) {
        squeezeOpportunities += 1;
        if (heroFirstAction && isAggressiveAction(heroFirstAction)) squeezeCount += 1;
      }

      // Fold-to-Steal / Resteal: hero em blind contra 1 raise solo
      if ((heroPosition === "SB" || heroPosition === "BB") && priorRaises.length === 1 && priorCalls.length === 0) {
        foldToStealOpportunities += 1;
        restealOpportunities += 1;
        if (heroFirstAction && isFoldAction(heroFirstAction)) foldToStealCount += 1;
        if (heroFirstAction && isAggressiveAction(heroFirstAction)) restealCount += 1;
      }
    }

    // === Fold to 3-bet ===
    if (heroPreflopAggression) {
      const heroFirstAggIdx = preflop.findIndex(
        (a) => normalizePlayerName(a.playerName) === heroName && isAggressiveAction(a),
      );
      if (heroFirstAggIdx >= 0) {
        const afterHeroRaise = preflop.slice(heroFirstAggIdx + 1);
        const villain3BetIdx = afterHeroRaise.findIndex(
          (a) => normalizePlayerName(a.playerName) !== heroName && isAggressiveAction(a),
        );
        if (villain3BetIdx >= 0) {
          const postThreeBet = afterHeroRaise.slice(villain3BetIdx + 1);
          const heroResponse = postThreeBet.find((a) => normalizePlayerName(a.playerName) === heroName);
          if (heroResponse) {
            foldTo3BetOpportunities += 1;
            if (isFoldAction(heroResponse)) foldTo3BetCount += 1;
          }
        }
      }
    }

    // === 4-bet ratio / Fold to 4-bet (flow v4.0) ===
    const heroThreeBetIdx = preflop.findIndex((action, idx) => {
      if (normalizePlayerName(action.playerName) !== heroName || !isAggressiveAction(action)) return false;
      const priorRaises = preflop.slice(0, idx).filter((a) => normalizePlayerName(a.playerName) !== heroName && isAggressiveAction(a)).length;
      return priorRaises === 1;
    });
    if (heroThreeBetIdx >= 0) {
      fourBetRatioOpportunities += 1;
      const afterHeroThreeBet = preflop.slice(heroThreeBetIdx + 1);
      const villainFourBetIdx = afterHeroThreeBet.findIndex(
        (a) => normalizePlayerName(a.playerName) !== heroName && isAggressiveAction(a),
      );
      if (villainFourBetIdx >= 0) {
        const heroResponse = afterHeroThreeBet.slice(villainFourBetIdx + 1).find(
          (a) => normalizePlayerName(a.playerName) === heroName,
        );
        if (heroResponse) {
          foldTo4BetOpportunities += 1;
          if (isFoldAction(heroResponse)) foldTo4BetCount += 1;
          if (isAggressiveAction(heroResponse)) fourBetRatioCount += 1;
        }
      }
    }

    // === C-bet IP / OOP split ===
    if (preflopAggressorName === heroName && flop.length > 0) {
      const heroFlopIdx = flop.findIndex((a) => normalizePlayerName(a.playerName) === heroName);
      if (heroFlopIdx > 0) {
        cbetIpOpportunities += 1;
        if (heroCbetFlopThisHand) cbetIpMade += 1;
      } else if (heroFlopIdx === 0) {
        cbetOopOpportunities += 1;
        if (heroCbetFlopThisHand) cbetOopMade += 1;
      }
    }

    // === Float Flop: hero IP, pagou c-bet flop, agrediu turn ===
    if (preflopAggressorName && preflopAggressorName !== heroName && flop.length > 0) {
      const heroFlopIdx = flop.findIndex((a) => normalizePlayerName(a.playerName) === heroName);
      if (heroFlopIdx > 0) {
        const heroFlopAction = flop[heroFlopIdx];
        const villainCbetBeforeHero = flop.slice(0, heroFlopIdx).some(
          (a) => normalizePlayerName(a.playerName) === preflopAggressorName && isAggressiveAction(a),
        );
        if (villainCbetBeforeHero && heroFlopAction && isCallAction(heroFlopAction)) {
          floatFlopOpportunities += 1;
          const heroTurnAgg = turn.some(
            (a) => normalizePlayerName(a.playerName) === heroName && isAggressiveAction(a),
          );
          if (heroTurnAgg) floatFlopCount += 1;
        }
      }
    }

    // === Check-raise Flop: hero checka flop, vilão aposta, hero aumenta ===
    if (flop.length > 0) {
      const heroFlopIdx = flop.findIndex((a) => normalizePlayerName(a.playerName) === heroName);
      if (heroFlopIdx >= 0 && normalizeActionType(flop[heroFlopIdx].actionType) === "check") {
        const afterHero = flop.slice(heroFlopIdx + 1);
        const villainBetIdx = afterHero.findIndex(
          (a) => normalizePlayerName(a.playerName) !== heroName && isAggressiveAction(a),
        );
        if (villainBetIdx >= 0) {
          checkRaiseFlopOpportunities += 1;
          const heroAfterBet = afterHero.slice(villainBetIdx + 1).find(
            (a) => normalizePlayerName(a.playerName) === heroName,
          );
          if (heroAfterBet && isAggressiveAction(heroAfterBet)) {
            checkRaiseFlopCount += 1;
          }
        }
      }
    }

    for (const action of heroActions) {
      if (isCallAction(action)) callActions += 1;
      if (isAggressiveAction(action)) aggressionActions += 1;
    }

    // === All-in Adj (EV BB/100) ===
    // Default: contribui com o resultado real (em BB) da mão.
    let adjustedBb = handResultBb;
    if (handBigBlind > 0) {
      // Detecta primeiro all-in do hero antes do showdown
      const heroAllInIdx = handActions.findIndex(
        (a) => normalizePlayerName(a.playerName) === heroName
          && (Number(a.isAllIn ?? 0) === 1 || normalizeActionType(a.actionType) === "all_in")
          && normalizeStreet(a.street) !== "showdown"
          && normalizeStreet(a.street) !== "summary",
      );

      if (heroAllInIdx >= 0) {
        const showdowns = showdownsByHand.get(hand.handRef) ?? [];
        const heroShowdown = showdowns.find(
          (s) => normalizePlayerName(s.playerName) === heroName,
        );
        const villainShowdowns = showdowns.filter(
          (s) => normalizePlayerName(s.playerName) !== heroName
            && typeof s.holeCards === "string"
            && s.holeCards.trim().length >= 4,
        );

        const heroCardsRaw = heroShowdown?.holeCards ?? hand.heroCards;
        const heroCards = normalizeCards(heroCardsRaw).split(/\s+/).filter(Boolean);
        const villainCards = villainShowdowns.map((s) => normalizeCards(s.holeCards).split(/\s+/).filter(Boolean));

        // Board conhecido até a rua do all-in (flop/turn/river → 3/4/5 cartas; preflop → 0)
        const boardFull = normalizeCards(hand.board).split(/\s+/).filter(Boolean);
        const streetAtAllIn = normalizeStreet(handActions[heroAllInIdx].street);
        const knownBoardLen = streetAtAllIn === "preflop"
          ? 0
          : streetAtAllIn === "flop"
          ? 3
          : streetAtAllIn === "turn"
          ? 4
          : 5;
        const knownBoard = boardFull.slice(0, Math.min(knownBoardLen, boardFull.length));

        const qualified = heroCards.length === 2
          && villainCards.length >= 1
          && villainCards.every((v) => v.length === 2);

        if (qualified) {
          try {
            const eq = equityAtAllIn({
              heroHole: heroCards,
              villainHoles: villainCards,
              knownBoard,
              maxSamples: 20000,
            });
            if (eq && Number.isFinite(eq.hero)) {
              // Calcula investimento do hero em chips somando aportes dele.
              let heroInvested = 0;
              for (const a of handActions) {
                if (normalizePlayerName(a.playerName) !== heroName) continue;
                const t = normalizeActionType(a.actionType);
                if (t === "fold" || t === "check" || t === "show" || t === "muck" || t === "collect" || t === "other") continue;
                const amt = Number(a.amount ?? 0);
                if (Number.isFinite(amt) && amt > 0) heroInvested += amt;
              }
              const totalPot = Math.max(0, Number(hand.totalPot ?? 0));
              // Se totalPot não estiver disponível, estima via result + heroInvested*(N+1) — inviável; pula mão.
              if (totalPot > 0 && heroInvested > 0) {
                const evChips = eq.hero * totalPot - heroInvested;
                const evBb = evChips / handBigBlind;
                adjustedBb = evBb;
                allInAdjHandsCount += 1;
              } else {
                allInAdjSkipped += 1;
              }
            } else {
              allInAdjSkipped += 1;
            }
          } catch {
            allInAdjSkipped += 1;
          }
        } else {
          allInAdjSkipped += 1;
        }
      }
    }
    allInAdjTotalBb += adjustedBb;
  }

  const showdownsCount = new Set(input.showdowns.map((s) => s.handRef)).size;
  const buyIn = Math.max(0, Number(input.tournament.buyIn ?? 0));
  const fee = Math.max(0, Number(input.tournament.fee ?? 0));
  const abiValue = buyIn + fee;
  const abiBucket = getAbiBucket(abiValue);
  const validDates = hands
    .map((h) => h.datetimeOriginal)
    .filter((d): d is Date => d instanceof Date && !Number.isNaN(d.getTime()))
    .sort((a, b) => a.getTime() - b.getTime());
  const durationMinutes = validDates.length >= 2
    ? Math.max(1, Math.round((validDates[validDates.length - 1].getTime() - validDates[0].getTime()) / 60000))
    : null;

  const positionEntries = Array.from(positionNet.entries()).map(([position, netChips]) => ({
    position,
    netChips,
    netBb: round2(positionNetBb.get(position) ?? 0),
    hands: positionHands.get(position) ?? 0,
  }));
  positionEntries.sort((a, b) => b.netBb - a.netBb);
  const bestPosition = positionEntries[0] ?? null;
  const worstPosition = positionEntries.length > 0 ? [...positionEntries].sort((a, b) => a.netBb - b.netBb)[0] : null;

  const totalNetChips = hands.reduce((acc, hand) => acc + Number(hand.result ?? 0), 0);
  const totalNetBb = round2(hands.reduce((acc, hand) => {
    const handBigBlind = Number(hand.bigBlind ?? 0);
    if (handBigBlind <= 0) return acc;
    return acc + (Number(hand.result ?? 0) / handBigBlind);
  }, 0));

  const vpip = toPct(vpipHands, hands.length);
  const pfr = toPct(pfrHands, hands.length);
  const threeBet = toPct(threeBetHands, hands.length);
  const cbetFlop = toPct(cbetMade, cbetOpportunities);
  const foldToCbet = toPct(foldToCbetCount, foldToCbetOpportunities);
  const bbDefense = toPct(bbDefenseCount, bbDefenseOpportunities);
  const attemptToSteal = toPct(stealAttemptCount, stealOpportunities);
  const aggressionFactor = callActions > 0 ? round2(aggressionActions / callActions) : (aggressionActions > 0 ? round2(aggressionActions) : 0);
  const cbetTurn = toPct(cbetTurnMade, cbetTurnOpportunities);
  const cbetSuccessRate = toPct(cbetFlopSuccessCount, cbetFlopSuccessOpportunities);
  const rfi = toPct(rfiAttempts, rfiOpportunities);
  const coldCall = toPct(coldCallCount, coldCallOpportunities);
  const squeeze = toPct(squeezeCount, squeezeOpportunities);
  const resteal = toPct(restealCount, restealOpportunities);
  const foldToSteal = toPct(foldToStealCount, foldToStealOpportunities);
  const foldTo3Bet = toPct(foldTo3BetCount, foldTo3BetOpportunities);
  const fourBetRatio = toPct(fourBetRatioCount, fourBetRatioOpportunities);
  const foldTo4Bet = toPct(foldTo4BetCount, foldTo4BetOpportunities);
  const cbetIp = toPct(cbetIpMade, cbetIpOpportunities);
  const cbetOop = toPct(cbetOopMade, cbetOopOpportunities);
  const floatFlop = toPct(floatFlopCount, floatFlopOpportunities);
  const checkRaiseFlop = toPct(checkRaiseFlopCount, checkRaiseFlopOpportunities);
  const allInAdjBb100 = hands.length > 0 ? round2((allInAdjTotalBb / hands.length) * 100) : 0;
  const showdownHands = hands.filter((h) => Boolean(h.showdown));
  const wtsd = toPct(showdownHands.length, sawFlopHands);
  const wonAtShowdown = showdownHands.filter((h) => Number(h.result ?? 0) > 0).length;
  const wsd = toPct(wonAtShowdown, showdownHands.length);
  const wwsf = toPct(wonWhenSawFlopCount, sawFlopHands);

  const alerts: string[] = [];
  const strengths: string[] = [];
  const unknownPositionHands = positionHands.get("UNKNOWN") ?? 0;
  if (unknownPositionHands > 0) {
    const unknownRatio = (unknownPositionHands / Math.max(1, hands.length)) * 100;
    if (unknownRatio >= 10) {
      alerts.push(`Qualidade de dados: ${unknownPositionHands} mãos (${unknownRatio.toFixed(1)}%) sem posição identificada. Revise parser/import para precisão por posição.`);
    }
  }
  if (vpip > 42) alerts.push("VPIP alto no torneio: possivel excesso de mãos marginais.");
  if (pfr > 0 && vpip > 0 && pfr / Math.max(vpip, 1) < 0.5) alerts.push("Gap VPIP vs PFR sugere tendencia passiva preflop.");
  if (bbDefense < 25 && bbDefenseOpportunities >= 3) alerts.push("Defesa de BB baixa nas oportunidades observadas.");
  if (aggressionFactor < 1.2) alerts.push("Aggression Factor baixo; tendencia mais passiva que agressiva.");
  if (cbetFlop >= 60 && cbetTurn <= 45 && cbetOpportunities >= 6 && cbetTurnOpportunities >= 4) {
    alerts.push("Gap C-Bet Flop vs Turn sugere padrao one-and-done (desiste apos call no flop).");
  }
  if (cbetFlop >= 55 && cbetOpportunities >= 3) strengths.push("Boa frequencia de c-bet flop como agressor preflop.");
  if (attemptToSteal >= 30 && stealOpportunities >= 4) strengths.push("Steal ativo em posicoes finais quando abriu o pote.");
  if (aggressionFactor >= 2) strengths.push("Perfil agressivo consistente nas decisões pós-flop.");
  if (bestPosition && bestPosition.netBb > 0) strengths.push(`Maior ganho veio da posição ${bestPosition.position}.`);

  const db = await getDb();
  if (!db) throw new Error("Database not available");

  const [fieldRef] = await db
    .select()
    .from(fieldAggregateStatsByAbi)
    .where(and(eq(fieldAggregateStatsByAbi.site, input.tournament.site), eq(fieldAggregateStatsByAbi.abiBucket, abiBucket)))
    .limit(1);

  return {
    tournament: {
      buyIn,
      fee,
      abiValue,
      abiBucket,
      finalPosition: input.tournament.finalPosition ?? null,
      handsAnalyzed: hands.length,
      showdownsCount,
      durationMinutes,
      finalPositionLabel: input.tournament.finalPosition ? `${input.tournament.finalPosition}º` : null,
      totalNetChips,
      totalNetBb,
      bestPosition,
      worstPosition,
      chipsByPosition: positionEntries,
      positionsPlayed: positionEntries
        .slice()
        .sort((a, b) => b.hands - a.hands),
    },
    stats: {
      vpip,
      pfr,
      threeBet,
      cbetFlop,
      cbetTurn,
      cbetSuccessRate,
      foldToCbet,
      bbDefense,
      attemptToSteal,
      aggressionFactor,
      wtsd,
      wsd,
      wwsf,
      rfi,
      coldCall,
      squeeze,
      resteal,
      foldToSteal,
      foldTo3Bet,
      fourBetRatio,
      foldTo4Bet,
      cbetIp,
      cbetOop,
      floatFlop,
      checkRaiseFlop,
      allInAdjBb100,
    },
    opportunities: {
      hands: hands.length,
      cbetFlop: cbetOpportunities,
      cbetTurn: cbetTurnOpportunities,
      cbetSuccess: cbetFlopSuccessOpportunities,
      foldToCbet: foldToCbetOpportunities,
      bbDefense: bbDefenseOpportunities,
      steal: stealOpportunities,
      sawFlop: sawFlopHands,
      aggressionActions,
      aggressionCalls: callActions,
      rfi: rfiOpportunities,
      coldCall: coldCallOpportunities,
      squeeze: squeezeOpportunities,
      resteal: restealOpportunities,
      foldToSteal: foldToStealOpportunities,
      foldTo3Bet: foldTo3BetOpportunities,
      fourBetRatio: fourBetRatioOpportunities,
      foldTo4Bet: foldTo4BetOpportunities,
      cbetIp: cbetIpOpportunities,
      cbetOop: cbetOopOpportunities,
      floatFlop: floatFlopOpportunities,
      checkRaiseFlop: checkRaiseFlopOpportunities,
      allInAdjOpportunities: allInAdjHandsCount + allInAdjSkipped,
      allInAdjSample: allInAdjHandsCount,
      allInAdjSkipped,
    },
    fieldReference: fieldRef
      ? {
          sampleTournaments: Number(fieldRef.sampleTournaments ?? 0),
          vpip: Number(fieldRef.avgVpip ?? 0),
          pfr: Number(fieldRef.avgPfr ?? 0),
          threeBet: Number(fieldRef.avgThreeBet ?? 0),
          cbetFlop: Number(fieldRef.avgCbetFlop ?? 0),
          bbDefense: Number(fieldRef.avgBbDefense ?? 0),
          attemptToSteal: Number(fieldRef.avgSteal ?? 0),
        }
      : null,
    alerts,
    strengths,
    flowValidation: {
      logicVersion: "flow-v4.0-final",
      steps: {
        parse: {
          hands: hands.length,
          actions: input.actions.length,
          showdowns: input.showdowns.length,
          ok: hands.length > 0,
        },
        preflop: {
          evaluatedHands: hands.length,
          vpipOpportunities: hands.length,
          pfrOpportunities: hands.length,
          stealOpportunities,
          bbDefenseOpportunities,
          ok: true,
        },
        postflop: {
          sawFlopHands,
          cbetFlopOpportunities: cbetOpportunities,
          cbetTurnOpportunities,
          cbetSuccessOpportunities: cbetFlopSuccessOpportunities,
          ok: true,
        },
        general: {
          aggressionActions,
          aggressionCalls: callActions,
          showdownHands: showdownHands.length,
          ok: true,
        },
        advanced: {
          foldTo3BetOpportunities,
          foldTo4BetOpportunities,
          squeezeOpportunities,
          ok: true,
        },
      },
    },
  };
}

export async function getPlayerHistoricalProfile(userId: number) {
  const cached = getHistoricalProfileFromCache(userId);
  if (cached) {
    return cached;
  }

  const db = await getDb();
  if (!db) throw new Error("Database not available");

  console.log("[getPlayerHistoricalProfile] Starting for user:", userId);

  let [aggregate] = await db
    .select()
    .from(playerAggregateStats)
    .where(eq(playerAggregateStats.userId, userId))
    .orderBy(desc(playerAggregateStats.updatedAt))
    .limit(1);

  if (!aggregate) {
    console.log("[getPlayerHistoricalProfile] Aggregate missing. Scheduling background refresh.");
    enqueueReplayStatsRecalculation(userId, { delayMs: 0, reason: "aggregate_missing" });
  }

  console.log("[getPlayerHistoricalProfile] Aggregate stats:", aggregate ? `found (hands=${aggregate.sampleHands})` : "NOT FOUND");

  const positionStats = await db
    .select()
    .from(playerPositionStats)
    .where(eq(playerPositionStats.userId, userId));

  const byAbi = await db
    .select()
    .from(playerStatsByAbi)
    .where(eq(playerStatsByAbi.userId, userId));

  const byPositionAndAbi = await db
    .select()
    .from(playerStatsByPositionAndAbi)
    .where(eq(playerStatsByPositionAndAbi.userId, userId));

  const [tournamentMetricAverages] = await db
    .select({
      totalTournaments: sql<number>`COUNT(*)`,
      totalHands: sql<number>`COALESCE(SUM(${playerTournamentStats.handsPlayed}), 0)`,
      vpipAvg: sql<number>`COALESCE(ROUND(AVG(${playerTournamentStats.vpip})), 0)`,
      pfrAvg: sql<number>`COALESCE(ROUND(AVG(${playerTournamentStats.pfr})), 0)`,
      threeBetAvg: sql<number>`COALESCE(ROUND(AVG(${playerTournamentStats.threeBet})), 0)`,
      bbDefenseAvg: sql<number>`COALESCE(ROUND(AVG(${playerTournamentStats.bbDefense})), 0)`,
      cbetFlopAvg: sql<number>`COALESCE(ROUND(AVG(${playerTournamentStats.cbetFlop})), 0)`,
      stealAttemptAvg: sql<number>`COALESCE(ROUND(AVG(${playerTournamentStats.stealAttempt})), 0)`,
      aggressionFactorAvg: sql<number>`COALESCE(ROUND(AVG(${playerTournamentStats.aggressionFactor})), 0)`,
      cbetTurnAvg: sql<number>`COALESCE(ROUND(AVG(${playerTournamentStats.cbetTurn})), 0)`,
      wtsdAvg: sql<number>`COALESCE(ROUND(AVG(${playerTournamentStats.wtsd})), 0)`,
      wsdAvg: sql<number>`COALESCE(ROUND(AVG(${playerTournamentStats.wsd})), 0)`,
    })
    .from(playerTournamentStats)
    .where(eq(playerTournamentStats.userId, userId));

  const estimatedHandsForSyncStats = Math.max(
    Number(aggregate?.sampleHands ?? 0),
    Number(tournamentMetricAverages?.totalHands ?? 0),
  );
  const shouldComputeLiveStats = estimatedHandsForSyncStats > 0 && estimatedHandsForSyncStats <= HISTORICAL_PROFILE_SYNC_MAX_HANDS;

  const liveStats = shouldComputeLiveStats
    ? await computeLiveHistoricalStatsFromHands(db, userId)
    : null;

  if (!shouldComputeLiveStats && estimatedHandsForSyncStats > HISTORICAL_PROFILE_SYNC_MAX_HANDS) {
    console.log("[getPlayerHistoricalProfile] Skipping synchronous live stats for large dataset.", {
      userId,
      estimatedHandsForSyncStats,
      threshold: HISTORICAL_PROFILE_SYNC_MAX_HANDS,
    });
    enqueueReplayStatsRecalculation(userId, { delayMs: 0, reason: "large_dataset_fast_path" });
  }

  const leakFlags = await db
    .select()
    .from(playerLeakFlags)
    .where(and(eq(playerLeakFlags.userId, userId), eq(playerLeakFlags.active, 1)))
    .orderBy(desc(playerLeakFlags.lastDetectedAt));

  const tournaments = await db
    .select({
      id: centralTournaments.id,
      totalHands: centralTournaments.totalHands,
      totalCost: centralTournaments.totalCost,
      currency: centralTournaments.currency,
      finalPosition: centralTournaments.finalPosition,
      importedAt: centralTournaments.importedAt,
    })
    .from(centralTournaments)
    .where(eq(centralTournaments.userId, userId))
    .orderBy(desc(centralTournaments.importedAt));

  const centralTournamentCount = tournaments.length;
  const centralHandsCount = tournaments.reduce((acc, t) => acc + Number(t.totalHands ?? 0), 0);

  const aggregateTournamentCount = Number(aggregate?.sampleTournaments ?? 0);
  const aggregateHandsCount = Number(aggregate?.sampleHands ?? 0);
  const aggregateOutOfSync =
    !!aggregate
    && (
      (aggregateTournamentCount > 0 && aggregateTournamentCount !== centralTournamentCount)
      || (aggregateHandsCount > 0 && aggregateHandsCount !== centralHandsCount)
    );

  if (aggregateOutOfSync) {
    console.log("[getPlayerHistoricalProfile] Aggregate mismatch detected. Scheduling background refresh...", {
      aggregateTournamentCount,
      aggregateHandsCount,
      centralTournamentCount,
      centralHandsCount,
    });

    enqueueReplayStatsRecalculation(userId, { delayMs: 0, reason: "aggregate_mismatch" });
  }

  const estimatedHandsForDetailedPosition = Math.max(
    Number(centralHandsCount ?? 0),
    Number(aggregate?.sampleHands ?? 0),
    Number(tournamentMetricAverages?.totalHands ?? 0),
  );
  const shouldComputeDetailedPosition =
    estimatedHandsForDetailedPosition > 0
    && estimatedHandsForDetailedPosition <= HISTORICAL_PROFILE_SYNC_MAX_HANDS;

  if (!shouldComputeDetailedPosition && estimatedHandsForDetailedPosition > HISTORICAL_PROFILE_SYNC_MAX_HANDS) {
    console.log("[getPlayerHistoricalProfile] Skipping detailed position scan for large dataset.", {
      userId,
      estimatedHandsForDetailedPosition,
      threshold: HISTORICAL_PROFILE_SYNC_MAX_HANDS,
    });
    enqueueReplayStatsRecalculation(userId, { delayMs: 0, reason: "large_dataset_position_fast_path" });
  }

  const handsForPosition = shouldComputeDetailedPosition
    ? await db
      .select({
        id: centralHands.id,
        heroSeat: centralHands.heroSeat,
        heroCards: centralHands.heroCards,
        heroPosition: centralHands.heroPosition,
        bigBlind: centralHands.bigBlind,
        result: centralHands.result,
      })
      .from(centralHands)
      .where(eq(centralHands.userId, userId))
    : [];

  const actionsForPosition = shouldComputeDetailedPosition
    ? await db
      .select({
        handId: centralHandActions.handId,
        street: centralHandActions.street,
        actionOrder: centralHandActions.actionOrder,
        seat: centralHandActions.seat,
        actionType: centralHandActions.actionType,
        amount: centralHandActions.amount,
        toAmount: centralHandActions.toAmount,
        heroInHand: centralHandActions.heroInHand,
      })
      .from(centralHandActions)
      .where(eq(centralHandActions.userId, userId))
      .orderBy(asc(centralHandActions.handId), asc(centralHandActions.actionOrder))
    : [];

  const actionsByHandForPosition = new Map<number, Array<{
    street: string | null;
    seat: number | null;
    actionType: string | null;
    amount: number | null;
    toAmount: number | null;
    heroInHand: number | null;
  }>>();

  for (const action of actionsForPosition) {
    const handId = Number(action.handId ?? 0);
    if (!handId) continue;
    const bucket = actionsByHandForPosition.get(handId) ?? [];
    bucket.push({
      street: action.street,
      seat: action.seat,
      actionType: action.actionType,
      amount: action.amount,
      toAmount: action.toAmount,
      heroInHand: action.heroInHand,
    });
    actionsByHandForPosition.set(handId, bucket);
  }

  const positionMetricMap = new Map<string, Map<string, { made: number; of: number }>>();
  const positionMetricKeys = [
    "vpip", "pfr", "threeBet", "cbetFlop", "cbetTurn", "foldToCbet", "bbDefense", "attemptToSteal",
    "wtsd", "wsd", "rfi", "coldCall", "squeeze", "resteal", "foldToSteal", "foldTo3Bet",
    "cbetIp", "cbetOop", "floatFlop", "checkRaiseFlop", "allInAdjBb100", "aggressionFactor",
  ];

  for (const key of positionMetricKeys) {
    positionMetricMap.set(key, new Map());
  }

  const bumpPositionMetric = (metricKey: string, position: string, madeInc: number, ofInc: number) => {
    const byPosition = positionMetricMap.get(metricKey);
    if (!byPosition) return;
    const current = byPosition.get(position) ?? { made: 0, of: 0 };
    byPosition.set(position, {
      made: current.made + madeInc,
      of: current.of + ofInc,
    });
  };

  const isAggressionAction = (actionType?: string | null) => {
    const normalized = normalizeActionType(actionType ?? undefined);
    return normalized === "raise" || normalized === "bet" || normalized === "all_in";
  };
  const isCallAction = (actionType?: string | null) => normalizeActionType(actionType ?? undefined) === "call";
  const isFoldAction = (actionType?: string | null) => normalizeActionType(actionType ?? undefined) === "fold";
  const isForcedAction = (actionType?: string | null) => {
    const normalized = normalizeActionType(actionType ?? undefined);
    return normalized === "post_ante" || normalized === "post_blind";
  };
  const isCheckAction = (actionType?: string | null) => normalizeActionType(actionType ?? undefined) === "check";

  const positionAccumulator = new Map<string, { handsPlayed: number; netChips: number; netBb: number }>();

  for (const hand of handsForPosition) {
    const handId = Number(hand.id ?? 0);
    if (!handId) continue;

    const heroSeat = Number(hand.heroSeat ?? 0);
    const hasHeroCards = String(hand.heroCards ?? "").trim().length > 0;
    const allActions = actionsByHandForPosition.get(handId) ?? [];
    const actions = allActions.filter((action) => {
      const isHeroFlagged = Number(action.heroInHand ?? 0) === 1;
      const bySeatFallback = heroSeat > 0 && Number(action.seat ?? 0) === heroSeat;
      return isHeroFlagged || bySeatFallback;
    });
    const isHeroAction = (action: {
      seat: number | null;
      heroInHand: number | null;
    }) => {
      const isHeroFlagged = Number(action.heroInHand ?? 0) === 1;
      const bySeatFallback = heroSeat > 0 && Number(action.seat ?? 0) === heroSeat;
      return isHeroFlagged || bySeatFallback;
    };
    const hasHeroNonForcedAction = actions.some((action) => {
      const actionType = normalizeActionType(action.actionType ?? undefined);
      const isForcedPost = actionType === "post_ante" || actionType === "post_blind";
      if (isForcedPost) return false;
      return Number(action.amount ?? 0) > 0
        || Number(action.toAmount ?? 0) > 0
        || actionType === "check"
        || actionType === "fold"
        || actionType === "call"
        || actionType === "bet"
        || actionType === "raise"
        || actionType === "collect"
        || actionType === "show";
    });
    if (!hasHeroCards && !hasHeroNonForcedAction) continue;

    let handNetFromActions = 0;
    let usedActionData = false;
    let currentStreet = "preflop";
    let contributedThisStreet = 0;

    for (const action of actions) {
      const street = normalizeStreet(action.street ?? undefined);
      if (street === "preflop" || street === "flop" || street === "turn" || street === "river") {
        if (street !== currentStreet) {
          currentStreet = street;
          contributedThisStreet = 0;
        }
      }

      const type = normalizeActionType(action.actionType ?? undefined);
      const amount = Number(action.amount ?? 0);
      const toAmount = Number(action.toAmount ?? 0);

      if (type === "post_ante" || type === "post_blind" || type === "bet" || type === "call") {
        if (amount > 0) {
          handNetFromActions -= amount;
          contributedThisStreet += amount;
          usedActionData = true;
        }
        continue;
      }

      if (type === "raise") {
        const raiseDelta = Math.max(toAmount - contributedThisStreet, 0);
        if (raiseDelta > 0) {
          handNetFromActions -= raiseDelta;
          contributedThisStreet = toAmount;
          usedActionData = true;
        }
        continue;
      }

      if (type === "collect") {
        if (amount > 0) {
          handNetFromActions += amount;
          usedActionData = true;
        }
        continue;
      }

      // "other" from importer currently represents returned uncalled bet lines.
      if (type === "other" && amount > 0) {
        handNetFromActions += amount;
        usedActionData = true;
      }
    }

    const storedHandResult = Number(hand.result);
    const hasStoredResult = Number.isFinite(storedHandResult);
    // Keep `result` as source of truth when available; action reconstruction is fallback for legacy/incomplete rows.
    const handNet = hasStoredResult ? storedHandResult : (usedActionData ? handNetFromActions : 0);
    const handBigBlind = Number(hand.bigBlind ?? 0);
    const handNetBb = handBigBlind > 0 ? handNet / handBigBlind : 0;
    const storedPosition = normalizeStoredPosition(String(hand.heroPosition ?? "UNKNOWN"));
    const position = storedPosition === "UNKNOWN" ? "UNKNOWN" : storedPosition;

    const preflopActions = allActions.filter((a) => normalizeStreet(a.street ?? undefined) === "preflop");
    const heroPreflop = preflopActions.filter((a) => isHeroAction(a));
    const heroFirstPre = heroPreflop.find((a) => !isForcedAction(a.actionType)) ?? heroPreflop[0];
    const heroFirstPreIndex = heroFirstPre ? preflopActions.indexOf(heroFirstPre) : -1;
    const priorToHero = heroFirstPreIndex >= 0
      ? preflopActions.filter((a, index) => index < heroFirstPreIndex && !isHeroAction(a) && !isForcedAction(a.actionType))
      : [];
    const heroVpip = heroPreflop.some((a) => !isForcedAction(a.actionType) && (isCallAction(a.actionType) || isAggressionAction(a.actionType)));
    const heroPfr = heroPreflop.some((a) => !isForcedAction(a.actionType) && isAggressionAction(a.actionType));
    const priorAggression = priorToHero.some((a) => isAggressionAction(a.actionType));
    const priorCalls = priorToHero.some((a) => isCallAction(a.actionType));

    bumpPositionMetric("vpip", position, heroVpip ? 1 : 0, 1);
    bumpPositionMetric("pfr", position, heroPfr ? 1 : 0, 1);
    bumpPositionMetric("threeBet", position, priorAggression ? (heroPreflop.some((a) => isAggressionAction(a.actionType)) ? 1 : 0) : 0, priorAggression ? 1 : 0);
    bumpPositionMetric("coldCall", position, priorAggression ? (heroPreflop.some((a) => isCallAction(a.actionType)) ? 1 : 0) : 0, priorAggression ? 1 : 0);
    bumpPositionMetric("squeeze", position, (priorAggression && priorCalls) ? (heroPreflop.some((a) => isAggressionAction(a.actionType)) ? 1 : 0) : 0, (priorAggression && priorCalls) ? 1 : 0);
    bumpPositionMetric("rfi", position, priorToHero.length === 0 ? (heroPreflop.some((a) => isAggressionAction(a.actionType)) ? 1 : 0) : 0, priorToHero.length === 0 ? 1 : 0);

    const isStealPosition = position === "CO" || position === "BTN" || position === "SB";
    bumpPositionMetric("attemptToSteal", position, (isStealPosition && priorToHero.length === 0) ? (heroPreflop.some((a) => isAggressionAction(a.actionType)) ? 1 : 0) : 0, (isStealPosition && priorToHero.length === 0) ? 1 : 0);
    bumpPositionMetric("bbDefense", position, position === "BB" && priorAggression ? (heroFirstPre && !isFoldAction(heroFirstPre.actionType) ? 1 : 0) : 0, position === "BB" && priorAggression ? 1 : 0);

    const flopActions = allActions.filter((a) => normalizeStreet(a.street ?? undefined) === "flop");
    const turnActions = allActions.filter((a) => normalizeStreet(a.street ?? undefined) === "turn");
    const heroFlopActions = flopActions.filter((a) => isHeroAction(a));
    const heroTurnActions = turnActions.filter((a) => isHeroAction(a));
    const villainFlopAggression = flopActions.filter((a) => !isHeroAction(a)).find((a) => isAggressionAction(a.actionType));

    bumpPositionMetric("cbetFlop", position, heroPfr ? (heroFlopActions.some((a) => isAggressionAction(a.actionType)) ? 1 : 0) : 0, heroPfr ? 1 : 0);
    const heroCbetFlop = heroPfr && heroFlopActions.some((a) => isAggressionAction(a.actionType));
    bumpPositionMetric("cbetTurn", position, heroCbetFlop ? (heroTurnActions.some((a) => isAggressionAction(a.actionType)) ? 1 : 0) : 0, heroCbetFlop ? 1 : 0);
    bumpPositionMetric("foldToCbet", position, villainFlopAggression ? (heroFlopActions.some((a) => isFoldAction(a.actionType)) ? 1 : 0) : 0, villainFlopAggression ? 1 : 0);

    const cbetIpOpportunity = heroPfr && (position === "CO" || position === "BTN" || position === "SB");
    const cbetOopOpportunity = heroPfr && !cbetIpOpportunity;
    bumpPositionMetric("cbetIp", position, cbetIpOpportunity ? (heroFlopActions.some((a) => isAggressionAction(a.actionType)) ? 1 : 0) : 0, cbetIpOpportunity ? 1 : 0);
    bumpPositionMetric("cbetOop", position, cbetOopOpportunity ? (heroFlopActions.some((a) => isAggressionAction(a.actionType)) ? 1 : 0) : 0, cbetOopOpportunity ? 1 : 0);
    bumpPositionMetric("floatFlop", position, villainFlopAggression ? (heroFlopActions.some((a) => isCallAction(a.actionType)) && heroTurnActions.some((a) => isAggressionAction(a.actionType)) ? 1 : 0) : 0, villainFlopAggression ? 1 : 0);
    bumpPositionMetric("checkRaiseFlop", position, heroFlopActions.some((a) => isAggressionAction(a.actionType)) && heroFlopActions.some((a) => isCheckAction(a.actionType)) ? 1 : 0, heroFlopActions.length > 0 ? 1 : 0);

    const wentShowdown = allActions.some((a) => normalizeActionType(a.actionType ?? undefined) === "show");
    const wonShowdown = wentShowdown && handNet > 0;
    bumpPositionMetric("wtsd", position, wentShowdown ? 1 : 0, 1);
    bumpPositionMetric("wsd", position, wonShowdown ? 1 : 0, wentShowdown ? 1 : 0);
    bumpPositionMetric(
      "aggressionFactor",
      position,
      heroFlopActions.concat(heroTurnActions).filter((a) => isAggressionAction(a.actionType)).length,
      heroFlopActions.concat(heroTurnActions).filter((a) => isCallAction(a.actionType)).length,
    );

    bumpPositionMetric("allInAdjBb100", position, 0, 0);
    bumpPositionMetric("resteal", position, 0, 0);
    bumpPositionMetric("foldToSteal", position, 0, 0);
    bumpPositionMetric("foldTo3Bet", position, 0, 0);

    const prev = positionAccumulator.get(position) ?? { handsPlayed: 0, netChips: 0, netBb: 0 };
    positionAccumulator.set(position, {
      handsPlayed: prev.handsPlayed + 1,
      netChips: prev.netChips + handNet,
      netBb: prev.netBb + handNetBb,
    });
  }

  const positionSortOrder = ["UTG", "UTG1", "UTG2", "LJ", "HJ", "CO", "BTN", "SB", "BB", "UNKNOWN"];
  let metricBreakdownByPosition: Record<string, Array<{ position: string; made: number; of: number; pct: number }>> = Object.fromEntries(
    Array.from(positionMetricMap.entries()).map(([metricKey, byPositionMap]) => {
      const rows = Array.from(byPositionMap.entries())
        .map(([position, values]) => {
          const of = Number(values.of ?? 0);
          const made = Number(values.made ?? 0);
          const pct = of > 0
            ? (metricKey === "aggressionFactor" ? made : (made / of) * 100)
            : 0;
          return {
            position,
            made,
            of,
            pct,
          };
        })
        .filter((row) => row.of > 0 || metricKey === "allInAdjBb100")
        .sort((a, b) => {
          const aIndex = positionSortOrder.indexOf(a.position);
          const bIndex = positionSortOrder.indexOf(b.position);
          if (aIndex === -1 && bIndex === -1) return a.position.localeCompare(b.position);
          if (aIndex === -1) return 1;
          if (bIndex === -1) return -1;
          return aIndex - bIndex;
        });
      return [metricKey, rows];
    }),
  );

  const positionStatsFromHands = Array.from(positionAccumulator.entries()).map(([position, values]) => ({
    position,
    handsPlayed: values.handsPlayed,
    netChips: values.netChips,
    netBb: values.netBb,
  }));

  const tournamentStatsCount = Number(tournamentMetricAverages?.totalTournaments ?? 0);
  const tournamentHandsSum = Number(tournamentMetricAverages?.totalHands ?? 0);
  const fallbackTournamentCount = centralTournamentCount;
  const fallbackHandsCount = centralHandsCount;
  const liveHandsCount = Number(liveStats?.hands ?? 0);

  const totalTournaments = Number(
    fallbackTournamentCount > 0
      ? fallbackTournamentCount
      : aggregate?.sampleTournaments && Number(aggregate.sampleTournaments) > 0
        ? aggregate.sampleTournaments
        : tournamentStatsCount,
  );
  const totalHands = Number(
    liveHandsCount > 0
      ? liveHandsCount
      : fallbackHandsCount > 0
      ? fallbackHandsCount
      : aggregate?.sampleHands && Number(aggregate.sampleHands) > 0
        ? aggregate.sampleHands
        : tournamentHandsSum,
  );

  console.log("[getPlayerHistoricalProfile] Summary:", { totalTournaments, totalHands, tournaments: tournaments.length });

  const finishPositions = tournaments
    .map((t) => Number(t.finalPosition ?? 0))
    .filter((value) => Number.isFinite(value) && value > 0);

  const bestPlacement = finishPositions.length > 0 ? Math.min(...finishPositions) : null;
  const avgPlacement = Number(aggregate?.avgFinishPosition ?? (finishPositions.length > 0
    ? Math.round(finishPositions.reduce((acc, value) => acc + value, 0) / finishPositions.length)
    : 0));

  const normalizedPositionStats = positionStatsFromHands.length > 0
    ? positionStatsFromHands.map((row) => ({
        id: 0,
        userId,
        position: row.position ?? "UNKNOWN",
        handsPlayed: Number(row.handsPlayed ?? 0),
        vpip: 0,
        pfr: 0,
        winRateBb100: 0,
        chipEv: 0,
        netChips: Number(row.netChips ?? 0),
        netBb: Number(row.netBb ?? 0),
        foldToOpen: 0,
        callOpen: 0,
        raiseFirstIn: 0,
        threeBet: 0,
        bbDefenseWhenApplicable: 0,
        createdAt: new Date(),
        updatedAt: new Date(),
      }))
    : positionStats.length > 0
    ? positionStats
      .map((row) => ({
        ...row,
        netBb: Number(row.winRateBb100 ?? 0) * (Number(row.handsPlayed ?? 0) / 100),
      }))
    : Array.from(byPositionAndAbi.reduce((acc, row) => {
        const key = String(row.position ?? "UNKNOWN");
        const prev = acc.get(key) ?? { handsPlayed: 0, netChips: 0 };
        acc.set(key, {
          handsPlayed: prev.handsPlayed + Number(row.handsPlayed ?? 0),
          netChips: prev.netChips + Number(row.netChips ?? 0),
        });
        return acc;
      }, new Map<string, { handsPlayed: number; netChips: number }>()).entries()).map(([position, agg]) => ({
        id: 0,
        userId,
        position: position as any,
        handsPlayed: agg.handsPlayed,
        vpip: 0,
        pfr: 0,
        winRateBb100: 0,
        chipEv: 0,
        netChips: agg.netChips,
        netBb: 0,
        foldToOpen: 0,
        callOpen: 0,
        raiseFirstIn: 0,
        threeBet: 0,
        bbDefenseWhenApplicable: 0,
        createdAt: new Date(),
        updatedAt: new Date(),
      }));

  // When detailed hand/action scan is unavailable or incomplete, recover key preflop
  // metric breakdown from persisted position aggregates so UI remains consistent.
  const buildFallbackMetricRowsFromPositionStats = (metric: "vpip" | "pfr" | "threeBet") => {
    const persistedRows = positionStats.length > 0
      ? positionStats.map((row) => ({
          position: String(row.position ?? "UNKNOWN"),
          handsPlayed: Number(row.handsPlayed ?? 0),
          pct: Number((row as any)?.[metric] ?? 0),
        }))
      : Array.from(
          byPositionAndAbi.reduce((acc, row) => {
            const position = String(row.position ?? "UNKNOWN");
            const current = acc.get(position) ?? { handsPlayed: 0, weightedPct: 0 };
            const handsPlayed = Number(row.handsPlayed ?? 0);
            const pct = Number((row as any)?.[metric] ?? 0);
            current.handsPlayed += handsPlayed;
            current.weightedPct += pct * handsPlayed;
            acc.set(position, current);
            return acc;
          }, new Map<string, { handsPlayed: number; weightedPct: number }>()).entries(),
        ).map(([position, values]) => ({
          position,
          handsPlayed: Number(values.handsPlayed ?? 0),
          pct: Number(values.handsPlayed ?? 0) > 0 ? Number(values.weightedPct ?? 0) / Number(values.handsPlayed ?? 1) : 0,
        }));

    return persistedRows
      .map((row) => {
        const of = Number(row.handsPlayed ?? 0);
        const pct = Number(row.pct ?? 0);
        const made = Math.round((pct / 100) * of);
        return {
          position: String(row.position ?? "UNKNOWN"),
          made,
          of,
          pct,
        };
      })
      .filter((row) => row.of > 0)
      .sort((a, b) => {
        const aIndex = positionSortOrder.indexOf(a.position);
        const bIndex = positionSortOrder.indexOf(b.position);
        if (aIndex === -1 && bIndex === -1) return a.position.localeCompare(b.position);
        if (aIndex === -1) return 1;
        if (bIndex === -1) return -1;
        return aIndex - bIndex;
      });
  };

  for (const metric of ["vpip", "pfr", "threeBet"] as const) {
    const existingRows = metricBreakdownByPosition[metric] ?? [];
    const hasMeaningfulExistingRows = existingRows.some((row) => Number(row.of ?? 0) > 0 && Number(row.pct ?? 0) > 0);
    if (hasMeaningfulExistingRows) continue;

    const fallbackRows = buildFallbackMetricRowsFromPositionStats(metric);
    if (fallbackRows.length === 0) continue;

    metricBreakdownByPosition = {
      ...metricBreakdownByPosition,
      [metric]: fallbackRows,
    };
  }

  const posSortedByGain = [...normalizedPositionStats].sort((a, b) => Number(b.netBb ?? 0) - Number(a.netBb ?? 0));
  const posSortedByLoss = [...normalizedPositionStats].sort((a, b) => Number(a.netBb ?? 0) - Number(b.netBb ?? 0));

  const recentCosts = tournaments.slice(0, 5).map((t) => Number(t.totalCost ?? 0));
  const previousCosts = tournaments.slice(5, 10).map((t) => Number(t.totalCost ?? 0));
  const avgRecentAbi = recentCosts.length > 0 ? Math.round(recentCosts.reduce((a, b) => a + b, 0) / recentCosts.length) : null;
  const avgPrevAbi = previousCosts.length > 0 ? Math.round(previousCosts.reduce((a, b) => a + b, 0) / previousCosts.length) : null;
  const abiAverageFromTournaments = tournaments.length > 0
    ? Math.round(tournaments.reduce((acc, t) => acc + Number(t.totalCost ?? 0), 0) / tournaments.length)
    : 0;
  const currencyCounter = new Map<string, number>();
  for (const tournament of tournaments) {
    const currency = String(tournament.currency ?? "USD");
    currencyCounter.set(currency, (currencyCounter.get(currency) ?? 0) + 1);
  }
  const orderedCurrencies = Array.from(currencyCounter.entries()).sort((a, b) => b[1] - a[1]);
  const primaryCurrency = orderedCurrencies[0]?.[0] ?? "USD";
  const hasMixedCurrencies = orderedCurrencies.length > 1;
  const trendNote = avgRecentAbi != null && avgPrevAbi != null
    ? (avgRecentAbi > avgPrevAbi
      ? "ABI recente acima da janela anterior."
      : avgRecentAbi < avgPrevAbi
        ? "ABI recente abaixo da janela anterior."
        : "ABI recente estavel em relacao a janela anterior.")
    : null;

  const metricFromAggregate = {
    vpipAvg: Number(aggregate?.vpipAvg ?? tournamentMetricAverages?.vpipAvg ?? 0),
    pfrAvg: Number(aggregate?.pfrAvg ?? tournamentMetricAverages?.pfrAvg ?? 0),
    threeBetAvg: Number(aggregate?.threeBetAvg ?? tournamentMetricAverages?.threeBetAvg ?? 0),
    bbDefenseAvg: Number(aggregate?.bbDefenseAvg ?? tournamentMetricAverages?.bbDefenseAvg ?? 0),
    cbetFlopAvg: Number(aggregate?.cbetFlopAvg ?? tournamentMetricAverages?.cbetFlopAvg ?? 0),
    cbetTurnAvg: Number(aggregate?.cbetTurnAvg ?? tournamentMetricAverages?.cbetTurnAvg ?? 0),
    foldToCbetAvg: Number(aggregate?.foldToCbetAvg ?? tournamentMetricAverages?.foldToCbetAvg ?? 0),
    attemptToStealAvg: Number(aggregate?.stealAttemptAvg ?? tournamentMetricAverages?.stealAttemptAvg ?? 0),
    aggressionFactorAvg: Number(aggregate?.aggressionFactorAvg ?? tournamentMetricAverages?.aggressionFactorAvg ?? 0),
    wtsdAvg: Number(tournamentMetricAverages?.wtsdAvg ?? 0),
    wsdAvg: Number(tournamentMetricAverages?.wsdAvg ?? 0),
    allInAdjBb100Avg: 0,
  };

  const finalMetrics = liveStats
    ? {
        vpipAvg: liveStats.vpip,
        pfrAvg: liveStats.pfr,
        threeBetAvg: liveStats.threeBet,
        bbDefenseAvg: liveStats.bbDefense,
        cbetFlopAvg: liveStats.cbetFlop,
        cbetTurnAvg: liveStats.cbetTurn,
        foldToCbetAvg: liveStats.foldToCbet,
        attemptToStealAvg: liveStats.attemptToSteal,
        aggressionFactorAvg: liveStats.aggressionFactor,
        wtsdAvg: liveStats.wtsd,
        wsdAvg: liveStats.wsd,
        allInAdjBb100Avg: liveStats.allInAdjBb100,
      }
    : metricFromAggregate;

  if (liveStats) {
    console.log("[getPlayerHistoricalProfile] Using live hand-action metrics:", finalMetrics);
  }

  const result = {
    summary: {
      totalTournaments,
      totalHands,
      abiAverage: Number(aggregate?.averageAbi ?? abiAverageFromTournaments),
      abiAverageCurrency: hasMixedCurrencies ? "MIXED" : primaryCurrency,
      abiAverageInMajorUnits: Number(aggregate?.averageAbi ?? abiAverageFromTournaments) / 100,
      avgPlacement: Number.isFinite(avgPlacement) ? avgPlacement : 0,
      bestPlacement,
      vpipAvg: finalMetrics.vpipAvg,
      pfrAvg: finalMetrics.pfrAvg,
      threeBetAvg: finalMetrics.threeBetAvg,
      bbDefenseAvg: finalMetrics.bbDefenseAvg,
      cbetFlopAvg: finalMetrics.cbetFlopAvg,
      cbetTurnAvg: finalMetrics.cbetTurnAvg,
      foldToCbetAvg: finalMetrics.foldToCbetAvg,
      attemptToStealAvg: finalMetrics.attemptToStealAvg,
      aggressionFactorAvg: finalMetrics.aggressionFactorAvg,
      wtsdAvg: finalMetrics.wtsdAvg,
      wsdAvg: finalMetrics.wsdAvg,
      allInAdjBb100Avg: Number(finalMetrics.allInAdjBb100Avg ?? 0),
      opportunities: {
        hands: Number(liveStats?.opportunities.hands ?? totalHands),
        cbetFlop: Number(liveStats?.opportunities.cbetFlop ?? 0),
        cbetTurn: Number(liveStats?.opportunities.cbetTurn ?? 0),
        foldToCbet: Number(liveStats?.opportunities.foldToCbet ?? 0),
        bbDefense: Number(liveStats?.opportunities.bbDefense ?? 0),
        steal: Number(liveStats?.opportunities.steal ?? 0),
        aggressionActions: Number(liveStats?.opportunities.aggressionActions ?? 0),
        aggressionCalls: Number(liveStats?.opportunities.aggressionCalls ?? 0),
        showdownHands: Number(liveStats?.opportunities.showdownHands ?? Math.round((Number(finalMetrics.wtsdAvg ?? 0) / 100) * Math.max(totalHands, 0))),
        allInAdjOpportunities: Number(liveStats?.opportunities.allInAdjOpportunities ?? 0),
        allInAdjSample: Number(liveStats?.opportunities.allInAdjSample ?? 0),
        allInAdjSkipped: Number(liveStats?.opportunities.allInAdjSkipped ?? 0),
      },
    },
    positions: {
      byPosition: normalizedPositionStats,
      metricBreakdownByPosition,
      mostProfitable: posSortedByGain[0] ?? null,
      leastProfitable: posSortedByLoss[0] ?? null,
      biggestLoss: posSortedByLoss[0] ?? null,
      biggestGain: posSortedByGain[0] ?? null,
    },
    byAbi,
    leakFlags,
    trends: {
      recentAbi: avgRecentAbi,
      previousAbi: avgPrevAbi,
      note: trendNote,
    },
  };

  console.log("[getPlayerHistoricalProfile] Returning result:", { totalTournaments: result.summary.totalTournaments, totalHands: result.summary.totalHands });

  setHistoricalProfileCache(userId, result);

  return result;
}

export function getAbiBucket(value: number): AbiBucket {
  const safe = Math.max(0, Math.round(Number(value ?? 0)));
  const bucket = ABI_BUCKETS.find((b) => safe >= b.min && (b.max === null || safe <= b.max));
  return bucket?.name ?? "micro";
}

async function getPlayerAverageAbi(userId: number): Promise<number> {
  const db = await getDb();
  if (!db) throw new Error("Database not available");

  const [row] = await db
    .select({ avgAbi: sql<number>`COALESCE(ROUND(AVG(${centralTournaments.totalCost})), 0)` })
    .from(centralTournaments)
    .where(eq(centralTournaments.userId, userId));

  return Number(row?.avgAbi ?? 0);
}

export async function getActiveConsent(userId: number) {
  const db = await getDb();
  if (!db) throw new Error("Database not available");

  const [consent] = await db
    .select()
    .from(userConsents)
    .where(and(eq(userConsents.userId, userId), eq(userConsents.active, 1)))
    .orderBy(desc(userConsents.grantedAt))
    .limit(1);

  return consent ?? null;
}

export async function grantConsent(userId: number, input: {
  consentVersion: string;
  allowDataStorage: boolean;
  allowSharedInternalAnalysis: boolean;
  allowAiTrainingUsage: boolean;
  allowDeveloperAccess: boolean;
  allowFieldAggregation: boolean;
}) {
  const db = await getDb();
  if (!db) throw new Error("Database not available");

  await db
    .update(userConsents)
    .set({ active: 0, revokedAt: new Date(), updatedAt: new Date() })
    .where(and(eq(userConsents.userId, userId), eq(userConsents.active, 1)));

  const [inserted] = await db
    .insert(userConsents)
    .values({
      userId,
      consentVersion: input.consentVersion,
      allowDataStorage: input.allowDataStorage ? 1 : 0,
      allowSharedInternalAnalysis: input.allowSharedInternalAnalysis ? 1 : 0,
      allowAiTrainingUsage: input.allowAiTrainingUsage ? 1 : 0,
      allowDeveloperAccess: input.allowDeveloperAccess ? 1 : 0,
      allowFieldAggregation: input.allowFieldAggregation ? 1 : 0,
      active: 1,
      grantedAt: new Date(),
    })
    .$returningId();

  const [consent] = await db
    .select()
    .from(userConsents)
    .where(eq(userConsents.id, inserted.id))
    .limit(1);

  return consent;
}

export async function revokeConsent(userId: number) {
  const db = await getDb();
  if (!db) throw new Error("Database not available");

  await db
    .update(userConsents)
    .set({ active: 0, revokedAt: new Date(), updatedAt: new Date() })
    .where(and(eq(userConsents.userId, userId), eq(userConsents.active, 1)));

  return { success: true };
}

export async function importReplayToCentralMemory(userId: number, input: ImportReplayInput) {
  const db = await getDb();
  if (!db) throw new Error("Database not available");

  const consent = await getActiveConsent(userId);
  if (!consent || consent.allowDataStorage !== 1) {
    throw new Error("CONSENT_REQUIRED");
  }

  const buyIn = Math.max(0, Math.round(input.tournament.buyIn ?? 0));
  const fee = Math.max(0, Math.round(input.tournament.fee ?? 0));
  const totalCost = buyIn + fee;
  const abiBucket = getAbiBucket(totalCost);
  const playerAbiSnapshot = await getPlayerAverageAbi(userId);
  const allowFieldAggregation = consent.allowFieldAggregation === 1;

  const dedupInput = buildInputDedupFingerprint(input);
  const candidateTournaments = await db
    .select({
      id: centralTournaments.id,
      site: centralTournaments.site,
      totalHands: centralTournaments.totalHands,
      externalTournamentId: centralTournaments.externalTournamentId,
      rawSourceId: centralTournaments.rawSourceId,
      importedAt: centralTournaments.importedAt,
    })
    .from(centralTournaments)
    .where(and(eq(centralTournaments.userId, userId), eq(centralTournaments.site, input.tournament.site)))
    .orderBy(desc(centralTournaments.importedAt))
    .limit(60);

  for (const candidate of candidateTournaments) {
    const candidateExternalId = normalizeId(candidate.externalTournamentId ?? undefined);
    const candidateRawSourceId = normalizeId(candidate.rawSourceId ?? undefined);

    const hasExactTournamentIdMatch =
      (dedupInput.externalTournamentId && dedupInput.externalTournamentId === candidateExternalId)
      || (dedupInput.rawSourceId && dedupInput.rawSourceId === candidateRawSourceId);

    if (!hasExactTournamentIdMatch) continue;

    const stored = await buildStoredTournamentDedupFingerprint(db, candidate.id, dedupInput.heroName);
    const inputSequence = dedupInput.handFingerprints.map((h) => h.signature);

    const hasMinimumWindow =
      inputSequence.length >= DUPLICATE_HAND_WINDOW && stored.handFingerprints.length >= DUPLICATE_HAND_WINDOW;
    if (!hasMinimumWindow) continue;

    const firstWindowMatches = inputSequence
      .slice(0, DUPLICATE_HAND_WINDOW)
      .every((signature, index) => signature === stored.handFingerprints[index]);

    if (firstWindowMatches) {
      return await reuseExistingReplayImport(db, userId, candidate.id, input, abiBucket, totalCost, input.tournament.site, allowFieldAggregation);
    }
  }

  let tournamentId: number | null = null;

  try {
    const [tournamentInserted] = await db
      .insert(centralTournaments)
      .values({
        externalTournamentId: input.tournament.externalTournamentId,
        userId,
        site: input.tournament.site,
        format: input.tournament.format,
        buyIn,
        fee,
        totalCost,
        currency: input.tournament.currency,
        abiValue: totalCost,
        abiBucket,
        playerAbiSnapshot,
        importedAt: input.tournament.importedAt ?? new Date(),
        totalHands: input.tournament.totalHands ?? input.hands.length,
        finalPosition: input.tournament.finalPosition,
        wasEliminated: input.tournament.wasEliminated ? 1 : 0,
        rawSourceId: input.tournament.rawSourceId,
      })
      .$returningId();

    tournamentId = tournamentInserted.id;

    const handIdByRef = new Map<string, number>();
    for (const hand of input.hands) {
      const [insertedHand] = await db
        .insert(centralHands)
        .values({
          externalHandId: hand.externalHandId,
          tournamentId,
          userId,
          handNumber: hand.handNumber,
          datetimeOriginal: hand.datetimeOriginal,
          buttonSeat: hand.buttonSeat,
          heroSeat: hand.heroSeat,
          heroPosition: hand.heroPosition,
          smallBlind: hand.smallBlind ?? 0,
          bigBlind: hand.bigBlind ?? 0,
          ante: hand.ante ?? 0,
          board: hand.board,
          heroCards: hand.heroCards,
          totalPot: hand.totalPot,
          rake: hand.rake,
          result: hand.result,
          showdown: hand.showdown ? 1 : 0,
          rawText: hand.rawText,
          parsedJson: hand.parsedJson,
          handContextJson: hand.handContextJson,
        })
        .$returningId();

      handIdByRef.set(hand.handRef, insertedHand.id);
    }

    for (const action of input.actions) {
      const handId = handIdByRef.get(action.handRef);
      if (!handId) continue;

      await db.insert(centralHandActions).values({
        handId,
        tournamentId,
        userId,
        street: action.street,
        actionOrder: action.actionOrder,
        playerName: action.playerName,
        seat: action.seat,
        position: action.position,
        actionType: action.actionType,
        amount: action.amount,
        toAmount: action.toAmount,
        stackBefore: action.stackBefore,
        stackAfter: action.stackAfter,
        potBefore: action.potBefore,
        potAfter: action.potAfter,
        isAllIn: action.isAllIn ? 1 : 0,
        isForced: action.isForced ? 1 : 0,
        facingActionType: action.facingActionType,
        facingSizeBb: action.facingSizeBb,
        heroInHand: action.heroInHand ? 1 : 0,
        showdownVisible: action.showdownVisible ? 1 : 0,
        contextJson: action.contextJson,
      });
    }

    for (const show of input.showdowns) {
      const handId = handIdByRef.get(show.handRef);
      if (!handId) continue;

      await db.insert(showdownRecords).values({
        handId,
        tournamentId,
        userId,
        playerName: show.playerName,
        seat: show.seat,
        position: show.position,
        holeCards: show.holeCards,
        finalHandDescription: show.finalHandDescription,
        wonPot: show.wonPot ? 1 : 0,
        amountWon: show.amountWon,
      });
    }

    await finalizeImportedReplay(db, userId, tournamentId, input, abiBucket, totalCost, input.tournament.site, allowFieldAggregation);

    return { tournamentId, handsImported: handIdByRef.size };
  } catch (error) {
    if (tournamentId) {
      await deleteTournamentCascade(db, userId, tournamentId).catch(() => undefined);
      await refreshUserAbiAggregates(userId).catch(() => undefined);
    }
    throw error;
  }
}

export async function clearReplayHistoryForUser(userId: number) {
  invalidateHistoricalProfileCache(userId);

  const db = await getDb();
  if (!db) throw new Error("Database not available");

  await db.delete(centralHandActions).where(eq(centralHandActions.userId, userId));
  await db.delete(showdownRecords).where(eq(showdownRecords.userId, userId));
  await db.delete(centralHands).where(eq(centralHands.userId, userId));
  await db.delete(playerTournamentStats).where(eq(playerTournamentStats.userId, userId));
  await db.delete(playerPositionStats).where(eq(playerPositionStats.userId, userId));
  await db.delete(playerStatsByAbi).where(eq(playerStatsByAbi.userId, userId));
  await db.delete(playerStatsByPositionAndAbi).where(eq(playerStatsByPositionAndAbi.userId, userId));
  await db.delete(playerAggregateStats).where(eq(playerAggregateStats.userId, userId));
  await db.delete(playerLeakFlags).where(eq(playerLeakFlags.userId, userId));
  await db.delete(centralTournaments).where(eq(centralTournaments.userId, userId));

  return { success: true };
}

export function enqueueReplayStatsRecalculation(
  userId: number,
  options?: { delayMs?: number; reason?: string },
) {
  invalidateHistoricalProfileCache(userId);

  const delayMs = Math.max(0, Number(options?.delayMs ?? REPLAY_RECALC_IMPORT_DELAY_MS));
  const reason = options?.reason ?? "unspecified";

  const existingTimer = replayRecalcTimers.get(userId);
  if (existingTimer) {
    clearTimeout(existingTimer);
  }

  const scheduledFor = new Date(Date.now() + delayMs);
  const timer = setTimeout(() => {
    replayRecalcTimers.delete(userId);

    if (replayRecalcRunning.has(userId)) {
      console.log("[ReplayRecalcQueue] Recalc already running. Skipping duplicate run.", { userId, reason });
      return;
    }

    replayRecalcRunning.add(userId);
    void recalculateReplayStatsForUser(userId)
      .then((result) => {
        console.log("[ReplayRecalcQueue] Recalc completed.", {
          userId,
          reason,
          updated: Number(result?.updated ?? 0),
          totalTournaments: Number(result?.totalTournaments ?? 0),
        });
      })
      .catch((error) => {
        console.error("[ReplayRecalcQueue] Recalc failed.", { userId, reason, error });
      })
      .finally(() => {
        replayRecalcRunning.delete(userId);
      });
  }, delayMs);

  replayRecalcTimers.set(userId, timer);

  return {
    queued: true,
    reason,
    delayMs,
    scheduledFor: scheduledFor.toISOString(),
  };
}

export async function recalculateReplayStatsForUser(userId: number) {
  invalidateHistoricalProfileCache(userId);

  const db = await getDb();
  if (!db) throw new Error("Database not available");

  const tournaments = await db
    .select({
      id: centralTournaments.id,
      externalTournamentId: centralTournaments.externalTournamentId,
      site: centralTournaments.site,
      format: centralTournaments.format,
      buyIn: centralTournaments.buyIn,
      fee: centralTournaments.fee,
      currency: centralTournaments.currency,
      importedAt: centralTournaments.importedAt,
      totalHands: centralTournaments.totalHands,
      finalPosition: centralTournaments.finalPosition,
      wasEliminated: centralTournaments.wasEliminated,
      rawSourceId: centralTournaments.rawSourceId,
      abiBucket: centralTournaments.abiBucket,
      totalCost: centralTournaments.totalCost,
    })
    .from(centralTournaments)
    .where(eq(centralTournaments.userId, userId))
    .orderBy(asc(centralTournaments.id));

  const touchedSiteBuckets = new Set<string>();
  const failures: Array<{ tournamentId: number; reason: string }> = [];
  let updated = 0;

  for (const tournament of tournaments) {
    try {
      const handsRows = await db
        .select({
          id: centralHands.id,
          externalHandId: centralHands.externalHandId,
          handNumber: centralHands.handNumber,
          datetimeOriginal: centralHands.datetimeOriginal,
          buttonSeat: centralHands.buttonSeat,
          heroSeat: centralHands.heroSeat,
          heroPosition: centralHands.heroPosition,
          smallBlind: centralHands.smallBlind,
          bigBlind: centralHands.bigBlind,
          ante: centralHands.ante,
          board: centralHands.board,
          heroCards: centralHands.heroCards,
          totalPot: centralHands.totalPot,
          rake: centralHands.rake,
          result: centralHands.result,
          showdown: centralHands.showdown,
        })
        .from(centralHands)
        .where(and(eq(centralHands.userId, userId), eq(centralHands.tournamentId, tournament.id)))
        .orderBy(asc(centralHands.id));

      const handRefById = new Map<number, string>();
      const hands = handsRows.map((hand) => {
        const handRef = String(hand.id);
        handRefById.set(hand.id, handRef);
        return {
          handRef,
          externalHandId: hand.externalHandId ?? undefined,
          handNumber: hand.handNumber ?? undefined,
          datetimeOriginal: hand.datetimeOriginal instanceof Date ? hand.datetimeOriginal : undefined,
          buttonSeat: hand.buttonSeat ?? undefined,
          heroSeat: hand.heroSeat ?? undefined,
          heroPosition: hand.heroPosition ?? undefined,
          smallBlind: Number(hand.smallBlind ?? 0),
          bigBlind: Number(hand.bigBlind ?? 0),
          ante: Number(hand.ante ?? 0),
          board: hand.board ?? undefined,
          heroCards: hand.heroCards ?? undefined,
          totalPot: hand.totalPot ?? undefined,
          rake: hand.rake ?? undefined,
          result: hand.result ?? undefined,
          showdown: Number(hand.showdown ?? 0) === 1,
        };
      });

      const actionsRows = await db
        .select({
          handId: centralHandActions.handId,
          street: centralHandActions.street,
          actionOrder: centralHandActions.actionOrder,
          playerName: centralHandActions.playerName,
          seat: centralHandActions.seat,
          position: centralHandActions.position,
          actionType: centralHandActions.actionType,
          amount: centralHandActions.amount,
          toAmount: centralHandActions.toAmount,
          stackBefore: centralHandActions.stackBefore,
          stackAfter: centralHandActions.stackAfter,
          potBefore: centralHandActions.potBefore,
          potAfter: centralHandActions.potAfter,
          isAllIn: centralHandActions.isAllIn,
          isForced: centralHandActions.isForced,
          facingActionType: centralHandActions.facingActionType,
          facingSizeBb: centralHandActions.facingSizeBb,
          heroInHand: centralHandActions.heroInHand,
          showdownVisible: centralHandActions.showdownVisible,
          contextJson: centralHandActions.contextJson,
        })
        .from(centralHandActions)
        .where(and(eq(centralHandActions.userId, userId), eq(centralHandActions.tournamentId, tournament.id)))
        .orderBy(asc(centralHandActions.handId), asc(centralHandActions.actionOrder));

      const actions = actionsRows
        .map((action) => {
          const handRef = handRefById.get(Number(action.handId));
          if (!handRef) return null;
          return {
            handRef,
            street: action.street,
            actionOrder: Number(action.actionOrder ?? 0),
            playerName: action.playerName,
            seat: action.seat ?? undefined,
            position: action.position ?? undefined,
            actionType: action.actionType,
            amount: action.amount ?? undefined,
            toAmount: action.toAmount ?? undefined,
            stackBefore: action.stackBefore ?? undefined,
            stackAfter: action.stackAfter ?? undefined,
            potBefore: action.potBefore ?? undefined,
            potAfter: action.potAfter ?? undefined,
            isAllIn: Number(action.isAllIn ?? 0) === 1,
            isForced: Number(action.isForced ?? 0) === 1,
            facingActionType: action.facingActionType ?? undefined,
            facingSizeBb: action.facingSizeBb ?? undefined,
            heroInHand: Number(action.heroInHand ?? 0) === 1,
            showdownVisible: Number(action.showdownVisible ?? 0) === 1,
            contextJson: action.contextJson ?? undefined,
          };
        })
        .filter((action): action is NonNullable<typeof action> => action !== null);

      const showdownRows = await db
        .select({
          handId: showdownRecords.handId,
          playerName: showdownRecords.playerName,
          seat: showdownRecords.seat,
          position: showdownRecords.position,
          holeCards: showdownRecords.holeCards,
          finalHandDescription: showdownRecords.finalHandDescription,
          wonPot: showdownRecords.wonPot,
          amountWon: showdownRecords.amountWon,
        })
        .from(showdownRecords)
        .where(and(eq(showdownRecords.userId, userId), eq(showdownRecords.tournamentId, tournament.id)))
        .orderBy(asc(showdownRecords.handId));

      const showdowns = showdownRows
        .map((show) => {
          const handRef = handRefById.get(Number(show.handId));
          if (!handRef) return null;
          return {
            handRef,
            playerName: show.playerName,
            seat: show.seat ?? undefined,
            position: show.position ?? undefined,
            holeCards: show.holeCards ?? undefined,
            finalHandDescription: show.finalHandDescription ?? undefined,
            wonPot: Number(show.wonPot ?? 0) === 1,
            amountWon: show.amountWon ?? undefined,
          };
        })
        .filter((show): show is NonNullable<typeof show> => show !== null);

      const analysis = await analyzeReplayTournament({
        tournament: {
          externalTournamentId: tournament.externalTournamentId ?? undefined,
          site: tournament.site,
          format: tournament.format,
          buyIn: Number(tournament.buyIn ?? 0),
          fee: Number(tournament.fee ?? 0),
          currency: tournament.currency,
          importedAt: tournament.importedAt instanceof Date ? tournament.importedAt : undefined,
          totalHands: Number(tournament.totalHands ?? hands.length),
          finalPosition: tournament.finalPosition ?? undefined,
          wasEliminated: Number(tournament.wasEliminated ?? 0) === 1,
          rawSourceId: tournament.rawSourceId ?? undefined,
        },
        hands,
        actions,
        showdowns,
      });

      await db.delete(playerTournamentStats).where(
        and(eq(playerTournamentStats.userId, userId), eq(playerTournamentStats.tournamentId, tournament.id)),
      );

      await db.insert(playerTournamentStats).values({
        userId,
        tournamentId: tournament.id,
        handsPlayed: hands.length,
        vpip: Number(analysis.stats.vpip ?? 0),
        pfr: Number(analysis.stats.pfr ?? 0),
        threeBet: Number(analysis.stats.threeBet ?? 0),
        cbetFlop: Number(analysis.stats.cbetFlop ?? 0),
        cbetTurn: Number(analysis.stats.cbetTurn ?? 0),
        foldToCbet: Number(analysis.stats.foldToCbet ?? 0),
        bbDefense: Number(analysis.stats.bbDefense ?? 0),
        stealAttempt: Number(analysis.stats.attemptToSteal ?? 0),
        aggressionFactor: Math.round(Number(analysis.stats.aggressionFactor ?? 0)),
        wtsd: Number(analysis.stats.wtsd ?? 0),
        wsd: Number(analysis.stats.wsd ?? 0),
        finalPosition: tournament.finalPosition ?? null,
        abiBucket: tournament.abiBucket ?? "micro",
        totalCost: Number(tournament.totalCost ?? 0),
      });

      touchedSiteBuckets.add(`${tournament.site}::${tournament.abiBucket ?? "micro"}`);
      updated += 1;
    } catch (error) {
      failures.push({
        tournamentId: Number(tournament.id),
        reason: error instanceof Error ? error.message : String(error),
      });
    }
  }

  await refreshUserAbiAggregates(userId);

  for (const key of touchedSiteBuckets) {
    const [site, abiBucket] = key.split("::");
    if (!site || !abiBucket) continue;
    await refreshFieldAbiAggregates(site, abiBucket);
  }

  const result = {
    totalTournaments: tournaments.length,
    updated,
    failed: failures.length,
    failures,
  };

  invalidateHistoricalProfileCache(userId);
  return result;
}

export async function compactReplayStorageForUser(userId: number, existingDb?: Awaited<ReturnType<typeof getDb>>) {
  const db = existingDb ?? await getDb();
  if (!db) throw new Error("Database not available");

  const compactedHands = await db
    .update(centralHands)
    .set({
      rawText: null,
      parsedJson: null,
      handContextJson: null,
      updatedAt: new Date(),
    })
    .where(and(
      eq(centralHands.userId, userId),
      or(
        isNotNull(centralHands.rawText),
        isNotNull(centralHands.parsedJson),
        isNotNull(centralHands.handContextJson),
      ),
    ));

  const compactedActions = await db
    .update(centralHandActions)
    .set({
      contextJson: null,
    })
    .where(and(eq(centralHandActions.userId, userId), isNotNull(centralHandActions.contextJson)));

  return {
    success: true,
    compactedHands: Number((compactedHands as any)?.rowsAffected ?? 0),
    compactedActions: Number((compactedActions as any)?.rowsAffected ?? 0),
  };
}

export async function refreshUserAbiAggregates(userId: number) {
  const db = await getDb();
  if (!db) throw new Error("Database not available");

  const tournaments = await db
    .select({
      id: centralTournaments.id,
      totalCost: centralTournaments.totalCost,
      abiBucket: centralTournaments.abiBucket,
      totalHands: centralTournaments.totalHands,
      finalPosition: centralTournaments.finalPosition,
    })
    .from(centralTournaments)
    .where(eq(centralTournaments.userId, userId));

  if (tournaments.length === 0) return;

  const costs = tournaments.map((t) => Number(t.totalCost ?? 0)).sort((a, b) => a - b);
  const avgAbi = Math.round(costs.reduce((acc, value) => acc + value, 0) / costs.length);
  const medianAbi = costs.length % 2 === 1
    ? costs[Math.floor(costs.length / 2)]
    : Math.round((costs[costs.length / 2 - 1] + costs[costs.length / 2]) / 2);
  const sampleHands = tournaments.reduce((acc, t) => acc + Number(t.totalHands ?? 0), 0);

  const finishPositions = tournaments
    .map((t) => Number(t.finalPosition ?? 0))
    .filter((value) => Number.isFinite(value) && value > 0);
  const avgFinishPosition = finishPositions.length > 0
    ? Math.round(finishPositions.reduce((acc, value) => acc + value, 0) / finishPositions.length)
    : 0;

  const [tournamentAverages] = await db
    .select({
      vpipAvg: sql<number>`COALESCE(ROUND(AVG(${playerTournamentStats.vpip})), 0)`,
      pfrAvg: sql<number>`COALESCE(ROUND(AVG(${playerTournamentStats.pfr})), 0)`,
      threeBetAvg: sql<number>`COALESCE(ROUND(AVG(${playerTournamentStats.threeBet})), 0)`,
      cbetFlopAvg: sql<number>`COALESCE(ROUND(AVG(${playerTournamentStats.cbetFlop})), 0)`,
      cbetTurnAvg: sql<number>`COALESCE(ROUND(AVG(${playerTournamentStats.cbetTurn})), 0)`,
      foldToCbetAvg: sql<number>`COALESCE(ROUND(AVG(${playerTournamentStats.foldToCbet})), 0)`,
      bbDefenseAvg: sql<number>`COALESCE(ROUND(AVG(${playerTournamentStats.bbDefense})), 0)`,
      stealAttemptAvg: sql<number>`COALESCE(ROUND(AVG(${playerTournamentStats.stealAttempt})), 0)`,
      aggressionFactorAvg: sql<number>`COALESCE(ROUND(AVG(${playerTournamentStats.aggressionFactor})), 0)`,
    })
    .from(playerTournamentStats)
    .where(eq(playerTournamentStats.userId, userId));

  // Keep aggregates deterministic even when unique indexes are missing in production.
  await db.delete(playerAggregateStats).where(eq(playerAggregateStats.userId, userId));

  await db
    .insert(playerAggregateStats)
    .values({
      userId,
      sampleHands,
      sampleTournaments: tournaments.length,
      vpipAvg: Number(tournamentAverages?.vpipAvg ?? 0),
      pfrAvg: Number(tournamentAverages?.pfrAvg ?? 0),
      threeBetAvg: Number(tournamentAverages?.threeBetAvg ?? 0),
      cbetFlopAvg: Number(tournamentAverages?.cbetFlopAvg ?? 0),
      cbetTurnAvg: Number(tournamentAverages?.cbetTurnAvg ?? 0),
      foldToCbetAvg: Number(tournamentAverages?.foldToCbetAvg ?? 0),
      bbDefenseAvg: Number(tournamentAverages?.bbDefenseAvg ?? 0),
      stealAttemptAvg: Number(tournamentAverages?.stealAttemptAvg ?? 0),
      aggressionFactorAvg: Number(tournamentAverages?.aggressionFactorAvg ?? 0),
      avgFinishPosition,
      averageAbi: avgAbi,
      medianAbi,
    });

  const byBucket = new Map<string, { tournaments: number; hands: number; finishSum: number; finishCount: number }>();
  for (const t of tournaments) {
    const bucket = t.abiBucket ?? "micro";
    if (!byBucket.has(bucket)) {
      byBucket.set(bucket, { tournaments: 0, hands: 0, finishSum: 0, finishCount: 0 });
    }
    const entry = byBucket.get(bucket)!;
    entry.tournaments += 1;
    entry.hands += Number(t.totalHands ?? 0);
    if (typeof t.finalPosition === "number" && t.finalPosition > 0) {
      entry.finishSum += t.finalPosition;
      entry.finishCount += 1;
    }
  }

  const positionAggRowsByBucket = await db
    .select({
      position: centralHands.heroPosition,
      abiBucket: centralTournaments.abiBucket,
      handsPlayed: sql<number>`COUNT(*)`,
      netChips: sql<number>`COALESCE(SUM(${centralHands.result}), 0)`,
    })
    .from(centralHands)
    .innerJoin(centralTournaments, eq(centralTournaments.id, centralHands.tournamentId))
    .where(eq(centralHands.userId, userId))
    .groupBy(centralHands.heroPosition, centralTournaments.abiBucket);

  await db.delete(playerStatsByAbi).where(eq(playerStatsByAbi.userId, userId));
  for (const [bucket, agg] of Array.from(byBucket.entries())) {
    await db.insert(playerStatsByAbi).values({
      userId,
      abiBucket: bucket,
      tournaments: agg.tournaments,
      handsPlayed: agg.hands,
      avgFinishPosition: agg.finishCount > 0 ? Math.round(agg.finishSum / agg.finishCount) : null,
    });
  }

  await db.delete(playerStatsByPositionAndAbi).where(eq(playerStatsByPositionAndAbi.userId, userId));
  for (const row of positionAggRowsByBucket) {
    await db.insert(playerStatsByPositionAndAbi).values({
      userId,
      abiBucket: row.abiBucket ?? "micro",
      position: row.position ?? "UNKNOWN",
      handsPlayed: Number(row.handsPlayed ?? 0),
      netChips: Number(row.netChips ?? 0),
    });
  }

  const positionAggRows = await db
    .select({
      position: centralHands.heroPosition,
      handsPlayed: sql<number>`COUNT(*)`,
      netChips: sql<number>`COALESCE(SUM(${centralHands.result}), 0)`,
    })
    .from(centralHands)
    .where(eq(centralHands.userId, userId))
    .groupBy(centralHands.heroPosition);

  await db.delete(playerPositionStats).where(eq(playerPositionStats.userId, userId));
  for (const row of positionAggRows) {
    await db.insert(playerPositionStats).values({
      userId,
      position: normalizeStoredPosition(row.position as string | undefined),
      handsPlayed: Number(row.handsPlayed ?? 0),
      netChips: Number(row.netChips ?? 0),
    });
  }
}

export async function refreshFieldAbiAggregates(site: string, abiBucket: string) {
  const db = await getDb();
  if (!db) throw new Error("Database not available");

  const [agg] = await db
    .select({
      sampleTournaments: sql<number>`COUNT(*)`,
      sampleHands: sql<number>`COALESCE(SUM(${centralTournaments.totalHands}),0)`,
    })
    .from(centralTournaments)
    .where(and(eq(centralTournaments.site, site), eq(centralTournaments.abiBucket, abiBucket)));

  await db
    .insert(fieldAggregateStatsByAbi)
    .values({
      site,
      abiBucket,
      sampleTournaments: Number(agg?.sampleTournaments ?? 0),
      sampleHands: Number(agg?.sampleHands ?? 0),
    })
    .onDuplicateKeyUpdate({
      set: {
        sampleTournaments: Number(agg?.sampleTournaments ?? 0),
        sampleHands: Number(agg?.sampleHands ?? 0),
        updatedAt: new Date(),
      },
    });
}

export async function getAbiDashboard(userId: number, lastN = 20) {
  const db = await getDb();
  if (!db) throw new Error("Database not available");

  const all = await db
    .select({ totalCost: centralTournaments.totalCost })
    .from(centralTournaments)
    .where(eq(centralTournaments.userId, userId))
    .orderBy(desc(centralTournaments.importedAt));

  const last = all.slice(0, Math.max(1, Math.min(200, lastN)));
  const avg = (rows: Array<{ totalCost: number | null }>) =>
    rows.length > 0 ? Math.round(rows.reduce((acc, r) => acc + Number(r.totalCost ?? 0), 0) / rows.length) : 0;

  const aggregate = await db
    .select()
    .from(playerAggregateStats)
    .where(eq(playerAggregateStats.userId, userId))
    .limit(1);

  const byAbi = await db
    .select()
    .from(playerStatsByAbi)
    .where(eq(playerStatsByAbi.userId, userId));

  const byPositionAndAbi = await db
    .select()
    .from(playerStatsByPositionAndAbi)
    .where(eq(playerStatsByPositionAndAbi.userId, userId));

  return {
    abiLastN: avg(last),
    abiPeriod: avg(all),
    abiFull: aggregate[0]?.averageAbi ?? avg(all),
    medianAbi: aggregate[0]?.medianAbi ?? 0,
    byAbi,
    byPositionAndAbi,
  };
}

export async function getTournamentOverview(tournamentId: number, requesterId: number) {
  const db = await getDb();
  if (!db) throw new Error("Database not available");

  const [tournament] = await db
    .select()
    .from(centralTournaments)
    .where(eq(centralTournaments.id, tournamentId))
    .limit(1);
  if (!tournament) return null;

  if (tournament.userId !== requesterId) {
    const permitted = await isReadAuthorized(requesterId, tournament.userId, "revisor");
    await db.insert(dataAccessAuditLogs).values({
      actorUserId: requesterId,
      targetUserId: tournament.userId,
      actorRole: (await getUserRole(requesterId)) ?? "unknown",
      accessScope: "tournament_overview",
      outcome: permitted ? "allowed" : "denied",
      reason: "cross-user access",
    });
    if (!permitted) throw new Error("FORBIDDEN");
  }

  const [stats] = await db
    .select()
    .from(playerAggregateStats)
    .where(eq(playerAggregateStats.userId, tournament.userId))
    .limit(1);

  const [byTournament] = await db
    .select()
    .from(playerStatsByAbi)
    .where(and(eq(playerStatsByAbi.userId, tournament.userId), eq(playerStatsByAbi.abiBucket, tournament.abiBucket)))
    .limit(1);

  return { tournament, aggregate: stats ?? null, bucketStats: byTournament ?? null };
}

async function getUserRole(userId: number): Promise<string | null> {
  const db = await getDb();
  if (!db) throw new Error("Database not available");

  const [row] = await db
    .select({ role: users.role })
    .from(users)
    .where(eq(users.id, userId))
    .limit(1);

  return row?.role ?? null;
}

export async function isReadAuthorized(actorUserId: number, targetUserId: number, scope: "revisor" | "trainer" | "gto" | "field") {
  if (actorUserId === targetUserId) return true;

  const db = await getDb();
  if (!db) throw new Error("Database not available");

  const role = await getUserRole(actorUserId);
  if (role === "admin" || role === "developer" || role === "system_ai_service") {
    return true;
  }

  const [grant] = await db
    .select()
    .from(userDataAccessGrants)
    .where(and(eq(userDataAccessGrants.ownerUserId, targetUserId), eq(userDataAccessGrants.viewerUserId, actorUserId), eq(userDataAccessGrants.active, 1)))
    .limit(1);

  if (!grant) return false;

  if (scope === "revisor") return grant.allowHandReview === 1;
  if (scope === "trainer") return grant.allowTrainerAccess === 1;
  if (scope === "gto") return grant.allowGtoAccess === 1;
  return grant.allowFieldComparison === 1;
}
