import { trpc } from "@/lib/trpc";
import { getGameFormatLabel, getGameFormatEmoji, GameFormat } from "@shared/gameFormats";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";

import { Skeleton } from "@/components/ui/skeleton";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import {
  LineChart,
  Line,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip as RechartsTooltip,
  ResponsiveContainer,
  Legend,
} from "recharts";
import {
  TrendingUp,
  TrendingDown,
  DollarSign,
  Clock,
  Target,
  Trophy,
  Skull,
  BarChart3,
  Percent,
  Plus,
  HelpCircle,
  ArrowRight,
  Pencil,
  Check,
  X,
} from "lucide-react";
import { Link } from "wouter";
import { useState } from "react";
import { Input } from "@/components/ui/input";
import { toast } from "sonner";

// Helper to format currency in BRL
function formatCurrency(centavos: number): string {
  return new Intl.NumberFormat("pt-BR", {
    style: "currency",
    currency: "BRL",
  }).format(centavos / 100);
}

// Helper to format percentage
function formatPercent(value: number): string {
  return `${value.toFixed(1)}%`;
}

// Info tooltip component
function InfoTooltip({ content }: { content: string }) {
  return (
    <Tooltip>
      <TooltipTrigger asChild>
        <HelpCircle className="h-3.5 w-3.5 text-muted-foreground/50 cursor-help" />
      </TooltipTrigger>
      <TooltipContent className="max-w-xs">
        <p className="text-sm">{content}</p>
      </TooltipContent>
    </Tooltip>
  );
}

// Stat card component with tooltip
function StatCard({
  title,
  value,
  subtitle,
  icon: Icon,
  trend,
  tooltip,
  className = "",
}: {
  title: string;
  value: string;
  subtitle?: string;
  icon: React.ElementType;
  trend?: "up" | "down" | "neutral";
  tooltip?: string;
  className?: string;
}) {
  const trendColor =
    trend === "up"
      ? "text-[oklch(0.6_0.2_145)]"
      : trend === "down"
      ? "text-[oklch(0.55_0.22_25)]"
      : "text-muted-foreground";

  return (
    <Card className={`${className}`}>
      <CardHeader className="flex flex-row items-center justify-between pb-2">
        <div className="flex items-center gap-1.5">
          <CardTitle className="text-sm font-medium text-muted-foreground">
            {title}
          </CardTitle>
          {tooltip && <InfoTooltip content={tooltip} />}
        </div>
        <Icon className={`h-4 w-4 ${trendColor}`} />
      </CardHeader>
      <CardContent>
        <div className={`text-2xl font-bold ${trendColor}`}>{value}</div>
        {subtitle && (
          <p className="text-xs text-muted-foreground mt-1">{subtitle}</p>
        )}
      </CardContent>
    </Card>
  );
}

// Bankroll card component
function BankrollCard({
  title,
  current,
  profit,
  sessions,
  type,
  onDeposit,
  onWithdraw,
}: {
  title: string;
  current: number;
  profit: number;
  sessions: number;
  type: "online" | "live" | "total";
  onDeposit?: (value: number) => void;
  onWithdraw?: (value: number) => void;
}) {
  const isPositive = profit >= 0;
  const [showInput, setShowInput] = useState<"deposit" | "withdraw" | null>(null);
  const [inputValue, setInputValue] = useState("");

  const typeColors = {
    online: "from-[oklch(0.5_0.15_250)] to-[oklch(0.4_0.12_250)]",
    live: "from-[oklch(0.55_0.18_145)] to-[oklch(0.45_0.15_145)]",
    total: "from-[oklch(0.65_0.15_85)] to-[oklch(0.55_0.12_85)]",
  };

  const handleConfirm = () => {
    const val = parseFloat(inputValue.replace(",", "."));
    if (isNaN(val) || val <= 0) { toast.error("Digite um valor válido"); return; }
    const centavos = Math.round(val * 100);
    if (showInput === "deposit") onDeposit?.(centavos);
    else onWithdraw?.(centavos);
    setShowInput(null);
    setInputValue("");
  };

  return (
    <Card className="overflow-hidden hover:shadow-lg transition-shadow">
      <div className={`h-2 bg-gradient-to-r ${typeColors[type]}`} />
      <CardHeader className="pb-2">
        <CardTitle className="text-lg flex items-center gap-2">
          {type === "online" && "🖥️"}
          {type === "live" && "🎰"}
          {type === "total" && "💰"}
          {title}
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-3">
        <p className="text-3xl font-bold">{formatCurrency(current)}</p>
        <div className="flex items-center gap-2">
          {isPositive ? (
            <TrendingUp className="h-4 w-4 text-[oklch(0.6_0.2_145)]" />
          ) : (
            <TrendingDown className="h-4 w-4 text-[oklch(0.55_0.22_25)]" />
          )}
          <span className={`text-sm font-medium ${isPositive ? "text-[oklch(0.6_0.2_145)]" : "text-[oklch(0.55_0.22_25)]"}`}>
            {isPositive ? "+" : ""}{formatCurrency(profit)} nas sessões
          </span>
        </div>
        <p className="text-xs text-muted-foreground">{sessions} sessões</p>
        {type !== "total" && (
          <>
            {showInput ? (
              <div className="flex gap-2 items-center pt-1">
                <span className="text-sm text-muted-foreground">R$</span>
                <Input
                  type="number"
                  placeholder="0,00"
                  value={inputValue}
                  onChange={(e) => setInputValue(e.target.value)}
                  onKeyDown={(e) => { if (e.key === "Enter") handleConfirm(); if (e.key === "Escape") setShowInput(null); }}
                  className="h-8 text-sm"
                  autoFocus
                />
                <Button size="sm" className="h-8 px-3 bg-[oklch(0.55_0.18_145)] hover:bg-[oklch(0.5_0.18_145)]" onClick={handleConfirm}>
                  <Check className="h-3.5 w-3.5" />
                </Button>
                <Button size="sm" variant="ghost" className="h-8 px-2" onClick={() => { setShowInput(null); setInputValue(""); }}>
                  <X className="h-3.5 w-3.5" />
                </Button>
              </div>
            ) : (
              <div className="flex gap-2 pt-1">
                <Button
                  size="sm"
                  className="flex-1 h-9 gap-1.5 bg-[oklch(0.55_0.18_145)] hover:bg-[oklch(0.5_0.18_145)] text-white font-semibold"
                  onClick={() => setShowInput("deposit")}
                >
                  <Plus className="h-4 w-4" /> Depositar
                </Button>
                <Button
                  size="sm"
                  variant="outline"
                  className="flex-1 h-9 gap-1.5 border-[oklch(0.55_0.22_25)]/50 text-[oklch(0.55_0.22_25)] hover:bg-[oklch(0.55_0.22_25)]/10 font-semibold"
                  onClick={() => setShowInput("withdraw")}
                >
                  <TrendingDown className="h-4 w-4" /> Sacar
                </Button>
              </div>
            )}
          </>
        )}
      </CardContent>
    </Card>
  );
}

// Empty state component
function EmptyState({ 
  title, 
  description, 
  actionLabel, 
  actionHref 
}: { 
  title: string; 
  description: string; 
  actionLabel: string;
  actionHref: string;
}) {
  return (
    <div className="flex flex-col items-center justify-center py-12 text-center">
      <div className="w-16 h-16 rounded-full bg-muted/50 flex items-center justify-center mb-4">
        <BarChart3 className="h-8 w-8 text-muted-foreground" />
      </div>
      <h3 className="text-lg font-medium mb-2">{title}</h3>
      <p className="text-muted-foreground mb-4 max-w-sm">{description}</p>
      <Link href={actionHref}>
        <Button>
          <Plus className="h-4 w-4 mr-2" />
          {actionLabel}
        </Button>
      </Link>
    </div>
  );
}

// Sharkscope widget component
function SharkScopeWidget() {
  const [nickname, setNickname] = useState("");
  const [network, setNetwork] = useState("PokerStars");
  const [savedNickname, setSavedNickname] = useState(() => localStorage.getItem("sharkscope_nickname") || "");
  const [savedNetwork, setSavedNetwork] = useState(() => localStorage.getItem("sharkscope_network") || "PokerStars");
  const [editing, setEditing] = useState(!localStorage.getItem("sharkscope_nickname"));

  const networks = [
    "PokerStars", "GGPoker", "888poker", "partypoker", "WPT Global",
    "KKPoker", "CoinPoker", "Winamax", "iPoker", "Bodog"
  ];

  const handleSave = () => {
    if (!nickname.trim()) { toast.error("Digite seu nickname"); return; }
    localStorage.setItem("sharkscope_nickname", nickname.trim());
    localStorage.setItem("sharkscope_network", network);
    setSavedNickname(nickname.trim());
    setSavedNetwork(network);
    setEditing(false);
    toast.success("Nickname salvo!");
  };

  const handleOpen = () => {
    const url = `https://pt.sharkscope.com/poker-statistics/networks/${encodeURIComponent(savedNetwork)}/players/${encodeURIComponent(savedNickname)}`;
    window.open(url, "_blank");
  };

  return (
    <Card className="border border-secondary/30">
      <CardHeader className="pb-3">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <span className="text-xl">🦈</span>
            <CardTitle className="text-lg">SharkScope</CardTitle>
            <InfoTooltip content="Acesse rapidamente suas estatísticas no SharkScope pelo seu nickname" />
          </div>
          {!editing && savedNickname && (
            <Button size="sm" variant="ghost" onClick={() => { setNickname(savedNickname); setNetwork(savedNetwork); setEditing(true); }}>
              <Pencil className="h-3.5 w-3.5 mr-1" /> Editar
            </Button>
          )}
        </div>
      </CardHeader>
      <CardContent>
        {editing ? (
          <div className="space-y-3">
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <div className="space-y-1">
                <label className="text-xs text-muted-foreground font-medium">Seu Nickname</label>
                <Input
                  placeholder="Ex: G_TTeixeira999"
                  value={nickname}
                  onChange={(e) => setNickname(e.target.value)}
                  onKeyDown={(e) => e.key === "Enter" && handleSave()}
                  className="h-9"
                />
              </div>
              <div className="space-y-1">
                <label className="text-xs text-muted-foreground font-medium">Rede</label>
                <select
                  value={network}
                  onChange={(e) => setNetwork(e.target.value)}
                  className="w-full h-9 rounded-md border border-input bg-background px-3 py-1 text-sm"
                >
                  {networks.map((n) => <option key={n} value={n}>{n}</option>)}
                </select>
              </div>
            </div>
            <div className="flex gap-2">
              <Button size="sm" onClick={handleSave} className="gap-1">
                <Check className="h-3.5 w-3.5" /> Salvar
              </Button>
              {savedNickname && (
                <Button size="sm" variant="outline" onClick={() => setEditing(false)}>
                  Cancelar
                </Button>
              )}
            </div>
          </div>
        ) : (
          <div className="flex items-center justify-between">
            <div className="space-y-1">
              <p className="font-semibold text-lg">{savedNickname}</p>
              <p className="text-sm text-muted-foreground">{savedNetwork}</p>
            </div>
            <Button onClick={handleOpen} className="gap-2 bg-[oklch(0.55_0.18_145)] hover:bg-[oklch(0.5_0.18_145)]">
              <Target className="h-4 w-4" />
              Ver Estatísticas
              <ArrowRight className="h-4 w-4" />
            </Button>
          </div>
        )}
      </CardContent>
    </Card>
  );
}

// Game format stats component
function GameFormatStats() {
  const { data: formatStats, isLoading } = trpc.sessions.statsByFormat.useQuery();

  if (isLoading) {
    return <Skeleton className="h-64" />;
  }

  if (!formatStats || formatStats.length === 0) {
    return null;
  }

  return (
    <Card>
      <CardHeader>
        <div className="flex items-center gap-2">
          <Target className="h-5 w-5 text-[oklch(0.7_0.15_85)]" />
          <CardTitle>Desempenho por Tipo de Jogo</CardTitle>
          <InfoTooltip content="Estatísticas separadas por cada modalidade de poker que você joga" />
        </div>
      </CardHeader>
      <CardContent>
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
          {formatStats.map((stat) => {
            const isPositive = stat.totalProfit >= 0;
            return (
              <div
                key={stat.format}
                className="p-4 rounded-lg bg-muted/50 space-y-2 hover:bg-muted/70 transition-colors"
              >
                <div className="flex items-center gap-2">
                  <span className="text-xl">
                    {getGameFormatEmoji(stat.format as GameFormat)}
                  </span>
                  <span className="font-medium">
                    {getGameFormatLabel(stat.format as GameFormat)}
                  </span>
                </div>
                <div className="grid grid-cols-2 gap-2 text-sm">
                  <div>
                    <p className="text-muted-foreground">Sessões</p>
                    <p className="font-medium">{stat.sessions}</p>
                  </div>
                  <div>
                    <p className="text-muted-foreground">Win Rate</p>
                    <p className="font-medium">{stat.winRate}%</p>
                  </div>
                  <div>
                    <p className="text-muted-foreground">Lucro Total</p>
                    <p
                      className={`font-bold ${
                        isPositive
                          ? "text-[oklch(0.6_0.2_145)]"
                          : "text-[oklch(0.55_0.22_25)]"
                      }`}
                    >
                      {isPositive ? "+" : ""}
                      {formatCurrency(stat.totalProfit)}
                    </p>
                  </div>
                  <div>
                    <p className="text-muted-foreground">R$/hora</p>
                    <p
                      className={`font-medium ${
                        stat.avgHourlyRate >= 0
                          ? "text-[oklch(0.6_0.2_145)]"
                          : "text-[oklch(0.55_0.22_25)]"
                      }`}
                    >
                      {stat.avgHourlyRate >= 0 ? "+" : ""}
                      {formatCurrency(stat.avgHourlyRate)}
                    </p>
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      </CardContent>
    </Card>
  );
}

export default function Dashboard() {

  const utils = trpc.useUtils();
  const { data: bankroll, isLoading: loadingBankroll } =
    trpc.bankroll.getCurrent.useQuery();
  const { data: stats, isLoading: loadingStats } =
    trpc.sessions.stats.useQuery({});
  const { data: history, isLoading: loadingHistory } =
    trpc.bankroll.history.useQuery({});

  const fundMutation = trpc.funds.create.useMutation({
    onSuccess: (_, vars) => {
      utils.bankroll.getCurrent.invalidate();
      utils.bankroll.history.invalidate();
      utils.funds.list.invalidate();
      const action = vars.transactionType === "deposit" ? "Depósito" : "Saque";
      toast.success(`${action} realizado com sucesso!`);
    },
    onError: () => toast.error("Erro ao processar transação"),
  });

  const handleFundTransaction = (bankrollType: "online" | "live", transactionType: "deposit" | "withdrawal", amount: number) => {
    fundMutation.mutate({
      transactionType,
      bankrollType,
      amount,
      currency: "BRL",
      transactionDate: new Date(),
    });
  };

  const isLoading = loadingBankroll || loadingStats || loadingHistory;

  if (isLoading) {
    return (
      <div className="space-y-6">
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
          {[1, 2, 3].map((i) => (
            <Skeleton key={i} className="h-40" />
          ))}
        </div>
        <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
          {[1, 2, 3, 4].map((i) => (
            <Skeleton key={i} className="h-24" />
          ))}
        </div>
        <Skeleton className="h-80" />
      </div>
    );
  }

  // Chart data formatting
  const chartData =
    history?.map((point) => ({
      date: new Date(point.date).toLocaleDateString("pt-BR", {
        day: "2-digit",
        month: "2-digit",
      }),
      fullDate: new Date(point.date).toLocaleDateString("pt-BR"),
      online: point.online / 100,
      live: point.live / 100,
      total: point.total / 100,
    })) || [];

  // Determine chart trend
  const chartTrend =
    chartData.length >= 2
      ? chartData[chartData.length - 1].total > chartData[0].total
        ? "up"
        : "down"
      : "neutral";

  const hasNoSessions = (stats?.totalSessions || 0) === 0;

  return (
    <div className="space-y-6">
      {/* Quick Action Header */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold">Dashboard</h1>
          <p className="text-muted-foreground">
            Visão geral do seu desempenho no poker
          </p>
        </div>
        <Link href="/sessions">
          <Button size="lg" className="gap-2">
            <Plus className="h-5 w-5" />
            Nova Sessão
          </Button>
        </Link>
      </div>

      {/* Bankroll Cards */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        <BankrollCard
          title="Poker Online"
          current={bankroll?.online.current || 0}
          profit={bankroll?.online.profit || 0}
          sessions={bankroll?.online.sessions || 0}
          type="online"
          onDeposit={(val) => handleFundTransaction("online", "deposit", val)}
          onWithdraw={(val) => handleFundTransaction("online", "withdrawal", val)}
        />
        <BankrollCard
          title="Poker Live"
          current={bankroll?.live.current || 0}
          profit={bankroll?.live.profit || 0}
          sessions={bankroll?.live.sessions || 0}
          type="live"
          onDeposit={(val) => handleFundTransaction("live", "deposit", val)}
          onWithdraw={(val) => handleFundTransaction("live", "withdrawal", val)}
        />
        <BankrollCard
          title="Total"
          current={bankroll?.total.current || 0}
          profit={bankroll?.total.profit || 0}
          sessions={bankroll?.total.sessions || 0}
          type="total"
        />
      </div>

      {/* Stats Grid */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        <StatCard
          title="Total de Sessões"
          value={String(stats?.totalSessions || 0)}
          icon={BarChart3}
          trend="neutral"
          tooltip="Número total de sessões de poker registradas"
        />
        <StatCard
          title="Win Rate"
          value={formatPercent(stats?.winRate || 0)}
          subtitle={`${stats?.winningSessions || 0} vitórias / ${
            stats?.losingSessions || 0
          } derrotas`}
          icon={Percent}
          trend={
            (stats?.winRate || 0) >= 50
              ? "up"
              : (stats?.winRate || 0) > 0
              ? "down"
              : "neutral"
          }
          tooltip="Porcentagem de sessões com lucro. Acima de 50% indica mais vitórias que derrotas"
        />
        <StatCard
          title="Média por Sessão"
          value={formatCurrency(stats?.avgProfit || 0)}
          icon={DollarSign}
          trend={(stats?.avgProfit || 0) >= 0 ? "up" : "down"}
          tooltip="Lucro médio por sessão. Valor positivo indica que você está lucrando em média"
        />
        <StatCard
          title="Taxa Horária"
          value={formatCurrency(stats?.avgHourlyRate || 0)}
          subtitle="por hora"
          icon={Clock}
          trend={(stats?.avgHourlyRate || 0) >= 0 ? "up" : "down"}
          tooltip="Quanto você ganha (ou perde) por hora jogada. Métrica importante para avaliar sua eficiência"
        />
      </div>

      {/* Best/Worst Sessions */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        <Card className="hover:shadow-lg transition-shadow">
          <CardHeader className="flex flex-row items-center gap-2 pb-2">
            <Trophy className="h-5 w-5 text-[oklch(0.7_0.15_85)]" />
            <CardTitle className="text-lg">Melhor Sessão</CardTitle>
          </CardHeader>
          <CardContent>
            {stats?.bestSession ? (
              <div className="space-y-2">
                <p className="text-2xl font-bold text-[oklch(0.6_0.2_145)]">
                  +{formatCurrency(stats.bestSession.cashOut - stats.bestSession.buyIn)}
                </p>
                <p className="text-sm text-muted-foreground">
                  {new Date(stats.bestSession.sessionDate).toLocaleDateString("pt-BR")} •{" "}
                  {stats.bestSession.type === "online" ? "Online" : "Live"}
                </p>
                <Link href="/sessions" className="inline-flex items-center text-sm text-primary hover:underline">
                  Ver detalhes <ArrowRight className="h-3 w-3 ml-1" />
                </Link>
              </div>
            ) : (
              <div className="py-4 text-center">
                <p className="text-muted-foreground mb-2">Nenhuma sessão registrada</p>
                <Link href="/sessions">
                  <Button variant="outline" size="sm">
                    <Plus className="h-4 w-4 mr-1" />
                    Registrar primeira sessão
                  </Button>
                </Link>
              </div>
            )}
          </CardContent>
        </Card>

        <Card className="hover:shadow-lg transition-shadow">
          <CardHeader className="flex flex-row items-center gap-2 pb-2">
            <Skull className="h-5 w-5 text-[oklch(0.55_0.22_25)]" />
            <CardTitle className="text-lg">Pior Sessão</CardTitle>
          </CardHeader>
          <CardContent>
            {stats?.worstSession ? (
              <div className="space-y-2">
                <p className="text-2xl font-bold text-[oklch(0.55_0.22_25)]">
                  {formatCurrency(stats.worstSession.cashOut - stats.worstSession.buyIn)}
                </p>
                <p className="text-sm text-muted-foreground">
                  {new Date(stats.worstSession.sessionDate).toLocaleDateString("pt-BR")} •{" "}
                  {stats.worstSession.type === "online" ? "Online" : "Live"}
                </p>
                <Link href="/sessions" className="inline-flex items-center text-sm text-primary hover:underline">
                  Ver detalhes <ArrowRight className="h-3 w-3 ml-1" />
                </Link>
              </div>
            ) : (
              <div className="py-4 text-center">
                <p className="text-muted-foreground">Nenhuma sessão registrada</p>
              </div>
            )}
          </CardContent>
        </Card>
      </div>

      {/* Sharkscope Quick Access */}
      <SharkScopeWidget />

      {/* Stats by Game Format */}
      <GameFormatStats />

      {/* Bankroll Evolution Charts - Separated */}
      <div className="space-y-6">
        <h2 className="text-xl font-bold flex items-center gap-2">
          <BarChart3 className="h-5 w-5" />
          Evolução do Bankroll
        </h2>
        
        {/* Online Chart */}
        <Card className="border-l-4 border-l-[oklch(0.5_0.15_250)]">
          <CardHeader className="pb-2">
            <div className="flex items-center gap-2">
              <span className="text-xl">💻</span>
              <CardTitle className="text-lg">Poker Online</CardTitle>
              <InfoTooltip content="Evolução do seu bankroll nas sessões online" />
            </div>
          </CardHeader>
          <CardContent>
            {chartData.length > 1 ? (
              <div className="h-64">
                <ResponsiveContainer width="100%" height="100%">
                  <LineChart data={chartData}>
                    <CartesianGrid strokeDasharray="3 3" stroke="oklch(0.28 0.03 150)" />
                    <XAxis dataKey="date" stroke="oklch(0.6 0.01 90)" fontSize={12} />
                    <YAxis
                      stroke="oklch(0.6 0.01 90)"
                      fontSize={12}
                      tickFormatter={(v) => new Intl.NumberFormat("pt-BR", { notation: "compact", compactDisplay: "short" }).format(v)}
                    />
                    <RechartsTooltip
                      contentStyle={{ backgroundColor: "oklch(0.16 0.015 150)", border: "1px solid oklch(0.28 0.03 150)", borderRadius: "8px" }}
                      labelStyle={{ color: "oklch(0.92 0.01 90)" }}
                      formatter={(value: number) => [formatCurrency(value * 100), "Online"]}
                      labelFormatter={(label) => `Data: ${label}`}
                    />
                    <Line type="monotone" dataKey="online" name="Online" stroke="oklch(0.5 0.15 250)" strokeWidth={3} dot={{ fill: "oklch(0.5 0.15 250)", r: 3 }} activeDot={{ r: 6 }} />
                  </LineChart>
                </ResponsiveContainer>
              </div>
            ) : hasNoSessions ? (
              <div className="h-40 flex items-center justify-center">
                <p className="text-muted-foreground">Registre sessões online para ver o gráfico</p>
              </div>
            ) : (
              <div className="h-40 flex items-center justify-center">
                <p className="text-muted-foreground">Registre mais sessões para ver o gráfico</p>
              </div>
            )}
          </CardContent>
        </Card>

        {/* Live Chart */}
        <Card className="border-l-4 border-l-[oklch(0.55_0.18_145)]">
          <CardHeader className="pb-2">
            <div className="flex items-center gap-2">
              <span className="text-xl">🎰</span>
              <CardTitle className="text-lg">Poker Live</CardTitle>
              <InfoTooltip content="Evolução do seu bankroll nas sessões presenciais" />
            </div>
          </CardHeader>
          <CardContent>
            {chartData.length > 1 ? (
              <div className="h-64">
                <ResponsiveContainer width="100%" height="100%">
                  <LineChart data={chartData}>
                    <CartesianGrid strokeDasharray="3 3" stroke="oklch(0.28 0.03 150)" />
                    <XAxis dataKey="date" stroke="oklch(0.6 0.01 90)" fontSize={12} />
                    <YAxis
                      stroke="oklch(0.6 0.01 90)"
                      fontSize={12}
                      tickFormatter={(v) => new Intl.NumberFormat("pt-BR", { notation: "compact", compactDisplay: "short" }).format(v)}
                    />
                    <RechartsTooltip
                      contentStyle={{ backgroundColor: "oklch(0.16 0.015 150)", border: "1px solid oklch(0.28 0.03 150)", borderRadius: "8px" }}
                      labelStyle={{ color: "oklch(0.92 0.01 90)" }}
                      formatter={(value: number) => [formatCurrency(value * 100), "Live"]}
                      labelFormatter={(label) => `Data: ${label}`}
                    />
                    <Line type="monotone" dataKey="live" name="Live" stroke="oklch(0.55 0.18 145)" strokeWidth={3} dot={{ fill: "oklch(0.55 0.18 145)", r: 3 }} activeDot={{ r: 6 }} />
                  </LineChart>
                </ResponsiveContainer>
              </div>
            ) : hasNoSessions ? (
              <div className="h-40 flex items-center justify-center">
                <p className="text-muted-foreground">Registre sessões live para ver o gráfico</p>
              </div>
            ) : (
              <div className="h-40 flex items-center justify-center">
                <p className="text-muted-foreground">Registre mais sessões para ver o gráfico</p>
              </div>
            )}
          </CardContent>
        </Card>

        {/* Total Chart */}
        <Card className="border-l-4 border-l-[oklch(0.7_0.15_85)]">
          <CardHeader className="pb-2">
            <div className="flex items-center gap-2">
              <span className="text-xl">💰</span>
              <CardTitle className="text-lg">Bankroll Total</CardTitle>
              <InfoTooltip content="Evolução do seu bankroll total (online + live)" />
            </div>
          </CardHeader>
          <CardContent>
            {chartData.length > 1 ? (
              <div className="h-72">
                <ResponsiveContainer width="100%" height="100%">
                  <LineChart data={chartData}>
                    <CartesianGrid strokeDasharray="3 3" stroke="oklch(0.28 0.03 150)" />
                    <XAxis dataKey="date" stroke="oklch(0.6 0.01 90)" fontSize={12} />
                    <YAxis
                      stroke="oklch(0.6 0.01 90)"
                      fontSize={12}
                      tickFormatter={(v) => new Intl.NumberFormat("pt-BR", { notation: "compact", compactDisplay: "short" }).format(v)}
                    />
                    <RechartsTooltip
                      contentStyle={{ backgroundColor: "oklch(0.16 0.015 150)", border: "1px solid oklch(0.28 0.03 150)", borderRadius: "8px" }}
                      labelStyle={{ color: "oklch(0.92 0.01 90)" }}
                      formatter={(value: number) => [formatCurrency(value * 100), "Total"]}
                      labelFormatter={(label) => `Data: ${label}`}
                    />
                    <Line type="monotone" dataKey="total" name="Total" stroke="oklch(0.7 0.15 85)" strokeWidth={4} dot={{ fill: "oklch(0.7 0.15 85)", r: 4 }} activeDot={{ r: 8 }} />
                  </LineChart>
                </ResponsiveContainer>
              </div>
            ) : hasNoSessions ? (
              <EmptyState
                title="Nenhuma sessão registrada"
                description="Registre sua primeira sessão de poker para começar a acompanhar a evolução do seu bankroll"
                actionLabel="Registrar Sessão"
                actionHref="/sessions"
              />
            ) : (
              <div className="h-40 flex items-center justify-center">
                <p className="text-muted-foreground">Registre mais sessões para ver o gráfico</p>
              </div>
            )}
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
