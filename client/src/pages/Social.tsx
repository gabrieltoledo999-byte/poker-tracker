import SocialHubNav from "@/components/SocialHubNav";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Button } from "@/components/ui/button";
import { trpc } from "@/lib/trpc";
import { Flame, MessageCircle, Sparkles, Users, Globe, ArrowRight, BellRing } from "lucide-react";
import { useLocation } from "wouter";

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

export default function Social() {
  const [, setLocation] = useLocation();

  const { data: unreadChat } = trpc.chat.unreadCount.useQuery(undefined, {
    refetchInterval: 3000,
    staleTime: 1500,
    refetchOnWindowFocus: true,
  });

  const { data: incomingRequests = [] } = trpc.ranking.incomingRequests.useQuery(undefined, {
    refetchInterval: 3000,
    staleTime: 1500,
    refetchOnWindowFocus: true,
  });

  const { data: posts = [] } = trpc.feed.list.useQuery(
    { limit: 20, offset: 0 },
    {
      refetchInterval: 30000,
      staleTime: 10000,
      refetchOnWindowFocus: true,
    }
  );

  const trendingPost = posts.find((post) => (post.likeCount ?? 0) > 0 || (post.commentCount ?? 0) > 0) ?? posts[0];
  const recentPosts = posts.slice(0, 5);
  const activeNow = (unreadChat?.count ?? 0) + incomingRequests.length;

  return (
    <div className="social-page space-y-4 pb-2">
      <div className="px-1 pt-1">
        <div className="flex flex-wrap items-end justify-between gap-3">
          <div>
            <h1 className="flex items-center gap-2 text-2xl font-bold">
              <Sparkles className="h-6 w-6 text-primary" />
              Comunidade
            </h1>
            <p className="text-sm text-muted-foreground">Seu espaço social unificado para conversar, descobrir pessoas e acompanhar o que a rede esta postando.</p>
          </div>
          <div className="inline-flex items-center gap-2 rounded-full border border-border/60 bg-background/70 px-4 py-2 text-sm font-medium backdrop-blur">
            <Flame className="h-4 w-4 text-primary" />
            {activeNow > 0
              ? `${activeNow} novidades agora`
              : "Comunidade ativa"}
          </div>
        </div>
      </div>

      <SocialHubNav />

      <div className="app-scrollbar flex gap-2 overflow-x-auto px-1 pb-1">
        <Button type="button" variant="outline" className="h-11 rounded-full" onClick={() => setLocation("/feed")}> 
          <Globe className="mr-2 h-4 w-4" />
          Ver feed completo
        </Button>
        <Button type="button" variant="outline" className="h-11 rounded-full" onClick={() => setLocation("/chat")}> 
          <MessageCircle className="mr-2 h-4 w-4" />
          Mensagens {unreadChat?.count ? `(${unreadChat.count})` : ""}
        </Button>
        <Button type="button" variant="outline" className="h-11 rounded-full" onClick={() => setLocation("/invites")}> 
          <Users className="mr-2 h-4 w-4" />
          Pessoas {incomingRequests.length ? `(${incomingRequests.length})` : ""}
        </Button>
      </div>

      <div className="grid gap-4 lg:grid-cols-[minmax(0,1fr)_320px]">
        <section className="space-y-3">
          <div className="social-shell p-4 md:p-5">
            <p className="text-sm font-semibold">Timeline da comunidade</p>
            <p className="text-xs text-muted-foreground">Ultimas atualizacoes da sua rede, sem cara de painel.</p>
          </div>

          {recentPosts.length === 0 ? (
            <div className="social-post p-6 text-sm text-muted-foreground">
              Ainda sem posts novos. Chame a galera para movimentar o feed.
            </div>
          ) : (
            recentPosts.map((post) => (
              <article key={post.id} className="social-post p-4 md:p-5">
                <div className="mb-3 flex items-center gap-2.5">
                  <Avatar className="h-9 w-9">
                    <AvatarImage src={post.author?.avatarUrl ?? undefined} />
                    <AvatarFallback className="text-xs">{getInitials(post.author?.name)}</AvatarFallback>
                  </Avatar>
                  <div className="min-w-0">
                    <p className="truncate text-sm font-semibold">{post.author?.name ?? "Jogador"}</p>
                    <p className="text-xs text-muted-foreground">{timeAgo(post.createdAt)}</p>
                  </div>
                </div>

                {post.content?.trim() ? (
                  <p className="text-sm leading-relaxed text-foreground/95">{post.content}</p>
                ) : (
                  <p className="text-sm text-muted-foreground">Post com imagem</p>
                )}

                <div className="mt-3 flex items-center gap-3 text-xs text-muted-foreground">
                  <span>{post.likeCount ?? 0} curtidas</span>
                  <span>{post.commentCount ?? 0} comentarios</span>
                  {post.myReaction ? <span>voce reagiu {post.myReaction}</span> : null}
                </div>
              </article>
            ))
          )}

          <div className="px-1">
            <Button type="button" variant="ghost" className="h-10 rounded-full text-sm" onClick={() => setLocation("/feed")}> 
              Abrir feed completo
              <ArrowRight className="ml-2 h-4 w-4" />
            </Button>
          </div>
        </section>

        <aside className="space-y-3">
          <div className="social-shell p-4">
            <p className="mb-2 flex items-center gap-2 text-sm font-semibold">
              <BellRing className="h-4 w-4 text-primary" />
              Atividade agora
            </p>
            <div className="space-y-2 text-sm">
              <div className="social-muted-panel p-3">
                <p className="font-medium">Mensagens</p>
                <p className="text-xs text-muted-foreground">{unreadChat?.count ?? 0} nao lidas</p>
              </div>
              <div className="social-muted-panel p-3">
                <p className="font-medium">Pedidos de amizade</p>
                <p className="text-xs text-muted-foreground">{incomingRequests.length} pendentes</p>
              </div>
              <div className="social-muted-panel p-3">
                <p className="font-medium">Feed</p>
                <p className="text-xs text-muted-foreground">{posts.length} posts recentes</p>
              </div>
            </div>
          </div>

          {trendingPost ? (
            <div className="social-shell p-4">
              <p className="text-sm font-semibold">Em alta</p>
              <p className="mt-2 line-clamp-4 text-sm text-muted-foreground">
                {trendingPost.content?.trim() || "Post com imagem da comunidade"}
              </p>
              <Button size="sm" variant="outline" className="mt-3 rounded-full" onClick={() => setLocation("/feed")}> 
                Ver no feed
              </Button>
            </div>
          ) : null}
        </aside>
      </div>
    </div>
  );
}
