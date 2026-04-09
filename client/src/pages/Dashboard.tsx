import { trpc } from "@/lib/trpc";
import { useBehaviorProfile } from "@/hooks/useBehaviorProfile";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
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
} from "lucide-react";
import { Link } from "wouter";
import { useState, useMemo } from "react";
import { toast } from "sonner";

function formatCurrency(centavos: number): string {
  return new Intl.NumberFormat("pt-BR", { style: "currency", currency: "BRL" }).format(centavos / 100);
}
function formatCurrencyCompact(centavos: number): string {
  const val = centavos / 100;
  if (Math.abs(val) >= 1000)
    return new Intl.NumberFormat("pt-BR", { notation: "compact", compactDisplay: "short", style: "currency", currency: "BRL" }).format(val);
  return formatCurrency(centavos);
}
function formatPercent(v: number) { return `${v >= 0 ? "+" : ""}${v.toFixed(1)}%`; }
function formatByCurrency(centavos: number, currency: string) {
  const amount = centavos / 100;
  if (currency === "USD") return `$${amount.toFixed(2)}`;
  if (currency === "CAD") return `CA$${amount.toFixed(2)}`;
  if (currency === "JPY") return `¥${Math.round(amount)}`;
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
  JPY: { label: "Iene", flagUrl: "/flags/jp.svg" },
  CNY: { label: "Yuan", flagUrl: "/flags/cn.svg" },
} as const;

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
                <span className="inline-flex items-center px-1 py-0 rounded text-[9px] font-semibold bg-amber-500/15 text-amber-400 border border-amber-500/20">
                  🇧🇷 Nacional
                </span>
              )}
            </p>
          </div>
        </div>
        <div className="text-right shrink-0">
          {stats && tableCount > 0 ? (
            <>
              <p className={`text-sm font-bold ${stats.totalProfit >= 0 ? "text-emerald-400" : "text-red-400"}`}>
                {stats.totalProfit >= 0 ? "+" : ""}{formatCurrencyCompact(stats.totalProfit)}
              </p>
              <p className="text-xs text-muted-foreground">{tableCount} mesas</p>
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
                <p className={`text-sm font-bold ${roi && parseFloat(roi) >= 0 ? "text-emerald-400" : "text-red-400"}`}>
                  {roi !== null ? `${roi}%` : "—"}
                </p>
              </div>
              <div className="bg-muted/20 rounded-lg p-2 text-center">
                <p className="text-[10px] text-muted-foreground mb-0.5">ITM Rate</p>
                <p className={`text-sm font-bold ${(stats.winRate || 0) >= 50 ? "text-emerald-400" : "text-amber-400"}`}>
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
  const utils = trpc.useUtils();
  const [chartPeriod, setChartPeriod] = useState<"online" | "live" | "all">("all");
  const [perfMetric, setPerfMetric] = useState<"roi" | "winrate" | "sessions" | "profit">("roi");
  const [showOnlineModal, setShowOnlineModal] = useState(false);
  const [showLiveModal, setShowLiveModal] = useState(false);
  const [showHandsEditModal, setShowHandsEditModal] = useState(false);
  const [onlineInputValue, setOnlineInputValue] = useState("");
  const [liveInputValue, setLiveInputValue] = useState("");
  const [handEdit, setHandEdit] = useState({
    kk: { hands: 0, wins: 0, losses: 0 },
    jj: { hands: 0, wins: 0, losses: 0 },
  });

  const { data: consolidated, isLoading: loadingConsolidated } = trpc.bankroll.getConsolidated.useQuery();
  const { data: stats, isLoading: loadingStats } = trpc.sessions.stats.useQuery({});
  const { data: recentTables } = trpc.sessions.recentTables.useQuery({ limit: 8 });
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
    });
    setShowHandsEditModal(true);
  };

  const chartData = useMemo(() => {
    if (!history) return [];
    return history.map((p) => ({
      date: new Date(p.date).toLocaleDateString("pt-BR", { day: "2-digit", month: "2-digit" }),
      online: p.online / 100,
      live: p.live / 100,
      total: p.total / 100,
    }));
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
        name: v.venueName.length > 10 ? v.venueName.substring(0, 10) + "…" : v.venueName,
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
  const topFormatLabel = topFormatKey ? String(topFormatKey).replaceAll("_", " ") : null;
  const topBuyInValue = primaryType === "online"
    ? (prefs?.buyInRankingOnline ?? [])[0]?.value ?? prefs?.preferredBuyInsOnline?.[0] ?? 0
    : (prefs?.buyInRankingLive ?? [])[0]?.value ?? prefs?.preferredBuyInsLive?.[0] ?? 0;
  const typeSummaryCards = playTypeOrder.map((type) => ({
    key: type,
    title: type === "online" ? "Online" : "Live",
    icon: type === "online" ? Wifi : MapPin,
    badgeClass: type === "online" ? "text-cyan-400 border-cyan-500/30" : "text-violet-400 border-violet-500/30",
    gradientClass: type === "online" ? "from-cyan-500 to-blue-600" : "from-violet-500 to-purple-700",
    editClass: type === "online" ? "text-cyan-400 hover:text-cyan-300" : "text-violet-400 hover:text-violet-300",
    current: consolidated?.[type].current || 0,
    profit: consolidated?.[type].profit || 0,
    tables: consolidated?.[type].tables || 0,
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
    return [...personalized].sort((a: any, b: any) => {
      const typeDelta = playTypeOrder.indexOf(a.type) - playTypeOrder.indexOf(b.type);
      if (typeDelta !== 0) return typeDelta;
      const aTables = a.stats?.tables ?? a.stats?.sessions ?? 0;
      const bTables = b.stats?.tables ?? b.stats?.sessions ?? 0;
      return bTables - aTables;
    });
  }, [consolidated, playTypeOrder, sortVenues, venueStats]);
  const topVenueName = prioritizedVenues.find((venue: any) => venue.id === topVenueId)?.name ?? null;

  const isLoading = loadingStats || loadingHistory || loadingConsolidated;

  const rateItems = useMemo(() => {
    if (!fxRates) return [];
    return [
      { code: "USD", ...FX_RATE_META.USD, rate: fxRates.USD?.rate ?? 0 },
      { code: "CAD", ...FX_RATE_META.CAD, rate: fxRates.CAD?.rate ?? 0 },
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
    <div className="space-y-5">
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

      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold tracking-tight">Bankroll</h1>
          <p className="text-sm text-muted-foreground">Visão consolidada do seu stack</p>
        </div>
        <Link href="/sessions">
          <Button size="sm" className="gap-1.5"><Plus className="h-4 w-4" /> Nova Sessão</Button>
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
              Editar Contador KK/JJ
            </DialogTitle>
          </DialogHeader>
          <div className="space-y-4 py-1">
            {(["kk", "jj"] as const).map((hand) => (
              <div key={hand} className="rounded-lg border border-border/60 p-3 space-y-2">
                <p className="text-sm font-semibold">{hand.toUpperCase()} {hand === "kk" ? "(Rei Rei)" : "(Vala Vala)"}</p>
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

      <div className="grid grid-cols-1 xl:grid-cols-5 gap-5">
        {/* LEFT COLUMN */}
        <div className="xl:col-span-3 space-y-5">
          {/* Patrimônio card */}
          <Card className="bg-card/60 border-border/40">
            <CardContent className="p-5">
              {/* Stack Total + Donut lado a lado */}
              <div className="flex flex-col sm:flex-row gap-4 mb-5">
                {/* Lado esquerdo: info */}
                <div className="flex-1 min-w-0">
                  <p className="text-xs text-muted-foreground uppercase tracking-wide mb-1">Stack Total</p>
                  <p className={`text-4xl font-bold tracking-tight ${!hasAnyBalance ? "text-muted-foreground" : ""}`}>
                    {formatCurrencyCompact(consolidatedTotal)}
                  </p>
                  {hasAnyBalance && (
                    <div className="flex items-center gap-2 mt-1.5 flex-wrap">
                      <Badge variant={consolidatedPct >= 0 ? "default" : "destructive"} className="text-xs gap-1">
                        {consolidatedPct >= 0 ? <TrendingUp className="h-3 w-3" /> : <TrendingDown className="h-3 w-3" />}
                        {formatPercent(consolidatedPct)}
                      </Badge>
                      <span className={`text-xs ${roiProfit >= 0 ? "text-emerald-400" : "text-red-400"}`}>
                        {roiProfit >= 0 ? "+" : ""}{formatCurrencyCompact(roiProfit)}
                      </span>
                    </div>
                  )}
                  <div className="mt-4 space-y-3">
                    <div className="flex items-center justify-between">
                      <div className="flex items-center gap-1.5">
                        <span className="h-2.5 w-2.5 rounded-full bg-cyan-400 shrink-0" />
                        <span className="text-xs text-muted-foreground">Online</span>
                      </div>
                      <div className="flex items-center gap-2">
                        <span className="text-sm font-semibold text-cyan-400">{formatCurrencyCompact(consolidated?.online.current || 0)}</span>
                        <button
                          onClick={() => setShowOnlineModal(true)}
                          className="text-[10px] text-cyan-400 hover:text-cyan-300 flex items-center gap-0.5 transition-colors"
                          title="Definir bankroll online"
                        >
                          {(consolidated?.online.current || 0) > 0 ? <><Pencil className="h-2.5 w-2.5" />Editar</> : <><Plus className="h-2.5 w-2.5" />Definir</>}
                        </button>
                      </div>
                    </div>
                    <div className="flex items-center justify-between">
                      <div className="flex items-center gap-1.5">
                        <span className="h-2.5 w-2.5 rounded-full bg-violet-400 shrink-0" />
                        <span className="text-xs text-muted-foreground">Live</span>
                      </div>
                      <div className="flex items-center gap-2">
                        <span className="text-sm font-semibold text-violet-400">{formatCurrencyCompact(consolidated?.live.current || 0)}</span>
                        <button
                          onClick={() => setShowLiveModal(true)}
                          className="text-[10px] text-violet-400 hover:text-violet-300 flex items-center gap-0.5 transition-colors"
                          title="Definir bankroll live"
                        >
                          {(consolidated?.live.current || 0) > 0 ? <><Pencil className="h-2.5 w-2.5" />Editar</> : <><Plus className="h-2.5 w-2.5" />Definir</>}
                        </button>
                      </div>
                    </div>
                    {hasRoiData && (
                      <div className="text-xs pt-1">
                        <span className="text-muted-foreground">ROI: </span>
                        <span className={`font-semibold ${consolidatedPct >= 0 ? "text-emerald-400" : "text-red-400"}`}>
                          {formatPercent(consolidatedPct)}
                        </span>
                      </div>
                    )}
                  </div>
                </div>
                {/* Lado direito: Donut */}
                <div className="flex flex-col items-center justify-center shrink-0">
                  {donutData.length > 0 ? (
                    <>
                      <div className="relative h-44 w-44">
                        <ResponsiveContainer width="100%" height="100%">
                          <PieChart>
                            <Pie
                              data={donutData}
                              cx="50%"
                              cy="50%"
                              innerRadius={52}
                              outerRadius={75}
                              paddingAngle={3}
                              dataKey="value"
                              strokeWidth={0}
                            >
                              {donutData.map((entry, index) => (
                                <Cell key={`cell-${index}`} fill={entry.color} />
                              ))}
                            </Pie>
                            <RechartsTooltip
                              content={({ active, payload }: any) => {
                                if (!active || !payload?.length) return null;
                                const d = payload[0].payload;
                                return (
                                  <div className="bg-card border border-border rounded-lg p-2 shadow-xl text-xs">
                                    <p className="font-semibold mb-1">{d.fullName}</p>
                                    <p style={{ color: d.color }}>
                                      {new Intl.NumberFormat("pt-BR", { style: "currency", currency: "BRL" }).format(d.value)} ({d.pct}%)
                                    </p>
                                  </div>
                                );
                              }}
                            />
                          </PieChart>
                        </ResponsiveContainer>
                        <div className="absolute inset-0 flex flex-col items-center justify-center pointer-events-none">
                          <p className="text-sm font-bold">{formatCurrencyCompact(consolidatedTotal)}</p>
                          <p className="text-[10px] text-muted-foreground">Total</p>
                        </div>
                      </div>
                      <div className="flex flex-wrap gap-3 justify-center mt-1">
                        {donutData.map((d) => (
                          <div key={d.name} className="flex items-center gap-1.5">
                            <span className="h-2.5 w-2.5 rounded-full shrink-0" style={{ backgroundColor: d.color }} />
                            <span className="text-xs text-muted-foreground">{d.name}</span>
                            <span className="text-xs font-semibold">{d.pct}%</span>
                          </div>
                        ))}
                      </div>
                    </>
                  ) : (
                    <div className="h-44 flex flex-col items-center justify-center gap-2 text-center w-44">
                      <p className="text-xs text-muted-foreground px-2">Defina seu bankroll para ver a distribuição</p>
                      <div className="flex flex-col gap-2 mt-1">
                        <Button size="sm" variant="outline" className="text-xs gap-1" onClick={() => setShowOnlineModal(true)}>
                          <Wifi className="h-3 w-3 text-cyan-400" /> Online
                        </Button>
                        <Button size="sm" variant="outline" className="text-xs gap-1" onClick={() => setShowLiveModal(true)}>
                          <MapPin className="h-3 w-3 text-violet-400" /> Live
                        </Button>
                      </div>
                    </div>
                  )}
                </div>
              </div>

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
              <div className="rounded-lg border border-border/50 bg-muted/20 px-3 py-2 mb-4">
                <div className="flex flex-wrap items-center gap-x-4 gap-y-1 text-xs">
                  <div>
                    <span className="text-muted-foreground">Foco:</span>{" "}
                    <span className="font-semibold">{primaryType === "online" ? "Online" : "Live"}</span>{" "}
                    <span className="text-muted-foreground">
                      ({primaryTypeShare > 0 ? `${primaryTypeShare.toFixed(0)}%` : "sem amostra"})
                    </span>
                  </div>
                  <div>
                    <span className="text-muted-foreground">Plataforma:</span>{" "}
                    <span className="font-semibold">{topVenueName ?? "indefinida"}</span>
                  </div>
                  <div>
                    <span className="text-muted-foreground">Formato:</span>{" "}
                    <span className="font-semibold">{topFormatLabel ?? "indefinido"}</span>
                  </div>
                  <div>
                    <span className="text-muted-foreground">BI base:</span>{" "}
                    <span className="font-semibold">
                      {topBuyInValue > 0
                        ? (primaryType === "online" ? formatByCurrency(topBuyInValue, "USD") : formatCurrency(topBuyInValue))
                        : "indefinido"}
                    </span>
                  </div>
                </div>
              </div>
              <div className="flex items-center gap-4 text-xs border-t border-border/30 pt-3 flex-wrap">
                <div className="flex items-center gap-1.5">
                  <span className="text-muted-foreground">Mesas jogadas:</span>
                  <span className="font-semibold">{totalPlayedTables}</span>
                </div>
                <div className="flex items-center gap-1.5">
                  <span className="text-muted-foreground">ITM Rate:</span>
                  <span className={`font-semibold ${(stats?.winRate || 0) >= 50 ? "text-emerald-400" : "text-amber-400"}`}>
                    {(stats?.winRate || 0).toFixed(1)}%
                  </span>
                  <span className="text-muted-foreground">
                    ({(stats as any)?.itmCount ?? 0}/{stats?.totalTables ?? 0})
                  </span>
                </div>
                <div className="flex items-center gap-1.5">
                  <span className="text-muted-foreground">Média/sessão:</span>
                  <span className={`font-semibold ${(stats?.avgProfit || 0) >= 0 ? "text-emerald-400" : "text-red-400"}`}>
                    {formatCurrencyCompact(stats?.avgProfit || 0)}
                  </span>
                </div>
                <div className="flex items-center gap-1.5">
                  <span className="text-muted-foreground">Hourly:</span>
                  <span className={`font-semibold ${(stats?.avgHourlyRate || 0) >= 0 ? "text-emerald-400" : "text-red-400"}`}>
                    {formatCurrencyCompact(stats?.avgHourlyRate || 0)}/h
                  </span>
                </div>
              </div>
            </CardContent>
          </Card>

          {/* Donut + Desempenho */}
          <div>
            {/* Desempenho por plataforma */}
            <Card className="bg-card/60 border-border/40">
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
                        <LineChart data={chartData} margin={{ top: 4, right: 8, bottom: 0, left: 0 }}>
                          <CartesianGrid strokeDasharray="3 3" stroke="oklch(0.3 0.01 240)" vertical={false} />
                          <XAxis dataKey="date" stroke="oklch(0.55 0.01 240)" fontSize={9} tickLine={false} axisLine={false} />
                          <YAxis stroke="oklch(0.55 0.01 240)" fontSize={9} tickLine={false} axisLine={false}
                            tickFormatter={(v) => `R$${Math.abs(v) >= 1000 ? `${(v/1000).toFixed(1)}k` : v}`}
                            domain={chartYDomain} width={48} />
                          <RechartsTooltip
                            content={({ active, payload, label }: any) => {
                              if (!active || !payload?.length) return null;
                              return (
                                <div className="bg-card border border-border rounded-lg p-2 shadow-xl text-xs">
                                  <p className="font-semibold mb-1">{label}</p>
                                  {payload.map((p: any) => (
                                    <p key={p.dataKey} style={{ color: p.color }}>
                                      {p.dataKey === "total" ? "Total" : p.dataKey === "online" ? "Online" : "Live"}: R$ {Number(p.value).toFixed(2)}
                                    </p>
                                  ))}
                                </div>
                              );
                            }}
                          />
                          <Line type="monotone" dataKey="total" stroke="var(--primary)" strokeWidth={2} dot={false} activeDot={{ r: 4 }} name="Total" />
                          <Line type="monotone" dataKey="online" stroke="#06b6d4" strokeWidth={1.5} dot={false} strokeDasharray="4 2" name="Online" />
                        </LineChart>
                      </ResponsiveContainer>
                    </div>
                    <div className="flex gap-3 mt-1">
                      <span className="flex items-center gap-1 text-[10px] text-muted-foreground">
                        <span className="h-2 w-4 rounded-full inline-block" style={{ background: "var(--primary)" }} /> Total
                      </span>
                      <span className="flex items-center gap-1 text-[10px] text-muted-foreground">
                        <span className="h-0.5 w-4 inline-block border-t-2 border-dashed border-cyan-400" /> Online
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
                    <div className="h-40">
                    <ResponsiveContainer width="100%" height="100%">
                      <BarChart data={perfData} layout="vertical" margin={{ top: 0, right: 30, bottom: 0, left: 0 }}>
                        <XAxis type="number" stroke="oklch(0.55 0.01 240)" fontSize={10} tickLine={false}
                          tickFormatter={(v) => {
                            if (perfMetric === "sessions") return String(v);
                            if (perfMetric === "profit") return new Intl.NumberFormat("pt-BR", { notation: "compact", style: "currency", currency: "BRL" }).format(v);
                            return `${v}%`;
                          }} />
                        <YAxis type="category" dataKey="name" stroke="oklch(0.55 0.01 240)" fontSize={10} tickLine={false} width={70} />
                        <RechartsTooltip
                              content={({ active, payload }: any) => {
                            if (!active || !payload?.length) return null;
                            const d = payload[0].payload;
                            return (
                              <div className="bg-card border border-border rounded-lg p-2 shadow-xl text-xs">
                                <p className="font-semibold mb-1">{d.fullName}</p>
                                <p>Resultado: <span className={d.profit >= 0 ? "text-emerald-400" : "text-red-400"}>{d.profit >= 0 ? "+" : ""}{new Intl.NumberFormat("pt-BR", { style: "currency", currency: "BRL" }).format(d.profit)}</span></p>
                                <p>ROI: <span className={d.roi >= 0 ? "text-emerald-400" : "text-red-400"}>{d.roi}%</span></p>
                                <p>ITM Rate: <span className="text-primary">{d.winrate}%</span> <span className="text-muted-foreground">({d.itmCount}/{d.tables})</span></p>
                                <p>Mesas: <span className="font-semibold">{d.tables ?? d.sessions}</span></p>
                              </div>
                            );
                          }}
                        />
                        <Bar dataKey={perfMetric === "roi" ? "roi" : perfMetric === "winrate" ? "winrate" : perfMetric === "sessions" ? "tables" : "profit"} radius={[0, 4, 4, 0]}>
                          {perfData.map((entry: any, index: number) => (
                            <Cell key={`cell-${index}`}
                              fill={perfMetric === "sessions" ? VENUE_COLORS[index % VENUE_COLORS.length]
                                : perfMetric === "winrate" ? (entry.winrate >= 50 ? "#10b981" : "#f59e0b")
                                : perfMetric === "profit" ? (entry.profit >= 0 ? "#10b981" : "#ef4444")
                                : entry.color}
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
          <Card className="bg-card/60 border-border/40">
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
                          <stop offset="5%" stopColor="#06b6d4" stopOpacity={0.3} />
                          <stop offset="95%" stopColor="#06b6d4" stopOpacity={0} />
                        </linearGradient>
                        <linearGradient id="gradLive" x1="0" y1="0" x2="0" y2="1">
                          <stop offset="5%" stopColor="#8b5cf6" stopOpacity={0.3} />
                          <stop offset="95%" stopColor="#8b5cf6" stopOpacity={0} />
                        </linearGradient>
                        <linearGradient id="gradTotal" x1="0" y1="0" x2="0" y2="1">
                          <stop offset="5%" stopColor="#3b82f6" stopOpacity={0.35} />
                          <stop offset="95%" stopColor="#3b82f6" stopOpacity={0} />
                        </linearGradient>
                      </defs>
                      <CartesianGrid strokeDasharray="3 3" stroke="oklch(0.28 0.03 240 / 0.4)" />
                      <XAxis dataKey="date" stroke="oklch(0.55 0.01 240)" fontSize={11} tickLine={false} />
                      <YAxis stroke="oklch(0.55 0.01 240)" fontSize={11} tickLine={false} axisLine={false}
                        domain={chartYDomain}
                        tickFormatter={(v) => new Intl.NumberFormat("pt-BR", { notation: "compact", style: "currency", currency: "BRL" }).format(v)} />
                      <ReferenceLine y={0} stroke="oklch(0.4 0.01 240)" strokeDasharray="4 4" />
                      <RechartsTooltip content={<CustomTooltip />} />
                      {(chartPeriod === "all" || chartPeriod === "online") && (
                        <Area type="monotone" dataKey="online" name="Online" stroke="#06b6d4" strokeWidth={2} fill="url(#gradOnline)" dot={false} activeDot={{ r: 4 }} />
                      )}
                      {(chartPeriod === "all" || chartPeriod === "live") && (
                        <Area type="monotone" dataKey="live" name="Live" stroke="#8b5cf6" strokeWidth={2} fill="url(#gradLive)" dot={false} activeDot={{ r: 4 }} />
                      )}
                      {chartPeriod === "all" && (
                        <Area type="monotone" dataKey="total" name="Total" stroke="#3b82f6" strokeWidth={2.5} fill="url(#gradTotal)" dot={false} activeDot={{ r: 5 }} />
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
        </div>

        {/* RIGHT COLUMN */}
        <div className="xl:col-span-2 space-y-5">
          {/* Cards Online + Live lado a lado no topo */}
          <div className="grid grid-cols-2 gap-3">
            {typeSummaryCards.map((card) => {
              const Icon = card.icon;
              return (
                <Card key={card.key} className={`border ${card.badgeClass.split(" ")[1]} bg-card/60 overflow-hidden`}>
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
                    <div className={`flex items-center gap-1 text-xs ${card.profit >= 0 ? "text-emerald-400" : "text-red-400"}`}>
                      {card.profit >= 0 ? <TrendingUp className="h-3 w-3" /> : <TrendingDown className="h-3 w-3" />}
                      <span>{card.profit >= 0 ? "+" : ""}{formatCurrencyCompact(card.profit)}</span>
                    </div>
                    <p className="text-xs text-muted-foreground mt-1">{card.tables} mesas</p>
                  </CardContent>
                </Card>
              );
            })}
          </div>

          {/* Minhas Plataformas (apenas stats) */}
          <Card className="bg-card/60 border-border/40">
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

          <Card className="bg-gradient-to-br from-zinc-50/90 via-amber-50/40 to-red-50/40 border-amber-200/60 overflow-hidden">
            <CardHeader className="pb-2">
              <div className="flex items-start justify-between gap-2">
                <div>
                  <CardTitle className="text-sm font-semibold flex items-center gap-2">
                    <Trophy className="h-4 w-4 text-amber-500" /> Contador de Mãos <span className="text-amber-500">Premium</span>
                  </CardTitle>
                  <p className="text-xs text-muted-foreground">Seu desempenho com mãos fortes e perigosas.</p>
                </div>
                <Button size="sm" variant="ghost" className="h-7 px-2 text-xs" onClick={openHandsEditModal}>
                  <Pencil className="h-3.5 w-3.5 mr-1" /> Editar
                </Button>
              </div>
            </CardHeader>

            <CardContent className="space-y-3">
              <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                <div className="rounded-2xl border border-amber-300/50 overflow-hidden bg-gradient-to-br from-zinc-950 via-zinc-900 to-amber-900 text-white">
                  <div className="p-3 border-b border-amber-300/20 flex items-center justify-between">
                    <p className="text-2xl font-black tracking-tight text-amber-300">KK <span className="text-white text-base">(Rei Rei)</span></p>
                    <Crown className="h-5 w-5 text-amber-300" />
                  </div>
                  <div className="p-3 space-y-1.5 text-sm">
                    <p><Flame className="h-4 w-4 inline mr-1 text-orange-300" /> Total: <span className="font-bold">{handPatternStats?.kk?.hands ?? 0}</span></p>
                    <p className="text-emerald-300">Vitórias: <span className="font-bold">{handPatternStats?.kk?.wins ?? 0}</span></p>
                    <p className="text-red-300">Derrotas: <span className="font-bold">{handPatternStats?.kk?.losses ?? 0}</span></p>
                    <p className="text-zinc-200">Win rate: <span className="font-bold">{handPatternStats?.kk?.winRate ?? 0}%</span></p>
                    <div className="pt-2 grid grid-cols-2 gap-2">
                      <Button
                        size="sm"
                        className="h-8 bg-emerald-600 hover:bg-emerald-700"
                        disabled={registerHandResultMutation.isPending}
                        onClick={() => registerHandResultMutation.mutate({ hand: "kk", outcome: "win" })}
                      >+ Vitória</Button>
                      <Button
                        size="sm"
                        className="h-8 bg-red-600 hover:bg-red-700"
                        disabled={registerHandResultMutation.isPending}
                        onClick={() => registerHandResultMutation.mutate({ hand: "kk", outcome: "loss" })}
                      >+ Derrota</Button>
                    </div>
                  </div>
                </div>

                <div className="rounded-2xl border border-red-300/50 overflow-hidden bg-gradient-to-br from-red-950 via-red-900 to-orange-700 text-white">
                  <div className="p-3 border-b border-red-300/20 flex items-center justify-between">
                    <p className="text-2xl font-black tracking-tight text-orange-200">JJ <span className="text-white text-base">(Vala Vala)</span></p>
                    <Swords className="h-5 w-5 text-orange-200" />
                  </div>
                  <div className="p-3 space-y-1.5 text-sm">
                    <p><Flame className="h-4 w-4 inline mr-1 text-orange-200" /> Total: <span className="font-bold">{handPatternStats?.jj?.hands ?? 0}</span></p>
                    <p className="text-emerald-300">Vitórias: <span className="font-bold">{handPatternStats?.jj?.wins ?? 0}</span></p>
                    <p className="text-red-200">Derrotas: <span className="font-bold">{handPatternStats?.jj?.losses ?? 0}</span></p>
                    <p className="text-zinc-100">Win rate: <span className="font-bold">{handPatternStats?.jj?.winRate ?? 0}%</span></p>
                    <div className="pt-2 grid grid-cols-2 gap-2">
                      <Button
                        size="sm"
                        className="h-8 bg-emerald-600 hover:bg-emerald-700"
                        disabled={registerHandResultMutation.isPending}
                        onClick={() => registerHandResultMutation.mutate({ hand: "jj", outcome: "win" })}
                      >+ Vitória</Button>
                      <Button
                        size="sm"
                        className="h-8 bg-red-600 hover:bg-red-700"
                        disabled={registerHandResultMutation.isPending}
                        onClick={() => registerHandResultMutation.mutate({ hand: "jj", outcome: "loss" })}
                      >+ Derrota</Button>
                    </div>
                  </div>
                </div>
              </div>

            </CardContent>
          </Card>

          <Card className="bg-card/60 border-border/40">
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
                        {new Date(t.sessionDate).toLocaleDateString("pt-BR")} · {t.gameFormat} · Sessão #{t.sessionId}
                      </p>
                    </div>
                    <div className="text-right">
                      <p className={`text-xs font-semibold ${t.tableProfit >= 0 ? "text-emerald-400" : "text-red-400"}`}>
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
  );
}
