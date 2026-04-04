import { trpc } from "@/lib/trpc";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  AreaChart,
  Area,
  BarChart,
  Bar,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip as RechartsTooltip,
  ResponsiveContainer,
  PieChart,
  Pie,
  Cell,
  Legend,
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

function CirclePercent({ pct, color, size = 48 }: { pct: number; color: string; size?: number }) {
  const r = (size - 6) / 2;
  const circ = 2 * Math.PI * r;
  const dash = (Math.min(Math.abs(pct), 100) / 100) * circ;
  return (
    <svg width={size} height={size} viewBox={`0 0 ${size} ${size}`} className="shrink-0">
      <circle cx={size/2} cy={size/2} r={r} fill="none" stroke="oklch(0.25 0.02 240)" strokeWidth={5} />
      <circle cx={size/2} cy={size/2} r={r} fill="none" stroke={color} strokeWidth={5}
        strokeDasharray={`${dash} ${circ}`} strokeLinecap="round"
        transform={`rotate(-90 ${size/2} ${size/2})`} />
      <text x={size/2} y={size/2 + 4} textAnchor="middle" fontSize={10} fill={color} fontWeight="700">
        {Math.round(Math.abs(pct))}%
      </text>
    </svg>
  );
}

function VenueRow({
  venue, totalBrl, colorIdx, onEditBalance,
}: {
  venue: any; totalBrl: number; colorIdx: number;
  onEditBalance: (id: number, balance: number, currency: string) => void;
}) {
  const [expanded, setExpanded] = useState(false);
  const [editingBalance, setEditingBalance] = useState(false);
  const [balanceInput, setBalanceInput] = useState("");
  const [currencyInput, setCurrencyInput] = useState(venue.currency || "BRL");

  const color = VENUE_COLORS[colorIdx % VENUE_COLORS.length];
  const pct = totalBrl > 0 ? Math.round((venue.balanceBrl / totalBrl) * 100) : 0;
  const stats = venue.stats;
  const roi = stats && stats.sessions > 0
    ? ((stats.totalProfit / (stats.sessions * 100)) * 100).toFixed(1)
    : null;

  const handleSaveBalance = () => {
    const val = parseFloat(balanceInput.replace(",", "."));
    if (isNaN(val) || val < 0) { toast.error("Valor inválido"); return; }
    const intVal = Math.round(val * 100);
    onEditBalance(venue.id, intVal, currencyInput);
    setEditingBalance(false);
    setBalanceInput("");
  };

  const displayBalance = () => {
    if (venue.type === "live") return formatCurrencyCompact(venue.balanceBrl);
    if (venue.currency === "USD") return `US$${(venue.balance / 100).toFixed(2)}`;
    if (venue.currency === "CAD") return `CA$${(venue.balance / 100).toFixed(2)}`;
    if (venue.currency === "JPY") return `¥${(venue.balance / 100).toFixed(0)}`;
    return formatCurrencyCompact(venue.balance);
  };

  return (
    <div className="border-b border-border/20 last:border-0">
      <div
        className="flex items-center gap-3 py-3 px-1 cursor-pointer hover:bg-muted/20 rounded-lg transition-colors"
        onClick={() => setExpanded(!expanded)}
      >
        <CirclePercent pct={pct} color={color} size={44} />
        <div className="flex items-center gap-2 flex-1 min-w-0">
          <div className="h-8 w-8 rounded-lg bg-muted/60 flex items-center justify-center shrink-0 overflow-hidden">
            {venue.logoUrl ? (
              <img src={venue.logoUrl} alt={venue.name} className="h-8 w-8 object-cover rounded-lg" />
            ) : (
              <Building2 className="h-4 w-4 text-muted-foreground" />
            )}
          </div>
          <div className="min-w-0">
            <p className="text-sm font-semibold truncate">{venue.name}</p>
            <p className="text-xs text-muted-foreground">
              {venue.type === "live" ? "Live" : venue.currency || "BRL"}
              {venue.type === "online" && venue.currency !== "BRL" && (
                <span className="ml-1 text-[10px] text-primary/70">≈ {formatCurrencyCompact(venue.balanceBrl)}</span>
              )}
            </p>
          </div>
        </div>
        <div className="text-right shrink-0">
          <p className="text-sm font-bold">{displayBalance()}</p>
          {stats && stats.sessions > 0 && (
            <p className={`text-xs font-medium ${stats.totalProfit >= 0 ? "text-emerald-400" : "text-red-400"}`}>
              {stats.totalProfit >= 0 ? "+" : ""}{formatCurrencyCompact(stats.totalProfit)}
            </p>
          )}
        </div>
        <div className="shrink-0 ml-1">
          {expanded ? <ChevronDown className="h-4 w-4 text-muted-foreground" /> : <ChevronRight className="h-4 w-4 text-muted-foreground" />}
        </div>
      </div>

      {expanded && (
        <div className="pb-3 px-2 space-y-3">
          {venue.type === "online" && (
            <div className="bg-muted/20 rounded-lg p-3">
              <p className="text-xs text-muted-foreground mb-2 font-medium">Saldo na plataforma</p>
              {editingBalance ? (
                <div className="flex gap-2 items-center">
                  <Select value={currencyInput} onValueChange={setCurrencyInput}>
                    <SelectTrigger className="h-8 w-20 text-xs">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="BRL">BRL</SelectItem>
                      <SelectItem value="USD">USD</SelectItem>
                      <SelectItem value="CAD">CAD</SelectItem>
                      <SelectItem value="JPY">JPY</SelectItem>
                    </SelectContent>
                  </Select>
                  <Input type="number" placeholder="0.00" value={balanceInput}
                    onChange={(e) => setBalanceInput(e.target.value)}
                    onKeyDown={(e) => { if (e.key === "Enter") handleSaveBalance(); if (e.key === "Escape") setEditingBalance(false); }}
                    className="h-8 text-sm flex-1" autoFocus />
                  <Button size="sm" className="h-8 px-3" onClick={handleSaveBalance}>OK</Button>
                  <Button size="sm" variant="ghost" className="h-8 px-2" onClick={() => setEditingBalance(false)}>✕</Button>
                </div>
              ) : (
                <div className="flex items-center justify-between">
                  <span className="text-sm font-semibold">
                    {displayBalance()}
                    {venue.currency !== "BRL" && (
                      <span className="text-xs text-muted-foreground ml-2">≈ {formatCurrencyCompact(venue.balanceBrl)}</span>
                    )}
                  </span>
                  <Button size="sm" variant="outline" className="h-7 px-2 text-xs gap-1"
                    onClick={(e) => { e.stopPropagation(); setEditingBalance(true); setCurrencyInput(venue.currency || "BRL"); setBalanceInput(String(venue.balance / 100)); }}>
                    <Pencil className="h-3 w-3" /> Editar
                  </Button>
                </div>
              )}
            </div>
          )}
          {stats && stats.sessions > 0 ? (
            <div className="grid grid-cols-3 gap-2">
              <div className="bg-muted/20 rounded-lg p-2 text-center">
                <p className="text-[10px] text-muted-foreground mb-0.5">Sessões</p>
                <p className="text-sm font-bold">{stats.sessions}</p>
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

function LiveBankrollCard({
  liveBankroll, profit, sessions, onSetBankroll,
}: {
  liveBankroll: number; profit: number; sessions: number;
  onSetBankroll: (v: number) => void;
}) {
  const [editing, setEditing] = useState(false);
  const [inputValue, setInputValue] = useState("");
  const isPositive = profit >= 0;

  const handleConfirm = () => {
    const val = Math.round(parseFloat(inputValue.replace(",", ".")) * 100);
    if (isNaN(val) || val < 0) { toast.error("Valor inválido"); return; }
    onSetBankroll(val);
    setEditing(false);
    setInputValue("");
  };

  return (
    <Card className="border border-violet-500/30 bg-card/60 overflow-hidden">
      <div className="h-1 w-full bg-gradient-to-r from-violet-500 to-purple-700" />
      <CardContent className="p-5">
        <div className="flex items-center justify-between mb-3">
          <span className="text-sm font-semibold text-muted-foreground uppercase tracking-wide">Poker Live</span>
          <Badge variant="outline" className="text-violet-400 border-violet-500/30 text-xs gap-1">
            <MapPin className="h-3 w-3" />Live
          </Badge>
        </div>
        <p className="text-3xl font-bold mb-1">{formatCurrency(liveBankroll)}</p>
        <div className={`flex items-center gap-1 text-sm mb-1 ${isPositive ? "text-emerald-400" : "text-red-400"}`}>
          {isPositive ? <TrendingUp className="h-4 w-4" /> : <TrendingDown className="h-4 w-4" />}
          <span>{isPositive ? "+" : ""}{formatCurrency(profit)} nas sessões</span>
        </div>
        <p className="text-xs text-muted-foreground mb-4">{sessions} {sessions === 1 ? "sessão" : "sessões"}</p>
        <div className="border-t border-border/30 pt-3">
          <p className="text-[10px] text-muted-foreground mb-2 uppercase tracking-wide">Bankroll definido para live</p>
          {editing ? (
            <div className="flex gap-2 items-center">
              <span className="text-sm text-muted-foreground">R$</span>
              <Input type="number" placeholder="0,00" value={inputValue} onChange={(e) => setInputValue(e.target.value)}
                onKeyDown={(e) => { if (e.key === "Enter") handleConfirm(); if (e.key === "Escape") setEditing(false); }}
                className="h-8 text-sm flex-1" autoFocus />
              <Button size="sm" className="h-8 px-3" onClick={handleConfirm}>OK</Button>
              <Button size="sm" variant="ghost" className="h-8 px-2" onClick={() => setEditing(false)}>✕</Button>
            </div>
          ) : (
            <div className="flex items-center justify-between">
              <span className="text-sm font-semibold text-violet-300">{formatCurrency(liveBankroll)}</span>
              <Button size="sm" variant="outline" className="h-7 px-2 text-xs gap-1 border-violet-500/30 text-violet-400"
                onClick={() => { setEditing(true); setInputValue(String(liveBankroll / 100)); }}>
                <Settings2 className="h-3 w-3" /> Definir
              </Button>
            </div>
          )}
        </div>
      </CardContent>
    </Card>
  );
}

export default function Dashboard() {
  const utils = trpc.useUtils();
  const [chartPeriod, setChartPeriod] = useState<"online" | "live" | "all">("all");
  const [perfMetric, setPerfMetric] = useState<"roi" | "winrate" | "sessions">("roi");

  const { data: consolidated, isLoading: loadingConsolidated } = trpc.bankroll.getConsolidated.useQuery();
  const { data: bankroll, isLoading: loadingBankroll } = trpc.bankroll.getCurrent.useQuery();
  const { data: stats, isLoading: loadingStats } = trpc.sessions.stats.useQuery({});
  const { data: history, isLoading: loadingHistory } = trpc.bankroll.history.useQuery(undefined);
  const { data: venueStats } = trpc.venues.statsByVenue.useQuery();

  const updateBalanceMutation = trpc.venues.updateBalance.useMutation({
    onSuccess: () => {
      utils.bankroll.getConsolidated.invalidate();
      toast.success("Saldo atualizado!");
    },
    onError: () => toast.error("Erro ao atualizar saldo"),
  });

  const updateLiveBankrollMutation = trpc.bankroll.updateSettings.useMutation({
    onSuccess: () => {
      utils.bankroll.getCurrent.invalidate();
      utils.bankroll.getConsolidated.invalidate();
      toast.success("Bankroll live atualizado!");
    },
    onError: () => toast.error("Erro ao atualizar bankroll live"),
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

  const donutData = useMemo(() => {
    if (!consolidated?.allVenues) return [];
    const venues = consolidated.allVenues.filter((v: any) => v.balanceBrl > 0);
    if (venues.length === 0) return [];
    return venues.map((v: any, i: number) => ({
      name: v.name.length > 12 ? v.name.substring(0, 12) + "…" : v.name,
      fullName: v.name,
      value: v.balanceBrl / 100,
      color: VENUE_COLORS[i % VENUE_COLORS.length],
      pct: consolidated.total.current > 0 ? Math.round((v.balanceBrl / consolidated.total.current) * 100) : 0,
    }));
  }, [consolidated]);

  const perfData = useMemo(() => {
    if (!venueStats) return [];
    return venueStats
      .filter((v: any) => v.sessions > 0)
      .slice(0, 8)
      .map((v: any) => ({
        name: v.venueName.length > 10 ? v.venueName.substring(0, 10) + "…" : v.venueName,
        fullName: v.venueName,
        roi: v.sessions > 0 ? parseFloat(((v.totalProfit / (v.sessions * 100)) * 100).toFixed(1)) : 0,
        winrate: v.winRate,
        sessions: v.sessions,
        profit: v.totalProfit / 100,
        color: v.totalProfit >= 0 ? "#10b981" : "#ef4444",
      }));
  }, [venueStats]);

  const totalProfit = bankroll?.total.profit || 0;
  const totalCurrent = bankroll?.total.current || 0;
  const invested = totalCurrent - totalProfit;
  const profitPct = invested > 0 ? (totalProfit / invested) * 100 : 0;

  const consolidatedTotal = consolidated?.total.current || 0;
  const consolidatedProfit = consolidated?.total.profit || 0;
  const consolidatedBase = consolidatedTotal - consolidatedProfit;
  const consolidatedPct = consolidatedBase > 0 ? (consolidatedProfit / consolidatedBase) * 100 : 0;

  const isLoading = loadingBankroll || loadingStats || loadingHistory || loadingConsolidated;

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

      <div className="grid grid-cols-1 xl:grid-cols-5 gap-5">
        {/* LEFT COLUMN */}
        <div className="xl:col-span-3 space-y-5">
          {/* Patrimônio card */}
          <Card className="bg-card/60 border-border/40">
            <CardContent className="p-5">
              <div className="flex items-start justify-between mb-4">
                <div>
                  <p className="text-xs text-muted-foreground uppercase tracking-wide mb-1">Patrimônio Poker</p>
                  <p className="text-4xl font-bold tracking-tight">{formatCurrencyCompact(consolidatedTotal)}</p>
                </div>
                <Badge variant={consolidatedProfit >= 0 ? "default" : "destructive"} className="text-xs gap-1 mt-1">
                  {consolidatedProfit >= 0 ? <TrendingUp className="h-3 w-3" /> : <TrendingDown className="h-3 w-3" />}
                  {formatPercent(consolidatedPct)}
                </Badge>
              </div>
              <div className="grid grid-cols-2 gap-4 mb-4 text-sm">
                <div>
                  <p className="text-muted-foreground text-xs mb-0.5">Banca base</p>
                  <p className="font-semibold">{formatCurrencyCompact(Math.max(0, consolidatedBase))}</p>
                </div>
                <div>
                  <p className="text-muted-foreground text-xs mb-0.5">Resultado acumulado</p>
                  <p className={`font-semibold ${consolidatedProfit >= 0 ? "text-emerald-400" : "text-red-400"}`}>
                    {consolidatedProfit >= 0 ? "+" : ""}{formatCurrencyCompact(consolidatedProfit)}
                  </p>
                </div>
              </div>
              <div className="flex items-center gap-4 text-xs border-t border-border/30 pt-3 flex-wrap">
                <div className="flex items-center gap-1.5">
                  <span className="text-muted-foreground">Sessões:</span>
                  <span className="font-semibold">{consolidated?.total.sessions || 0}</span>
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
            <Card className="bg-card/60 border-border/40">
              <CardHeader className="pb-2">
                <CardTitle className="text-sm font-semibold">Distribuição da Banca</CardTitle>
              </CardHeader>
              <CardContent>
                {donutData.length > 0 ? (
                  <div className="flex flex-col items-center">
                    <div className="relative h-48 w-full">
                      <ResponsiveContainer width="100%" height="100%">
                        <PieChart>
                          <Pie data={donutData} cx="50%" cy="50%" innerRadius={50} outerRadius={75} paddingAngle={2} dataKey="value">
                            {donutData.map((entry: any, index: number) => (
                              <Cell key={`cell-${index}`} fill={entry.color} />
                            ))}
                          </Pie>
                          <RechartsTooltip
                            content={({ active, payload }: any) => {
                              if (!active || !payload?.length) return null;
                              const d = payload[0].payload;
                              return (
                                <div className="bg-card border border-border rounded-lg p-2 shadow-xl text-xs">
                                  <p className="font-semibold">{d.fullName}</p>
                                  <p className="text-muted-foreground">{new Intl.NumberFormat("pt-BR", { style: "currency", currency: "BRL" }).format(d.value)}</p>
                                  <p style={{ color: d.color }}>{d.pct}% da banca</p>
                                </div>
                              );
                            }}
                          />
                        </PieChart>
                      </ResponsiveContainer>
                      <div className="absolute inset-0 flex flex-col items-center justify-center pointer-events-none">
                        <p className="text-xs text-muted-foreground">Total</p>
                        <p className="text-base font-bold">{formatCurrencyCompact(consolidatedTotal)}</p>
                      </div>
                    </div>
                    <div className="w-full space-y-1 mt-1">
                      {donutData.map((d: any) => (
                        <div key={d.name} className="flex items-center justify-between text-xs">
                          <div className="flex items-center gap-1.5">
                            <span className="w-2 h-2 rounded-full shrink-0" style={{ backgroundColor: d.color }} />
                            <span className="text-muted-foreground truncate">{d.name}</span>
                          </div>
                          <span className="font-semibold" style={{ color: d.color }}>{d.pct}%</span>
                        </div>
                      ))}
                    </div>
                  </div>
                ) : (
                  <div className="h-48 flex flex-col items-center justify-center gap-2 text-center">
                    <BarChart2 className="h-10 w-10 text-muted-foreground/30" />
                    <p className="text-xs text-muted-foreground">Defina saldos nas plataformas para ver a distribuição</p>
                  </div>
                )}
              </CardContent>
            </Card>

            <Card className="bg-card/60 border-border/40">
              <CardHeader className="pb-2">
                <div className="flex items-center justify-between flex-wrap gap-2">
                  <CardTitle className="text-sm font-semibold">Meu Desempenho</CardTitle>
                  <div className="flex gap-1">
                    {(["roi", "winrate", "sessions"] as const).map((m) => (
                      <Button key={m} size="sm" variant={perfMetric === m ? "default" : "ghost"}
                        className="h-6 px-2 text-[10px]" onClick={() => setPerfMetric(m)}>
                        {m === "roi" ? "ROI" : m === "winrate" ? "Win%" : "Sess."}
                      </Button>
                    ))}
                  </div>
                </div>
              </CardHeader>
              <CardContent>
                {perfData.length > 0 ? (
                  <div className="h-48">
                    <ResponsiveContainer width="100%" height="100%">
                      <BarChart data={perfData} layout="vertical" margin={{ top: 0, right: 30, bottom: 0, left: 0 }}>
                        <XAxis type="number" stroke="oklch(0.55 0.01 240)" fontSize={10} tickLine={false}
                          tickFormatter={(v) => perfMetric === "sessions" ? String(v) : `${v}%`} />
                        <YAxis type="category" dataKey="name" stroke="oklch(0.55 0.01 240)" fontSize={10} tickLine={false} width={70} />
                        <RechartsTooltip
                          content={({ active, payload }: any) => {
                            if (!active || !payload?.length) return null;
                            const d = payload[0].payload;
                            return (
                              <div className="bg-card border border-border rounded-lg p-2 shadow-xl text-xs">
                                <p className="font-semibold mb-1">{d.fullName}</p>
                                <p>ROI: <span className={d.roi >= 0 ? "text-emerald-400" : "text-red-400"}>{d.roi}%</span></p>
                                <p>Win Rate: <span className="text-primary">{d.winrate}%</span></p>
                                <p>Sessões: <span className="font-semibold">{d.sessions}</span></p>
                              </div>
                            );
                          }}
                        />
                        <Bar dataKey={perfMetric === "roi" ? "roi" : perfMetric === "winrate" ? "winrate" : "sessions"} radius={[0, 4, 4, 0]}>
                          {perfData.map((entry: any, index: number) => (
                            <Cell key={`cell-${index}`}
                              fill={perfMetric === "sessions" ? VENUE_COLORS[index % VENUE_COLORS.length]
                                : perfMetric === "winrate" ? (entry.winrate >= 50 ? "#10b981" : "#f59e0b")
                                : entry.color}
                            />
                          ))}
                        </Bar>
                      </BarChart>
                    </ResponsiveContainer>
                  </div>
                ) : (
                  <div className="h-48 flex flex-col items-center justify-center gap-2 text-center">
                    <BarChart2 className="h-10 w-10 text-muted-foreground/30" />
                    <p className="text-xs text-muted-foreground">Registre sessões para ver o desempenho</p>
                    <Link href="/sessions">
                      <Button size="sm" variant="outline" className="gap-1.5 h-7 text-xs"><Plus className="h-3 w-3" /> Nova Sessão</Button>
                    </Link>
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
                  <Badge variant={totalProfit >= 0 ? "default" : "destructive"} className="text-xs gap-1">
                    {totalProfit >= 0 ? <TrendingUp className="h-3 w-3" /> : <TrendingDown className="h-3 w-3" />}
                    {formatPercent(profitPct)}
                  </Badge>
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
                        tickFormatter={(v) => new Intl.NumberFormat("pt-BR", { notation: "compact", style: "currency", currency: "BRL" }).format(v)} />
                      <ReferenceLine y={0} stroke="oklch(0.4 0.01 240)" strokeDasharray="4 4" />
                      <RechartsTooltip content={<CustomTooltip />} />
                      <Legend iconType="circle" iconSize={8} wrapperStyle={{ fontSize: "12px" }} />
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
          {/* Minhas Plataformas no topo */}
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
              <p className="text-xs text-muted-foreground">Clique para expandir e editar saldo</p>
            </CardHeader>
            <CardContent className="px-3 py-0 max-h-[500px] overflow-y-auto">
              {consolidated?.allVenues && consolidated.allVenues.length > 0 ? (
                consolidated.allVenues.map((venue: any, i: number) => (
                  <VenueRow
                    key={venue.id}
                    venue={venue}
                    totalBrl={consolidatedTotal}
                    colorIdx={i}
                    onEditBalance={(id, balance, currency) => {
                      updateBalanceMutation.mutate({ id, balance, currency: currency as "BRL" | "USD" | "CAD" | "JPY" });
                    }}
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

          <LiveBankrollCard
            liveBankroll={bankroll?.live.current || 0}
            profit={bankroll?.live.profit || 0}
            sessions={bankroll?.live.sessions || 0}
            onSetBankroll={(v) => updateLiveBankrollMutation.mutate({ initialLive: v })}
          />

          <Card className="border border-cyan-500/30 bg-card/60 overflow-hidden">
            <div className="h-1 w-full bg-gradient-to-r from-cyan-500 to-blue-600" />
            <CardContent className="p-5">
              <div className="flex items-center justify-between mb-3">
                <span className="text-sm font-semibold text-muted-foreground uppercase tracking-wide">Poker Online</span>
                <Badge variant="outline" className="text-cyan-400 border-cyan-500/30 text-xs gap-1">
                  <Wifi className="h-3 w-3" />Online
                </Badge>
              </div>
              <p className="text-3xl font-bold mb-1">{formatCurrencyCompact(consolidated?.online.current || 0)}</p>
              <div className={`flex items-center gap-1 text-sm mb-1 ${(consolidated?.online.profit || 0) >= 0 ? "text-emerald-400" : "text-red-400"}`}>
                {(consolidated?.online.profit || 0) >= 0 ? <TrendingUp className="h-4 w-4" /> : <TrendingDown className="h-4 w-4" />}
                <span>{(consolidated?.online.profit || 0) >= 0 ? "+" : ""}{formatCurrencyCompact(consolidated?.online.profit || 0)} nas sessões</span>
              </div>
              <p className="text-xs text-muted-foreground">{consolidated?.online.sessions || 0} sessões</p>
            </CardContent>
          </Card>
        </div>
      </div>
    </div>
  );
}
