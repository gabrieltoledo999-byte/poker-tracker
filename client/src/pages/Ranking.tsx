import { useMemo, useState } from "react";
import { trpc } from "@/lib/trpc";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Skeleton } from "@/components/ui/skeleton";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { trpc as trpcClient } from "@/lib/trpc";
import { Globe, ShieldAlert, Trophy, TrendingUp, Target, Users } from "lucide-react";

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
  sortBy: "roi" | "winRate" | "bestSession" | "worstSession";
  onSortChange: (s: "roi" | "winRate" | "bestSession" | "worstSession") => void;
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
    return b.worstSession - a.worstSession; // maior (menos negativo) = melhor colocação
  });

  const statsConfig = [
    {
      key: "roi" as const,
      label: "ROI",
      value: (p: any) => formatPercent(p.roi),
      colorClass: (p: any) => p.roi >= 0 ? "text-chart-1" : "text-destructive",
    },
    {
      key: "winRate" as const,
      label: "ITM Rate",
      value: (p: any) => formatPercent(p.winRate),
      colorClass: () => "",
    },
    {
      key: "bestSession" as const,
      label: "Melhor",
      value: (p: any) => formatCurrency(p.bestSession),
      colorClass: () => "text-chart-1",
    },
    {
      key: "worstSession" as const,
      label: "Pior",
      value: (p: any) => formatCurrency(p.worstSession),
      colorClass: () => "text-destructive",
    },
  ];

  const responsiveClasses = ["", "hidden sm:block", "hidden md:block", "hidden lg:block"];

  return (
    <div className="space-y-2">
      {/* Sort buttons */}
      <div className="flex flex-wrap gap-2 mb-4">
        {(["roi", "winRate", "bestSession", "worstSession"] as const).map((key) => (
          <Button
            key={key}
            size="sm"
            variant={sortBy === key ? "default" : "outline"}
            onClick={() => onSortChange(key)}
            className="text-xs"
          >
            {key === "roi" && <><Target className="h-3 w-3 mr-1" /> ROI</>}
            {key === "winRate" && <><TrendingUp className="h-3 w-3 mr-1" /> ITM Rate</>}
            {key === "bestSession" && <><Trophy className="h-3 w-3 mr-1" /> Melhor Sessão</>}
            {key === "worstSession" && <><Trophy className="h-3 w-3 mr-1" /> Pior Sessão</>}
          </Button>
        ))}
      </div>

      {sorted.map((player, index) => {
        const orderedStats = [
          statsConfig.find(s => s.key === sortBy)!,
          ...statsConfig.filter(s => s.key !== sortBy),
        ];

        return (
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
              <p className="text-xs text-muted-foreground">
                {player.totalSessions} sessões • {player.totalTables ?? 0} mesas
              </p>
            </div>

            {/* Stats — reordered so active sort is always first/visible */}
            <div className="flex gap-4 shrink-0 text-right">
              {orderedStats.map((stat, i) => (
                <div key={stat.key} className={responsiveClasses[i]}>
                  <p className="text-xs text-muted-foreground">{stat.label}</p>
                  <p className={`font-bold text-sm ${stat.colorClass(player)}`}>
                    {stat.value(player)}
                  </p>
                </div>
              ))}
            </div>
          </div>
        );
      })}
    </div>
  );
}

export default function Ranking() {
  const utils = trpcClient.useUtils();
  const [sortBy, setSortBy] = useState<"roi" | "winRate" | "bestSession" | "worstSession">("roi");
  const [showInGlobalRanking, setShowInGlobalRanking] = useState(false);
  const [showInFriendsRanking, setShowInFriendsRanking] = useState(false);
  const [activeTab, setActiveTab] = useState<"global" | "friends">("global");

  const { data: globalData, isLoading: loadingGlobal } = trpc.ranking.leaderboard.useQuery(
    { friendsOnly: false }
  );
  const { data: friendsData, isLoading: loadingFriends } = trpc.ranking.leaderboard.useQuery(
    { friendsOnly: true }
  );
  const { data: onboardingProfile } = trpc.sessions.getOnboardingProfile.useQuery();

  const saveConsentMutation = trpc.sessions.saveOnboardingProfile.useMutation({
    onSuccess: async () => {
      await Promise.all([
        utils.sessions.getOnboardingProfile.invalidate(),
        utils.ranking.leaderboard.invalidate(),
      ]);
    },
  });


  const consentAnswered = Boolean(onboardingProfile?.rankingConsentAnsweredAt);

  useMemo(() => {
    if (!onboardingProfile) return;
    const globalOn = Boolean(onboardingProfile.showInGlobalRanking);
    const friendsOn = Boolean(onboardingProfile.showInFriendsRanking);
    setShowInGlobalRanking(globalOn);
    setShowInFriendsRanking(friendsOn);
    if (!globalOn && friendsOn) setActiveTab("friends");
    else setActiveTab("global");
  }, [onboardingProfile]);

  const handleSaveConsent = () => {
    const preferredPlayType = onboardingProfile?.preferredPlayType === "live" ? "live" : "online";
    saveConsentMutation.mutate({
      preferredPlayType,
      preferredPlatforms: onboardingProfile?.preferredPlatforms ?? [],
      preferredFormats: onboardingProfile?.preferredFormats ?? [],
      preferredBuyIns: onboardingProfile?.preferredBuyIns ?? [],
      preferredBuyInsOnline: onboardingProfile?.preferredBuyInsOnline ?? [],
      preferredBuyInsLive: onboardingProfile?.preferredBuyInsLive ?? [],
      playsMultiPlatform: onboardingProfile?.playsMultiPlatform ?? false,
      showInGlobalRanking,
      showInFriendsRanking,
    });
  };

  return (
    <div className="mx-auto max-w-6xl space-y-5">
      {/* Header */}
      <div>
        <h1 className="text-2xl font-bold flex items-center gap-2">
          <Trophy className="h-6 w-6 text-primary" />
          Ranking
        </h1>
        <p className="text-muted-foreground">
          Compare apenas métricas de performance com consentimento explícito: ROI, ITM Rate, melhor sessão e pior sessão.
        </p>
      </div>

      <div className="grid gap-4">
      <Card className={!consentAnswered ? "border-amber-500/40 bg-amber-50/40" : undefined}>
        <CardHeader className="pb-3">
          <CardTitle className="text-lg flex items-center gap-2">
            <ShieldAlert className="h-5 w-5" /> Consentimento de Ranking
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-3">
          {!consentAnswered && (
            <p className="text-sm text-muted-foreground">
              Você ainda não respondeu se quer participar do ranking. Nada deve aparecer automaticamente até essa escolha ser salva.
            </p>
          )}
          <div className="flex flex-wrap gap-2">
            <Button type="button" variant={showInGlobalRanking ? "default" : "outline"} onClick={() => setShowInGlobalRanking((prev) => !prev)}>
              Global {showInGlobalRanking ? "Ativo" : "Desativado"}
            </Button>
            <Button type="button" variant={showInFriendsRanking ? "default" : "outline"} onClick={() => setShowInFriendsRanking((prev) => !prev)}>
              Amigos {showInFriendsRanking ? "Ativo" : "Desativado"}
            </Button>
          </div>
          <div className="flex items-center gap-2">
            <Button onClick={handleSaveConsent} disabled={saveConsentMutation.isPending}>
              {saveConsentMutation.isPending ? "Salvando..." : "Salvar consentimento"}
            </Button>
            {consentAnswered && (
              <Badge variant="secondary">Respondido</Badge>
            )}
          </div>
        </CardContent>
      </Card>
      </div>

      <Tabs value={activeTab} onValueChange={(v) => setActiveTab(v as "global" | "friends")}>
        <TabsList className="mb-4 h-auto flex-wrap justify-start gap-1 bg-transparent p-0">
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
