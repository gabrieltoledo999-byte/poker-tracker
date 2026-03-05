import { useState } from "react";
import { trpc } from "@/lib/trpc";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Trophy, TrendingUp, Target, DollarSign, Users, Globe } from "lucide-react";

function formatCurrency(centavos: number): string {
  return new Intl.NumberFormat("pt-BR", {
    style: "currency",
    currency: "BRL",
  }).format(centavos / 100);
}

function formatPercent(value: number): string {
  return `${value.toFixed(1)}%`;
}

function getMedalEmoji(position: number): string {
  if (position === 1) return "🥇";
  if (position === 2) return "🥈";
  if (position === 3) return "🥉";
  return `#${position}`;
}

function LeaderboardTable({
  data,
  isLoading,
  sortBy,
  onSortChange,
}: {
  data: any[];
  isLoading: boolean;
  sortBy: "roi" | "winRate" | "bestSession" | "totalProfit";
  onSortChange: (s: "roi" | "winRate" | "bestSession" | "totalProfit") => void;
}) {
  if (isLoading) {
    return (
      <div className="space-y-3">
        {Array.from({ length: 5 }).map((_, i) => (
          <Skeleton key={i} className="h-16 w-full" />
        ))}
      </div>
    );
  }

  if (!data || data.length === 0) {
    return (
      <div className="text-center py-12 text-muted-foreground">
        <Users className="h-12 w-12 mx-auto mb-3 opacity-40" />
        <p className="font-medium">Nenhum jogador encontrado</p>
        <p className="text-sm mt-1">Convide amigos para ver o ranking!</p>
      </div>
    );
  }

  const sorted = [...data].sort((a, b) => {
    if (sortBy === "roi") return b.roi - a.roi;
    if (sortBy === "winRate") return b.winRate - a.winRate;
    if (sortBy === "bestSession") return b.bestSession - a.bestSession;
    return b.totalProfit - a.totalProfit;
  });

  return (
    <div className="space-y-2">
      {/* Sort buttons */}
      <div className="flex flex-wrap gap-2 mb-4">
        {(["roi", "winRate", "bestSession", "totalProfit"] as const).map((key) => (
          <Button
            key={key}
            size="sm"
            variant={sortBy === key ? "default" : "outline"}
            onClick={() => onSortChange(key)}
            className="text-xs"
          >
            {key === "roi" && <><Target className="h-3 w-3 mr-1" /> ROI</>}
            {key === "winRate" && <><TrendingUp className="h-3 w-3 mr-1" /> Win Rate</>}
            {key === "bestSession" && <><Trophy className="h-3 w-3 mr-1" /> Maior Torneio</>}
            {key === "totalProfit" && <><DollarSign className="h-3 w-3 mr-1" /> Lucro Total</>}
          </Button>
        ))}
      </div>

      {sorted.map((player, index) => (
        <div
          key={player.userId}
          className={`flex items-center gap-4 p-4 rounded-lg border transition-colors ${
            index < 3
              ? "border-primary/30 bg-primary/5"
              : "border-border bg-muted/20"
          }`}
        >
          {/* Position */}
          <div className="w-10 text-center font-bold text-lg shrink-0">
            {getMedalEmoji(index + 1)}
          </div>

          {/* Avatar + Name */}
          <Avatar className="h-10 w-10 shrink-0">
            <AvatarImage src={player.avatarUrl ?? undefined} />
            <AvatarFallback className="text-sm font-semibold">
              {(player.name ?? "?").slice(0, 2).toUpperCase()}
            </AvatarFallback>
          </Avatar>
          <div className="flex-1 min-w-0">
            <p className="font-semibold truncate">{player.name ?? "Jogador"}</p>
            <p className="text-xs text-muted-foreground">{player.totalSessions} sessões</p>
          </div>

          {/* Stats */}
          <div className="flex gap-4 shrink-0 text-right">
            <div className="hidden sm:block">
              <p className="text-xs text-muted-foreground">ROI</p>
              <p className={`font-bold text-sm ${player.roi >= 0 ? "text-chart-1" : "text-destructive"}`}>
                {formatPercent(player.roi)}
              </p>
            </div>
            <div className="hidden md:block">
              <p className="text-xs text-muted-foreground">Win Rate</p>
              <p className="font-bold text-sm">{formatPercent(player.winRate)}</p>
            </div>
            <div className="hidden lg:block">
              <p className="text-xs text-muted-foreground">Melhor</p>
              <p className="font-bold text-sm text-chart-1">{formatCurrency(player.bestSession)}</p>
            </div>
            <div>
              <p className="text-xs text-muted-foreground">Lucro</p>
              <p className={`font-bold text-sm ${player.totalProfit >= 0 ? "text-chart-1" : "text-destructive"}`}>
                {formatCurrency(player.totalProfit)}
              </p>
            </div>
          </div>
        </div>
      ))}
    </div>
  );
}

export default function Ranking() {
  const [sortBy, setSortBy] = useState<"roi" | "winRate" | "bestSession" | "totalProfit">("roi");

  const { data: globalData, isLoading: loadingGlobal } = trpc.ranking.leaderboard.useQuery(
    { friendsOnly: false }
  );
  const { data: friendsData, isLoading: loadingFriends } = trpc.ranking.leaderboard.useQuery(
    { friendsOnly: true }
  );

  return (
    <div className="space-y-6">
      {/* Header */}
      <div>
        <h1 className="text-2xl font-bold flex items-center gap-2">
          <Trophy className="h-6 w-6 text-primary" />
          Ranking
        </h1>
        <p className="text-muted-foreground">
          Veja quem está dominando as mesas — ROI, Win Rate, maior torneio e lucro total
        </p>
      </div>

      <Tabs defaultValue="global">
        <TabsList className="mb-4">
          <TabsTrigger value="global" className="gap-2">
            <Globe className="h-4 w-4" /> Global
          </TabsTrigger>
          <TabsTrigger value="friends" className="gap-2">
            <Users className="h-4 w-4" /> Amigos
          </TabsTrigger>
        </TabsList>

        <TabsContent value="global">
          <Card>
            <CardHeader>
              <CardTitle className="text-lg flex items-center gap-2">
                <Globe className="h-5 w-5" /> Ranking Global
              </CardTitle>
            </CardHeader>
            <CardContent>
              <LeaderboardTable
                data={globalData ?? []}
                isLoading={loadingGlobal}
                sortBy={sortBy}
                onSortChange={setSortBy}
              />
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="friends">
          <Card>
            <CardHeader>
              <CardTitle className="text-lg flex items-center gap-2">
                <Users className="h-5 w-5" /> Ranking de Amigos
              </CardTitle>
            </CardHeader>
            <CardContent>
              <LeaderboardTable
                data={friendsData ?? []}
                isLoading={loadingFriends}
                sortBy={sortBy}
                onSortChange={setSortBy}
              />
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>
    </div>
  );
}
