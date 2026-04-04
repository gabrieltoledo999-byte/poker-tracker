import { trpc } from "@/lib/trpc";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
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
  Sparkles,
  CheckCircle2,
  AlertCircle,
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

// ─── VenueRow ────────────────────────────────────────────────────────────────
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

  const hasBalance = venue.type === "live" ? venue.balanceBrl > 0 : venue.balance > 0;

  return (
    <div className="border-b border-border/20 last:border-0">
      <div
        className="flex items-center gap-3 py-3 px-1 cursor-pointer hover:bg-muted/20 rounded-lg transition-colors"
        onClick={() => setExpanded(!expanded)}
      >
        <CirclePercent pct={pct} color={color} size={44} />
        <div className="flex items-center gap-2 flex-1 min-w-0">
          <div className="h-10 w-10 rounded-lg bg-muted/60 flex items-center justify-center shrink-0 overflow-hidden">
            {venue.logoUrl ? (
              <img src={venue.logoUrl} alt={venue.name} className={`h-full w-full rounded-md ${
                venue.name === "Suprema Poker" || venue.name === "WPT Global" ? "object-cover" : "object-contain"
              }`} />
            ) : (
              <Building2 className="h-5 w-5 text-muted-foreground" />
            )}
          </div>
          <div className="min-w-0">
            <p className="text-sm font-semibold truncate">{venue.name}</p>
            <p className="text-xs text-muted-foreground flex items-center gap-1 flex-wrap">
              <span>{venue.type === "live" ? "Live" : venue.currency || "BRL"}</span>
              {venue.type === "online" && (venue.currency === "BRL" || !venue.currency) && (
                <span className="inline-flex items-center px-1 py-0 rounded text-[9px] font-semibold bg-amber-500/15 text-amber-400 border border-amber-500/20" title="Plataforma em Reais — sem conversão de moeda">
                  🇧🇷 Nacional
                </span>
              )}
              {venue.type === "online" && venue.currency !== "BRL" && venue.balance > 0 && (
                <span className="text-[10px] text-primary/70">≈ {formatCurrencyCompact(venue.balanceBrl)}</span>
              )}
            </p>
          </div>
        </div>
        <div className="text-right shrink-0">
          {hasBalance ? (
            <>
              <p className="text-sm font-bold">{displayBalance()}</p>
              {stats && stats.sessions > 0 && (
                <p className={`text-xs font-medium ${stats.totalProfit >= 0 ? "text-emerald-400" : "text-red-400"}`}>
                  {stats.totalProfit >= 0 ? "+" : ""}{formatCurrencyCompact(stats.totalProfit)}
                </p>
              )}
            </>
          ) : (
            <span className="text-xs text-amber-400 font-medium flex items-center gap-1">
              <AlertCircle className="h-3 w-3" /> Definir
            </span>
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
              <p className="text-xs text-muted-foreground mb-2 font-medium">
                Saldo atual na plataforma
                {!hasBalance && <span className="ml-2 text-amber-400">(não definido)</span>}
              </p>
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
                  <Input
                    type="number"
                    placeholder="0.00"
                    value={balanceInput}
                    onChange={(e) => setBalanceInput(e.target.value)}
                    onKeyDown={(e) => {
                      if (e.key === "Enter") handleSaveBalance();
                      if (e.key === "Escape") setEditingBalance(false);
                    }}
                    className="h-8 text-sm flex-1"
                    autoFocus
                  />
                  <Button size="sm" className="h-8 px-3 bg-emerald-600 hover:bg-emerald-700" onClick={handleSaveBalance}>
                    <CheckCircle2 className="h-3.5 w-3.5 mr-1" /> Salvar
                  </Button>
                  <Button size="sm" variant="ghost" className="h-8 px-2" onClick={() => setEditingBalance(false)}>✕</Button>
                </div>
              ) : (
                <div className="flex items-center justify-between">
                  <span className="text-sm font-semibold">
                    {hasBalance ? (
                      <>
                        {displayBalance()}
                        {venue.currency !== "BRL" && (
                          <span className="text-xs text-muted-foreground ml-2">≈ {formatCurrencyCompact(venue.balanceBrl)}</span>
                        )}
                      </>
                    ) : (
                      <span className="text-muted-foreground text-xs">Nenhum saldo definido</span>
                    )}
                  </span>
                  <Button
                    size="sm"
                    variant={hasBalance ? "outline" : "default"}
                    className={`h-7 px-2 text-xs gap-1 ${!hasBalance ? "bg-primary text-primary-foreground" : ""}`}
                    onClick={(e) => {
                      e.stopPropagation();
                      setEditingBalance(true);
                      setCurrencyInput(venue.currency || "BRL");
                      setBalanceInput(hasBalance ? String(venue.balance / 100) : "");
                    }}
                  >
                    {hasBalance ? <><Pencil className="h-3 w-3" /> Editar</> : <><Plus className="h-3 w-3" /> Definir saldo</>}
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

// ─── LiveBankrollCard ─────────────────────────────────────────────────────────
function LiveBankrollCard({
  liveBankroll, profit, sessions, onSetBankroll,
}: {
  liveBankroll: number; profit: number; sessions: number;
  onSetBankroll: (v: number) => void;
}) {
  const [editing, setEditing] = useState(false);
  const [inputValue, setInputValue] = useState("");
  const isPositive = profit >= 0;
  const hasBankroll = liveBankroll > 0;

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

        {hasBankroll ? (
          <>
            <p className="text-3xl font-bold mb-1">{formatCurrency(liveBankroll)}</p>
            <div className={`flex items-center gap-1 text-sm mb-1 ${isPositive ? "text-emerald-400" : "text-red-400"}`}>
              {isPositive ? <TrendingUp className="h-4 w-4" /> : <TrendingDown className="h-4 w-4" />}
              <span>{isPositive ? "+" : ""}{formatCurrency(profit)} nas sessões</span>
            </div>
            <p className="text-xs text-muted-foreground mb-4">{sessions} {sessions === 1 ? "sessão" : "sessões"}</p>
          </>
        ) : (
          <div className="mb-4">
            <p className="text-3xl font-bold mb-1 text-muted-foreground">R$ 0,00</p>
            <p className="text-xs text-amber-400 flex items-center gap-1">
              <AlertCircle className="h-3 w-3" /> Bankroll live não definido
            </p>
          </div>
        )}

        <div className="border-t border-border/30 pt-3">
          <p className="text-[10px] text-muted-foreground mb-2 uppercase tracking-wide">
            {hasBankroll ? "Bankroll definido para live" : "Defina seu bankroll para live"}
          </p>
          {editing ? (
            <div className="flex gap-2 items-center">
              <span className="text-sm text-muted-foreground shrink-0">R$</span>
              <Input
                type="number"
                placeholder="Ex: 2000"
                value={inputValue}
                onChange={(e) => setInputValue(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === "Enter") handleConfirm();
                  if (e.key === "Escape") setEditing(false);
                }}
                className="h-8 text-sm flex-1"
                autoFocus
              />
              <Button size="sm" className="h-8 px-3 bg-emerald-600 hover:bg-emerald-700" onClick={handleConfirm}>
                <CheckCircle2 className="h-3.5 w-3.5 mr-1" /> Salvar
              </Button>
              <Button size="sm" variant="ghost" className="h-8 px-2" onClick={() => setEditing(false)}>✕</Button>
            </div>
          ) : (
            <div className="flex items-center justify-between">
              <span className="text-sm font-semibold text-violet-300">
                {hasBankroll ? formatCurrency(liveBankroll) : "—"}
              </span>
              <Button
                size="sm"
                variant={hasBankroll ? "outline" : "default"}
                className={`h-7 px-3 text-xs gap-1 ${!hasBankroll ? "bg-violet-600 hover:bg-violet-700 text-white border-0" : "border-violet-500/30 text-violet-400"}`}
                onClick={() => {
                  setEditing(true);
                  setInputValue(hasBankroll ? String(liveBankroll / 100) : "");
                }}
              >
                {hasBankroll ? <><Settings2 className="h-3 w-3" /> Alterar</> : <><Plus className="h-3 w-3" /> Definir bankroll</>}
              </Button>
            </div>
          )}
        </div>
      </CardContent>
    </Card>
  );
}

// ─── OnboardingBanner ─────────────────────────────────────────────────────────
function OnboardingBanner({ venues, onDismiss }: { venues: any[]; onDismiss: () => void }) {
  const undefinedOnline = venues.filter(v => v.type === "online" && v.balance === 0);
  const undefinedLive = venues.filter(v => v.type === "live" && v.balanceBrl === 0);
  const totalUndefined = undefinedOnline.length + undefinedLive.length;
  const totalVenues = venues.length;

  // Desaparece automaticamente se ao menos uma plataforma tiver saldo definido
  const hasAtLeastOneBalance = totalVenues > 0 && totalUndefined < totalVenues;
  if (hasAtLeastOneBalance || totalUndefined === 0) return null;

  return (
    <div className="rounded-xl border border-amber-500/30 bg-amber-500/5 p-4 flex items-start gap-3">
      <Sparkles className="h-5 w-5 text-amber-400 shrink-0 mt-0.5" />
      <div className="flex-1 min-w-0">
        <p className="text-sm font-semibold text-amber-300 mb-1">Configure sua banca para ver seu patrimônio real</p>
        <p className="text-xs text-muted-foreground mb-3">
          Você tem {totalUndefined} plataforma{totalUndefined > 1 ? "s" : ""} sem saldo definido.
          Clique em cada plataforma abaixo → expanda → clique em <strong>"Definir saldo"</strong> para registrar quanto você tem em cada site.
          {undefinedLive.length > 0 && " Para o Live, use o card roxo abaixo."}
        </p>
        <div className="flex flex-wrap gap-2">
          {undefinedOnline.slice(0, 5).map((v: any) => (
            <span key={v.id} className="text-xs bg-amber-500/10 border border-amber-500/20 rounded px-2 py-0.5 text-amber-300">
              {v.name}
            </span>
          ))}
          {undefinedOnline.length > 5 && (
            <span className="text-xs text-muted-foreground">+{undefinedOnline.length - 5} mais</span>
          )}
        </div>
      </div>
      <Button size="sm" variant="ghost" className="h-6 px-2 text-xs text-muted-foreground shrink-0" onClick={onDismiss}>
        Fechar
      </Button>
    </div>
  );
}

// ─── Main Dashboard ───────────────────────────────────────────────────────────
export default function Dashboard() {
  const utils = trpc.useUtils();
  const [chartPeriod, setChartPeriod] = useState<"online" | "live" | "all">("all");
  const [perfMetric, setPerfMetric] = useState<"roi" | "winrate" | "sessions">("roi");
   const [showOnboarding, setShowOnboarding] = useState(true);
  const [showLegacyModal, setShowLegacyModal] = useState(true);
  const [legacyAllocations, setLegacyAllocations] = useState<Record<number, string>>({});
  const [showLiveModal, setShowLiveModal] = useState(false);
  const [liveInputValue, setLiveInputValue] = useState("");
  const { data: consolidated, isLoading: loadingConsolidated } = trpc.bankroll.getConsolidated.useQuery();
  const { data: legacyStatus } = trpc.bankroll.getLegacyMigrationStatus.useQuery();
  const completeLegacyMigrationMutation = trpc.bankroll.completeLegacyMigration.useMutation({
    onSuccess: () => {
      setShowLegacyModal(false);
      utils.bankroll.getConsolidated.invalidate();
      utils.bankroll.getLegacyMigrationStatus.invalidate();
      toast.success("Saldo migrado com sucesso! Seu patrimônio foi atualizado.");
    },
    onError: (err) => toast.error(`Erro ao migrar saldo: ${err.message}`),
  });
  const { data: stats, isLoading: loadingStats } = trpc.sessions.stats.useQuery({});
  const { data: history, isLoading: loadingHistory } = trpc.bankroll.history.useQuery(undefined);
  const { data: venueStats } = trpc.venues.statsByVenue.useQuery();

  const updateBalanceMutation = trpc.venues.updateBalance.useMutation({
    onSuccess: () => {
      utils.bankroll.getConsolidated.invalidate();
      utils.bankroll.history.invalidate();
      toast.success("Saldo atualizado com sucesso!");
    },
    onError: (err) => toast.error(`Erro ao atualizar saldo: ${err.message}`),
  });

  const updateLiveBankrollMutation = trpc.bankroll.updateSettings.useMutation({
    onSuccess: () => {
      utils.bankroll.getConsolidated.invalidate();
      utils.bankroll.history.invalidate();
      toast.success("Bankroll live atualizado!");
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

  // Domínio dinâmico do eixo Y — se adapta ao bankroll real do usuário
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

  // Donut: Live vs Online (2 fatias)
  const donutData = useMemo(() => {
    if (!consolidated) return [];
    const total = consolidated.total.current;
    if (total === 0) return [];

    const result: { name: string; fullName: string; value: number; color: string; pct: number; logoUrl?: string }[] = [];

    // Adicionar cada plataforma online com saldo > 0
    const onlineVenues = (consolidated.allVenues || []).filter((v: any) => v.type === "online" && v.balanceBrl > 0);
    onlineVenues.forEach((v: any, idx: number) => {
      result.push({
        name: v.name.length > 12 ? v.name.substring(0, 12) + "…" : v.name,
        fullName: v.name,
        value: v.balanceBrl / 100,
        color: VENUE_COLORS[idx % VENUE_COLORS.length],
        pct: Math.round((v.balanceBrl / total) * 100),
        logoUrl: v.logoUrl,
      });
    });

    // Adicionar Live como uma fatia única (saldo total live)
    const liveVal = consolidated.live.current;
    if (liveVal > 0) {
      result.push({
        name: "Live",
        fullName: "Poker Live (presencial)",
        value: liveVal / 100,
        color: VENUE_COLORS[(onlineVenues.length) % VENUE_COLORS.length],
        pct: Math.round((liveVal / total) * 100),
      });
    }

    return result;
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

  // Patrimônio real = saldo das plataformas online (convertido p/ BRL) + bankroll live
  const consolidatedTotal = consolidated?.total.current || 0;
  const consolidatedProfit = consolidated?.total.profit || 0;
  const consolidatedBase = consolidatedTotal - consolidatedProfit;
  const consolidatedPct = consolidatedBase > 0 ? (consolidatedProfit / consolidatedBase) * 100 : 0;

  // Detectar se o usuário ainda não definiu nenhuma banca
  const hasAnyBalance = consolidatedTotal > 0;
  const allVenues = [...(consolidated?.allVenues || [])].sort((a: any, b: any) => b.balanceBrl - a.balanceBrl);

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

      {/* Modal de migração legada */}
      {legacyStatus?.needsMigration && showLegacyModal && (
        <Dialog open={showLegacyModal} onOpenChange={setShowLegacyModal}>
          <DialogContent className="max-w-lg">
            <DialogHeader>
              <DialogTitle className="flex items-center gap-2">
                <Sparkles className="h-5 w-5 text-amber-400" />
                Distribua seu saldo por plataforma
              </DialogTitle>
              <DialogDescription>
                Encontramos um saldo online de <strong>{formatCurrency(legacyStatus.legacyOnlineAmount)}</strong> registrado anteriormente sem plataforma definida.
                Indique em qual(is) plataforma(s) esse dinheiro está para que seu patrimônio fique correto.
              </DialogDescription>
            </DialogHeader>
            <div className="space-y-3 py-2 max-h-72 overflow-y-auto">
              {allVenues.filter((v: any) => v.type === "online").map((v: any) => (
                <div key={v.id} className="flex items-center gap-3 p-3 rounded-lg border border-border/40 bg-muted/20">
                  <div className="h-9 w-9 rounded-lg bg-muted/60 flex items-center justify-center shrink-0 overflow-hidden">
                    {v.logoUrl ? (
                      <img src={v.logoUrl} alt={v.name} className="h-full w-full object-contain" />
                    ) : (
                      <Building2 className="h-4 w-4 text-muted-foreground" />
                    )}
                  </div>
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-semibold">{v.name}</p>
                    <p className="text-xs text-muted-foreground">{v.currency || "BRL"}</p>
                  </div>
                  <Input
                    type="number"
                    placeholder="0.00"
                    className="w-28 h-8 text-sm"
                    value={legacyAllocations[v.id] ?? ""}
                    onChange={(e) => setLegacyAllocations(prev => ({ ...prev, [v.id]: e.target.value }))}
                  />
                </div>
              ))}
            </div>
            <div className="flex justify-between items-center pt-2 border-t border-border/30">
              <Button variant="ghost" size="sm" className="text-xs text-muted-foreground" onClick={() => setShowLegacyModal(false)}>
                Fazer depois
              </Button>
              <Button
                size="sm"
                className="gap-1.5"
                disabled={completeLegacyMigrationMutation.isPending}
                onClick={() => {
                  const allocations = Object.entries(legacyAllocations)
                    .filter(([, v]) => v && parseFloat(v) > 0)
                    .map(([id, v]) => ({ venueId: parseInt(id), amount: Math.round(parseFloat(v) * 100) }));
                  if (!allocations.length) { toast.error("Defina o saldo em ao menos uma plataforma"); return; }
                  completeLegacyMigrationMutation.mutate({ allocations });
                }}
              >
                <CheckCircle2 className="h-4 w-4" /> Confirmar distribuição
              </Button>
            </div>
          </DialogContent>
        </Dialog>
      )}

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
                placeholder={`Ex: ${((consolidated?.live.current || 0) / 100).toFixed(2) || "500.00"}`}
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
                Valor atual: <span className="text-violet-400 font-medium">{new Intl.NumberFormat("pt-BR", { style: "currency", currency: "BRL" }).format((consolidated?.live.current || 0) / 100)}</span>
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
              disabled={updateLiveBankrollMutation.isPending || !liveInputValue}
              onClick={() => {
                const val = parseFloat(liveInputValue);
                if (isNaN(val) || val < 0) { toast.error("Valor inválido"); return; }
                updateLiveBankrollMutation.mutate(
                  { initialLive: Math.round(val * 100) },
                  { onSuccess: () => { setShowLiveModal(false); setLiveInputValue(""); } }
                );
              }}
            >
              <CheckCircle2 className="h-4 w-4" />
              {updateLiveBankrollMutation.isPending ? "Salvando..." : "Salvar"}
            </Button>
          </div>
        </DialogContent>
      </Dialog>

      {/* Banner de onboarding */}
      {showOnboarding && allVenues.length > 0 && (
        <OnboardingBanner venues={allVenues} onDismiss={() => setShowOnboarding(false)} />
      )}

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
                  {!hasAnyBalance && (
                    <p className="text-xs text-amber-400 mt-1 flex items-center gap-1">
                      <AlertCircle className="h-3 w-3" /> Defina os saldos das suas plataformas para ver o patrimônio real
                    </p>
                  )}
                  {hasAnyBalance && !consolidated?.hasVenueBalances && (
                    <p className="text-xs text-amber-400/70 mt-1 flex items-center gap-1">
                      <AlertCircle className="h-3 w-3" /> Patrimônio calculado pelo histórico — <Link to="/locais" className="underline underline-offset-2">associe uma plataforma</Link> para maior precisão
                    </p>
                  )}
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
                  <p className="text-muted-foreground text-xs mb-0.5">Online</p>
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
            {/* Donut: Live vs Online */}
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
                      {/* Centro do donut */}
                      <div className="absolute inset-0 flex flex-col items-center justify-center pointer-events-none">
                        <p className="text-[10px] text-muted-foreground">Total</p>
                        <p className="text-base font-bold">{formatCurrencyCompact(consolidatedTotal)}</p>
                      </div>
                    </div>
                    {/* Legenda */}
                    <div className="w-full space-y-1.5 mt-3">
                      {donutData.map((d: any) => (
                        <div key={d.name} className="flex items-center justify-between gap-2">
                          <div className="flex items-center gap-2 min-w-0">
                            {d.logoUrl ? (
                              <img src={d.logoUrl} alt={d.fullName} className="w-5 h-5 rounded object-contain shrink-0" />
                            ) : (
                              <span className="w-3 h-3 rounded-full shrink-0" style={{ backgroundColor: d.color }} />
                            )}
                            <span className="text-xs font-medium truncate">{d.fullName}</span>
                          </div>
                          <div className="flex items-center gap-1.5 shrink-0">
                            <span className="text-xs font-bold" style={{ color: d.color }}>
                              {new Intl.NumberFormat("pt-BR", { style: "currency", currency: "BRL" }).format(d.value)}
                            </span>
                            <span className="text-[10px] text-muted-foreground bg-muted/60 px-1.5 py-0.5 rounded-full">{d.pct}%</span>
                          </div>
                        </div>
                      ))}
                    </div>
                  </div>
                ) : (
                  <div className="h-52 flex flex-col items-center justify-center gap-3 text-center">
                    <div className="relative">
                      <div className="h-24 w-24 rounded-full border-4 border-dashed border-muted-foreground/20 flex items-center justify-center">
                        <BarChart2 className="h-8 w-8 text-muted-foreground/30" />
                      </div>
                    </div>
                    <div>
                      <p className="text-sm font-medium text-muted-foreground">Sem dados de banca</p>
                      <p className="text-xs text-muted-foreground mt-1">
                        Defina o saldo nas plataformas para ver a distribuição Live vs Online
                      </p>
                    </div>
                  </div>
                )}
              </CardContent>
            </Card>

            {/* Desempenho */}
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
              <p className="text-xs text-muted-foreground">Clique para expandir e definir/editar saldo</p>
            </CardHeader>
            <CardContent className="px-3 py-0 max-h-[500px] overflow-y-auto">
              {allVenues.filter((v: any) => v.type === "online").length > 0 ? (
                allVenues.filter((v: any) => v.type === "online").map((venue: any, i: number) => (
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
            liveBankroll={consolidated?.live.current || 0}
            profit={consolidated?.live.profit || 0}
            sessions={consolidated?.live.sessions || 0}
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
