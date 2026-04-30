/**
 * Pot Odds & Outs calculator
 * Based on standard 52-card deck rules.
 */

export type OutCategory =
  | "straight_draw"
  | "flush_draw"
  | "two_pair_to_full"
  | "pair_to_three"
  | "three_to_four"
  | "overcards"
  | "gut_shot"
  | "combo_draw";

export interface DrawInfo {
  category: OutCategory;
  label: string;
  outs: number;
  description: string;
}

export interface PotOddsResult {
  /** Custo da call em chips */
  callAmount: number;
  /** Pot total depois da call */
  totalPot: number;
  /** Equity mínima necessária (0-100) */
  requiredEquityPct: number;
  /** Pot odds expresso como ratio "X:1" */
  oddsRatio: string;
  /** Draws detectados nas cartas do herói */
  draws: DrawInfo[];
  /** Outs totais únicos */
  totalOuts: number;
  /** Equity aproximada com rule of 2/4 (0-100) */
  handEquityPct: number;
  /** Se há cartas suficientes para calcular (flop ou turn) */
  canCalculate: boolean;
  /** Ruas restantes */
  streetsLeft: 0 | 1 | 2;
  /** Decisão de EV: call lucrativa? */
  isValueCall: boolean;
}

// ─── Card parsing ────────────────────────────────────────────────────────────

const RANKS = ["2", "3", "4", "5", "6", "7", "8", "9", "T", "J", "Q", "K", "A"];
const SUITS = ["s", "h", "d", "c"];

function parseCard(card: string): { rank: number; suit: string } | null {
  if (!card || card.length < 2) return null;
  const suit = card.slice(-1).toLowerCase();
  const rankStr = card.slice(0, -1).toUpperCase().replace("10", "T");
  const rank = RANKS.indexOf(rankStr);
  if (rank === -1 || !SUITS.includes(suit)) return null;
  return { rank, suit };
}

function rankIndex(card: string): number {
  const parsed = parseCard(card);
  return parsed?.rank ?? -1;
}

function suitOf(card: string): string {
  return parseCard(card)?.suit ?? "";
}

// ─── Draw detection ──────────────────────────────────────────────────────────

function detectFlushDraw(hole: string[], board: string[]): DrawInfo | null {
  const all = [...hole, ...board];
  const suitCounts: Record<string, number> = {};
  for (const c of all) {
    const s = suitOf(c);
    if (s) suitCounts[s] = (suitCounts[s] ?? 0) + 1;
  }
  for (const [suit, count] of Object.entries(suitCounts)) {
    if (count === 4) {
      const outs = 13 - 4; // 9 flush outs
      return {
        category: "flush_draw",
        label: "Flush Draw",
        outs,
        description: `4 cartas do mesmo naipe (${suit.toUpperCase()}) — ${outs} outs`,
      };
    }
  }
  return null;
}

function detectStraightDraw(hole: string[], board: string[]): DrawInfo | null {
  const all = [...hole, ...board];
  const rankSet = new Set(all.map(rankIndex).filter(r => r >= 0));

  // Include A as low (rank -1 → treat as 0) for A-2-3-4-5
  const ranks = Array.from(rankSet);
  if (rankSet.has(12)) ranks.push(-1); // Ace low

  let maxConsec = 0;
  let bestWindow = 0;
  for (let low = -1; low <= 9; low++) {
    let count = 0;
    for (let r = low; r <= low + 4; r++) {
      if (rankSet.has(r) || (r === -1 && rankSet.has(12))) count++;
    }
    if (count > maxConsec) { maxConsec = count; bestWindow = low; }
  }

  if (maxConsec === 4) {
    // Open-ended or double gut-shot = 8 outs
    // Check if open-ended (both ends open)
    const lo = bestWindow;
    const hi = bestWindow + 4;
    const loOpen = lo > -1 && !rankSet.has(lo - 1);
    const hiOpen = hi < 13 && !rankSet.has(hi + 1);
    const oesd = loOpen && hiOpen;
    const outs = oesd ? 8 : 4;
    return {
      category: oesd ? "straight_draw" : "gut_shot",
      label: oesd ? "Sequência Aberta" : "Gutshot",
      outs,
      description: oesd ? `4 cartas em sequência (ambas as pontas abertas) — ${outs} outs` : `4 cartas em sequência (só uma ponta) — ${outs} outs`,
    };
  }

  if (maxConsec === 3) {
    // Gutshot with 3 connected cards
    return {
      category: "gut_shot",
      label: "Gutshot",
      outs: 4,
      description: "3 cartas em sequência — 4 outs",
    };
  }

  return null;
}

function detectPairDraw(hole: string[], board: string[]): DrawInfo | null {
  const boardRanks = board.map(rankIndex);
  const holeRanks = hole.map(rankIndex);

  // Count board rank occurrences
  const boardRankCounts: Record<number, number> = {};
  for (const r of boardRanks) boardRankCounts[r] = (boardRankCounts[r] ?? 0) + 1;

  // Check if hero has matching board cards (pair → set, two pair → full house, set → quads)
  for (const hr of holeRanks) {
    const boardCount = boardRankCounts[hr] ?? 0;
    if (boardCount === 1) {
      return {
        category: "pair_to_three",
        label: "Par → Trinca",
        outs: 2,
        description: "Emparelhou no board — 2 outs para trinca",
      };
    }
    if (boardCount === 2) {
      return {
        category: "three_to_four",
        label: "Trinca → Quadra",
        outs: 1,
        description: "Trinca no board — 1 out para quadra",
      };
    }
  }

  // Two pair on board + one hole card match → full house draw
  const boardPairs = Object.entries(boardRankCounts).filter(([, c]) => c >= 2).map(([r]) => Number(r));
  for (const pr of boardPairs) {
    if (holeRanks.includes(pr)) {
      return {
        category: "two_pair_to_full",
        label: "Dois Pares → Full House",
        outs: 4,
        description: "Dois pares com o board — 4 outs para full house",
      };
    }
  }

  return null;
}

function detectOvercards(hole: string[], board: string[]): DrawInfo | null {
  if (board.length === 0) return null;
  const maxBoard = Math.max(...board.map(rankIndex));
  const overcards = hole.filter(c => rankIndex(c) > maxBoard);
  if (overcards.length === 2) {
    return {
      category: "overcards",
      label: "Overcards",
      outs: 6,
      description: "2 overcards — 6 outs para par superior",
    };
  }
  if (overcards.length === 1) {
    return {
      category: "overcards",
      label: "Overcard",
      outs: 3,
      description: "1 overcard — 3 outs para par superior",
    };
  }
  return null;
}

// ─── Main calculator ──────────────────────────────────────────────────────────

/**
 * @param pot           Pot atual (antes da call)
 * @param callAmount    Quanto custa a call
 * @param heroHole      As 2 cartas do herói ["Ah", "Kd"]
 * @param board         Cartas comunitárias (0, 3, 4 ou 5 cartas)
 */
export function calculatePotOdds(
  pot: number,
  callAmount: number,
  heroHole: string[],
  board: string[],
): PotOddsResult {
  // canCalculate: whether pot odds ratio can be computed (requires a call)
  const canCalculate = board.length >= 3 && heroHole.length === 2 && callAmount > 0;
  // hasBoard: whether draws can be detected (only needs flop+)
  const hasBoard = board.length >= 3 && heroHole.length === 2;

  const streetsLeft: 0 | 1 | 2 =
    board.length === 3 ? 2 :
    board.length === 4 ? 1 : 0;

  const totalPot = pot + callAmount;
  const requiredEquityPct = callAmount > 0 ? (callAmount / totalPot) * 100 : 0;
  const oddsRatio =
    callAmount > 0
      ? `${(pot / callAmount).toFixed(1)}:1`
      : "—";

  // Detect draws whenever board is available (flop/turn/river), regardless of call
  const draws: DrawInfo[] = [];
  if (hasBoard) {
    const flush = detectFlushDraw(heroHole, board);
    if (flush) draws.push(flush);

    const straight = detectStraightDraw(heroHole, board);
    if (straight) draws.push(straight);

    const pair = detectPairDraw(heroHole, board);
    if (pair) draws.push(pair);

    if (draws.length === 0) {
      const over = detectOvercards(heroHole, board);
      if (over) draws.push(over);
    }
  }

  // Unique outs (cap at 15 to avoid impossible values)
  const totalOuts = Math.min(draws.reduce((sum, d) => sum + d.outs, 0), 15);

  // Rule of 2/4: each out is worth ~2% per street
  const multiplier = streetsLeft === 2 ? 4 : 2;
  const handEquityPct = hasBoard ? Math.min(totalOuts * multiplier, 100) : 0;

  const isValueCall = handEquityPct >= requiredEquityPct;

  return {
    callAmount,
    totalPot,
    requiredEquityPct,
    oddsRatio,
    draws,
    totalOuts,
    handEquityPct,
    canCalculate,
    streetsLeft,
    isValueCall,
  };
}
