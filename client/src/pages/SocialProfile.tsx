import { useMemo, useState } from "react";
import { useLocation, useRoute } from "wouter";
import { useAuth } from "@/_core/hooks/useAuth";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { OnlinePresenceDot, OnlinePresenceLabel } from "@/components/OnlinePresence";
import { trpc } from "@/lib/trpc";
import { buildProfilePath, parseProfileIdFromUsername } from "@/lib/socialProfile";
import { Activity, ArrowLeft, Check, Globe, Hand, MessageCircle, UserPlus, Users, X } from "lucide-react";
import { toast } from "sonner";

type ProfileTab = "posts" | "results" | "hands" | "stats";

function getInitials(name: string | null | undefined): string {
  if (!name) return "?";
  return name
    .split(" ")
    .map((part) => part[0])
    .join("")
    .toUpperCase()
    .slice(0, 2);
}

function timeAgo(date: Date | string): string {
  const now = new Date();
  const d = new Date(date);
  const diff = Math.floor((now.getTime() - d.getTime()) / 1000);
  if (diff < 60) return "agora";
  if (diff < 3600) return `${Math.floor(diff / 60)}min`;
  if (diff < 86400) return `${Math.floor(diff / 3600)}h`;
  return `${Math.floor(diff / 86400)}d`;
}

export default function SocialProfile() {
  const { user } = useAuth();
  const [, setLocation] = useLocation();
  const [activeTab, setActiveTab] = useState<ProfileTab>("posts");
  const [, params] = useRoute<{ username: string }>("/profile/:username");

  const profileUserId = useMemo(() => parseProfileIdFromUsername(params?.username), [params?.username]);

  const utils = trpc.useUtils();
  const { data: posts = [], isLoading: loadingPosts } = trpc.feed.list.useQuery();
  const { data: friends = [] } = trpc.ranking.friends.useQuery(undefined, {
    enabled: !!user?.id,
    refetchInterval: 30000,
    staleTime: 12000,
  });
  const { data: incomingRequests = [] } = trpc.ranking.incomingRequests.useQuery(undefined, {
    enabled: !!user?.id,
    refetchInterval: 15000,
    staleTime: 8000,
  });
  const { data: outgoingRequests = [] } = trpc.ranking.outgoingRequests.useQuery(undefined, {
    enabled: !!user?.id,
    refetchInterval: 15000,
    staleTime: 8000,
  });
  const { data: handPatternStats = [] } = trpc.feed.handPatternStats.useQuery({ limit: 50, minHands: 1 }, {
    enabled: !!user?.id,
    staleTime: 25000,
  });
  const { data: conversations = [] } = trpc.chat.conversations.useQuery(undefined, {
    enabled: !!user?.id,
    refetchInterval: 15000,
    staleTime: 8000,
  });

  const allPosts = posts ?? [];

  const profileUser = useMemo(() => {
    if (!profileUserId) return null;

    const fromPosts = allPosts.find((post: any) => Number(post?.author?.id ?? 0) === profileUserId)?.author;
    const fromFriends = (friends ?? []).find((item: any) => Number(item.id) === profileUserId);
    const fromIncoming = (incomingRequests ?? []).find((item: any) => Number(item?.requester?.id ?? 0) === profileUserId)?.requester;
    const fromOutgoing = (outgoingRequests ?? []).find((item: any) => Number(item?.receiver?.id ?? 0) === profileUserId)?.receiver;
    const fromHands = (handPatternStats ?? []).find((item: any) => Number(item?.userId ?? 0) === profileUserId);

    const name = String(
      fromPosts?.name
      ?? fromFriends?.name
      ?? fromIncoming?.name
      ?? fromOutgoing?.name
      ?? fromHands?.name
      ?? "Jogador",
    );

    const avatarUrl =
      fromPosts?.avatarUrl
      ?? fromFriends?.avatarUrl
      ?? fromIncoming?.avatarUrl
      ?? fromOutgoing?.avatarUrl
      ?? fromHands?.avatarUrl
      ?? null;

    return {
      id: profileUserId,
      name,
      avatarUrl,
    };
  }, [allPosts, friends, handPatternStats, incomingRequests, outgoingRequests, profileUserId]);

  const profilePosts = useMemo(() => {
    if (!profileUserId) return [];
    return allPosts
      .filter((post: any) => Number(post?.author?.id ?? 0) === profileUserId)
      .sort((a: any, b: any) => {
        const aTime = a?.createdAt ? new Date(a.createdAt).getTime() : 0;
        const bTime = b?.createdAt ? new Date(b.createdAt).getTime() : 0;
        return bTime - aTime;
      });
  }, [allPosts, profileUserId]);

  const stats = useMemo(() => {
    const likes = profilePosts.reduce((sum: number, post: any) => sum + Number(post?.likeCount ?? 0), 0);
    const comments = profilePosts.reduce((sum: number, post: any) => sum + Number(post?.commentCount ?? 0), 0);
    const images = profilePosts.filter((post: any) => Boolean(post?.imageUrl)).length;
    const publicPosts = profilePosts.filter((post: any) => post.visibility === "public").length;
    const friendsOnlyPosts = profilePosts.filter((post: any) => post.visibility === "friends").length;

    return {
      likes,
      comments,
      images,
      publicPosts,
      friendsOnlyPosts,
      engagement: profilePosts.length > 0 ? Math.round((likes + comments) / profilePosts.length) : 0,
    };
  }, [profilePosts]);

  const handStats = useMemo(() => {
    if (!profileUserId) return null;
    return (handPatternStats ?? []).find((item: any) => Number(item?.userId ?? 0) === profileUserId) ?? null;
  }, [handPatternStats, profileUserId]);

  const isMe = profileUserId === user?.id;
  const isFriend = (friends ?? []).some((friend: any) => Number(friend.id) === profileUserId);
  const incomingRequest = (incomingRequests ?? []).find((request: any) => Number(request?.requester?.id ?? 0) === profileUserId) ?? null;
  const outgoingRequest = (outgoingRequests ?? []).find((request: any) => Number(request?.receiver?.id ?? 0) === profileUserId) ?? null;

  const refreshFriendshipData = async () => {
    await Promise.all([
      utils.ranking.friends.invalidate(),
      utils.ranking.incomingRequests.invalidate(),
      utils.ranking.outgoingRequests.invalidate(),
    ]);
  };

  const sendFriendRequestMutation = trpc.ranking.sendRequest.useMutation({
    onSuccess: async () => {
      await refreshFriendshipData();
      toast.success("Pedido enviado.");
    },
    onError: (error) => toast.error(error.message),
  });

  const respondRequestMutation = trpc.ranking.respondRequest.useMutation({
    onSuccess: async ({ status }) => {
      await refreshFriendshipData();
      toast.success(status === "accepted" ? "Pedido aceito." : "Pedido recusado.");
    },
    onError: (error) => toast.error(error.message),
  });

  const cancelRequestMutation = trpc.ranking.cancelRequest.useMutation({
    onSuccess: async () => {
      await refreshFriendshipData();
      toast.success("Pedido cancelado.");
    },
    onError: (error) => toast.error(error.message),
  });

  const removeFriendMutation = trpc.ranking.removeFriend.useMutation({
    onSuccess: async () => {
      await refreshFriendshipData();
      toast.success("Amizade removida.");
    },
    onError: (error) => toast.error(error.message),
  });

  const onlineUsers = useMemo(() => {
    const seen = new Set<number>();
    const rows: Array<{ id: number; name: string | null; avatarUrl: string | null }> = [];

    for (const conversation of conversations ?? []) {
      if (!conversation?.isOnline) continue;
      const friendId = Number(conversation?.friend?.id ?? 0);
      if (!Number.isFinite(friendId) || friendId <= 0 || seen.has(friendId)) continue;
      seen.add(friendId);
      rows.push({
        id: friendId,
        name: conversation?.friend?.name ?? "Jogador",
        avatarUrl: conversation?.friend?.avatarUrl ?? null,
      });
    }

    return rows;
  }, [conversations]);

  const suggestions = useMemo(() => {
    const list = (handPatternStats ?? [])
      .filter((row: any) => Number(row?.userId ?? 0) > 0)
      .filter((row: any) => Number(row.userId) !== profileUserId)
      .slice(0, 4);

    return list;
  }, [handPatternStats, profileUserId]);

  if (!user) return null;

  if (!profileUserId) {
    return (
      <div className="social-page space-y-4 pb-6 text-white">
        <div className="social-post p-6 text-center">
          <p className="text-base font-semibold">Perfil inválido</p>
          <p className="mt-1 text-sm text-muted-foreground">Não foi possível encontrar esse perfil.</p>
          <Button className="mt-4 rounded-full" onClick={() => setLocation("/feed")}>Voltar ao feed</Button>
        </div>
      </div>
    );
  }

  const nickname = `@jogador-${profileUserId}`;
  const bio = isMe
    ? "Perfil premium All-in Edge. Compartilhe resultados e evolução no grind."
    : "Jogador ativo da comunidade All-in Edge."
  ;

  return (
    <div className="social-page space-y-4 pb-6 text-white">
      <div className="relative mx-auto grid max-w-[1380px] grid-cols-1 gap-4 xl:grid-cols-[260px_minmax(0,1fr)_320px] xl:gap-6">
        <aside className="hidden space-y-4 xl:block">
          <div className="social-shell p-4">
            <p className="mb-2 text-sm font-semibold">Comunidade</p>
            <Button type="button" variant="outline" className="w-full justify-start rounded-xl" onClick={() => setLocation("/feed")}>
              <ArrowLeft className="mr-2 h-4 w-4" /> Voltar ao feed
            </Button>
            <Button type="button" variant="ghost" className="mt-2 w-full justify-start rounded-xl" onClick={() => setLocation("/invites")}>
              <Users className="mr-2 h-4 w-4" /> Pessoas e convites
            </Button>
            <Button type="button" variant="ghost" className="mt-2 w-full justify-start rounded-xl" onClick={() => setLocation("/chat")}>
              <MessageCircle className="mr-2 h-4 w-4" /> Mensagens
            </Button>
          </div>

          <div className="social-shell p-4">
            <p className="mb-2 text-xs uppercase tracking-[0.12em] text-muted-foreground">Online agora</p>
            {onlineUsers.length === 0 ? (
              <p className="text-xs text-muted-foreground">Nenhum amigo online no momento.</p>
            ) : (
              <div className="space-y-2">
                {onlineUsers.slice(0, 5).map((online) => (
                  <button
                    key={`online-left-${online.id}`}
                    type="button"
                    className="social-muted-panel flex w-full items-center gap-2 p-2 text-left"
                    onClick={() => setLocation(buildProfilePath({ id: online.id, name: online.name }))}
                  >
                    <div className="relative">
                      <Avatar className="h-8 w-8">
                        <AvatarImage src={online.avatarUrl ?? undefined} />
                        <AvatarFallback>{getInitials(online.name)}</AvatarFallback>
                      </Avatar>
                      <OnlinePresenceDot className="absolute -bottom-1 -right-1" />
                    </div>
                    <div className="min-w-0 flex-1">
                      <p className="truncate text-xs font-semibold">{online.name ?? "Jogador"}</p>
                      <OnlinePresenceLabel text="Online" className="px-2 py-0.5 text-[10px]" />
                    </div>
                  </button>
                ))}
              </div>
            )}
          </div>
        </aside>

        <main className="mx-auto w-full max-w-[760px] space-y-4 xl:max-w-[760px]">
          {loadingPosts && !profileUser ? (
            <div className="social-shell space-y-4 p-5">
              <div className="flex items-center gap-3">
                <Skeleton className="h-24 w-24 rounded-full" />
                <div className="space-y-2">
                  <Skeleton className="h-5 w-40" />
                  <Skeleton className="h-4 w-28" />
                </div>
              </div>
            </div>
          ) : profileUser ? (
            <>
              <section className="social-shell p-5 md:p-6">
                <div className="flex flex-col gap-4 md:flex-row md:items-center md:justify-between">
                  <div className="flex items-start gap-4">
                    <Avatar className="h-24 w-24 border border-white/10">
                      <AvatarImage src={profileUser.avatarUrl ?? undefined} />
                      <AvatarFallback className="text-xl font-bold">{getInitials(profileUser.name)}</AvatarFallback>
                    </Avatar>
                    <div className="min-w-0">
                      <p className="truncate text-2xl font-black tracking-tight">{profileUser.name}</p>
                      <p className="mt-0.5 text-sm text-muted-foreground">{nickname}</p>
                      <p className="mt-2 max-w-xl text-sm text-foreground/85">{bio}</p>
                      <div className="mt-3 grid grid-cols-3 gap-2 md:max-w-md">
                        <div className="social-muted-panel p-2 text-center">
                          <p className="text-[10px] uppercase tracking-[0.1em] text-muted-foreground">Posts</p>
                          <p className="text-lg font-black">{profilePosts.length}</p>
                        </div>
                        <div className="social-muted-panel p-2 text-center">
                          <p className="text-[10px] uppercase tracking-[0.1em] text-muted-foreground">Curtidas</p>
                          <p className="text-lg font-black">{stats.likes}</p>
                        </div>
                        <div className="social-muted-panel p-2 text-center">
                          <p className="text-[10px] uppercase tracking-[0.1em] text-muted-foreground">Comentários</p>
                          <p className="text-lg font-black">{stats.comments}</p>
                        </div>
                      </div>
                    </div>
                  </div>

                  <div className="flex flex-wrap items-center gap-2">
                    {isMe ? (
                      <Button type="button" variant="outline" className="rounded-full">Seu perfil</Button>
                    ) : isFriend ? (
                      <>
                        <Button type="button" className="rounded-full" disabled>
                          <Check className="mr-1.5 h-4 w-4" /> Amigos
                        </Button>
                        <Button
                          type="button"
                          variant="outline"
                          className="rounded-full"
                          onClick={() => removeFriendMutation.mutate({ friendId: profileUserId })}
                          disabled={removeFriendMutation.isPending}
                        >
                          Remover
                        </Button>
                      </>
                    ) : incomingRequest ? (
                      <>
                        <Button
                          type="button"
                          className="rounded-full"
                          onClick={() => respondRequestMutation.mutate({ requestId: incomingRequest.id, action: "accept" })}
                          disabled={respondRequestMutation.isPending}
                        >
                          <Check className="mr-1.5 h-4 w-4" /> Aceitar amizade
                        </Button>
                        <Button
                          type="button"
                          variant="outline"
                          className="rounded-full"
                          onClick={() => respondRequestMutation.mutate({ requestId: incomingRequest.id, action: "reject" })}
                          disabled={respondRequestMutation.isPending}
                        >
                          <X className="mr-1.5 h-4 w-4" /> Recusar
                        </Button>
                      </>
                    ) : outgoingRequest ? (
                      <>
                        <Button type="button" className="rounded-full" disabled>
                          <UserPlus className="mr-1.5 h-4 w-4" /> Pedido enviado
                        </Button>
                        <Button
                          type="button"
                          variant="outline"
                          className="rounded-full"
                          onClick={() => cancelRequestMutation.mutate({ requestId: outgoingRequest.id })}
                          disabled={cancelRequestMutation.isPending}
                        >
                          Cancelar
                        </Button>
                      </>
                    ) : (
                      <Button
                        type="button"
                        className="rounded-full"
                        onClick={() => sendFriendRequestMutation.mutate({ friendId: profileUserId })}
                        disabled={sendFriendRequestMutation.isPending}
                      >
                        <UserPlus className="mr-1.5 h-4 w-4" /> Seguir / pedir amizade
                      </Button>
                    )}
                  </div>
                </div>
              </section>

              <section className="social-shell p-2">
                <div className="grid grid-cols-2 gap-1 sm:grid-cols-4">
                  <Button type="button" variant={activeTab === "posts" ? "default" : "ghost"} className="rounded-xl text-xs" onClick={() => setActiveTab("posts")}>Posts</Button>
                  <Button type="button" variant={activeTab === "results" ? "default" : "ghost"} className="rounded-xl text-xs" onClick={() => setActiveTab("results")}>Resultados</Button>
                  <Button type="button" variant={activeTab === "hands" ? "default" : "ghost"} className="rounded-xl text-xs" onClick={() => setActiveTab("hands")}>Mãos</Button>
                  <Button type="button" variant={activeTab === "stats" ? "default" : "ghost"} className="rounded-xl text-xs" onClick={() => setActiveTab("stats")}>Estatísticas</Button>
                </div>
              </section>

              {activeTab === "posts" && (
                profilePosts.length === 0 ? (
                  <div className="social-post p-10 text-center text-sm text-muted-foreground">Sem posts visíveis desse jogador ainda.</div>
                ) : (
                  <section className="grid gap-3 sm:grid-cols-2">
                    {profilePosts.map((post: any) => (
                      <article key={`profile-post-${post.id}`} className="social-post p-3">
                        <div className="mb-2 flex items-center justify-between text-xs text-muted-foreground">
                          <span>{timeAgo(post.createdAt)}</span>
                          <span className="inline-flex items-center gap-1">
                            {post.visibility === "public" ? <Globe className="h-3 w-3" /> : <Users className="h-3 w-3" />}
                            {post.visibility === "public" ? "Público" : "Amigos"}
                          </span>
                        </div>
                        {post.content?.trim() ? <p className="mb-2 text-sm leading-relaxed">{post.content}</p> : null}
                        {post.imageUrl ? <img src={post.imageUrl} alt="Imagem do post" className="h-44 w-full rounded-xl object-cover" /> : null}
                        <div className="mt-2 text-xs text-muted-foreground">{post.likeCount ?? 0} curtidas • {post.commentCount ?? 0} comentários</div>
                      </article>
                    ))}
                  </section>
                )
              )}

              {activeTab === "results" && (
                <section className="grid gap-3 sm:grid-cols-2">
                  <div className="social-muted-panel p-4">
                    <p className="text-xs uppercase tracking-[0.1em] text-muted-foreground">Engajamento médio</p>
                    <p className="mt-2 text-2xl font-black">{stats.engagement}</p>
                    <p className="text-xs text-muted-foreground">interações por post</p>
                  </div>
                  <div className="social-muted-panel p-4">
                    <p className="text-xs uppercase tracking-[0.1em] text-muted-foreground">Posts com imagem</p>
                    <p className="mt-2 text-2xl font-black">{stats.images}</p>
                    <p className="text-xs text-muted-foreground">conteúdos visuais publicados</p>
                  </div>
                  <div className="social-muted-panel p-4">
                    <p className="text-xs uppercase tracking-[0.1em] text-muted-foreground">Posts públicos</p>
                    <p className="mt-2 text-2xl font-black">{stats.publicPosts}</p>
                    <p className="text-xs text-muted-foreground">abertos para toda comunidade</p>
                  </div>
                  <div className="social-muted-panel p-4">
                    <p className="text-xs uppercase tracking-[0.1em] text-muted-foreground">Posts amigos</p>
                    <p className="mt-2 text-2xl font-black">{stats.friendsOnlyPosts}</p>
                    <p className="text-xs text-muted-foreground">conteúdo restrito para rede</p>
                  </div>
                </section>
              )}

              {activeTab === "hands" && (
                handStats ? (
                  <section className="grid gap-3 sm:grid-cols-2">
                    <div className="social-muted-panel p-4">
                      <p className="text-sm font-semibold">KK</p>
                      <p className="mt-1 text-xs text-muted-foreground">{handStats.kk?.hands ?? 0} mãos • {handStats.kk?.winRate ?? 0}% winrate</p>
                    </div>
                    <div className="social-muted-panel p-4">
                      <p className="text-sm font-semibold">JJ</p>
                      <p className="mt-1 text-xs text-muted-foreground">{handStats.jj?.hands ?? 0} mãos • {handStats.jj?.winRate ?? 0}% winrate</p>
                    </div>
                    <div className="social-muted-panel p-4">
                      <p className="text-sm font-semibold">AA</p>
                      <p className="mt-1 text-xs text-muted-foreground">{handStats.aa?.hands ?? 0} mãos • {handStats.aa?.winRate ?? 0}% winrate</p>
                    </div>
                    <div className="social-muted-panel p-4">
                      <p className="text-sm font-semibold">AK</p>
                      <p className="mt-1 text-xs text-muted-foreground">{handStats.ak?.hands ?? 0} mãos • {handStats.ak?.winRate ?? 0}% winrate</p>
                    </div>
                  </section>
                ) : (
                  <div className="social-post p-8 text-center text-sm text-muted-foreground">Esse jogador ainda não tem dados de mãos destacados.</div>
                )
              )}

              {activeTab === "stats" && (
                <section className="grid gap-3 sm:grid-cols-3">
                  <div className="social-muted-panel p-4">
                    <p className="text-xs uppercase tracking-[0.1em] text-muted-foreground">Total de interações</p>
                    <p className="mt-2 text-2xl font-black">{stats.likes + stats.comments}</p>
                  </div>
                  <div className="social-muted-panel p-4">
                    <p className="text-xs uppercase tracking-[0.1em] text-muted-foreground">Score de performance</p>
                    <p className="mt-2 text-2xl font-black">{handStats?.performanceScore ?? 0}</p>
                  </div>
                  <div className="social-muted-panel p-4">
                    <p className="text-xs uppercase tracking-[0.1em] text-muted-foreground">Status social</p>
                    <p className="mt-2 text-sm font-semibold">
                      {isMe ? "Seu perfil" : isFriend ? "Conectado" : outgoingRequest ? "Pedido pendente" : "Comunidade"}
                    </p>
                  </div>
                </section>
              )}
            </>
          ) : (
            <div className="social-post p-8 text-center">
              <p className="text-base font-semibold">Perfil não encontrado</p>
              <p className="mt-1 text-sm text-muted-foreground">Este jogador não apareceu no seu contexto de comunidade.</p>
              <Button className="mt-4 rounded-full" onClick={() => setLocation("/feed")}>Voltar ao feed</Button>
            </div>
          )}
        </main>

        <aside className="mt-4 hidden space-y-4 xl:sticky xl:top-4 xl:block xl:self-start">
          <div className="social-shell p-4">
            <div className="mb-2 flex items-center gap-2 text-sm font-semibold">
              <Activity className="h-4 w-4 text-emerald-400" />
              Online na comunidade
            </div>
            {onlineUsers.length === 0 ? (
              <p className="text-xs text-muted-foreground">Sem jogadores online agora.</p>
            ) : (
              <div className="space-y-2">
                {onlineUsers.slice(0, 6).map((online) => (
                  <button
                    key={`online-right-${online.id}`}
                    type="button"
                    className="social-muted-panel flex w-full items-center gap-2 p-2 text-left"
                    onClick={() => setLocation(buildProfilePath({ id: online.id, name: online.name }))}
                  >
                    <div className="relative">
                      <Avatar className="h-8 w-8">
                        <AvatarImage src={online.avatarUrl ?? undefined} />
                        <AvatarFallback>{getInitials(online.name)}</AvatarFallback>
                      </Avatar>
                      <OnlinePresenceDot className="absolute -bottom-1 -right-1" />
                    </div>
                    <div className="min-w-0 flex-1">
                      <p className="truncate text-xs font-semibold">{online.name ?? "Jogador"}</p>
                      <OnlinePresenceLabel text="online" className="px-2 py-0.5 text-[10px]" />
                    </div>
                  </button>
                ))}
              </div>
            )}
          </div>

          <div className="social-shell p-4">
            <div className="mb-2 flex items-center gap-2 text-sm font-semibold">
              <Hand className="h-4 w-4 text-primary" />
              Sugestões da mesa
            </div>
            <div className="space-y-2">
              {suggestions.length === 0 ? (
                <p className="text-xs text-muted-foreground">Sem sugestões no momento.</p>
              ) : (
                suggestions.map((row: any) => (
                  <button
                    key={`sugg-${row.userId}`}
                    type="button"
                    className="social-muted-panel flex w-full items-center gap-2 p-2 text-left"
                    onClick={() => setLocation(buildProfilePath({ id: Number(row.userId), name: row.name }))}
                  >
                    <Avatar className="h-8 w-8">
                      <AvatarImage src={row.avatarUrl ?? undefined} />
                      <AvatarFallback>{getInitials(row.name)}</AvatarFallback>
                    </Avatar>
                    <div className="min-w-0 flex-1">
                      <p className="truncate text-xs font-semibold">{row.name ?? "Jogador"}</p>
                      <p className="text-[10px] text-muted-foreground">score {row.performanceScore ?? 0}</p>
                    </div>
                  </button>
                ))
              )}
            </div>
          </div>
        </aside>
      </div>
    </div>
  );
}
