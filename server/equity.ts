/**
 * Texas Hold'em equity calculator (7-card evaluator + board enumeration).
 *
 * Usage:
 *   const eq = equityAtAllIn({
 *     heroHole: ["As","Kd"],
 *     villainHoles: [["Qh","Qc"]],
 *     knownBoard: ["2s","7d","9h"], // 0, 3, 4 or 5 cards
 *   });
 *   eq.hero = 0.72 (share of pot hero expects)
 */

const RANK_CHAR = "23456789TJQKA";
const SUIT_CHAR = "cdhs";

function cardToId(card: string): number {
  if (!card || card.length < 2) return -1;
  const r = RANK_CHAR.indexOf(card[0].toUpperCase());
  const s = SUIT_CHAR.indexOf(card[1].toLowerCase());
  if (r < 0 || s < 0) return -1;
  return r * 4 + s; // 0..51
}

function parseCards(src: string | string[] | undefined): number[] {
  if (!src) return [];
  const arr = Array.isArray(src) ? src : String(src).trim().split(/\s+/);
  const out: number[] = [];
  for (const c of arr) {
    const id = cardToId(c);
    if (id >= 0) out.push(id);
  }
  return out;
}

// 5-card hand evaluator: returns a score (higher = better).
// Uses classic category * 1e6 + tiebreak ranks packed in base-13.
function evaluate5(ids: number[]): number {
  const ranks = ids.map((c) => (c >> 2));
  const suits = ids.map((c) => c & 3);
  const rankCount = new Map<number, number>();
  for (const r of ranks) rankCount.set(r, (rankCount.get(r) ?? 0) + 1);
  const groups = Array.from(rankCount.entries())
    .sort((a, b) => b[1] - a[1] || b[0] - a[0]);
  const flush = suits.every((s) => s === suits[0]);
  const uniq = Array.from(new Set(ranks)).sort((a, b) => b - a);
  let straightHigh = -1;
  if (uniq.length === 5) {
    if (uniq[0] - uniq[4] === 4) straightHigh = uniq[0];
    else if (uniq[0] === 12 && uniq[1] === 3 && uniq[2] === 2 && uniq[3] === 1 && uniq[4] === 0) straightHigh = 3; // wheel
  }
  const pack = (cat: number, kickers: number[]) => {
    let v = cat;
    for (const k of kickers) v = v * 16 + k;
    return v;
  };
  if (flush && straightHigh >= 0) return pack(8, [straightHigh]);
  if (groups[0][1] === 4) return pack(7, [groups[0][0], groups[1][0]]);
  if (groups[0][1] === 3 && groups[1][1] === 2) return pack(6, [groups[0][0], groups[1][0]]);
  if (flush) return pack(5, uniq);
  if (straightHigh >= 0) return pack(4, [straightHigh]);
  if (groups[0][1] === 3) return pack(3, [groups[0][0], groups[1][0], groups[2][0]]);
  if (groups[0][1] === 2 && groups[1][1] === 2) {
    const pairs = [groups[0][0], groups[1][0]].sort((a, b) => b - a);
    return pack(2, [pairs[0], pairs[1], groups[2][0]]);
  }
  if (groups[0][1] === 2) return pack(1, [groups[0][0], groups[1][0], groups[2][0], groups[3][0]]);
  return pack(0, uniq);
}

// Best 5 of 7
function evaluate7(seven: number[]): number {
  let best = -1;
  const idx = [0, 1, 2, 3, 4, 5, 6];
  // iterate all C(7,5)=21 combinations (pick 2 to exclude)
  for (let a = 0; a < 6; a++) {
    for (let b = a + 1; b < 7; b++) {
      const five: number[] = [];
      for (const i of idx) if (i !== a && i !== b) five.push(seven[i]);
      const sc = evaluate5(five);
      if (sc > best) best = sc;
    }
  }
  return best;
}

export type EquityInput = {
  heroHole: string | string[];
  villainHoles: Array<string | string[]>;
  knownBoard?: string | string[]; // 0, 3, 4 or 5 cards
  maxSamples?: number; // cap for enumeration; if exceeded, Monte Carlo
};

export type EquityResult = {
  hero: number; // 0..1 share of pot
  hands: number;
  method: "enum" | "montecarlo" | "direct";
};

function remainingDeck(used: number[]): number[] {
  const usedSet = new Set(used);
  const out: number[] = [];
  for (let i = 0; i < 52; i++) if (!usedSet.has(i)) out.push(i);
  return out;
}

function combinations(arr: number[], k: number, start: number, current: number[], out: number[][]) {
  if (current.length === k) { out.push(current.slice()); return; }
  for (let i = start; i <= arr.length - (k - current.length); i++) {
    current.push(arr[i]);
    combinations(arr, k, i + 1, current, out);
    current.pop();
  }
}

/**
 * Equity of hero vs villains given partial board.
 * Ties split the pot (hero gets 1/N share when N players tie).
 */
export function equityAtAllIn(input: EquityInput): EquityResult | null {
  const hero = parseCards(input.heroHole);
  if (hero.length !== 2) return null;
  const villains = input.villainHoles.map((v) => parseCards(v)).filter((v) => v.length === 2);
  if (villains.length === 0) return null;
  const board = parseCards(input.knownBoard);
  if (![0, 3, 4, 5].includes(board.length)) return null;

  const used = [...hero, ...board, ...villains.flat()];
  // No duplicates allowed
  if (new Set(used).size !== used.length) return null;

  const need = 5 - board.length;
  if (need === 0) {
    const heroScore = evaluate7([...hero, ...board]);
    const vilScores = villains.map((v) => evaluate7([...v, ...board]));
    const maxVil = Math.max(...vilScores);
    if (heroScore > maxVil) return { hero: 1, hands: 1, method: "direct" };
    if (heroScore < maxVil) return { hero: 0, hands: 1, method: "direct" };
    // tie: how many share top with hero?
    const tiedCount = 1 + vilScores.filter((s) => s === heroScore).length;
    return { hero: 1 / tiedCount, hands: 1, method: "direct" };
  }

  const remaining = remainingDeck(used);
  const maxSamples = input.maxSamples ?? 20000;

  // Enumerate or Monte Carlo
  let heroShare = 0;
  let count = 0;
  // number of combinations C(remaining.length, need)
  const n = remaining.length;
  let totalCombos = 1;
  for (let i = 0; i < need; i++) totalCombos = (totalCombos * (n - i)) / (i + 1);

  const useEnum = totalCombos <= maxSamples;

  const playHand = (runout: number[]) => {
    const full = [...board, ...runout];
    const heroScore = evaluate7([...hero, ...full]);
    const vilScores = villains.map((v) => evaluate7([...v, ...full]));
    const maxVil = Math.max(...vilScores);
    if (heroScore > maxVil) {
      heroShare += 1;
    } else if (heroScore === maxVil) {
      const tiedCount = 1 + vilScores.filter((s) => s === heroScore).length;
      heroShare += 1 / tiedCount;
    }
    count += 1;
  };

  if (useEnum) {
    const combos: number[][] = [];
    combinations(remaining, need, 0, [], combos);
    for (const c of combos) playHand(c);
    return { hero: heroShare / count, hands: count, method: "enum" };
  }

  // Monte Carlo with Fisher-Yates sampling
  const deck = remaining.slice();
  for (let iter = 0; iter < maxSamples; iter++) {
    for (let i = 0; i < need; i++) {
      const j = i + Math.floor(Math.random() * (deck.length - i));
      const t = deck[i]; deck[i] = deck[j]; deck[j] = t;
    }
    playHand(deck.slice(0, need));
  }
  return { hero: heroShare / count, hands: count, method: "montecarlo" };
}
