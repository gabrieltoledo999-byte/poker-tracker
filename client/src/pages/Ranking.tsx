import { useMemo, useState } from "react";
import { trpc } from "@/lib/trpc";
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
  sortBy: "roi" | "winRate" | "trophyCount" | "bestSession" | "worstSession";
  onSortChange: (s: "roi" | "winRate" | "trophyCount" | "bestSession" | "worstSession") => void;
}) {
  if (isLoading) {
    return (
      <div className="space-y-2">
        {Array.from({ length: 5 }).map((_, i) => (
          <Skeleton key={i} className="h-14 w-full rounded-xl bg-white/5" />
        ))}
      </div>
    );
  }

  if (!data || data.length === 0) {
    return (
      <div className="py-12 text-center text-white/40">
        <Users className="mx-auto mb-3 h-12 w-12 opacity-30" />
        <p className="font-medium text-white/60">Nenhum jogador encontrado</p>
        <p className="mt-1 text-sm">Convide amigos para ver o ranking!</p>
      </div>
    );
  }

  const sorted = [...data].sort((a, b) => {
    if (sortBy === "roi") return b.roi - a.roi;
    if (sortBy === "winRate") return b.winRate - a.winRate;
    if (sortBy === "trophyCount") return (b.trophyCount ?? 0) - (a.trophyCount ?? 0);
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
      key: "trophyCount" as const,
      label: "Troféus",
      value: (p: any) => String(p.trophyCount ?? 0),
      colorClass: () => "text-amber-500",
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
        {(["roi", "winRate", "trophyCount", "bestSession", "worstSession"] as const).map((key) => (
          <Button
            key={key}
            size="sm"
            variant="outline"
            onClick={() => onSortChange(key)}
            className={`text-xs transition-all ${
              sortBy === key
                ? "border-cyan-400/50 bg-cyan-400/15 text-cyan-100 shadow-[0_0_0_1px_rgba(34,211,238,0.25)]"
                : "border-white/15 bg-white/5 text-white/60 hover:border-white/25 hover:bg-white/10 hover:text-white/90"
            }`}
          >
            {key === "roi" && <><Target className="h-3 w-3 mr-1" /> ROI</>}
            {key === "winRate" && <><TrendingUp className="h-3 w-3 mr-1" /> ITM Rate</>}
            {key === "trophyCount" && <><Trophy className="h-3 w-3 mr-1" /> Troféus</>}
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
            className={`tokyo-chip flex items-center gap-3 rounded-xl p-3 transition-all ${
              index < 3 ? "border-amber-400/30 bg-amber-500/5" : ""
            }`}
          >
            <div className="w-9 shrink-0 text-center text-lg font-black">
              {getMedalEmoji(index + 1)}
            </div>

            <Avatar className="h-9 w-9 shrink-0">
              <AvatarImage src={player.avatarUrl ?? undefined} />
              <AvatarFallback className="text-sm font-semibold">
                {(player.name ?? "?").slice(0, 2).toUpperCase()}
              </AvatarFallback>
            </Avatar>

            <div className="min-w-0 flex-1">
              <p className="truncate text-sm font-bold text-cyan-100">{player.name ?? "Jogador"}</p>
              <p className="text-xs text-white/50">
                {player.totalSessions} sessões · {player.totalTables ?? 0} mesas · {player.trophyCount ?? 0} troféus
              </p>
            </div>

            <div className="flex shrink-0 gap-4 text-right">
              {orderedStats.map((stat, i) => (
                <div key={stat.key} className={responsiveClasses[i]}>
                  <p className="text-[11px] text-white/45">{stat.label}</p>
                  <p className={`tokyo-data-value text-sm font-bold ${stat.colorClass(player)}`}>
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
  const [sortBy, setSortBy] = useState<"roi" | "winRate" | "trophyCount" | "bestSession" | "worstSession">("roi");
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
    <div className="tokyo-reviewer mx-auto w-full max-w-6xl space-y-4 px-2 py-3 pb-10">
      <div className="tokyo-grid-overlay" />

      {/* Header */}
      <section className="overflow-hidden rounded-3xl border border-white/10 bg-[radial-gradient(circle_at_top_left,_rgba(234,179,8,0.18),_transparent_26%),linear-gradient(135deg,_rgba(20,12,6,0.98),_rgba(34,20,10,0.95))] p-5 text-white shadow-2xl sm:p-6">
        <h1 className="flex items-center gap-2 text-2xl font-black tracking-tight sm:text-3xl">
          <Trophy className="h-6 w-6 text-amber-300" />
          Ranking
        </h1>
        <p className="mt-1 text-sm text-zinc-300">
          Compare métricas de performance com consentimento explícito.
        </p>
      </section>

      {/* Consentimento */}
      <div className={`tokyo-panel rounded-2xl p-5 ${!consentAnswered ? "border-amber-500/40" : ""}`}>
        <div className="mb-3 flex items-center gap-2">
          <ShieldAlert className="h-5 w-5 text-amber-300" />
          <p className="text-base font-semibold text-cyan-100">Consentimento de Ranking</p>
          {consentAnswered && <Badge variant="secondary" className="ml-auto text-xs">Respondido</Badge>}
        </div>
        {!consentAnswered && (
          <p className="mb-3 text-sm text-white/60">
            Você ainda não respondeu se quer participar do ranking. Nada aparece automaticamente até essa escolha ser salva.
          </p>
        )}
        <div className="flex flex-wrap gap-2">
          <Button
            type="button"
            size="sm"
            onClick={() => setShowInGlobalRanking((prev) => !prev)}
            className={`text-xs transition-all ${showInGlobalRanking ? "bg-cyan-400/20 border border-cyan-400/50 text-cyan-100" : "border border-white/15 bg-white/5 text-white/60 hover:bg-white/10 hover:text-white/90"}`}
          >
            <Globe className="mr-1 h-3 w-3" /> Global {showInGlobalRanking ? "Ativo" : "Desativado"}
          </Button>
          <Button
            type="button"
            size="sm"
            onClick={() => setShowInFriendsRanking((prev) => !prev)}
            className={`text-xs transition-all ${showInFriendsRanking ? "bg-cyan-400/20 border border-cyan-400/50 text-cyan-100" : "border border-white/15 bg-white/5 text-white/60 hover:bg-white/10 hover:text-white/90"}`}
          >
            <Users className="mr-1 h-3 w-3" /> Amigos {showInFriendsRanking ? "Ativo" : "Desativado"}
          </Button>
          <Button
            size="sm"
            onClick={handleSaveConsent}
            disabled={saveConsentMutation.isPending}
            className="bg-cyan-400 text-slate-950 hover:bg-cyan-300 text-xs"
          >
            {saveConsentMutation.isPending ? "Salvando..." : "Salvar consentimento"}
          </Button>
        </div>
      </div>

      {/* Tabs */}
      <Tabs value={activeTab} onValueChange={(v) => setActiveTab(v as "global" | "friends")}>
        <div className="overflow-x-auto pb-1">
          <TabsList className="flex min-w-max gap-1 rounded-xl border border-cyan-400/20 bg-slate-950/55 p-1">
            <TabsTrigger
              value="global"
              className="gap-2 data-[state=active]:bg-cyan-400/20 data-[state=active]:text-cyan-100 data-[state=active]:shadow-[0_0_0_1px_rgba(34,211,238,0.35)]"
            >
              <Globe className="h-4 w-4" /> Global
            </TabsTrigger>
            <TabsTrigger
              value="friends"
              className="gap-2 data-[state=active]:bg-cyan-400/20 data-[state=active]:text-cyan-100 data-[state=active]:shadow-[0_0_0_1px_rgba(34,211,238,0.35)]"
            >
              <Users className="h-4 w-4" /> Amigos
            </TabsTrigger>
          </TabsList>
        </div>

        <TabsContent value="global" className="mt-4">
          <div className="tokyo-panel rounded-2xl p-4">
            <p className="mb-4 flex items-center gap-2 text-sm font-semibold text-cyan-100">
              <Globe className="h-4 w-4" /> Ranking Global
            </p>
            <LeaderboardTable
              data={globalData ?? []}
              isLoading={loadingGlobal}
              sortBy={sortBy}
              onSortChange={setSortBy}
            />
          </div>
        </TabsContent>

        <TabsContent value="friends" className="mt-4">
          <div className="tokyo-panel rounded-2xl p-4">
            <p className="mb-4 flex items-center gap-2 text-sm font-semibold text-cyan-100">
              <Users className="h-4 w-4" /> Ranking de Amigos
            </p>
            <LeaderboardTable
              data={friendsData ?? []}
              isLoading={loadingFriends}
              sortBy={sortBy}
              onSortChange={setSortBy}
            />
          </div>
        </TabsContent>
      </Tabs>
    </div>
  );
}
