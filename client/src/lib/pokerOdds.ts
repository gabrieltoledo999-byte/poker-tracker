export const RANKS = ["A", "K", "Q", "J", "T", "9", "8", "7", "6", "5", "4", "3", "2"] as const;
export const RANKS_ASC = ["2", "3", "4", "5", "6", "7", "8", "9", "T", "J", "Q", "K", "A"] as const;
export const SUITS = ["h", "d", "c", "s"] as const;

export type CardRank = (typeof RANKS_ASC)[number];
export type CardSuit = (typeof SUITS)[number];
export type CardCode = `${CardRank}${CardSuit}`;

export type Card = {
  rank: 2 | 3 | 4 | 5 | 6 | 7 | 8 | 9 | 10 | 11 | 12 | 13 | 14;
  suit: CardSuit;
};

export type CategoryKey =
  | "royal_flush"
  | "straight_flush"
  | "quads"
  | "full_house"
  | "flush"
  | "straight"
  | "trips"
  | "two_pair"
  | "one_pair"
  | "high_card";

export const CATEGORY_ORDER: CategoryKey[] = [
  "royal_flush",
  "straight_flush",
  "quads",
  "full_house",
  "flush",
  "straight",
  "trips",
  "two_pair",
  "one_pair",
  "high_card",
];

export const CATEGORY_LABELS: Record<CategoryKey, string> = {
  royal_flush: "Royal flush",
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

export const SUIT_SYMBOLS: Record<CardSuit, string> = {
  h: "♥",
  d: "♦",
  c: "♣",
  s: "♠",
};

const CATEGORY_TO_NUMBER: Record<CategoryKey, number> = {
  high_card: 0,
  one_pair: 1,
  two_pair: 2,
  trips: 3,
  straight: 4,
  flush: 5,
  full_house: 6,
  quads: 7,
  straight_flush: 8,
  royal_flush: 9,
};

const NUMBER_TO_CATEGORY: Record<number, CategoryKey> = {
  0: "high_card",
  1: "one_pair",
  2: "two_pair",
  3: "trips",
  4: "straight",
  5: "flush",
  6: "full_house",
  7: "quads",
  8: "straight_flush",
  9: "royal_flush",
};

export type HandValue = {
  category: number;
  name: string;
  tiebreakers: number[];
  cards: Card[];
};

export type EvaluatedHand = {
  score: number;
  category: CategoryKey;
};

export type HoldemBoard = [CardCode | null, CardCode | null, CardCode | null, CardCode | null, CardCode | null];

export type OpponentConfig = {
  active?: boolean;
  cards?: Array<CardCode | null | undefined>;
  ranges?: string[];
};

export type OddsSimulationResult = {
  ok: boolean;
  method: "simulated" | "invalid";
  iterations: number;
  heroWinsPct: number;
  heroTiesPct: number;
  heroLosesPct: number;
  heroEquityPct: number;
  othersWinsPct: number;
  othersTiesPct: number;
  othersLosesPct: number;
  othersEquityPct: number;
  heroCategoryPct: Record<CategoryKey, number>;
  opponentsCategoryPct: Record<CategoryKey, number>;
  usedCards: CardCode[];
  activeOpponents: number;
  note?: string;
};

export const EMPTY_CATEGORY_PCT: Record<CategoryKey, number> = {
  royal_flush: 0,
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

export function normalizeCardCode(value: string): CardCode | null {
  const clean = String(value || "")
    .trim()
    .replace(/\s+/g, "")
    .toUpperCase();

  if (clean.length !== 2) return null;
  const rank = clean[0] as CardRank;
  const suit = clean[1].toLowerCase() as CardSuit;
  if (!RANKS_ASC.includes(rank) || !SUITS.includes(suit)) return null;
  return `${rank}${suit}`;
}

export function cardToLabel(card: CardCode): string {
  return `${card[0]}${SUIT_SYMBOLS[card[1] as CardSuit]}`;
}

export function cardColor(card: CardCode): string {
  const suit = card[1] as CardSuit;
  if (suit === "h") return "#ef4444";
  if (suit === "d") return "#f97316";
  if (suit === "c") return "#10b981";
  return "#0ea5e9";
}

function rankToValue(rank: CardRank): Card["rank"] {
  const index = RANKS_ASC.indexOf(rank);
  return (index + 2) as Card["rank"];
}

function valueToRank(rank: number): CardRank {
  return RANKS_ASC[Math.max(0, Math.min(12, rank - 2))] ?? "2";
}

export function cardCodeToCard(card: CardCode): Card {
  return {
    rank: rankToValue(card[0] as CardRank),
    suit: card[1] as CardSuit,
  };
}

export function cardToCode(card: Card): CardCode {
  return `${valueToRank(card.rank)}${card.suit}` as CardCode;
}

export function cardToId(card: CardCode): number {
  const rankIndex = RANKS_ASC.indexOf(card[0] as CardRank);
  const suitIndex = SUITS.indexOf(card[1] as CardSuit);
  if (rankIndex < 0 || suitIndex < 0) return -1;
  return rankIndex * 4 + suitIndex;
}

export function idToCard(id: number): CardCode {
  const rank = RANKS_ASC[Math.floor(id / 4)] ?? "2";
  const suit = SUITS[id % 4] ?? "h";
  return `${rank}${suit}` as CardCode;
}

export function createDeck(): CardCode[] {
  const deck: CardCode[] = [];
  for (const rank of RANKS_ASC) {
    for (const suit of SUITS) {
      deck.push(`${rank}${suit}` as CardCode);
    }
  }
  return deck;
}

export const ALL_POKER_CARDS = createDeck();

function packScore(category: number, tiebreakers: number[]): number {
  let value = category;
  for (const kicker of tiebreakers) {
    value = value * 16 + kicker;
  }
  return value;
}

function compareArraysDesc(a: number[], b: number[]): number {
  for (let i = 0; i < Math.max(a.length, b.length); i += 1) {
    const av = a[i] ?? 0;
    const bv = b[i] ?? 0;
    if (av !== bv) return av - bv;
  }
  return 0;
}

function assertUniqueCards(cards: Card[]) {
  const seen = new Set<string>();
  for (const card of cards) {
    const key = `${card.rank}${card.suit}`;
    if (seen.has(key)) {
      throw new Error("Cartas repetidas nao sao permitidas na avaliacao.");
    }
    seen.add(key);
  }
}

function detectStraightHigh(ranks: number[]): number {
  const uniq = Array.from(new Set(ranks)).sort((a, b) => b - a);
  if (uniq.length !== 5) return 0;

  if (uniq[0] - uniq[4] === 4) return uniq[0];

  // Wheel: A-2-3-4-5 -> high is 5.
  if (uniq[0] === 14 && uniq[1] === 5 && uniq[2] === 4 && uniq[3] === 3 && uniq[4] === 2) {
    return 5;
  }

  return 0;
}

function byCountThenRank(a: [number, number], b: [number, number]) {
  return b[1] - a[1] || b[0] - a[0];
}

export function evaluateFiveCards(cards: Card[]): HandValue {
  if (cards.length !== 5) {
    throw new Error("evaluateFiveCards precisa de exatamente 5 cartas.");
  }

  assertUniqueCards(cards);

  const ranks = cards.map((card) => card.rank);
  const suits = cards.map((card) => card.suit);
  const rankCount = new Map<number, number>();
  for (const rank of ranks) {
    rankCount.set(rank, (rankCount.get(rank) ?? 0) + 1);
  }

  const groups = Array.from(rankCount.entries()).sort(byCountThenRank);
  const sortedRanksDesc = [...ranks].sort((a, b) => b - a);
  const flush = suits.every((suit) => suit === suits[0]);
  const straightHigh = detectStraightHigh(ranks);

  if (flush && straightHigh === 14) {
    const needed = [14, 13, 12, 11, 10];
    const hasRoyal = needed.every((value) => ranks.includes(value));
    if (hasRoyal) {
      return { category: 9, name: "Royal flush", tiebreakers: [14], cards };
    }
  }

  if (flush && straightHigh > 0) {
    return { category: 8, name: "Straight flush", tiebreakers: [straightHigh], cards };
  }

  if (groups[0][1] === 4) {
    return {
      category: 7,
      name: "Quadra",
      tiebreakers: [groups[0][0], groups[1][0]],
      cards,
    };
  }

  if (groups[0][1] === 3 && groups[1][1] === 2) {
    return {
      category: 6,
      name: "Full house",
      tiebreakers: [groups[0][0], groups[1][0]],
      cards,
    };
  }

  if (flush) {
    return {
      category: 5,
      name: "Flush",
      tiebreakers: sortedRanksDesc,
      cards,
    };
  }

  if (straightHigh > 0) {
    return {
      category: 4,
      name: "Sequência",
      tiebreakers: [straightHigh],
      cards,
    };
  }

  if (groups[0][1] === 3) {
    const kickers = groups
      .slice(1)
      .map(([rank]) => rank)
      .sort((a, b) => b - a);
    return {
      category: 3,
      name: "Trinca",
      tiebreakers: [groups[0][0], ...kickers],
      cards,
    };
  }

  if (groups[0][1] === 2 && groups[1][1] === 2) {
    const topPair = Math.max(groups[0][0], groups[1][0]);
    const lowPair = Math.min(groups[0][0], groups[1][0]);
    const kicker = groups[2][0];
    return {
      category: 2,
      name: "Dois pares",
      tiebreakers: [topPair, lowPair, kicker],
      cards,
    };
  }

  if (groups[0][1] === 2) {
    const pair = groups[0][0];
    const kickers = groups
      .slice(1)
      .map(([rank]) => rank)
      .sort((a, b) => b - a);
    return {
      category: 1,
      name: "Um par",
      tiebreakers: [pair, ...kickers],
      cards,
    };
  }

  return {
    category: 0,
    name: "Carta alta",
    tiebreakers: sortedRanksDesc,
    cards,
  };
}

function fiveCardCombinations(cards: Card[]): Card[][] {
  const out: Card[][] = [];
  for (let a = 0; a < cards.length - 4; a += 1) {
    for (let b = a + 1; b < cards.length - 3; b += 1) {
      for (let c = b + 1; c < cards.length - 2; c += 1) {
        for (let d = c + 1; d < cards.length - 1; d += 1) {
          for (let e = d + 1; e < cards.length; e += 1) {
            out.push([cards[a], cards[b], cards[c], cards[d], cards[e]]);
          }
        }
      }
    }
  }
  return out;
}

export function compareHands(a: HandValue, b: HandValue): number {
  if (a.category !== b.category) {
    return a.category - b.category;
  }
  return compareArraysDesc(a.tiebreakers, b.tiebreakers);
}

export function evaluateSevenCards(cards: Card[]): HandValue {
  if (cards.length < 5 || cards.length > 7) {
    throw new Error("evaluateSevenCards aceita 5, 6 ou 7 cartas.");
  }

  assertUniqueCards(cards);

  const combos = fiveCardCombinations(cards);
  let best = evaluateFiveCards(combos[0]);

  for (let i = 1; i < combos.length; i += 1) {
    const current = evaluateFiveCards(combos[i]);
    if (compareHands(current, best) > 0) {
      best = current;
    }
  }

  return best;
}

export function evaluate7(cards: CardCode[]): EvaluatedHand {
  if (cards.length !== 7) {
    throw new Error("evaluate7 precisa de exatamente 7 cartas.");
  }

  const hand = evaluateSevenCards(cards.map(cardCodeToCard));
  const category = NUMBER_TO_CATEGORY[hand.category] ?? "high_card";
  return {
    score: packScore(hand.category, hand.tiebreakers),
    category,
  };
}

function shuffleDeck(deck: CardCode[]): CardCode[] {
  const copy = [...deck];
  for (let i = copy.length - 1; i > 0; i -= 1) {
    const j = Math.floor(Math.random() * (i + 1));
    [copy[i], copy[j]] = [copy[j], copy[i]];
  }
  return copy;
}

function drawCard(deck: CardCode[]): CardCode {
  const card = deck.pop();
  if (!card) throw new Error("Baralho sem cartas suficientes.");
  return card;
}

function uniqueCards(cards: Array<CardCode | null | undefined>): CardCode[] {
  const out: CardCode[] = [];
  const seen = new Set<string>();
  for (const card of cards) {
    if (!card) continue;
    if (seen.has(card)) continue;
    seen.add(card);
    out.push(card);
  }
  return out;
}

function initCategoryPct(): Record<CategoryKey, number> {
  return { ...EMPTY_CATEGORY_PCT };
}

function parseRangeToken(token: string): { a: CardRank; b: CardRank; suited: "s" | "o" | "any" } | null {
  const clean = token.trim().toUpperCase();
  if (!clean) return null;
  if (clean.length === 2) {
    const a = clean[0] as CardRank;
    const b = clean[1] as CardRank;
    if (!RANKS_ASC.includes(a) || !RANKS_ASC.includes(b)) return null;
    return { a, b, suited: "any" };
  }
  if (clean.length === 3) {
    const a = clean[0] as CardRank;
    const b = clean[1] as CardRank;
    const suited = clean[2].toLowerCase();
    if (!RANKS_ASC.includes(a) || !RANKS_ASC.includes(b)) return null;
    if (suited !== "s" && suited !== "o") return null;
    return { a, b, suited };
  }
  return null;
}

function rangeTokenToCombos(token: string): CardCode[][] {
  const parsed = parseRangeToken(token);
  if (!parsed) return [];

  const out: CardCode[][] = [];
  for (let i = 0; i < SUITS.length; i += 1) {
    for (let j = 0; j < SUITS.length; j += 1) {
      const suitA = SUITS[i];
      const suitB = SUITS[j];

      if (parsed.a === parsed.b && i >= j) continue;
      if (parsed.suited === "s" && suitA !== suitB) continue;
      if (parsed.suited === "o" && suitA === suitB) continue;

      const c1 = `${parsed.a}${suitA}` as CardCode;
      const c2 = `${parsed.b}${suitB}` as CardCode;
      if (c1 === c2) continue;

      if (parsed.a !== parsed.b) {
        const keyA = cardToId(c1);
        const keyB = cardToId(c2);
        if (keyA > keyB) continue;
      }

      out.push([c1, c2]);
    }
  }

  return out;
}

function pickRangeCombo(tokens: string[], available: Set<CardCode>): CardCode[] | null {
  const allCombos = tokens.flatMap(rangeTokenToCombos);
  const valid = allCombos.filter(([c1, c2]) => available.has(c1) && available.has(c2));
  if (valid.length === 0) return null;
  const idx = Math.floor(Math.random() * valid.length);
  return valid[idx];
}

export function simulateEquity(params: {
  heroCards: Array<CardCode | null | undefined>;
  boardCards: Array<CardCode | null | undefined>;
  opponents?: OpponentConfig[];
  activeOpponents?: number;
  iterations?: number;
}): OddsSimulationResult {
  const hero = uniqueCards(params.heroCards);
  const board = uniqueCards(params.boardCards);
  const requestedIterations = Math.max(200, Math.floor(params.iterations || 5000));

  const blank = (note: string): OddsSimulationResult => ({
    ok: false,
    method: "invalid",
    iterations: 0,
    heroWinsPct: 0,
    heroTiesPct: 0,
    heroLosesPct: 0,
    heroEquityPct: 0,
    othersWinsPct: 0,
    othersTiesPct: 0,
    othersLosesPct: 0,
    othersEquityPct: 0,
    heroCategoryPct: initCategoryPct(),
    opponentsCategoryPct: initCategoryPct(),
    usedCards: uniqueCards([...hero, ...board]),
    activeOpponents: 0,
    note,
  });

  if (hero.length !== 2) return blank("Selecione 2 cartas do heroi para calcular.");
  if (board.length > 5) return blank("No maximo 5 cartas na mesa.");

  if (new Set([...hero, ...board]).size !== hero.length + board.length) {
    return blank("Ha cartas repetidas na selecao.");
  }

  const explicitOpponents = params.opponents?.filter((o) => o.active ?? true) ?? [];
  const fallbackCount = Math.max(0, Math.min(9, Math.floor(params.activeOpponents ?? 0)));
  const opponentSlots: OpponentConfig[] = explicitOpponents.length > 0 ? explicitOpponents : Array.from({ length: fallbackCount }, () => ({ active: true }));

  const activeOpponents = Math.min(9, opponentSlots.length);
  const fixedUsed = new Set<CardCode>([...hero, ...board]);
  for (const opponent of opponentSlots) {
    for (const card of uniqueCards(opponent.cards ?? [])) {
      if (fixedUsed.has(card)) {
        return blank("Cartas fixas dos oponentes conflitam com cartas conhecidas.");
      }
      fixedUsed.add(card);
    }
  }

  const knownUsed = new Set<CardCode>([...hero, ...board]);
  const baseDeck = createDeck().filter((card) => !knownUsed.has(card));

  let wins = 0;
  let ties = 0;
  let equityShare = 0;
  let othersWins = 0;
  let othersTies = 0;
  let othersEquityShare = 0;
  const heroCategoryCount = initCategoryPct();
  const opponentsCategoryCount = initCategoryPct();

  for (let iteration = 0; iteration < requestedIterations; iteration += 1) {
    const deck = shuffleDeck(baseDeck);
    const available = new Set(deck);
    const opponentHands: CardCode[][] = [];

    for (const opponent of opponentSlots) {
      const fixed = uniqueCards(opponent.cards ?? []);
      if (fixed.length > 2) {
        return blank("Cada oponente pode ter no maximo 2 cartas fixas.");
      }

      if (fixed.length === 2) {
        if (!available.has(fixed[0]) || !available.has(fixed[1])) {
          return blank("Conflito de cartas fixas entre oponentes.");
        }
        available.delete(fixed[0]);
        available.delete(fixed[1]);
        opponentHands.push([fixed[0], fixed[1]]);
        continue;
      }

      if (fixed.length === 1) {
        if (!available.has(fixed[0])) return blank("Conflito de carta fixa do oponente.");
        available.delete(fixed[0]);

        let secondCard: CardCode | null = null;
        if (opponent.ranges && opponent.ranges.length > 0) {
          const combo = pickRangeCombo(opponent.ranges, available);
          if (combo) {
            secondCard = combo[0] === fixed[0] ? combo[1] : combo[0];
            if (!secondCard || !available.has(secondCard)) secondCard = null;
          }
        }

        if (!secondCard) {
          const availableArray = [...available];
          secondCard = availableArray[Math.floor(Math.random() * availableArray.length)] ?? null;
        }

        if (!secondCard) return blank("Baralho insuficiente para completar mao do oponente.");
        available.delete(secondCard);
        opponentHands.push([fixed[0], secondCard]);
        continue;
      }

      if (opponent.ranges && opponent.ranges.length > 0) {
        const combo = pickRangeCombo(opponent.ranges, available);
        if (combo) {
          available.delete(combo[0]);
          available.delete(combo[1]);
          opponentHands.push(combo);
          continue;
        }
      }

      const availableArray = [...available];
      if (availableArray.length < 2) return blank("Baralho insuficiente para distribuir oponentes.");
      const first = availableArray[Math.floor(Math.random() * availableArray.length)];
      available.delete(first);
      const availableArray2 = [...available];
      const second = availableArray2[Math.floor(Math.random() * availableArray2.length)];
      available.delete(second);
      opponentHands.push([first, second]);
    }

    const boardMissing = 5 - board.length;
    if (available.size < boardMissing) {
      return blank("Baralho insuficiente para completar o board.");
    }

    const runout: CardCode[] = [];
    for (let i = 0; i < boardMissing; i += 1) {
      const arr = [...available];
      const picked = arr[Math.floor(Math.random() * arr.length)];
      available.delete(picked);
      runout.push(picked);
    }

    const fullBoard = [...board, ...runout];
    const heroValue = evaluateSevenCards([...hero, ...fullBoard].map(cardCodeToCard));
    const heroKey = NUMBER_TO_CATEGORY[heroValue.category];
    heroCategoryCount[heroKey] += 1;

    const opponentValues = opponentHands.map((opponentCards) => {
      const value = evaluateSevenCards([...opponentCards, ...fullBoard].map(cardCodeToCard));
      const category = NUMBER_TO_CATEGORY[value.category];
      opponentsCategoryCount[category] += 1;
      return value;
    });

    const allValues = [heroValue, ...opponentValues];
    let best = allValues[0];
    for (let i = 1; i < allValues.length; i += 1) {
      if (compareHands(allValues[i], best) > 0) best = allValues[i];
    }

    const winnerIndexes: number[] = [];
    allValues.forEach((value, idx) => {
      if (compareHands(value, best) === 0) {
        winnerIndexes.push(idx);
      }
    });

    const heroWon = winnerIndexes.includes(0);
    if (heroWon) {
      if (winnerIndexes.length === 1) {
        wins += 1;
        equityShare += 1;
      } else {
        ties += 1;
        equityShare += 1 / winnerIndexes.length;
        othersTies += 1;
        othersEquityShare += (winnerIndexes.length - 1) / winnerIndexes.length;
      }
    } else {
      othersEquityShare += 1;
      if (winnerIndexes.length === 1) {
        othersWins += 1;
      } else {
        othersTies += 1;
      }
    }
  }

  const heroCategoryPct = initCategoryPct();
  const opponentsCategoryPct = initCategoryPct();

  for (const category of CATEGORY_ORDER) {
    heroCategoryPct[category] = (heroCategoryCount[category] / requestedIterations) * 100;
    opponentsCategoryPct[category] = activeOpponents > 0 ? (opponentsCategoryCount[category] / (requestedIterations * activeOpponents)) * 100 : 0;
  }

  return {
    ok: true,
    method: "simulated",
    iterations: requestedIterations,
    heroWinsPct: (wins / requestedIterations) * 100,
    heroTiesPct: (ties / requestedIterations) * 100,
    heroLosesPct: ((requestedIterations - wins - ties) / requestedIterations) * 100,
    heroEquityPct: (equityShare / requestedIterations) * 100,
    othersWinsPct: (othersWins / requestedIterations) * 100,
    othersTiesPct: (othersTies / requestedIterations) * 100,
    othersLosesPct: ((requestedIterations - othersWins - othersTies) / requestedIterations) * 100,
    othersEquityPct: (othersEquityShare / requestedIterations) * 100,
    heroCategoryPct,
    opponentsCategoryPct,
    usedCards: uniqueCards([...hero, ...board, ...opponentSlots.flatMap((opponent) => uniqueCards(opponent.cards ?? []))]),
    activeOpponents,
  };
}

export function simulateHoldemEquity(params: {
  heroCards: Array<CardCode | null | undefined>;
  boardCards: Array<CardCode | null | undefined>;
  activeOpponents: number;
  iterations?: number;
}): OddsSimulationResult {
  return simulateEquity({
    heroCards: params.heroCards,
    boardCards: params.boardCards,
    activeOpponents: params.activeOpponents,
    iterations: params.iterations,
  });
}

export function evaluate5(ids: number[]): EvaluatedHand {
  if (ids.length !== 5) throw new Error("evaluate5 precisa de 5 ids.");
  const cards = ids.map(idToCard);
  const hand = evaluateFiveCards(cards.map(cardCodeToCard));
  const category = NUMBER_TO_CATEGORY[hand.category] ?? "high_card";
  return {
    score: packScore(hand.category, hand.tiebreakers),
    category,
  };
}

export function categoryToNumber(category: CategoryKey): number {
  return CATEGORY_TO_NUMBER[category];
}
