import { trpc } from "@/lib/trpc";
import { useAuth } from "@/_core/hooks/useAuth";
import { useBehaviorProfile } from "@/hooks/useBehaviorProfile";
import { useTheme } from "@/contexts/ThemeContext";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Tooltip as UiTooltip, TooltipTrigger, TooltipContent } from "@/components/ui/tooltip";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  AreaChart,
  Area,
  BarChart,
  Bar,
  LineChart,
  Line,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip as RechartsTooltip,
  ResponsiveContainer,
  PieChart,
  Pie,
  Cell,
  ReferenceLine,
} from "recharts";
import {
  TrendingUp,
  TrendingDown,
  Plus,
  Building2,
  Wifi,
  MapPin,
  Pencil,
  BarChart2,
  ChevronDown,
  ChevronRight,
  Settings2,
  CheckCircle2,
  ListChecks,
  Flame,
  Swords,
  Crown,
  Trophy,
  PencilLine,
  Star,
  Eye,
  EyeOff,
  X,
  PlusCircle,
} from "lucide-react";
import { Link } from "wouter";
import { useState, useMemo } from "react";
import { toast } from "sonner";

function formatCurrency(centavos: number): string {
  return new Intl.NumberFormat("pt-BR", { style: "currency", currency: "BRL", minimumFractionDigits: 2, maximumFractionDigits: 2 }).format(centavos / 100);
}
function formatCurrencyCompact(centavos: number): string {
  // Keep same helper name, but do not compact values: always show centavos.
  return formatCurrency(centavos);
}
function formatPercent(v: number) { return `${v >= 0 ? "+" : ""}${v.toFixed(1)}%`; }
function formatByCurrency(centavos: number, currency: string) {
  const amount = centavos / 100;
  if (currency === "USD") return `$${amount.toFixed(2)}`;
  if (currency === "CAD") return `CA$${amount.toFixed(2)}`;
  if (currency === "EUR") return `€${amount.toFixed(2)}`;
  if (currency === "JPY") return `¥${amount.toFixed(2)}`;
  if (currency === "CNY") return `CN¥${amount.toFixed(2)}`;
  return `R$${amount.toFixed(2)}`;
}

const VENUE_COLORS = [
  "#06b6d4","#8b5cf6","#10b981","#f59e0b","#ef4444",
  "#3b82f6","#ec4899","#14b8a6","#f97316","#a855f7",
];

const FX_RATE_META = {
  USD: { label: "Dólar", flagUrl: "/flags/us.svg" },
  CAD: { label: "Dólar CAD", flagUrl: "/flags/ca.svg" },
  EUR: { label: "Euro", flagUrl: "/flags/eu.svg" },
  JPY: { label: "Iene", flagUrl: "/flags/jp.svg" },
  CNY: { label: "Yuan", flagUrl: "/flags/cn.svg" },
} as const;

const GAME_FORMAT_LABELS: Record<string, string> = {
  tournament: "Torneio",
  cash_game: "Cash Game",
  turbo: "Turbo",
  hyper_turbo: "Hyper Turbo",
  sit_and_go: "Sit & Go",
  spin_and_go: "Spin & Go",
  bounty: "Bounty",
  satellite: "Satélite",
  freeroll: "Freeroll",
  home_game: "Home Game",
  heads_up: "Heads-up",
};

type TournamentAccessTab = "favoritos" | "historico";
type UserLeague = "Recreativo" | "Grinder" | "Reg" | "Mid Stakes" | "High Stakes" | "The Edge" | "High Roller";

function getAccessTierEmoji(league: UserLeague): string {
  if (league === "Recreativo") return "🃏";
  if (league === "Grinder") return "♣️";
  if (league === "Reg") return "♠️";
  if (league === "Mid Stakes") return "♦️";
  if (league === "High Stakes") return "♥️";
  if (league === "The Edge") return "🂡";
  return "💰";
}

function getAccessTierLabel(league: UserLeague): string {
  return league === "High Roller" ? "High Roller (interno)" : league;
}

function getLeagueFromLevel(levelInput: number): UserLeague {
  const level = Math.max(0, Math.round(levelInput));
  if (level <= 0) return "Recreativo";
  if (level === 1) return "Grinder";
  if (level === 2) return "Reg";
  if (level === 3) return "Mid Stakes";
  if (level <= 5) return "High Stakes";
  if (level === 6) return "The Edge";
  return "High Roller";
}

function getLeagueLevel(league: UserLeague): number {
  if (league === "Recreativo") return 0;
  if (league === "Grinder") return 1;
  if (league === "Reg") return 2;
  if (league === "Mid Stakes") return 3;
  if (league === "High Stakes") return 4;
  if (league === "The Edge") return 6;
  return 7;
}

function normalizeLeagueToken(value: string): string {
  return String(value || "")
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .trim();
}

function parseLeague(value: unknown): UserLeague | null {
  const token = normalizeLeagueToken(String(value ?? ""));
  if (!token) return null;

  if (token === "recreativo" || token === "casual" || token === "entry") return "Recreativo";
  if (token === "grinder") return "Grinder";
  if (token === "reg" || token === "regular") return "Reg";
  if (token === "midstakes" || token === "mid stakes") return "Mid Stakes";
  if (token === "highstakes" || token === "high stakes") return "High Stakes";
  if (token === "the edge" || token === "theedge" || token === "edge") return "The Edge";
  if (token === "high roller" || token === "highroller" || token === "roller") return "High Roller";

  // Legacy league labels mapped into new poker tiers.
  if (token === "bronze" || token === "prata" || token === "silver") return "Recreativo";
  if (token === "ouro" || token === "gold") return "Grinder";
  if (token === "platina" || token === "platinum") return "Reg";
  if (token === "esmeralda" || token === "emerald") return "Mid Stakes";
  if (token === "diamante" || token === "diamond") return "High Stakes";
  if (token === "mestre" || token === "master" || token === "grao-mestre" || token === "grao mestre" || token === "grandmaster") return "The Edge";

  return null;
}

function getTournamentAccessLimitByLeague(league: UserLeague): number {
  if (league === "Recreativo") return 1;
  if (league === "Grinder" || league === "Reg" || league === "Mid Stakes") return 5;
  return 10;
}

function CustomTooltip({ active, payload, label }: any) {
  if (!active || !payload?.length) return null;
  return (
    <div className="bg-card border border-border rounded-lg p-3 shadow-xl text-xs">
      <p className="text-muted-foreground mb-1.5">{label}</p>
      {(payload as any[]).map((p: any) => (
        <div key={p.dataKey} className="flex items-center gap-2">
          <span className="w-2 h-2 rounded-full" style={{ backgroundColor: p.color }} />
          <span className="text-muted-foreground">{p.name}:</span>
          <span className="font-semibold" style={{ color: p.color }}>
            {new Intl.NumberFormat("pt-BR", { style: "currency", currency: "BRL" }).format(p.value)}
          </span>
        </div>
      ))}
    </div>
  );
}

// ─── VenueRow (somente stats, sem edição de saldo) ────────────────────────────
function VenueRow({
  venue, colorIdx,
}: {
  venue: any; colorIdx: number;
}) {
  const [expanded, setExpanded] = useState(false);
  const color = VENUE_COLORS[colorIdx % VENUE_COLORS.length];
  const stats = venue.stats;
  const tableCount = stats?.tables ?? stats?.sessions ?? 0;
  const sessionCount = stats?.sessions ?? 0;
  const roi = stats && (stats.totalBuyIn ?? 0) > 0
    ? ((stats.totalProfit / stats.totalBuyIn) * 100).toFixed(1)
    : null;

  return (
    <div className="border-b border-border/20 last:border-0">
      <div
        className="flex items-center gap-3 py-3 px-1 cursor-pointer hover:bg-muted/20 rounded-lg transition-colors"
        onClick={() => setExpanded(!expanded)}
      >
        {/* Color dot */}
        <span className="h-2.5 w-2.5 rounded-full shrink-0" style={{ backgroundColor: color }} />
        <div className="flex items-center gap-2 flex-1 min-w-0">
          <div className="h-9 w-9 rounded-lg bg-muted/60 flex items-center justify-center shrink-0 overflow-hidden">
            {venue.logoUrl ? (
              <img src={venue.logoUrl} alt={venue.name} className={`h-full w-full rounded-md ${
                venue.name === "Suprema Poker" || venue.name === "WPT Global" ? "object-cover" : "object-contain"
              }`} />
            ) : (
              <Building2 className="h-4 w-4 text-muted-foreground" />
            )}
          </div>
          <div className="min-w-0">
            <p className="text-sm font-semibold truncate">{venue.name}</p>
            <p className="text-xs text-muted-foreground flex items-center gap-1 flex-wrap">
              <span>{venue.currency || "BRL"}</span>
              {venue.type === "online" && (venue.currency === "BRL" || !venue.currency) && (
                <span className="inline-flex items-center px-1 py-0 rounded text-[9px] font-semibold bg-amber-500/15 text-amber-700 dark:text-amber-400 border border-amber-500/20">
                  🇧🇷 Nacional
                </span>
              )}
            </p>
          </div>
        </div>
        <div className="text-right shrink-0">
          {stats && tableCount > 0 ? (
            <>
              <p className={`text-sm font-bold ${stats.totalProfit >= 0 ? "text-green-700 dark:text-emerald-400" : "text-red-700 dark:text-red-400"}`}>
                {stats.totalProfit >= 0 ? "+" : ""}{formatCurrencyCompact(stats.totalProfit)}
              </p>
              <UiTooltip>
                <TooltipTrigger asChild>
                  <p className="text-xs text-muted-foreground cursor-default">{tableCount} mesa{tableCount === 1 ? "" : "s"}</p>
                </TooltipTrigger>
                <TooltipContent side="top">
                  <span>{sessionCount} sess{sessionCount === 1 ? "ão" : "ões"}</span>
                </TooltipContent>
              </UiTooltip>
            </>
          ) : (
            <span className="text-xs text-muted-foreground">Sem mesas</span>
          )}
        </div>
        <div className="shrink-0 ml-1">
          {expanded ? <ChevronDown className="h-4 w-4 text-muted-foreground" /> : <ChevronRight className="h-4 w-4 text-muted-foreground" />}
        </div>
      </div>

      {expanded && (
        <div className="pb-3 px-2 space-y-3">
          {stats && tableCount > 0 ? (
            <div className="grid grid-cols-3 gap-2">
              <div className="bg-muted/20 rounded-lg p-2 text-center">
                <p className="text-[10px] text-muted-foreground mb-0.5">Mesas</p>
                <p className="text-sm font-bold">{tableCount}</p>
              </div>
              <div className="bg-muted/20 rounded-lg p-2 text-center">
                <p className="text-[10px] text-muted-foreground mb-0.5">ROI</p>
                <p className={`text-sm font-bold ${roi && parseFloat(roi) >= 0 ? "text-green-700 dark:text-emerald-400" : "text-red-700 dark:text-red-400"}`}>
                  {roi !== null ? `${roi}%` : "—"}
                </p>
              </div>
              <div className="bg-muted/20 rounded-lg p-2 text-center">
                <p className="text-[10px] text-muted-foreground mb-0.5">ITM Rate</p>
                <p className={`text-sm font-bold ${(stats.winRate || 0) >= 50 ? "text-green-700 dark:text-emerald-400" : "text-amber-700 dark:text-amber-400"}`}>
                  {stats.winRate !== null ? `${stats.winRate}%` : "—"}
                </p>
                <p className="text-[10px] text-muted-foreground mt-0.5">
                  {(stats.winningTables ?? 0)}/{tableCount}
                </p>
              </div>
            </div>
          ) : (
            <p className="text-xs text-muted-foreground text-center py-2">Nenhuma sessão registrada nesta plataforma</p>
          )}
        </div>
      )}
    </div>
  );
}

// ─── Main Dashboard ───────────────────────────────────────────────────────────
export default function Dashboard() {
  const { preferences: prefs, primaryType, playTypeOrder, sortVenues } = useBehaviorProfile();
  const { user } = useAuth();
  const { theme } = useTheme();
  const utils = trpc.useUtils();
  
  // Cores do gráfico responsivas ao tema
  const chartColors = {
    gridLine: theme === "light" ? "#cbd5e1" : "#334155",
    backgroundColor: theme === "light" ? "rgba(248, 250, 252, 0.96)" : "rgba(0, 0, 0, 0.18)",
    axis: theme === "light" ? "#64748b" : "oklch(0.55 0.01 240)",
    positive: theme === "light" ? "#15803d" : "#10b981",
    positiveSoft: theme === "light" ? "#22c55e" : "#34d399",
    positiveStrong: theme === "light" ? "#166534" : "#6ee7b7",
    negative: theme === "light" ? "#b91c1c" : "#ef4444",
    negativeSoft: theme === "light" ? "#ef4444" : "#f87171",
    negativeStrong: theme === "light" ? "#dc2626" : "#fca5a5",
  };
  const [chartPeriod, setChartPeriod] = useState<"online" | "live" | "all">("all");
  const [perfMetric, setPerfMetric] = useState<"roi" | "winrate" | "sessions" | "profit">("roi");
  const [showOnlineModal, setShowOnlineModal] = useState(false);
  const [showLiveModal, setShowLiveModal] = useState(false);
  const [expandedTournament, setExpandedTournament] = useState<string | null>(null);
  const [activeTournamentTab, setActiveTournamentTab] = useState<TournamentAccessTab>("favoritos");
  const [favoriteTournamentNames, setFavoriteTournamentNames] = useState<string[]>(() => {
    try {
      const stored = localStorage.getItem("tournament-favorites-v1");
      return stored ? JSON.parse(stored) : [];
    } catch {
      return [];
    }
  });
  const [showHandsEditModal, setShowHandsEditModal] = useState(false);
  const [showHandsConfigModal, setShowHandsConfigModal] = useState(false);
  const [newCustomHandName, setNewCustomHandName] = useState("");
  const [handPrefs, setHandPrefs] = useState<{
    hidden: string[];
    favorites: string[];
    customHands: { name: string; wins: number; losses: number }[];
  }>(() => {
    try {
      const stored = localStorage.getItem("hand-counter-prefs");
      return stored ? JSON.parse(stored) : { hidden: [], favorites: [], customHands: [] };
    } catch {
      return { hidden: [], favorites: [], customHands: [] };
    }
  });
  const [onlineInputValue, setOnlineInputValue] = useState("");
  const [liveInputValue, setLiveInputValue] = useState("");
  const [monthlyCompareMode, setMonthlyCompareMode] = useState<"3m" | "6m" | "12m" | "yoy">("6m");
  const [handEdit, setHandEdit] = useState({
    kk: { hands: 0, wins: 0, losses: 0 },
    jj: { hands: 0, wins: 0, losses: 0 },
    aa: { hands: 0, wins: 0, losses: 0 },
    ak: { hands: 0, wins: 0, losses: 0 },
  });

  const { data: consolidated, isLoading: loadingConsolidated } = trpc.bankroll.getConsolidated.useQuery();
  const { data: stats, isLoading: loadingStats } = trpc.sessions.stats.useQuery({});
  const { data: recentTables } = trpc.sessions.recentTables.useQuery({ limit: 8 });
  const { data: allSessions } = trpc.sessions.list.useQuery({});
  const { data: tournamentStatsRaw } = trpc.sessions.statsByTournament.useQuery();
  const { data: handPatternStats } = trpc.sessions.handPatternStats.useQuery();
  const { data: history, isLoading: loadingHistory } = trpc.bankroll.history.useQuery(undefined);
  const { data: venueStats } = trpc.venues.statsByVenue.useQuery();
  const { data: fxRates } = trpc.currency.getRates.useQuery(undefined, { refetchInterval: 60000 });

  const updateBankrollMutation = trpc.bankroll.updateSettings.useMutation({
    onSuccess: () => {
      utils.bankroll.getConsolidated.invalidate();
      utils.bankroll.history.invalidate();
      toast.success("Bankroll atualizado!");
    },
    onError: (err) => toast.error(`Erro ao atualizar bankroll: ${err.message}`),
  });

  const registerHandResultMutation = trpc.sessions.registerHandResult.useMutation({
    onSuccess: () => {
      utils.sessions.handPatternStats.invalidate();
      utils.feed.handPatternStats.invalidate();
    },
    onError: (err) => toast.error(`Erro ao registrar mão: ${err.message}`),
  });

  const updateHandStatsMutation = trpc.sessions.updateHandStats.useMutation({
    onSuccess: () => {
      setShowHandsEditModal(false);
      utils.sessions.handPatternStats.invalidate();
      utils.feed.handPatternStats.invalidate();
      toast.success("Contador de mãos atualizado.");
    },
    onError: (err) => toast.error(`Erro ao atualizar contador: ${err.message}`),
  });

  const openHandsEditModal = () => {
    setHandEdit({
      kk: {
        hands: handPatternStats?.kk?.hands ?? 0,
        wins: handPatternStats?.kk?.wins ?? 0,
        losses: handPatternStats?.kk?.losses ?? 0,
      },
      jj: {
        hands: handPatternStats?.jj?.hands ?? 0,
        wins: handPatternStats?.jj?.wins ?? 0,
        losses: handPatternStats?.jj?.losses ?? 0,
      },
      aa: {
        hands: handPatternStats?.aa?.hands ?? 0,
        wins: handPatternStats?.aa?.wins ?? 0,
        losses: handPatternStats?.aa?.losses ?? 0,
      },
      ak: {
        hands: handPatternStats?.ak?.hands ?? 0,
        wins: handPatternStats?.ak?.wins ?? 0,
        losses: handPatternStats?.ak?.losses ?? 0,
      },
    });
    setShowHandsEditModal(true);
  };

  const saveHandPrefs = (prefs: typeof handPrefs) => {
    setHandPrefs(prefs);
    localStorage.setItem("hand-counter-prefs", JSON.stringify(prefs));
  };

  const saveFavoriteTournamentNames = (items: string[]) => {
    setFavoriteTournamentNames(items);
    localStorage.setItem("tournament-favorites-v1", JSON.stringify(items));
  };

  const registerCustomHandResult = (handName: string, outcome: "win" | "loss") => {
    saveHandPrefs({
      ...handPrefs,
      customHands: handPrefs.customHands.map((hand) =>
        hand.name === handName
          ? {
              ...hand,
              wins: hand.wins + (outcome === "win" ? 1 : 0),
              losses: hand.losses + (outcome === "loss" ? 1 : 0),
            }
          : hand,
      ),
    });
  };

  const addCustomHand = () => {
    const name = newCustomHandName.trim().toUpperCase();
    if (!name) return;

    const existing = ["KK", "JJ", "AA", "AK", ...handPrefs.customHands.map((hand) => hand.name.toUpperCase())];
    if (existing.includes(name)) {
      toast.error("Essa mão já existe.");
      return;
    }

    saveHandPrefs({
      ...handPrefs,
      customHands: [...handPrefs.customHands, { name, wins: 0, losses: 0 }],
    });
    setNewCustomHandName("");
  };

  const chartData = useMemo(() => {
    if (!history) return [];

    const groupedByDay = new Map<string, {
      date: string;
      fullDate: string;
      timestamp: number;
      online: number;
      live: number;
      total: number;
    }>();

    for (const point of history) {
      const pointDate = new Date(point.date);
      const dayKey = `${pointDate.getFullYear()}-${String(pointDate.getMonth() + 1).padStart(2, "0")}-${String(pointDate.getDate()).padStart(2, "0")}`;
      const nextPoint = {
        date: pointDate.toLocaleDateString("pt-BR", { day: "2-digit", month: "2-digit" }),
        fullDate: pointDate.toLocaleDateString("pt-BR", { day: "2-digit", month: "2-digit", year: "numeric" }),
        timestamp: pointDate.getTime(),
        online: point.online / 100,
        live: point.live / 100,
        total: point.total / 100,
      };

      const currentPoint = groupedByDay.get(dayKey);
      if (!currentPoint || nextPoint.timestamp >= currentPoint.timestamp) {
        groupedByDay.set(dayKey, nextPoint);
      }
    }

    return Array.from(groupedByDay.values()).sort((a, b) => a.timestamp - b.timestamp);
  }, [history]);

  // Domínio dinâmico do eixo Y
  const chartYDomain = useMemo((): [number, number] => {
    if (!chartData.length) return [0, 100];
    const allValues: number[] = [];
    chartData.forEach((d) => {
      if (chartPeriod === "all" || chartPeriod === "online") allValues.push(d.online);
      if (chartPeriod === "all" || chartPeriod === "live") allValues.push(d.live);
      if (chartPeriod === "all") allValues.push(d.total);
    });
    const minVal = Math.min(...allValues);
    const maxVal = Math.max(...allValues);
    const range = maxVal - minVal || Math.abs(maxVal) || 100;
    const padding = range * 0.15;
    return [Math.floor(minVal - padding), Math.ceil(maxVal + padding)];
  }, [chartData, chartPeriod]);

  // Donut: Online vs Live (2 fatias simples)
  const donutData = useMemo(() => {
    if (!consolidated) return [];
    const onlineVal = consolidated.online.current;
    const liveVal = consolidated.live.current;
    const total = onlineVal + liveVal;
    if (total === 0) return [];
    const result = [];
    if (onlineVal > 0) {
      result.push({
        name: "Online",
        type: "online",
        fullName: "Poker Online",
        value: onlineVal / 100,
        color: "#06b6d4",
        pct: Math.round((onlineVal / total) * 100),
      });
    }
    if (liveVal > 0) {
      result.push({
        name: "Live",
        type: "live",
        fullName: "Poker Live",
        value: liveVal / 100,
        color: "#8b5cf6",
        pct: Math.round((liveVal / total) * 100),
      });
    }
    return [...result].sort((a, b) => playTypeOrder.indexOf(a.type as "online" | "live") - playTypeOrder.indexOf(b.type as "online" | "live"));
  }, [consolidated, playTypeOrder]);

  const perfData = useMemo(() => {
    if (!venueStats) return [];
    const mapped = venueStats
      .filter((v: any) => (v.tables ?? v.sessions) > 0)
      .map((v: any) => ({
        venueId: v.venueId,
        name: v.venueName.length > 13 ? v.venueName.substring(0, 13) + "…" : v.venueName,
        fullName: v.venueName,
        roi: (v.totalBuyIn ?? 0) > 0 ? parseFloat(((v.totalProfit / v.totalBuyIn) * 100).toFixed(1)) : 0,
        winrate: v.winRate,
        itmCount: v.winningTables ?? 0,
        sessions: v.sessions,
        tables: v.tables ?? v.sessions,
        profit: v.totalProfit / 100,
        color: v.totalProfit >= 0 ? "#10b981" : "#ef4444",
      }));
    return sortVenues(mapped, (venue) => venue.venueId).slice(0, 8);
  }, [sortVenues, venueStats]);

  const consolidatedTotal = consolidated?.total.current || 0;
  const consolidatedProfit = consolidated?.total.profit || 0;
  const roiInvestment = stats?.totalBuyIn ?? 0;
  const roiProfit = stats?.totalProfit ?? 0;
  const consolidatedPct = roiInvestment > 0 ? (roiProfit / roiInvestment) * 100 : 0;
  const hasRoiData = roiInvestment > 0;
  const hasAnyBalance = consolidatedTotal > 0;
  const totalPlayedSessions = Array.isArray(allSessions) ? allSessions.length : ((stats as any)?.totalSessions ?? 0);
  const totalPlayedTables = consolidated?.total.tables ?? 0;
  const abiOnlineAvg = prefs?.abiOnlineAvgBuyIn ?? 0;
  const abiLiveAvg = prefs?.abiLiveAvgBuyIn ?? 0;
  const abiOnlineAvgBrl = prefs?.abiOnlineAvgBuyInBrl ?? Math.round(abiOnlineAvg * (fxRates?.USD?.rate ?? 5.75));
  const abiLiveAvgBrl = prefs?.abiLiveAvgBuyInBrl ?? abiLiveAvg;
  const abiOnlineSample = prefs?.abiOnlineSampleSize ?? 0;
  const abiLiveSample = prefs?.abiLiveSampleSize ?? 0;
  const usdRate = fxRates?.USD?.rate ?? 5.75;
  const abiOnlineAvgUsd = usdRate > 0 ? Math.round(abiOnlineAvgBrl / usdRate) : 0;
  const abiLiveAvgUsd = usdRate > 0 ? Math.round(abiLiveAvgBrl / usdRate) : 0;
  const primaryTypeShare = ((prefs?.typeRanking ?? [])[0]?.share ?? 0) * 100;
  const topVenueId = (prefs?.venueRanking ?? [])[0]?.value ?? prefs?.preferredVenueIds?.[0] ?? null;
  const topFormatKey = (prefs?.gameFormatRanking ?? [])[0]?.value ?? prefs?.preferredGameFormats?.[0] ?? null;
  const topFormatLabel = topFormatKey
    ? (GAME_FORMAT_LABELS[String(topFormatKey)] ?? String(topFormatKey).replaceAll("_", " "))
    : null;
  const topBuyInValue = primaryType === "online"
    ? (prefs?.buyInRankingOnline ?? [])[0]?.value ?? prefs?.preferredBuyInsOnline?.[0] ?? 0
    : (prefs?.buyInRankingLive ?? [])[0]?.value ?? prefs?.preferredBuyInsLive?.[0] ?? 0;
  const typeSummaryCards = playTypeOrder.map((type) => ({
    key: type,
    title: type === "online" ? "Online" : "Live",
    icon: type === "online" ? Wifi : MapPin,
    badgeClass: type === "online" ? "text-cyan-700 dark:text-cyan-400 border-cyan-500/30" : "text-violet-700 dark:text-violet-400 border-violet-500/30",
    borderClass: type === "online" ? "border-cyan-500/30" : "border-violet-500/30",
    gradientClass: type === "online" ? "from-cyan-500 to-blue-600" : "from-violet-500 to-purple-700",
    editClass: type === "online" ? "text-cyan-700 hover:text-cyan-600 dark:text-cyan-400 dark:hover:text-cyan-300" : "text-violet-700 hover:text-violet-600 dark:text-violet-400 dark:hover:text-violet-300",
    current: consolidated?.[type].current || 0,
    profit: consolidated?.[type].profit || 0,
    tables: consolidated?.[type].tables || 0,
    sessions: (allSessions as any[] | undefined)?.filter((session) => session?.type === type).length ?? 0,
    onEdit: type === "online" ? () => setShowOnlineModal(true) : () => setShowLiveModal(true),
  }));

  const prioritizedVenues = useMemo(() => {
    if (!consolidated?.allVenues) return [];
    const statsMap = new Map((venueStats || []).map((s: any) => [s.venueId, s]));
    const merged = consolidated.allVenues.map((v: any) => ({
        ...v,
        stats: statsMap.get(v.id) || null,
      }));
    const personalized = sortVenues(merged, (venue) => venue.id);
    const playedVenues = personalized.filter((venue: any) => (venue.stats?.tables ?? venue.stats?.sessions ?? 0) > 0);
    const source = playedVenues.length > 0 ? playedVenues : personalized;

    return [...source].sort((a: any, b: any) => {
      const aTables = a.stats?.tables ?? a.stats?.sessions ?? 0;
      const bTables = b.stats?.tables ?? b.stats?.sessions ?? 0;
      if (bTables !== aTables) return bTables - aTables;

      const typeDelta = playTypeOrder.indexOf(a.type) - playTypeOrder.indexOf(b.type);
      if (typeDelta !== 0) return typeDelta;

      return String(a.name || "").localeCompare(String(b.name || ""), "pt-BR");
    });
  }, [consolidated, playTypeOrder, sortVenues, venueStats]);

  const userLeague = useMemo<UserLeague>(() => {
    const role = String((user as any)?.role ?? "").trim().toLowerCase();
    if (role === "admin" || role === "developer" || role === "system_ai_service") {
      return "High Roller";
    }

    const numericLevel = Number((user as any)?.leagueLevel ?? (user as any)?.ligaNivel ?? (user as any)?.rankLevel);
    if (Number.isFinite(numericLevel) && numericLevel >= 0) {
      return getLeagueFromLevel(numericLevel);
    }

    const explicitLeague = parseLeague((user as any)?.league)
      ?? parseLeague((user as any)?.liga)
      ?? parseLeague((user as any)?.leagueTier)
      ?? parseLeague((user as any)?.rankLeague);
    if (explicitLeague) return explicitLeague;

    const starsFromUser = Number((user as any)?.starsLevel);
    if (Number.isFinite(starsFromUser)) {
      const normalizedStars = Math.max(0, Math.min(5, Math.round(starsFromUser)));
      if (normalizedStars <= 0) return "Recreativo";
      if (normalizedStars === 1) return "Grinder";
      if (normalizedStars === 2) return "Reg";
      if (normalizedStars === 3) return "Mid Stakes";
      if (normalizedStars === 4) return "High Stakes";
      return "The Edge";
    }

    // Default while legacy users are migrated to numeric league levels.
    return "Reg";
  }, [user]);

  const userLeagueLevel = useMemo(() => getLeagueLevel(userLeague), [userLeague]);
  const userLeagueLabel = useMemo(() => getAccessTierLabel(userLeague), [userLeague]);
  const userLeagueEmoji = useMemo(() => getAccessTierEmoji(userLeague), [userLeague]);
  const userLeagueCompact = useMemo(() => userLeagueLabel.replace(" (interno)", ""), [userLeagueLabel]);

  const tournamentAccessLimit = useMemo(() => {
    return getTournamentAccessLimitByLeague(userLeague);
  }, [userLeague]);

  const tournamentsByProfit = useMemo(() => {
    return [...(tournamentStatsRaw ?? [])]
      .filter((item: any) => (item?.tables ?? 0) > 0)
      .sort((a: any, b: any) => {
        const profitDiff = (b?.profit ?? 0) - (a?.profit ?? 0);
        if (profitDiff !== 0) return profitDiff;
        return (b?.tables ?? 0) - (a?.tables ?? 0);
      });
  }, [tournamentStatsRaw]);

  const availableTournamentHistory = useMemo(() => {
    return tournamentsByProfit.slice(0, tournamentAccessLimit);
  }, [tournamentsByProfit, tournamentAccessLimit]);

  const favoriteTournaments = useMemo(() => {
    if (favoriteTournamentNames.length === 0) return [];
    return availableTournamentHistory.filter((item: any) =>
      favoriteTournamentNames.includes(String(item?.name ?? "")),
    );
  }, [availableTournamentHistory, favoriteTournamentNames]);

  const visibleTournaments = activeTournamentTab === "favoritos"
    ? favoriteTournaments
    : availableTournamentHistory;

  const monthlyComparison = useMemo(() => {
    const monthlyProfit = new Map<string, number>();

    for (const session of (allSessions ?? []) as any[]) {
      const rawDate = session.sessionDate ?? session.startedAt ?? session.createdAt;
      const date = new Date(rawDate);
      if (Number.isNaN(date.getTime())) continue;

      const monthKey = `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}`;
      const sessionProfit = typeof session.totalTableProfit === "number"
        ? session.totalTableProfit
        : (session.cashOut ?? 0) - (session.buyIn ?? 0);

      monthlyProfit.set(monthKey, (monthlyProfit.get(monthKey) ?? 0) + sessionProfit);
    }

    const entries = Array.from(monthlyProfit.entries())
      .map(([key, profit]) => {
        const [year, month] = key.split("-").map((value) => Number(value));
        const date = new Date(year, month - 1, 1);
        return {
          key,
          profit,
          date,
          label: date.toLocaleDateString("pt-BR", { month: "short", year: "2-digit" }).replace(".", ""),
        };
      })
      .sort((a, b) => a.date.getTime() - b.date.getTime());

    const now = new Date();
    const currentKey = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}`;
    const previousMonthDate = new Date(now.getFullYear(), now.getMonth() - 1, 1);
    const previousMonthKey = `${previousMonthDate.getFullYear()}-${String(previousMonthDate.getMonth() + 1).padStart(2, "0")}`;

    const currentYear = now.getFullYear();
    const previousYear = currentYear - 1;
    const currentYearProfit = entries
      .filter((entry) => entry.date.getFullYear() === currentYear)
      .reduce((acc, entry) => acc + entry.profit, 0);
    const previousYearProfit = entries
      .filter((entry) => entry.date.getFullYear() === previousYear)
      .reduce((acc, entry) => acc + entry.profit, 0);

    const modeMonths = monthlyCompareMode === "3m" ? 3 : monthlyCompareMode === "6m" ? 6 : 12;
    const recent = entries.slice(-modeMonths);

    const currentProfit = monthlyCompareMode === "yoy"
      ? currentYearProfit
      : (monthlyProfit.get(currentKey) ?? 0);
    const previousProfit = monthlyCompareMode === "yoy"
      ? previousYearProfit
      : (monthlyProfit.get(previousMonthKey) ?? 0);
    const delta = currentProfit - previousProfit;
    const deltaPct = previousProfit !== 0
      ? (delta / Math.abs(previousProfit)) * 100
      : currentProfit !== 0
        ? 100
        : 0;

    const currentLabel = monthlyCompareMode === "yoy"
      ? String(currentYear)
      : now.toLocaleDateString("pt-BR", { month: "long", year: "numeric" });
    const previousLabel = monthlyCompareMode === "yoy"
      ? String(previousYear)
      : previousMonthDate.toLocaleDateString("pt-BR", { month: "long", year: "numeric" });

    const maxAbs = Math.max(1, ...recent.map((entry) => Math.abs(entry.profit)));

    return {
      mode: monthlyCompareMode,
      currentLabel,
      previousLabel,
      currentProfit,
      previousProfit,
      delta,
      deltaPct,
      recent: recent.map((entry) => ({
        ...entry,
        widthPct: (Math.abs(entry.profit) / maxAbs) * 100,
      })),
    };
  }, [allSessions, monthlyCompareMode]);

  const topVenueName = prioritizedVenues.find((venue: any) => venue.id === topVenueId)?.name ?? null;

  const isLoading = loadingStats || loadingHistory || loadingConsolidated;

  const rateItems = useMemo(() => {
    if (!fxRates) return [];
    return [
      { code: "USD", ...FX_RATE_META.USD, rate: fxRates.USD?.rate ?? 0 },
      { code: "CAD", ...FX_RATE_META.CAD, rate: fxRates.CAD?.rate ?? 0 },
      { code: "EUR", ...FX_RATE_META.EUR, rate: fxRates.EUR?.rate ?? 0 },
      { code: "JPY", ...FX_RATE_META.JPY, rate: fxRates.JPY?.rate ?? 0 },
      { code: "CNY", ...FX_RATE_META.CNY, rate: fxRates.CNY?.rate ?? 0 },
    ].filter((r) => r.rate > 0);
  }, [fxRates]);

  if (isLoading) {
    return (
      <div className="space-y-4">
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
          <Skeleton className="h-80 lg:col-span-2" />
          <Skeleton className="h-80" />
        </div>
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          {[1,2,3,4].map(i => <Skeleton key={i} className="h-64" />)}
        </div>
      </div>
    );
  }

  return (
    <div className="relative mx-auto max-w-[1600px] overflow-hidden space-y-5 rounded-2xl border border-slate-200 dark:border-cyan-500/15 card-gradient-main p-3 sm:p-4 lg:p-5">
      <div className="pointer-events-none absolute inset-0 z-0">
        <div className="absolute -left-16 top-24 h-40 w-40 rounded-full border border-violet-300/35 dark:border-violet-300/25 bg-[radial-gradient(circle_at_35%_30%,#c4b5fd_0%,#a78bfa_45%,#ede9fe_100%)] dark:bg-[radial-gradient(circle_at_35%_30%,#8b5cf6_0%,#6d28d9_45%,#14082a_100%)] opacity-60 dark:opacity-50">
          <div className="absolute inset-[9px] rounded-full border border-violet-300/45 dark:border-amber-200/45" />
          <div className="absolute inset-[22px] rounded-full border border-violet-300/35 dark:border-fuchsia-300/40 bg-[#f5f3ff] dark:bg-[#12081f]" />
          <div className="absolute inset-0 flex items-center justify-center">
            <div className="h-6 w-6 rounded-full border border-violet-300/55 dark:border-fuchsia-200/50 bg-violet-300/35 dark:bg-fuchsia-300/20 shadow-[0_0_12px_rgba(139,92,246,0.28)] dark:shadow-[0_0_14px_rgba(244,114,182,0.45)]" />
          </div>
        </div>
        <div className="absolute -right-20 top-[28%] h-52 w-52 rounded-full border border-cyan-300/30 dark:border-cyan-200/20 bg-[radial-gradient(circle_at_35%_30%,#a5f3fc_0%,#67e8f9_48%,#ecfeff_100%)] dark:bg-[radial-gradient(circle_at_35%_30%,#22d3ee_0%,#0e7490_48%,#041827_100%)] opacity-55 dark:opacity-40">
          <div className="absolute inset-[10px] rounded-full border border-cyan-300/40 dark:border-amber-200/35" />
          <div className="absolute inset-[25px] rounded-full border border-cyan-300/35 dark:border-cyan-200/30 bg-[#ecfeff] dark:bg-[#081726]" />
          <div className="absolute inset-0 flex items-center justify-center">
            <div className="h-7 w-7 rounded-full border border-cyan-300/60 dark:border-cyan-200/50 bg-cyan-300/35 dark:bg-cyan-300/20 shadow-[0_0_12px_rgba(6,182,212,0.24)] dark:shadow-[0_0_16px_rgba(34,211,238,0.5)]" />
          </div>
        </div>
        <div className="absolute -bottom-16 left-[32%] h-44 w-44 rounded-full border border-emerald-300/30 dark:border-emerald-200/20 bg-[radial-gradient(circle_at_35%_30%,#bbf7d0_0%,#6ee7b7_46%,#ecfdf5_100%)] dark:bg-[radial-gradient(circle_at_35%_30%,#34d399_0%,#047857_46%,#06261d_100%)] opacity-50 dark:opacity-35">
          <div className="absolute inset-[10px] rounded-full border border-emerald-300/40 dark:border-amber-200/35" />
          <div className="absolute inset-[24px] rounded-full border border-emerald-300/35 dark:border-emerald-200/30 bg-[#ecfdf5] dark:bg-[#06261d]" />
          <div className="absolute inset-0 flex items-center justify-center">
            <div className="h-6 w-6 rounded-full border border-emerald-300/55 dark:border-emerald-200/50 bg-emerald-300/35 dark:bg-emerald-300/20 shadow-[0_0_12px_rgba(22,163,74,0.24)] dark:shadow-[0_0_14px_rgba(16,185,129,0.45)]" />
          </div>
        </div>
      </div>
      <div className="relative z-10 space-y-5">
      {rateItems.length > 0 && (
        <div className="fx-ticker -mx-4 -mt-4">
          <div className="fx-track">
            {[...rateItems, ...rateItems, ...rateItems, ...rateItems].map((item, i) => (
              <div key={`${item.code}-${i}`} className="fx-item">
                <img className="fx-flag" src={item.flagUrl} alt={`${item.label} flag`} />
                <span className="fx-code">{item.code}</span>
                <span className="fx-label">{item.label}</span>
                <span className="fx-value">R$ {item.rate.toFixed(4)}</span>
              </div>
            ))}
          </div>
        </div>
      )}

      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h1 className="text-2xl font-bold tracking-tight text-foreground">Bankroll</h1>
          <p className="text-sm text-muted-foreground">Visão consolidada do seu stack</p>
        </div>
        <Link href="/sessions">
          <button
            className="group relative w-full overflow-hidden rounded-3xl bg-gradient-to-r from-purple-600 via-violet-600 to-fuchsia-600 px-7 py-3 text-base font-semibold text-white shadow-xl shadow-purple-600/50 transition-all duration-300 hover:scale-105 hover:shadow-2xl hover:shadow-purple-500/70 active:scale-95 sm:w-auto"
          >
            <span className="relative z-10 inline-flex items-center gap-3">
              <Plus className="h-4 w-4" /> Nova Sessão
            </span>
            <div className="absolute inset-0 -translate-x-full bg-gradient-to-r from-transparent via-white/30 to-transparent transition-transform duration-700 group-hover:translate-x-full" />
          </button>
        </Link>
      </div>

      {/* Modal: Definir/Editar Bankroll Online */}
      <Dialog open={showOnlineModal} onOpenChange={setShowOnlineModal}>
        <DialogContent className="max-w-sm">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <Wifi className="h-5 w-5 text-cyan-400" />
              {(consolidated?.online.current || 0) > 0 ? "Editar Bankroll Online" : "Definir Bankroll Online"}
            </DialogTitle>
          </DialogHeader>
          <div className="space-y-4 py-2">
            <p className="text-sm text-muted-foreground">
              Informe o valor total que você tem disponível para jogar online (soma de todas as plataformas).
            </p>
            <div className="space-y-1.5">
              <Label htmlFor="online-bankroll-input">Valor em R$</Label>
              <Input
                id="online-bankroll-input"
                type="number"
                min="0"
                step="0.01"
                placeholder="Ex: 1000.00"
                value={onlineInputValue}
                onChange={(e) => setOnlineInputValue(e.target.value)}
                onFocus={() => {
                  if (!onlineInputValue && (consolidated?.online.current || 0) > 0) {
                    setOnlineInputValue(((consolidated?.online.current || 0) / 100).toFixed(2));
                  }
                }}
                autoFocus
              />
            </div>
            {(consolidated?.online.current || 0) > 0 && (
              <p className="text-xs text-muted-foreground">
                Valor atual: <span className="text-cyan-400 font-medium">{formatCurrency(consolidated?.online.current || 0)}</span>
              </p>
            )}
          </div>
          <div className="flex justify-end gap-2 pt-2">
            <Button variant="ghost" size="sm" onClick={() => { setShowOnlineModal(false); setOnlineInputValue(""); }}>
              Cancelar
            </Button>
            <Button
              size="sm"
              className="gap-1.5 bg-cyan-600 hover:bg-cyan-700"
              disabled={updateBankrollMutation.isPending || !onlineInputValue}
              onClick={() => {
                const val = parseFloat(onlineInputValue);
                if (isNaN(val) || val < 0) { toast.error("Valor inválido"); return; }
                updateBankrollMutation.mutate(
                  { initialOnline: Math.round(val * 100) },
                  { onSuccess: () => { setShowOnlineModal(false); setOnlineInputValue(""); } }
                );
              }}
            >
              <CheckCircle2 className="h-4 w-4" />
              {updateBankrollMutation.isPending ? "Salvando..." : "Salvar"}
            </Button>
          </div>
        </DialogContent>
      </Dialog>

      {/* Modal: Definir/Editar Bankroll Live */}
      <Dialog open={showLiveModal} onOpenChange={setShowLiveModal}>
        <DialogContent className="max-w-sm">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <MapPin className="h-5 w-5 text-violet-400" />
              {(consolidated?.live.current || 0) > 0 ? "Editar Bankroll Live" : "Definir Bankroll Live"}
            </DialogTitle>
          </DialogHeader>
          <div className="space-y-4 py-2">
            <p className="text-sm text-muted-foreground">
              Informe o valor total que você tem disponível para jogar presencialmente (cash, fichas, etc.).
            </p>
            <div className="space-y-1.5">
              <Label htmlFor="live-bankroll-input">Valor em R$</Label>
              <Input
                id="live-bankroll-input"
                type="number"
                min="0"
                step="0.01"
                placeholder="Ex: 4000.00"
                value={liveInputValue}
                onChange={(e) => setLiveInputValue(e.target.value)}
                onFocus={() => {
                  if (!liveInputValue && (consolidated?.live.current || 0) > 0) {
                    setLiveInputValue(((consolidated?.live.current || 0) / 100).toFixed(2));
                  }
                }}
                autoFocus
              />
            </div>
            {(consolidated?.live.current || 0) > 0 && (
              <p className="text-xs text-muted-foreground">
                Valor atual: <span className="text-violet-400 font-medium">{formatCurrency(consolidated?.live.current || 0)}</span>
              </p>
            )}
          </div>
          <div className="flex justify-end gap-2 pt-2">
            <Button variant="ghost" size="sm" onClick={() => { setShowLiveModal(false); setLiveInputValue(""); }}>
              Cancelar
            </Button>
            <Button
              size="sm"
              className="gap-1.5 bg-violet-600 hover:bg-violet-700"
              disabled={updateBankrollMutation.isPending || !liveInputValue}
              onClick={() => {
                const val = parseFloat(liveInputValue);
                if (isNaN(val) || val < 0) { toast.error("Valor inválido"); return; }
                updateBankrollMutation.mutate(
                  { initialLive: Math.round(val * 100) },
                  { onSuccess: () => { setShowLiveModal(false); setLiveInputValue(""); } }
                );
              }}
            >
              <CheckCircle2 className="h-4 w-4" />
              {updateBankrollMutation.isPending ? "Salvando..." : "Salvar"}
            </Button>
          </div>
        </DialogContent>
      </Dialog>

      <Dialog open={showHandsEditModal} onOpenChange={setShowHandsEditModal}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <PencilLine className="h-5 w-5 text-amber-500" />
              Editar Contador Premium
            </DialogTitle>
          </DialogHeader>
          <div className="space-y-4 py-1">
            {(["kk", "jj", "aa", "ak"] as const).map((hand) => (
              <div key={hand} className="rounded-lg border border-border/60 p-3 space-y-2">
                <p className="text-sm font-semibold">
                  {hand.toUpperCase()} {hand === "kk" ? "(Rei Rei)" : hand === "jj" ? "(Vala Vala)" : hand === "aa" ? "(As As)" : "(As e Rei)"}
                </p>
                <div className="grid grid-cols-3 gap-2">
                  <div>
                    <Label className="text-[11px]">Total</Label>
                    <Input
                      type="number"
                      min="0"
                      value={(handEdit as any)[hand].hands}
                      onChange={(e) => setHandEdit((prev) => ({ ...prev, [hand]: { ...(prev as any)[hand], hands: Math.max(0, Number(e.target.value || 0)) } }))}
                    />
                  </div>
                  <div>
                    <Label className="text-[11px]">Vitórias</Label>
                    <Input
                      type="number"
                      min="0"
                      value={(handEdit as any)[hand].wins}
                      onChange={(e) => setHandEdit((prev) => ({ ...prev, [hand]: { ...(prev as any)[hand], wins: Math.max(0, Number(e.target.value || 0)) } }))}
                    />
                  </div>
                  <div>
                    <Label className="text-[11px]">Derrotas</Label>
                    <Input
                      type="number"
                      min="0"
                      value={(handEdit as any)[hand].losses}
                      onChange={(e) => setHandEdit((prev) => ({ ...prev, [hand]: { ...(prev as any)[hand], losses: Math.max(0, Number(e.target.value || 0)) } }))}
                    />
                  </div>
                </div>
              </div>
            ))}
          </div>
          <div className="flex justify-end gap-2 pt-2">
            <Button variant="ghost" size="sm" onClick={() => setShowHandsEditModal(false)}>Cancelar</Button>
            <Button
              size="sm"
              disabled={updateHandStatsMutation.isPending}
              onClick={() => updateHandStatsMutation.mutate(handEdit as any)}
            >
              {updateHandStatsMutation.isPending ? "Salvando..." : "Salvar alterações"}
            </Button>
          </div>
        </DialogContent>
      </Dialog>

      <Dialog open={showHandsConfigModal} onOpenChange={setShowHandsConfigModal}>
        <DialogContent className="max-w-sm">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <Star className="h-4 w-4 text-yellow-400" /> Personalizar Mãos
            </DialogTitle>
          </DialogHeader>
          <div className="space-y-3 py-1">
            <p className="text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">Favoritas e visibilidade</p>
            {(["kk", "jj", "aa", "ak"] as const).map((hand) => {
              const isFavorite = handPrefs.favorites.includes(hand);
              const isHidden = handPrefs.hidden.includes(hand);
              return (
                <div key={hand} className="flex items-center justify-between rounded-lg border border-border/40 px-3 py-2">
                  <span className="text-sm font-semibold uppercase">{hand}</span>
                  <div className="flex items-center gap-3">
                    <button
                      type="button"
                      title={isFavorite ? "Remover favorito" : "Favoritar"}
                      onClick={() => saveHandPrefs({
                        ...handPrefs,
                        favorites: isFavorite
                          ? handPrefs.favorites.filter((item) => item !== hand)
                          : [...handPrefs.favorites, hand],
                      })}
                    >
                      <Star className={`h-4 w-4 ${isFavorite ? "fill-yellow-400 text-yellow-400" : "text-muted-foreground hover:text-yellow-400"}`} />
                    </button>
                    <button
                      type="button"
                      title={isHidden ? "Mostrar" : "Ocultar"}
                      onClick={() => saveHandPrefs({
                        ...handPrefs,
                        hidden: isHidden
                          ? handPrefs.hidden.filter((item) => item !== hand)
                          : [...handPrefs.hidden, hand],
                      })}
                    >
                      {isHidden ? <Eye className="h-4 w-4 text-muted-foreground" /> : <EyeOff className="h-4 w-4 text-muted-foreground" />}
                    </button>
                  </div>
                </div>
              );
            })}

            {handPrefs.customHands.map((hand) => {
              const isFavorite = handPrefs.favorites.includes(hand.name);
              const isHidden = handPrefs.hidden.includes(hand.name);
              return (
                <div key={hand.name} className="flex items-center justify-between rounded-lg border border-border/40 px-3 py-2">
                  <span className="text-sm font-semibold uppercase">{hand.name}</span>
                  <div className="flex items-center gap-3">
                    <button
                      type="button"
                      title={isFavorite ? "Remover favorito" : "Favoritar"}
                      onClick={() => saveHandPrefs({
                        ...handPrefs,
                        favorites: isFavorite
                          ? handPrefs.favorites.filter((item) => item !== hand.name)
                          : [...handPrefs.favorites, hand.name],
                      })}
                    >
                      <Star className={`h-4 w-4 ${isFavorite ? "fill-yellow-400 text-yellow-400" : "text-muted-foreground hover:text-yellow-400"}`} />
                    </button>
                    <button
                      type="button"
                      title={isHidden ? "Mostrar" : "Ocultar"}
                      onClick={() => saveHandPrefs({
                        ...handPrefs,
                        hidden: isHidden
                          ? handPrefs.hidden.filter((item) => item !== hand.name)
                          : [...handPrefs.hidden, hand.name],
                      })}
                    >
                      {isHidden ? <Eye className="h-4 w-4 text-muted-foreground" /> : <EyeOff className="h-4 w-4 text-muted-foreground" />}
                    </button>
                    <button
                      type="button"
                      title="Remover mão"
                      onClick={() => saveHandPrefs({
                        hidden: handPrefs.hidden.filter((item) => item !== hand.name),
                        favorites: handPrefs.favorites.filter((item) => item !== hand.name),
                        customHands: handPrefs.customHands.filter((item) => item.name !== hand.name),
                      })}
                    >
                      <X className="h-4 w-4 text-red-700 dark:text-red-400 hover:text-red-700 dark:text-red-300" />
                    </button>
                  </div>
                </div>
              );
            })}

            <div className="border-t border-border/40 pt-3 space-y-2">
              <p className="text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">Adicionar mão</p>
              <div className="flex gap-2">
                <Input
                  value={newCustomHandName}
                  onChange={(e) => setNewCustomHandName(e.target.value.toUpperCase())}
                  onKeyDown={(e) => {
                    if (e.key === "Enter") addCustomHand();
                  }}
                  placeholder="Ex: QQ, TT, AQs"
                  maxLength={6}
                  className="h-8"
                />
                <Button size="sm" className="h-8" onClick={addCustomHand}>Adicionar</Button>
              </div>
            </div>
          </div>
        </DialogContent>
      </Dialog>

      <div className="grid grid-cols-1 gap-5 xl:grid-cols-5">
        {/* LEFT COLUMN */}
        <div className="xl:col-span-3 space-y-5">
          {/* ==================== HERO PRINCIPAL - GRÁFICO DE FUNDO ==================== */}
          <div className="bg-white dark:bg-gradient-to-br dark:from-zinc-950 dark:to-black border border-slate-200 dark:border-zinc-700 rounded-3xl p-5 md:p-7 relative overflow-hidden mb-8 transition-all duration-300 hover:-translate-y-1 shadow-[0_14px_30px_rgba(15,23,42,0.08),0_0_0_1px_rgba(139,92,246,0.08)] dark:shadow-none hover:shadow-[0_16px_36px_rgba(15,23,42,0.11),0_0_0_1px_rgba(139,92,246,0.14)] dark:hover:shadow-xl dark:hover:shadow-purple-500/20 hover:border-violet-300 dark:hover:border-purple-500/60 min-h-[340px] md:min-h-[390px]">
            <div className="absolute inset-0 bg-[radial-gradient(#cbd5e1_1px,transparent_1px)] dark:bg-[radial-gradient(#1f2937_1px,transparent_1px)] [background-size:28px_28px] opacity-45 dark:opacity-16 pointer-events-none"></div>
            <div className="pointer-events-none absolute inset-0 bg-[radial-gradient(circle_at_50%_10%,rgba(21,128,61,0.09),transparent_50%)] dark:bg-[radial-gradient(circle_at_50%_10%,rgba(16,185,129,0.12),transparent_48%)]" />

            {(() => {
              const heroPlotData = chartData.map((point, index) => ({ index, value: point.total }));
              const firstValue = heroPlotData.length > 0 ? heroPlotData[0].value : 0;
              const lastValue = heroPlotData.length > 0 ? heroPlotData[heroPlotData.length - 1].value : 0;
              const isPositive = lastValue >= firstValue;
              const onlineShare = donutData.find((d) => d.type === "online")?.pct ?? 0;
              const liveShare = donutData.find((d) => d.type === "live")?.pct ?? 0;

              return (
                <>
                  <div className="pointer-events-none absolute right-4 top-4 z-20 flex items-center gap-2 text-[11px]">
                    <div className="inline-flex items-center gap-1.5 rounded-full border border-emerald-700/25 dark:border-emerald-400/35 bg-white/90 dark:bg-black/55 px-2.5 py-1 text-emerald-700 dark:text-emerald-200">
                      <span className="h-1.5 w-1.5 rounded-full bg-emerald-700 dark:bg-emerald-400" />
                      Online {onlineShare}%
                    </div>
                    <div className="inline-flex items-center gap-1.5 rounded-full border border-violet-700/25 dark:border-violet-400/35 bg-white/90 dark:bg-black/55 px-2.5 py-1 text-violet-700 dark:text-violet-200">
                      <span className="h-1.5 w-1.5 rounded-full bg-violet-700 dark:bg-violet-400" />
                      Live {liveShare}%
                    </div>
                  </div>

                  <div className="pointer-events-none absolute inset-x-3 bottom-3 top-[58%] md:top-[52%] rounded-2xl z-0" style={{ backgroundColor: chartColors.backgroundColor }}>
                    <ResponsiveContainer width="100%" height="100%">
                      <LineChart data={heroPlotData} margin={{ top: 6, right: 6, left: 6, bottom: 6 }}>
                        <defs>
                          <linearGradient id="heroBackdropFill" x1="0" y1="0" x2="0" y2="1">
                            <stop offset="0%" stopColor={isPositive ? chartColors.positive : chartColors.negative} stopOpacity={0.24} />
                            <stop offset="100%" stopColor={isPositive ? chartColors.positive : chartColors.negative} stopOpacity={0.02} />
                          </linearGradient>
                          <linearGradient id="heroBackdropLine" x1="0" y1="0" x2="1" y2="0">
                            <stop offset="0%" stopColor={isPositive ? chartColors.positiveSoft : chartColors.negativeSoft} stopOpacity={0.55} />
                            <stop offset="55%" stopColor={isPositive ? chartColors.positive : chartColors.negative} stopOpacity={0.9} />
                            <stop offset="100%" stopColor={isPositive ? chartColors.positiveStrong : chartColors.negativeStrong} stopOpacity={1} />
                          </linearGradient>
                        </defs>
                        <XAxis dataKey="index" hide />
                        <YAxis hide domain={["dataMin", "dataMax"]} />
                        <ReferenceLine y={firstValue + (lastValue - firstValue) * 0.33} stroke={chartColors.gridLine} strokeDasharray="4 7" ifOverflow="extendDomain" />
                        <ReferenceLine y={firstValue + (lastValue - firstValue) * 0.66} stroke={chartColors.gridLine} strokeDasharray="4 7" ifOverflow="extendDomain" />
                        <Area type="linear" dataKey="value" stroke="none" fill="url(#heroBackdropFill)" isAnimationActive={false} />
                        <Line
                          type="linear"
                          dataKey="value"
                          stroke="url(#heroBackdropLine)"
                          strokeWidth={3.2}
                          dot={false}
                          activeDot={false}
                          animationDuration={1300}
                        />
                      </LineChart>
                    </ResponsiveContainer>
                  </div>

                  <div className="relative z-10 flex h-full min-h-[290px] flex-col items-center justify-start pt-8 text-center md:pt-10">
                    <div className="text-4xl md:text-5xl xl:text-6xl font-bold tracking-tight md:tracking-[-1px] bg-gradient-to-r from-slate-900 via-violet-800 to-cyan-700 dark:from-emerald-300 dark:via-cyan-300 dark:to-purple-300 bg-clip-text text-transparent dark:drop-shadow-[0_0_18px_rgba(16,185,129,0.35)]">
                      {formatCurrencyCompact(consolidatedTotal)}
                    </div>

                    <div className="mt-2 text-3xl md:text-4xl font-extrabold leading-none text-green-700 dark:text-emerald-400 dark:drop-shadow-[0_0_16px_rgba(16,185,129,0.28)]">
                      {formatPercent(consolidatedPct)}
                    </div>

                    <div className={`mt-2 text-xl md:text-2xl font-semibold ${roiProfit >= 0 ? "text-green-700 dark:text-emerald-300" : "text-red-700 dark:text-red-300"}`}>
                      {roiProfit >= 0 ? "+" : ""}{formatCurrencyCompact(roiProfit)}
                    </div>
                  </div>
                </>
              );
            })()}
          </div>

          <Card className="border-cyan-500/20 card-gradient-dark shadow-sm dark:shadow-[0_0_26px_rgba(34,211,238,0.08)] transition-all duration-300 hover:-translate-y-1 hover:shadow-lg dark:hover:shadow-xl dark:hover:shadow-purple-500/20 hover:border-purple-500/60">
            <CardContent className="p-4 sm:p-5">
              <div className="grid grid-cols-1 md:grid-cols-2 gap-3 mb-4">
                <div className="rounded-lg border border-cyan-500/20 bg-cyan-500/5 p-3">
                  <p className="text-xs text-muted-foreground mb-1">ABI Médio Online</p>
                  <p className="text-lg font-semibold text-cyan-400">
                    {abiOnlineSample > 0 ? `${formatCurrency(abiOnlineAvgBrl)} · ${formatByCurrency(abiOnlineAvgUsd, "USD")}` : "—"}
                  </p>
                  <p className="text-[11px] text-muted-foreground">
                    {abiOnlineSample > 0
                      ? `${abiOnlineSample} mesas`
                      : "Sem amostra de mesas online"}
                  </p>
                </div>
                <div className="rounded-lg border border-violet-500/20 bg-violet-500/5 p-3">
                  <p className="text-xs text-muted-foreground mb-1">ABI Médio Live</p>
                  <p className="text-lg font-semibold text-violet-400">
                    {abiLiveSample > 0 ? `${formatCurrency(abiLiveAvgBrl)} · ${formatByCurrency(abiLiveAvgUsd, "USD")}` : "—"}
                  </p>
                  <p className="text-[11px] text-muted-foreground">
                    {abiLiveSample > 0 ? `${abiLiveSample} mesas` : "Sem amostra de mesas live"}
                  </p>
                </div>
              </div>
              <div className="mb-4 rounded-xl border border-emerald-500/20 bg-emerald-500/5 p-3">
                <div className="mb-3 flex flex-wrap gap-1.5">
                  {([
                    { key: "3m", label: "3M" },
                    { key: "6m", label: "6M" },
                    { key: "12m", label: "12M" },
                    { key: "yoy", label: "Ano vs Ano" },
                  ] as const).map((option) => (
                    <Button
                      key={option.key}
                      type="button"
                      size="sm"
                      variant={monthlyCompareMode === option.key ? "default" : "outline"}
                      className="h-7 px-2.5 text-[10px]"
                      onClick={() => setMonthlyCompareMode(option.key)}
                    >
                      {option.label}
                    </Button>
                  ))}
                </div>
                <div className="flex flex-wrap items-start justify-between gap-3">
                  <div>
                    <p className="text-xs text-muted-foreground">
                      {monthlyCompareMode === "yoy" ? "Lucro do ano" : "Lucro do mês"}
                    </p>
                    <p className={`text-lg font-semibold ${monthlyComparison.currentProfit >= 0 ? "text-green-700 dark:text-emerald-400" : "text-red-700 dark:text-red-400"}`}>
                      {monthlyComparison.currentProfit >= 0 ? "+" : ""}{formatCurrency(monthlyComparison.currentProfit)}
                    </p>
                    <p className="text-[11px] text-muted-foreground capitalize">{monthlyComparison.currentLabel}</p>
                  </div>
                  <div className="text-right">
                    <p className="text-xs text-muted-foreground">
                      {monthlyCompareMode === "yoy" ? "Vs ano anterior" : "Vs mês anterior"}
                    </p>
                    <p className={`text-sm font-semibold ${monthlyComparison.delta >= 0 ? "text-green-700 dark:text-emerald-400" : "text-red-700 dark:text-red-400"}`}>
                      {monthlyComparison.delta >= 0 ? "+" : ""}{formatCurrency(monthlyComparison.delta)}
                    </p>
                    <p className={`text-[11px] ${monthlyComparison.deltaPct >= 0 ? "text-green-700 dark:text-emerald-300" : "text-red-700 dark:text-red-300"}`}>
                      {monthlyComparison.deltaPct >= 0 ? "+" : ""}{monthlyComparison.deltaPct.toFixed(1)}%
                    </p>
                  </div>
                </div>

                <div className="mt-3 grid grid-cols-1 gap-1.5 sm:grid-cols-2">
                  <div className="rounded-lg border border-border/50 bg-background/40 px-2 py-1.5">
                    <p className="text-[10px] text-muted-foreground">{monthlyCompareMode === "yoy" ? "Ano atual" : "Mês atual"}</p>
                    <p className="text-xs font-medium capitalize">{monthlyComparison.currentLabel}</p>
                  </div>
                  <div className="rounded-lg border border-border/50 bg-background/40 px-2 py-1.5">
                    <p className="text-[10px] text-muted-foreground">{monthlyCompareMode === "yoy" ? "Ano anterior" : "Mês anterior"}</p>
                    <p className="text-xs font-medium capitalize">{monthlyComparison.previousLabel}</p>
                  </div>
                </div>

                <div className="mt-3 space-y-1.5">
                  {monthlyComparison.recent.map((month) => (
                    <div key={month.key} className="flex items-center gap-2">
                      <span className="w-12 text-[10px] uppercase text-muted-foreground">{month.label}</span>
                      <div className="h-2 flex-1 rounded-sm bg-background/60">
                        <div
                          className={`h-2 rounded-sm ${month.profit >= 0 ? "bg-emerald-500/80" : "bg-red-500/80"}`}
                          style={{ width: `${Math.max(6, month.widthPct)}%` }}
                        />
                      </div>
                      <span className={`w-24 text-right text-[10px] font-medium ${month.profit >= 0 ? "text-green-700 dark:text-emerald-300" : "text-red-700 dark:text-red-300"}`}>
                        {month.profit >= 0 ? "+" : ""}{formatCurrency(month.profit)}
                      </span>
                    </div>
                  ))}
                </div>
              </div>
                <div className="mb-4 rounded-xl border border-cyan-500/20 bg-slate-100/95 dark:bg-slate-950/40 px-3 py-2">
                <div className="flex flex-wrap items-center gap-x-4 gap-y-1 text-xs">
                  <div>
                      <span className="text-slate-600 dark:text-slate-400">Foco:</span>{" "}
                    <span className="font-semibold">{primaryType === "online" ? "Online" : "Live"}</span>{" "}
                    <span className="text-muted-foreground">
                      ({primaryTypeShare > 0 ? `${primaryTypeShare.toFixed(0)}%` : "sem amostra"})
                    </span>
                  </div>
                  <div>
                      <span className="text-slate-600 dark:text-slate-400">Plataforma:</span>{" "}
                    <span className="font-semibold">{topVenueName ?? "indefinida"}</span>
                  </div>
                  <div>
                      <span className="text-slate-600 dark:text-slate-400">Formato:</span>{" "}
                    <span className="font-semibold">{topFormatLabel ?? "indefinido"}</span>
                  </div>
                  <div>
                      <span className="text-slate-600 dark:text-slate-400">BI base:</span>{" "}
                    <span className="font-semibold">
                      {topBuyInValue > 0
                        ? (primaryType === "online" ? formatByCurrency(topBuyInValue, "USD") : formatCurrency(topBuyInValue))
                        : "indefinido"}
                    </span>
                  </div>
                </div>
              </div>
              <div className="flex items-center gap-4 text-xs border-t border-cyan-500/15 pt-3 flex-wrap">
                <div className="flex items-center gap-1.5">
                  <span className="text-slate-600 dark:text-slate-400">Sessões jogadas:</span>
                  <span className="font-semibold">{totalPlayedSessions}</span>
                </div>
                <div className="flex items-center gap-1.5">
                  <span className="text-slate-600 dark:text-slate-400">Mesas jogadas:</span>
                  <span className="font-semibold">{totalPlayedTables}</span>
                </div>
                <div className="flex items-center gap-1.5">
                  <span className="text-slate-600 dark:text-slate-400">ITM Rate:</span>
                  <span className={`font-semibold ${(stats?.winRate || 0) >= 50 ? "text-green-700 dark:text-emerald-400" : "text-amber-700 dark:text-amber-400"}`}>
                    {(stats?.winRate || 0).toFixed(1)}%
                  </span>
                  <span className="text-muted-foreground">
                    ({(stats as any)?.itmCount ?? 0}/{stats?.totalTables ?? 0})
                  </span>
                </div>
                <div className="flex items-center gap-1.5">
                  <span className="text-slate-600 dark:text-slate-400">Média/sessão:</span>
                  <span className={`font-semibold ${(stats?.avgProfit || 0) >= 0 ? "text-green-700 dark:text-emerald-400" : "text-red-700 dark:text-red-400"}`}>
                    {formatCurrencyCompact(stats?.avgProfit || 0)}
                  </span>
                </div>
                <div className="flex items-center gap-1.5">
                  <span className="text-slate-600 dark:text-slate-400">Hourly:</span>
                  <span className={`font-semibold ${(stats?.avgHourlyRate || 0) >= 0 ? "text-green-700 dark:text-emerald-400" : "text-red-700 dark:text-red-400"}`}>
                    {formatCurrencyCompact(stats?.avgHourlyRate || 0)}/h
                  </span>
                </div>
              </div>
            </CardContent>
          </Card>

          {/* Donut + Desempenho */}
          <div>
            {/* Desempenho por plataforma */}
            <Card className="border-cyan-500/20 card-gradient-dark shadow-sm dark:shadow-[0_0_26px_rgba(34,211,238,0.08)] transition-all duration-300 hover:-translate-y-1 hover:shadow-lg dark:hover:shadow-xl dark:hover:shadow-purple-500/20 hover:border-purple-500/60">
              <CardHeader className="pb-2">
                <div className="flex items-center justify-between flex-wrap gap-2">
                  <CardTitle className="text-sm font-semibold">Desempenho</CardTitle>
                  <div className="flex gap-1">
                    {(["roi", "winrate", "sessions", "profit"] as const).map((m) => (
                      <Button key={m} size="sm" variant={perfMetric === m ? "default" : "ghost"}
                        className="h-6 px-2 text-[10px]" onClick={() => setPerfMetric(m)}>
                        {m === "roi" ? "ROI" : m === "winrate" ? "ITM%" : m === "sessions" ? "Mesas" : "R$"}
                      </Button>
                    ))}
                  </div>
                </div>
              </CardHeader>
              <CardContent className="space-y-4">
                {/* Gráfico de evolução do dinheiro */}
                {chartData.length > 1 ? (
                  <div>
                    <p className="text-xs text-muted-foreground mb-2 font-medium">Evolução do Bankroll</p>
                    <div className="h-36">
                      <ResponsiveContainer width="100%" height="100%">
                        <LineChart data={chartData} margin={{ top: 6, right: 4, bottom: 0, left: -6 }}>
                          <CartesianGrid strokeDasharray="2 2" stroke={chartColors.gridLine} vertical={false} />
                          <XAxis
                            dataKey="date"
                            stroke={chartColors.axis}
                            fontSize={9}
                            tickLine={false}
                            axisLine={false}
                            minTickGap={24}
                            interval="preserveStartEnd"
                          />
                          <YAxis stroke={chartColors.axis} fontSize={9} tickLine={false} axisLine={false}
                            tickFormatter={(v) => new Intl.NumberFormat("pt-BR", { style: "currency", currency: "BRL", minimumFractionDigits: 2, maximumFractionDigits: 2 }).format(v)}
                            domain={chartYDomain} width={52} />
                          <RechartsTooltip
                            content={({ active, payload }: any) => {
                              if (!active || !payload?.length) return null;
                              const point = payload[0]?.payload;
                              return (
                                <div className="bg-card/95 border border-border rounded-lg p-2 shadow-xl text-xs">
                                  <p className="font-semibold mb-1">{point?.fullDate ?? point?.date}</p>
                                  {payload.map((p: any) => (
                                    <p key={p.dataKey} style={{ color: p.color }}>
                                      {p.dataKey === "total" ? "Total" : p.dataKey === "online" ? "Online" : "Live"}: R$ {Number(p.value).toFixed(2)}
                                    </p>
                                  ))}
                                </div>
                              );
                            }}
                          />
                          <Line type="linear" dataKey="total" stroke={theme === "light" ? "#15803d" : "var(--primary)"} strokeWidth={2.25} dot={false} activeDot={{ r: 4 }} name="Total" />
                          <Line type="linear" dataKey="online" stroke={theme === "light" ? "#0369a1" : "#06b6d4"} strokeWidth={1.75} dot={false} strokeDasharray="4 2" name="Online" />
                          <Line type="linear" dataKey="live" stroke={theme === "light" ? "#92400e" : "#f59e0b"} strokeWidth={1.75} dot={false} strokeDasharray="3 3" name="Live" />
                        </LineChart>
                      </ResponsiveContainer>
                    </div>
                    <div className="flex flex-wrap gap-x-4 gap-y-1 mt-2">
                      <span className="flex items-center gap-1 text-[10px] text-muted-foreground">
                        <span className="h-2 w-4 rounded-full inline-block" style={{ background: "var(--primary)" }} /> Total
                      </span>
                      <span className="flex items-center gap-1 text-[10px] text-muted-foreground">
                        <span className="h-0.5 w-4 inline-block border-t-2 border-dashed border-cyan-400" /> Online
                      </span>
                      <span className="flex items-center gap-1 text-[10px] text-muted-foreground">
                        <span className="h-0.5 w-4 inline-block border-t-2 border-dashed border-amber-400" /> Live
                      </span>
                    </div>
                  </div>
                ) : (
                  <div className="h-36 flex flex-col items-center justify-center gap-2 text-center border border-dashed border-border/40 rounded-lg">
                    <TrendingUp className="h-8 w-8 text-muted-foreground/30" />
                    <p className="text-xs text-muted-foreground">Registre sessões para ver a evolução</p>
                  </div>
                )}
                {/* Gráfico de barras de desempenho por plataforma */}
                {perfData.length > 0 && (
                  <div>
                    <p className="text-xs text-muted-foreground mb-2 font-medium">Desempenho por Plataforma</p>
                    <div className="h-56">
                    <ResponsiveContainer width="100%" height="100%">
                      <BarChart data={perfData} layout="vertical" barSize={14} margin={{ top: 0, right: 30, bottom: 0, left: 0 }}>
                        <XAxis type="number" stroke={chartColors.axis} fontSize={10} tickLine={false}
                          tickFormatter={(v) => {
                            if (perfMetric === "sessions") return String(v);
                            if (perfMetric === "profit") return new Intl.NumberFormat("pt-BR", { style: "currency", currency: "BRL", minimumFractionDigits: 2, maximumFractionDigits: 2 }).format(v);
                            return `${v}%`;
                          }} />
                        <YAxis type="category" dataKey="name" stroke={chartColors.axis} fontSize={10} tickLine={false} width={95} />
                        <RechartsTooltip
                              content={({ active, payload }: any) => {
                            if (!active || !payload?.length) return null;
                            const d = payload[0].payload;
                            return (
                              <div className="bg-card border border-border rounded-lg p-2 shadow-xl text-xs">
                                <p className="font-semibold mb-1">{d.fullName}</p>
                                <p>Resultado: <span className={d.profit >= 0 ? "text-green-700 dark:text-emerald-400" : "text-red-700 dark:text-red-400"}>{d.profit >= 0 ? "+" : ""}{new Intl.NumberFormat("pt-BR", { style: "currency", currency: "BRL" }).format(d.profit)}</span></p>
                                <p>ROI: <span className={d.roi >= 0 ? "text-green-700 dark:text-emerald-400" : "text-red-700 dark:text-red-400"}>{d.roi}%</span></p>
                                <p>ITM Rate: <span className="text-primary">{d.winrate}%</span> <span className="text-muted-foreground">({d.itmCount}/{d.tables})</span></p>
                                <p>Mesas: <span className="font-semibold">{d.tables ?? d.sessions}</span></p>
                              </div>
                            );
                          }}
                        />
                        <Bar dataKey={perfMetric === "roi" ? "roi" : perfMetric === "winrate" ? "winrate" : perfMetric === "sessions" ? "tables" : "profit"} radius={[0, 4, 4, 0]}>
                          {perfData.map((entry: any, index: number) => (
                            <Cell key={`cell-${index}`}
                              fill={VENUE_COLORS[index % VENUE_COLORS.length]}
                            />
                          ))}
                        </Bar>
                      </BarChart>
                    </ResponsiveContainer>
                    </div>
                  </div>
                )}
              </CardContent>
            </Card>
          </div>

          {/* Evolução do Bankroll */}
            <Card className="border-violet-500/20 card-gradient-violet shadow-sm dark:shadow-[0_0_26px_rgba(168,85,247,0.08)] transition-all duration-300 hover:-translate-y-1 hover:shadow-lg dark:hover:shadow-xl dark:hover:shadow-purple-500/20 hover:border-purple-500/60">
            <CardHeader className="pb-2">
              <div className="flex items-center justify-between flex-wrap gap-2">
                <div className="flex items-center gap-2">
                  <CardTitle className="text-sm font-semibold">Evolução do Bankroll</CardTitle>
                  {hasRoiData && (
                    <Badge variant={consolidatedPct >= 0 ? "default" : "destructive"} className="text-xs gap-1">
                      {consolidatedPct >= 0 ? <TrendingUp className="h-3 w-3" /> : <TrendingDown className="h-3 w-3" />}
                      {formatPercent(consolidatedPct)}
                    </Badge>
                  )}
                </div>
                <div className="flex gap-1">
                  {(["all", "online", "live"] as const).map((p) => (
                    <Button key={p} size="sm" variant={chartPeriod === p ? "default" : "ghost"}
                      className="h-7 px-2.5 text-xs" onClick={() => setChartPeriod(p)}>
                      {p === "all" ? "Todos" : p === "online" ? "Online" : "Live"}
                    </Button>
                  ))}
                </div>
              </div>
            </CardHeader>
            <CardContent>
              {chartData.length > 1 ? (
                <div className="h-56">
                  <ResponsiveContainer width="100%" height="100%">
                    <AreaChart data={chartData} margin={{ top: 5, right: 5, bottom: 0, left: 0 }}>
                      <defs>
                        <linearGradient id="gradOnline" x1="0" y1="0" x2="0" y2="1">
                          <stop offset="5%" stopColor={theme === "light" ? "#0369a1" : "#06b6d4"} stopOpacity={0.3} />
                          <stop offset="95%" stopColor={theme === "light" ? "#0369a1" : "#06b6d4"} stopOpacity={0} />
                        </linearGradient>
                        <linearGradient id="gradLive" x1="0" y1="0" x2="0" y2="1">
                          <stop offset="5%" stopColor={theme === "light" ? "#92400e" : "#f59e0b"} stopOpacity={0.3} />
                          <stop offset="95%" stopColor={theme === "light" ? "#92400e" : "#f59e0b"} stopOpacity={0} />
                        </linearGradient>
                        <linearGradient id="gradTotal" x1="0" y1="0" x2="0" y2="1">
                          <stop offset="5%" stopColor={theme === "light" ? "#15803d" : "#3b82f6"} stopOpacity={0.35} />
                          <stop offset="95%" stopColor={theme === "light" ? "#15803d" : "#3b82f6"} stopOpacity={0} />
                        </linearGradient>
                      </defs>
                      <CartesianGrid strokeDasharray="3 3" stroke={chartColors.gridLine} />
                      <XAxis dataKey="date" stroke={chartColors.axis} fontSize={11} tickLine={false} />
                      <YAxis stroke={chartColors.axis} fontSize={11} tickLine={false} axisLine={false}
                        domain={chartYDomain}
                        tickFormatter={(v) => new Intl.NumberFormat("pt-BR", { style: "currency", currency: "BRL", minimumFractionDigits: 2, maximumFractionDigits: 2 }).format(v)} />
                      <ReferenceLine y={0} stroke={chartColors.gridLine} strokeDasharray="4 4" />
                      <RechartsTooltip content={<CustomTooltip />} />
                      {(chartPeriod === "all" || chartPeriod === "online") && (
                        <Area type="linear" dataKey="online" name="Online" stroke={theme === "light" ? "#0369a1" : "#06b6d4"} strokeWidth={2} fill="url(#gradOnline)" dot={false} activeDot={{ r: 4 }} />
                      )}
                      {(chartPeriod === "all" || chartPeriod === "live") && (
                        <Area type="linear" dataKey="live" name="Live" stroke={theme === "light" ? "#92400e" : "#f59e0b"} strokeWidth={2} fill="url(#gradLive)" dot={false} activeDot={{ r: 4 }} />
                      )}
                      {chartPeriod === "all" && (
                        <Area type="linear" dataKey="total" name="Total" stroke={theme === "light" ? "#15803d" : "#3b82f6"} strokeWidth={2.5} fill="url(#gradTotal)" dot={false} activeDot={{ r: 5 }} />
                      )}
                    </AreaChart>
                  </ResponsiveContainer>
                </div>
              ) : (
                <div className="h-56 flex flex-col items-center justify-center gap-3 text-center">
                  <BarChart2 className="h-12 w-12 text-muted-foreground/30" />
                  <p className="text-muted-foreground text-sm">Registre sessões para ver o gráfico de performance</p>
                  <Link href="/sessions">
                    <Button size="sm" variant="outline" className="gap-1.5"><Plus className="h-4 w-4" /> Registrar Sessão</Button>
                  </Link>
                </div>
              )}
            </CardContent>
          </Card>

          <Card className="overflow-hidden border-cyan-500/20 card-gradient-radial shadow-sm dark:shadow-[0_0_35px_rgba(34,211,238,0.1)] transition-all duration-300 hover:-translate-y-1 hover:shadow-lg dark:hover:shadow-xl dark:hover:shadow-purple-500/20 hover:border-purple-500/60">
            <CardHeader className="pb-2">
              <div className="flex items-center justify-between gap-2">
                <div>
                  <CardTitle className="text-sm font-semibold flex items-center gap-2 text-foreground">
                    <Swords className="h-4 w-4 text-cyan-400" /> Contador de Mãos
                  </CardTitle>
                  <p className="text-xs text-muted-foreground">Perfil visual aplicado em todas as mãos e favoritas em destaque.</p>
                </div>
                <div className="flex gap-1">
                  <Button size="sm" variant="ghost" className="h-7 px-2 text-xs text-slate-700 hover:text-slate-900 dark:text-slate-300 dark:hover:text-white" onClick={openHandsEditModal}>
                    <Pencil className="h-3.5 w-3.5 mr-1" /> Editar
                  </Button>
                  <Button size="sm" variant="ghost" className="h-7 px-2 text-xs text-slate-700 hover:text-slate-900 dark:text-slate-300 dark:hover:text-white" onClick={() => setShowHandsConfigModal(true)}>
                    <Settings2 className="h-3.5 w-3.5 mr-1" /> Personalizar
                  </Button>
                </div>
              </div>
            </CardHeader>
            <CardContent className="pt-1">
              {(() => {
                const builtInHands = ["kk", "jj", "aa", "ak"] as const;
                const customColors = [
                  { border: "border-emerald-500/60", glow: "shadow-sm dark:shadow-[0_0_30px_rgba(16,185,129,0.18)]", text: "text-green-700 dark:text-emerald-300" },
                  { border: "border-pink-500/60", glow: "shadow-sm dark:shadow-[0_0_30px_rgba(236,72,153,0.18)]", text: "text-pink-700 dark:text-pink-300" },
                  { border: "border-amber-500/60", glow: "shadow-sm dark:shadow-[0_0_30px_rgba(245,158,11,0.18)]", text: "text-amber-700 dark:text-amber-300" },
                  { border: "border-blue-500/60", glow: "shadow-sm dark:shadow-[0_0_30px_rgba(59,130,246,0.18)]", text: "text-blue-700 dark:text-blue-300" },
                ];
                const builtInTheme: Record<string, { border: string; glow: string; text: string }> = {
                  kk: { border: "border-cyan-500/70", glow: "shadow-sm dark:shadow-[0_0_30px_rgba(34,211,238,0.18)]", text: "text-cyan-700 dark:text-cyan-300" },
                  jj: { border: "border-violet-500/70", glow: "shadow-sm dark:shadow-[0_0_30px_rgba(168,85,247,0.18)]", text: "text-violet-700 dark:text-violet-300" },
                  aa: { border: "border-cyan-400/70", glow: "shadow-sm dark:shadow-[0_0_30px_rgba(34,211,238,0.22)]", text: "text-cyan-800 dark:text-cyan-200" },
                  ak: { border: "border-blue-500/70", glow: "shadow-sm dark:shadow-[0_0_30px_rgba(59,130,246,0.18)]", text: "text-blue-700 dark:text-blue-300" },
                };

                const builtInEntries = builtInHands
                  .filter((hand) => !handPrefs.hidden.includes(hand))
                  .map((hand) => ({
                    key: hand,
                    label: hand.toUpperCase(),
                    stats: handPatternStats?.[hand] ?? { hands: 0, wins: 0, losses: 0, winRate: 0 },
                    isCustom: false,
                    isFavorite: handPrefs.favorites.includes(hand),
                  }));

                const customEntries = handPrefs.customHands
                  .filter((hand) => !handPrefs.hidden.includes(hand.name))
                  .map((hand) => {
                    const total = hand.wins + hand.losses;
                    return {
                      key: hand.name,
                      label: hand.name.toUpperCase(),
                      stats: {
                        hands: total,
                        wins: hand.wins,
                        losses: hand.losses,
                        winRate: total > 0 ? Math.round((hand.wins / total) * 100) : 0,
                      },
                      isCustom: true,
                      isFavorite: handPrefs.favorites.includes(hand.name),
                    };
                  });

                const orderedHands = [...builtInEntries, ...customEntries].sort((a, b) => {
                  if (Number(b.isFavorite) !== Number(a.isFavorite)) return Number(b.isFavorite) - Number(a.isFavorite);
                  return a.label.localeCompare(b.label, "pt-BR");
                });

                return (
                  <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-3 gap-3">
                    {orderedHands.map((hand, index) => {
                      const theme = hand.isCustom ? customColors[index % customColors.length] : builtInTheme[hand.key];
                      return (
                        <div key={hand.key} className={`relative rounded-[24px] border ${theme.border} ${theme.glow} bg-white dark:bg-[linear-gradient(180deg,_rgba(16,24,40,0.92),_rgba(18,25,46,0.82))] p-4 text-center overflow-hidden`}>
                          <div className="absolute inset-[10px] rounded-[18px] border border-slate-200 dark:border-white/8 pointer-events-none" />
                          <button
                            type="button"
                            className="absolute right-3 top-3 z-10"
                            onClick={() => saveHandPrefs({
                              ...handPrefs,
                              favorites: hand.isFavorite
                                ? handPrefs.favorites.filter((item) => item !== hand.key)
                                : [...handPrefs.favorites, hand.key],
                            })}
                          >
                            <Star className={`h-4 w-4 ${hand.isFavorite ? "fill-yellow-400 text-yellow-400" : "text-slate-500 hover:text-yellow-500 dark:hover:text-yellow-300"}`} />
                          </button>
                          <div className="relative z-10 space-y-2">
                            <p className={`text-4xl font-black tracking-widest ${theme.text}`}>{hand.label}</p>
                            <p className="text-sm text-slate-600 dark:text-slate-300">{hand.stats.hands} {hand.stats.hands === 1 ? "mão" : "mãos"}</p>
                            <div className="space-y-1">
                              <p className="text-4xl font-bold text-green-700 dark:text-emerald-400">{hand.stats.wins}W</p>
                              <p className="text-4xl font-bold text-red-700 dark:text-red-400">{hand.stats.losses}L</p>
                              <p className="text-2xl font-semibold text-slate-900 dark:text-white">{hand.stats.winRate}%</p>
                            </div>
                            <div className="grid grid-cols-2 gap-2 pt-2">
                              <Button
                                size="sm"
                                className="h-9 rounded-full bg-emerald-600 hover:bg-emerald-500 font-bold"
                                disabled={registerHandResultMutation.isPending}
                                onClick={() => hand.isCustom
                                  ? registerCustomHandResult(hand.key, "win")
                                  : registerHandResultMutation.mutate({ hand: hand.key as "kk" | "jj" | "aa" | "ak", outcome: "win" })}
                              >
                                W
                              </Button>
                              <Button
                                size="sm"
                                className="h-9 rounded-full bg-red-600 hover:bg-red-500 font-bold"
                                disabled={registerHandResultMutation.isPending}
                                onClick={() => hand.isCustom
                                  ? registerCustomHandResult(hand.key, "loss")
                                  : registerHandResultMutation.mutate({ hand: hand.key as "kk" | "jj" | "aa" | "ak", outcome: "loss" })}
                              >
                                L
                              </Button>
                            </div>
                          </div>
                        </div>
                      );
                    })}

                    <button
                      type="button"
                      onClick={() => setShowHandsConfigModal(true)}
                      className="rounded-[24px] border border-dashed border-slate-300 dark:border-slate-700 bg-white/90 dark:bg-slate-950/40 p-4 min-h-[264px] flex flex-col items-center justify-center gap-2 text-slate-600 dark:text-slate-400 hover:text-slate-800 dark:hover:text-slate-200 hover:border-slate-400 dark:hover:border-slate-500 transition-colors"
                    >
                      <PlusCircle className="h-7 w-7" />
                      <span className="text-sm font-medium">Adicionar mão</span>
                    </button>
                  </div>
                );
              })()}
            </CardContent>
          </Card>
        </div>

        {/* RIGHT COLUMN */}
        <div className="xl:col-span-2 space-y-5">
          {/* Cards Online + Live lado a lado no topo */}
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            {typeSummaryCards.map((card) => {
              const Icon = card.icon;
              return (
                <Card key={card.key} className={`overflow-hidden border ${card.borderClass} card-gradient-dark transition-all duration-300 hover:-translate-y-1 hover:shadow-lg dark:hover:shadow-xl dark:hover:shadow-purple-500/20 hover:border-purple-500/60`}>
                  <div className={`h-1 w-full bg-gradient-to-r ${card.gradientClass}`} />
                  <CardContent className="p-4">
                    <div className="flex items-center justify-between mb-2">
                      <Badge variant="outline" className={`${card.badgeClass} text-xs gap-1`}>
                        <Icon className="h-3 w-3" />{card.title}
                      </Badge>
                      <button
                        onClick={card.onEdit}
                        className={`text-[10px] ${card.editClass} flex items-center gap-0.5 transition-colors`}
                      >
                        {card.current > 0 ? <><Pencil className="h-2.5 w-2.5" />Editar</> : <><Plus className="h-2.5 w-2.5" />Definir</>}
                      </button>
                    </div>
                    <p className="text-xl font-bold mb-1">{formatCurrencyCompact(card.current)}</p>
                    <div className={`flex items-center gap-1 text-xs ${card.profit >= 0 ? "text-green-700 dark:text-emerald-400" : "text-red-700 dark:text-red-400"}`}>
                      {card.profit >= 0 ? <TrendingUp className="h-3 w-3" /> : <TrendingDown className="h-3 w-3" />}
                      <span>{card.profit >= 0 ? "+" : ""}{formatCurrencyCompact(card.profit)}</span>
                    </div>
                    <UiTooltip>
                      <TooltipTrigger asChild>
                        <p className="text-xs text-muted-foreground mt-1 inline-block cursor-default">
                          {card.tables} mesa{card.tables === 1 ? "" : "s"}
                        </p>
                      </TooltipTrigger>
                      <TooltipContent side="bottom" align="start" sideOffset={10}>
                        <span>{card.sessions} sess{card.sessions === 1 ? "ão" : "ões"}</span>
                      </TooltipContent>
                    </UiTooltip>
                  </CardContent>
                </Card>
              );
            })}
          </div>

          {/* Minhas Plataformas (apenas stats) */}
          <Card className="border-cyan-500/20 card-gradient-dark transition-all duration-300 hover:-translate-y-1 hover:shadow-lg dark:hover:shadow-xl dark:hover:shadow-purple-500/20 hover:border-purple-500/60">
            <CardHeader className="pb-2">
              <div className="flex items-center justify-between">
                <CardTitle className="text-sm font-semibold">Plataformas Prioritárias</CardTitle>
                <Link href="/venues">
                  <Button size="sm" variant="ghost" className="h-7 px-2 text-xs gap-1 text-muted-foreground">
                    <Settings2 className="h-3.5 w-3.5" /> Gerenciar
                  </Button>
                </Link>
              </div>
              <p className="text-xs text-muted-foreground">Ordenadas por frequência de uso e ambiente dominante</p>
            </CardHeader>
            <CardContent className="px-3 py-0 max-h-[400px] overflow-y-auto">
              {prioritizedVenues.length > 0 ? (
                prioritizedVenues.map((venue: any, i: number) => (
                  <VenueRow
                    key={venue.id}
                    venue={venue}
                    colorIdx={i}
                  />
                ))
              ) : (
                <div className="flex flex-col items-center justify-center py-8 text-center gap-2">
                  <Building2 className="h-10 w-10 text-muted-foreground/30" />
                  <p className="text-sm text-muted-foreground">Nenhuma plataforma cadastrada</p>
                  <Link href="/venues">
                    <Button size="sm" variant="outline" className="gap-1.5 text-xs"><Plus className="h-3.5 w-3.5" /> Adicionar Plataforma</Button>
                  </Link>
                </div>
              )}
            </CardContent>
          </Card>

          <Card className="border-violet-500/20 card-gradient-violet transition-all duration-300 hover:-translate-y-1 hover:shadow-lg dark:hover:shadow-xl dark:hover:shadow-purple-500/20 hover:border-purple-500/60">
            <CardHeader className="pb-2">
              <div className="flex items-center justify-between gap-2">
                <div>
                  <CardTitle className="text-sm font-semibold flex items-center gap-2">
                    <Trophy className="h-4 w-4 text-amber-500" /> Análise por Torneio
                  </CardTitle>
                  <p className="text-xs text-muted-foreground">Aba de favoritos e histórico por maiores resultados.</p>
                </div>
                <div className="flex items-center gap-1.5">
                  <Badge variant="outline" className="text-[10px]">N{userLeagueLevel} · {userLeagueCompact} {userLeagueEmoji}</Badge>
                  <Badge variant="outline" className="text-[10px]">Limite {tournamentAccessLimit} torneios</Badge>
                </div>
              </div>
              <div className="flex items-center gap-1.5 pt-1">
                <Button
                  size="sm"
                  variant={activeTournamentTab === "favoritos" ? "default" : "ghost"}
                  className="h-7 px-2 text-[11px]"
                  onClick={() => setActiveTournamentTab("favoritos")}
                >
                  Favoritos
                </Button>
                <Button
                  size="sm"
                  variant={activeTournamentTab === "historico" ? "default" : "ghost"}
                  className="h-7 px-2 text-[11px]"
                  onClick={() => setActiveTournamentTab("historico")}
                >
                  Histórico
                </Button>
              </div>
              <p className="text-[11px] text-muted-foreground">
                Níveis: N0 Recreativo 🃏 · N1 Grinder ♣️ · N2 Reg ♠️ · N3 Mid Stakes ♦️ · N4-5 High Stakes ♥️ · N6 The Edge 🂡 · N7 High Roller 💰.
              </p>
            </CardHeader>
            <CardContent className="pt-0 space-y-2">
              {visibleTournaments.length > 0 ? (
                visibleTournaments.map((tournament: any, index: number) => {
                  const expanded = expandedTournament === tournament.name;
                  const hasSimilar = (tournament as any).similarNames?.length > 0;
                  const isFavoriteTournament = favoriteTournamentNames.includes(String(tournament.name));
                  return (
                    <div key={tournament.name} className="rounded-lg border border-border/40 overflow-hidden">
                      <button
                        type="button"
                        onClick={() => setExpandedTournament(expanded ? null : tournament.name)}
                        className="w-full flex items-center justify-between px-3 py-3 text-left hover:bg-muted/20 transition-colors"
                      >
                        <div className="min-w-0">
                          <div className="flex items-center gap-1.5">
                            {activeTournamentTab === "historico" && (
                              <span className="shrink-0 text-[10px] text-muted-foreground">#{index + 1}</span>
                            )}
                            <p className="text-sm font-semibold truncate">{tournament.name}</p>
                            {hasSimilar && (
                              <span title={`Nome parecido com: ${(tournament as any).similarNames.join(", ")}`} className="shrink-0 text-[10px] font-bold px-1.5 py-0.5 rounded bg-amber-500/20 text-amber-400 border border-amber-500/30">
                                ~similar
                              </span>
                            )}
                          </div>
                          <p className="text-[11px] text-muted-foreground">
                            {tournament.tables} mesa{tournament.tables === 1 ? "" : "s"} · {tournament.sessions} sessõ{tournament.sessions === 1 ? "e" : "es"}
                          </p>
                        </div>
                        <div className="flex items-center gap-3 shrink-0">
                          <button
                            type="button"
                            title={isFavoriteTournament ? "Remover dos favoritos" : "Adicionar aos favoritos"}
                            onClick={(event) => {
                              event.stopPropagation();
                              const next = isFavoriteTournament
                                ? favoriteTournamentNames.filter((name) => name !== tournament.name)
                                : [...favoriteTournamentNames, tournament.name];
                              saveFavoriteTournamentNames(next);
                            }}
                            className="rounded p-1 hover:bg-muted/40"
                          >
                            <Star className={`h-4 w-4 ${isFavoriteTournament ? "fill-yellow-400 text-yellow-400" : "text-muted-foreground hover:text-yellow-400"}`} />
                          </button>
                          <p className={`text-xs font-semibold ${tournament.profit >= 0 ? "text-green-700 dark:text-emerald-400" : "text-red-700 dark:text-red-400"}`}>
                            {tournament.profit >= 0 ? "+" : ""}{formatCurrencyCompact(tournament.profit)}
                          </p>
                          {expanded ? <ChevronDown className="h-4 w-4 text-muted-foreground" /> : <ChevronRight className="h-4 w-4 text-muted-foreground" />}
                        </div>
                      </button>
                      {expanded && (
                        <>
                          {hasSimilar && (
                            <div className="px-3 py-2 bg-amber-500/10 border-t border-amber-500/20 text-[11px] text-amber-400">
                              ⚠️ Nome parecido com: <span className="font-semibold">{(tournament as any).similarNames.join(", ")}</span>. Confirme se são o mesmo torneio.
                            </div>
                          )}
                          <div className="grid grid-cols-4 gap-2 border-t border-border/40 bg-muted/10 p-3 text-center">
                            <div className="rounded-md bg-background/40 px-2 py-2">
                              <p className="text-[10px] text-muted-foreground">Média/mesa</p>
                              <p className={`text-xs font-semibold ${(tournament as any).avgProfit >= 0 ? "text-green-700 dark:text-emerald-400" : "text-red-700 dark:text-red-400"}`}>
                                {formatCurrencyCompact((tournament as any).avgProfit)}
                              </p>
                            </div>
                            <div className="rounded-md bg-background/40 px-2 py-2">
                              <p className="text-[10px] text-muted-foreground">ITM</p>
                              <p className="text-xs font-semibold text-cyan-400">{(tournament as any).itmRate ?? 0}%</p>
                            </div>
                            <div className="rounded-md bg-background/40 px-2 py-2">
                              <p className="text-[10px] text-muted-foreground">Troféus</p>
                              <p className="text-xs font-semibold text-amber-400">{(tournament as any).trophies ?? 0} 🏆</p>
                            </div>
                            <div className="rounded-md bg-background/40 px-2 py-2">
                              <p className="text-[10px] text-muted-foreground">Saldo</p>
                              <p className={`text-xs font-semibold ${tournament.profit >= 0 ? "text-green-700 dark:text-emerald-400" : "text-red-700 dark:text-red-400"}`}>
                                {formatCurrencyCompact(tournament.profit)}
                              </p>
                            </div>
                          </div>
                          <div className="border-t border-border/40 px-3 py-2 flex items-center justify-between bg-background/30">
                            <p className="text-[11px] text-muted-foreground">Pronto para revisar e analisar este torneio no app.</p>
                            <Link href="/hand-reviewer">
                              <Button size="sm" variant="outline" className="h-7 px-2 text-[11px]">Analisar</Button>
                            </Link>
                          </div>
                        </>
                      )}
                    </div>
                  );
                })
              ) : (
                <div className="text-center py-6 text-sm text-muted-foreground">
                  {activeTournamentTab === "favoritos"
                    ? "Nenhum favorito salvo no limite do seu nível de acesso. Marque torneios com a estrela."
                    : "Nenhum torneio nomeado ainda."}
                </div>
              )}
            </CardContent>
          </Card>

          <Card className="border-cyan-500/20 card-gradient-dark transition-all duration-300 hover:-translate-y-1 hover:shadow-lg dark:hover:shadow-xl dark:hover:shadow-purple-500/20 hover:border-purple-500/60">
            <CardHeader className="pb-2">
              <div className="flex items-center justify-between">
                <CardTitle className="text-sm font-semibold flex items-center gap-2">
                  <ListChecks className="h-4 w-4" /> Mesas Jogadas Recentemente
                </CardTitle>
                <Link href="/sessions">
                  <Button size="sm" variant="ghost" className="h-7 px-2 text-xs">Ver sessões</Button>
                </Link>
              </div>
              <p className="text-xs text-muted-foreground">Cada mesa é salva separadamente dentro da sessão.</p>
            </CardHeader>
            <CardContent className="pt-0 space-y-2 max-h-[320px] overflow-y-auto">
              {recentTables && recentTables.length > 0 ? (
                recentTables.map((t: any) => (
                  <div key={t.id} className="flex items-center gap-3 rounded-lg border border-border/40 p-2.5">
                    <div className="h-8 w-8 rounded-md bg-muted/60 flex items-center justify-center overflow-hidden">
                      {t.venueLogoUrl ? (
                        <img src={t.venueLogoUrl} alt={t.venueName ?? "Mesa"} className="h-7 w-7 object-contain" />
                      ) : (
                        <span className="text-xs font-bold">{t.type === "online" ? "ON" : "LV"}</span>
                      )}
                    </div>
                    <div className="flex-1 min-w-0">
                      <p className="text-sm font-medium truncate">{t.venueName || "Mesa sem plataforma"}</p>
                      <p className="text-[11px] text-muted-foreground truncate">
                        {new Date(t.sessionDate).toLocaleDateString("pt-BR")} · {t.gameFormat}{t.tournamentName ? ` · ${t.tournamentName}` : ""} · Sessão #{t.sessionId}
                      </p>
                    </div>
                    <div className="text-right">
                      <p className={`text-xs font-semibold ${t.tableProfit >= 0 ? "text-green-700 dark:text-emerald-400" : "text-red-700 dark:text-red-400"}`}>
                        {t.tableProfit >= 0 ? "+" : ""}{formatByCurrency(t.tableProfit, t.currency)}
                      </p>
                      <p className="text-[11px] text-muted-foreground">BI {formatByCurrency(t.buyIn, t.currency)}</p>
                    </div>
                  </div>
                ))
              ) : (
                <div className="text-center py-6 text-sm text-muted-foreground">
                  Nenhuma mesa finalizada ainda.
                </div>
              )}
            </CardContent>
          </Card>
        </div>
      </div>
      </div>
    </div>
  );
}

