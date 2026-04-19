import { and, asc, desc, eq, sql } from "drizzle-orm";
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

function normalizeCards(value: string | undefined): string {
  return String(value ?? "")
    .replace(/\s+/g, " ")
    .trim()
    .toUpperCase();
}

function normalizeId(value: string | undefined): string {
  return String(value ?? "").trim();
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
      actionOrder: centralHandActions.actionOrder,
    })
    .from(centralHandActions)
    .where(eq(centralHandActions.tournamentId, tournamentId))
    .orderBy(asc(centralHandActions.handId), asc(centralHandActions.actionOrder));

  const filteredActions = actionRows.filter((a: any) => handIds.includes(Number(a.handId)));
  const byHand = new Map<number, Array<{ actionType: string; playerName: string }>>();
  for (const action of filteredActions) {
    const bucket = byHand.get(Number(action.handId)) ?? [];
    bucket.push({ actionType: action.actionType, playerName: action.playerName });
    byHand.set(Number(action.handId), bucket);
  }

  const opponentNames = new Set<string>();
  const handFingerprints = storedHands.map((hand) => {
    const actions = byHand.get(hand.id) ?? [];
    const actionCount = actions.length;
    const betLikeCount = actions.filter((a) => a.actionType === "bet" || a.actionType === "raise" || a.actionType === "all_in").length;

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
};

async function computeLiveHistoricalStatsFromHands(db: any, userId: number): Promise<LiveHistoricalStats | null> {
  const hands = await db
    .select({
      id: centralHands.id,
      heroSeat: centralHands.heroSeat,
      heroPosition: centralHands.heroPosition,
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
      actionType: centralHandActions.actionType,
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
    actionType: string | null;
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
      actionType: action.actionType,
      isForced: action.isForced,
      heroInHand: action.heroInHand,
    });
    actionsByHand.set(handId, bucket);
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

  for (const hand of hands) {
    const handId = Number(hand.id);
    const handActions = actionsByHand.get(handId) ?? [];
    const heroSeat = Number(hand.heroSeat ?? 0);
    const isHeroAction = (action: { heroInHand?: number | null; seat?: number | null }) => Number(action.heroInHand ?? 0) === 1
      || (heroSeat > 0 && Number(action.seat ?? 0) === heroSeat);
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
    let heroCbetFlopThisHand = false;
    if (preflopAggressorIsHero) {
      cbetOpportunities += 1;
      const heroFlopCbet = flop.some((a) => isHeroAction(a) && isAggressiveAction({ actionType: a.actionType ?? undefined }));
      if (heroFlopCbet) cbetMade += 1;
      heroCbetFlopThisHand = heroFlopCbet;
    } else if (preflopAggressorName) {
      const firstHeroFlopActionIndex = flop.findIndex((a) => isHeroAction(a));
      if (firstHeroFlopActionIndex >= 0) {
        const villainCbetBeforeHero = flop.slice(0, firstHeroFlopActionIndex).some(
          (a) => normalizePlayerName(a.playerName ?? undefined) === preflopAggressorName
            && isAggressiveAction({ actionType: a.actionType ?? undefined }),
        );
        if (villainCbetBeforeHero) {
          foldToCbetOpportunities += 1;
          const firstHeroAction = flop[firstHeroFlopActionIndex];
          if (firstHeroAction && isFoldAction({ actionType: firstHeroAction.actionType ?? undefined })) {
            foldToCbetCount += 1;
          }
        }
      }
    }

    const turn = handActions.filter((a) => normalizeStreet(a.street ?? undefined) === "turn");
    if (heroCbetFlopThisHand && turn.length > 0) {
      cbetTurnOpportunities += 1;
      const heroTurnCbet = turn.some((a) => isHeroAction(a) && isAggressiveAction({ actionType: a.actionType ?? undefined }));
      if (heroTurnCbet) cbetTurnMade += 1;
    }

    const heroPosition = String(hand.heroPosition ?? "UNKNOWN");
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
      stealOpportunities += 1;
      const firstHeroPreflopIndex = preflop.findIndex((a) => isHeroAction(a));
      if (firstHeroPreflopIndex >= 0) {
        const action = preflop[firstHeroPreflopIndex];
        const priorVoluntary = preflop.slice(0, firstHeroPreflopIndex).some((a) => isVoluntaryPreflopAction({ actionType: a.actionType ?? undefined, isForced: Number(a.isForced ?? 0) === 1 }));
        if (!priorVoluntary && action && isAggressiveAction({ actionType: action.actionType ?? undefined })) {
          stealAttemptCount += 1;
        }
      }
    }

    for (const action of handActions) {
      if (!isHeroAction(action)) continue;
      if (isCallAction({ actionType: action.actionType ?? undefined })) callActions += 1;
      if (isAggressiveAction({ actionType: action.actionType ?? undefined })) aggressionActions += 1;
    }
  }

  const handsCount = hands.length;
  const showdownHands = hands.filter((h) => Number(h.showdown ?? 0) === 1);
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

    const heroPosition = hand.heroPosition?.trim() || "UNKNOWN";
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
    let heroCbetFlopThisHand = false;
    if (preflopAggressorName === heroName) {
      cbetOpportunities += 1;
      const heroFlopCbet = flop.some(
        (a) => normalizePlayerName(a.playerName) === heroName && isAggressiveAction(a),
      );
      if (heroFlopCbet) cbetMade += 1;
      heroCbetFlopThisHand = heroFlopCbet;
    } else if (preflopAggressorName && preflopAggressorName !== heroName) {
      const firstHeroFlopActionIndex = flop.findIndex((a) => normalizePlayerName(a.playerName) === heroName);
      if (firstHeroFlopActionIndex >= 0) {
        const villainCbetBeforeHero = flop.slice(0, firstHeroFlopActionIndex).some(
          (a) => normalizePlayerName(a.playerName) === preflopAggressorName && isAggressiveAction(a),
        );
        if (villainCbetBeforeHero) {
          foldToCbetOpportunities += 1;
          const firstHeroAction = flop[firstHeroFlopActionIndex];
          if (firstHeroAction && isFoldAction(firstHeroAction)) {
            foldToCbetCount += 1;
          }
        }
      }
    }

    const turn = handActions.filter((a) => normalizeStreet(a.street) === "turn");
    if (heroCbetFlopThisHand && turn.length > 0) {
      cbetTurnOpportunities += 1;
      const heroTurnCbet = turn.some(
        (a) => normalizePlayerName(a.playerName) === heroName && isAggressiveAction(a),
      );
      if (heroTurnCbet) cbetTurnMade += 1;
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
      stealOpportunities += 1;
      const firstHeroPreflopIndex = preflop.findIndex((a) => normalizePlayerName(a.playerName) === heroName);
      if (firstHeroPreflopIndex >= 0) {
        const action = preflop[firstHeroPreflopIndex];
        const priorVoluntary = preflop.slice(0, firstHeroPreflopIndex).some(
          (a) => isVoluntaryPreflopAction(a),
        );
        if (!priorVoluntary && action && isAggressiveAction(action)) {
          stealAttemptCount += 1;
        }
      }
    }

    for (const action of heroActions) {
      if (isCallAction(action)) callActions += 1;
      if (isAggressiveAction(action)) aggressionActions += 1;
    }
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
  const showdownHands = hands.filter((h) => Boolean(h.showdown));
  const wtsd = toPct(showdownHands.length, hands.length);
  const wonAtShowdown = showdownHands.filter((h) => Number(h.result ?? 0) > 0).length;
  const wsd = toPct(wonAtShowdown, showdownHands.length);

  const alerts: string[] = [];
  const strengths: string[] = [];
  if (vpip > 42) alerts.push("VPIP alto no torneio: possivel excesso de mãos marginais.");
  if (pfr > 0 && vpip > 0 && pfr / Math.max(vpip, 1) < 0.5) alerts.push("Gap VPIP vs PFR sugere tendencia passiva preflop.");
  if (bbDefense < 25 && bbDefenseOpportunities >= 3) alerts.push("Defesa de BB baixa nas oportunidades observadas.");
  if (aggressionFactor < 1.2) alerts.push("Aggression Factor baixo; tendencia mais passiva que agressiva.");
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
      foldToCbet,
      bbDefense,
      attemptToSteal,
      aggressionFactor,
      wtsd,
      wsd,
    },
    opportunities: {
      hands: hands.length,
      cbetFlop: cbetOpportunities,
      cbetTurn: cbetTurnOpportunities,
      foldToCbet: foldToCbetOpportunities,
      bbDefense: bbDefenseOpportunities,
      steal: stealOpportunities,
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
  };
}

export async function getPlayerHistoricalProfile(userId: number) {
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
    console.log("[getPlayerHistoricalProfile] Aggregate missing. Triggering refreshUserAbiAggregates...");
    await refreshUserAbiAggregates(userId);
    [aggregate] = await db
      .select()
      .from(playerAggregateStats)
      .where(eq(playerAggregateStats.userId, userId))
      .orderBy(desc(playerAggregateStats.updatedAt))
      .limit(1);
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

  const liveStats = await computeLiveHistoricalStatsFromHands(db, userId);

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

  const handsForPosition = await db
    .select({
      id: centralHands.id,
      heroSeat: centralHands.heroSeat,
      heroPosition: centralHands.heroPosition,
      bigBlind: centralHands.bigBlind,
      result: centralHands.result,
    })
    .from(centralHands)
    .where(eq(centralHands.userId, userId));

  const actionsForPosition = await db
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
    .orderBy(asc(centralHandActions.handId), asc(centralHandActions.actionOrder));

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

  const positionAccumulator = new Map<string, { handsPlayed: number; netChips: number; netBb: number }>();

  for (const hand of handsForPosition) {
    const handId = Number(hand.id ?? 0);
    if (!handId) continue;

    const heroSeat = Number(hand.heroSeat ?? 0);
    const actions = (actionsByHandForPosition.get(handId) ?? []).filter((action) => {
      const isHeroFlagged = Number(action.heroInHand ?? 0) === 1;
      const bySeatFallback = heroSeat > 0 && Number(action.seat ?? 0) === heroSeat;
      return isHeroFlagged || bySeatFallback;
    });

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

    const handNet = usedActionData ? handNetFromActions : Number(hand.result ?? 0);
    const handBigBlind = Number(hand.bigBlind ?? 0);
    const handNetBb = handBigBlind > 0 ? handNet / handBigBlind : 0;
    const position = String(hand.heroPosition ?? "UNKNOWN").trim() || "UNKNOWN";

    const prev = positionAccumulator.get(position) ?? { handsPlayed: 0, netChips: 0, netBb: 0 };
    positionAccumulator.set(position, {
      handsPlayed: prev.handsPlayed + 1,
      netChips: prev.netChips + handNet,
      netBb: prev.netBb + handNetBb,
    });
  }

  const positionStatsFromHands = Array.from(positionAccumulator.entries()).map(([position, values]) => ({
    position,
    handsPlayed: values.handsPlayed,
    netChips: values.netChips,
    netBb: values.netBb,
  }));

  const tournamentStatsCount = Number(tournamentMetricAverages?.totalTournaments ?? 0);
  const tournamentHandsSum = Number(tournamentMetricAverages?.totalHands ?? 0);
  const fallbackTournamentCount = tournaments.length;
  const fallbackHandsCount = tournaments.reduce((acc, t) => acc + Number(t.totalHands ?? 0), 0);

  const totalTournaments = Number(
    aggregate?.sampleTournaments && Number(aggregate.sampleTournaments) > 0
      ? aggregate.sampleTournaments
      : tournamentStatsCount > 0
        ? tournamentStatsCount
        : fallbackTournamentCount,
  );
  const totalHands = Number(
    aggregate?.sampleHands && Number(aggregate.sampleHands) > 0
      ? aggregate.sampleHands
      : tournamentHandsSum > 0
        ? tournamentHandsSum
        : fallbackHandsCount,
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

  const posSortedByGain = [...normalizedPositionStats].sort((a, b) => Number(b.netChips ?? 0) - Number(a.netChips ?? 0));
  const posSortedByLoss = [...normalizedPositionStats].sort((a, b) => Number(a.netChips ?? 0) - Number(b.netChips ?? 0));

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
    attemptToStealAvg: Number(aggregate?.stealAttemptAvg ?? tournamentMetricAverages?.stealAttemptAvg ?? 0),
    aggressionFactorAvg: Number(aggregate?.aggressionFactorAvg ?? tournamentMetricAverages?.aggressionFactorAvg ?? 0),
    wtsdAvg: Number(tournamentMetricAverages?.wtsdAvg ?? 0),
    wsdAvg: Number(tournamentMetricAverages?.wsdAvg ?? 0),
  };

  const aggregateLooksZeroed =
    totalHands > 0
    && metricFromAggregate.vpipAvg === 0
    && metricFromAggregate.pfrAvg === 0
    && metricFromAggregate.threeBetAvg === 0
    && metricFromAggregate.cbetFlopAvg === 0
    && metricFromAggregate.attemptToStealAvg === 0
    && metricFromAggregate.aggressionFactorAvg === 0;

  const finalMetrics = aggregateLooksZeroed && liveStats
    ? {
        vpipAvg: liveStats.vpip,
        pfrAvg: liveStats.pfr,
        threeBetAvg: liveStats.threeBet,
        bbDefenseAvg: liveStats.bbDefense,
        cbetFlopAvg: liveStats.cbetFlop,
        cbetTurnAvg: liveStats.cbetTurn,
        attemptToStealAvg: liveStats.attemptToSteal,
        aggressionFactorAvg: liveStats.aggressionFactor,
        wtsdAvg: liveStats.wtsd,
        wsdAvg: liveStats.wsd,
      }
    : metricFromAggregate;

  if (aggregateLooksZeroed && liveStats) {
    console.log("[getPlayerHistoricalProfile] Using live hand-action fallback metrics:", finalMetrics);
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
      attemptToStealAvg: finalMetrics.attemptToStealAvg,
      aggressionFactorAvg: finalMetrics.aggressionFactorAvg,
      wtsdAvg: finalMetrics.wtsdAvg,
      wsdAvg: finalMetrics.wsdAvg,
    },
    positions: {
      byPosition: normalizedPositionStats,
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

    if (hasExactTournamentIdMatch) {
      throw new Error("DUPLICATE_REPLAY");
    }

    const enoughHandsForPattern = dedupInput.handFingerprints.length >= DUPLICATE_HAND_WINDOW;
    if (!enoughHandsForPattern) continue;
    if (Number(candidate.totalHands ?? 0) !== dedupInput.totalHands) continue;

    const stored = await buildStoredTournamentDedupFingerprint(db, candidate.id, dedupInput.heroName);
    const hasSameOpponents = stored.opponentSignature.length > 0 && stored.opponentSignature === dedupInput.opponentSignature;
    if (!hasSameOpponents) continue;

    const inputSequence = dedupInput.handFingerprints.map((h) => h.signature);
    if (hasConsecutiveFingerprintMatch(inputSequence, stored.handFingerprints, DUPLICATE_HAND_WINDOW)) {
      throw new Error("DUPLICATE_REPLAY");
    }
  }

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

  const tournamentId = tournamentInserted.id;

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

  const tournamentAnalysis = await analyzeReplayTournament(input);
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

  await refreshUserAbiAggregates(userId);
  if (consent.allowFieldAggregation === 1) {
    await refreshFieldAbiAggregates(input.tournament.site, abiBucket);
  }

  return { tournamentId, handsImported: handIdByRef.size };
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
      position: (row.position as any) ?? "UNKNOWN",
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
