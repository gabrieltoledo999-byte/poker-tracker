import { trpc } from "@/lib/trpc";
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
  return `R$${amount.toFixed(2)}`;
}

const VENUE_COLORS = [
  "#06b6d4","#8b5cf6","#10b981","#f59e0b","#ef4444",
  "#3b82f6","#ec4899","#14b8a6","#f97316","#a855f7",
];

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
  const roi = stats && tableCount > 0
    ? ((stats.totalProfit / (tableCount * 100)) * 100).toFixed(1)
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
                <p className="text-[10px] text-muted-foreground mb-0.5">Win Rate</p>
                <p className={`text-sm font-bold ${(stats.winRate || 0) >= 50 ? "text-emerald-400" : "text-amber-400"}`}>
                  {stats.winRate !== null ? `${stats.winRate}%` : "—"}
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
  const utils = trpc.useUtils();
  const [chartPeriod, setChartPeriod] = useState<"online" | "live" | "all">("all");
  const [perfMetric, setPerfMetric] = useState<"roi" | "winrate" | "sessions" | "profit">("roi");
  const [showOnlineModal, setShowOnlineModal] = useState(false);
  const [showLiveModal, setShowLiveModal] = useState(false);
  const [onlineInputValue, setOnlineInputValue] = useState("");
  const [liveInputValue, setLiveInputValue] = useState("");

  const { data: consolidated, isLoading: loadingConsolidated } = trpc.bankroll.getConsolidated.useQuery();
  const { data: stats, isLoading: loadingStats } = trpc.sessions.stats.useQuery({});
  const { data: recentTables } = trpc.sessions.recentTables.useQuery({ limit: 8 });
  const { data: history, isLoading: loadingHistory } = trpc.bankroll.history.useQuery(undefined);
  const { data: venueStats } = trpc.venues.statsByVenue.useQuery();

  const updateBankrollMutation = trpc.bankroll.updateSettings.useMutation({
    onSuccess: () => {
      utils.bankroll.getConsolidated.invalidate();
      utils.bankroll.history.invalidate();
      toast.success("Bankroll atualizado!");
    },
    onError: (err) => toast.error(`Erro ao atualizar bankroll: ${err.message}`),
  });

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
        fullName: "Poker Online",
        value: onlineVal / 100,
        color: "#06b6d4",
        pct: Math.round((onlineVal / total) * 100),
      });
    }
    if (liveVal > 0) {
      result.push({
        name: "Live",
        fullName: "Poker Live",
        value: liveVal / 100,
        color: "#8b5cf6",
        pct: Math.round((liveVal / total) * 100),
      });
    }
    return result;
  }, [consolidated]);

  const perfData = useMemo(() => {
    if (!venueStats) return [];
    return venueStats
      .filter((v: any) => (v.tables ?? v.sessions) > 0)
      .slice(0, 8)
      .map((v: any) => ({
        name: v.venueName.length > 10 ? v.venueName.substring(0, 10) + "…" : v.venueName,
        fullName: v.venueName,
        roi: (v.tables ?? v.sessions) > 0 ? parseFloat(((v.totalProfit / ((v.tables ?? v.sessions) * 100)) * 100).toFixed(1)) : 0,
        winrate: v.winRate,
        sessions: v.sessions,
        tables: v.tables ?? v.sessions,
        profit: v.totalProfit / 100,
        color: v.totalProfit >= 0 ? "#10b981" : "#ef4444",
      }));
  }, [venueStats]);

  const consolidatedTotal = consolidated?.total.current || 0;
  const consolidatedProfit = consolidated?.total.profit || 0;
  const consolidatedBase = consolidatedTotal - consolidatedProfit;
  const consolidatedPct = consolidatedBase > 0 ? (consolidatedProfit / consolidatedBase) * 100 : 0;
  const hasAnyBalance = consolidatedTotal > 0;
  const totalPlayedTables = consolidated?.total.tables ?? 0;

  // Plataformas online (apenas para stats, sem saldo individual)
  const onlineVenues = useMemo(() => {
    if (!consolidated?.allVenues) return [];
    const statsMap = new Map((venueStats || []).map((s: any) => [s.venueId, s]));
    return consolidated.allVenues
      .filter((v: any) => v.type === "online")
      .map((v: any) => ({
        ...v,
        stats: statsMap.get(v.id) || null,
      }));
  }, [consolidated, venueStats]);

  const isLoading = loadingStats || loadingHistory || loadingConsolidated;

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
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold tracking-tight">Banca Total</h1>
          <p className="text-sm text-muted-foreground">Visão consolidada do seu patrimônio poker</p>
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

      <div className="grid grid-cols-1 xl:grid-cols-5 gap-5">
        {/* LEFT COLUMN */}
        <div className="xl:col-span-3 space-y-5">
          {/* Patrimônio card */}
          <Card className="bg-card/60 border-border/40">
            <CardContent className="p-5">
              <div className="flex items-start justify-between mb-4">
                <div>
                  <p className="text-xs text-muted-foreground uppercase tracking-wide mb-1">Patrimônio Poker</p>
                  <p className={`text-4xl font-bold tracking-tight ${!hasAnyBalance ? "text-muted-foreground" : ""}`}>
                    {formatCurrencyCompact(consolidatedTotal)}
                  </p>
                </div>
                {hasAnyBalance && (
                  <Badge variant={consolidatedProfit >= 0 ? "default" : "destructive"} className="text-xs gap-1 mt-1">
                    {consolidatedProfit >= 0 ? <TrendingUp className="h-3 w-3" /> : <TrendingDown className="h-3 w-3" />}
                    {formatPercent(consolidatedPct)}
                  </Badge>
                )}
              </div>
              <div className="grid grid-cols-2 gap-4 mb-4 text-sm">
                <div>
                  <div className="flex items-center justify-between mb-0.5">
                    <p className="text-muted-foreground text-xs">Online</p>
                    <button
                      onClick={() => setShowOnlineModal(true)}
                      className="text-[10px] text-cyan-400 hover:text-cyan-300 flex items-center gap-0.5 transition-colors"
                      title="Definir bankroll online"
                    >
                      {(consolidated?.online.current || 0) > 0 ? <><Pencil className="h-2.5 w-2.5" />Editar</> : <><Plus className="h-2.5 w-2.5" />Definir</>}
                    </button>
                  </div>
                  <p className="font-semibold text-cyan-400">{formatCurrencyCompact(consolidated?.online.current || 0)}</p>
                </div>
                <div>
                  <div className="flex items-center justify-between mb-0.5">
                    <p className="text-muted-foreground text-xs">Live</p>
                    <button
                      onClick={() => setShowLiveModal(true)}
                      className="text-[10px] text-violet-400 hover:text-violet-300 flex items-center gap-0.5 transition-colors"
                      title="Definir bankroll live"
                    >
                      {(consolidated?.live.current || 0) > 0 ? <><Pencil className="h-2.5 w-2.5" />Editar</> : <><Plus className="h-2.5 w-2.5" />Definir</>}
                    </button>
                  </div>
                  <p className="font-semibold text-violet-400">{formatCurrencyCompact(consolidated?.live.current || 0)}</p>
                </div>
                <div>
                  <p className="text-muted-foreground text-xs mb-0.5">Resultado acumulado</p>
                  <p className={`font-semibold ${consolidatedProfit >= 0 ? "text-emerald-400" : "text-red-400"}`}>
                    {consolidatedProfit >= 0 ? "+" : ""}{formatCurrencyCompact(consolidatedProfit)}
                  </p>
                </div>
                <div>
                  <p className="text-muted-foreground text-xs mb-0.5">ROI geral</p>
                  <p className={`font-semibold ${consolidatedPct >= 0 ? "text-emerald-400" : "text-red-400"}`}>
                    {hasAnyBalance ? formatPercent(consolidatedPct) : "—"}
                  </p>
                </div>
              </div>
              <div className="flex items-center gap-4 text-xs border-t border-border/30 pt-3 flex-wrap">
                <div className="flex items-center gap-1.5">
                  <span className="text-muted-foreground">Mesas jogadas:</span>
                  <span className="font-semibold">{totalPlayedTables}</span>
                </div>
                <div className="flex items-center gap-1.5">
                  <span className="text-muted-foreground">Win Rate:</span>
                  <span className={`font-semibold ${(stats?.winRate || 0) >= 50 ? "text-emerald-400" : "text-amber-400"}`}>
                    {(stats?.winRate || 0).toFixed(1)}%
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
          <div className="grid grid-cols-1 md:grid-cols-2 gap-5">
            {/* Donut: Online vs Live */}
            <Card className="bg-card/60 border-border/40">
              <CardHeader className="pb-2">
                <CardTitle className="text-sm font-semibold">Distribuição da Banca</CardTitle>
              </CardHeader>
              <CardContent>
                {donutData.length > 0 ? (
                  <div className="flex flex-col items-center">
                    <div className="relative h-52 w-full">
                      <ResponsiveContainer width="100%" height="100%">
                        <PieChart>
                          <Pie
                            data={donutData}
                            cx="50%"
                            cy="50%"
                            innerRadius={55}
                            outerRadius={85}
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
                      {/* Centro do donut */}
                      <div className="absolute inset-0 flex flex-col items-center justify-center pointer-events-none">
                        <p className="text-lg font-bold">{formatCurrencyCompact(consolidatedTotal)}</p>
                        <p className="text-[10px] text-muted-foreground">Total</p>
                      </div>
                    </div>
                    {/* Legenda */}
                    <div className="flex flex-wrap gap-3 mt-2 justify-center">
                      {donutData.map((d) => (
                        <div key={d.name} className="flex items-center gap-1.5">
                          <span className="h-2.5 w-2.5 rounded-full shrink-0" style={{ backgroundColor: d.color }} />
                          <span className="text-xs text-muted-foreground">{d.name}</span>
                          <span className="text-xs font-semibold">{d.pct}%</span>
                        </div>
                      ))}
                    </div>
                  </div>
                ) : (
                  <div className="h-52 flex flex-col items-center justify-center gap-2 text-center">
                    <p className="text-xs text-muted-foreground">Defina seu bankroll para ver a distribuição</p>
                    <div className="flex gap-2 mt-2">
                      <Button size="sm" variant="outline" className="text-xs gap-1" onClick={() => setShowOnlineModal(true)}>
                        <Wifi className="h-3 w-3 text-cyan-400" /> Online
                      </Button>
                      <Button size="sm" variant="outline" className="text-xs gap-1" onClick={() => setShowLiveModal(true)}>
                        <MapPin className="h-3 w-3 text-violet-400" /> Live
                      </Button>
                    </div>
                  </div>
                )}
              </CardContent>
            </Card>

            {/* Desempenho por plataforma */}
            <Card className="bg-card/60 border-border/40">
              <CardHeader className="pb-2">
                <div className="flex items-center justify-between flex-wrap gap-2">
                  <CardTitle className="text-sm font-semibold">Desempenho</CardTitle>
                  <div className="flex gap-1">
                    {(["roi", "winrate", "sessions", "profit"] as const).map((m) => (
                      <Button key={m} size="sm" variant={perfMetric === m ? "default" : "ghost"}
                        className="h-6 px-2 text-[10px]" onClick={() => setPerfMetric(m)}>
                        {m === "roi" ? "ROI" : m === "winrate" ? "Win%" : m === "sessions" ? "Mesas" : "R$"}
                      </Button>
                    ))}
                  </div>
                </div>
              </CardHeader>
              <CardContent className="space-y-4">
                {/* Gráfico de evolução do dinheiro */}
                {chartData.length > 1 ? (
                  <div>
                    <p className="text-xs text-muted-foreground mb-2 font-medium">Evolução da Banca</p>
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
                                <p>Win Rate: <span className="text-primary">{d.winrate}%</span></p>
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
                  {hasAnyBalance && (
                    <Badge variant={consolidatedProfit >= 0 ? "default" : "destructive"} className="text-xs gap-1">
                      {consolidatedProfit >= 0 ? <TrendingUp className="h-3 w-3" /> : <TrendingDown className="h-3 w-3" />}
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
            {/* Card Online */}
            <Card className="border border-cyan-500/30 bg-card/60 overflow-hidden">
              <div className="h-1 w-full bg-gradient-to-r from-cyan-500 to-blue-600" />
              <CardContent className="p-4">
                <div className="flex items-center justify-between mb-2">
                  <Badge variant="outline" className="text-cyan-400 border-cyan-500/30 text-xs gap-1">
                    <Wifi className="h-3 w-3" />Online
                  </Badge>
                  <button
                    onClick={() => setShowOnlineModal(true)}
                    className="text-[10px] text-cyan-400 hover:text-cyan-300 flex items-center gap-0.5 transition-colors"
                  >
                    {(consolidated?.online.current || 0) > 0 ? <><Pencil className="h-2.5 w-2.5" />Editar</> : <><Plus className="h-2.5 w-2.5" />Definir</>}
                  </button>
                </div>
                <p className="text-xl font-bold mb-1">{formatCurrencyCompact(consolidated?.online.current || 0)}</p>
                <div className={`flex items-center gap-1 text-xs ${(consolidated?.online.profit || 0) >= 0 ? "text-emerald-400" : "text-red-400"}`}>
                  {(consolidated?.online.profit || 0) >= 0 ? <TrendingUp className="h-3 w-3" /> : <TrendingDown className="h-3 w-3" />}
                  <span>{(consolidated?.online.profit || 0) >= 0 ? "+" : ""}{formatCurrencyCompact(consolidated?.online.profit || 0)}</span>
                </div>
                <p className="text-xs text-muted-foreground mt-1">{consolidated?.online.tables || 0} mesas</p>
              </CardContent>
            </Card>

            {/* Card Live */}
            <Card className="border border-violet-500/30 bg-card/60 overflow-hidden">
              <div className="h-1 w-full bg-gradient-to-r from-violet-500 to-purple-700" />
              <CardContent className="p-4">
                <div className="flex items-center justify-between mb-2">
                  <Badge variant="outline" className="text-violet-400 border-violet-500/30 text-xs gap-1">
                    <MapPin className="h-3 w-3" />Live
                  </Badge>
                  <button
                    onClick={() => setShowLiveModal(true)}
                    className="text-[10px] text-violet-400 hover:text-violet-300 flex items-center gap-0.5 transition-colors"
                  >
                    {(consolidated?.live.current || 0) > 0 ? <><Pencil className="h-2.5 w-2.5" />Editar</> : <><Plus className="h-2.5 w-2.5" />Definir</>}
                  </button>
                </div>
                <p className="text-xl font-bold mb-1">{formatCurrencyCompact(consolidated?.live.current || 0)}</p>
                <div className={`flex items-center gap-1 text-xs ${(consolidated?.live.profit || 0) >= 0 ? "text-emerald-400" : "text-red-400"}`}>
                  {(consolidated?.live.profit || 0) >= 0 ? <TrendingUp className="h-3 w-3" /> : <TrendingDown className="h-3 w-3" />}
                  <span>{(consolidated?.live.profit || 0) >= 0 ? "+" : ""}{formatCurrencyCompact(consolidated?.live.profit || 0)}</span>
                </div>
                <p className="text-xs text-muted-foreground mt-1">{consolidated?.live.tables || 0} mesas</p>
              </CardContent>
            </Card>
          </div>

          {/* Minhas Plataformas (apenas stats) */}
          <Card className="bg-card/60 border-border/40">
            <CardHeader className="pb-2">
              <div className="flex items-center justify-between">
                <CardTitle className="text-sm font-semibold">Minhas Plataformas</CardTitle>
                <Link href="/venues">
                  <Button size="sm" variant="ghost" className="h-7 px-2 text-xs gap-1 text-muted-foreground">
                    <Settings2 className="h-3.5 w-3.5" /> Gerenciar
                  </Button>
                </Link>
              </div>
              <p className="text-xs text-muted-foreground">Resultado por plataforma</p>
            </CardHeader>
            <CardContent className="px-3 py-0 max-h-[400px] overflow-y-auto">
              {onlineVenues.length > 0 ? (
                onlineVenues.map((venue: any, i: number) => (
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
