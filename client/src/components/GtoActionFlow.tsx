import React, { useCallback, useEffect, useMemo, useReducer, useRef, useState } from "react";
import { trpc } from "@/lib/trpc";

// ─────────────────────────────────────────────────────────────────────────────
// TYPES
// ─────────────────────────────────────────────────────────────────────────────


type ActionType = "fold" | "limp" | "call" | "raise" | "allin" | "check";

type FlowActionOption = {
  id: string;
  label: string;
  type: ActionType;
  /** size in BB (e.g. 2.5 = raise to 2.5bb total) */
  sizeBb?: number;
};

type HistoryEntry = {
  position: string;
  type: ActionType;
  label: string;
  sizeBb?: number;
};

type PlayerStatus = "waiting" | "active" | "folded" | "allin";

type FlowState = {
  format: FlowFormat;
  stackBb: number;
  positions: string[];                   // positional order for preflop
  playerStatus: Record<string, PlayerStatus>;
  playerContrib: Record<string, number>; // chips contributed this street (in BB units)
  hasActed: Record<string, boolean>;     // true = made intentional action (posting blind doesn't count)
  history: HistoryEntry[];
  activePlayer: string | null;
  potBb: number;
  currentBetBb: number;                  // amount any player must match to continue
  isComplete: boolean;
  resultNote: string;
};

type ReducerAction =
  | { type: "ACT"; option: FlowActionOption }
  | { type: "SKIP_TO_POSITION"; position: string }
  | { type: "RESTORE_STATE"; state: FlowState }
  | { type: "RESET"; format: FlowFormat; stackBb: number };

// ─────────────────────────────────────────────────────────────────────────────
// CONSTANTS
// ─────────────────────────────────────────────────────────────────────────────

const FORMAT_POSITIONS: Record<FlowFormat, string[]> = {
  hu: ["SB", "BB"],
  "6max": ["UTG", "MP", "LJ", "HJ", "CO", "BTN", "SB", "BB"],
};

const RANKS = ["A", "K", "Q", "J", "T", "9", "8", "7", "6", "5", "4", "3", "2"] as const;

type MatrixBarOrientation = "diagonal" | "horizontal" | "vertical";
type MatrixBarPosition = "normal" | "reverse";
type MatrixActionColorKey = "raise" | "call" | "fold" | "allin";

type MatrixPreferencesPayload = {
  barOrientation: MatrixBarOrientation;
  barPosition: MatrixBarPosition;
  raiseColor: string;
  callColor: string;
  foldColor: string;
  allinColor: string;
};

type LocalMatrixPreferencesPayload = MatrixPreferencesPayload & {
  savedAt: number;
};

const MATRIX_PREFS_LOCAL_STORAGE_KEY = "gto:matrix-prefs:v1";
const MATRIX_WIDTH_RATIO = 1.5;
const MATRIX_LEGEND_WIDTH = 96;
const MATRIX_LEGEND_GAP = 6;

const ACTION_COLOR: Record<string, string> = {
  raise: "#22c55e",
  call: "#a855f7",
  fold: "#2563eb",
  allin: "#ef4444",
  limp: "#eab308",
  check: "#a855f7",
};

const MATRIX_DEFAULT_ACTION_COLORS: Record<MatrixActionColorKey, string> = {
  raise: ACTION_COLOR.raise,
  call: ACTION_COLOR.call,
  fold: ACTION_COLOR.fold,
  allin: ACTION_COLOR.allin,
};

const ACTION_BTN_CLASS: Record<ActionType, string> = {
  fold: "border-white/30 bg-white/10 text-white hover:brightness-110",
  call: "border-white/30 bg-white/10 text-white hover:brightness-110",
  check: "border-purple-400/28 bg-purple-500/8 text-purple-200/80 hover:border-purple-400/50",
  limp: "border-yellow-400/40 bg-yellow-500/12 text-yellow-100 hover:border-yellow-400/65",
  raise: "border-white/30 bg-white/10 text-white hover:brightness-110",
  allin: "border-white/30 bg-white/10 text-white hover:brightness-110",
};

// ─────────────────────────────────────────────────────────────────────────────
// INITIAL STATE
// ─────────────────────────────────────────────────────────────────────────────

function buildInitialState(format: FlowFormat, stackBb: number): FlowState {
  const positions = [...FORMAT_POSITIONS[format]];
  const playerStatus: Record<string, PlayerStatus> = {};
  const playerContrib: Record<string, number> = {};
  const hasActed: Record<string, boolean> = {};

  for (const pos of positions) {
    playerStatus[pos] = "waiting";
    playerContrib[pos] = 0;
    hasActed[pos] = false;
  }

  // Post blinds (SB = 0.5bb, BB = 1bb)
  const sbPos = format === "hu" ? "SB" : "SB";
  const bbPos = "BB";
  if (positions.includes(sbPos)) playerContrib[sbPos] = 0.5;
  if (positions.includes(bbPos)) playerContrib[bbPos] = 1;

  // First to act preflop = first in positionOrder (UTG for 6max, SB for HU)
  const firstActor = positions[0];
  playerStatus[firstActor] = "active";

  return {
    format,
    stackBb,
    positions,
    playerStatus,
    playerContrib,
    hasActed,
    history: [],
    activePlayer: firstActor,
    potBb: format === "hu" ? 1.5 : 1.5,
    currentBetBb: 1, // BB is the current bet
    isComplete: false,
    resultNote: "",
  };
}

// ─────────────────────────────────────────────────────────────────────────────
// GAME LOGIC HELPERS
// ─────────────────────────────────────────────────────────────────────────────

/** Returns the next player who still needs to act, or null if betting is closed. */
function findNextPlayer(
  positions: string[],
  playerStatus: Record<string, PlayerStatus>,
  playerContrib: Record<string, number>,
  hasActed: Record<string, boolean>,
  currentBetBb: number,
  afterPosition: string,
): string | null {
  const startIdx = positions.indexOf(afterPosition);

  for (let i = 1; i <= positions.length; i++) {
    const idx = (startIdx + i) % positions.length;
    const pos = positions[idx];
    const status = playerStatus[pos];

    if (status === "folded" || status === "allin") continue;

    // Player needs to act if:
    //   1. They haven't made an intentional action yet this round, OR
    //   2. Their contribution is below the current bet
    const behindOnBet = (playerContrib[pos] ?? 0) < currentBetBb;
    const notActedYet = !hasActed[pos];

    if (notActedYet || behindOnBet) return pos;
  }

  return null; // all players equalized and acted
}

/** Count players still eligible to act (not folded). */
function activePlayers(
  positions: string[],
  playerStatus: Record<string, PlayerStatus>,
): string[] {
  return positions.filter(
    (p) => playerStatus[p] !== "folded",
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// ACTION REDUCER
// ─────────────────────────────────────────────────────────────────────────────

function flowReducer(state: FlowState, action: ReducerAction): FlowState {
  if (action.type === "RESTORE_STATE") {
    return action.state;
  }

  if (action.type === "RESET") {
    return buildInitialState(action.format, action.stackBb);
  }

  if (action.type === "SKIP_TO_POSITION") {
    if (!state.activePlayer || state.isComplete) return state;
    if (action.position === state.activePlayer) return state;

    const targetStatus = state.playerStatus[action.position];
    if (!targetStatus || targetStatus === "folded" || targetStatus === "allin") return state;

    const startIdx = state.positions.indexOf(state.activePlayer);
    const targetIdx = state.positions.indexOf(action.position);
    if (startIdx === -1 || targetIdx === -1 || targetIdx < startIdx) return state;

    let nextState: FlowState = state;
    let safety = state.positions.length + 1;

    while (nextState.activePlayer && nextState.activePlayer !== action.position && safety > 0) {
      nextState = flowReducer(nextState, {
        type: "ACT",
        option: {
          id: `auto-fold-${nextState.activePlayer}`,
          label: "Fold",
          type: "fold",
        },
      });
      if (nextState.isComplete) break;
      safety -= 1;
    }

    return nextState;
  }

  if (action.type !== "ACT") return state;
  if (!state.activePlayer || state.isComplete) return state;

  const { option } = action;
  const position = state.activePlayer;

  const newStatus = { ...state.playerStatus };
  const newContrib = { ...state.playerContrib };
  const newHasActed = { ...state.hasActed };
  let newPot = state.potBb;
  let newCurrentBet = state.currentBetBb;

  newHasActed[position] = true;

  switch (option.type) {
    case "fold":
      newStatus[position] = "folded";
      break;

    case "check":
      // No chips change
      break;

    case "limp":
    case "call": {
      const toAdd = newCurrentBet - (newContrib[position] ?? 0);
      newContrib[position] = newCurrentBet;
      newPot += toAdd;
      break;
    }

    case "raise": {
      const raiseTo = option.sizeBb ?? newCurrentBet * 2;
      const toAdd = raiseTo - (newContrib[position] ?? 0);
      newContrib[position] = raiseTo;
      newPot += toAdd;
      newCurrentBet = raiseTo;
      // Reset hasActed for other players who are still in (they need to re-decide)
      for (const pos of state.positions) {
        if (pos !== position && newStatus[pos] !== "folded" && newStatus[pos] !== "allin") {
          newHasActed[pos] = false;
        }
      }
      break;
    }

    case "allin": {
      const allinAmount = state.stackBb;
      const toAdd = allinAmount - (newContrib[position] ?? 0);
      newContrib[position] = allinAmount;
      newPot += toAdd;
      newStatus[position] = "allin";
      if (allinAmount > newCurrentBet) {
        newCurrentBet = allinAmount;
        for (const pos of state.positions) {
          if (pos !== position && newStatus[pos] !== "folded" && newStatus[pos] !== "allin") {
            newHasActed[pos] = false;
          }
        }
      }
      break;
    }
  }

  const newHistory: HistoryEntry[] = [
    ...state.history,
    { position, type: option.type, label: option.label, sizeBb: option.sizeBb },
  ];

  const updatedState: FlowState = {
    ...state,
    playerStatus: newStatus,
    playerContrib: newContrib,
    hasActed: newHasActed,
    history: newHistory,
    potBb: newPot,
    currentBetBb: newCurrentBet,
    activePlayer: null,
  };

  // Hand over: only one player left
  const remaining = activePlayers(state.positions, newStatus);
  if (remaining.length === 1) {
    return {
      ...updatedState,
      isComplete: true,
      resultNote: `${remaining[0]} wins — ${position} foldou.`,
    };
  }

  // Find next player
  const next = findNextPlayer(
    state.positions,
    newStatus,
    newContrib,
    newHasActed,
    newCurrentBet,
    position,
  );

  if (!next) {
    return {
      ...updatedState,
      isComplete: true,
      resultNote: "Street completa. Próxima rua ainda não disponível no banco.",
    };
  }

  newStatus[next] = "active";
  return { ...updatedState, activePlayer: next, playerStatus: newStatus };
}

// ─────────────────────────────────────────────────────────────────────────────
// AVAILABLE ACTIONS BUILDER
// ─────────────────────────────────────────────────────────────────────────────

function getActionsForPos(state: FlowState, position: string): FlowActionOption[] {
  if (state.isComplete) return [];
  const status = state.playerStatus[position];
  if (status === "folded" || status === "allin") return [];

  const { playerContrib, currentBetBb, stackBb, history, hasActed } = state;
  const contrib = playerContrib[position] ?? 0;
  const toCall = currentBetBb - contrib;
  const isFirstVoluntaryAction = !hasActed[position];

  // "SB opening" = SB has not acted, no prior voluntary raise, facing just the BB
  const priorRaise = history.find((h) => h.type === "raise" || h.type === "allin");
  const isOpeningSituation = isFirstVoluntaryAction && !priorRaise;
  const isSbOpen =
    state.format === "hu" &&
    position === "SB" &&
    isOpeningSituation;

  const actions: FlowActionOption[] = [];

  // Fold
  if (toCall > 0) {
    actions.push({ id: "fold", label: "Fold", type: "fold" });
  }

  // Check (free)
  if (toCall <= 0) {
    actions.push({ id: "check", label: "Check", type: "check" });
  }

  // Limp (SB RFI, just calling the BB)
  if (isSbOpen && toCall > 0) {
    actions.push({ id: "limp", label: `Limp  (${toCall.toFixed(1)}bb)`, type: "limp", sizeBb: currentBetBb });
  } else if (!isSbOpen && toCall > 0) {
    actions.push({ id: "call", label: `Call  ${toCall.toFixed(1)}bb`, type: "call", sizeBb: currentBetBb });
  }

  // Single Raise (no multiple sizes — keep UI minimal: Fold / Limp / Raise / All-in)
  const defaultRaiseSize = isSbOpen ? 2.5 : Math.max(currentBetBb * 2.5, 2.5);
  if (defaultRaiseSize < stackBb * 0.88 && defaultRaiseSize - contrib > 0) {
    const label = isSbOpen ? `Raise  ${defaultRaiseSize}x` : `Raise  ${defaultRaiseSize.toFixed(1)}bb`;
    actions.push({ id: "raise", label, type: "raise", sizeBb: defaultRaiseSize });
  }

  // All-in
  actions.push({ id: "allin", label: `All-in  ${stackBb}bb`, type: "allin", sizeBb: stackBb });

  return actions;
}

// ─────────────────────────────────────────────────────────────────────────────
// SCENARIO MATCHING
// ─────────────────────────────────────────────────────────────────────────────

type ScenarioBrief = {
  slug: string;
  heroPosition: string;
  villainPosition: string | null;
  effectiveStackBb?: number | null;
  gameType?: string | null;
};

function isHuScenario(s: ScenarioBrief): boolean {
  // HU = Heads-up. Heuristic: slug contains "hu" token OR gameType says heads-up
  if (s.gameType && /head|hu/i.test(s.gameType)) return true;
  return /(^|-)hu(-|$)/i.test(s.slug);
}

function isRfiScenario(s: ScenarioBrief): boolean {
  // RFI scenario = hero opens with no villain action yet
  if (!s.villainPosition) return true;
  if (/rfi|open/i.test(s.slug) && !/vs/i.test(s.slug)) return true;
  return false;
}

function inferScenarioSlug(
  history: HistoryEntry[],
  activePlayer: string,
  scenarios: ScenarioBrief[],
  format: FlowFormat,
  stackBb: number,
): string | null {
  // Filter by format AND by exact stack — the user explicitly picks a stack,
  // so we never silently fall back to a different one.
  const formatFiltered = scenarios.filter((s) => {
    const formatOk = format === "hu" ? isHuScenario(s) : !isHuScenario(s);
    const stackOk = (s.effectiveStackBb ?? 100) === stackBb;
    return formatOk && stackOk;
  });

  // Find the last aggressive action before the current player
  const lastAggressive = [...history]
    .reverse()
    .find((h) => h.type === "raise" || h.type === "allin" || h.type === "limp");

  const heroUp = activePlayer.toUpperCase();

  if (!lastAggressive) {
    // No prior aggression → RFI scenario (hero opens first)
    const rfiCandidates = formatFiltered.filter(
      (s) => s.heroPosition.toUpperCase() === heroUp && isRfiScenario(s),
    );
    return rfiCandidates[0]?.slug ?? null;
  }

  // Prior aggression by another player → find hero vs villain scenario
  const villainUp = lastAggressive.position.toUpperCase();
  const vsCandidates = formatFiltered.filter(
    (s) =>
      s.heroPosition.toUpperCase() === heroUp &&
      (s.villainPosition ?? "").toUpperCase() === villainUp,
  );
  return vsCandidates[0]?.slug ?? null;
}

// ─────────────────────────────────────────────────────────────────────────────
// MATRIX HELPERS
// ─────────────────────────────────────────────────────────────────────────────

function buildHandCode(rowRank: string, colRank: string, ri: number, ci: number): string {
  if (ri === ci) return `${rowRank}${colRank}`;
  if (ri < ci) return `${rowRank}${colRank}S`;
  return `${colRank}${rowRank}O`;
}

function formatHandLabel(code: string): string {
  const c = code.toUpperCase().trim();
  if (c.length < 2) return c;
  const base = `${c[0]}${c[1]}`;
  if (c.length < 3) return base;
  return `${base}${c[2] === "S" ? "s" : c[2] === "O" ? "o" : c[2].toLowerCase()}`;
}

function mixedGradient(
  r: number,
  call: number,
  f: number,
  allin: number,
  colors: Record<MatrixActionColorKey, string>,
  orientation: MatrixBarOrientation,
  position: MatrixBarPosition,
): string {
  const segs = [
    { key: "raise", color: colors.raise, v: r },
    { key: "call", color: colors.call, v: call },
    { key: "fold", color: colors.fold, v: f },
    { key: "allin", color: colors.allin, v: allin },
  ].filter((s) => s.v > 0.5);

  const gradientAngle = orientation === "horizontal" ? "180deg" : orientation === "vertical" ? "90deg" : "135deg";

  if (!segs.length) return `linear-gradient(${gradientAngle}, rgba(15,23,42,0.9), rgba(30,41,59,0.92))`;
  if (segs.length === 1) return segs[0].color;

  const orderedSegs = position === "reverse" ? [...segs].reverse() : segs;

  let pos = 0;
  const stops = orderedSegs.map((s) => {
    const start = pos;
    pos += s.v;
    return `${s.color} ${start.toFixed(1)}% ${pos.toFixed(1)}%`;
  });
  return `linear-gradient(${gradientAngle}, ${stops.join(", ")})`;
}

// ─────────────────────────────────────────────────────────────────────────────
// COMPONENT
// ─────────────────────────────────────────────────────────────────────────────

const FilterGroup: React.FC<{ title: string; inline?: boolean; extra?: React.ReactNode; children: React.ReactNode }> = ({ title, inline, extra, children }) => (
  <div className={inline ? "flex flex-col gap-1" : "flex flex-col gap-1.5"}>
    <div className="flex items-center justify-between text-[10px] font-semibold uppercase tracking-wider text-white/45">
      <span className="flex items-center gap-1">{title} <span className="text-white/25">?</span></span>
      {extra}
    </div>
    <div className={inline ? "flex flex-wrap items-center gap-1" : "flex flex-wrap gap-1"}>{children}</div>
  </div>
);

export const GtoActionFlow: React.FC<{
  stackBb?: number;
  format?: FlowFormat;
}> = ({ stackBb: initStack = 200, format: initFormat = "hu" }) => {
  const [flow, dispatch] = useReducer(
    flowReducer,
    { stackBb: initStack, format: initFormat },
    ({ stackBb, format }) => buildInitialState(format, stackBb),
  );
  const [undoStack, setUndoStack] = useState<FlowState[]>([]);

  const [spotEditorOpen, setSpotEditorOpen] = useState(false);
  const [rightTab, setRightTab] = useState<"overview" | "table" | "equity">("table");
  const [selectedHand, setSelectedHand] = useState<string | null>(null);
  const [matrixBarOrientation, setMatrixBarOrientation] = useState<MatrixBarOrientation>("diagonal");
  const [matrixBarPosition, setMatrixBarPosition] = useState<MatrixBarPosition>("normal");
  const [matrixActionColors, setMatrixActionColors] = useState<Record<MatrixActionColorKey, string>>(MATRIX_DEFAULT_ACTION_COLORS);
  const [isMatrixStyleMenuOpen, setIsMatrixStyleMenuOpen] = useState(false);
  const [matrixSize, setMatrixSize] = useState(0);
  const matrixStyleMenuRef = useRef<HTMLDivElement>(null);
  const matrixViewportRef = useRef<HTMLDivElement>(null);
  const matrixPrefsHydratedRef = useRef(false);
  const [solutionFilters, setSolutionFilters] = useState<string[]>(["Mtt"]);
  const [formatFilters, setFormatFilters] = useState<string[]>(["ChipEV"]);
  const [tournamentTypeFilters, setTournamentTypeFilters] = useState<string[]>(["Classic"]);
  const [tournamentPlayersFilters, setTournamentPlayersFilters] = useState<string[]>(["200 players"]);
  const [tournamentPhaseFilters, setTournamentPhaseFilters] = useState<string[]>(["75% left"]);
  const [playersFilters, setPlayersFilters] = useState<string[]>(["8"]);
  const [postflopFilters, setPostflopFilters] = useState<string[]>(["Single Size"]);
  const [stackTypeFilters, setStackTypeFilters] = useState<string[]>(["Qualquer"]);

  // ── Data fetching ──────────────────────────────────────────────────────────

  const { data: scenarioList = [] } = trpc.gto.listScenarios.useQuery();

  const matchedSlug = useMemo(
    () =>
      flow.activePlayer
        ? inferScenarioSlug(
            flow.history,
            flow.activePlayer,
            scenarioList,
            flow.format,
            flow.stackBb,
          )
        : null,
    [flow.history, flow.activePlayer, flow.format, flow.stackBb, scenarioList],
  );

  const { data: scenarioData, isLoading: loadingMatrix } = trpc.gto.getScenario.useQuery(
    { slug: matchedSlug ?? "" },
    { enabled: Boolean(matchedSlug) },
  );

  const { data: matrixPrefs } = trpc.gto.getMatrixPreferences.useQuery();
  const saveMatrixPrefsMutation = trpc.gto.updateMatrixPreferences.useMutation();

  // ── Matrix cells ───────────────────────────────────────────────────────────

  const handMap = useMemo(() => {
    const m = new Map<string, { raisePctX10: number; limpCheckPctX10: number; foldPctX10: number }>();
    for (const h of scenarioData?.handList ?? []) {
      m.set(h.code.toUpperCase().trim(), h);
    }
    return m;
  }, [scenarioData?.handList]);

  const matrixCells = useMemo(
    () =>
      RANKS.map((rowRank, ri) =>
        RANKS.map((colRank, ci) => {
          const code = buildHandCode(rowRank, colRank, ri, ci);
          const hand = handMap.get(code);
          return {
            code,
            label: formatHandLabel(code),
            r: hand ? hand.raisePctX10 / 10 : 0,
            c: hand ? hand.limpCheckPctX10 / 10 : 0,
            f: hand ? hand.foldPctX10 / 10 : 0,
            hasData: !!hand,
          };
        }),
      ),
    [handMap],
  );

  const dispatchWithHistory = useCallback((action: ReducerAction) => {
    if (action.type === "ACT" || action.type === "SKIP_TO_POSITION") {
      setUndoStack((prev) => [...prev, flow]);
    }
    dispatch(action);
  }, [flow]);

  const restoreToPosition = useCallback((position: string) => {
    setUndoStack((prev) => {
      let targetIndex = -1;
      for (let i = prev.length - 1; i >= 0; i -= 1) {
        if (prev[i].activePlayer === position) {
          targetIndex = i;
          break;
        }
      }
      if (targetIndex === -1) return prev;

      dispatch({ type: "RESTORE_STATE", state: prev[targetIndex] });
      return prev.slice(0, targetIndex);
    });
  }, []);

  // ── Actions ────────────────────────────────────────────────────────────────

  const handleAction = useCallback(
    (opt: FlowActionOption) => dispatchWithHistory({ type: "ACT", option: opt }),
    [dispatchWithHistory],
  );

  const handleReset = useCallback(
    () => {
      setUndoStack([]);
      dispatch({ type: "RESET", format: flow.format, stackBb: flow.stackBb });
    },
    [flow.format, flow.stackBb],
  );

  const toggleSelection = useCallback((setState: React.Dispatch<React.SetStateAction<string[]>>, value: string) => {
    setState((prev) => prev.includes(value)
      ? prev.filter((item) => item !== value)
      : [...prev, value]);
  }, []);

  const toggleFormat = useCallback(
    (targetFormat: FlowFormat) => {
      const nextFormat: FlowFormat = flow.format === targetFormat
        ? (targetFormat === "hu" ? "6max" : "hu")
        : targetFormat;
      setUndoStack([]);
      dispatch({ type: "RESET", format: nextFormat, stackBb: flow.stackBb });
    },
    [flow.format, flow.stackBb],
  );

  // ── Derived ────────────────────────────────────────────────────────────────

  const activePlayer = flow.activePlayer;
  const noSpot = matchedSlug === null && Boolean(activePlayer);
  const spotLabel = matchedSlug
    ? matchedSlug.replace(/-/g, " ").replace(/gto wizard ai/i, "Solver")
    : null;

  useEffect(() => {
    try {
      const raw = window.localStorage.getItem(MATRIX_PREFS_LOCAL_STORAGE_KEY);
      if (!raw) return;

      const parsed = JSON.parse(raw) as LocalMatrixPreferencesPayload;
      if (!parsed || typeof parsed !== "object") return;

      setMatrixBarOrientation(parsed.barOrientation);
      setMatrixBarPosition(parsed.barPosition);
      setMatrixActionColors({
        raise: parsed.raiseColor,
        call: parsed.callColor,
        fold: parsed.foldColor,
        allin: parsed.allinColor,
      });
      matrixPrefsHydratedRef.current = true;
    } catch {
      // Ignore corrupted local payload and continue with server defaults.
    }
  }, []);

  useEffect(() => {
    if (!matrixPrefs || matrixPrefsHydratedRef.current) return;

    setMatrixBarOrientation(matrixPrefs.barOrientation);
    setMatrixBarPosition(matrixPrefs.barPosition);
    setMatrixActionColors({
      raise: matrixPrefs.raiseColor,
      call: matrixPrefs.callColor,
      fold: matrixPrefs.foldColor,
      allin: matrixPrefs.allinColor,
    });
    matrixPrefsHydratedRef.current = true;
  }, [matrixPrefs]);

  useEffect(() => {
    if (!matrixPrefsHydratedRef.current) return;

    const localPayload: LocalMatrixPreferencesPayload = {
      barOrientation: matrixBarOrientation,
      barPosition: matrixBarPosition,
      raiseColor: matrixActionColors.raise,
      callColor: matrixActionColors.call,
      foldColor: matrixActionColors.fold,
      allinColor: matrixActionColors.allin,
      savedAt: Date.now(),
    };

    try {
      window.localStorage.setItem(MATRIX_PREFS_LOCAL_STORAGE_KEY, JSON.stringify(localPayload));
    } catch {
      // Local storage can fail in private mode/quota; keep DB sync path.
    }

    const timer = window.setTimeout(() => {
      const payload: MatrixPreferencesPayload = {
        barOrientation: matrixBarOrientation,
        barPosition: matrixBarPosition,
        raiseColor: matrixActionColors.raise,
        callColor: matrixActionColors.call,
        foldColor: matrixActionColors.fold,
        allinColor: matrixActionColors.allin,
      };

      saveMatrixPrefsMutation.mutate(payload);
    }, 350);

    return () => {
      window.clearTimeout(timer);
    };
  }, [matrixBarOrientation, matrixBarPosition, matrixActionColors, saveMatrixPrefsMutation]);

  useEffect(() => {
    if (!isMatrixStyleMenuOpen) return;

    const handleOutsideClick = (event: MouseEvent) => {
      const root = matrixStyleMenuRef.current;
      if (!root) return;
      if (root.contains(event.target as Node)) return;
      setIsMatrixStyleMenuOpen(false);
    };

    document.addEventListener("mousedown", handleOutsideClick);
    return () => {
      document.removeEventListener("mousedown", handleOutsideClick);
    };
  }, [isMatrixStyleMenuOpen]);

  useEffect(() => {
    const node = matrixViewportRef.current;
    if (!node) return;

    let frame = 0;

    const updateSize = () => {
      cancelAnimationFrame(frame);
      frame = requestAnimationFrame(() => {
        const availableHeight = Math.max(0, node.clientHeight - 4);
        const availableWidth = Math.max(0, node.clientWidth - MATRIX_LEGEND_WIDTH - MATRIX_LEGEND_GAP - 4);
        const nextSize = Math.max(0, Math.floor(Math.min(availableHeight, availableWidth / MATRIX_WIDTH_RATIO)));
        setMatrixSize((prev) => (prev === nextSize ? prev : nextSize));
      });
    };

    updateSize();
    const observer = new ResizeObserver(updateSize);
    observer.observe(node);

    return () => {
      cancelAnimationFrame(frame);
      observer.disconnect();
    };
  }, []);

  // ──────────────────────────────────────────────────────────────────────────
  // RENDER
  // ──────────────────────────────────────────────────────────────────────────

  return (
    <div className="flex h-full min-h-0 w-full gap-3 text-white">

      {/* ── LEFT: positions strip + matrix ── */}
      <div className="flex min-h-0 flex-1 flex-col gap-2">

        {/* Positions strip — solver-style layout */}
        <div className="rounded-xl border border-white/8 bg-[#0b1020] p-2">
          <div className="flex flex-wrap items-stretch gap-1.5">

            {/* ── Spot info card (leftmost) ── */}
            <div className="flex min-w-[150px] flex-col rounded-lg border border-white/10 bg-[#111927] px-2 py-1.5">
              <div className="mb-1 flex items-center justify-between">
                <span className="text-[12px] font-bold text-white/90">
                  {flow.format === "hu" ? "HU" : "MTT 8-max"} <span className="text-white/55">{flow.stackBb}bb</span>
                </span>
                <div className="flex gap-0.5 text-white/35">
                  <button
                    type="button"
                    onClick={handleReset}
                    title="Nova mão"
                    className="rounded p-0.5 transition hover:bg-white/8 hover:text-white"
                  >
                    ↺
                  </button>
                </div>
              </div>
              <ul className="mb-1.5 space-y-0.5 text-[10px] leading-tight text-white/55">
                <li>• {flow.format === "hu" ? "Heads-up" : "MTT 8-max NL"}</li>
                <li className="text-white/35">• Solver AI</li>
                {spotLabel && (
                  <li className="truncate text-cyan-200/65" title={spotLabel}>
                    • {spotLabel}
                  </li>
                )}
                {noSpot && (
                  <li className="text-amber-200/70">• Spot não cadastrado</li>
                )}
              </ul>
              <button
                type="button"
                onClick={() => setSpotEditorOpen((v) => !v)}
                className={`mt-auto rounded-md border px-2 py-1 text-[11px] font-semibold transition ${spotEditorOpen
                  ? "border-cyan-300/60 bg-cyan-500/15 text-cyan-100"
                  : "border-cyan-400/40 bg-cyan-500/8 text-cyan-100/85 hover:border-cyan-300/70 hover:bg-cyan-500/15 hover:text-cyan-50"}`}
              >
                {spotEditorOpen ? "✕ Fechar biblioteca" : "📚 Biblioteca · Formato / Stack"}
              </button>
            </div>

            {/* ── Position cards ── */}
            {flow.positions.map((pos) => {
              const status = flow.playerStatus[pos];
              const contrib = flow.playerContrib[pos] ?? 0;
              const remaining = flow.stackBb - contrib;
              const isActive = pos === activePlayer;
              const isFolded = status === "folded";
              const isAllin = status === "allin";
              const activeIdx = activePlayer ? flow.positions.indexOf(activePlayer) : -1;
              const posIdx = flow.positions.indexOf(pos);
              const canSkipToThisPosition = !flow.isComplete && !isActive && !isFolded && !isAllin && activeIdx >= 0 && posIdx > activeIdx;
              const canRestoreToThisPosition = !flow.isComplete && !isActive && activeIdx >= 0 && posIdx < activeIdx && undoStack.some((snapshot) => snapshot.activePlayer === pos);
              const canNavigateByClick = canSkipToThisPosition || canRestoreToThisPosition;
              let posActions = getActionsForPos(flow, pos);

              // Override raise size with GTO solver sizing when available for the active player.
              if (isActive && scenarioData) {
                const sc: any = scenarioData.scenario;
                const openSizeBb = sc.openSizeBbX10 ? sc.openSizeBbX10 / 10 : 0;
                const threeBetSizeBb = sc.threeBetSizeBbX10 ? sc.threeBetSizeBbX10 / 10 : 0;
                const priorRaise = flow.history.find((h) => h.type === "raise" || h.type === "allin");
                const gtoSize = priorRaise ? threeBetSizeBb : openSizeBb;
                if (gtoSize > 0) {
                  const fmt = (n: number) => (n % 1 === 0 ? n.toFixed(0) : n.toFixed(1));
                  const label = priorRaise ? `3-Bet  ${fmt(gtoSize)}bb` : `Raise  ${fmt(gtoSize)}bb`;
                  posActions = posActions.map((a) =>
                    a.type === "raise" ? { ...a, sizeBb: gtoSize, label } : a,
                  );
                }
              }

              return (
                <div
                  key={pos}
                  className={`flex min-w-[108px] flex-1 flex-col rounded-lg border px-2 py-1.5 transition ${isActive
                    ? "border-cyan-300/65 bg-cyan-500/10 shadow-[0_0_12px_rgba(34,211,238,0.12)]"
                    : isFolded
                      ? "border-white/6 bg-white/[0.02] opacity-35"
                      : isAllin
                        ? "border-red-400/45 bg-red-500/8"
                        : "border-white/10 bg-[#111927]"} ${canNavigateByClick ? "cursor-pointer hover:border-amber-300/55" : ""}`}
                  role={canNavigateByClick ? "button" : undefined}
                  tabIndex={canNavigateByClick ? 0 : undefined}
                  onClick={canNavigateByClick
                    ? () => {
                        if (canSkipToThisPosition) {
                          dispatchWithHistory({ type: "SKIP_TO_POSITION", position: pos });
                          return;
                        }
                        if (canRestoreToThisPosition) {
                          restoreToPosition(pos);
                        }
                      }
                    : undefined}
                  onKeyDown={canNavigateByClick
                    ? (event) => {
                        if (event.key === "Enter" || event.key === " ") {
                          event.preventDefault();
                          if (canSkipToThisPosition) {
                            dispatchWithHistory({ type: "SKIP_TO_POSITION", position: pos });
                            return;
                          }
                          if (canRestoreToThisPosition) {
                            restoreToPosition(pos);
                          }
                        }
                      }
                    : undefined}
                >
                  {/* Header: position + remaining stack */}
                  <div className="mb-1 flex items-baseline justify-between">
                    <span
                      className={`text-[12px] font-bold ${isActive ? "text-cyan-100" : isFolded ? "text-white/40" : "text-white/85"}`}
                    >
                      {pos}
                    </span>
                    <span
                      className={`text-[10px] tabular-nums ${isActive ? "text-cyan-200/80" : "text-white/45"}`}
                    >
                      {remaining.toFixed(remaining < 10 ? 1 : 0)}
                    </span>
                  </div>

                  {/* Body: state or actions */}
                  {isFolded ? (
                    <div className="text-center text-[10px] font-semibold tracking-wider" style={{ color: matrixActionColors.fold }}>
                      FOLD
                    </div>
                  ) : isAllin ? (
                    <div className="text-center text-[10px] font-semibold tracking-wider" style={{ color: matrixActionColors.allin }}>
                      ALL-IN
                    </div>
                  ) : posActions.length === 0 ? (
                    <div className="text-center text-[10px] text-white/30">—</div>
                  ) : (
                    <div className="flex flex-col gap-1">
                      {posActions.map((opt) => {
                        const shortLabel = opt.type === "fold"
                          ? "Fold"
                          : opt.type === "check"
                            ? "Check"
                            : opt.type === "allin"
                              ? `Allin ${opt.sizeBb}`
                              : opt.label.replace(/\s+/g, " ").trim();
                        const disabled = !isActive;
                        const themedColor = opt.type === "raise"
                          ? matrixActionColors.raise
                          : opt.type === "call" || opt.type === "check"
                            ? matrixActionColors.call
                            : opt.type === "fold"
                              ? matrixActionColors.fold
                              : opt.type === "allin"
                                ? matrixActionColors.allin
                                : ACTION_COLOR.limp;

                        return (
                          <button
                            key={opt.id}
                            type="button"
                            disabled={disabled}
                            onClick={() => isActive && handleAction(opt)}
                            className={`rounded-md border px-1.5 py-0.5 text-[10px] font-semibold transition ${isActive
                              ? ACTION_BTN_CLASS[opt.type]
                              : "cursor-default border-white/6 bg-white/[0.02] text-white/35"}`}
                            style={isActive
                              ? {
                                  borderColor: `${themedColor}b3`,
                                  backgroundColor: `${themedColor}24`,
                                  color: "#e2e8f0",
                                }
                              : undefined}
                          >
                            {shortLabel}
                          </button>
                        );
                      })}
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        </div>

        {flow.isComplete && (
          <div className="flex items-center gap-3 rounded-xl border border-emerald-300/25 bg-emerald-500/8 px-3 py-2 text-[12px]">
            <span className="text-emerald-100/90">{flow.resultNote}</span>
            <button
              type="button"
              onClick={handleReset}
              className="ml-auto rounded-md border border-white/14 bg-white/[0.04] px-3 py-1 text-[11px] text-white/65 transition hover:text-white"
            >
              Recomeçar
            </button>
          </div>
        )}

        {/* Hand matrix */}
        <div className="min-h-0 flex-1 rounded-xl border border-white/8 bg-[#0b1222] p-2.5">
          {matchedSlug && scenarioData ? (
            <>
              <div className="mb-1.5 flex items-start justify-between gap-2 text-[10px] text-white/42">
                <div className="flex min-w-0 flex-wrap items-center gap-2">
                  <span className="font-semibold text-white/65">Range do {activePlayer}</span>
                  <span className="text-white/24">—</span>
                  <span className="truncate">{scenarioData.scenario.title.replace(/wizard/gi, "Solver")}</span>
                  {(() => {
                  const sc: any = scenarioData.scenario;
                  const open = sc.openSizeBbX10 ? sc.openSizeBbX10 / 10 : 0;
                  const tb = sc.threeBetSizeBbX10 ? sc.threeBetSizeBbX10 / 10 : 0;
                  if (!open && !tb) return null;
                  const fmt = (n: number) => (n % 1 === 0 ? n.toFixed(0) : n.toFixed(1));
                  // Highlight the size that matters in the current state: 3-bet if facing an open.
                  const facingRaise = flow.history.some((h) => h.type === "raise" || h.type === "allin");
                  const highlight3bet = facingRaise && tb > 0;
                  const highlightOpen = !facingRaise && open > 0;
                    return (
                      <span className="ml-1 inline-flex items-center gap-1.5">
                      {open > 0 && (
                        <span
                          className={
                            highlightOpen
                              ? "inline-flex items-center gap-1 rounded-md border border-green-400/60 bg-green-500/15 px-2 py-[2px] text-[10px] font-bold uppercase tracking-wider text-green-200 shadow-[0_0_8px_rgba(34,197,94,0.25)]"
                              : "inline-flex items-center gap-1 rounded-md border border-white/12 bg-white/[0.04] px-1.5 py-[1px] text-[9px] font-semibold uppercase tracking-wider text-white/55"
                          }
                        >
                          Open <span className={highlightOpen ? "text-white" : "text-white/80"}>{fmt(open)}bb</span>
                        </span>
                      )}
                      {tb > 0 && (
                        <span
                          className={
                            highlight3bet
                              ? "inline-flex items-center gap-1 rounded-md border border-amber-400/70 bg-amber-500/15 px-2 py-[2px] text-[10px] font-bold uppercase tracking-wider text-amber-200 shadow-[0_0_10px_rgba(251,191,36,0.3)]"
                              : "inline-flex items-center gap-1 rounded-md border border-white/12 bg-white/[0.04] px-1.5 py-[1px] text-[9px] font-semibold uppercase tracking-wider text-white/55"
                          }
                        >
                          3-Bet <span className={highlight3bet ? "text-white" : "text-white/80"}>{fmt(tb)}bb</span>
                        </span>
                      )}
                      </span>
                    );
                  })()}
                </div>

                <div ref={matrixStyleMenuRef} className="relative shrink-0">
                  <button
                    type="button"
                    onClick={() => setIsMatrixStyleMenuOpen((open) => !open)}
                    className="rounded-md border border-white/15 bg-[#121729]/95 px-2 py-1 text-[11px] font-semibold text-white/80 transition hover:border-cyan-300/45 hover:text-cyan-100"
                    title="Configurar visual da matriz"
                    aria-label="Configurar visual da matriz"
                    aria-expanded={isMatrixStyleMenuOpen}
                  >
                    Configuracao da matriz
                  </button>

                  {isMatrixStyleMenuOpen ? (
                    <div className="absolute right-0 top-[calc(100%+6px)] z-20 w-[260px] rounded-xl border border-white/15 bg-[#0f172b]/95 p-3 shadow-[0_18px_30px_rgba(0,0,0,0.42)] backdrop-blur">
                      <div className="text-[10px] font-semibold uppercase tracking-[0.2em] text-white/45">Visual da matriz</div>

                      <div className="mt-2 space-y-2">
                        <label className="flex items-center justify-between gap-2 text-[11px] text-white/80">
                          <span>Orientacao</span>
                          <select
                            className="rounded-md border border-white/15 bg-[#0b1020] px-2 py-1 text-[11px] text-white outline-none"
                            value={matrixBarOrientation}
                            onChange={(e) => setMatrixBarOrientation(e.target.value as MatrixBarOrientation)}
                          >
                            <option value="diagonal">Inclinada</option>
                            <option value="vertical">Vertical</option>
                            <option value="horizontal">Horizontal</option>
                          </select>
                        </label>

                        <label className="flex items-center justify-between gap-2 text-[11px] text-white/80">
                          <span>Posicao</span>
                          <select
                            className="rounded-md border border-white/15 bg-[#0b1020] px-2 py-1 text-[11px] text-white outline-none"
                            value={matrixBarPosition}
                            onChange={(e) => setMatrixBarPosition(e.target.value as MatrixBarPosition)}
                          >
                            <option value="normal">Padrao</option>
                            <option value="reverse">Invertida</option>
                          </select>
                        </label>

                        <div className="space-y-1.5 pt-1">
                          {([
                            ["raise", "Raise"],
                            ["call", "Call"],
                            ["fold", "Fold"],
                            ["allin", "All-in"],
                          ] as Array<[MatrixActionColorKey, string]>).map(([key, label]) => (
                            <label key={key} className="flex items-center justify-between gap-2 text-[11px] text-white/80">
                              <span>{label}</span>
                              <input
                                type="color"
                                value={matrixActionColors[key]}
                                onChange={(e) => setMatrixActionColors((prev) => ({ ...prev, [key]: e.target.value }))}
                                className="h-7 w-9 cursor-pointer rounded border border-white/20 bg-transparent p-0"
                                aria-label={`Cor de ${label}`}
                              />
                            </label>
                          ))}
                        </div>
                      </div>
                    </div>
                  ) : null}
                </div>
              </div>
              <div ref={matrixViewportRef} className="flex h-[calc(100%-24px)] min-h-0 gap-1.5 overflow-hidden">
                <div
                  className="grid shrink-0"
                  style={{
                    gridTemplateColumns: "repeat(13, 1fr)",
                    gridTemplateRows: "repeat(13, 1fr)",
                    gap: "1px",
                    width: matrixSize > 0 ? `${Math.round(matrixSize * MATRIX_WIDTH_RATIO)}px` : "100%",
                    height: matrixSize > 0 ? `${matrixSize}px` : "100%",
                    minWidth: 0,
                  }}
                >
                  {matrixCells.flat().map((cell) => {
                    const isSelected = selectedHand === cell.code;
                    return (
                      <div
                        key={cell.code}
                        title={`${cell.label}: Raise ${cell.r.toFixed(0)}% Call ${cell.c.toFixed(0)}% Fold ${cell.f.toFixed(0)}%`}
                        onClick={() => {
                          if (!cell.hasData) return;
                          setSelectedHand((prev) => (prev === cell.code ? null : cell.code));
                          setRightTab("overview");
                        }}
                        className={`flex items-center justify-center text-[11px] sm:text-[12px] font-bold text-white drop-shadow-[0_1px_1px_rgba(0,0,0,0.9)] ${cell.hasData ? "cursor-pointer" : ""} ${isSelected ? "ring-2 ring-cyan-300 ring-inset" : "border border-slate-700/35"}`}
                        style={{
                          background: cell.hasData
                            ? mixedGradient(cell.r, cell.c, cell.f, 0, matrixActionColors, matrixBarOrientation, matrixBarPosition)
                            : "#0f172a",
                        }}
                      >
                        {cell.label}
                      </div>
                    );
                  })}
                </div>
                {/* ── Legenda lateral: frequências ponderadas ── */}
                <div className="flex w-[96px] shrink-0 flex-col gap-1">
                  <div className="text-[8px] uppercase tracking-[0.2em] text-white/32">Freq.</div>
                  {([
                    ["Raise", scenarioData.scenario.weightedRaisePctX10 / 10, matrixActionColors.raise],
                    ["Call", scenarioData.scenario.weightedLimpCheckPctX10 / 10, matrixActionColors.call],
                    ["Fold", scenarioData.scenario.weightedFoldPctX10 / 10, matrixActionColors.fold],
                  ] as [string, number, string][]).map(([lbl, pct, color]) => (
                    <div
                      key={lbl}
                      className="flex items-center gap-1.5 rounded-md border border-white/8 bg-[#0f172b] px-1.5 py-1"
                      style={{ borderLeft: `2px solid ${color}` }}
                    >
                      <span className="text-[10px] font-semibold" style={{ color }}>{lbl}</span>
                      <span className="ml-auto text-[11px] font-bold tabular-nums" style={{ color }}>{pct.toFixed(0)}%</span>
                    </div>
                  ))}
                </div>
              </div>
            </>
          ) : loadingMatrix && matchedSlug ? (
            <div className="flex h-full items-center justify-center text-[12px] text-white/38">
              Carregando range...
            </div>
          ) : activePlayer && noSpot ? (
            <div className="flex h-full flex-col items-center justify-center gap-2 text-center">
              <span className="text-[28px] opacity-40">📭</span>
              <span className="text-[12px] text-white/40">Spot ainda não cadastrado no banco.</span>
              <span className="text-[11px] text-white/28">A sequência de ações não tem solução cadastrada ainda.</span>
            </div>
          ) : flow.isComplete ? (
            <div className="flex h-full items-center justify-center text-[12px] text-white/30">
              Mão encerrada
            </div>
          ) : (
            <div className="flex h-full items-center justify-center text-[12px] text-white/30">
              Clique em uma ação para começar
            </div>
          )}
        </div>
      </div>

      {/* ── RIGHT: table state + action history ── */}
      <div className={`flex shrink-0 flex-col gap-2 ${rightTab === "table" ? "w-[440px]" : "w-[320px]"}`}>

        {/* Right tabs: Overview / Table / Equity */}
        <div className="flex items-center gap-0.5 rounded-xl border border-white/8 bg-[#0b1020] px-1.5 py-1 text-[11px]">
          {([
            ["overview", "Overview"],
            ["table", "Table"],
            ["equity", "Equity chart"],
          ] as const).map(([key, label]) => (
            <button
              key={key}
              type="button"
              onClick={() => setRightTab(key)}
              className={`relative flex-1 rounded-md px-1.5 py-1 font-semibold transition ${rightTab === key
                ? "text-cyan-200"
                : "text-white/45 hover:text-white/75"}`}
            >
              {label}
              {rightTab === key && (
                <span className="absolute inset-x-2 -bottom-[3px] h-[2px] rounded-full bg-cyan-400/85" />
              )}
            </button>
          ))}
        </div>

        {/* Pot */}
        <div className="rounded-xl border border-white/8 bg-[#0f172b] px-3 py-2.5">
          <div className="text-[9px] uppercase tracking-[0.25em] text-white/34">Pote</div>
          <div className="mt-0.5 text-[20px] font-semibold leading-tight text-white/92">
            {flow.potBb.toFixed(1)}
            <span className="ml-1 text-[12px] text-white/38">bb</span>
          </div>
        </div>

        {/* Mesa — visual table */}
        {rightTab === "table" && (
        <div className="rounded-xl border border-white/8 bg-[#0f172b] p-2.5">
          <div className="mb-1.5 text-[9px] uppercase tracking-[0.25em] text-white/34">Mesa</div>
          <div className="relative mx-auto aspect-[5/3] w-full max-w-[420px]">
            {/* Felt */}
            <div className="absolute inset-0 rounded-[40%] border border-emerald-700/40 bg-gradient-to-b from-emerald-900/40 to-emerald-950/60 shadow-[inset_0_0_18px_rgba(0,0,0,0.55)]" />
            {/* Pot in center */}
            <div className="pointer-events-none absolute left-1/2 top-1/2 -translate-x-1/2 -translate-y-1/2 text-center">
              <div className="text-[8px] uppercase tracking-wider text-white/40">pote</div>
              <div className="text-[12px] font-bold text-white/85 tabular-nums">{flow.potBb.toFixed(1)}bb</div>
            </div>
            {/* Players around */}
            {flow.positions.map((pos, i) => {
              const n = flow.positions.length;
              const angle = (i / n) * Math.PI * 2 - Math.PI / 2;
              const rx = 46; // % radius x
              const ry = 38; // % radius y
              const x = 50 + rx * Math.cos(angle);
              const y = 50 + ry * Math.sin(angle);
              const status = flow.playerStatus[pos];
              const contrib = flow.playerContrib[pos] ?? 0;
              const remaining = flow.stackBb - contrib;
              const isActive = pos === activePlayer;
              const isFolded = status === "folded";
              const isAllin = status === "allin";
              return (
                <div
                  key={pos}
                  className={`absolute flex -translate-x-1/2 -translate-y-1/2 flex-col items-center rounded-md border px-1.5 py-0.5 text-center transition ${isActive
                    ? "border-cyan-300/70 bg-cyan-500/15 shadow-[0_0_10px_rgba(34,211,238,0.35)]"
                    : isFolded
                      ? "border-white/8 bg-white/[0.04] opacity-40"
                      : isAllin
                        ? "border-red-400/55 bg-red-500/15"
                        : "border-white/15 bg-[#111927]"}`}
                  style={{ left: `${x}%`, top: `${y}%` }}
                >
                  <span className={`text-[9px] font-bold leading-none ${isActive ? "text-cyan-100" : isFolded ? "text-white/40" : "text-white/85"}`}>{pos}</span>
                  <span className={`text-[8px] tabular-nums leading-none ${isActive ? "text-cyan-200/80" : "text-white/45"}`}>{remaining.toFixed(remaining < 10 ? 1 : 0)}bb</span>
                  {contrib > 0 && !isFolded && (
                    <span className="mt-0.5 rounded-full bg-amber-400/85 px-1 text-[7px] font-bold leading-none text-amber-950">{contrib.toFixed(1)}</span>
                  )}
                </div>
              );
            })}
          </div>
        </div>
        )}

        {/* Equity chart placeholder */}
        {rightTab === "equity" && (
          <div className="flex min-h-[140px] flex-col items-center justify-center gap-1.5 rounded-xl border border-white/8 bg-[#0f172b] p-4 text-center">
            <span className="text-[20px] opacity-40">📈</span>
            <span className="text-[12px] text-white/55">Equity chart</span>
            <span className="text-[10px] text-white/30">Em breve.</span>
          </div>
        )}

        {/* Hero info card (position / OOP-IP / combos) */}
        {rightTab === "overview" && activePlayer && scenarioData && (
          <div className="flex items-center justify-between rounded-xl border border-white/8 bg-[#0f172b] px-3 py-2">
            <div className="flex items-center gap-2">
              <div className="flex h-7 w-7 items-center justify-center rounded-full border border-cyan-300/45 bg-cyan-500/10 text-[11px] font-bold text-cyan-100">
                {activePlayer}
              </div>
              <div className="flex flex-col leading-tight">
                <span className="text-[11px] font-semibold text-white/85">
                  {activePlayer}
                  <span className="ml-1 text-[9px] font-normal text-white/45">
                    {flow.format === "hu"
                      ? activePlayer === "BB" ? "IP" : "OOP"
                      : ["BTN", "CO"].includes(activePlayer) ? "IP" : "OOP"}
                  </span>
                </span>
                <span className="text-[9px] text-white/40">
                  {selectedHand ? (
                    <>Mão <span className="font-semibold tabular-nums text-cyan-200">{formatHandLabel(selectedHand)}</span></>
                  ) : (
                    <>Combos <span className="tabular-nums text-white/65">{scenarioData.scenario.totalCombos ?? 1326}</span></>
                  )}
                </span>
              </div>
            </div>
            {scenarioData.scenario.effectiveStackBb && (
              <div className="flex items-center gap-2">
                {selectedHand && (
                  <button
                    type="button"
                    onClick={() => setSelectedHand(null)}
                    className="rounded-md border border-white/12 bg-white/[0.04] px-1.5 py-0.5 text-[9px] font-semibold text-white/55 hover:text-white/85"
                    title="Voltar ao range completo"
                  >
                    ← range
                  </button>
                )}
                <div className="text-right leading-tight">
                  <div className="text-[9px] uppercase tracking-wider text-white/35">stack</div>
                  <div className="text-[11px] font-semibold tabular-nums text-white/80">
                    {scenarioData.scenario.effectiveStackBb}bb
                  </div>
                </div>
              </div>
            )}
          </div>
        )}

        {/* Big action tiles (Actions panel) */}
        {rightTab === "overview" && scenarioData && (() => {
          const sc = scenarioData.scenario;
          const handData = selectedHand ? handMap.get(selectedHand) : null;
          const totalCombos = sc.totalCombos ?? 1326;
          const openSizeBb = (sc as any).openSizeBbX10 ? (sc as any).openSizeBbX10 / 10 : 0;
          const threeBetSizeBb = (sc as any).threeBetSizeBbX10 ? (sc as any).threeBetSizeBbX10 / 10 : 0;
          const raiseSizeBb = threeBetSizeBb > 0 ? threeBetSizeBb : openSizeBb;
          const raiseSizeLabel = raiseSizeBb > 0 ? ` ${raiseSizeBb.toFixed(raiseSizeBb % 1 === 0 ? 0 : 1)}bb` : "";
          const raiseTileLabel = threeBetSizeBb > 0 ? `3-Bet${raiseSizeLabel}` : openSizeBb > 0 ? `Raise${raiseSizeLabel}` : "Todos os aumentos";
          const tiles: Array<{ key: string; label: string; pct: number; color: string; bg: string; border: string }> = [];
          // Per-hand data when a cell is selected, otherwise weighted range averages.
          const raisePct = handData ? handData.raisePctX10 / 10 : sc.weightedRaisePctX10 / 10;
          const callPct = handData ? handData.limpCheckPctX10 / 10 : sc.weightedLimpCheckPctX10 / 10;
          const foldPct = handData ? handData.foldPctX10 / 10 : sc.weightedFoldPctX10 / 10;
          // Per-hand: 1 combo unit so we show frequency only, not weighted combos.
          const combosBase = handData ? 100 : totalCombos;
          if (raisePct >= 0.5) tiles.push({ key: "raise", label: raiseTileLabel, pct: raisePct, color: "text-green-200", bg: "bg-green-500/15", border: "border-green-400/35" });
          if (callPct >= 0.5) tiles.push({ key: "call", label: flow.format === "hu" && activePlayer === "BB" ? "Call/Check" : "Call/Limp", pct: callPct, color: "text-purple-200", bg: "bg-purple-500/15", border: "border-purple-400/35" });
          if (foldPct >= 0.5) tiles.push({ key: "fold", label: "Fold", pct: foldPct, color: "text-blue-200", bg: "bg-blue-500/15", border: "border-blue-400/35" });

          if (!tiles.length) return null;

          return (
            <div className="rounded-xl border border-white/8 bg-[#0f172b] p-2">
              <div className="mb-1.5 flex items-center justify-between text-[9px] uppercase tracking-[0.22em] text-white/38">
                <span>{handData ? `Actions · ${formatHandLabel(selectedHand!)}` : "Actions"}</span>
                <span className="text-white/22">▼</span>
              </div>
              <div className={`grid gap-1.5 ${tiles.length === 2 ? "grid-cols-2" : tiles.length === 3 ? "grid-cols-3" : "grid-cols-1"}`}>
                {tiles.map((t) => {
                  const combos = (combosBase * t.pct) / 100;
                  return (
                    <div
                      key={t.key}
                      className={`flex flex-col items-start rounded-lg border ${t.border} ${t.bg} px-2 py-1.5`}
                    >
                      <span className={`text-[9px] font-semibold uppercase tracking-wider ${t.color} opacity-80`}>
                        {t.label}
                      </span>
                      <span className={`mt-0.5 text-[18px] font-bold leading-none tabular-nums ${t.color}`}>
                        {t.pct.toFixed(1)}%
                      </span>
                      <span className="mt-0.5 text-[9px] tabular-nums text-white/45">
                        {handData ? `frequência` : `${combos.toFixed(combos < 10 ? 2 : 1)} combos`}
                      </span>
                    </div>
                  );
                })}
              </div>
            </div>
          );
        })()}

        {/* Action history */}
        <div className="min-h-0 flex-1 overflow-auto rounded-xl border border-white/8 bg-[#0f172b] p-2.5">
          <div className="mb-2 text-[9px] uppercase tracking-[0.25em] text-white/34">Action Log</div>

          {flow.history.length === 0 ? (
            <div className="text-[11px] text-white/28">Nenhuma ação ainda.</div>
          ) : (
            <div className="space-y-1">
              {flow.history.map((entry, i) => {
                const col =
                  entry.type === "fold" ? "text-blue-300"
                  : entry.type === "raise" ? "text-green-300"
                  : entry.type === "allin" ? "text-red-300"
                  : entry.type === "call" || entry.type === "limp" ? "text-purple-300"
                  : "text-white/55";

                return (
                  <div
                    key={i}
                    className="flex items-center gap-2 rounded-md border border-white/6 bg-white/[0.025] px-2 py-1 text-[11px]"
                  >
                    <span className="w-8 shrink-0 font-semibold text-white/60">{entry.position}</span>
                    <span className={`font-semibold ${col}`}>{entry.label}</span>
                  </div>
                );
              })}

              {activePlayer && !flow.isComplete && (
                <div className="flex items-center gap-2 rounded-md border border-cyan-300/28 bg-cyan-500/8 px-2 py-1 text-[11px]">
                  <span className="w-8 shrink-0 font-semibold text-cyan-200">{activePlayer}</span>
                  <span className="animate-pulse text-cyan-300/65">aguardando...</span>
                </div>
              )}
            </div>
          )}
        </div>

      </div>

      {/* ── Biblioteca de soluções (solver-style overlay) ── */}
      {spotEditorOpen && (() => {
        // Build unique scenarios list (one entry per slug-prefix without stack), grouped by stack.
        const scenariosByStack = new Map<number, typeof scenarioList>();
        for (const s of scenarioList) {
          const stk = s.effectiveStackBb ?? 0;
          if (!scenariosByStack.has(stk)) scenariosByStack.set(stk, []);
          scenariosByStack.get(stk)!.push(s);
        }
        const stacks = Array.from(scenariosByStack.keys()).sort((a, b) => a - b);
        const PILL_BASE = "rounded-md px-2.5 py-1 text-[11px] font-semibold transition";
        const PILL_ACTIVE = "bg-white/12 text-white shadow-inner shadow-black/40";
        const PILL_IDLE = "text-white/55 hover:bg-white/6 hover:text-white/85";

        return (
          <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 backdrop-blur-sm p-6">
            <div className="flex h-full max-h-[90vh] w-full max-w-[1180px] flex-col overflow-hidden rounded-2xl border border-white/10 bg-[#0b1020] shadow-2xl">

              {/* Top tabs */}
              <div className="flex items-center justify-between border-b border-white/8 bg-[#0d1428] px-4 py-2">
                <div className="flex items-center gap-1">
                  <button className={`flex items-center gap-1.5 rounded-md px-3 py-1.5 text-[12px] font-bold ${"text-cyan-100 bg-cyan-500/12"}`}>
                    <span>📚</span> Biblioteca de soluções
                  </button>
                  <button className="flex items-center gap-1.5 rounded-md px-3 py-1.5 text-[12px] font-semibold text-white/45 hover:text-white/75">
                    <span>📋</span> Soluções personalizadas
                  </button>
                  <button className="flex items-center gap-1.5 rounded-md px-3 py-1.5 text-[12px] font-semibold text-white/45 hover:text-white/75">
                    <span>📁</span> Relatórios personalizados
                  </button>
                </div>
                <div className="flex items-center gap-2 text-white/45">
                  <span className="flex items-center gap-1 rounded-md border border-emerald-400/35 bg-emerald-500/10 px-2 py-0.5 text-[10px] font-semibold text-emerald-200">
                    🍀 Try PLO <span className="rounded-sm bg-emerald-400/85 px-1 text-[8px] font-bold text-emerald-950">NOVO</span>
                  </span>
                  <button className="rounded p-1 hover:bg-white/8 hover:text-white" title="Atualizar">↻</button>
                  <button className="rounded p-1 hover:bg-white/8 hover:text-white" title="Visualizar">👁</button>
                  <button className="rounded p-1 hover:bg-white/8 hover:text-white" title="Expandir">⤢</button>
                  <button className="rounded p-1 hover:bg-white/8 hover:text-white" title="Fixar">📌</button>
                  <button
                    type="button"
                    onClick={() => setSpotEditorOpen(false)}
                    className="rounded p-1 hover:bg-white/8 hover:text-white"
                    title="Fechar"
                  >
                    ✕
                  </button>
                </div>
              </div>

              {/* Body: left filters + right content */}
              <div className="flex min-h-0 flex-1">

                {/* Left sidebar — filters */}
                <aside className="flex w-[230px] shrink-0 flex-col gap-3 overflow-y-auto border-r border-white/8 bg-[#0a1124] px-3 py-3 text-[11px]">
                  <FilterGroup title="Soluções">
                    {(["Cash", "Mtt", "Spin & Go", "Hu SnG"] as const).map((item) => (
                      <button
                        key={item}
                        type="button"
                        className={`${PILL_BASE} ${solutionFilters.includes(item) ? PILL_ACTIVE : PILL_IDLE}`}
                        onClick={() => toggleSelection(setSolutionFilters, item)}
                      >
                        {item}
                      </button>
                    ))}
                  </FilterGroup>

                  <FilterGroup title="Formato">
                    <button
                      type="button"
                      className={`${PILL_BASE} ${formatFilters.includes("Heads-up") ? PILL_ACTIVE : PILL_IDLE}`}
                      onClick={() => {
                        setFormatFilters(["Heads-up"]);
                        if (flow.format !== "hu") toggleFormat("hu");
                      }}
                    >
                      Heads-up
                    </button>
                    {(["ChipEV", "ICM", "Eventos"] as const).map((item) => (
                      <button
                        key={item}
                        type="button"
                        className={`${PILL_BASE} ${formatFilters.includes(item) ? PILL_ACTIVE : PILL_IDLE}`}
                        onClick={() => {
                          setFormatFilters([item]);
                          if (flow.format !== "6max") toggleFormat("6max");
                        }}
                      >
                        {item}
                      </button>
                    ))}
                  </FilterGroup>

                  <FilterGroup title="Tournament type">
                    {(["Classic", "PKO"] as const).map((item) => (
                      <button
                        key={item}
                        type="button"
                        className={`${PILL_BASE} ${tournamentTypeFilters.includes(item) ? PILL_ACTIVE : PILL_IDLE}`}
                        onClick={() => toggleSelection(setTournamentTypeFilters, item)}
                      >
                        {item}
                      </button>
                    ))}
                  </FilterGroup>

                  <FilterGroup title="Tournament players">
                    {(["1000 players", "200 players"] as const).map((item) => (
                      <button
                        key={item}
                        type="button"
                        className={`${PILL_BASE} ${tournamentPlayersFilters.includes(item) ? PILL_ACTIVE : PILL_IDLE}`}
                        onClick={() => toggleSelection(setTournamentPlayersFilters, item)}
                      >
                        {item}
                      </button>
                    ))}
                  </FilterGroup>

                  <FilterGroup title="Tournament phase" extra={<span className="text-[10px] text-emerald-300">$ Pagamentos</span>}>
                    {["100% left", "75% left", "50% left", "37% left", "25% left", "Near bubble", "3 tables", "2 tables", "Final table"].map((p) => (
                      <button
                        key={p}
                        type="button"
                        className={`${PILL_BASE} ${tournamentPhaseFilters.includes(p) ? PILL_ACTIVE : PILL_IDLE}`}
                        onClick={() => toggleSelection(setTournamentPhaseFilters, p)}
                      >
                        {p}
                      </button>
                    ))}
                  </FilterGroup>

                  <FilterGroup title="Players">
                    <button
                      type="button"
                      className={`${PILL_BASE} ${playersFilters.includes("8") ? PILL_ACTIVE : PILL_IDLE}`}
                      onClick={() => {
                        const enabling = !playersFilters.includes("8");
                        toggleSelection(setPlayersFilters, "8");
                        if (enabling) toggleFormat("6max");
                      }}
                    >
                      8
                    </button>
                  </FilterGroup>

                  <FilterGroup title="Postflop bet sizes">
                    <button
                      type="button"
                      className={`${PILL_BASE} ${postflopFilters.includes("Single Size") ? PILL_ACTIVE : PILL_IDLE} flex items-center gap-1`}
                      onClick={() => toggleSelection(setPostflopFilters, "Single Size")}
                    >
                      Single Size <span className="rounded-sm bg-emerald-400/85 px-1 text-[8px] font-bold text-emerald-950">NOVO</span>
                    </button>
                  </FilterGroup>
                </aside>

                {/* Right content */}
                <section className="flex min-w-0 flex-1 flex-col gap-3 overflow-y-auto bg-[#0b1222] px-4 py-3">

                  <FilterGroup title="Stack type" inline>
                    {(["Qualquer", "Symmetric", "Near", "Far", "Big stack"] as const).map((item) => (
                      <button
                        key={item}
                        type="button"
                        className={`${PILL_BASE} ${stackTypeFilters.includes(item) ? PILL_ACTIVE : PILL_IDLE}`}
                        onClick={() => toggleSelection(setStackTypeFilters, item)}
                      >
                        {item}
                      </button>
                    ))}
                  </FilterGroup>

                  <button className="self-start rounded-md border border-white/12 bg-white/[0.04] px-3 py-1 text-[11px] font-semibold text-white/65 hover:text-white/90">
                    ▼ Esconder filtros
                  </button>

                  {/* Min/Max grid */}
                  <div className="grid grid-cols-3 gap-x-6 gap-y-1.5 rounded-lg border border-white/8 bg-[#0d1530] p-3 text-[11px]">
                    <div className="col-span-3 mb-1 grid grid-cols-3 gap-x-6 text-[10px] uppercase tracking-wider text-white/40">
                      <span></span>
                      <span></span>
                      <span></span>
                    </div>
                    {[
                      ["Avg.", "UTG", "UTG1", "LJ", "HJ", "CO", "BTN", "SB", "BB"],
                    ][0].reduce((rows: string[][], pos, i) => {
                      const col = i % 3;
                      if (col === 0) rows.push([]);
                      rows[rows.length - 1].push(pos);
                      return rows;
                    }, [])
                      .map((row, ri) => (
                        <React.Fragment key={ri}>
                          {row.map((pos) => (
                            <div key={pos} className="flex items-center gap-2">
                              <span className="w-10 shrink-0 font-semibold text-white/65">{pos}</span>
                              <div className="flex flex-col text-[9px] text-white/40 leading-tight">
                                <span>Mín</span>
                              </div>
                              <input
                                type="number"
                                defaultValue={pos === "Avg." ? 50 : 20}
                                className="w-14 rounded border border-white/10 bg-[#0b1222] px-1.5 py-0.5 text-right text-white tabular-nums outline-none focus:border-cyan-400/60"
                              />
                              <div className="flex flex-col text-[9px] text-white/40 leading-tight">
                                <span>Máx</span>
                              </div>
                              <input
                                type="number"
                                defaultValue={pos === "Avg." ? 80 : 200}
                                className="w-14 rounded border border-white/10 bg-[#0b1222] px-1.5 py-0.5 text-right text-white tabular-nums outline-none focus:border-cyan-400/60"
                              />
                              <button className="text-white/30 hover:text-white/70" title="Limpar">✕</button>
                            </div>
                          ))}
                        </React.Fragment>
                      ))}
                  </div>

                  {/* Situations table */}
                  <div className="flex-1 overflow-y-auto rounded-lg border border-white/8 bg-[#0d1530]">
                    <div className="sticky top-0 flex items-center justify-between border-b border-white/8 bg-[#0d1530] px-3 py-2 text-[10px] uppercase tracking-wider text-white/45">
                      <span>Stacks</span>
                      <span className="text-white/55 tabular-nums">{scenarioList.length} situações</span>
                    </div>
                    <table className="w-full text-[11px]">
                      <thead className="text-[10px] uppercase tracking-wider text-white/45">
                        <tr>
                          <th className="px-2 py-1.5 text-left"></th>
                          <th className="px-2 py-1.5 text-left">Avg.</th>
                          {flow.positions.map((p) => (
                            <th key={p} className="px-2 py-1.5 text-left">{p}</th>
                          ))}
                          <th className="px-2 py-1.5 text-right"></th>
                        </tr>
                      </thead>
                      <tbody>
                        {stacks.flatMap((stk) => {
                          const items = scenariosByStack.get(stk) ?? [];
                          return items.slice(0, 1).map((row) => {
                            const isActive = stk === flow.stackBb;
                            return (
                              <tr
                                key={`${stk}`}
                                onClick={() => {
                                  setUndoStack([]);
                                  dispatch({ type: "RESET", format: flow.format, stackBb: stk });
                                  setSpotEditorOpen(false);
                                }}
                                className={`cursor-pointer border-t border-white/5 transition ${isActive ? "bg-cyan-500/12 text-cyan-100" : "hover:bg-white/4 text-white/75"}`}
                              >
                                <td className="px-2 py-1.5 text-white/35">☆</td>
                                <td className="px-2 py-1.5 font-semibold tabular-nums">{stk}</td>
                                {flow.positions.map((p) => (
                                  <td key={p} className="px-2 py-1.5 tabular-nums text-white/65">{stk}</td>
                                ))}
                                <td className="px-2 py-1.5 text-right text-white/40 tabular-nums">{stk}</td>
                              </tr>
                            );
                          });
                        })}
                        {stacks.length === 0 && (
                          <tr>
                            <td colSpan={11} className="px-4 py-6 text-center text-white/40">
                              Nenhum cenário cadastrado.
                            </td>
                          </tr>
                        )}
                      </tbody>
                    </table>
                  </div>
                </section>
              </div>
            </div>
          </div>
        );
      })()}
    </div>
  );
};

export default GtoActionFlow;
