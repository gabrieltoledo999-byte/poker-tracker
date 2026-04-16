import { useState } from "react";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Skeleton } from "@/components/ui/skeleton";
import SocialHubNav from "@/components/SocialHubNav";
import { trpc } from "@/lib/trpc";
import { Link2, MessageCircle, Search, ShieldBan, UserMinus, UserPlus, UserCheck, Clock3, Sparkles } from "lucide-react";
import { toast } from "sonner";
import { useLocation } from "wouter";

function getInitials(name: string | null | undefined): string {
  if (!name) return "?";
  return name
    .split(" ")
    .map((n) => n[0])
    .join("")
    .toUpperCase()
    .slice(0, 2);
}

function getAvatarSrc(params: {
  id?: number | null;
  name?: string | null;
  email?: string | null;
  avatarUrl?: string | null;
}): string | undefined {
  const avatarUrl = params.avatarUrl?.trim();
  if (avatarUrl) return avatarUrl;

  const seedRaw = params.name?.trim() || params.email?.trim() || String(params.id ?? "user");
  const seed = encodeURIComponent(seedRaw);
  return `https://api.dicebear.com/9.x/thumbs/svg?seed=${seed}`;
}

export default function Invites() {
  const [search, setSearch] = useState("");
  const [, setLocation] = useLocation();

  const { data: myCode } = trpc.invites.getMyCode.useQuery();
  const { data: friends = [], isLoading: loadingFriends } = trpc.ranking.friends.useQuery(undefined, {
    refetchInterval: 30000,
    staleTime: 15000,
  });
  const { data: incomingRequests = [], isLoading: loadingIncomingRequests } = trpc.ranking.incomingRequests.useQuery(undefined, {
    refetchInterval: 15000,
    staleTime: 8000,
  });
  const { data: outgoingRequests = [], isLoading: loadingOutgoingRequests } = trpc.ranking.outgoingRequests.useQuery(undefined, {
    refetchInterval: 30000,
    staleTime: 15000,
  });
  const { data: searchResults = [], isFetching: loadingSearch } = trpc.ranking.searchUsers.useQuery(
    { query: search },
    {
      enabled: search.trim().length >= 1,
      refetchInterval: 15000,
      staleTime: 8000,
    }
  );

  const utils = trpc.useUtils();

  const refreshFriendshipData = async () => {
    await Promise.all([
      utils.ranking.friends.invalidate(),
      utils.ranking.searchUsers.invalidate(),
      utils.ranking.incomingRequests.invalidate(),
      utils.ranking.outgoingRequests.invalidate(),
    ]);
  };

  const sendFriendRequestMutation = trpc.ranking.sendRequest.useMutation({
    onSuccess: async () => {
      await refreshFriendshipData();
      toast.success("Pedido de amizade enviado.");
    },
    onError: (error) => {
      toast.error(error.message);
    },
  });

  const respondRequestMutation = trpc.ranking.respondRequest.useMutation({
    onSuccess: async ({ status }) => {
      await refreshFriendshipData();
      toast.success(status === "accepted" ? "Pedido aceito." : "Pedido recusado.");
    },
    onError: (error) => {
      toast.error(error.message);
    },
  });

  const cancelRequestMutation = trpc.ranking.cancelRequest.useMutation({
    onSuccess: async () => {
      await refreshFriendshipData();
      toast.success("Pedido cancelado.");
    },
    onError: (error) => {
      toast.error(error.message);
    },
  });

  const removeFriendMutation = trpc.ranking.removeFriend.useMutation({
    onSuccess: async () => {
      await refreshFriendshipData();
      toast.success("Amizade desfeita.");
    },
    onError: (error) => {
      toast.error(error.message);
    },
  });

  const blockUserMutation = trpc.ranking.blockUser.useMutation({
    onSuccess: async () => {
      await refreshFriendshipData();
      toast.success("Usuario bloqueado com sucesso.");
    },
    onError: (error) => {
      toast.error(error.message);
    },
  });

  const inviteUrl = myCode ? `${window.location.origin}?invite=${myCode.code}` : "";
  const pendingOutgoingIds = new Set(outgoingRequests.map((request) => request.receiverId));

  const copyInviteLink = () => {
    if (!inviteUrl) return;
    navigator.clipboard.writeText(inviteUrl);
    toast.success("Link copiado para a area de transferencia.");
  };

  if (loadingFriends || loadingIncomingRequests || loadingOutgoingRequests) {
    return (
      <div className="social-page space-y-4">
        <SocialHubNav />
        <Skeleton className="h-24 w-full rounded-[1.75rem]" />
        <div className="grid gap-4 lg:grid-cols-[1.15fr_0.85fr]">
          <Skeleton className="h-[32rem] rounded-[1.75rem]" />
          <Skeleton className="h-[32rem] rounded-[1.75rem]" />
        </div>
      </div>
    );
  }

  return (
    <div className="social-page space-y-4">
      <SocialHubNav />

      <div className="social-shell flex flex-wrap items-center justify-between gap-4 p-5 md:p-6">
        <div>
          <h1 className="text-2xl font-bold">Pessoas</h1>
        </div>
        <div className="flex flex-wrap gap-2">
          <Button type="button" variant="outline" onClick={() => setLocation("/chat")}>
            <MessageCircle className="mr-2 h-4 w-4" />
            Ir para mensagens
          </Button>
          <Button type="button" variant="outline" onClick={copyInviteLink} disabled={!inviteUrl}>
            <Link2 className="mr-2 h-4 w-4" />
            Copiar link de convite
          </Button>
        </div>
      </div>

      <div className="grid gap-4 lg:grid-cols-[1.15fr_0.85fr]">
        <section className="social-shell p-4 md:p-5">
          <div className="mb-4 flex items-start justify-between gap-3">
            <div>
              <p className="flex items-center gap-2 text-base font-semibold">
                <UserPlus className="h-4 w-4 text-primary" />
                Descobrir pessoas
              </p>
              <p className="text-sm text-muted-foreground">Procure por nome, login ou email e puxe a pessoa para sua rede.</p>
            </div>
            <span className="inline-flex items-center gap-1 rounded-full bg-primary/10 px-3 py-1 text-xs font-semibold text-primary">
              <Sparkles className="h-3.5 w-3.5" />
              Social mode
            </span>
          </div>

          <div className="social-muted-panel p-3">
            <div className="flex gap-2">
              <Input
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                placeholder="Digite nome, login/codigo ou email"
                className="h-12 rounded-full border-border/60 bg-background/75 px-5"
              />
              <Button type="button" variant="outline" size="icon" disabled className="h-12 w-12 rounded-full">
                <Search className="h-4 w-4" />
              </Button>
            </div>
          </div>

          <div className="app-scrollbar mt-4 max-h-[calc(100dvh-18rem)] space-y-3 overflow-y-auto pr-1">
            {search.trim().length > 0 ? (
              <div className="space-y-3">
                <p className="text-xs text-muted-foreground">
                  Buscando por: <span className="font-medium text-foreground">{search.trim()}</span>
                </p>
                {loadingSearch ? (
                  <Skeleton className="h-16 w-full rounded-[1.5rem]" />
                ) : searchResults.length === 0 ? (
                  <div className="social-muted-panel px-4 py-8 text-center text-sm text-muted-foreground">Nenhuma pessoa encontrada com esse termo.</div>
                ) : (
                  searchResults.map((player) => (
                    <div key={player.id} className="social-muted-panel flex items-center gap-3 p-3.5">
                      <Avatar className="h-11 w-11">
                        <AvatarImage
                          src={getAvatarSrc({ id: player.id, name: player.name, email: player.email, avatarUrl: player.avatarUrl })}
                        />
                        <AvatarFallback>{getInitials(player.name)}</AvatarFallback>
                      </Avatar>

                      <div className="min-w-0 flex-1">
                        <p className="truncate font-medium">{player.name ?? "Jogador"}</p>
                        <p className="truncate text-xs text-muted-foreground">{player.email ?? "Sem email publico"}</p>
                        <p className="truncate text-[11px] text-muted-foreground">Login: {player.inviteCode}</p>
                      </div>

                      <Button
                        size="sm"
                        onClick={() => sendFriendRequestMutation.mutate({ friendId: player.id })}
                        disabled={sendFriendRequestMutation.isPending || pendingOutgoingIds.has(player.id)}
                        className="rounded-full px-4"
                      >
                        {pendingOutgoingIds.has(player.id) ? "Pendente" : "Enviar pedido"}
                      </Button>
                    </div>
                  ))
                )}
              </div>
            ) : (
              <div className="social-muted-panel px-4 py-8 text-center text-sm text-muted-foreground">Digite para ver sugestoes de quem ja tem login.</div>
            )}
          </div>
        </section>

        <aside className="space-y-4">
          <section className="social-shell p-4 md:p-5">
            <div className="mb-3 flex items-center justify-between gap-2">
              <p className="flex items-center gap-2 text-sm font-semibold">
                <UserCheck className="h-4 w-4 text-primary" />
                Pedidos recebidos
              </p>
              {incomingRequests.length > 0 ? <Badge variant="destructive">{incomingRequests.length}</Badge> : null}
            </div>
            <div className="app-scrollbar max-h-64 space-y-2 overflow-y-auto pr-1">
              {incomingRequests.length === 0 ? (
                <div className="social-muted-panel px-4 py-6 text-sm text-muted-foreground">Nenhum pedido pendente.</div>
              ) : (
                incomingRequests.map((request) => (
                  <div key={request.id} className="social-muted-panel flex items-center gap-3 p-3">
                    <Avatar className="h-9 w-9">
                      <AvatarImage
                        src={getAvatarSrc({
                          id: request.requester.id,
                          name: request.requester.name,
                          email: request.requester.email,
                          avatarUrl: request.requester.avatarUrl,
                        })}
                      />
                      <AvatarFallback>{getInitials(request.requester.name)}</AvatarFallback>
                    </Avatar>
                    <div className="min-w-0 flex-1">
                      <p className="truncate font-medium">{request.requester.name ?? "Jogador"}</p>
                      <p className="truncate text-xs text-muted-foreground">Quer entrar na sua rede</p>
                    </div>
                    <div className="flex flex-wrap gap-2">
                      <Button
                        size="sm"
                        onClick={() => respondRequestMutation.mutate({ requestId: request.id, action: "accept" })}
                        disabled={respondRequestMutation.isPending}
                      >
                        Aceitar
                      </Button>
                      <Button
                        size="sm"
                        variant="outline"
                        onClick={() => respondRequestMutation.mutate({ requestId: request.id, action: "reject" })}
                        disabled={respondRequestMutation.isPending}
                      >
                        Recusar
                      </Button>
                      <Button
                        size="sm"
                        variant="destructive"
                        onClick={() => blockUserMutation.mutate({ userId: request.requester.id })}
                        disabled={blockUserMutation.isPending}
                      >
                        <ShieldBan className="mr-1 h-3.5 w-3.5" />
                        Bloquear
                      </Button>
                    </div>
                  </div>
                ))
              )}
            </div>
          </section>

          <section className="social-shell p-4 md:p-5">
            <div className="mb-3 flex items-center gap-2">
              <Clock3 className="h-4 w-4 text-primary" />
              <p className="text-sm font-semibold">Pedidos enviados</p>
            </div>
            <div className="app-scrollbar max-h-56 space-y-2 overflow-y-auto pr-1">
              {outgoingRequests.length === 0 ? (
                <div className="social-muted-panel px-4 py-6 text-sm text-muted-foreground">Voce nao enviou pedidos pendentes.</div>
              ) : (
                outgoingRequests.map((request) => (
                  <div key={request.id} className="social-muted-panel flex items-center gap-3 p-3">
                    <Avatar className="h-9 w-9">
                      <AvatarImage
                        src={getAvatarSrc({
                          id: request.receiver.id,
                          name: request.receiver.name,
                          email: request.receiver.email,
                          avatarUrl: request.receiver.avatarUrl,
                        })}
                      />
                      <AvatarFallback>{getInitials(request.receiver.name)}</AvatarFallback>
                    </Avatar>

                    <div className="min-w-0 flex-1">
                      <p className="truncate font-medium">{request.receiver.name ?? "Jogador"}</p>
                      <p className="truncate text-xs text-muted-foreground">Aguardando resposta</p>
                    </div>

                    <Button
                      size="sm"
                      variant="outline"
                      onClick={() => cancelRequestMutation.mutate({ requestId: request.id })}
                      disabled={cancelRequestMutation.isPending}
                    >
                      Cancelar
                    </Button>
                  </div>
                ))
              )}
            </div>
          </section>

          <section className="social-shell p-4 md:p-5">
            <div className="mb-3 flex items-center justify-between gap-2">
              <p className="flex items-center gap-2 text-sm font-semibold">
                <MessageCircle className="h-4 w-4 text-primary" />
                Sua rede
              </p>
              <Badge variant="secondary">{friends.length}</Badge>
            </div>
            <div className="app-scrollbar max-h-[22rem] space-y-2 overflow-y-auto pr-1">
              {friends.length === 0 ? (
                <div className="social-muted-panel px-4 py-6 text-sm text-muted-foreground">Voce ainda nao adicionou ninguem.</div>
              ) : (
                friends.map((friend) => (
                  <div key={friend.id} className="social-muted-panel flex items-center gap-3 p-3">
                    <Avatar className="h-9 w-9">
                      <AvatarImage src={getAvatarSrc({ id: friend.id, name: friend.name, email: friend.email, avatarUrl: friend.avatarUrl })} />
                      <AvatarFallback>{getInitials(friend.name)}</AvatarFallback>
                    </Avatar>
                    <div className="min-w-0">
                      <p className="truncate font-medium">{friend.name ?? "Jogador"}</p>
                      <p className="truncate text-xs text-muted-foreground">{friend.email ?? "Sem email publico"}</p>
                    </div>
                    <div className="ml-auto flex flex-wrap items-center gap-2">
                      <Button size="sm" onClick={() => setLocation("/chat")} className="rounded-full">
                        Conversar
                      </Button>
                      <Button
                        size="sm"
                        variant="outline"
                        onClick={() => removeFriendMutation.mutate({ friendId: friend.id })}
                        disabled={removeFriendMutation.isPending}
                      >
                        <UserMinus className="mr-1 h-3.5 w-3.5" />
                        Desfazer
                      </Button>
                      <Button
                        size="sm"
                        variant="destructive"
                        onClick={() => blockUserMutation.mutate({ userId: friend.id })}
                        disabled={blockUserMutation.isPending}
                      >
                        <ShieldBan className="mr-1 h-3.5 w-3.5" />
                        Bloquear
                      </Button>
                    </div>
                  </div>
                ))
              )}
            </div>
          </section>
        </aside>
      </div>
    </div>
  );
}
