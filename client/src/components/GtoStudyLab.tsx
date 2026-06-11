import React, { useEffect, useMemo, useRef, useState } from "react";
import { trpc } from "@/lib/trpc";

type FilterValue = "all" | string;

type HandGroupFilter =
  | "all"
  | "broadways"
  | "suited_connectors"
  | "pocket_pairs"
  | "ax_suited"
  | "bluff_candidates"
  | "jam_hands"
  | "pure_raises"
  | "mixed_hands";

type MatrixActions = {
  fold: number;
  call: number;
  raise: number;
  allin: number;
  limp: number;
};

type MatrixBarOrientation = "diagonal" | "horizontal" | "vertical";
type MatrixBarPosition = "normal" | "reverse";

const RANKS = ["A", "K", "Q", "J", "T", "9", "8", "7", "6", "5", "4", "3", "2"] as const;

const ACTION_COLORS: Record<keyof MatrixActions, string> = {
  fold: "#2563eb",
  raise: "#22c55e",
  call: "#a855f7",
  allin: "#ef4444",
  limp: "#eab308",
};

const MATRIX_WIDTH_RATIO = 1.5;
const MATRIX_LEGEND_WIDTH = 112;
const MATRIX_LEGEND_GAP = 12;

const TABLE_POSITIONS = ["UTG", "UTG1", "LJ", "HJ", "CO", "BTN", "SB", "BB"] as const;

const TABLE_VISUAL_POSITIONS = ["UTG", "UTG1", "UTG2", "LJ", "HJ", "CO", "BTN", "SB", "BB"] as const;

const TABLE_INTERACTIVE_POSITION_MAP: Record<(typeof TABLE_VISUAL_POSITIONS)[number], (typeof TABLE_POSITIONS)[number] | null> = {
  UTG: "UTG",
  UTG1: "UTG1",
  UTG2: null,
  LJ: "LJ",
  HJ: "HJ",
  CO: "CO",
  BTN: "BTN",
  SB: "SB",
  BB: "BB",
};

const TABLE_GEOMETRY = {
  centerX: 50,
  centerY: 52,
  feltRadiusX: 42,
  feltRadiusY: 20,
  orbitStartAngleDeg: 228,
  orbitEndAngleDeg: 504,
  orbitSampleCount: 720,
  seatRailOffset: 6.1,
  stackRailOffset: 10.4,
  blindInset: 7,
  potOffsetY: 8.4,
};

const TABLE_VISUAL_PROGRESS: Record<(typeof TABLE_VISUAL_POSITIONS)[number], number> = {
  UTG: 0,
  UTG1: 0.11,
  UTG2: 0.22,
  LJ: 0.34,
  HJ: 0.47,
  CO: 0.6,
  BTN: 0.73,
  SB: 0.86,
  BB: 1,
};

const TABLE_SEAT_ANCHORS: Record<
  (typeof TABLE_VISUAL_POSITIONS)[number],
  {
    x: number;
    y: number;
    scale: number;
  }
> = {
  UTG: { x: 50, y: 74.8, scale: 0.98 },
  UTG1: { x: 26.6, y: 73.4, scale: 0.96 },
  UTG2: { x: 12.8, y: 61.8, scale: 0.95 },
  LJ: { x: 8.9, y: 49.5, scale: 0.95 },
  HJ: { x: 23.6, y: 21.8, scale: 0.93 },
  CO: { x: 50, y: 16.2, scale: 0.92 },
  BTN: { x: 76.8, y: 21.8, scale: 0.93 },
  SB: { x: 90.6, y: 48.2, scale: 0.95 },
  BB: { x: 77.2, y: 72.1, scale: 0.97 },
};

type TableOrbitPoint = {
  x: number;
  y: number;
  angleDeg: number;
  paramRad: number;
  normalX: number;
  normalY: number;
  tangentX: number;
  tangentY: number;
  depth: number;
};

type TableArcSample = TableOrbitPoint & {
  distance: number;
};

function toPercent(value: number): string {
  return `${value.toFixed(2)}%`;
}

function clamp01(value: number): number {
  return Math.max(0, Math.min(1, value));
}

function smoothstep(edge0: number, edge1: number, value: number): number {
  const t = clamp01((value - edge0) / (edge1 - edge0 || 1));
  return t * t * (3 - 2 * t);
}

function getEllipseBasePoint(paramRad: number): { x: number; y: number; cos: number; sin: number } {
  const cos = Math.cos(paramRad);
  const sin = Math.sin(paramRad);
  return {
    x: TABLE_GEOMETRY.centerX + TABLE_GEOMETRY.feltRadiusX * cos,
    y: TABLE_GEOMETRY.centerY + TABLE_GEOMETRY.feltRadiusY * sin,
    cos,
    sin,
  };
}

function applyOpticalCompensation(paramRad: number, x: number, y: number): { x: number; y: number } {
  const base = getEllipseBasePoint(paramRad);
  const topness = clamp01(-base.sin);
  const bottomness = clamp01(base.sin);
  const sideness = 1 - Math.abs(base.sin);
  const shoulder = smoothstep(0.2, 0.95, Math.abs(base.cos));

  // Wider top arc, tighter lower arc, and subtle side compression for depth.
  const xOffset = Math.sign(base.cos || 1) * (topness * 1.6 + shoulder * 0.45) - Math.sign(base.cos || 1) * bottomness * 0.35;
  const yOffset =
    -topness * (1.55 - shoulder * 0.35) +
    -bottomness * 1.15 +
    sideness * 0.48 +
    Math.sin(paramRad * 2) * 0.18;

  return {
    x: x + xOffset,
    y: y + yOffset,
  };
}

function getOrbitPoint(paramRad: number): TableOrbitPoint {
  const base = getEllipseBasePoint(paramRad);
  const compensated = applyOpticalCompensation(paramRad, base.x, base.y);
  const epsilon = 0.0035;

  const prevBase = getEllipseBasePoint(paramRad - epsilon);
  const nextBase = getEllipseBasePoint(paramRad + epsilon);
  const prevCompensated = applyOpticalCompensation(paramRad - epsilon, prevBase.x, prevBase.y);
  const nextCompensated = applyOpticalCompensation(paramRad + epsilon, nextBase.x, nextBase.y);

  const tangentRawX = nextCompensated.x - prevCompensated.x;
  const tangentRawY = nextCompensated.y - prevCompensated.y;
  const tangentLength = Math.hypot(tangentRawX, tangentRawY) || 1;
  const tangentX = tangentRawX / tangentLength;
  const tangentY = tangentRawY / tangentLength;

  let normalX = -tangentY;
  let normalY = tangentX;

  const outwardX = compensated.x - TABLE_GEOMETRY.centerX;
  const outwardY = compensated.y - TABLE_GEOMETRY.centerY;
  if (normalX * outwardX + normalY * outwardY < 0) {
    normalX *= -1;
    normalY *= -1;
  }

  const visualDepth = clamp01((compensated.y - (TABLE_GEOMETRY.centerY - TABLE_GEOMETRY.feltRadiusY)) / (TABLE_GEOMETRY.feltRadiusY * 2));

  return {
    x: compensated.x,
    y: compensated.y,
    angleDeg: (paramRad * 180) / Math.PI,
    paramRad,
    normalX,
    normalY,
    tangentX,
    tangentY,
    depth: visualDepth,
  };
}

function buildOrbitSamples(): TableArcSample[] {
  const startRad = (TABLE_GEOMETRY.orbitStartAngleDeg * Math.PI) / 180;
  const endRad = (TABLE_GEOMETRY.orbitEndAngleDeg * Math.PI) / 180;
  const samples: TableArcSample[] = [];
  let totalDistance = 0;
  let previousPoint: TableOrbitPoint | null = null;

  for (let index = 0; index <= TABLE_GEOMETRY.orbitSampleCount; index += 1) {
    const progress = index / TABLE_GEOMETRY.orbitSampleCount;
    const paramRad = startRad + (endRad - startRad) * progress;
    const point = getOrbitPoint(paramRad);

    if (previousPoint) {
      totalDistance += Math.hypot(point.x - previousPoint.x, point.y - previousPoint.y);
    }

    samples.push({
      ...point,
      distance: totalDistance,
    });
    previousPoint = point;
  }

  return samples;
}

function getOrbitPointAtProgress(samples: TableArcSample[], progress: number): TableOrbitPoint {
  const clampedProgress = Math.max(0, Math.min(1, progress));
  const totalDistance = samples.at(-1)?.distance ?? 0;
  const targetDistance = totalDistance * clampedProgress;
  const nextIndex = samples.findIndex((sample) => sample.distance >= targetDistance);

  if (nextIndex <= 0) {
    return samples[0];
  }

  const previous = samples[nextIndex - 1];
  const next = samples[nextIndex] ?? samples.at(-1) ?? samples[0];
  const span = next.distance - previous.distance || 1;
  const blend = (targetDistance - previous.distance) / span;
  const paramRad = previous.paramRad + (next.paramRad - previous.paramRad) * blend;

  return getOrbitPoint(paramRad);
}

const TABLE_ORBIT_SAMPLES = buildOrbitSamples();

const TABLE_SEAT_LAYOUT = TABLE_VISUAL_POSITIONS.map((position, index) => {
  const progress = TABLE_VISUAL_PROGRESS[position] ?? (TABLE_VISUAL_POSITIONS.length === 1 ? 0 : index / (TABLE_VISUAL_POSITIONS.length - 1));
  const orbitPoint = getOrbitPointAtProgress(TABLE_ORBIT_SAMPLES, progress);
  const anchor = TABLE_SEAT_ANCHORS[position];
  const borderPoint = {
    x: anchor?.x ?? orbitPoint.x,
    y: anchor?.y ?? orbitPoint.y,
  };
  const radialX = borderPoint.x - TABLE_GEOMETRY.centerX;
  const radialY = borderPoint.y - TABLE_GEOMETRY.centerY;
  const radialLength = Math.hypot(radialX, radialY) || 1;
  const normalX = radialX / radialLength;
  const normalY = radialY / radialLength;
  const topness = clamp01((TABLE_GEOMETRY.centerY - borderPoint.y) / TABLE_GEOMETRY.feltRadiusY);
  const bottomness = clamp01((borderPoint.y - TABLE_GEOMETRY.centerY) / TABLE_GEOMETRY.feltRadiusY);
  const sideness = clamp01(Math.abs(borderPoint.x - TABLE_GEOMETRY.centerX) / TABLE_GEOMETRY.feltRadiusX);
  const seatOffset = TABLE_GEOMETRY.seatRailOffset + topness * 1.1 - bottomness * 1.8 - sideness * 0.45;
  const stackOffset = TABLE_GEOMETRY.stackRailOffset + topness * 0.7 - bottomness * 1.25 - sideness * 0.35;
  const seatPoint = {
    x: borderPoint.x + normalX * seatOffset,
    y: borderPoint.y + normalY * seatOffset,
  };
  const stackPoint = {
    x: borderPoint.x + normalX * stackOffset,
    y: borderPoint.y + normalY * stackOffset,
  };

  return {
    position,
    angleDeg: orbitPoint.angleDeg,
    left: toPercent(seatPoint.x),
    top: toPercent(seatPoint.y),
    stackLeft: toPercent(stackPoint.x),
    stackTop: toPercent(stackPoint.y),
    borderX: borderPoint.x,
    borderY: borderPoint.y,
    normalX,
    normalY,
    scale: anchor?.scale ?? 0.9 + orbitPoint.depth * 0.12,
  };
});

const TABLE_SEAT_LAYOUT_MAP = Object.fromEntries(
  TABLE_SEAT_LAYOUT.map((seat) => [seat.position, seat]),
) as Record<(typeof TABLE_VISUAL_POSITIONS)[number], (typeof TABLE_SEAT_LAYOUT)[number]>;

const TABLE_ACTION_LAYOUT = {
  sb: (() => {
    const point = {
      x: TABLE_SEAT_LAYOUT_MAP.SB.borderX - TABLE_SEAT_LAYOUT_MAP.SB.normalX * TABLE_GEOMETRY.blindInset,
      y: TABLE_SEAT_LAYOUT_MAP.SB.borderY - TABLE_SEAT_LAYOUT_MAP.SB.normalY * TABLE_GEOMETRY.blindInset,
    };
    return { left: toPercent(point.x), top: toPercent(point.y) };
  })(),
  bb: (() => {
    const point = {
      x: TABLE_SEAT_LAYOUT_MAP.BB.borderX - TABLE_SEAT_LAYOUT_MAP.BB.normalX * TABLE_GEOMETRY.blindInset,
      y: TABLE_SEAT_LAYOUT_MAP.BB.borderY - TABLE_SEAT_LAYOUT_MAP.BB.normalY * TABLE_GEOMETRY.blindInset,
    };
    return { left: toPercent(point.x), top: toPercent(point.y) };
  })(),
  pot: {
    left: toPercent(TABLE_GEOMETRY.centerX),
    top: toPercent(TABLE_GEOMETRY.centerY - TABLE_GEOMETRY.potOffsetY),
  },
};

function normalizePositionLabel(value?: string | null): string {
  const clean = String(value || "")
    .trim()
    .toUpperCase()
    .replace(/\s+/g, "")
    .replace(/-/g, "")
    .replace(/\+/g, "");

  const aliases: Record<string, (typeof TABLE_POSITIONS)[number]> = {
    UTG: "UTG",
    UTG1: "UTG1",
    MP: "LJ",
    LJ: "LJ",
    MP1: "HJ",
    HJ: "HJ",
    CO: "CO",
    BTN: "BTN",
    SB: "SB",
    BB: "BB",
  };

  return aliases[clean] ?? clean;
}

function compactList(values: string[], maxItems = 2): string {
  const filtered = Array.from(new Set(values.filter(Boolean)));
  if (!filtered.length) return "-";
  if (filtered.length <= maxItems) return filtered.join(" / ");
  return `${filtered.slice(0, maxItems).join(" / ")} +${filtered.length - maxItems}`;
}

function normalizeHandCode(code: string): string {
  return String(code || "").trim().toUpperCase();
}

function buildMatrixHandCode(rowRank: string, colRank: string, rowIndex: number, colIndex: number): string {
  if (rowIndex === colIndex) return `${rowRank}${colRank}`;
  if (rowIndex < colIndex) return `${rowRank}${colRank}S`;
  return `${colRank}${rowRank}O`;
}

function formatHandLabel(code: string): string {
  const clean = normalizeHandCode(code);
  if (clean.length < 2) return clean;
  const base = `${clean[0]}${clean[1]}`;
  if (clean.length < 3) return base;
  const suffix = clean[2] === "S" ? "s" : clean[2] === "O" ? "o" : clean[2].toLowerCase();
  return `${base}${suffix}`;
}

function sanitizeScenarioTitle(title: string): string {
  return String(title || "").replace(/\bwizard\b/gi, "Solver").replace(/\s{2,}/g, " ").trim();
}

function formatBb(value: number): string {
  return Number.isInteger(value) ? String(value) : value.toFixed(1);
}

function inferScenarioAction(slug: string, title: string): string {
  const context = `${String(slug || "")} ${String(title || "")}`.toLowerCase();

  if (/all[\s_-]?in|\bjam\b|\bshove\b/.test(context)) return "All-in";
  if (/\bfold\b/.test(context)) return "Fold";
  if (/\bcall\b|\bflat\b|\bcheck\b|\blimp\b/.test(context)) return "Call";
  if (/\b4bet\b|\b3bet\b|\bopen\b|\brfi\b|\braise\b|\bbet\b/.test(context)) return "Raise";

  return "Spot";
}

function parseScenarioMeta(input: {
  slug: string;
  title: string;
  gameType?: string;
  heroPosition?: string;
  villainPosition?: string;
  effectiveStackBb?: number;
  smallBlind?: number;
  bigBlind?: number;
}) {
  const slug = String(input.slug || "").toLowerCase();
  const title = String(input.title || "");

  const modality = slug.includes("mtt") ? "MTT" : (input.gameType || "heads_up").includes("heads") ? "HU" : "Cash";
  const format = slug.includes("icm") ? "ICM" : slug.includes("sat") ? "Satélites" : slug.includes("pko") || slug.includes("bounty") ? "PKO" : "ChipEV";
  const players = (input.gameType || "heads_up").includes("heads") ? "2-handed" : "8-max";
  const stack = `${Number(input.effectiveStackBb || 0)}bb`;
  const previousAction = inferScenarioAction(slug, title);

  const sizingMatch = slug.match(/(\d+(?:\.\d+)?)x/);
  const sizing = sizingMatch?.[1] ? `${sizingMatch[1]}x` : "Solver";

  return {
    solutionId: input.slug,
    slug: input.slug,
    title,
    modality,
    format,
    players,
    stack,
    heroPosition: input.heroPosition || "SB",
    villainPosition: input.villainPosition || "BB",
    previousAction,
    sizing,
    smallBlind: Number(input.smallBlind || 0),
    bigBlind: Number(input.bigBlind || 0),
    effectiveStackBb: Number(input.effectiveStackBb || 0),
  };
}

function handGroupMatch(code: string, group: HandGroupFilter, actions?: MatrixActions): boolean {
  if (group === "all") return true;

  const clean = normalizeHandCode(code);
  const r1 = clean[0] || "";
  const r2 = clean[1] || "";
  const sfx = clean[2] || "";
  const pair = r1 === r2;
  const suited = sfx === "S";
  const offsuit = sfx === "O";

  const broadRanks = new Set(["A", "K", "Q", "J", "T"]);
  const broadway = broadRanks.has(r1) && broadRanks.has(r2) && r1 !== r2;

  const rankIndex = (r: string) => RANKS.indexOf(r as (typeof RANKS)[number]);
  const gap = Math.abs(rankIndex(r1) - rankIndex(r2));

  if (group === "broadways") return broadway;
  if (group === "suited_connectors") return suited && !pair && gap === 1;
  if (group === "pocket_pairs") return pair;
  if (group === "ax_suited") return suited && (r1 === "A" || r2 === "A");
  if (group === "bluff_candidates") return suited && !pair && gap <= 2 && !broadway;
  if (group === "jam_hands") {
    if (actions && actions.allin > 0.1) return true;
    return pair || (offsuit && (r1 === "A" || r2 === "A"));
  }
  if (group === "pure_raises") {
    if (!actions) return false;
    return actions.raise >= 95;
  }
  if (group === "mixed_hands") {
    if (!actions) return false;
    const positiveActions = [actions.raise, actions.call, actions.fold, actions.allin, actions.limp].filter((v) => v > 5).length;
    return positiveActions >= 2;
  }
  return true;
}

function buildMixedGradient(actions: MatrixActions): string {
  const parts = [
    { key: "raise", value: actions.raise },
    { key: "call", value: actions.call },
    { key: "fold", value: actions.fold },
    { key: "allin", value: actions.allin },
    { key: "limp", value: actions.limp },
  ].filter((p) => p.value > 0.01);

  if (!parts.length) {
    return "linear-gradient(135deg, rgba(15,23,42,0.92), rgba(30,41,59,0.92))";
  }

  const total = parts.reduce((acc, p) => acc + p.value, 0);
  let cursor = 0;
  const gradientStops: string[] = [];

  parts.forEach((part) => {
    const start = cursor;
    const share = (part.value / total) * 100;
    const end = cursor + share;
    const color = ACTION_COLORS[part.key as keyof MatrixActions];
    gradientStops.push(`${color} ${start.toFixed(2)}% ${end.toFixed(2)}%`);
    cursor = end;
  });

  return `linear-gradient(135deg, ${gradientStops.join(", ")})`;
}

function buildMatrixGradient(
  actions: MatrixActions,
  colors: Record<keyof MatrixActions, string>,
  orientation: MatrixBarOrientation,
  position: MatrixBarPosition,
): string {
  const parts = [
    { key: "raise", value: actions.raise },
    { key: "call", value: actions.call },
    { key: "fold", value: actions.fold },
    { key: "allin", value: actions.allin },
    { key: "limp", value: actions.limp },
  ].filter((p) => p.value > 0.01);

  const gradientAngle = orientation === "horizontal" ? "90deg" : orientation === "vertical" ? "180deg" : "135deg";

  if (!parts.length) {
    return `linear-gradient(${gradientAngle}, rgba(15,23,42,0.92), rgba(30,41,59,0.92))`;
  }

  const orderedParts = position === "reverse" ? [...parts].reverse() : parts;
  const total = orderedParts.reduce((acc, p) => acc + p.value, 0);
  let cursor = 0;
  const gradientStops: string[] = [];

  orderedParts.forEach((part) => {
    const start = cursor;
    const share = (part.value / total) * 100;
    const end = cursor + share;
    const color = colors[part.key as keyof MatrixActions];
    gradientStops.push(`${color} ${start.toFixed(2)}% ${end.toFixed(2)}%`);
    cursor = end;
  });

  return `linear-gradient(${gradientAngle}, ${gradientStops.join(", ")})`;
}

type StrategicActionType = "fold" | "call" | "raise" | "jam" | "check";

type SpotActionEntry = {
  position: string;
  action: StrategicActionType | "open";
  size?: number;
};

type SpotContextState = {
  gameType: "cash" | "tournament";
  format: "hu" | "6max" | "9max";
  stackDepth: number;
  smallBlind: number;
  bigBlind: number;
  activePositions: string[];
};

type SpotDescriptor = {
  solutionId: string;
  spotKey: string;
  context: SpotContextState;
  actionPath: SpotActionEntry[];
};

function normalizeStrategicActionType(value: string): StrategicActionType {
  const normalized = String(value || "").toLowerCase();
  if (normalized.includes("all-in") || normalized.includes("allin") || normalized.includes("jam") || normalized.includes("shove")) return "jam";
  if (normalized.includes("fold")) return "fold";
  if (normalized.includes("check")) return "check";
  if (normalized.includes("call") || normalized.includes("flat") || normalized.includes("limp")) return "call";
  return "raise";
}

function buildStrategicActionLabel(actionType: StrategicActionType, sizing: string, stackBb: number): string {
  if (actionType === "jam") return `All-in ${formatBb(stackBb || 0)}`;
  if (actionType === "raise") return sizing && sizing !== "Solver" ? `Raise ${sizing}` : "Raise";
  if (actionType === "call") return "Call";
  if (actionType === "check") return "Check";
  return "Fold";
}

function actionEvProxy(actionType: StrategicActionType, stackBb: number): number {
  const stackFactor = Math.max(0.02, Math.min(0.2, (Number(stackBb || 0) / 1000)));
  if (actionType === "raise") return Number((0.11 + stackFactor).toFixed(3));
  if (actionType === "jam") return Number((0.08 + stackFactor / 2).toFixed(3));
  if (actionType === "call") return Number((0.05 + stackFactor / 3).toFixed(3));
  if (actionType === "check") return Number((0.03 + stackFactor / 4).toFixed(3));
  return 0;
}

function normalizePosition(position: string): string {
  return normalizePositionLabel(position).toUpperCase();
}

function normalizeAction(action: string): StrategicActionType | "open" {
  const normalized = String(action || "").trim().toLowerCase().replace(/[_\s-]+/g, " ");
  if (normalized.includes("all in") || normalized.includes("allin") || normalized.includes("jam") || normalized.includes("shove")) return "jam";
  if (normalized.includes("fold")) return "fold";
  if (normalized.includes("check")) return "check";
  if (normalized.includes("call") || normalized.includes("flat") || normalized.includes("limp")) return "call";
  if (normalized.includes("open")) return "open";
  if (normalized.includes("raise") || normalized.includes("bet") || normalized.includes("3bet") || normalized.includes("4bet") || normalized.includes("rfi")) return "raise";
  return "raise";
}

function inferContextFormat(players: string): SpotContextState["format"] {
  const value = String(players || "").toLowerCase();
  if (value.includes("2") || value.includes("heads")) return "hu";
  if (value.includes("9")) return "9max";
  return "6max";
}

function buildSpotKey(context: SpotContextState, actionPath: SpotActionEntry[]): string {
  const base = [
    context.gameType,
    context.format,
    `${Math.max(0, Math.round(context.stackDepth))}bb`,
  ];

  const pathParts = actionPath.flatMap((entry) => {
    const p = normalizePosition(entry.position);
    const action = normalizeAction(entry.action);
    if ((action === "raise" || action === "open") && typeof entry.size === "number" && Number.isFinite(entry.size)) {
      return [p, action, Number(entry.size.toFixed(2)).toString()];
    }
    return [p, action];
  });

  return [...base, ...pathParts].join("_");
}

function actionOrderForFormat(format: SpotContextState["format"]): string[] {
  if (format === "hu") return ["SB", "BB"];
  if (format === "9max") return ["UTG", "UTG1", "LJ", "HJ", "CO", "BTN", "SB", "BB"];
  return ["UTG", "HJ", "CO", "BTN", "SB", "BB"];
}

function validateActionPath(context: SpotContextState, actionPath: SpotActionEntry[]): { valid: boolean; reason?: string } {
  const order = actionOrderForFormat(context.format);
  let lastOrder = -1;

  for (const entry of actionPath) {
    const position = normalizePosition(entry.position);
    const idx = order.indexOf(position);
    if (idx < 0) return { valid: false, reason: `Posicao fora do formato atual: ${position}` };
    if (idx < lastOrder) return { valid: false, reason: `Ordem invalida de acao: ${position}` };
    lastOrder = idx;
  }

  return { valid: true };
}

// ============================================================
// VILLAIN-FIRST SPOT BUILDER
// ============================================================

const VILLAIN_ACTIONS = [
  { value: "raise", label: "Raise / Open" },
  { value: "limp", label: "Limp" },
  { value: "call", label: "Call" },
  { value: "check", label: "Check" },
  { value: "jam", label: "All-in" },
  { value: "fold", label: "Fold" },
] as const;

type VillainActionValue = (typeof VILLAIN_ACTIONS)[number]["value"];

const FORMAT_POSITIONS: Record<string, string[]> = {
  hu: ["SB", "BB"],
  "6max": ["UTG", "HJ", "CO", "BTN", "SB", "BB"],
  "9max": ["UTG", "UTG1", "LJ", "HJ", "CO", "BTN", "SB", "BB"],
};

function buildSpotFromVillainAction(params: {
  gameType: string;
  format: string;
  stackDepth: number;
  heroPosition: string;
  villainPosition: string;
  villainAction: VillainActionValue;
  villainSize?: number;
}): string {
  const base = [
    params.gameType,
    params.format,
    `${Math.round(Math.max(0, params.stackDepth))}bb`,
  ];
  const hero = normalizePosition(params.heroPosition);
  const villain = normalizePosition(params.villainPosition);
  const action = normalizeAction(params.villainAction) as string;
  const parts = [hero, "vs", villain, action];
  if (
    (action === "raise" || action === "jam") &&
    params.villainSize &&
    Number.isFinite(params.villainSize) &&
    params.villainSize > 0
  ) {
    parts.push(Number(params.villainSize.toFixed(2)).toString());
  }
  return [...base, ...parts].join("_");
}

export const GtoStudyLab: React.FC<{ initialStack?: string }> = ({ initialStack }) => {
  const { data: scenarios = [], isLoading: loadingScenarios } = trpc.gto.listScenarios.useQuery();

  const librarySolutions = useMemo(
    () => scenarios.map(parseScenarioMeta).filter((solution) => solution.format !== "ICM"),
    [scenarios],
  );

  const [modality, setModality] = useState<FilterValue>("all");
  const [format, setFormat] = useState<FilterValue>("all");
  const [players, setPlayers] = useState<FilterValue>("all");
  const [stack, setStack] = useState<FilterValue>("all");
  const [heroPosition, setHeroPosition] = useState<FilterValue>("all");
  const [previousAction, setPreviousAction] = useState<FilterValue>("all");
  const [selectedSolutionId, setSelectedSolutionId] = useState<string>("");
  const [isSelectionClearedManually, setIsSelectionClearedManually] = useState(false);
  const [selectedHandCode, setSelectedHandCode] = useState<string>("A5S");
  const [handGroupFilter, setHandGroupFilter] = useState<HandGroupFilter>("all");
  const [matrixBarOrientation, setMatrixBarOrientation] = useState<MatrixBarOrientation>("diagonal");
  const [matrixBarPosition, setMatrixBarPosition] = useState<MatrixBarPosition>("normal");
  const [matrixActionColors, setMatrixActionColors] = useState<Record<keyof MatrixActions, string>>(ACTION_COLORS);
  const [inspectorTab, setInspectorTab] = useState<"overview" | "table" | "equity">("table");
  const [activeTablePosition, setActiveTablePosition] = useState<(typeof TABLE_POSITIONS)[number] | null>(null);
  const [matrixSize, setMatrixSize] = useState(0);
  const [isMatrixStyleMenuOpen, setIsMatrixStyleMenuOpen] = useState(false);
  const [isSpotMenuOpen, setIsSpotMenuOpen] = useState(false);
  const [navigationState, setNavigationState] = useState<{ items: string[]; cursor: number }>({ items: [], cursor: -1 });
  const [actionPath, setActionPath] = useState<SpotActionEntry[]>([]);
  const [spotEngineNotice, setSpotEngineNotice] = useState<string>("");
  const matrixViewportRef = useRef<HTMLDivElement>(null);
  const historyNavigationRef = useRef(false);

  // Villain-first builder state
  const [builderHero, setBuilderHero] = useState<string>("BB");
  const [builderVillain, setBuilderVillain] = useState<string>("SB");
  const [builderVillainAction, setBuilderVillainAction] = useState<VillainActionValue>("raise");
  const [builderVillainSize, setBuilderVillainSize] = useState<string>("");
  const [builderStack, setBuilderStack] = useState<string>("200bb");
  const [builderFormat, setBuilderFormat] = useState<string>("hu");

  // Sync stack selector from parent (Gto.tsx quick selector)
  useEffect(() => {
    if (!initialStack) return;
    setStack(initialStack);
    setBuilderStack(initialStack);
  }, [initialStack]);

  const options = useMemo(() => {
    const uniq = (arr: string[]) => Array.from(new Set(arr)).filter(Boolean);
    return {
      modalities: uniq(librarySolutions.map((s) => s.modality)),
      formats: uniq(librarySolutions.map((s) => s.format)),
      players: uniq(librarySolutions.map((s) => s.players)),
      stacks: uniq(librarySolutions.map((s) => s.stack)),
      heroPositions: uniq(librarySolutions.map((s) => s.heroPosition)),
      previousActions: uniq(librarySolutions.map((s) => s.previousAction)),
    };
  }, [librarySolutions]);

  const solutionById = useMemo(() => new Map(librarySolutions.map((solution) => [solution.solutionId, solution])), [librarySolutions]);

  const inferActionPathFromSolution = (solution: (typeof librarySolutions)[number]): SpotActionEntry[] => {
    const normalizedAction = normalizeAction(solution.previousAction);
    const maybeSize = Number.parseFloat(String(solution.sizing || "").replace(/[^\d.]/g, ""));
    return [{
      position: normalizePosition(solution.heroPosition),
      action: normalizedAction,
      size: (normalizedAction === "raise" || normalizedAction === "open") && Number.isFinite(maybeSize) ? maybeSize : undefined,
    }];
  };

  const solutionDescriptors = useMemo<SpotDescriptor[]>(() => {
    return librarySolutions.map((solution) => {
      const context: SpotContextState = {
        gameType: solution.modality === "Cash" ? "cash" : "tournament",
        format: inferContextFormat(solution.players),
        stackDepth: Number(solution.effectiveStackBb || 0),
        smallBlind: Number(solution.smallBlind || 0),
        bigBlind: Number(solution.bigBlind || 0),
        activePositions: [normalizePosition(solution.heroPosition), normalizePosition(solution.villainPosition)],
      };
      const inferredPath = inferActionPathFromSolution(solution);

      return {
        solutionId: solution.solutionId,
        context,
        actionPath: inferredPath,
        spotKey: buildSpotKey(context, inferredPath),
      };
    });
  }, [librarySolutions]);

  const descriptorBySolutionId = useMemo(
    () => new Map(solutionDescriptors.map((descriptor) => [descriptor.solutionId, descriptor])),
    [solutionDescriptors],
  );

  const descriptorsBySpotKey = useMemo(() => {
    const map = new Map<string, SpotDescriptor[]>();
    solutionDescriptors.forEach((descriptor) => {
      const items = map.get(descriptor.spotKey) ?? [];
      items.push(descriptor);
      map.set(descriptor.spotKey, items);
    });
    return map;
  }, [solutionDescriptors]);

  const currentSpotContext = useMemo<SpotContextState>(() => {
    const selected = selectedSolutionId ? solutionById.get(selectedSolutionId) : null;
    const fallbackStack = Number.parseFloat(String(stack).replace(/[^\d.]/g, ""));

    return {
      gameType: (selected?.modality ?? modality) === "Cash" ? "cash" : "tournament",
      format: inferContextFormat(selected?.players ?? players),
      stackDepth: Number(selected?.effectiveStackBb || (Number.isFinite(fallbackStack) ? fallbackStack : 100)),
      smallBlind: Number(selected?.smallBlind || 50),
      bigBlind: Number(selected?.bigBlind || 100),
      activePositions: [
        normalizePosition(selected?.heroPosition ?? heroPosition),
        normalizePosition(selected?.villainPosition ?? "BB"),
      ],
    };
  }, [heroPosition, modality, players, selectedSolutionId, solutionById, stack]);

  const loadSpotByKey = (spotKey: string): SpotDescriptor | null => {
    const candidates = descriptorsBySpotKey.get(spotKey) ?? [];
    if (!candidates.length) return null;

    const selectedCandidate = candidates.find((candidate) => candidate.solutionId === selectedSolutionId);
    return selectedCandidate ?? candidates[0];
  };

  const resolveSpot = (context: SpotContextState, path: SpotActionEntry[]) => {
    const validation = validateActionPath(context, path);
    const normalizedPath = path.map((entry) => ({
      position: normalizePosition(entry.position),
      action: normalizeAction(entry.action),
      size: entry.size,
    }));
    const spotKey = buildSpotKey(context, normalizedPath);
    const descriptor = validation.valid ? loadSpotByKey(spotKey) : null;

    if (descriptor) {
      return { spotKey, descriptor, suggestions: [] as SpotDescriptor[], reason: "" };
    }

    const contextPrefix = `${context.gameType}_${context.format}_${Math.max(0, Math.round(context.stackDepth))}bb_`;
    const suggestions = solutionDescriptors
      .filter((candidate) => candidate.spotKey.startsWith(contextPrefix))
      .slice(0, 5);

    return {
      spotKey,
      descriptor: null,
      suggestions,
      reason: validation.valid ? "Sem solucao cadastrada para esse action path." : (validation.reason || "Action path invalido"),
    };
  };

  const filteredSolutions = useMemo(() => {
    return librarySolutions.filter((s) => {
      if (modality !== "all" && s.modality !== modality) return false;
      if (format !== "all" && s.format !== format) return false;
      if (players !== "all" && s.players !== players) return false;
      if (stack !== "all" && s.stack !== stack) return false;
      if (heroPosition !== "all" && s.heroPosition !== heroPosition) return false;
      if (previousAction !== "all" && s.previousAction !== previousAction) return false;
      return true;
    });
  }, [format, heroPosition, librarySolutions, modality, players, previousAction, stack]);

  useEffect(() => {
    if (!filteredSolutions.length) {
      setSelectedSolutionId("");
      setIsSelectionClearedManually(false);
      return;
    }

    if (!selectedSolutionId) {
      if (isSelectionClearedManually) return;
      setSelectedSolutionId(filteredSolutions[0].solutionId);
      return;
    }

    const exists = filteredSolutions.some((s) => s.solutionId === selectedSolutionId);
    if (exists) return;
    setIsSelectionClearedManually(false);
    setSelectedSolutionId(filteredSolutions[0].solutionId);
  }, [filteredSolutions, isSelectionClearedManually, selectedSolutionId]);

  const selectedSolution = useMemo(
    () => solutionById.get(selectedSolutionId) || filteredSolutions.find((s) => s.solutionId === selectedSolutionId) || null,
    [filteredSolutions, selectedSolutionId, solutionById],
  );

  const navigateToSolution = (
    solutionId: string,
    options?: { replaceActionPath?: SpotActionEntry[]; allowToggleClear?: boolean },
  ) => {
    if (options?.allowToggleClear && solutionId === selectedSolutionId) {
      setModality("all");
      setFormat("all");
      setPlayers("all");
      setStack("all");
      setHeroPosition("all");
      setPreviousAction("all");
      setSelectedSolutionId("");
      setIsSelectionClearedManually(true);
      setActionPath([]);
      setSpotEngineNotice("");
      return;
    }

    const next = solutionById.get(solutionId);
    if (!next) return;

    setModality(next.modality);
    setFormat(next.format);
    setPlayers(next.players);
    setStack(next.stack);
    setHeroPosition(next.heroPosition);
    setPreviousAction(next.previousAction);
    setSelectedSolutionId(next.solutionId);
    setIsSelectionClearedManually(false);
    setInspectorTab("table");
    setIsSpotMenuOpen(false);
    setSpotEngineNotice("");

    if (options?.replaceActionPath) {
      setActionPath(options.replaceActionPath);
    } else {
      const descriptor = descriptorBySolutionId.get(next.solutionId);
      if (descriptor?.actionPath?.length) {
        setActionPath(descriptor.actionPath);
      }
    }

    setNavigationState((prev) => {
      if (historyNavigationRef.current) return prev;
      const base = prev.cursor >= 0 ? prev.items.slice(0, prev.cursor + 1) : [...prev.items];
      if (base[base.length - 1] === next.solutionId) return prev;
      const items = [...base, next.solutionId];
      return { items, cursor: items.length - 1 };
    });
  };

  const goToNextSpot = (action: {
    actionType: StrategicActionType;
    sizing: string;
    nextSpotKey: string;
    nextSolutionId: string;
    actorPosition: string;
  }) => {
    const sizeValue = Number.parseFloat(String(action.sizing).replace(/[^\d.]/g, ""));
    const nextActionPath = [
      ...actionPath,
      {
        position: normalizePosition(action.actorPosition),
        action: action.actionType === "raise" ? "raise" : action.actionType,
        size: (action.actionType === "raise" || action.actionType === "jam") && Number.isFinite(sizeValue) ? sizeValue : undefined,
      },
    ];

    const resolved = resolveSpot(currentSpotContext, nextActionPath);
    if (resolved.descriptor) {
      navigateToSolution(resolved.descriptor.solutionId, { replaceActionPath: nextActionPath });
      return;
    }

    const fallback = action.nextSpotKey ? loadSpotByKey(action.nextSpotKey) : null;
    if (fallback) {
      navigateToSolution(fallback.solutionId, { replaceActionPath: nextActionPath });
      return;
    }

    setSpotEngineNotice(`${resolved.reason} chave: ${resolved.spotKey}`);
  };

  useEffect(() => {
    if (!selectedSolutionId) return;
    setNavigationState((prev) => {
      if (prev.items.length) return prev;
      return { items: [selectedSolutionId], cursor: 0 };
    });
  }, [selectedSolutionId]);

  useEffect(() => {
    if (!selectedSolutionId) return;
    if (actionPath.length) return;
    const descriptor = descriptorBySolutionId.get(selectedSolutionId);
    if (descriptor?.actionPath?.length) {
      setActionPath(descriptor.actionPath);
    }
  }, [actionPath.length, descriptorBySolutionId, selectedSolutionId]);

  const canGoBack = navigationState.cursor > 0;
  const canGoForward = navigationState.cursor >= 0 && navigationState.cursor < navigationState.items.length - 1;

  const handleHistoryNavigation = (delta: -1 | 1) => {
    const nextCursor = navigationState.cursor + delta;
    if (nextCursor < 0 || nextCursor >= navigationState.items.length) return;
    const nextId = navigationState.items[nextCursor];
    if (!nextId) return;

    historyNavigationRef.current = true;
    setNavigationState((prev) => ({ ...prev, cursor: nextCursor }));
    navigateToSolution(nextId);
    historyNavigationRef.current = false;
  };

  const breadcrumbPath = useMemo(() => {
    return navigationState.items.map((solutionId, index) => {
      const solution = solutionById.get(solutionId);
      const label = solution
        ? `${normalizePositionLabel(solution.heroPosition)} ${solution.previousAction}`
        : solutionId;
      return {
        solutionId,
        label,
        active: index === navigationState.cursor,
      };
    });
  }, [navigationState.cursor, navigationState.items, solutionById]);

  const currentResolvedSpot = useMemo(
    () => resolveSpot(currentSpotContext, actionPath),
    [actionPath, currentSpotContext],
  );

  const { data: scenarioData, isLoading: loadingScenarioData } = trpc.gto.getScenario.useQuery(
    { slug: selectedSolution?.slug || "" },
    { enabled: Boolean(selectedSolution?.slug) },
  );

  const handMap = useMemo(() => {
    const map = new Map<string, {
      code: string;
      raisePctX10: number;
      limpCheckPctX10: number;
      foldPctX10: number;
      bucket?: string;
    }>();

    (scenarioData?.handList || []).forEach((h) => {
      map.set(normalizeHandCode(h.code), h);
    });

    return map;
  }, [scenarioData?.handList]);

  useEffect(() => {
    if (!scenarioData?.handList?.length) return;
    const exists = handMap.has(normalizeHandCode(selectedHandCode));
    if (exists) return;
    setSelectedHandCode(normalizeHandCode(scenarioData.handList[0].code));
  }, [scenarioData?.handList, handMap, selectedHandCode]);

  const matrixCells = useMemo(() => {
    return RANKS.map((rowRank, rowIndex) =>
      RANKS.map((colRank, colIndex) => {
        const code = buildMatrixHandCode(rowRank, colRank, rowIndex, colIndex);
        const normalizedCode = normalizeHandCode(code);
        const hand = handMap.get(normalizedCode);

        const actions: MatrixActions = {
          fold: hand ? hand.foldPctX10 / 10 : 0,
          call: hand ? hand.limpCheckPctX10 / 10 : 0,
          raise: hand ? hand.raisePctX10 / 10 : 0,
          allin: hand?.bucket?.toLowerCase().includes("jam") ? (hand.raisePctX10 / 10) : 0,
          limp: hand?.bucket?.toLowerCase().includes("limp") ? (hand.limpCheckPctX10 / 10) : 0,
        };

        const bestAction: keyof MatrixActions = actions.raise >= actions.call && actions.raise >= actions.fold
          ? "raise"
          : actions.call >= actions.fold
            ? "call"
            : "fold";

        const visible = handGroupMatch(normalizedCode, handGroupFilter, actions);

        return {
          code: normalizedCode,
          label: formatHandLabel(normalizedCode),
          hand,
          actions,
          bestAction,
          visible,
          combos: rowIndex === colIndex ? 6 : rowIndex < colIndex ? 4 : 12,
        };
      }),
    );
  }, [handGroupFilter, handMap]);

  const selectedCell = useMemo(() => {
    const normalized = normalizeHandCode(selectedHandCode);
    return matrixCells.flat().find((cell) => cell.code === normalized) || null;
  }, [matrixCells, selectedHandCode]);

  const selectedActionBars = selectedCell?.actions || { fold: 0, call: 0, raise: 0, allin: 0, limp: 0 };

  const selectedSolutionIndex = useMemo(() => {
    if (!selectedSolution) return -1;
    return filteredSolutions.findIndex((solution) => solution.solutionId === selectedSolution.solutionId);
  }, [filteredSolutions, selectedSolution]);

  const heroPositionKey = String(selectedSolution?.heroPosition || "").toUpperCase();
  const villainPositionKey = String(selectedSolution?.villainPosition || "").toUpperCase();

  const evProxy = useMemo(() => {
    if (!selectedCell) return { raise: 0, call: 0, fold: 0, best: 0 };
    const raise = Number((selectedCell.actions.raise / 100).toFixed(3));
    const call = Number((selectedCell.actions.call / 120).toFixed(3));
    const fold = 0;
    const best = Math.max(raise, call, fold);
    return { raise, call, fold, best };
  }, [selectedCell]);

  const stripContext = selectedSolution ?? filteredSolutions[0] ?? librarySolutions[0] ?? null;

  // Villain-first spot resolution
  const resolvedVillainSpot = useMemo(() => {
    const stackNum = Number(builderStack.replace(/[^\d.]/g, ""));
    const villainSizeNum = builderVillainSize ? Number(builderVillainSize) : undefined;
    const spotKey = buildSpotFromVillainAction({
      gameType: "tournament",
      format: builderFormat,
      stackDepth: stackNum,
      heroPosition: builderHero,
      villainPosition: builderVillain,
      villainAction: builderVillainAction,
      villainSize: villainSizeNum && Number.isFinite(villainSizeNum) ? villainSizeNum : undefined,
    });

    const villainActionType = normalizeStrategicActionType(builderVillainAction);
    const match = librarySolutions.find((s) => {
      const heroMatch = normalizePositionLabel(s.heroPosition).toUpperCase() === builderHero.toUpperCase();
      const villainMatch = normalizePositionLabel(s.villainPosition).toUpperCase() === builderVillain.toUpperCase();
      const actionMatch = normalizeStrategicActionType(s.previousAction) === villainActionType ||
        (villainActionType === "raise" && normalizeStrategicActionType(s.previousAction) === "raise");
      const stackMatch = stackNum <= 0 || s.stack === `${stackNum}bb`;
      return heroMatch && villainMatch && actionMatch && stackMatch;
    });

    return { spotKey, match };
  }, [builderHero, builderVillain, builderVillainAction, builderVillainSize, builderStack, builderFormat, librarySolutions]);

  const stripSolutions = useMemo(() => {
    if (!stripContext) return [];

    const stackTarget = stack !== "all" ? stack : stripContext.stack;

    return librarySolutions.filter((solution) => {
      if (modality !== "all" && solution.modality !== modality) return false;
      if (format !== "all" && solution.format !== format) return false;
      if (players !== "all" && solution.players !== players) return false;
      if (stackTarget !== "all" && solution.stack !== stackTarget) return false;
      return true;
    });
  }, [format, librarySolutions, modality, players, stack, stripContext]);

  const actionEngineByPosition = useMemo(() => {
    const map = new Map<string, {
      nodeId: string;
      actions: Array<{
        actionId: string;
        actionType: StrategicActionType;
        sizing: string;
        frequency: number;
        ev: number;
        nextNodeId: string;
        nextSpotKey: string;
        nextSolutionId: string;
        actorPosition: string;
        label: string;
      }>;
    }>();

    TABLE_POSITIONS.forEach((position) => {
      const scoped = stripSolutions.filter((solution) => normalizePositionLabel(solution.heroPosition) === position);
      const total = scoped.length || 1;
      const grouped = new Map<string, {
        actionType: StrategicActionType;
        representative: (typeof stripSolutions)[number];
        count: number;
      }>();

      scoped.forEach((solution) => {
        const actionType = normalizeStrategicActionType(solution.previousAction);
        const key = `${actionType}:${solution.sizing}`;
        const current = grouped.get(key);
        if (!current) {
          grouped.set(key, { actionType, representative: solution, count: 1 });
          return;
        }

        const shouldPrefer = current.representative.solutionId !== selectedSolutionId && solution.solutionId === selectedSolutionId;
        grouped.set(key, {
          actionType,
          representative: shouldPrefer ? solution : current.representative,
          count: current.count + 1,
        });
      });

      const actions = Array.from(grouped.values())
        .map((entry) => {
          const solution = entry.representative;
          const stackBb = Number(solution.effectiveStackBb || 0);
          const label = buildStrategicActionLabel(entry.actionType, solution.sizing, stackBb);
          const descriptor = descriptorBySolutionId.get(solution.solutionId);

          return {
            actionId: `${position}:${entry.actionType}:${solution.sizing}`,
            actionType: entry.actionType,
            sizing: solution.sizing,
            frequency: Number(((entry.count / total) * 100).toFixed(1)),
            ev: actionEvProxy(entry.actionType, stackBb),
            nextNodeId: `node:${normalizePositionLabel(solution.heroPosition)}:${entry.actionType}:${solution.solutionId}`,
            nextSpotKey: descriptor?.spotKey ?? "",
            nextSolutionId: solution.solutionId,
            actorPosition: position,
            label,
          };
        })
        .sort((left, right) => right.frequency - left.frequency);

      map.set(position, {
        nodeId: `node:${position}:${stripContext?.stack ?? "unknown"}`,
        actions,
      });
    });

    return map;
  }, [descriptorBySolutionId, selectedSolutionId, stripContext?.stack, stripSolutions]);

  const solutionsByHeroPosition = useMemo(() => {
    const map = new Map<string, {
      preferred: (typeof stripSolutions)[number] | null;
      count: number;
      villains: string[];
      actions: string[];
      sizings: string[];
      stackBb: number;
    }>();

    stripSolutions.forEach((solution) => {
      const key = normalizePositionLabel(solution.heroPosition);
      const current = map.get(key) ?? {
        preferred: null,
        count: 0,
        villains: [],
        actions: [],
        sizings: [],
        stackBb: Number(solution.effectiveStackBb || 0),
      };

      current.count += 1;
      current.villains.push(normalizePositionLabel(solution.villainPosition));
      current.actions.push(solution.previousAction);
      current.sizings.push(solution.sizing);
      current.stackBb = Number(solution.effectiveStackBb || current.stackBb || 0);

      if (!current.preferred || solution.solutionId === selectedSolutionId) {
        current.preferred = solution;
      }

      map.set(key, current);
    });

    return map;
  }, [selectedSolutionId, stripSolutions]);

  const topPositionCards = useMemo(() => {
    const fallbackStackBb = Number(stripContext?.effectiveStackBb || 0);

    return TABLE_POSITIONS.map((position) => {
      const summary = solutionsByHeroPosition.get(position);
      const matchingSolution = summary?.preferred ?? null;
      const stackBb = summary?.stackBb ?? fallbackStackBb;
      const isHero = position === heroPositionKey;
      const isVillain = position === villainPositionKey;
      const actionNode = actionEngineByPosition.get(position);

      return {
        position,
        isHero,
        isVillain,
        isSelected: matchingSolution?.solutionId === selectedSolutionId,
        isAvailable: Boolean(matchingSolution),
        stackBb,
        summary,
        solution: matchingSolution,
        nodeId: actionNode?.nodeId ?? null,
        actionEdges: actionNode?.actions ?? [],
      };
    });
  }, [actionEngineByPosition, heroPositionKey, selectedSolutionId, solutionsByHeroPosition, stripContext, villainPositionKey]);

  const topPositionCardsMap = useMemo(
    () => new Map(topPositionCards.map((card) => [card.position, card])),
    [topPositionCards],
  );

  useEffect(() => {
    const normalizedHero = normalizePositionLabel(heroPositionKey);
    if ((TABLE_POSITIONS as readonly string[]).includes(normalizedHero)) {
      setActiveTablePosition(normalizedHero as (typeof TABLE_POSITIONS)[number]);
    }
  }, [heroPositionKey]);

  const tableState = useMemo(() => {
    return {
      activePosition: activeTablePosition ?? (normalizePositionLabel(heroPositionKey) as (typeof TABLE_POSITIONS)[number] | null),
      facingAction: selectedSolution?.previousAction ?? "Open",
      stackDepth: Number(selectedSolution?.effectiveStackBb ?? 0),
      format: selectedSolution?.format ?? "ChipEV",
    };
  }, [activeTablePosition, heroPositionKey, selectedSolution]);

  const handleTableSeatClick = (visualPosition: (typeof TABLE_VISUAL_POSITIONS)[number]) => {
    const mappedPosition = TABLE_INTERACTIVE_POSITION_MAP[visualPosition];
    if (!mappedPosition) return;
    const card = topPositionCardsMap.get(mappedPosition);
    if (!card?.solution) return;

    setActiveTablePosition(mappedPosition);
    navigateToSolution(card.solution.solutionId);
  };

  const actionCards = useMemo(() => {
    const combos = selectedCell?.combos ?? 0;
    const comboEstimate = (pct: number) => {
      if (!combos) return "0 combos";
      return `${((combos * pct) / 100).toFixed(1)} combos`;
    };

    return [
      {
        key: "allin" as const,
        title: `All-in ${selectedSolution ? formatBb(selectedSolution.effectiveStackBb) : "--"}`,
        pct: selectedActionBars.allin,
        subtitle: "Jam maximo da estrategia.",
        metric: comboEstimate(selectedActionBars.allin),
      },
      {
        key: "raise" as const,
        title: selectedSolution?.sizing ? `Raise ${selectedSolution.sizing}` : "Raise",
        pct: selectedActionBars.raise,
        subtitle: "Agressao principal da range.",
        metric: comboEstimate(selectedActionBars.raise),
      },
      {
        key: "call" as const,
        title: "Call",
        pct: selectedActionBars.call,
        subtitle: "Linha mista de realizacao.",
        metric: comboEstimate(selectedActionBars.call),
      },
      {
        key: "fold" as const,
        title: "Fold",
        pct: selectedActionBars.fold,
        subtitle: "Fallback de EV da mao.",
        metric: comboEstimate(selectedActionBars.fold),
      },
    ];
  }, [selectedActionBars, selectedCell?.combos, selectedSolution]);

  useEffect(() => {
    const node = matrixViewportRef.current;
    if (!node) return;

    let frame = 0;

    const updateSize = () => {
      cancelAnimationFrame(frame);
      frame = requestAnimationFrame(() => {
        const availableHeight = Math.max(0, node.clientHeight - 8);
        const availableWidth = Math.max(0, node.clientWidth - MATRIX_LEGEND_WIDTH - MATRIX_LEGEND_GAP - 8);
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

  const loading = loadingScenarios || loadingScenarioData;

  return (
    <div className="flex h-full min-h-0 w-full flex-col gap-2 text-white">
      <main className="min-h-0 flex-1 overflow-hidden rounded-2xl border border-white/8 bg-[#0a1023] p-2">
        <div className="grid h-full min-h-0 gap-3 xl:grid-cols-[minmax(0,1.18fr)_minmax(300px,336px)]">
          <section className="flex min-h-0 flex-col overflow-hidden rounded-2xl border border-white/8 bg-[#0f172b] shadow-[inset_0_1px_0_rgba(255,255,255,0.03)]">
            <div className="border-b border-white/6 px-2 py-1.5">
              <div className="flex flex-wrap items-center justify-between gap-3">
                <div className="flex gap-3 text-[11px] text-white/44">
                  <button className="font-semibold text-white">estrategia</button>
                  <button>ranges</button>
                  <button>detalhamento</button>
                  <button>relatórios</button>
                </div>

                <div className="flex flex-wrap items-center gap-2 text-[10px]">
                  <select
                    className="rounded-md border border-white/8 bg-[#0a1222]/85 px-2 py-1"
                    value={handGroupFilter}
                    onChange={(e) => setHandGroupFilter(e.target.value as HandGroupFilter)}
                  >
                    <option value="all">Todas as maos</option>
                    <option value="broadways">Broadways</option>
                    <option value="suited_connectors">Suited connectors</option>
                    <option value="pocket_pairs">Pocket pairs</option>
                    <option value="ax_suited">Ax suited</option>
                    <option value="bluff_candidates">Bluff candidates</option>
                    <option value="jam_hands">Jam hands</option>
                    <option value="pure_raises">Pure raises</option>
                    <option value="mixed_hands">Mixed hands</option>
                  </select>
                </div>
              </div>

              <div className="mt-1.5 flex flex-wrap items-center gap-1.5 text-[10px]">
                <button
                  type="button"
                  onClick={() => handleHistoryNavigation(-1)}
                  disabled={!canGoBack}
                  className={`rounded-md border px-2 py-1 transition ${canGoBack
                    ? "border-white/15 bg-white/[0.03] text-white/80 hover:border-white/25"
                    : "border-white/8 bg-white/[0.015] text-white/35"}`}
                >
                  voltar
                </button>
                <button
                  type="button"
                  onClick={() => handleHistoryNavigation(1)}
                  disabled={!canGoForward}
                  className={`rounded-md border px-2 py-1 transition ${canGoForward
                    ? "border-white/15 bg-white/[0.03] text-white/80 hover:border-white/25"
                    : "border-white/8 bg-white/[0.015] text-white/35"}`}
                >
                  avancar
                </button>
                <div className="flex min-w-0 flex-1 items-center gap-1 overflow-x-auto rounded-md border border-white/8 bg-[#0b1225] px-2 py-1 text-white/60">
                  {breadcrumbPath.length ? breadcrumbPath.map((item) => (
                    <button
                      key={item.solutionId}
                      type="button"
                      onClick={() => navigateToSolution(item.solutionId)}
                      className={`whitespace-nowrap rounded px-1.5 py-0.5 transition ${item.active
                        ? "bg-cyan-500/12 text-cyan-100"
                        : "text-white/62 hover:text-white/84"}`}
                    >
                      {item.label}
                    </button>
                  )) : <span>sem path ainda</span>}
                </div>
              </div>

              <div className="mt-1 flex flex-wrap items-center gap-2 text-[10px]">
                <div className="rounded-md border border-white/8 bg-[#0b1225] px-2 py-1 text-white/65">
                  spot_key: <span className="text-cyan-100">{currentResolvedSpot.spotKey}</span>
                </div>
                {spotEngineNotice ? (
                  <div className="rounded-md border border-amber-300/30 bg-amber-500/10 px-2 py-1 text-amber-100/90">
                    {spotEngineNotice}
                  </div>
                ) : null}
                {!currentResolvedSpot.descriptor && !spotEngineNotice ? (
                  <div className="rounded-md border border-rose-300/25 bg-rose-500/10 px-2 py-1 text-rose-100/90">
                    sem solucao cadastrada para o spot atual
                  </div>
                ) : null}
              </div>

              <div className="mt-1.5 flex gap-1.5 overflow-x-auto pb-1">
                <button
                  type="button"
                  className={`min-w-[188px] shrink-0 rounded-xl border px-3 py-2 text-left transition ${isSpotMenuOpen
                    ? "border-cyan-300/45 bg-cyan-500/10"
                    : "border-white/8 bg-[#151c2d] hover:border-white/16 hover:bg-[#192033]"}`}
                  onClick={() => setIsSpotMenuOpen((open) => !open)}
                  aria-expanded={isSpotMenuOpen}
                >
                  <div className="flex items-start justify-between gap-3">
                    <div>
                      <div className="text-[10px] uppercase tracking-[0.2em] text-white/38">Contexto</div>
                      <div className="mt-1 text-[12px] font-semibold leading-4 text-white/90">
                        {stripContext?.modality ?? "HU"}
                        <span className="ml-1 text-white/52">Avg. {stripContext?.stack ?? "--"}</span>
                      </div>
                      <div className="mt-1 text-[10px] text-white/58">{stripContext?.previousAction ?? "Open"}</div>
                      <div className="mt-1 text-[10px] text-white/42">Solver • {stripContext?.format ?? "ChipEV"}</div>
                    </div>
                    <div className={`mt-0.5 flex h-8 w-8 items-center justify-center rounded-lg border ${isSpotMenuOpen
                      ? "border-cyan-300/35 bg-cyan-500/12 text-cyan-100"
                      : "border-white/8 bg-[#12192a] text-white/62"}`}>
                      <svg viewBox="0 0 20 20" fill="none" className="h-4 w-4" aria-hidden="true">
                        <path d="M10 2.75 11.1 4.4c.17.25.47.4.78.39l1.97-.08.62 1.73-1.54 1.21a.98.98 0 0 0-.35.8l.15 1.96-1.57.79-1.27-1.5a.98.98 0 0 0-.75-.35.98.98 0 0 0-.75.35l-1.27 1.5-1.57-.79.15-1.96a.98.98 0 0 0-.35-.8L3.71 6.44l.62-1.73 1.97.08c.31.01.61-.14.78-.39L8.18 2.75h1.82Z" stroke="currentColor" strokeWidth="1.2" strokeLinejoin="round"/>
                        <circle cx="10" cy="10" r="2.2" stroke="currentColor" strokeWidth="1.2"/>
                      </svg>
                    </div>
                  </div>
                </button>
                {topPositionCards.map((card) => (
                  <div
                    key={card.position}
                    role={card.solution ? "button" : undefined}
                    tabIndex={card.solution ? 0 : -1}
                    onClick={() => {
                      if (!card.solution) return;
                      navigateToSolution(card.solution.solutionId, { allowToggleClear: true });
                    }}
                    onKeyDown={(event) => {
                      if (!card.solution) return;
                      if (event.key !== "Enter" && event.key !== " ") return;
                      event.preventDefault();
                      navigateToSolution(card.solution.solutionId, { allowToggleClear: true });
                    }}
                    className={`min-w-[122px] rounded-lg border px-2 py-1.5 text-left transition-all ${card.isSelected
                      ? "border-cyan-300/55 bg-[#192132]"
                      : card.isHero
                        ? "border-cyan-400/30 bg-[#192132]"
                        : card.isVillain
                          ? "border-emerald-300/34 bg-[#192132]"
                          : "border-white/8 bg-[#151c2d] hover:border-white/16 hover:bg-[#192033]"} ${card.solution ? "cursor-pointer" : "cursor-not-allowed opacity-45"}`}
                  >
                    <div className={`flex items-center justify-between gap-2 text-[10px] font-semibold uppercase tracking-wide ${card.isSelected ? "text-cyan-300" : "text-white/68"}`}>
                      <span>{card.position}</span>
                      <span className={card.isSelected ? "text-cyan-200" : "text-white/50"}>{card.stackBb > 0 ? formatBb(card.stackBb) : "--"}</span>
                    </div>
                    {card.solution ? (
                      <div className="mt-1.5 space-y-1">
                        <div className="text-[10px] text-white/52">
                          node: <span className="text-white/78">{card.nodeId ?? "--"}</span>
                        </div>
                        {(card.actionEdges.length ? card.actionEdges : []).slice(0, 3).map((edge) => (
                          <button
                            key={edge.actionId}
                            type="button"
                            onClick={(event) => {
                              event.stopPropagation();
                              goToNextSpot(edge);
                            }}
                            className="flex w-full items-center justify-between rounded-md border border-white/10 bg-white/[0.025] px-1.5 py-1 text-[10px] text-white/80 transition hover:border-cyan-300/35 hover:bg-cyan-500/10"
                            title={`${edge.nextNodeId} • ${edge.nextSpotKey || "sem-chave"} • EV ${edge.ev.toFixed(3)}`}
                          >
                            <span>{edge.label}</span>
                            <span className="text-white/55">{edge.frequency.toFixed(0)}%</span>
                          </button>
                        ))}
                        {!card.actionEdges.length && (
                          <div className="rounded-md border border-dashed border-white/10 px-1.5 py-1 text-[10px] text-white/42">
                            Sem acoes nesse node
                          </div>
                        )}
                      </div>
                    ) : (
                      <div className="mt-2 text-[10px] leading-4 text-rose-200/88">
                        Sem informacoes no banco para esse spot ainda.
                      </div>
                    )}
                  </div>
                ))}
              </div>

              {isSpotMenuOpen ? (
                <div className="mt-2 space-y-3 rounded-2xl border border-white/8 bg-[#0b1020]/95 p-2.5">
                  <div className="overflow-hidden rounded-2xl border border-white/8 bg-[#0f172b]">
                    <div className="flex items-center justify-between gap-3 border-b border-white/8 px-3 py-2">
                      <div>
                        <div className="text-[10px] uppercase tracking-[0.28em] text-white/38">Contexto do spot</div>
                        <div className="mt-1 text-sm font-semibold text-white/92">Selecione o spot direto na grade</div>
                      </div>
                      <div className="rounded-full border border-white/8 bg-white/[0.035] px-3 py-1 text-[11px] text-white/58">
                        {filteredSolutions.length} spot{filteredSolutions.length === 1 ? "" : "s"}
                      </div>
                    </div>

                    <div className="overflow-x-auto p-2">
                      <div className="min-w-[980px] space-y-1">
                        <div className="grid grid-cols-[minmax(220px,1.4fr)_60px_repeat(8,minmax(56px,1fr))] gap-1 px-1 text-[10px] font-semibold uppercase tracking-[0.2em] text-white/36">
                          <div>Abertura</div>
                          <div className="text-center">Avg</div>
                          {TABLE_POSITIONS.map((position) => (
                            <div key={position} className="text-center">{position}</div>
                          ))}
                        </div>

                        {filteredSolutions.map((solution) => {
                          const selected = solution.solutionId === selectedSolutionId;
                          const normalizedHero = normalizePositionLabel(solution.heroPosition);
                          const normalizedVillain = normalizePositionLabel(solution.villainPosition);
                          const rawStack = Number.parseFloat(String(solution.stack).replace(/[^\d.]/g, ""));
                          const displayStack = Number.isFinite(rawStack) ? formatBb(rawStack) : "--";

                          return (
                            <button
                              key={solution.solutionId}
                              type="button"
                              className={`grid w-full grid-cols-[minmax(220px,1.4fr)_60px_repeat(8,minmax(56px,1fr))] gap-1 rounded-xl border p-1 text-left transition-all ${selected
                                ? "border-cyan-300/55 bg-cyan-500/12 shadow-[0_0_0_1px_rgba(34,211,238,0.12)]"
                                : "border-white/8 bg-[#1a1f2a] hover:border-white/18 hover:bg-[#202636]"}`}
                              onClick={() => {
                                navigateToSolution(solution.solutionId, { allowToggleClear: true });
                              }}
                            >
                              <div className="px-2 py-1.5">
                                <div className="text-[12px] font-semibold text-white/92">{solution.previousAction}</div>
                                <div className="mt-0.5 text-[10px] text-white/56">{solution.heroPosition} vs {solution.villainPosition} • {solution.modality} • {solution.format}</div>
                              </div>

                              <div className="flex items-center justify-center px-1 text-[12px] font-semibold text-white/86">
                                {displayStack}
                              </div>

                              {TABLE_POSITIONS.map((position) => {
                                const isHeroCell = position === normalizedHero;
                                const isVillainCell = position === normalizedVillain;
                                const cellValue = isHeroCell || isVillainCell ? displayStack : "-";

                                return (
                                  <div
                                    key={`${solution.solutionId}-${position}`}
                                    className={`flex min-h-[40px] items-center justify-center rounded-md border text-center text-[12px] font-semibold ${isHeroCell
                                      ? "border-cyan-300/45 bg-cyan-500/12 text-cyan-50"
                                      : isVillainCell
                                        ? "border-emerald-300/42 bg-emerald-500/12 text-emerald-50"
                                        : "border-white/6 bg-[#141924] text-white/30"}`}
                                  >
                                    {cellValue}
                                  </div>
                                );
                              })}
                            </button>
                          );
                        })}

                        {!filteredSolutions.length && (
                          <div className="rounded-2xl border border-dashed border-amber-300/25 bg-amber-500/8 px-4 py-3 text-sm text-amber-50/80">
                            Nenhum spot encontrado para essa combinacao de filtros.
                          </div>
                        )}
                      </div>
                    </div>
                  </div>
                </div>
              ) : null}

            </div>

            <div ref={matrixViewportRef} className="flex min-h-0 flex-1 items-start justify-start overflow-hidden p-3">
              {loading ? (
                <div className="flex h-full items-center justify-center text-sm text-white/70">Carregando solucao...</div>
              ) : (
                <div className="flex h-full items-start gap-3">
                  <div
                    className="relative shrink-0 rounded-2xl border border-white/8 bg-[#0b1222] p-2 shadow-[inset_0_1px_0_rgba(255,255,255,0.04)] transition-[width,height] duration-200"
                    style={{
                      width: matrixSize > 0 ? `${Math.round(matrixSize * MATRIX_WIDTH_RATIO)}px` : "100%",
                      height: matrixSize > 0 ? `${matrixSize}px` : "100%",
                    }}
                  >
                    <div className="absolute right-2 top-2 z-30">
                      <button
                        type="button"
                        onClick={() => setIsMatrixStyleMenuOpen((open) => !open)}
                        className="flex h-7 w-7 items-center justify-center rounded-md border border-white/15 bg-[#101a31]/95 text-white/80 transition hover:border-cyan-300/45 hover:text-cyan-100"
                        title="Configurar visual da matriz"
                        aria-label="Configurar visual da matriz"
                        aria-expanded={isMatrixStyleMenuOpen}
                      >
                        <svg viewBox="0 0 20 20" fill="none" className="h-4 w-4" aria-hidden="true">
                          <path d="M10 2.75 11.1 4.4c.17.25.47.4.78.39l1.97-.08.62 1.73-1.54 1.21a.98.98 0 0 0-.35.8l.15 1.96-1.57.79-1.27-1.5a.98.98 0 0 0-.75-.35.98.98 0 0 0-.75.35l-1.27 1.5-1.57-.79.15-1.96a.98.98 0 0 0-.35-.8L3.71 6.44l.62-1.73 1.97.08c.31.01.61-.14.78-.39L8.18 2.75h1.82Z" stroke="currentColor" strokeWidth="1.2" strokeLinejoin="round"/>
                          <circle cx="10" cy="10" r="2.2" stroke="currentColor" strokeWidth="1.2"/>
                        </svg>
                      </button>

                      {isMatrixStyleMenuOpen ? (
                        <div className="absolute right-0 top-8 w-60 space-y-2 rounded-xl border border-white/15 bg-[#0a1222]/98 p-2 text-[10px] shadow-[0_12px_30px_rgba(0,0,0,0.45)]">
                          <div className="text-[10px] font-semibold uppercase tracking-[0.2em] text-white/45">Visual da matriz</div>

                          <div className="space-y-1">
                            <div className="text-white/60">Orientacao</div>
                            <select
                              className="w-full rounded-md border border-white/10 bg-[#101a31] px-2 py-1 text-white/90"
                              value={matrixBarOrientation}
                              onChange={(e) => setMatrixBarOrientation(e.target.value as MatrixBarOrientation)}
                            >
                              <option value="diagonal">Inclinada</option>
                              <option value="vertical">Vertical</option>
                              <option value="horizontal">Horizontal</option>
                            </select>
                          </div>

                          <div className="space-y-1">
                            <div className="text-white/60">Posicao da barra</div>
                            <select
                              className="w-full rounded-md border border-white/10 bg-[#101a31] px-2 py-1 text-white/90"
                              value={matrixBarPosition}
                              onChange={(e) => setMatrixBarPosition(e.target.value as MatrixBarPosition)}
                            >
                              <option value="normal">Normal</option>
                              <option value="reverse">Invertida</option>
                            </select>
                          </div>

                          <div className="grid grid-cols-2 gap-1">
                            {([
                              ["raise", "Raise"],
                              ["call", "Call"],
                              ["fold", "Fold"],
                              ["allin", "All-in"],
                            ] as Array<[keyof MatrixActions, string]>).map(([key, label]) => (
                              <label key={key} className="flex items-center justify-between gap-1 rounded-md border border-white/10 bg-white/[0.02] px-1.5 py-1 text-white/75">
                                <span className="text-[9px] uppercase tracking-wide text-white/55">{label}</span>
                                <input
                                  type="color"
                                  value={matrixActionColors[key]}
                                  onChange={(e) => setMatrixActionColors((prev) => ({ ...prev, [key]: e.target.value }))}
                                  className="h-4 w-5 cursor-pointer rounded border border-white/25 bg-transparent p-0"
                                  aria-label={`Cor de ${label}`}
                                />
                              </label>
                            ))}
                          </div>
                        </div>
                      ) : null}
                    </div>

                    <div className="grid h-full w-full grid-cols-13 gap-[2px]">
                      {matrixCells.flat().map((cell) => {
                        const selected = normalizeHandCode(selectedHandCode) === cell.code;
                        const gradient = buildMatrixGradient(
                          cell.actions,
                          matrixActionColors,
                          matrixBarOrientation,
                          matrixBarPosition,
                        );
                        const muted = !cell.visible;
                        const explainer = cell.bestAction === "raise"
                          ? "Preferido como agressao por EV e pressao na range adversaria."
                          : cell.bestAction === "call"
                            ? "Linha mista para proteger range e realizar equidade."
                            : "Principalmente fold por EV relativo inferior.";

                        return (
                          <button
                            key={cell.code}
                            className={`group relative border text-[10px] font-bold transition-all ${selected
                              ? "z-10 border-cyan-200 ring-1 ring-cyan-300/70"
                              : "border-slate-700/60 hover:border-cyan-200/55"} ${muted ? "opacity-18" : "opacity-100"}`}
                            style={{ background: gradient }}
                            onClick={() => setSelectedHandCode(cell.code)}
                          >
                            <span className="pointer-events-none text-white drop-shadow-[0_1px_1px_rgba(0,0,0,0.9)]">{cell.label}</span>

                            <div className="pointer-events-none absolute -top-1 left-1/2 z-20 hidden w-56 -translate-x-1/2 -translate-y-full border border-white/15 bg-slate-950/95 p-2 text-left text-[10px] text-white shadow-[0_10px_22px_rgba(0,0,0,0.45)] group-hover:block">
                              <div className="font-semibold text-cyan-100">{cell.label}</div>
                              <div className="mt-1">Raise: {cell.actions.raise.toFixed(1)}%</div>
                              <div>Call: {cell.actions.call.toFixed(1)}%</div>
                              <div>Fold: {cell.actions.fold.toFixed(1)}%</div>
                              <div>All-in: {cell.actions.allin.toFixed(1)}%</div>
                              <div className="mt-1">EV Raise: {cell.actions.raise > 0 ? `+${(cell.actions.raise / 100).toFixed(2)}` : "--"}</div>
                              <div>EV Call: {cell.actions.call > 0 ? `+${(cell.actions.call / 120).toFixed(2)}` : "--"}</div>
                              <div>EV Fold: 0.00</div>
                              <div className="mt-1 font-semibold text-emerald-100">Melhor acao: {cell.bestAction.toUpperCase()}</div>
                              <div className="mt-1 text-white/75">{explainer}</div>
                            </div>
                          </button>
                        );
                      })}
                    </div>
                  </div>

                  <div className="flex w-[112px] shrink-0 flex-col gap-2 rounded-2xl border border-white/8 bg-[#0b1222] p-2 text-[10px] text-white/60">
                    <div className="text-[10px] font-semibold uppercase tracking-[0.2em] text-white/40">Legenda</div>
                    {([
                      ["Raise", matrixActionColors.raise],
                      ["Call", matrixActionColors.call],
                      ["Fold", matrixActionColors.fold],
                      ["All-in", matrixActionColors.allin],
                    ] as Array<[string, string]>).map(([lbl, color]) => (
                      <div key={lbl} className="flex items-center gap-2 rounded-lg border border-white/6 bg-white/[0.02] px-2 py-1.5">
                        <span className="inline-block h-2 w-2 flex-shrink-0 rounded-full" style={{ background: color, boxShadow: `0 0 4px ${color}` }} />
                        <span>{lbl}</span>
                      </div>
                    ))}
                  </div>
                </div>
              )}
            </div>
          </section>

          <aside className="flex min-h-0 flex-col gap-2.5 overflow-auto">
            <div className="rounded-2xl border border-white/8 bg-[#0f172b] p-2.5">
              <div className="grid grid-cols-3 gap-1 rounded-xl border border-white/8 bg-[#0b1225] p-1 text-[11px]">
                {([
                  ["overview", "Overview"],
                  ["table", "Table"],
                  ["equity", "Equity chart"],
                ] as const).map(([key, label]) => (
                  <button
                    key={key}
                    type="button"
                    onClick={() => setInspectorTab(key)}
                    className={`rounded-lg px-2 py-1.5 text-center transition ${inspectorTab === key
                      ? "bg-cyan-500/10 text-cyan-100 shadow-[inset_0_0_0_1px_rgba(34,211,238,0.16)]"
                      : "text-white/55 hover:bg-white/5 hover:text-white/80"}`}
                  >
                    {label}
                  </button>
                ))}
              </div>

              <div className="mt-2 flex items-start justify-between gap-3 rounded-xl border border-white/8 bg-[#0b1225] p-2.5 text-[11px] text-white/60">
                <div>
                  <div className="uppercase tracking-[0.3em]">{heroPositionKey || "SB"} vs {villainPositionKey || "BB"}</div>
                  <div className="mt-1 text-sm font-semibold text-white/92">
                    {selectedSolution ? sanitizeScenarioTitle(selectedSolution.title) : "Spot sem informacoes completas"}
                  </div>
                  <div className="mt-2 grid grid-cols-2 gap-x-4 gap-y-1 text-[11px]">
                    <div className="text-white/45">Stack</div>
                    <div className="text-white/88">{selectedSolution?.stack ?? "--"}</div>
                    <div className="text-white/45">Acao previa</div>
                    <div className="text-white/88">{selectedSolution?.previousAction ?? "--"}</div>
                    <div className="text-white/45">Sizing</div>
                    <div className="text-white/88">{selectedSolution?.sizing ?? "--"}</div>
                  </div>
                </div>
                <div className="rounded-xl border border-white/8 bg-white/[0.03] px-3 py-2 text-right">
                  <div>{tableState.activePosition ?? "--"}</div>
                  <div className="mt-1 text-lg font-semibold text-white">{evProxy.best.toFixed(2)}</div>
                </div>
              </div>

              {inspectorTab === "table" ? (
              <div className="relative mt-2 h-[208px] rounded-xl border border-white/8 bg-[radial-gradient(circle_at_center,rgba(30,41,59,0.82),rgba(15,23,42,0.97))]">
                {tableState.activePosition ? (
                  <div className="pointer-events-none absolute left-1/2 top-[44%] h-20 w-20 -translate-x-1/2 -translate-y-1/2 rounded-full bg-cyan-400/10 blur-2xl" />
                ) : null}
                <div
                  className="absolute -translate-x-1/2 -translate-y-1/2 rounded-[999px] border border-white/10"
                  style={{
                    left: `${TABLE_GEOMETRY.centerX}%`,
                    top: `${TABLE_GEOMETRY.centerY}%`,
                    width: `${TABLE_GEOMETRY.feltRadiusX * 2}%`,
                    height: `${TABLE_GEOMETRY.feltRadiusY * 2}%`,
                  }}
                />
                {TABLE_SEAT_LAYOUT.map((seat) => {
                  const position = seat.position;
                  const mappedPosition = TABLE_INTERACTIVE_POSITION_MAP[position];
                  const mappedCard = mappedPosition ? topPositionCardsMap.get(mappedPosition) : null;
                  const isInteractive = Boolean(mappedPosition && mappedCard?.solution);
                  const isActive = Boolean(mappedPosition && mappedPosition === tableState.activePosition);
                  const isHero = position === heroPositionKey;
                  const isVillain = position === villainPositionKey;

                  return (
                    <React.Fragment key={position}>
                      <button
                        type="button"
                        disabled={!isInteractive}
                        onClick={() => handleTableSeatClick(position)}
                        className={`absolute -translate-x-1/2 -translate-y-1/2 transition-all duration-200 ${isInteractive ? "cursor-pointer hover:scale-105" : "cursor-default opacity-70"}`}
                        style={{ left: seat.left, top: seat.top }}
                      >
                        <div
                          className={`flex h-8 w-8 items-center justify-center rounded-full border text-[9px] font-semibold ${isActive
                            ? "border-cyan-200 bg-cyan-500/20 text-cyan-50 shadow-[0_0_0_2px_rgba(34,211,238,0.22)]"
                            : isHero
                            ? "border-emerald-300/60 bg-emerald-500/15 text-emerald-50"
                            : isVillain
                              ? "border-cyan-300/50 bg-cyan-500/12 text-cyan-50"
                              : "border-white/10 bg-[#0f172a] text-white/45"}`}
                          style={{ transform: `scale(${seat.scale})` }}
                        >
                          {position}
                        </div>
                      </button>
                      <div
                        className="absolute -translate-x-1/2 -translate-y-1/2 text-center text-[10px] text-white/45"
                        style={{ left: seat.stackLeft, top: seat.stackTop }}
                      >
                        {isHero || isVillain ? `${selectedSolution?.effectiveStackBb ?? 0}` : "200"}
                      </div>
                    </React.Fragment>
                  );
                })}

                <div
                  className="absolute -translate-x-1/2 -translate-y-1/2 text-xs text-cyan-200"
                  style={{ left: TABLE_ACTION_LAYOUT.sb.left, top: TABLE_ACTION_LAYOUT.sb.top }}
                >
                  0.5
                </div>
                <div
                  className="absolute -translate-x-1/2 -translate-y-1/2 text-center text-white"
                  style={{ left: TABLE_ACTION_LAYOUT.pot.left, top: TABLE_ACTION_LAYOUT.pot.top }}
                >
                  <div className="text-lg font-bold">1.5 bb</div>
                  <div className="text-xs text-white/45">pot inicial</div>
                </div>
                <div
                  className="absolute -translate-x-1/2 -translate-y-1/2 text-sm font-semibold text-cyan-200"
                  style={{ left: TABLE_ACTION_LAYOUT.bb.left, top: TABLE_ACTION_LAYOUT.bb.top }}
                >
                  1
                </div>
              </div>
              ) : null}
            </div>

            {inspectorTab === "equity" ? (
            <div className="grid grid-cols-2 gap-2">
              {actionCards.map((card) => (
                <div key={card.key} className="rounded-xl border border-white/8 bg-[#0f172b] p-2.5">
                  <div className="text-[11px] font-semibold leading-4 text-white">{card.title}</div>
                  <div className="mt-2 text-2xl font-bold text-white">{card.pct.toFixed(1)}%</div>
                  <div className="mt-1 text-[10px] text-white/45">{card.metric}</div>
                  <div className="mt-2 h-1.5 overflow-hidden rounded-full bg-slate-700/70">
                    <div className="h-full" style={{ width: `${Math.max(0, Math.min(100, card.pct))}%`, backgroundColor: ACTION_COLORS[card.key] }} />
                  </div>
                </div>
              ))}
            </div>
            ) : null}

            {inspectorTab !== "table" ? (
            <div className="rounded-xl border border-white/8 bg-[#0f172b] p-2.5">
              <div className="flex items-center justify-between gap-2">
                <div>
                  <div className="text-[11px] uppercase tracking-[0.3em] text-white/45">maos</div>
                  <div className="mt-1 text-lg font-bold text-white">{selectedCell?.label || "Selecione uma mao"}</div>
                </div>
                {selectedCell && <div className="rounded-full border border-white/10 bg-white/5 px-2 py-1 text-[10px] text-white/65">{selectedCell.combos} combos</div>}
              </div>

              {selectedCell ? (
                <>
                  <div className="mt-3 rounded-xl border border-white/8 bg-[#0b1225] p-2.5 text-sm text-white/80">
                    <div className="flex items-center justify-between gap-2">
                      <span>Melhor linha</span>
                      <span className="font-semibold text-cyan-100">{selectedCell.bestAction.toUpperCase()}</span>
                    </div>
                    <div className="mt-2 text-xs text-white/55">Spot: {selectedSolution ? `${selectedSolution.heroPosition} vs ${selectedSolution.villainPosition} • ${selectedSolution.stack}` : "-"}</div>
                  </div>

                  <div className="mt-3 space-y-1.5 text-xs">
                    {([
                      ["Raise", selectedActionBars.raise, "raise"],
                      ["Call", selectedActionBars.call, "call"],
                      ["Fold", selectedActionBars.fold, "fold"],
                      ["All-in", selectedActionBars.allin, "allin"],
                    ] as Array<[string, number, keyof MatrixActions]>).map(([label, pct, key]) => (
                      <div key={label}>
                        <div className="mb-1 flex justify-between"><span>{label}</span><span>{pct.toFixed(1)}%</span></div>
                        <div className="h-2 overflow-hidden rounded-full bg-slate-700/80">
                          <div className="h-full transition-all duration-300" style={{ width: `${Math.max(0, Math.min(100, pct))}%`, background: ACTION_COLORS[key] }} />
                        </div>
                      </div>
                    ))}
                  </div>

                  <div className="mt-3 rounded-xl border border-white/8 bg-[#0b1225] p-2.5 text-xs text-white/70">
                    <div className="grid grid-cols-2 gap-2">
                      <div>EV Raise: <span className="text-emerald-100">{evProxy.raise.toFixed(3)}</span></div>
                      <div>EV Call: <span className="text-fuchsia-100">{evProxy.call.toFixed(3)}</span></div>
                      <div>EV Fold: <span className="text-blue-100">{evProxy.fold.toFixed(3)}</span></div>
                      <div>Combos: <span className="text-white">{selectedCell.combos}</span></div>
                    </div>
                  </div>

                  <div className="mt-3 rounded-xl border border-white/8 bg-[#0b1225] p-2.5 text-xs text-white/70">
                    <div className="mb-1 font-semibold text-white/90">Blockers</div>
                    <div className="grid grid-cols-2 gap-1 text-[11px]">
                      <div>A-high blockers</div>
                      <div>{selectedCell.label.includes("A") ? "forte" : "baixo"}</div>
                      <div>Broadway density</div>
                      <div>{/[KQJT]/.test(selectedCell.label) ? "alta" : "baixa"}</div>
                      <div>Suited leverage</div>
                      <div>{selectedCell.label.endsWith("s") ? "sim" : "nao"}</div>
                      <div>Pair pressure</div>
                      <div>{selectedCell.label.length === 2 ? "sim" : "nao"}</div>
                    </div>
                  </div>
                </>
              ) : (
                <div className="mt-3 text-sm text-white/55">Clique em uma celula da matriz para abrir o breakdown da mao.</div>
              )}
            </div>
            ) : null}
          </aside>
        </div>
      </main>
    </div>
  );
};

export default GtoStudyLab;
