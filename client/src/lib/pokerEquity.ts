export const DISPLAY_RANKS = ["A", "K", "Q", "J", "T", "9", "8", "7", "6", "5", "4", "3", "2"] as const;
export const EVAL_RANKS = ["2", "3", "4", "5", "6", "7", "8", "9", "T", "J", "Q", "K", "A"] as const;
export const SUITS = [
  { key: "h", label: "♥", name: "Copas", color: "#ef4444" },
  { key: "d", label: "♦", name: "Ouros", color: "#f59e0b" },
  { key: "c", label: "♣", name: "Paus", color: "#16a34a" },
  { key: "s", label: "♠", name: "Espadas", color: "#60a5fa" },
] as const;

export type PokerSuit = (typeof SUITS)[number]["key"];
export type PokerRank = (typeof DISPLAY_RANKS)[number];
export type PokerCard = `${PokerRank}${PokerSuit}`;

export const ALL_POKER_CARDS: PokerCard[] = DISPLAY_RANKS.flatMap((rank) =>
  SUITS.map((suit) => `${rank}${suit.key}` as PokerCard)
);

export const HAND_CATEGORY_ORDER = [
  "straight_flush",
  "quads",
  "full_house",
  "flush",
  "straight",
  "trips",
  "two_pair",
  "one_pair",
  "high_card",
] as const;

export type HandCategoryKey = (typeof HAND_CATEGORY_ORDER)[number];

export const HAND_CATEGORY_LABELS: Record<HandCategoryKey, string> = {
  straight_flush: "Straight flush",
  quads: "Quadra",
  full_house: "Full house",
  flush: "Flush",
  straight: "Sequência",
  trips: "Trinca",
  two_pair: "Dois pares",
  one_pair: "Um par",
  high_card: "Carta alta",
};

export const HAND_CATEGORY_COLORS: Record<HandCategoryKey, string> = {
  straight_flush: "#f59e0b",
  quads: "#ef4444",
  full_house: "#8b5cf6",
  flush: "#22c55e",
  straight: "#38bdf8",
  trips: "#a855f7",
  two_pair: "#eab308",
  one_pair: "#60a5fa",
  high_card: "#94a3b8",
};

export type SeatCards = [PokerCard | null, PokerCard | null];
export type HoldemBoard = [PokerCard | null, PokerCard | null, PokerCard | null, PokerCard | null, PokerCard | null];

export type HandEvaluation = {
  category: HandCategoryKey;
  score: number[];
};

export type HoldemEquitySimulationInput = {
  hero: SeatCards;
  villains: SeatCards[];
  board: HoldemBoard;
  iterations?: number;
};

export type HoldemEquitySimulationOk = {
  ok: true;
  method: "montecarlo";
  iterations: number;
  heroEquityPct: number;
  fieldEquityPct: number;
  heroWinPct: number;
  heroTiePct: number;
  heroCategoryCounts: Record<HandCategoryKey, number>;
  fieldCategoryCounts: Record<HandCategoryKey, number>;
};

export type HoldemEquitySimulationError = {
  ok: false;
  reason: string;
};

export type HoldemEquitySimulationResult = HoldemEquitySimulationOk | HoldemEquitySimulationError;

const RANK_TO_INDEX = new Map<string, number>(EVAL_RANKS.map((rank, index) => [rank, index]));
const SUIT_TO_INDEX = new Map<PokerSuit, number>(SUITS.map((suit, index) => [suit.key, index]));

function compareScores(a: number[], b: number[]): number {
  const size = Math.max(a.length, b.length);
  for (let index = 0; index < size; index += 1) {
    const diff = (a[index] ?? 0) - (b[index] ?? 0);
    if (diff !== 0) return diff;
  }
  return 0;
}

function encodeScore(categoryRank: number, kickers: number[]): number[] {
  return [categoryRank, ...kickers];
}

export function parsePokerCard(value: string | null | undefined): PokerCard | null {
  const raw = String(value || "").trim().toUpperCase();
  if (raw.length !== 2) return null;
  const rank = raw[0] as PokerRank;
  const suit = raw[1].toLowerCase() as PokerSuit;
  if (!RANK_TO_INDEX.has(rank)) return null;
  if (!SUIT_TO_INDEX.has(suit)) return null;
  return `${rank}${suit}` as PokerCard;
}

export function cardToPrettyLabel(card: PokerCard): string {
  const rank = card[0];
  const suit = card[1] as PokerSuit;
  const suitData = SUITS.find((item) => item.key === suit);
  return `${rank}${suitData?.label ?? suit.toUpperCase()}`;
}

export function cardSuitMeta(card: PokerCard) {
  const suit = card[1] as PokerSuit;
  return SUITS.find((item) => item.key === suit) ?? SUITS[0];
}

export function cardColor(card: PokerCard): string {
  return cardSuitMeta(card).color;
}

export function cardToId(card: PokerCard): number {
  const rank = RANK_TO_INDEX.get(card[0]);
  const suit = SUIT_TO_INDEX.get(card[1] as PokerSuit);
  if (rank == null || suit == null) return -1;
  return rank * 4 + suit;
}

export function idToCard(id: number): PokerCard {
  const rankIndex = Math.floor(id / 4);
  const suitIndex = id % 4;
  const rank = EVAL_RANKS[rankIndex];
  const suit = SUITS[suitIndex]?.key ?? "h";
  return `${rank}${suit}` as PokerCard;
}

export function getRemainingDeck(usedCards: number[]): number[] {
  const usedSet = new Set(usedCards);
  const deck: number[] = [];
  for (let id = 0; id < 52; id += 1) {
    if (!usedSet.has(id)) deck.push(id);
  }
  return deck;
}

export function evaluate5(ids: number[]): HandEvaluation {
  const ranks = ids.map((card) => Math.floor(card / 4));
  const suits = ids.map((card) => card % 4);
  const rankCount = new Map<number, number>();
  for (const rank of ranks) rankCount.set(rank, (rankCount.get(rank) ?? 0) + 1);

  const groups = Array.from(rankCount.entries()).sort((a, b) => b[1] - a[1] || b[0] - a[0]);
  const flush = suits.every((suit) => suit === suits[0]);
  const uniqueRanks = Array.from(new Set(ranks)).sort((a, b) => b - a);

  let straightHigh = -1;
  if (uniqueRanks.length === 5) {
    if (uniqueRanks[0] - uniqueRanks[4] === 4) {
      straightHigh = uniqueRanks[0];
    } else if (
      uniqueRanks[0] === 12 &&
      uniqueRanks[1] === 3 &&
      uniqueRanks[2] === 2 &&
      uniqueRanks[3] === 1 &&
      uniqueRanks[4] === 0
    ) {
      straightHigh = 3;
    }
  }

  if (flush && straightHigh >= 0) return { category: "straight_flush", score: encodeScore(8, [straightHigh]) };
  if (groups[0][1] === 4) return { category: "quads", score: encodeScore(7, [groups[0][0], groups[1][0]]) };
  if (groups[0][1] === 3 && groups[1][1] === 2) return { category: "full_house", score: encodeScore(6, [groups[0][0], groups[1][0]]) };
  if (flush) return { category: "flush", score: encodeScore(5, uniqueRanks) };
  if (straightHigh >= 0) return { category: "straight", score: encodeScore(4, [straightHigh]) };
  if (groups[0][1] === 3) return { category: "trips", score: encodeScore(3, [groups[0][0], groups[1][0], groups[2][0]]) };
  if (groups[0][1] === 2 && groups[1][1] === 2) {
    const pairs = [groups[0][0], groups[1][0]].sort((a, b) => b - a);
    return { category: "two_pair", score: encodeScore(2, [pairs[0], pairs[1], groups[2][0]]) };
  }
  if (groups[0][1] === 2) return { category: "one_pair", score: encodeScore(1, [groups[0][0], groups[1][0], groups[2][0], groups[3][0]]) };
  return { category: "high_card", score: encodeScore(0, uniqueRanks) };
}

export function evaluate7(ids: number[]): HandEvaluation {
  let best: HandEvaluation | null = null;

  for (let a = 0; a < 6; a += 1) {
    for (let b = a + 1; b < 7; b += 1) {
      const five: number[] = [];
      for (let index = 0; index < 7; index += 1) {
        if (index !== a && index !== b) five.push(ids[index]);
      }
      const current = evaluate5(five);
      if (!best || compareScores(current.score, best.score) > 0) best = current;
    }
  }

  return best ?? { category: "high_card", score: [0] };
}

function normalizeSeat(seat: SeatCards | undefined): SeatCards {
  if (!seat) return [null, null];
  return [seat[0] ?? null, seat[1] ?? null];
}

function isSeatComplete(seat: SeatCards): boolean {
  const first = Boolean(seat[0]);
  const second = Boolean(seat[1]);
  return (first && second) || (!first && !second);
}

function collectUsedCards(hero: SeatCards, villains: SeatCards[], board: HoldemBoard): number[] {
  const cards: number[] = [];
  const add = (card: PokerCard | null) => {
    if (!card) return;
    const id = cardToId(card);
    if (id >= 0) cards.push(id);
  };

  hero.forEach(add);
  villains.forEach((seat) => seat.forEach(add));
  board.forEach(add);
  return cards;
}

function classifyBestCategory(evals: HandEvaluation[]): HandCategoryKey {
  let best = evals[0];
  for (let index = 1; index < evals.length; index += 1) {
    if (compareScores(evals[index].score, best.score) > 0) best = evals[index];
  }
  return best.category;
}

function shuffleInPlace(values: number[]): void {
  for (let index = values.length - 1; index > 0; index -= 1) {
    const swapIndex = Math.floor(Math.random() * (index + 1));
    [values[index], values[swapIndex]] = [values[swapIndex], values[index]];
  }
}

function initCategoryCounts(): Record<HandCategoryKey, number> {
  return {
    straight_flush: 0,
    quads: 0,
    full_house: 0,
    flush: 0,
    straight: 0,
    trips: 0,
    two_pair: 0,
    one_pair: 0,
    high_card: 0,
  };
}

export function simulateHoldemEquity(input: HoldemEquitySimulationInput): HoldemEquitySimulationResult {
  const hero = normalizeSeat(input.hero);
  const villains = (input.villains || []).map((seat) => normalizeSeat(seat));
  const board = (input.board || [null, null, null, null, null]) as HoldemBoard;
  const iterations = Math.max(500, Math.floor(Number(input.iterations || 4000)));

  if (!isSeatComplete(hero) || !hero[0] || !hero[1]) {
    return { ok: false, reason: "Selecione as duas cartas do herói." };
  }

  for (const seat of villains) {
    if (!isSeatComplete(seat)) {
      return { ok: false, reason: "Cada adversário precisa estar completo ou vazio." };
    }
  }

  const knownUsed = collectUsedCards(hero, villains, board);
  if (new Set(knownUsed).size !== knownUsed.length) {
    return { ok: false, reason: "Há cartas repetidas na mesa ou nas mãos." };
  }

  const boardKnownCount = board.filter(Boolean).length;
  const boardMissingCount = 5 - boardKnownCount;
  const unknownVillains = villains.filter((seat) => !seat[0] && !seat[1]).length;
  const cardsNeeded = boardMissingCount + unknownVillains * 2;
  if (52 - knownUsed.length < cardsNeeded) {
    return { ok: false, reason: "Não há cartas suficientes para completar a simulação." };
  }

  const heroCategoryCounts = initCategoryCounts();
  const fieldCategoryCounts = initCategoryCounts();

  let heroEquity = 0;
  let heroWins = 0;
  let heroTies = 0;

  const boardKnown = board.filter(Boolean) as PokerCard[];
  const heroIds = hero.map((card) => cardToId(card as PokerCard));
  const villainBlueprints = villains.map((seat) => (seat[0] && seat[1] ? [cardToId(seat[0]), cardToId(seat[1])] as [number, number] : null));

  for (let round = 0; round < iterations; round += 1) {
    const remainingDeck = getRemainingDeck(knownUsed);
    shuffleInPlace(remainingDeck);
    let pointer = 0;

    const runout: number[] = boardKnown.map((card) => cardToId(card));
    for (let index = 0; index < boardMissingCount; index += 1) {
      runout.push(remainingDeck[pointer]);
      pointer += 1;
    }

    const fullBoard = runout;
    const heroEval = evaluate7([...heroIds, ...fullBoard]);
    heroCategoryCounts[heroEval.category] += 1;

    const villainEvals = villainBlueprints.map((blueprint) => {
      let hole: [number, number];
      if (blueprint) {
        hole = blueprint;
      } else {
        hole = [remainingDeck[pointer], remainingDeck[pointer + 1]];
        pointer += 2;
      }
      const evaluation = evaluate7([...hole, ...fullBoard]);
      return evaluation;
    });

    const fieldBest = classifyBestCategory(villainEvals);
    fieldCategoryCounts[fieldBest] += 1;

    const allScores = [heroEval, ...villainEvals];
    let bestScore = allScores[0];
    for (let index = 1; index < allScores.length; index += 1) {
      if (compareScores(allScores[index].score, bestScore.score) > 0) {
        bestScore = allScores[index];
      }
    }

    const heroIsBest = compareScores(heroEval.score, bestScore.score) === 0;
    const tiedPlayers = allScores.filter((evalItem) => compareScores(evalItem.score, bestScore.score) === 0).length;
    const heroShare = heroIsBest ? 1 / tiedPlayers : 0;
    heroEquity += heroShare;
    if (heroShare === 1) heroWins += 1;
    else if (heroShare > 0) heroTies += 1;
  }

  const heroEquityPct = (heroEquity / iterations) * 100;
  return {
    ok: true,
    method: "montecarlo",
    iterations,
    heroEquityPct,
    fieldEquityPct: 100 - heroEquityPct,
    heroWinPct: (heroWins / iterations) * 100,
    heroTiePct: (heroTies / iterations) * 100,
    heroCategoryCounts,
    fieldCategoryCounts,
  };
}
