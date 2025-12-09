import { trpc } from "@/lib/trpc";
import { getGameFormatLabel, getGameFormatEmoji, GameFormat } from "@shared/gameFormats";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Skeleton } from "@/components/ui/skeleton";
import {
  LineChart,
  Line,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
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
} from "lucide-react";
import { useState } from "react";

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

// Helper to format duration
function formatDuration(minutes: number): string {
  const hours = Math.floor(minutes / 60);
  const mins = minutes % 60;
  if (hours === 0) return `${mins}min`;
  return `${hours}h ${mins}min`;
}

// Stat card component
function StatCard({
  title,
  value,
  subtitle,
  icon: Icon,
  trend,
  className = "",
}: {
  title: string;
  value: string;
  subtitle?: string;
  icon: React.ElementType;
  trend?: "up" | "down" | "neutral";
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
        <CardTitle className="text-sm font-medium text-muted-foreground">
          {title}
        </CardTitle>
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
  initial,
  profit,
  sessions,
  type,
}: {
  title: string;
  current: number;
  initial: number;
  profit: number;
  sessions: number;
  type: "online" | "live" | "total";
}) {
  const isPositive = profit >= 0;
  const percentChange = initial > 0 ? ((profit / initial) * 100) : 0;

  const typeColors = {
    online: "from-[oklch(0.5_0.15_250)] to-[oklch(0.4_0.12_250)]",
    live: "from-[oklch(0.55_0.18_145)] to-[oklch(0.45_0.15_145)]",
    total: "from-[oklch(0.65_0.15_85)] to-[oklch(0.55_0.12_85)]",
  };

  return (
    <Card className="overflow-hidden">
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
        <div>
          <p className="text-3xl font-bold">{formatCurrency(current)}</p>
          <p className="text-xs text-muted-foreground">
            Inicial: {formatCurrency(initial)}
          </p>
        </div>
        <div className="flex items-center gap-2">
          {isPositive ? (
            <TrendingUp className="h-4 w-4 text-[oklch(0.6_0.2_145)]" />
          ) : (
            <TrendingDown className="h-4 w-4 text-[oklch(0.55_0.22_25)]" />
          )}
          <span
            className={`text-sm font-medium ${
              isPositive
                ? "text-[oklch(0.6_0.2_145)]"
                : "text-[oklch(0.55_0.22_25)]"
            }`}
          >
            {isPositive ? "+" : ""}
            {formatCurrency(profit)} ({formatPercent(percentChange)})
          </span>
        </div>
        <p className="text-xs text-muted-foreground">{sessions} sessões</p>
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
        <CardTitle className="flex items-center gap-2">
          <Target className="h-5 w-5 text-[oklch(0.7_0.15_85)]" />
          Desempenho por Tipo de Jogo
        </CardTitle>
      </CardHeader>
      <CardContent>
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
          {formatStats.map((stat) => {
            const isPositive = stat.totalProfit >= 0;
            return (
              <div
                key={stat.format}
                className="p-4 rounded-lg bg-muted/50 space-y-2"
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
  const [chartFilter, setChartFilter] = useState<"all" | "online" | "live">("all");

  const { data: bankroll, isLoading: loadingBankroll } =
    trpc.bankroll.getCurrent.useQuery();
  const { data: stats, isLoading: loadingStats } =
    trpc.sessions.stats.useQuery({});
  const { data: onlineStats } = trpc.sessions.stats.useQuery({ type: "online" });
  const { data: liveStats } = trpc.sessions.stats.useQuery({ type: "live" });
  const { data: history, isLoading: loadingHistory } =
    trpc.bankroll.history.useQuery(
      chartFilter === "all" ? {} : { type: chartFilter }
    );

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

  return (
    <div className="space-y-6">
      {/* Bankroll Cards */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        <BankrollCard
          title="Poker Online"
          current={bankroll?.online.current || 0}
          initial={bankroll?.online.initial || 100000}
          profit={bankroll?.online.profit || 0}
          sessions={bankroll?.online.sessions || 0}
          type="online"
        />
        <BankrollCard
          title="Poker Live"
          current={bankroll?.live.current || 0}
          initial={bankroll?.live.initial || 400000}
          profit={bankroll?.live.profit || 0}
          sessions={bankroll?.live.sessions || 0}
          type="live"
        />
        <BankrollCard
          title="Total"
          current={bankroll?.total.current || 0}
          initial={bankroll?.total.initial || 500000}
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
        />
        <StatCard
          title="Média por Sessão"
          value={formatCurrency(stats?.avgProfit || 0)}
          icon={DollarSign}
          trend={(stats?.avgProfit || 0) >= 0 ? "up" : "down"}
        />
        <StatCard
          title="Taxa Horária"
          value={formatCurrency(stats?.avgHourlyRate || 0)}
          subtitle="por hora"
          icon={Clock}
          trend={(stats?.avgHourlyRate || 0) >= 0 ? "up" : "down"}
        />
      </div>

      {/* Best/Worst Sessions */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        <Card>
          <CardHeader className="flex flex-row items-center gap-2 pb-2">
            <Trophy className="h-5 w-5 text-[oklch(0.7_0.15_85)]" />
            <CardTitle className="text-lg">Melhor Sessão</CardTitle>
          </CardHeader>
          <CardContent>
            {stats?.bestSession ? (
              <div className="space-y-1">
                <p className="text-2xl font-bold text-[oklch(0.6_0.2_145)]">
                  +{formatCurrency(stats.bestSession.cashOut - stats.bestSession.buyIn)}
                </p>
                <p className="text-sm text-muted-foreground">
                  {new Date(stats.bestSession.sessionDate).toLocaleDateString("pt-BR")} •{" "}
                  {stats.bestSession.type === "online" ? "Online" : "Live"}
                </p>
              </div>
            ) : (
              <p className="text-muted-foreground">Nenhuma sessão registrada</p>
            )}
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex flex-row items-center gap-2 pb-2">
            <Skull className="h-5 w-5 text-[oklch(0.55_0.22_25)]" />
            <CardTitle className="text-lg">Pior Sessão</CardTitle>
          </CardHeader>
          <CardContent>
            {stats?.worstSession ? (
              <div className="space-y-1">
                <p className="text-2xl font-bold text-[oklch(0.55_0.22_25)]">
                  {formatCurrency(stats.worstSession.cashOut - stats.worstSession.buyIn)}
                </p>
                <p className="text-sm text-muted-foreground">
                  {new Date(stats.worstSession.sessionDate).toLocaleDateString("pt-BR")} •{" "}
                  {stats.worstSession.type === "online" ? "Online" : "Live"}
                </p>
              </div>
            ) : (
              <p className="text-muted-foreground">Nenhuma sessão registrada</p>
            )}
          </CardContent>
        </Card>
      </div>

      {/* Stats by Game Format */}
      <GameFormatStats />

      {/* Bankroll Evolution Chart */}
      <Card>
        <CardHeader>
          <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
            <CardTitle className="flex items-center gap-2">
              {chartTrend === "up" ? (
                <TrendingUp className="h-5 w-5 text-[oklch(0.6_0.2_145)]" />
              ) : (
                <TrendingDown className="h-5 w-5 text-[oklch(0.55_0.22_25)]" />
              )}
              Evolução do Bankroll
            </CardTitle>
            <Tabs
              value={chartFilter}
              onValueChange={(v) => setChartFilter(v as typeof chartFilter)}
            >
              <TabsList>
                <TabsTrigger value="all">Todos</TabsTrigger>
                <TabsTrigger value="online">Online</TabsTrigger>
                <TabsTrigger value="live">Live</TabsTrigger>
              </TabsList>
            </Tabs>
          </div>
        </CardHeader>
        <CardContent>
          {chartData.length > 1 ? (
            <div className="h-80">
              <ResponsiveContainer width="100%" height="100%">
                <LineChart data={chartData}>
                  <CartesianGrid
                    strokeDasharray="3 3"
                    stroke="oklch(0.28 0.03 150)"
                  />
                  <XAxis
                    dataKey="date"
                    stroke="oklch(0.6 0.01 90)"
                    fontSize={12}
                  />
                  <YAxis
                    stroke="oklch(0.6 0.01 90)"
                    fontSize={12}
                    tickFormatter={(v) =>
                      new Intl.NumberFormat("pt-BR", {
                        notation: "compact",
                        compactDisplay: "short",
                      }).format(v)
                    }
                  />
                  <Tooltip
                    contentStyle={{
                      backgroundColor: "oklch(0.16 0.015 150)",
                      border: "1px solid oklch(0.28 0.03 150)",
                      borderRadius: "8px",
                    }}
                    labelStyle={{ color: "oklch(0.92 0.01 90)" }}
                    formatter={(value: number) => [
                      formatCurrency(value * 100),
                      "",
                    ]}
                    labelFormatter={(label) => `Data: ${label}`}
                  />
                  <Legend />
                  {(chartFilter === "all" || chartFilter === "online") && (
                    <Line
                      type="monotone"
                      dataKey="online"
                      name="Online"
                      stroke="oklch(0.5 0.15 250)"
                      strokeWidth={2}
                      dot={false}
                    />
                  )}
                  {(chartFilter === "all" || chartFilter === "live") && (
                    <Line
                      type="monotone"
                      dataKey="live"
                      name="Live"
                      stroke="oklch(0.55 0.18 145)"
                      strokeWidth={2}
                      dot={false}
                    />
                  )}
                  {chartFilter === "all" && (
                    <Line
                      type="monotone"
                      dataKey="total"
                      name="Total"
                      stroke="oklch(0.7 0.15 85)"
                      strokeWidth={3}
                      dot={false}
                    />
                  )}
                </LineChart>
              </ResponsiveContainer>
            </div>
          ) : (
            <div className="h-80 flex items-center justify-center">
              <p className="text-muted-foreground">
                Registre sessões para ver o gráfico de evolução
              </p>
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
