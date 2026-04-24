import { useEffect, useMemo, useState } from "react";
import { useLocation } from "wouter";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { HandHistoryInput } from "@/components/hand-reviewer/HandHistoryInput";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import { toast } from "sonner";
import {
  type ParserSelection,
  parseHandHistoryTranscript,
} from "@/parser/handHistoryDispatcher";
import { loadHandReviewSession, saveHandReviewSession } from "@/lib/hand-review-session";
import { trpc } from "@/lib/trpc";
import { jsPDF } from "jspdf";
import {
  Bar,
  BarChart,
  CartesianGrid,
  LabelList,
  Legend,
  Line,
  LineChart,
  ResponsiveContainer,
  Tooltip as RechartsTooltip,
  XAxis,
  YAxis,
} from "recharts";

type MetricKey = "vpip" | "pfr" | "threeBet" | "cbetFlop" | "cbetTurn" | "foldToCbet" | "bbDefense" | "attemptToSteal" | "aggressionFactor" | "wtsd" | "wsd" | "rfi" | "coldCall" | "squeeze" | "resteal" | "foldToSteal" | "foldTo3Bet" | "cbetIp" | "cbetOop" | "floatFlop" | "checkRaiseFlop" | "allInAdjBb100";

type ConfidenceLevel = "low" | "moderate" | "medium" | "high" | "very_high";

type OpportunityCounts = {
  hands: number;
  cbetFlop: number;
  cbetTurn: number;
  foldToCbet: number;
  bbDefense: number;
  steal: number;
  aggressionActions?: number;
  aggressionCalls?: number;
  rfi?: number;
  coldCall?: number;
  squeeze?: number;
  resteal?: number;
  foldToSteal?: number;
  foldTo3Bet?: number;
  cbetIp?: number;
  cbetOop?: number;
  floatFlop?: number;
  checkRaiseFlop?: number;
  allInAdjOpportunities?: number;
  allInAdjSample?: number;
  allInAdjSkipped?: number;
};

const HAND_REVIEW_CONSENT_VERSION = "v1.0";

const CONFIDENCE_CONFIG: Record<ConfidenceLevel, { label: string; emoji: string; color: string }> = {
  low:       { label: "Baixa",      emoji: "Vermelho", color: "text-red-400" },
  moderate:  { label: "Moderada",   emoji: "Laranja", color: "text-orange-300" },
  medium:    { label: "Média",      emoji: "Amarelo", color: "text-yellow-300" },
  high:      { label: "Alta",       emoji: "Verde", color: "text-emerald-400" },
  very_high: { label: "Muito alta", emoji: "Verde+", color: "text-emerald-300" },
};

function getHandsConfidenceLevel(hands: number): ConfidenceLevel {
  if (hands >= 27000) return "very_high";
  if (hands >= 19000) return "high";
  if (hands >= 11000) return "medium";
  if (hands >= 7000) return "moderate";
  return "low";
}

function getConfidenceLevel(key: MetricKey, opp: OpportunityCounts): ConfidenceLevel {
  const h = opp.hands;
  switch (key) {
    case "vpip":
    case "pfr":
    case "wtsd":
    case "wsd":
    case "aggressionFactor":
    case "allInAdjBb100":
      return getHandsConfidenceLevel(h);
    case "threeBet":
      return getHandsConfidenceLevel(h);
    case "cbetFlop": {
      const o = opp.cbetFlop;
      if (o < 28) return "low";
      if (o < 41) return "moderate";
      if (o < 68) return "medium";
      if (o < 97) return "high";
      return "very_high";
    }
    case "cbetTurn": {
      const o = opp.cbetTurn;
      if (o < 25) return "low";
      if (o < 40) return "moderate";
      if (o < 65) return "medium";
      if (o < 90) return "high";
      return "very_high";
    }
    case "foldToCbet": {
      const o = opp.foldToCbet;
      if (o < 26) return "low";
      if (o < 40) return "moderate";
      if (o < 65) return "medium";
      if (o < 93) return "high";
      return "very_high";
    }
    case "bbDefense": {
      const o = opp.bbDefense;
      if (o < 50)  return "low";
      if (o < 150) return "moderate";
      if (o < 300) return "medium";
      if (o < 450) return "high";
      return "very_high";
    }
    case "attemptToSteal": {
      const o = opp.steal;
      if (o < 60) return "low";
      if (o < 120) return "moderate";
      if (o < 200) return "medium";
      if (o < 300) return "high";
      return "very_high";
    }
    case "rfi":
    case "coldCall":
    case "squeeze":
    case "resteal":
    case "foldToSteal":
    case "foldTo3Bet":
    case "cbetIp":
    case "cbetOop":
    case "floatFlop":
    case "checkRaiseFlop": {
      const oppKey = key as keyof OpportunityCounts;
      const o = Number((opp as any)[oppKey] ?? 0);
      if (o < 20) return "low";
      if (o < 40) return "moderate";
      if (o < 80) return "medium";
      if (o < 150) return "high";
      return "very_high";
    }
    default:
      return getHandsConfidenceLevel(h);
  }
}

function getGeneralConfidenceProgress(hands: number): number {
  const h = Math.max(0, Number(hands || 0));

  const interpolate = (value: number, min: number, max: number, outMin: number, outMax: number) => {
    if (max <= min) return outMin;
    const t = Math.min(1, Math.max(0, (value - min) / (max - min)));
    return outMin + t * (outMax - outMin);
  };

  if (h < 7000) return interpolate(h, 0, 7000, 2, 20);
  if (h < 11000) return interpolate(h, 7000, 11000, 20, 40);
  if (h < 19000) return interpolate(h, 11000, 19000, 40, 60);
  if (h < 27000) return interpolate(h, 19000, 27000, 60, 80);
  if (h < 100000) return interpolate(h, 27000, 100000, 80, 99);
  return 99;
}

function GeneralConfidenceIndicator({ level, hands }: { level: ConfidenceLevel; hands: number }) {
  const cfg = CONFIDENCE_CONFIG[level];
  const progress = getGeneralConfidenceProgress(hands);

  return (
    <Tooltip>
      <TooltipTrigger asChild>
        <button
          type="button"
          className="inline-flex flex-col items-end gap-1 rounded-lg border border-cyan-300/30 bg-slate-950/45 px-2.5 py-2 text-left"
          aria-label="Nível geral de confiança"
        >
          <span className={`text-[11px] font-semibold ${cfg.color}`}>{cfg.emoji} · Confiança geral: {cfg.label}</span>
          <div className="relative h-1.5 w-36 rounded-full bg-gradient-to-r from-red-500 via-yellow-400 to-emerald-400">
            <span
              className="absolute top-1/2 h-3 w-3 -translate-y-1/2 rounded-full border border-white/60 bg-slate-950 shadow-[0_0_0_2px_rgba(2,6,23,0.8)]"
              style={{ left: `calc(${progress}% - 6px)` }}
            />
          </div>
        </button>
      </TooltipTrigger>
      <TooltipContent side="bottom" align="end" className="max-w-[320px] text-left text-xs">
        <p className="font-semibold">Nível geral de confiança da análise</p>
        <p className="mt-1">Baseado no total de mãos da amostra atual ({hands} mãos).</p>
        <p className="mt-1">Faixas gerais (mãos): baixa &lt; 7.000 · moderada 7.000-10.999 · média 11.000-18.999 · alta 19.000-26.999 · muito alta 27.000+.</p>
        <p className="mt-1 text-amber-700">Métricas específicas podem exigir mais oportunidades para confirmar padrão.</p>
      </TooltipContent>
    </Tooltip>
  );
}

function TabConfidenceHeader({ hands, level }: { hands: number; level: ConfidenceLevel }) {
  return (
    <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
      <div className="inline-flex items-center gap-2 text-xs font-semibold text-white/80">
        <span aria-hidden>Estat</span>
        <span>Painel estatístico</span>
      </div>
      <div className="flex items-center justify-between gap-2 sm:justify-end">
        <span className="text-xs text-white/70">{hands} mãos analisadas</span>
        <GeneralConfidenceIndicator level={level} hands={hands} />
      </div>
    </div>
  );
}

const BENCHMARKS: Record<MetricKey, { min: number; max: number; label: string; interpretation: string }> = {
  vpip: { min: 18, max: 28, label: "VPIP", interpretation: "Participação voluntária de mãos no pote." },
  pfr: { min: 14, max: 24, label: "PFR", interpretation: "Agressão pré-flop via raise." },
  threeBet: { min: 5, max: 10, label: "3-Bet", interpretation: "Re-raise pré-flop contra open." },
  cbetFlop: { min: 55, max: 75, label: "C-Bet Flop", interpretation: "Continuação de agressão no flop." },
  cbetTurn: { min: 40, max: 60, label: "C-Bet Turn", interpretation: "Segundo barril no turn após agressão prévia." },
  foldToCbet: { min: 40, max: 55, label: "Fold to C-Bet", interpretation: "Frequência de fold contra c-bet." },
  bbDefense: { min: 35, max: 55, label: "Defesa de BB", interpretation: "Defesa do big blind quando atacado." },
  attemptToSteal: { min: 30, max: 50, label: "Attempt to Steal", interpretation: "Tentativa de roubo em posição final." },
  aggressionFactor: { min: 2, max: 3.5, label: "Aggression Factor", interpretation: "Razão entre ações agressivas e calls." },
  wtsd: { min: 25, max: 35, label: "WTSD", interpretation: "Frequência de ida ao showdown." },
  wsd: { min: 50, max: 60, label: "WSD", interpretation: "Vitória quando chega ao showdown." },
  rfi: { min: 20, max: 32, label: "RFI", interpretation: "Raise first in: abriu o pote com raise." },
  coldCall: { min: 2, max: 8, label: "Cold Call", interpretation: "Pagou um raise sem ter investido antes." },
  squeeze: { min: 4, max: 10, label: "Squeeze", interpretation: "3-bet contra raise + caller(s)." },
  resteal: { min: 8, max: 18, label: "Resteal", interpretation: "3-bet em blind contra tentativa de roubo." },
  foldToSteal: { min: 50, max: 70, label: "Fold to Steal", interpretation: "Fold no blind contra raise em posição final." },
  foldTo3Bet: { min: 50, max: 65, label: "Fold to 3-Bet", interpretation: "Fold ao open-raise quando sofre 3-bet." },
  cbetIp: { min: 60, max: 80, label: "C-Bet IP", interpretation: "C-bet flop em posição." },
  cbetOop: { min: 45, max: 65, label: "C-Bet OOP", interpretation: "C-bet flop fora de posição." },
  floatFlop: { min: 8, max: 18, label: "Float Flop", interpretation: "Pagou c-bet flop IP e atacou turn." },
  checkRaiseFlop: { min: 6, max: 14, label: "Check-Raise Flop", interpretation: "Check + raise no flop." },
  allInAdjBb100: { min: 0, max: 9999, label: "All-in Adj BB/100", interpretation: "Win-rate em BB/100 removendo a sorte dos all-ins pré-showdown." },
};

const SPECIFIC_PATTERN_SAMPLE_DATA = [
  { spot: "Flop C-bet (50%)", low: 28, moderate: 41, medium: 68, high: 97, veryHigh: 166 },
  { spot: "Fold to C-bet (40%)", low: 26, moderate: 40, medium: 65, high: 93, veryHigh: 160 },
  { spot: "VPIP (25%)", low: 82, moderate: 123, medium: 203, high: 289, veryHigh: 498 },
  { spot: "PFR (20%)", low: 70, moderate: 105, medium: 174, high: 246, veryHigh: 425 },
];

const WINRATE_SAMPLE_DATA = [
  { confidence: "Baixa (70%)", lowVariance: 974, typicalVariance: 1954, highVariance: 3894 },
  { confidence: "Moderada (80%)", lowVariance: 1475, typicalVariance: 2960, highVariance: 5899 },
  { confidence: "Média (90%)", lowVariance: 2436, typicalVariance: 4888, highVariance: 9742 },
  { confidence: "Alta (95%)", lowVariance: 3458, typicalVariance: 6939, highVariance: 13830 },
  { confidence: "Muito Alta (99%)", lowVariance: 5973, typicalVariance: 11986, highVariance: 23889 },
];

function getMetricStatus(key: MetricKey, value: number | null | undefined): "below" | "ok" | "above" {
  const benchmark = BENCHMARKS[key];
  const numeric = Number(value ?? 0);
  if (numeric < benchmark.min) return "below";
  if (numeric > benchmark.max) return "above";
  return "ok";
}

function metricStatusBadge(status: "below" | "ok" | "above") {
  if (status === "below") {
    return <span className="font-bold text-red-400">↓ Baixo</span>;
  }
  if (status === "above") {
    return <span className="font-bold text-amber-300">↑ Alto</span>;
  }
  return <span className="font-bold text-emerald-400">✓ Dentro da faixa</span>;
}

function metricStatusText(key: MetricKey, value: number | null | undefined): string {
  const status = getMetricStatus(key, value);
  if (status === "below") {
    return "Abaixo da faixa comum. Vale revisar spots em que essa ação está faltando.";
  }
  if (status === "above") {
    return "Acima da faixa comum. Pode haver excesso de agressão ou seleção ampla de spots.";
  }
  return "Dentro da faixa comum para referência prática de regs sólidos.";
}

function normalizeName(value: string | undefined): string {
  return String(value ?? "")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .trim();
}

function parseHandDate(dateTime: string): Date | undefined {
  const normalized = dateTime.trim().replace(" ", "T").replace(/\//g, "-");
  const parsed = new Date(normalized);
  if (Number.isNaN(parsed.getTime())) return undefined;
  return parsed;
}

function mapActionType(action: string): "fold" | "check" | "call" | "bet" | "raise" | "all_in" | "post_blind" | "post_ante" | "straddle" | "show" | "muck" | "collect" | "other" {
  if (action === "fold") return "fold";
  if (action === "check") return "check";
  if (action === "call") return "call";
  if (action === "bet") return "bet";
  if (action === "raise") return "raise";
  if (action === "all_in") return "all_in";
  if (action === "post_ante") return "post_ante";
  if (action === "post_small_blind" || action === "post_big_blind") return "post_blind";
  if (action === "show") return "show";
  if (action === "collect") return "collect";
  return "other";
}

function formatPercent(value: number | null | undefined): string {
  if (value == null) return "-";
  return `${value}%`;
}

function formatChips(value: number | null | undefined): string {
  if (value == null) return "-";
  const sign = value > 0 ? "+" : "";
  return `${sign}${value}`;
}

function formatBb(value: number | null | undefined): string {
  if (value == null) return "-";
  const numeric = Number(value);
  const sign = numeric > 0 ? "+" : "";
  return `${sign}${numeric.toFixed(1)}bb`;
}

function formatMinorMoney(value: number | null | undefined, currency: string | null | undefined): string {
  if (value == null) return "-";
  const safeCurrency = String(currency ?? "USD").toUpperCase();
  const amount = Number(value) / 100;
  if (safeCurrency === "MIXED") {
    return `${amount.toFixed(2)} (moedas mistas)`;
  }
  try {
    return `${new Intl.NumberFormat("pt-BR", { style: "currency", currency: safeCurrency as "BRL" | "USD" | "CAD" | "JPY" | "CNY" | "EUR" }).format(amount)} (${safeCurrency})`;
  } catch {
    return `${amount.toFixed(2)} (${safeCurrency})`;
  }
}

function MetricLabel({ label, hint }: { label: string; hint: string }) {
  return (
    <div className="inline-flex items-center gap-1">
      <span>{label}</span>
      <Tooltip>
        <TooltipTrigger asChild>
          <button
            type="button"
            className="inline-flex h-4 w-4 items-center justify-center rounded-full border border-white/25 text-[10px] text-white/70"
            aria-label={`Ajuda sobre ${label}`}
          >
            ?
          </button>
        </TooltipTrigger>
        <TooltipContent sideOffset={8} className="max-w-[260px] text-left">
          {hint}
        </TooltipContent>
      </Tooltip>
    </div>
  );
}

function buildReplayPayload(rawInput: string, selectedPlatform: ParserSelection) {
  const parsed = parseHandHistoryTranscript(rawInput, { preferredPlatform: selectedPlatform });
  const firstHand = parsed.hands[0];
  if (!firstHand) return null;

  // Prefer hero name from parsed hands (per-hand "Dealt to X" detection is reliable)
  // over header.heroName which defaults to "Hero" when no "requested by" line exists.
  const heroName =
    parsed.hands.find(h => h.heroName && normalizeName(h.heroName) !== "hero")?.heroName ??
    parsed.header.heroName;

  const hands = parsed.hands.map((hand) => ({
    handRef: hand.handId,
    externalHandId: hand.handId,
    handNumber: hand.handId,
    datetimeOriginal: parseHandDate(hand.dateTime),
    buttonSeat: hand.buttonSeat,
    heroSeat: hand.heroSeat ?? undefined,
    heroPosition: hand.heroPosition || undefined,
    smallBlind: hand.smallBlind,
    bigBlind: hand.bigBlind,
    ante: hand.ante,
    board: hand.board.full.join(" "),
    heroCards: hand.heroCards.join(" "),
    totalPot: hand.summary.totalPot,
    rake: hand.summary.rake,
    result: hand.calculations.heroNetEstimate,
    showdown: hand.summary.showdown,
    rawText: hand.rawHand,
    parsedJson: JSON.stringify({ summary: hand.summary, calculations: hand.calculations }),
    handContextJson: JSON.stringify({ heroPosition: hand.heroPosition, level: hand.level, maxPlayers: hand.maxPlayers }),
  }));

  const actions = parsed.hands.flatMap((hand) => {
    const seatByPlayer = new Map(hand.seats.map((seat) => [normalizeName(seat.playerName), seat]));
    return hand.actions.map((action, index) => {
      const seat = seatByPlayer.get(normalizeName(action.player));
      return {
        handRef: hand.handId,
        street: action.street,
        actionOrder: index,
        playerName: action.player,
        seat: seat?.seatNumber,
        position: seat?.position,
        actionType: mapActionType(action.action),
        amount: action.amount ?? undefined,
        toAmount: action.toAmount ?? undefined,
        isAllIn: action.isAllIn,
        isForced: action.action === "post_ante" || action.action === "post_small_blind" || action.action === "post_big_blind",
        heroInHand: normalizeName(action.player) === normalizeName(heroName),
        showdownVisible: hand.summary.showdown,
      };
    });
  });

  const showdowns = parsed.hands.flatMap((hand) => {
    if (!hand.summary.showdown) return [];
    const list: Array<{
      handRef: string;
      playerName: string;
      seat?: number;
      position?: string;
      holeCards?: string;
      finalHandDescription?: string;
      wonPot?: boolean;
      amountWon?: number;
    }> = [];

    const seatByPlayer = new Map(hand.seats.map((seat) => [normalizeName(seat.playerName), seat]));
    const heroSeat = seatByPlayer.get(normalizeName(hand.heroName));
    if (hand.summary.heroShowed.length > 0) {
      list.push({
        handRef: hand.handId,
        playerName: hand.heroName,
        seat: heroSeat?.seatNumber,
        position: heroSeat?.position,
        holeCards: hand.summary.heroShowed.join(" "),
        wonPot: hand.summary.heroCollected > 0,
        amountWon: hand.summary.heroCollected,
      });
    }

    for (const villain of hand.summary.villainCards) {
      const villainSeat = seatByPlayer.get(normalizeName(villain.player));
      list.push({
        handRef: hand.handId,
        playerName: villain.player,
        seat: villainSeat?.seatNumber,
        position: villainSeat?.position,
        holeCards: villain.cards.join(" "),
      });
    }
    return list;
  });

  const eliminationHand = parsed.hands.find((hand) => hand.summary.eliminationPosition != null);
  const buyInChips = Math.round((firstHand.buyIn ?? 0) * 100);
  const feeChips = Math.round((firstHand.fee ?? 0) * 100);

  return {
    parsed,
    payload: {
      tournament: {
        externalTournamentId: parsed.header.tournamentId || firstHand.tournamentId,
        heroName: heroName,
        site: parsed.header.source,
        format: firstHand.format || "tournament",
        buyIn: buyInChips,
        fee: feeChips,
        currency: (firstHand.currency || "USD") as "BRL" | "USD" | "CAD" | "JPY" | "CNY" | "EUR",
        importedAt: new Date(),
        totalHands: parsed.hands.length,
        finalPosition: parsed.tournamentInfo.finalPosition ?? undefined,
        wasEliminated: (parsed.tournamentInfo.finalPosition ?? 0) > 1,
        eliminationHandRef: eliminationHand?.handId,
        rawSourceId: parsed.header.tournamentId,
      },
      hands,
      actions,
      showdowns,
    },
  };
}



export default function HandReviewer() {
  const [, setLocation] = useLocation();
  const [rawInput, setRawInput] = useState("");
  const [selectedPlatform, setSelectedPlatform] = useState<ParserSelection>("AUTO");
  const [activeTab, setActiveTab] = useState<"tournament" | "player" | "positions">("tournament");
  const [lastReplayPayload, setLastReplayPayload] = useState<any | null>(null);
  const [consentModalOpen, setConsentModalOpen] = useState(false);

  const utils = trpc.useUtils();

  const consentQuery = trpc.memory.consent.get.useQuery(undefined, {
    refetchOnWindowFocus: false,
  });

  const consentGrantMutation = trpc.memory.consent.grant.useMutation({
    onSuccess: () => {
      toast.success("Consentimento registrado. Revisor de Mãos liberado.");
      utils.memory.consent.get.invalidate();
    },
    onError: (error) => {
      toast.error("Não foi possível registrar o consentimento", { description: error.message });
    },
  });

  const hasAcceptedCurrentConsent =
    !!consentQuery.data
    && consentQuery.data.active === 1
    && consentQuery.data.allowDataStorage === 1
    && consentQuery.data.consentVersion === HAND_REVIEW_CONSENT_VERSION;

  const requiresConsent = !consentQuery.isLoading && !hasAcceptedCurrentConsent;

  useEffect(() => {
    if (requiresConsent) {
      setConsentModalOpen(true);
    } else {
      setConsentModalOpen(false);
    }
  }, [requiresConsent]);

  const analyzeMutation = trpc.memory.analyzeReplay.useMutation({
    onSuccess: () => {
      setActiveTab("tournament");
      toast.success("Análise do torneio concluída.");
    },
    onError: (error) => {
      toast.error("Falha ao analisar torneio", { description: error.message });
    },
  });

  const saveToHistoryMutation = trpc.memory.importReplay.useMutation({
    onSuccess: () => {
      toast.success("Torneio adicionado ao histórico do jogador.");
      utils.memory.playerHistoricalProfile.invalidate();
      setActiveTab("player");
    },
    onError: (error) => {
      toast.error("Falha ao salvar no histórico", { description: error.message });
    },
  });

  const clearReplayHistoryMutation = trpc.memory.clearReplayHistory.useMutation({
    onSuccess: () => {
      toast.success("Histórico do revisor limpo. Você já pode salvar novos torneios.");
      utils.memory.playerHistoricalProfile.invalidate();
      setLastReplayPayload(null);
      setActiveTab("player");
    },
    onError: (error) => {
      toast.error("Falha ao limpar histórico", { description: error.message });
    },
  });

  const compactReplayStorageMutation = trpc.memory.compactReplayStorage.useMutation({
    onSuccess: (result) => {
      toast.success("Armazenamento do revisor compactado.", {
        description: `${Number(result?.compactedHands ?? 0)} mãos e ${Number(result?.compactedActions ?? 0)} ações tiveram o payload pesado removido.`,
      });
      utils.memory.playerHistoricalProfile.invalidate();
      setActiveTab("player");
    },
    onError: (error) => {
      toast.error("Falha ao compactar armazenamento", { description: error.message });
    },
  });

  const playerHistoryQuery = trpc.memory.playerHistoricalProfile.useQuery(undefined, {
    refetchOnWindowFocus: false,
  });

  // Debug logging for player history query
  useEffect(() => {
    console.log("[playerHistoryQuery]", {
      isLoading: playerHistoryQuery.isLoading,
      isError: playerHistoryQuery.isError,
      error: playerHistoryQuery.error?.message,
      data: playerHistoryQuery.data ? "has data" : "no data",
      dataDetails: playerHistoryQuery.data ? {
        totalTournaments: playerHistoryQuery.data.summary.totalTournaments,
        totalHands: playerHistoryQuery.data.summary.totalHands,
      } : null,
    });
  }, [playerHistoryQuery.data, playerHistoryQuery.isLoading, playerHistoryQuery.isError]);

  const parsedTournament = useMemo(
    () => parseHandHistoryTranscript(rawInput, { preferredPlatform: selectedPlatform }),
    [rawInput, selectedPlatform],
  );

  useEffect(() => {
    if (typeof window === "undefined") return;
    const replaySessionId = new URLSearchParams(window.location.search).get("replaySession");
    if (!replaySessionId) return;

    const loaded = loadHandReviewSession(replaySessionId);
    if (!loaded) return;

    setRawInput(loaded.rawInput);
    setSelectedPlatform(loaded.parserSelection ?? "AUTO");
    toast.success("Torneio carregado da mesa para análise.");
  }, []);

  const hasHands = parsedTournament.hands.length > 0;

  const handleAnalyzeTournament = () => {
    if (requiresConsent) {
      toast.warning("Aceite o termo de consentimento para usar o Revisor de Mãos.");
      return;
    }

    if (!rawInput.trim()) {
      toast.warning("Cole um hand history antes de analisar.");
      return;
    }

    const built = buildReplayPayload(rawInput, selectedPlatform);
    if (!built || built.parsed.hands.length === 0) {
      toast.warning("Nenhuma mão válida detectada para análise.");
      return;
    }

    setLastReplayPayload(built.payload);
    analyzeMutation.mutate(built.payload);
  };

  const handleSaveTournamentToHistory = () => {
    if (requiresConsent) {
      toast.warning("Aceite o termo de consentimento para salvar análises no histórico.");
      return;
    }

    if (!lastReplayPayload) {
      const built = buildReplayPayload(rawInput, selectedPlatform);
      if (!built || built.parsed.hands.length === 0) {
        toast.warning("Analise um torneio válido antes de salvar no histórico.");
        return;
      }
      setLastReplayPayload(built.payload);
      saveToHistoryMutation.mutate(built.payload);
      return;
    }

    saveToHistoryMutation.mutate(lastReplayPayload);
  };

  const handleClearReplayHistory = () => {
    if (requiresConsent) {
      toast.warning("Aceite o termo de consentimento para limpar os dados do revisor.");
      return;
    }

    const shouldClear = window.confirm(
      "Tem certeza que deseja limpar TODO o histórico do Revisor de Mãos? Esta ação não pode ser desfeita.",
    );
    if (!shouldClear) return;

    clearReplayHistoryMutation.mutate();
  };

  const handleCompactReplayStorage = () => {
    if (requiresConsent) {
      toast.warning("Aceite o termo de consentimento para compactar os dados do revisor.");
      return;
    }

    const shouldCompact = window.confirm(
      "Compactar o armazenamento remove texto bruto e JSON auxiliar das mãos já salvas, mas preserva estatísticas, ações e histórico útil para estudo/GTO. Deseja continuar?",
    );
    if (!shouldCompact) return;

    compactReplayStorageMutation.mutate();
  };

  const handleSubmitToTable = () => {
    if (requiresConsent) {
      toast.warning("Aceite o termo de consentimento para abrir a mesa de replay.");
      return;
    }

    if (!rawInput.trim()) {
      toast.warning("Cole um hand history antes de enviar.");
      return;
    }

    const parsed = parseHandHistoryTranscript(rawInput, { preferredPlatform: selectedPlatform });
    if (parsed.hands.length === 0) {
      toast.warning("Nenhuma mão válida detectada neste conteúdo.");
      return;
    }

    try {
      const sessionId = saveHandReviewSession(rawInput, selectedPlatform);
      setLocation(`/hand-review/replay/${sessionId}`);
    } catch {
      toast.error("Falha ao abrir a mesa. Tente novamente.");
    }
  };

  const studyFocusSuggestions = useMemo(() => {
    const suggestions: string[] = [];
    const h = playerHistoryQuery.data;

    if (h?.positions?.leastProfitable && Number(h.positions.leastProfitable.netBb ?? 0) < 0) {
      suggestions.push(`Foco estrutural em ${h.positions.leastProfitable.position}: posição menos lucrativa no histórico.`);
    }
    if (h?.summary) {
      if (getMetricStatus("bbDefense", h.summary.bbDefenseAvg) === "below") {
        suggestions.push("Treinar defesa de BB (ranges de call/3-bet por tamanho de open e stack). ");
      }
      if (getMetricStatus("cbetTurn", h.summary.cbetTurnAvg) === "below" && getMetricStatus("cbetFlop", h.summary.cbetFlopAvg) === "above") {
        suggestions.push("Leak clássico detectado: c-bet flop alta e turn baixa. Trabalhar plano de 2º barril.");
      }
      const gap = Number(h.summary.vpipAvg ?? 0) - Number(h.summary.pfrAvg ?? 0);
      const vpipStatus = getMetricStatus("vpip", h.summary.vpipAvg);
      const pfrStatus = getMetricStatus("pfr", h.summary.pfrAvg);
      if (gap > 8 && (vpipStatus !== "ok" || pfrStatus !== "ok")) {
        suggestions.push("Gap VPIP-PFR alto: revisar excesso de calls pré-flop e passividade sem iniciativa.");
      }
    }

    if (suggestions.length === 0) {
      suggestions.push("Base atual sem desvio crítico claro. Próximo passo: revisão por posição e por ABI para ganho marginal.");
    }

    return suggestions.slice(0, 6);
  }, [playerHistoryQuery.data]);

  const tournamentOpportunities = useMemo<OpportunityCounts>(() => {
    const t = analyzeMutation.data;
    return {
      hands: Number(t?.opportunities?.hands ?? t?.tournament?.handsAnalyzed ?? 0),
      cbetFlop: Number(t?.opportunities?.cbetFlop ?? 0),
      cbetTurn: Number(t?.opportunities?.cbetTurn ?? 0),
      foldToCbet: Number(t?.opportunities?.foldToCbet ?? 0),
      bbDefense: Number(t?.opportunities?.bbDefense ?? 0),
      steal: Number(t?.opportunities?.steal ?? 0),
    };
  }, [analyzeMutation.data]);

  const handleDownloadAnalysisPdf = () => {
    const data = analyzeMutation.data;
    if (!data) {
      toast.warning("Analise o torneio antes de baixar o PDF.");
      return;
    }

    try {
      const doc = new jsPDF({ unit: "pt", format: "a4" });
      const pageWidth = doc.internal.pageSize.getWidth();
      const pageHeight = doc.internal.pageSize.getHeight();
      const marginX = 40;
      const bottomLimit = pageHeight - 40;
      let y = 44;

      const ensureSpace = (neededHeight: number) => {
        if (y + neededHeight <= bottomLimit) return;
        doc.addPage();
        y = 44;
      };

      const writeTitle = (title: string) => {
        ensureSpace(28);
        doc.setFont("helvetica", "bold");
        doc.setFontSize(15);
        doc.text(title, marginX, y);
        y += 18;
      };

      const writeLine = (text: string, fontSize = 10) => {
        doc.setFont("helvetica", "normal");
        doc.setFontSize(fontSize);
        const lines = doc.splitTextToSize(text, pageWidth - marginX * 2) as string[];
        ensureSpace(lines.length * (fontSize + 3) + 4);
        doc.text(lines, marginX, y);
        y += lines.length * (fontSize + 3) + 4;
      };

      const confidence = CONFIDENCE_CONFIG[getConfidenceLevel("vpip", tournamentOpportunities)].label;
      const now = new Date();

      writeTitle("Relatorio de Analise de Torneio");
      writeLine(`Gerado em: ${now.toLocaleString("pt-BR")}`);
      writeLine(`Confianca geral da amostra: ${confidence}`);
      y += 4;

      writeTitle("Resumo do Torneio");
      writeLine(`Mao analisadas: ${data.tournament.handsAnalyzed}`);
      writeLine(`Buy-in: ${(data.tournament.buyIn / 100).toFixed(2)} | ABI: ${(data.tournament.abiValue / 100).toFixed(2)}`);
      writeLine(`Colocacao final: ${data.tournament.finalPositionLabel ?? "-"}`);
      writeLine(`Showdowns: ${data.tournament.showdownsCount}`);
      writeLine(`Duracao: ${data.tournament.durationMinutes ? `${data.tournament.durationMinutes} min` : "-"}`);
      if (data.tournament.bestPosition) {
        writeLine(`Melhor posicao no torneio: ${data.tournament.bestPosition.position} (${formatBb((data.tournament.bestPosition as any).netBb)})`);
      }
      if (data.tournament.worstPosition) {
        writeLine(`Pior posicao no torneio: ${data.tournament.worstPosition.position} (${formatBb((data.tournament.worstPosition as any).netBb)})`);
      }
      y += 4;

      writeTitle("Metricas Principais");
      writeLine(`VPIP: ${formatPercent(data.stats.vpip)} | PFR: ${formatPercent(data.stats.pfr)} | 3-bet: ${formatPercent(data.stats.threeBet)}`);
      writeLine(`C-bet flop: ${formatPercent(data.stats.cbetFlop)} | C-bet turn: ${formatPercent(data.stats.cbetTurn)} | Fold to c-bet: ${formatPercent(data.stats.foldToCbet)}`);
      writeLine(`Defesa BB: ${formatPercent(data.stats.bbDefense)} | Attempt to steal: ${formatPercent(data.stats.attemptToSteal)}`);
      writeLine(`Aggression Factor: ${Number(data.stats.aggressionFactor ?? 0).toFixed(2)} | WTSD: ${formatPercent(data.stats.wtsd)} | WSD: ${formatPercent(data.stats.wsd)}`);
      y += 4;

      writeTitle("Oportunidades da Amostra");
      writeLine(`Mãos: ${tournamentOpportunities.hands} | C-bet flop: ${tournamentOpportunities.cbetFlop} | C-bet turn: ${tournamentOpportunities.cbetTurn}`);
      writeLine(`Fold to c-bet: ${tournamentOpportunities.foldToCbet} | Defesa BB: ${tournamentOpportunities.bbDefense} | Steal: ${tournamentOpportunities.steal}`);

      if (data.alerts.length > 0) {
        y += 4;
        writeTitle("Alertas");
        data.alerts.forEach((alert) => writeLine(`- ${alert}`));
      }

      if (data.strengths.length > 0) {
        y += 4;
        writeTitle("Pontos Fortes");
        data.strengths.forEach((strength) => writeLine(`- ${strength}`));
      }

      const fileDate = now.toISOString().slice(0, 10);
      doc.save(`analise-torneio-${fileDate}.pdf`);
      toast.success("PDF da analise gerado com sucesso.");
    } catch (error: any) {
      toast.error("Falha ao gerar PDF", { description: error?.message ?? "Erro inesperado" });
    }
  };

  const generalConfidenceLevel = getConfidenceLevel("vpip", tournamentOpportunities);

  const playerHands = Number(playerHistoryQuery.data?.summary?.totalHands ?? 0);
  const playerConfidenceLevel = getConfidenceLevel("vpip", {
    hands: playerHands,
    cbetFlop: 0,
    cbetTurn: 0,
    foldToCbet: 0,
    bbDefense: 0,
    steal: 0,
  });

  const positionsHands = Number(playerHistoryQuery.data?.summary?.totalHands ?? 0);
  const positionsConfidenceLevel = getConfidenceLevel("vpip", {
    hands: positionsHands,
    cbetFlop: 0,
    cbetTurn: 0,
    foldToCbet: 0,
    bbDefense: 0,
    steal: 0,
  });

  const historicalOpp = (playerHistoryQuery.data?.summary as any)?.opportunities as Partial<OpportunityCounts> | undefined;
  const historicalOppSafe: OpportunityCounts = {
    hands: Number(historicalOpp?.hands ?? playerHands ?? 0),
    cbetFlop: Number(historicalOpp?.cbetFlop ?? 0),
    cbetTurn: Number(historicalOpp?.cbetTurn ?? 0),
    foldToCbet: Number(historicalOpp?.foldToCbet ?? 0),
    bbDefense: Number(historicalOpp?.bbDefense ?? 0),
    steal: Number(historicalOpp?.steal ?? 0),
    aggressionActions: Number((historicalOpp as any)?.aggressionActions ?? 0),
    aggressionCalls: Number((historicalOpp as any)?.aggressionCalls ?? 0),
    allInAdjSample: Number((historicalOpp as any)?.allInAdjSample ?? 0),
    allInAdjOpportunities: Number((historicalOpp as any)?.allInAdjOpportunities ?? 0),
    allInAdjSkipped: Number((historicalOpp as any)?.allInAdjSkipped ?? 0),
  };

  const formatMadeOf = (made: number, of: number) => `${Math.max(0, Math.round(made))}/${Math.max(0, Math.round(of))}`;
  const roundMade = (percent: number, of: number) => Math.round((Number(percent || 0) / 100) * Math.max(0, Number(of || 0)));

  return (
    <div className="tokyo-reviewer mx-auto w-full max-w-[1400px] flex flex-col gap-3 px-2 py-3 md:px-4 pb-10">
      <div className="tokyo-grid-overlay" />

      <Dialog open={requiresConsent && consentModalOpen}>
        <DialogContent
          showCloseButton={false}
          onEscapeKeyDown={(e) => e.preventDefault()}
          onInteractOutside={(e) => e.preventDefault()}
          className="max-w-3xl border-cyan-400/30 bg-slate-950 text-slate-100"
        >
          <DialogHeader>
            <DialogTitle className="text-cyan-100">Autorização para Análise e Armazenamento de Dados de Jogo</DialogTitle>
          </DialogHeader>

          <div className="max-h-[65vh] space-y-3 overflow-y-auto pr-1 text-sm">
            <p>
              Para utilizar a funcionalidade de Revisor de Mãos, é necessário autorizar o processamento dos seus dados de jogo.
            </p>
            <p>
              Ao prosseguir, você concorda que suas mãos, histórico de torneios e estatísticas sejam armazenados de forma segura,
              processados para geração de análises individuais de desempenho e utilizados para aprimoramento das funcionalidades da plataforma.
            </p>
            <p>
              Nosso compromisso é garantir proteção, integridade e confidencialidade dos seus dados, seguindo boas práticas de segurança e privacidade.
            </p>

            <div className="rounded-xl bg-cyan-500/8 p-3 text-xs shadow-[inset_0_1px_0_rgba(34,211,238,0.08)]">
              Seus dados são protegidos por mecanismos de segurança e não são utilizados de forma indevida ou fora do escopo da plataforma.
            </div>

            <div className="rounded-xl bg-amber-500/8 p-3 text-xs text-amber-100 shadow-[inset_0_1px_0_rgba(245,158,11,0.08)]">
              O uso do Revisor de Mãos está condicionado à aceitação deste termo. Caso não concorde, essa funcionalidade permanecerá indisponível.
            </div>

            <div className="rounded-xl bg-white/4 p-3 text-xs text-white/85 shadow-[inset_0_1px_0_rgba(255,255,255,0.05)]">
              <p className="mb-2 font-semibold text-cyan-100">Termos adicionais</p>
              <p className="mb-1">
                Seus dados poderão ser utilizados de forma agregada e anonimizada para desenvolvimento de modelos analíticos e estratégias baseadas em GTO.
              </p>
              <p className="mb-1">
                Suas informações poderão ser analisadas pela equipe técnica e desenvolvedores para melhoria contínua e validação de consistência.
              </p>
              <p className="mb-1">
                Determinados dados estatísticos poderão compor bases de funcionalidades avançadas e ecossistema analítico da plataforma.
              </p>
              <p>
                Em ambientes específicos, dados agregados poderão ser acessados por usuários com permissões avançadas, respeitando níveis de acesso e políticas internas.
              </p>
            </div>

            <p className="text-xs italic text-cyan-200/90">
              Seus dados contam a sua história no jogo. Nossa missão é transformá-los em clareza, evolução e vantagem estratégica.
            </p>
          </div>

          <div className="flex flex-col-reverse gap-2 pt-2 sm:flex-row sm:justify-end">
            <Button
              variant="outline"
              onClick={() => setConsentModalOpen(false)}
              disabled={consentGrantMutation.isPending}
            >
              Não aceitar agora
            </Button>
            <Button
              className="bg-cyan-400 text-slate-950 hover:bg-cyan-300"
              disabled={consentGrantMutation.isPending}
              onClick={() => {
                consentGrantMutation.mutate({
                  consentVersion: HAND_REVIEW_CONSENT_VERSION,
                  allowDataStorage: true,
                  allowSharedInternalAnalysis: true,
                  allowAiTrainingUsage: true,
                  allowDeveloperAccess: true,
                  allowFieldAggregation: true,
                });
              }}
            >
              {consentGrantMutation.isPending ? "Registrando..." : "Aceitar e continuar"}
            </Button>
          </div>
        </DialogContent>
      </Dialog>

      {requiresConsent && !consentModalOpen && (
        <div className="tokyo-panel rounded-xl border-amber-400/30 px-4 py-3 text-sm">
          <p className="font-semibold text-amber-200">Revisor de Mãos indisponível sem consentimento</p>
          <p className="mt-1 text-xs text-amber-100/90">
            Esta aba permanece disponível para leitura, mas as ações de análise, replay e armazenamento ficam bloqueadas até o aceite do termo.
          </p>
          <div className="mt-2 flex justify-end">
            <Button size="sm" className="bg-cyan-400 text-slate-950 hover:bg-cyan-300" onClick={() => setConsentModalOpen(true)}>
              Ler termo e aceitar
            </Button>
          </div>
        </div>
      )}

      <div className="grid gap-3 xl:grid-cols-[minmax(0,1fr)_360px]">
        <HandHistoryInput
          value={rawInput}
          onChange={setRawInput}
          selectedPlatform={selectedPlatform}
          onPlatformChange={setSelectedPlatform}
          onSubmit={handleSubmitToTable}
          compact
          onRequestExpand={() => {}}
        />

        <Card className="tokyo-panel rounded-2xl">
          <CardHeader className="pb-2">
            <CardTitle className="text-base">Ações da análise</CardTitle>
          </CardHeader>
          <CardContent className="space-y-3 text-sm text-muted-foreground">
            <p className="text-xs text-white/70">1) Envie para mesa para revisão mão a mão. 2) Analise o torneio. 3) Salve no histórico.</p>
            <div className="flex flex-col gap-2">
              <Button
                onClick={handleAnalyzeTournament}
                disabled={!hasHands || analyzeMutation.isPending}
                className="bg-cyan-400 text-slate-950 hover:bg-cyan-300"
              >
                {analyzeMutation.isPending ? "Analisando torneio..." : "Analisar torneio"}
              </Button>
              <Button
                variant="outline"
                onClick={handleSaveTournamentToHistory}
                disabled={!hasHands || saveToHistoryMutation.isPending}
              >
                {saveToHistoryMutation.isPending ? "Salvando no histórico..." : "Adicionar este torneio aos dados do jogador"}
              </Button>
              <Button
                variant="outline"
                onClick={handleDownloadAnalysisPdf}
                disabled={!analyzeMutation.data || analyzeMutation.isPending}
              >
                Baixar analise em PDF
              </Button>
              <Button
                variant="destructive"
                onClick={handleClearReplayHistory}
                disabled={clearReplayHistoryMutation.isPending}
              >
                {clearReplayHistoryMutation.isPending ? "Limpando histórico..." : "Limpar histórico do revisor"}
              </Button>
              <Button
                variant="outline"
                onClick={handleCompactReplayStorage}
                disabled={compactReplayStorageMutation.isPending}
              >
                {compactReplayStorageMutation.isPending ? "Compactando armazenamento..." : "Compactar armazenamento do revisor"}
              </Button>
            </div>
          </CardContent>
        </Card>
      </div>

      <Card className="tokyo-panel rounded-2xl">
        <CardHeader>
          <CardTitle>Painel de leitura</CardTitle>
        </CardHeader>
        <CardContent>
          <Tabs value={activeTab} onValueChange={(value) => setActiveTab(value as "tournament" | "player" | "positions")}>
            <div className="overflow-x-auto pb-1">
              <TabsList className="flex min-w-max gap-1 bg-slate-950/55 border border-cyan-400/20 rounded-xl p-1 md:grid md:w-full md:min-w-0 md:grid-cols-3 md:gap-0">
                <TabsTrigger value="tournament" className="min-w-[148px] md:min-w-0 data-[state=active]:bg-cyan-400/20 data-[state=active]:text-cyan-100 data-[state=active]:shadow-[0_0_0_1px_rgba(34,211,238,0.35)]">Análise do Torneio</TabsTrigger>
                <TabsTrigger value="player" className="min-w-[148px] md:min-w-0 data-[state=active]:bg-cyan-400/20 data-[state=active]:text-cyan-100 data-[state=active]:shadow-[0_0_0_1px_rgba(34,211,238,0.35)]">Dados do Jogador</TabsTrigger>
                <TabsTrigger value="positions" className="min-w-[148px] md:min-w-0 data-[state=active]:bg-cyan-400/20 data-[state=active]:text-cyan-100 data-[state=active]:shadow-[0_0_0_1px_rgba(34,211,238,0.35)]">Posições e Foco</TabsTrigger>
              </TabsList>
            </div>

            <TabsContent value="tournament" className="mt-4 space-y-4">
              {!analyzeMutation.data && (
                <p className="text-sm text-muted-foreground">
                  A aba de torneio mostra apenas o torneio recém-importado. Clique em "Analisar torneio" para preencher.
                </p>
              )}

              {analyzeMutation.data && (
                <>
                  <TabConfidenceHeader
                    level={generalConfidenceLevel}
                    hands={Number(tournamentOpportunities.hands ?? 0)}
                  />

                  <div className="grid gap-2 md:grid-cols-2 xl:grid-cols-3">
                    <div className="tokyo-chip rounded-lg p-3 text-sm">
                      <p className="text-xs text-white/60">Buy-in</p>
                      <p className="tokyo-data-value font-semibold text-cyan-100">${(analyzeMutation.data.tournament.buyIn / 100).toFixed(2).replace(".", ",")}</p>
                    </div>
                    <div className="tokyo-chip rounded-lg p-3 text-sm">
                      <p className="text-xs text-white/60">ABI do torneio</p>
                      <p className="tokyo-data-value font-semibold text-cyan-100">${(analyzeMutation.data.tournament.abiValue / 100).toFixed(2).replace(".", ",")}</p>
                    </div>
                    <div className="tokyo-chip rounded-lg p-3 text-sm">
                      <p className="text-xs text-white/60">Colocação final</p>
                      <p className="tokyo-data-value font-semibold text-cyan-100">{analyzeMutation.data.tournament.finalPositionLabel ?? "-"}</p>
                    </div>
                    <div className="tokyo-chip rounded-lg p-3 text-sm">
                      <p className="text-xs text-white/60">Mãos analisadas</p>
                      <p className="tokyo-data-value font-semibold text-cyan-100">{analyzeMutation.data.tournament.handsAnalyzed}</p>
                    </div>
                    <div className="tokyo-chip rounded-lg p-3 text-sm">
                      <p className="text-xs text-white/60">Showdowns</p>
                      <p className="tokyo-data-value font-semibold text-cyan-100">{analyzeMutation.data.tournament.showdownsCount}</p>
                    </div>
                    <div className="tokyo-chip rounded-lg p-3 text-sm">
                      <p className="text-xs text-white/60">Tempo do torneio</p>
                      <p className="tokyo-data-value font-semibold text-cyan-100">{analyzeMutation.data.tournament.durationMinutes ? `${analyzeMutation.data.tournament.durationMinutes} min` : "-"}</p>
                    </div>
                    <div className="tokyo-chip rounded-lg p-3 text-sm md:col-span-2">
                      <p className="text-xs text-white/60">Posição mais lucrativa no torneio</p>
                      <p className="tokyo-data-value font-semibold text-cyan-100">
                        {analyzeMutation.data.tournament.bestPosition
                          ? `${analyzeMutation.data.tournament.bestPosition.position} (${formatBb((analyzeMutation.data.tournament.bestPosition as any).netBb)})`
                          : "-"}
                      </p>
                    </div>
                  </div>

                  {(() => {
                    const stats = analyzeMutation.data.stats;
                    const opp = tournamentOpportunities;
                    const metricColor = (key: MetricKey, value: number) => {
                      const s = getMetricStatus(key, value);
                      if (s === "ok") return "text-emerald-400";
                      if (s === "below") return "text-red-400";
                      return "text-amber-400";
                    };
                    const sampleText = (made: number | null, of: number | null) => {
                      if (of == null || of <= 0) return null;
                      if (made == null) return `${of} amostras`;
                      return `${made}/${of}`;
                    };
                    type CardDef = {
                      key: MetricKey;
                      label: string;
                      value: number;
                      display: string;
                      hint: string;
                      made: number | null;
                      of: number | null;
                    };
                    const pct = (v: number) => formatPercent(v);
                    const roundMade = (percent: number, of: number) => Math.round((percent / 100) * of);
                    const preFlop: CardDef[] = [
                      { key: "vpip", label: "VPIP", value: stats.vpip, display: pct(stats.vpip), hint: "Mãos em que você entrou voluntariamente no pote.", made: roundMade(stats.vpip, opp.hands), of: opp.hands },
                      { key: "pfr", label: "PFR", value: stats.pfr, display: pct(stats.pfr), hint: "Mãos com raise pré-flop.", made: roundMade(stats.pfr, opp.hands), of: opp.hands },
                      { key: "rfi", label: "RFI", value: (stats as any).rfi ?? 0, display: pct((stats as any).rfi ?? 0), hint: "Raise first in: abriu o pote com raise.", made: opp.rfi ? roundMade((stats as any).rfi ?? 0, opp.rfi) : null, of: opp.rfi || null },
                      { key: "coldCall", label: "COLD CALL", value: (stats as any).coldCall ?? 0, display: pct((stats as any).coldCall ?? 0), hint: "Pagou um raise pré-flop sem investimento prévio.", made: opp.coldCall ? roundMade((stats as any).coldCall ?? 0, opp.coldCall) : null, of: opp.coldCall || null },
                      { key: "threeBet", label: "3-BET", value: stats.threeBet, display: pct(stats.threeBet), hint: "Re-raise pré-flop contra um open.", made: roundMade(stats.threeBet, opp.hands), of: opp.hands },
                      { key: "squeeze", label: "SQUEEZE", value: (stats as any).squeeze ?? 0, display: pct((stats as any).squeeze ?? 0), hint: "3-bet contra raise + caller(s).", made: opp.squeeze ? roundMade((stats as any).squeeze ?? 0, opp.squeeze) : null, of: opp.squeeze || null },
                      { key: "resteal", label: "RESTEAL", value: (stats as any).resteal ?? 0, display: pct((stats as any).resteal ?? 0), hint: "3-bet em blind contra tentativa de roubo.", made: opp.resteal ? roundMade((stats as any).resteal ?? 0, opp.resteal) : null, of: opp.resteal || null },
                      { key: "attemptToSteal", label: "ATTEMPT TO STEAL", value: stats.attemptToSteal, display: pct(stats.attemptToSteal), hint: "Tentativa de roubo em posição final (CO/BTN/SB).", made: opp.steal > 0 ? roundMade(stats.attemptToSteal, opp.steal) : null, of: opp.steal || null },
                    ];
                    const preFlopDefense: CardDef[] = [
                      { key: "bbDefense", label: "DEFESA DE BB", value: stats.bbDefense, display: pct(stats.bbDefense), hint: "Defesa do big blind em vez de foldar.", made: opp.bbDefense > 0 ? roundMade(stats.bbDefense, opp.bbDefense) : null, of: opp.bbDefense || null },
                      { key: "foldToSteal", label: "FOLD TO STEAL", value: (stats as any).foldToSteal ?? 0, display: pct((stats as any).foldToSteal ?? 0), hint: "Fold no blind contra raise em posição final.", made: opp.foldToSteal ? roundMade((stats as any).foldToSteal ?? 0, opp.foldToSteal) : null, of: opp.foldToSteal || null },
                      { key: "foldTo3Bet", label: "FOLD TO 3-BET", value: (stats as any).foldTo3Bet ?? 0, display: pct((stats as any).foldTo3Bet ?? 0), hint: "Fold ao open-raise quando sofre 3-bet.", made: opp.foldTo3Bet ? roundMade((stats as any).foldTo3Bet ?? 0, opp.foldTo3Bet) : null, of: opp.foldTo3Bet || null },
                    ];
                    const postFlop: CardDef[] = [
                      { key: "cbetFlop", label: "C-BET FLOP", value: stats.cbetFlop, display: pct(stats.cbetFlop), hint: "C-bet no flop como agressor pré-flop.", made: opp.cbetFlop > 0 ? roundMade(stats.cbetFlop, opp.cbetFlop) : null, of: opp.cbetFlop || null },
                      { key: "cbetIp", label: "C-BET IP", value: (stats as any).cbetIp ?? 0, display: pct((stats as any).cbetIp ?? 0), hint: "C-bet flop em posição.", made: opp.cbetIp ? roundMade((stats as any).cbetIp ?? 0, opp.cbetIp) : null, of: opp.cbetIp || null },
                      { key: "cbetOop", label: "C-BET OOP", value: (stats as any).cbetOop ?? 0, display: pct((stats as any).cbetOop ?? 0), hint: "C-bet flop fora de posição.", made: opp.cbetOop ? roundMade((stats as any).cbetOop ?? 0, opp.cbetOop) : null, of: opp.cbetOop || null },
                      { key: "cbetTurn", label: "C-BET TURN", value: stats.cbetTurn, display: pct(stats.cbetTurn), hint: "Segundo barril no turn após c-bet flop.", made: opp.cbetTurn > 0 ? roundMade(stats.cbetTurn, opp.cbetTurn) : null, of: opp.cbetTurn || null },
                      { key: "foldToCbet", label: "FOLD VS C-BET", value: stats.foldToCbet, display: pct(stats.foldToCbet), hint: "Fold contra c-bet no flop.", made: opp.foldToCbet > 0 ? roundMade(stats.foldToCbet, opp.foldToCbet) : null, of: opp.foldToCbet || null },
                      { key: "floatFlop", label: "FLOAT FLOP", value: (stats as any).floatFlop ?? 0, display: pct((stats as any).floatFlop ?? 0), hint: "Pagou c-bet flop IP e atacou o turn.", made: opp.floatFlop ? roundMade((stats as any).floatFlop ?? 0, opp.floatFlop) : null, of: opp.floatFlop || null },
                      { key: "checkRaiseFlop", label: "CHECK-RAISE FLOP", value: (stats as any).checkRaiseFlop ?? 0, display: pct((stats as any).checkRaiseFlop ?? 0), hint: "Check + raise no flop.", made: opp.checkRaiseFlop ? roundMade((stats as any).checkRaiseFlop ?? 0, opp.checkRaiseFlop) : null, of: opp.checkRaiseFlop || null },
                    ];
                    const general: CardDef[] = [
                      { key: "aggressionFactor", label: "AGGRESSION", value: stats.aggressionFactor, display: stats.aggressionFactor.toFixed(2), hint: "Razão entre ações agressivas (bet/raise) e calls pós-flop.", made: Number((opp as any).aggressionActions ?? 0), of: Number((opp as any).aggressionCalls ?? 0) },
                      { key: "wtsd", label: "WTSD", value: stats.wtsd, display: pct(stats.wtsd), hint: "Frequência de ida ao showdown.", made: roundMade(stats.wtsd, opp.hands), of: opp.hands },
                      { key: "wsd", label: "WSD", value: stats.wsd, display: pct(stats.wsd), hint: "Vitória quando chega ao showdown.", made: (() => { const sd = roundMade(stats.wtsd, opp.hands); return sd > 0 ? roundMade(stats.wsd, sd) : 0; })(), of: roundMade(stats.wtsd, opp.hands) },
                      { key: "allInAdjBb100", label: "ALL-IN ADJ BB/100", value: (stats as any).allInAdjBb100 ?? 0, display: `${((stats as any).allInAdjBb100 ?? 0) >= 0 ? "+" : ""}${Number((stats as any).allInAdjBb100 ?? 0).toFixed(2)}`, hint: "Win-rate em BB/100 removendo a sorte dos all-ins pré-showdown (equity × pote − investimento).", made: Number((opp as any).allInAdjSample ?? 0), of: Number((opp as any).allInAdjOpportunities ?? 0) },
                    ];
                    const renderCard = (c: CardDef) => (
                      <div key={c.key} className="rounded-xl border border-white/10 bg-slate-950/70 p-3 shadow-inner">
                        <div className="flex items-start justify-between gap-2">
                          <MetricLabel label={c.label} hint={c.hint} />
                        </div>
                        <p className={`mt-2 text-2xl font-black tracking-tight ${metricColor(c.key, c.value)}`}>{c.display}</p>
                        {sampleText(c.made, c.of) && (
                          <p className="mt-1 text-[11px] text-white/50">{sampleText(c.made, c.of)}</p>
                        )}
                      </div>
                    );
                    return (
                      <div className="space-y-4">
                        <section className="space-y-2">
                          <p className="text-xs font-bold uppercase tracking-[0.18em] text-amber-300">Pré-flop</p>
                          <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-4">
                            {preFlop.map(renderCard)}
                          </div>
                        </section>
                        <section className="space-y-2">
                          <p className="text-xs font-bold uppercase tracking-[0.18em] text-amber-300">Defesa Pré-flop</p>
                          <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-4">
                            {preFlopDefense.map(renderCard)}
                          </div>
                        </section>
                        <section className="space-y-2">
                          <p className="text-xs font-bold uppercase tracking-[0.18em] text-amber-300">Pós-flop</p>
                          <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-4">
                            {postFlop.map(renderCard)}
                          </div>
                        </section>
                        <section className="space-y-2">
                          <p className="text-xs font-bold uppercase tracking-[0.18em] text-amber-300">Geral</p>
                          <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-4">
                            {general.map(renderCard)}
                          </div>
                        </section>
                      </div>
                    );
                  })()}

                  <div className="rounded-xl bg-blue-500/8 p-3 text-xs text-blue-100 shadow-[inset_0_1px_0_rgba(59,130,246,0.08)]">
                    Esses valores são referências práticas de jogadores sólidos, não regras fixas de GTO.
                  </div>

                  <div className="grid gap-3 md:grid-cols-2">
                    <div className="rounded-xl bg-amber-500/8 p-3 text-sm shadow-[inset_0_1px_0_rgba(245,158,11,0.08)]">
                      <p className="mb-2 font-semibold text-amber-200">Principais alertas desse torneio</p>
                      {analyzeMutation.data.alerts.length > 0
                        ? analyzeMutation.data.alerts.map((alert) => <p key={alert}>- {alert}</p>)
                        : <p className="text-white/70">Sem alertas relevantes para esta amostra.</p>}
                    </div>
                    <div className="rounded-xl bg-emerald-500/8 p-3 text-sm shadow-[inset_0_1px_0_rgba(16,185,129,0.08)]">
                      <p className="mb-2 font-semibold text-emerald-200">Principais pontos fortes desse torneio</p>
                      {analyzeMutation.data.strengths.length > 0
                        ? analyzeMutation.data.strengths.map((strength) => <p key={strength}>- {strength}</p>)
                        : <p className="text-white/70">Sem pontos fortes destacados para esta amostra.</p>}
                    </div>
                  </div>

                  <div className="tokyo-panel rounded-lg p-3 text-sm">
                    <p className="mb-2 font-semibold text-cyan-100">Ganhos/perdas por posição (em BB)</p>
                    {analyzeMutation.data.tournament.chipsByPosition.length > 0 ? (
                      <div className="grid gap-1 md:grid-cols-2 xl:grid-cols-3">
                        {analyzeMutation.data.tournament.chipsByPosition.map((item) => (
                          <p key={item.position}>
                            {item.position}: <span className="font-semibold text-cyan-100">{formatBb((item as any).netBb)}</span>
                          </p>
                        ))}
                      </div>
                    ) : (
                      <p className="text-white/70">Sem distribuição de posição disponível.</p>
                    )}
                  </div>
                </>
              )}
            </TabsContent>

            <TabsContent value="player" className="mt-4 space-y-4">
              <TabConfidenceHeader level={playerConfidenceLevel} hands={playerHands} />

              {playerHistoryQuery.isLoading && <p className="text-sm text-muted-foreground">Carregando consolidado histórico...</p>}
              
              {playerHistoryQuery.isError && (
                <p className="text-sm text-red-400">Erro ao carregar histórico: {playerHistoryQuery.error?.message}</p>
              )}

              {!playerHistoryQuery.isLoading && !playerHistoryQuery.data && !playerHistoryQuery.isError && (
                <p className="text-sm text-muted-foreground">Sem histórico consolidado ainda. Use "Adicionar este torneio aos dados do jogador" para atualizar esta aba.</p>
              )}

              {playerHistoryQuery.data && playerHistoryQuery.data.summary.totalTournaments > 0 && (
                <>
                  <div className="grid gap-2 md:grid-cols-2 xl:grid-cols-3">
                    <div className="tokyo-chip rounded-lg p-3 text-sm">
                      <p className="text-xs text-white/60">Total de torneios revisados</p>
                      <p className="tokyo-data-value font-semibold text-cyan-100">{playerHistoryQuery.data.summary.totalTournaments}</p>
                    </div>
                    <div className="tokyo-chip rounded-lg p-3 text-sm">
                      <p className="text-xs text-white/60">Total de mãos analisadas</p>
                      <p className="tokyo-data-value font-semibold text-cyan-100">{playerHistoryQuery.data.summary.totalHands}</p>
                    </div>
                    <div className="tokyo-chip rounded-lg p-3 text-sm">
                      <MetricLabel label="ABI médio" hint="Média de buy-in + fee dos torneios históricos, com moeda explícita." />
                      <p className="tokyo-data-value font-semibold text-cyan-100">{formatMinorMoney(playerHistoryQuery.data.summary.abiAverage, (playerHistoryQuery.data.summary as any).abiAverageCurrency)}</p>
                    </div>
                    <div className="tokyo-chip rounded-lg p-3 text-sm">
                      <p className="text-xs text-white/60">Colocação média</p>
                      <p className="tokyo-data-value font-semibold text-cyan-100">{playerHistoryQuery.data.summary.avgPlacement || "-"}</p>
                    </div>
                    <div className="tokyo-chip rounded-lg p-3 text-sm">
                      <p className="text-xs text-white/60">Melhor colocação</p>
                      <p className="tokyo-data-value font-semibold text-cyan-100">{playerHistoryQuery.data.summary.bestPlacement ? `${playerHistoryQuery.data.summary.bestPlacement}º` : "-"}</p>
                    </div>
                  </div>

                  <div className="grid gap-2 md:grid-cols-2 xl:grid-cols-3">
                    <div className="tokyo-metric rounded-lg p-3 text-sm">
                      <MetricLabel label="VPIP médio" hint="Percentual médio de mãos em que você entra voluntariamente no pote." />
                      <p className="mt-1 font-semibold text-cyan-100">{formatPercent(playerHistoryQuery.data.summary.vpipAvg)}</p>
                      <p className="mt-1 text-[11px] text-white/50">{formatMadeOf(roundMade(Number(playerHistoryQuery.data.summary.vpipAvg ?? 0), historicalOppSafe.hands), historicalOppSafe.hands)}</p>
                    </div>
                    <div className="tokyo-metric rounded-lg p-3 text-sm">
                      <MetricLabel label="PFR médio" hint="Percentual médio de mãos com aumento pré-flop." />
                      <p className="mt-1 font-semibold text-cyan-100">{formatPercent(playerHistoryQuery.data.summary.pfrAvg)}</p>
                      <p className="mt-1 text-[11px] text-white/50">{formatMadeOf(roundMade(Number(playerHistoryQuery.data.summary.pfrAvg ?? 0), historicalOppSafe.hands), historicalOppSafe.hands)}</p>
                    </div>
                    <div className="tokyo-metric rounded-lg p-3 text-sm">
                      <MetricLabel label="3-bet médio" hint="Frequência média de reaumento pré-flop." />
                      <p className="mt-1 font-semibold text-cyan-100">{formatPercent(playerHistoryQuery.data.summary.threeBetAvg)}</p>
                      <p className="mt-1 text-[11px] text-white/50">{formatMadeOf(roundMade(Number(playerHistoryQuery.data.summary.threeBetAvg ?? 0), historicalOppSafe.hands), historicalOppSafe.hands)}</p>
                    </div>
                    <div className="tokyo-metric rounded-lg p-3 text-sm">
                      <MetricLabel label="Defesa média de BB" hint="Percentual médio de defesa do big blind em spots aplicáveis." />
                      <p className="mt-1 font-semibold text-cyan-100">{formatPercent(playerHistoryQuery.data.summary.bbDefenseAvg)}</p>
                      <p className="mt-1 text-[11px] text-white/50">{formatMadeOf(roundMade(Number(playerHistoryQuery.data.summary.bbDefenseAvg ?? 0), historicalOppSafe.bbDefense), historicalOppSafe.bbDefense)}</p>
                    </div>
                    <div className="tokyo-metric rounded-lg p-3 text-sm">
                      <MetricLabel label="C-bet média" hint="Frequência média de c-bet no flop." />
                      <p className="mt-1 font-semibold text-cyan-100">{formatPercent(playerHistoryQuery.data.summary.cbetFlopAvg)}</p>
                      <p className="mt-1 text-[11px] text-white/50">{formatMadeOf(roundMade(Number(playerHistoryQuery.data.summary.cbetFlopAvg ?? 0), historicalOppSafe.cbetFlop), historicalOppSafe.cbetFlop)}</p>
                    </div>
                    <div className="tokyo-metric rounded-lg p-3 text-sm">
                      <MetricLabel label="Attempt to Steal médio" hint="Frequência média de tentativa de steal em posição final." />
                      <p className="mt-1 font-semibold text-cyan-100">{formatPercent(playerHistoryQuery.data.summary.attemptToStealAvg)}</p>
                      <p className="mt-1 text-[11px] text-white/50">{formatMadeOf(roundMade(Number(playerHistoryQuery.data.summary.attemptToStealAvg ?? 0), historicalOppSafe.steal), historicalOppSafe.steal)}</p>
                    </div>
                    <div className="tokyo-metric rounded-lg p-3 text-sm">
                      <MetricLabel label="Aggression Factor médio" hint="Razão média entre ações agressivas e calls no histórico." />
                      <p className="mt-1 font-semibold text-cyan-100">{Number(playerHistoryQuery.data.summary.aggressionFactorAvg ?? 0).toFixed(2)}</p>
                      <p className="mt-1 text-[11px] text-white/50">{formatMadeOf(Number((historicalOpp as any)?.aggressionActions ?? 0), Number((historicalOpp as any)?.aggressionCalls ?? 0))}</p>
                    </div>
                  </div>

                  <div className="grid gap-3 md:grid-cols-2">
                    <div className="tokyo-panel rounded-lg p-3 text-sm">
                      <p className="mb-1 font-semibold text-cyan-100">Posição mais lucrativa historicamente</p>
                      <p>
                        {playerHistoryQuery.data.positions.mostProfitable
                          ? `${playerHistoryQuery.data.positions.mostProfitable.position} (${formatBb((playerHistoryQuery.data.positions.mostProfitable as any).netBb)})`
                          : "-"}
                      </p>
                      <p className="mt-2 mb-1 font-semibold text-cyan-100">Posição menos lucrativa historicamente</p>
                      <p>
                        {playerHistoryQuery.data.positions.leastProfitable
                          ? `${playerHistoryQuery.data.positions.leastProfitable.position} (${formatBb((playerHistoryQuery.data.positions.leastProfitable as any).netBb)})`
                          : "-"}
                      </p>
                    </div>
                    <div className="tokyo-panel rounded-lg p-3 text-sm">
                      <p className="mb-1 font-semibold text-cyan-100">Leaks recorrentes</p>
                      {playerHistoryQuery.data.leakFlags.length > 0
                        ? playerHistoryQuery.data.leakFlags.slice(0, 6).map((leak) => (
                          <p key={leak.id}>- [{leak.severity}] {leak.description}</p>
                        ))
                        : <p className="text-white/70">Sem leaks ativos registrados.</p>}
                      <p className="mt-3 mb-1 font-semibold text-cyan-100">Tendências recentes</p>
                      <p>{playerHistoryQuery.data.trends.note ?? "Sem dados suficientes para tendência recente."}</p>
                    </div>
                  </div>
                </>
              )}
            </TabsContent>

            <TabsContent value="positions" className="mt-4 space-y-4">
              <TabConfidenceHeader level={positionsConfidenceLevel} hands={positionsHands} />

              {playerHistoryQuery.isLoading && <p className="text-sm text-muted-foreground">Carregando dados de posições...</p>}

              {!playerHistoryQuery.isLoading && !playerHistoryQuery.data && (
                <p className="text-sm text-muted-foreground">Adicione torneios para análise de posições e foco de estudos.</p>
              )}

              {playerHistoryQuery.data && (
                <div className="tokyo-panel rounded-lg p-3 text-sm">
                  <p className="mb-2 font-semibold text-cyan-100">Posições jogadas historicamente</p>
                  {playerHistoryQuery.data.positions.byPosition?.length > 0 ? (
                    <div className="grid gap-1 md:grid-cols-2 xl:grid-cols-3">
                      {playerHistoryQuery.data.positions.byPosition.map((item) => (
                        <div key={`pos-hist-${item.position}`}>
                          <p>
                            {item.position}: {item.handsPlayed} mãos · <span className="font-semibold text-cyan-100">{formatBb((item as any).netBb)}</span>
                          </p>
                        </div>
                      ))}
                    </div>
                  ) : (
                    <p className="text-white/70">Sem dados históricos de posição. Adicione torneios para consolidar dados.</p>
                  )}
                </div>
              )}

              <div className="grid gap-3 md:grid-cols-3">
                <div className="tokyo-panel rounded-lg p-3 text-sm">
                  <p className="mb-2 font-semibold text-cyan-100">Onde está mais lucrativo</p>
                  <p>
                    {playerHistoryQuery.data?.positions?.mostProfitable
                      ? `${playerHistoryQuery.data.positions.mostProfitable.position} (${formatBb((playerHistoryQuery.data.positions.mostProfitable as any).netBb)})`
                      : "-"}
                  </p>
                </div>

                <div className="tokyo-panel rounded-lg p-3 text-sm">
                  <p className="mb-2 font-semibold text-cyan-100">Onde está menos lucrativo</p>
                  <p>
                    {playerHistoryQuery.data?.positions?.leastProfitable
                      ? `${playerHistoryQuery.data.positions.leastProfitable.position} (${formatBb((playerHistoryQuery.data.positions.leastProfitable as any).netBb)})`
                      : "-"}
                  </p>
                </div>

                <div className="rounded-xl border border-amber-400/20 bg-amber-500/10 p-3 text-sm shadow-[inset_0_1px_0_rgba(245,158,11,0.08)]">
                  <p className="mb-2 font-semibold text-amber-100">Posição de foco</p>
                  {(() => {
                    const focusPosition = playerHistoryQuery.data?.positions?.leastProfitable?.position;
                    const focusSample = playerHistoryQuery.data?.positions?.byPosition?.find((item) => item.position === focusPosition);
                    if (!focusPosition) {
                      return <p className="text-white/70">Sem foco definido ainda.</p>;
                    }

                    return (
                      <>
                        <p className="font-semibold text-amber-50">{focusPosition}</p>
                        <p className="mt-1 text-xs text-amber-100/80">
                          {focusSample?.handsPlayed ?? 0} mãos analisadas nessa posição.
                        </p>
                        <p className="mt-2 text-xs text-amber-200/90">
                          Prioridade: revisar ranges de open, defesa e linhas de c-bet desse spot.
                        </p>
                      </>
                    );
                  })()}
                </div>
              </div>

              <div className="rounded-xl bg-emerald-500/8 p-3 text-sm shadow-[inset_0_1px_0_rgba(16,185,129,0.08)]">
                <p className="mb-2 font-semibold text-emerald-100">Foco de estudos sugerido</p>
                {studyFocusSuggestions.map((item) => (
                  <p key={item}>- {item}</p>
                ))}
                <p className="mt-3 text-xs text-emerald-200/90">
                  Em versões futuras, este bloco vai integrar treino automático por posição e por leak recorrente.
                </p>
              </div>

              {playerHistoryQuery.data && (
                <div className="tokyo-panel rounded-lg p-3 text-sm">
                  <p className="mb-2 font-semibold text-cyan-100">Leitura rápida por benchmark (histórico do jogador)</p>
                  {(() => {
                    const historicalValues: Partial<Record<MetricKey, number>> = {
                      vpip: Number(playerHistoryQuery.data.summary.vpipAvg ?? 0),
                      pfr: Number(playerHistoryQuery.data.summary.pfrAvg ?? 0),
                      threeBet: Number(playerHistoryQuery.data.summary.threeBetAvg ?? 0),
                      bbDefense: Number(playerHistoryQuery.data.summary.bbDefenseAvg ?? 0),
                      attemptToSteal: Number(playerHistoryQuery.data.summary.attemptToStealAvg ?? 0),
                      cbetFlop: Number(playerHistoryQuery.data.summary.cbetFlopAvg ?? 0),
                      cbetTurn: Number(playerHistoryQuery.data.summary.cbetTurnAvg ?? 0),
                      foldToCbet: Number((playerHistoryQuery.data.summary as any).foldToCbetAvg ?? 0),
                      aggressionFactor: Number(playerHistoryQuery.data.summary.aggressionFactorAvg ?? 0),
                      wtsd: Number((playerHistoryQuery.data.summary as any).wtsdAvg ?? 0),
                      wsd: Number((playerHistoryQuery.data.summary as any).wsdAvg ?? 0),
                    };

                    const histOpp = ((playerHistoryQuery.data.summary as any)?.opportunities ?? {}) as Record<string, number>;
                    const denominatorFor = (key: MetricKey): number => {
                      if (key === "vpip" || key === "pfr" || key === "threeBet") return Number(histOpp.hands ?? 0);
                      if (key === "cbetFlop") return Number(histOpp.cbetFlop ?? 0);
                      if (key === "cbetTurn") return Number(histOpp.cbetTurn ?? 0);
                      if (key === "foldToCbet") return Number(histOpp.foldToCbet ?? 0);
                      if (key === "bbDefense") return Number(histOpp.bbDefense ?? 0);
                      if (key === "attemptToSteal") return Number(histOpp.steal ?? 0);
                      if (key === "wtsd" || key === "wsd") return Number(histOpp.showdownHands ?? 0);
                      return Number(histOpp.hands ?? 0);
                    };
                    const sections: Array<{ title: string; keys: MetricKey[] }> = [
                      { title: "Pré-flop", keys: ["vpip", "pfr", "threeBet", "attemptToSteal"] },
                      { title: "Defesa Pré-flop", keys: ["bbDefense"] },
                      { title: "Pós-flop", keys: ["cbetFlop", "cbetTurn", "foldToCbet"] },
                      { title: "Geral", keys: ["aggressionFactor", "wtsd", "wsd"] },
                    ];
                    return (
                      <div className="space-y-3">
                        {sections.map((section) => (
                          <section key={section.title} className="space-y-2">
                            <p className="text-xs font-bold uppercase tracking-[0.18em] text-amber-300">{section.title}</p>
                            <div className="grid gap-2 md:grid-cols-2">
                              {section.keys.map((key) => {
                                const benchmark = BENCHMARKS[key];
                                const value = Number(historicalValues[key] ?? 0);
                                const of = denominatorFor(key);
                                const made = key === "aggressionFactor"
                                  ? Number(histOpp.aggressionActions ?? 0)
                                  : roundMade(value, of);
                                const ratioOf = key === "aggressionFactor"
                                  ? Number(histOpp.aggressionCalls ?? 0)
                                  : of;
                                return (
                                  <div key={`benchmark-${key}`} className="tokyo-metric rounded-md p-2">
                                    <div className="font-semibold text-cyan-100">
                                      <MetricLabel label={benchmark.label} hint={benchmark.interpretation} />
                                      <span>: {key === "aggressionFactor" ? value.toFixed(2) : `${value}%`} · {metricStatusBadge(getMetricStatus(key, value))}</span>
                                    </div>
                                    <p className="text-xs text-white/50">{formatMadeOf(made, ratioOf)}</p>
                                    <p className="text-xs text-white/70">Faixa comum: {benchmark.min}{key === "aggressionFactor" ? "" : "%"} - {benchmark.max}{key === "aggressionFactor" ? "" : "%"}</p>
                                    <p className="text-xs text-white/60">{metricStatusText(key, value)}</p>
                                  </div>
                                );
                              })}
                            </div>
                          </section>
                        ))}
                      </div>
                    );
                  })()}
                </div>
              )}
            </TabsContent>
          </Tabs>
        </CardContent>
      </Card>

      <div className="rounded-2xl bg-gradient-to-b from-amber-500/6 to-transparent px-4 py-3 text-sm">
        <details className="text-xs text-amber-100/85">
          <summary className="cursor-pointer font-semibold text-amber-200">Sobre estatística e metodologia (saiba mais)</summary>
          <p className="mt-2 text-amber-100/75">
            Conteúdo avançado com gráficos, faixas, fórmula e premissas. Expanda apenas quando quiser aprofundar.
          </p>
          <div className="mt-3 space-y-2 rounded-2xl bg-black/15 p-3">

        <div className="grid gap-3 xl:grid-cols-2">
          <div className="rounded-xl bg-black/20 p-3">
            <p className="mb-2 text-xs font-semibold text-amber-200">Amostra para detectar padrões específicos (efeito de 5% a 10%)</p>
            <div className="h-[280px] w-full">
              <ResponsiveContainer width="100%" height="100%">
                <LineChart data={SPECIFIC_PATTERN_SAMPLE_DATA} margin={{ top: 8, right: 12, left: 0, bottom: 8 }}>
                  <CartesianGrid strokeDasharray="3 3" stroke="rgba(251,191,36,0.18)" />
                  <XAxis dataKey="spot" tick={{ fill: "rgba(254,243,199,0.85)", fontSize: 11 }} />
                  <YAxis tick={{ fill: "rgba(254,243,199,0.85)", fontSize: 11 }} />
                  <RechartsTooltip
                    contentStyle={{ background: "#0b1120", border: "1px solid rgba(251,191,36,0.35)", color: "#fde68a" }}
                    labelStyle={{ color: "#fef3c7" }}
                  />
                  <Legend wrapperStyle={{ color: "#fde68a", fontSize: "12px" }} />
                  <Line type="monotone" dataKey="low" name="Baixa (70%)" stroke="#60a5fa" strokeWidth={2} dot={{ r: 3 }} />
                  <Line type="monotone" dataKey="moderate" name="Moderada (80%)" stroke="#f97316" strokeWidth={2} dot={{ r: 3 }} />
                  <Line type="monotone" dataKey="medium" name="Média (90%)" stroke="#22c55e" strokeWidth={2} dot={{ r: 3 }} />
                  <Line type="monotone" dataKey="high" name="Alta (95%)" stroke="#ef4444" strokeWidth={2} dot={{ r: 3 }} />
                  <Line type="monotone" dataKey="veryHigh" name="Muito Alta (99%)" stroke="#a78bfa" strokeWidth={2} dot={{ r: 3 }} />
                </LineChart>
              </ResponsiveContainer>
            </div>
          </div>

          <div className="rounded-xl bg-black/20 p-3">
            <p className="mb-2 text-xs font-semibold text-amber-200">Mãos para estimar winrate (margem de erro +/-2 BB/100)</p>
            <div className="h-[280px] w-full">
              <ResponsiveContainer width="100%" height="100%">
                <BarChart data={WINRATE_SAMPLE_DATA} margin={{ top: 8, right: 12, left: 0, bottom: 8 }}>
                  <CartesianGrid strokeDasharray="3 3" stroke="rgba(251,191,36,0.18)" />
                  <XAxis dataKey="confidence" tick={{ fill: "rgba(254,243,199,0.85)", fontSize: 11 }} />
                  <YAxis tick={{ fill: "rgba(254,243,199,0.85)", fontSize: 11 }} />
                  <RechartsTooltip
                    formatter={(value: number) => value.toLocaleString("pt-BR")}
                    contentStyle={{ background: "#0b1120", border: "1px solid rgba(251,191,36,0.35)", color: "#fde68a" }}
                    labelStyle={{ color: "#fef3c7" }}
                  />
                  <Legend wrapperStyle={{ color: "#fde68a", fontSize: "12px" }} />
                  <Bar dataKey="lowVariance" name="Variância Baixa" fill="#4b6fa8">
                    <LabelList dataKey="lowVariance" position="top" formatter={(value: number) => value.toLocaleString("pt-BR")} className="fill-amber-100 text-[10px]" />
                  </Bar>
                  <Bar dataKey="typicalVariance" name="Variância Típica" fill="#4f9f64">
                    <LabelList dataKey="typicalVariance" position="top" formatter={(value: number) => value.toLocaleString("pt-BR")} className="fill-amber-100 text-[10px]" />
                  </Bar>
                  <Bar dataKey="highVariance" name="Variância Alta" fill="#b9464c">
                    <LabelList dataKey="highVariance" position="top" formatter={(value: number) => value.toLocaleString("pt-BR")} className="fill-amber-100 text-[10px]" />
                  </Bar>
                </BarChart>
              </ResponsiveContainer>
            </div>
          </div>
        </div>

        <details className="mt-3 rounded-xl bg-black/20 p-3 text-xs text-amber-100/85">
          <summary className="cursor-pointer font-semibold text-amber-200">1) Fundamentos e níveis de confiança</summary>
          <div className="mt-2 space-y-2">
            <p>Modelo principal para winrate: n = (Z x sigma / E)^2</p>
            <p>Premissas usuais: sigma = 85 BB/100 (regular consistente), margem de erro E em BB/100.</p>
            <div className="rounded-xl bg-amber-400/6 p-2">
              <p className="font-semibold text-amber-200">Faixas oficiais usadas no produto (por mãos)</p>
              <p className="mt-1">Baixa: até 6.999 · Moderada: 7.000-10.999 · Média: 11.000-18.999 · Alta: 19.000-26.999 · Muito alta: 27.000+</p>
            </div>
            <div className="grid gap-1 sm:grid-cols-2 lg:grid-cols-5">
              <span className="rounded-lg bg-amber-400/8 px-2 py-1">Baixa (70%): Z = 1.04</span>
              <span className="rounded-lg bg-amber-400/8 px-2 py-1">Moderada (80%): Z = 1.28</span>
              <span className="rounded-lg bg-amber-400/8 px-2 py-1">Média (90%): Z = 1.645</span>
              <span className="rounded-lg bg-amber-400/8 px-2 py-1">Alta (95%): Z = 1.96</span>
              <span className="rounded-lg bg-amber-400/8 px-2 py-1">Muito alta (99%): Z = 2.576</span>
            </div>
          </div>
        </details>

        <details className="mt-2 rounded-xl bg-black/20 p-3 text-xs text-amber-100/85">
          <summary className="cursor-pointer font-semibold text-amber-200">2) Padrões de jogador (winrate/ROI)</summary>
          <div className="mt-2 overflow-x-auto">
            <table className="w-full min-w-[680px] border-collapse text-left">
              <thead>
                <tr className="border-b border-amber-300/20 text-amber-200">
                  <th className="py-1 pr-3">Confiabilidade</th>
                  <th className="py-1 pr-3">CI</th>
                  <th className="py-1 pr-3">Mãos (+/-2 BB/100)</th>
                  <th className="py-1">Mãos (+/-1 BB/100)</th>
                </tr>
              </thead>
              <tbody>
                <tr className="border-b border-amber-300/10"><td className="py-1 pr-3">Baixa</td><td className="py-1 pr-3">70%</td><td className="py-1 pr-3">~1.954</td><td className="py-1">~7.815</td></tr>
                <tr className="border-b border-amber-300/10"><td className="py-1 pr-3">Moderada</td><td className="py-1 pr-3">80%</td><td className="py-1 pr-3">~2.960</td><td className="py-1">~11.838</td></tr>
                <tr className="border-b border-amber-300/10"><td className="py-1 pr-3">Média</td><td className="py-1 pr-3">90%</td><td className="py-1 pr-3">~4.888</td><td className="py-1">~19.552</td></tr>
                <tr className="border-b border-amber-300/10"><td className="py-1 pr-3">Alta</td><td className="py-1 pr-3">95%</td><td className="py-1 pr-3">~6.939</td><td className="py-1">~27.756</td></tr>
                <tr><td className="py-1 pr-3">Muito alta</td><td className="py-1 pr-3">99%</td><td className="py-1 pr-3">~11.986</td><td className="py-1">~47.944</td></tr>
              </tbody>
            </table>
          </div>
          <p className="mt-2">
            Nota: perfil muito agressivo pode elevar sigma para ~120 BB/100, quase dobrando a amostra exigida para a mesma precisão.
          </p>
        </details>

        <details className="mt-2 rounded-xl bg-black/20 p-3 text-xs text-amber-100/85">
          <summary className="cursor-pointer font-semibold text-amber-200">3) Padrões de jogo (HUD stats por oportunidade)</summary>
          <div className="mt-2 space-y-2">
            <p>Modelo de proporção binomial: n = (Z / E)^2 x p(1-p)</p>
            <p>
              Aqui o n é em oportunidades (spots válidos), não em mãos totais.
            </p>
            <div className="overflow-x-auto">
              <table className="w-full min-w-[760px] border-collapse text-left">
                <thead>
                  <tr className="border-b border-amber-300/20 text-amber-200">
                    <th className="py-1 pr-3">Confiabilidade</th>
                    <th className="py-1 pr-3">Flop C-bet (50%)</th>
                    <th className="py-1 pr-3">Fold to C-bet (40%)</th>
                    <th className="py-1 pr-3">VPIP (25%)</th>
                    <th className="py-1">PFR (20%)</th>
                  </tr>
                </thead>
                <tbody>
                  <tr className="border-b border-amber-300/10"><td className="py-1 pr-3">Baixa (70%)</td><td className="py-1 pr-3">28</td><td className="py-1 pr-3">26</td><td className="py-1 pr-3">82</td><td className="py-1">70</td></tr>
                  <tr className="border-b border-amber-300/10"><td className="py-1 pr-3">Moderada (80%)</td><td className="py-1 pr-3">41</td><td className="py-1 pr-3">40</td><td className="py-1 pr-3">123</td><td className="py-1">105</td></tr>
                  <tr className="border-b border-amber-300/10"><td className="py-1 pr-3">Média (90%)</td><td className="py-1 pr-3">68</td><td className="py-1 pr-3">65</td><td className="py-1 pr-3">203</td><td className="py-1">174</td></tr>
                  <tr className="border-b border-amber-300/10"><td className="py-1 pr-3">Alta (95%)</td><td className="py-1 pr-3">97</td><td className="py-1 pr-3">93</td><td className="py-1 pr-3">289</td><td className="py-1">246</td></tr>
                  <tr><td className="py-1 pr-3">Muito alta (99%)</td><td className="py-1 pr-3">166</td><td className="py-1 pr-3">160</td><td className="py-1 pr-3">498</td><td className="py-1">425</td></tr>
                </tbody>
              </table>
            </div>
            <p>
              Exemplo: para ~97 oportunidades de flop C-bet, se o spot aparece em ~16% das mãos, são necessárias cerca de 600 mãos totais.
            </p>
          </div>
        </details>

        <details className="mt-2 rounded-xl bg-black/20 p-3 text-xs text-amber-100/85">
          <summary className="cursor-pointer font-semibold text-amber-200">4) Regra de ouro para exploração prática</summary>
          <div className="mt-2 space-y-1">
            <p>Extremos convergem rápido: 90% em 10 spots ou 10% em 10 spots já sugerem tendência forte e explorável.</p>
            <p>Valores próximos do meio (ex: 50%) exigem mais volume antes de classificar padrão consolidado.</p>
          </div>
        </details>

        <div className="mt-2 rounded-xl bg-amber-400/8 p-2 text-xs font-semibold text-amber-300">
          Resumo prático: winrate confiável pede milhares de mãos; leaks por spot podem aparecer com dezenas de oportunidades, mas confirmação forte exige amostra maior.
        </div>
          </div>
        </details>
      </div>
    </div>
  );
}


