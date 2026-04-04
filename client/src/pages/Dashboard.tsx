import { trpc } from "@/lib/trpc";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { Badge } from "@/components/ui/badge";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
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
  AreaChart,
  Area,
  LineChart,
  Line,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip as RechartsTooltip,
  ResponsiveContainer,
  Legend,
  ReferenceLine,
} from "recharts";
import {
  TrendingUp,
  TrendingDown,
  Plus,
  ArrowUpRight,
  ArrowDownRight,
  Minus,
  Building2,
  Wifi,
  MapPin,
  Pencil,
  Trash2,
  BarChart2,
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

function MetricCard({ label, value, sub, trend }: { label: string; value: string; sub?: string; trend?: "up" | "down" | "neutral" }) {
  const color = trend === "up" ? "text-emerald-400" : trend === "down" ? "text-red-400" : "text-foreground";
  const Icon = trend === "up" ? ArrowUpRight : trend === "down" ? ArrowDownRight : Minus;
  return (
    <Card className="bg-card/60 border-border/40 hover:border-primary/30 transition-colors">
      <CardContent className="p-4">
        <p className="text-xs text-muted-foreground mb-1 font-medium uppercase tracking-wide">{label}</p>
        <div className="flex items-end gap-1.5">
          <span className={`text-xl font-bold ${color}`}>{value}</span>
          {trend && trend !== "neutral" && <Icon className={`h-4 w-4 mb-0.5 ${color}`} />}
        </div>
        {sub && <p className="text-xs text-muted-foreground mt-1">{sub}</p>}
      </CardContent>
    </Card>
  );
}

function BankrollCard({ title, current, profit, sessions, type, onDeposit, onWithdraw }: {
  title: string; current: number; profit: number; sessions: number;
  type: "online" | "live" | "total";
  onDeposit?: (v: number) => void; onWithdraw?: (v: number) => void;
}) {
  const [showInput, setShowInput] = useState<"deposit" | "withdraw" | null>(null);
  const [inputValue, setInputValue] = useState("");
  const isPositive = profit >= 0;
  const accentColor = type === "online" ? "from-cyan-500 to-blue-600" : type === "live" ? "from-violet-500 to-purple-700" : "from-blue-500 to-indigo-700";
  const borderColor = type === "online" ? "border-cyan-500/30" : type === "live" ? "border-violet-500/30" : "border-blue-500/30";

  const handleConfirm = () => {
    const val = Math.round(parseFloat(inputValue.replace(",", ".")) * 100);
    if (isNaN(val) || val <= 0) { toast.error("Valor inválido"); return; }
    if (showInput === "deposit") onDeposit?.(val);
    else onWithdraw?.(val);
    setShowInput(null); setInputValue("");
  };

  return (
    <Card className={`border ${borderColor} bg-card/60 overflow-hidden`}>
      <div className={`h-1 w-full bg-gradient-to-r ${accentColor}`} />
      <CardContent className="p-5">
        <div className="flex items-center justify-between mb-3">
          <span className="text-sm font-semibold text-muted-foreground uppercase tracking-wide">{title}</span>
          {type === "online" && <Badge variant="outline" className="text-cyan-400 border-cyan-500/30 text-xs gap-1"><Wifi className="h-3 w-3" />Online</Badge>}
          {type === "live" && <Badge variant="outline" className="text-violet-400 border-violet-500/30 text-xs gap-1"><MapPin className="h-3 w-3" />Live</Badge>}
          {type === "total" && <Badge variant="outline" className="text-blue-400 border-blue-500/30 text-xs gap-1"><BarChart2 className="h-3 w-3" />Total</Badge>}
        </div>
        <p className="text-3xl font-bold mb-1">{formatCurrency(current)}</p>
        <div className={`flex items-center gap-1 text-sm mb-4 ${isPositive ? "text-emerald-400" : "text-red-400"}`}>
          {isPositive ? <TrendingUp className="h-4 w-4" /> : <TrendingDown className="h-4 w-4" />}
          <span>{isPositive ? "+" : ""}{formatCurrency(profit)} nas sessões</span>
        </div>
        <p className="text-xs text-muted-foreground mb-3">{sessions} {sessions === 1 ? "sessão" : "sessões"}</p>
        {type !== "total" && (
          showInput ? (
            <div className="flex gap-2 items-center">
              <span className="text-sm text-muted-foreground">R$</span>
              <Input type="number" placeholder="0,00" value={inputValue} onChange={(e) => setInputValue(e.target.value)}
                onKeyDown={(e) => { if (e.key === "Enter") handleConfirm(); if (e.key === "Escape") setShowInput(null); }}
                className="h-8 text-sm flex-1" autoFocus />
              <Button size="sm" className="h-8 px-3" onClick={handleConfirm}>OK</Button>
              <Button size="sm" variant="ghost" className="h-8 px-2" onClick={() => { setShowInput(null); setInputValue(""); }}>✕</Button>
            </div>
          ) : (
            <div className="flex gap-2">
              <Button size="sm" className="flex-1 h-8 gap-1 text-xs bg-emerald-600/80 hover:bg-emerald-600 text-white" onClick={() => setShowInput("deposit")}>
                <Plus className="h-3.5 w-3.5" /> Depositar
              </Button>
              <Button size="sm" variant="outline" className="flex-1 h-8 gap-1 text-xs border-red-500/30 text-red-400 hover:bg-red-500/10" onClick={() => setShowInput("withdraw")}>
                <TrendingDown className="h-3.5 w-3.5" /> Sacar
              </Button>
            </div>
          )
        )}
      </CardContent>
    </Card>
  );
}

function ClubCard({ club, onEdit, onDelete }: {
  club: { id: number; name: string; logoUrl: string | null; type: string; allocatedAmount: number; totalProfit: number; sessionCount: number; trend: string; chartPoints: { value: number }[] };
  onEdit: () => void; onDelete: () => void;
}) {
  const isUp = club.trend === "up";
  const profitColor = club.totalProfit > 0 ? "text-emerald-400" : club.totalProfit < 0 ? "text-red-400" : "text-muted-foreground";

  return (
    <div className="flex items-center gap-3 p-3 rounded-lg bg-muted/20 hover:bg-muted/40 transition-colors group border border-border/30">
      <div className="h-10 w-10 rounded-lg bg-muted/60 flex items-center justify-center shrink-0 overflow-hidden">
        {club.logoUrl ? (
          <img src={club.logoUrl} alt={club.name} className="h-10 w-10 object-cover rounded-lg" />
        ) : (
          <Building2 className="h-5 w-5 text-muted-foreground" />
        )}
      </div>
      <div className="flex-1 min-w-0">
        <div className="flex items-center gap-1.5">
          <p className="text-sm font-semibold truncate">{club.name}</p>
          <Badge variant="outline" className="text-[10px] px-1 py-0 shrink-0">
            {club.type === "online" ? "Online" : "Live"}
          </Badge>
        </div>
        <p className="text-xs text-muted-foreground">{formatCurrency(club.allocatedAmount)} alocado</p>
      </div>
      {club.chartPoints.length > 1 && (
        <div className="w-16 h-8 shrink-0">
          <ResponsiveContainer width="100%" height="100%">
            <LineChart data={club.chartPoints}>
              <Line type="monotone" dataKey="value" stroke={isUp ? "#34d399" : "#f87171"} strokeWidth={1.5} dot={false} />
            </LineChart>
          </ResponsiveContainer>
        </div>
      )}
      <div className="text-right shrink-0">
        <div className={`flex items-center gap-0.5 justify-end text-sm font-bold ${profitColor}`}>
          {club.totalProfit > 0 ? <ArrowUpRight className="h-3.5 w-3.5" /> : club.totalProfit < 0 ? <ArrowDownRight className="h-3.5 w-3.5" /> : null}
          {formatCurrencyCompact(club.totalProfit)}
        </div>
        <p className="text-[10px] text-muted-foreground">{club.sessionCount} sessões</p>
      </div>
      <div className="hidden group-hover:flex items-center gap-1 shrink-0">
        <Button size="icon" variant="ghost" className="h-7 w-7" onClick={onEdit}><Pencil className="h-3.5 w-3.5" /></Button>
        <Button size="icon" variant="ghost" className="h-7 w-7 text-destructive" onClick={onDelete}><Trash2 className="h-3.5 w-3.5" /></Button>
      </div>
    </div>
  );
}

function ClubDialog({ open, onOpenChange, initial, onSave }: {
  open: boolean; onOpenChange: (v: boolean) => void;
  initial?: { id?: number; name: string; logoUrl?: string | null; type: string; allocatedAmount: number; notes?: string | null };
  onSave: (data: { name: string; logoUrl?: string; type: "online" | "live"; allocatedAmount: number; notes?: string }) => void;
}) {
  const [name, setName] = useState(initial?.name || "");
  const [logoUrl, setLogoUrl] = useState(initial?.logoUrl || "");
  const [type, setType] = useState<"online" | "live">(initial?.type as "online" | "live" || "online");
  const [amount, setAmount] = useState(initial ? String(initial.allocatedAmount / 100) : "");
  const [notes, setNotes] = useState(initial?.notes || "");

  const handleSubmit = () => {
    if (!name.trim()) { toast.error("Nome obrigatório"); return; }
    const val = Math.round(parseFloat(amount.replace(",", ".") || "0") * 100);
    onSave({ name: name.trim(), logoUrl: logoUrl || undefined, type, allocatedAmount: val, notes: notes || undefined });
    onOpenChange(false);
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-sm">
        <DialogHeader>
          <DialogTitle>{initial?.id ? "Editar Clube" : "Novo Clube"}</DialogTitle>
        </DialogHeader>
        <div className="space-y-3 mt-2">
          <div><Label>Nome do Clube</Label><Input value={name} onChange={(e) => setName(e.target.value)} placeholder="Ex: PPPoker, ClubGG..." /></div>
          <div><Label>Tipo</Label>
            <Select value={type} onValueChange={(v) => setType(v as "online" | "live")}>
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="online">Online</SelectItem>
                <SelectItem value="live">Live</SelectItem>
              </SelectContent>
            </Select>
          </div>
          <div><Label>Bankroll Alocado (R$)</Label><Input type="number" value={amount} onChange={(e) => setAmount(e.target.value)} placeholder="0,00" /></div>
          <div><Label>URL da Logo (opcional)</Label><Input value={logoUrl} onChange={(e) => setLogoUrl(e.target.value)} placeholder="https://..." /></div>
          <div><Label>Notas (opcional)</Label><Input value={notes} onChange={(e) => setNotes(e.target.value)} placeholder="Observações..." /></div>
          <Button className="w-full" onClick={handleSubmit}>{initial?.id ? "Salvar" : "Criar Clube"}</Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}

function CustomTooltip({ active, payload, label }: any) {
  if (!active || !payload?.length) return null;
  return (
    <div className="bg-card border border-border rounded-lg p-3 shadow-xl text-xs">
      <p className="text-muted-foreground mb-1.5">{label}</p>
      {(payload as any[]).map((p) => (
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

export default function Dashboard() {
  const utils = trpc.useUtils();
  const [chartPeriod, setChartPeriod] = useState<"online" | "live" | "all">("all");
  const [clubDialogOpen, setClubDialogOpen] = useState(false);
  const [editingClub, setEditingClub] = useState<any>(null);

  const { data: bankroll, isLoading: loadingBankroll } = trpc.bankroll.getCurrent.useQuery();
  const { data: stats, isLoading: loadingStats } = trpc.sessions.stats.useQuery({});
  const { data: history, isLoading: loadingHistory } = trpc.bankroll.history.useQuery(undefined);
  const { data: clubsData, isLoading: loadingClubs } = trpc.clubs.listWithStats.useQuery();

  const fundMutation = trpc.funds.create.useMutation({
    onSuccess: () => { utils.bankroll.getCurrent.invalidate(); toast.success("Transação registrada!"); },
    onError: () => toast.error("Erro ao registrar transação"),
  });
  const createClubMutation = trpc.clubs.create.useMutation({
    onSuccess: () => { utils.clubs.listWithStats.invalidate(); toast.success("Clube criado!"); },
    onError: () => toast.error("Erro ao criar clube"),
  });
  const updateClubMutation = trpc.clubs.update.useMutation({
    onSuccess: () => { utils.clubs.listWithStats.invalidate(); toast.success("Clube atualizado!"); },
    onError: () => toast.error("Erro ao atualizar clube"),
  });
  const deleteClubMutation = trpc.clubs.delete.useMutation({
    onSuccess: () => { utils.clubs.listWithStats.invalidate(); toast.success("Clube removido!"); },
    onError: () => toast.error("Erro ao remover clube"),
  });

  const handleFund = (bankrollType: "online" | "live", transactionType: "deposit" | "withdrawal", amount: number) => {
    fundMutation.mutate({ transactionType, bankrollType, amount, currency: "BRL", transactionDate: new Date() });
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

  const totalProfit = bankroll?.total.profit || 0;
  const totalCurrent = bankroll?.total.current || 0;
  const invested = totalCurrent - totalProfit;
  const profitPct = invested > 0 ? (totalProfit / invested) * 100 : 0;
  const isLoading = loadingBankroll || loadingStats || loadingHistory;

  if (isLoading) {
    return (
      <div className="space-y-4">
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">{[1,2,3].map(i => <Skeleton key={i} className="h-40" />)}</div>
        <div className="grid grid-cols-2 md:grid-cols-4 gap-3">{[1,2,3,4].map(i => <Skeleton key={i} className="h-20" />)}</div>
        <div className="grid grid-cols-1 xl:grid-cols-3 gap-4"><Skeleton className="h-80 xl:col-span-2" /><Skeleton className="h-80" /></div>
      </div>
    );
  }

  return (
    <div className="space-y-5">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold tracking-tight">Dashboard</h1>
          <p className="text-sm text-muted-foreground">Visão geral do seu bankroll</p>
        </div>
        <Link href="/sessions">
          <Button size="sm" className="gap-1.5"><Plus className="h-4 w-4" /> Nova Sessão</Button>
        </Link>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        <BankrollCard title="Poker Online" current={bankroll?.online.current || 0} profit={bankroll?.online.profit || 0}
          sessions={bankroll?.online.sessions || 0} type="online"
          onDeposit={(v) => handleFund("online", "deposit", v)} onWithdraw={(v) => handleFund("online", "withdrawal", v)} />
        <BankrollCard title="Poker Live" current={bankroll?.live.current || 0} profit={bankroll?.live.profit || 0}
          sessions={bankroll?.live.sessions || 0} type="live"
          onDeposit={(v) => handleFund("live", "deposit", v)} onWithdraw={(v) => handleFund("live", "withdrawal", v)} />
        <BankrollCard title="Total" current={totalCurrent} profit={totalProfit} sessions={bankroll?.total.sessions || 0} type="total" />
      </div>

      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
        <MetricCard label="Total de Sessões" value={String(stats?.totalSessions || 0)} trend="neutral" />
        <MetricCard label="Win Rate" value={`${(stats?.winRate || 0).toFixed(1)}%`}
          sub={`${stats?.winningSessions || 0}V / ${stats?.losingSessions || 0}D`}
          trend={(stats?.winRate || 0) >= 50 ? "up" : (stats?.winRate || 0) > 0 ? "down" : "neutral"} />
        <MetricCard label="Média/Sessão" value={formatCurrencyCompact(stats?.avgProfit || 0)}
          trend={(stats?.avgProfit || 0) >= 0 ? "up" : "down"} />
        <MetricCard label="Taxa Horária" value={formatCurrencyCompact(stats?.avgHourlyRate || 0)} sub="por hora"
          trend={(stats?.avgHourlyRate || 0) >= 0 ? "up" : "down"} />
      </div>

      <div className="grid grid-cols-1 xl:grid-cols-3 gap-4">
        <Card className="xl:col-span-2 bg-card/60 border-border/40">
          <CardHeader className="pb-2">
            <div className="flex items-center justify-between flex-wrap gap-2">
              <div className="flex items-center gap-2">
                <CardTitle className="text-base font-semibold">Performance do Bankroll</CardTitle>
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
              <div className="h-72">
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
              <div className="h-72 flex flex-col items-center justify-center gap-3 text-center">
                <BarChart2 className="h-12 w-12 text-muted-foreground/30" />
                <p className="text-muted-foreground text-sm">Registre sessões para ver o gráfico de performance</p>
                <Link href="/sessions">
                  <Button size="sm" variant="outline" className="gap-1.5"><Plus className="h-4 w-4" /> Registrar Sessão</Button>
                </Link>
              </div>
            )}
          </CardContent>
        </Card>

        <Card className="bg-card/60 border-border/40">
          <CardHeader className="pb-3">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                <Building2 className="h-4 w-4 text-primary" />
                <CardTitle className="text-base font-semibold">Meus Clubes</CardTitle>
              </div>
              <Button size="sm" variant="outline" className="h-7 px-2 text-xs gap-1"
                onClick={() => { setEditingClub(null); setClubDialogOpen(true); }}>
                <Plus className="h-3.5 w-3.5" /> Novo
              </Button>
            </div>
            <p className="text-xs text-muted-foreground">Ordenado por bankroll alocado</p>
          </CardHeader>
          <CardContent className="space-y-2 max-h-[340px] overflow-y-auto pr-1">
            {loadingClubs ? (
              [1,2,3].map(i => <Skeleton key={i} className="h-16" />)
            ) : clubsData && clubsData.length > 0 ? (
              clubsData.map((club) => (
                <ClubCard key={club.id} club={club}
                  onEdit={() => { setEditingClub(club); setClubDialogOpen(true); }}
                  onDelete={() => { if (confirm(`Remover "${club.name}"?`)) deleteClubMutation.mutate({ id: club.id }); }} />
              ))
            ) : (
              <div className="flex flex-col items-center justify-center py-8 text-center gap-2">
                <Building2 className="h-10 w-10 text-muted-foreground/30" />
                <p className="text-sm text-muted-foreground">Nenhum clube cadastrado</p>
                <p className="text-xs text-muted-foreground/60">Adicione clubes para acompanhar seu bankroll por plataforma</p>
              </div>
            )}
          </CardContent>
        </Card>
      </div>

      <ClubDialog
        open={clubDialogOpen}
        onOpenChange={(v) => { setClubDialogOpen(v); if (!v) setEditingClub(null); }}
        initial={editingClub}
        onSave={(data) => {
          if (editingClub?.id) updateClubMutation.mutate({ id: editingClub.id, ...data });
          else createClubMutation.mutate(data);
        }}
      />
    </div>
  );
}
