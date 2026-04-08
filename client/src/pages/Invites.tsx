import { useState } from "react";
import { trpc } from "@/lib/trpc";
import { useAuth } from "@/_core/hooks/useAuth";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Skeleton } from "@/components/ui/skeleton";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Badge } from "@/components/ui/badge";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { toast } from "sonner";
import {
  Copy,
  Share2,
  Trophy,
  Users,
  Mail,
  Check,
  Clock,
  Crown,
  Medal,
  Award,
  UserPlus,
  Search,
} from "lucide-react";

function formatDate(date: Date | string): string {
  return new Intl.DateTimeFormat("pt-BR", {
    day: "2-digit",
    month: "short",
    year: "numeric",
  }).format(new Date(date));
}

function getInitials(name: string | null | undefined): string {
  if (!name) return "?";
  return name
    .split(" ")
    .map((n) => n[0])
    .join("")
    .toUpperCase()
    .slice(0, 2);
}

function getRankIcon(position: number) {
  switch (position) {
    case 1:
      return <Crown className="h-5 w-5 text-yellow-500" />;
    case 2:
      return <Medal className="h-5 w-5 text-gray-400" />;
    case 3:
      return <Award className="h-5 w-5 text-amber-600" />;
    default:
      return <span className="text-muted-foreground font-medium">{position}º</span>;
  }
}

export default function Invites() {
  const { user } = useAuth();
  const [email, setEmail] = useState("");
  const [nicknameInput, setNicknameInput] = useState("");
  const [search, setSearch] = useState("");

  const { data: myCode, isLoading: loadingCode } = trpc.invites.getMyCode.useQuery();
  const { data: myInvites, isLoading: loadingInvites } = trpc.invites.list.useQuery();
  const { data: ranking, isLoading: loadingRanking } = trpc.invites.ranking.useQuery({ limit: 10 });
  const { data: friends = [], isLoading: loadingFriends } = trpc.ranking.friends.useQuery();
  const { data: incomingRequests = [], isLoading: loadingIncomingRequests } = trpc.ranking.incomingRequests.useQuery();
  const { data: outgoingRequests = [], isLoading: loadingOutgoingRequests } = trpc.ranking.outgoingRequests.useQuery();
  const { data: searchResults = [], isFetching: loadingSearch } = trpc.ranking.searchUsers.useQuery(
    { query: search },
    { enabled: search.trim().length >= 2 }
  );

  const createInviteMutation = trpc.invites.create.useMutation({
    onSuccess: () => {
      toast.success("Convite enviado com sucesso!");
      setEmail("");
    },
    onError: (error) => {
      toast.error(`Erro ao criar convite: ${error.message}`);
    },
  });

  const utils = trpc.useUtils();
  const sendFriendRequestMutation = trpc.ranking.sendRequest.useMutation({
    onSuccess: async () => {
      await Promise.all([
        utils.ranking.friends.invalidate(),
        utils.ranking.searchUsers.invalidate(),
        utils.ranking.incomingRequests.invalidate(),
        utils.ranking.outgoingRequests.invalidate(),
      ]);
      setSearch("");
      toast.success("Pedido de amizade enviado.");
    },
    onError: (error) => {
      toast.error(error.message);
    },
  });

  const sendFriendRequestByNicknameMutation = trpc.ranking.sendRequestByNickname.useMutation({
    onSuccess: async () => {
      await Promise.all([
        utils.ranking.friends.invalidate(),
        utils.ranking.searchUsers.invalidate(),
        utils.ranking.incomingRequests.invalidate(),
        utils.ranking.outgoingRequests.invalidate(),
      ]);
      setNicknameInput("");
      toast.success("Pedido por nickname enviado.");
    },
    onError: (error) => {
      toast.error(error.message);
    },
  });

  const respondRequestMutation = trpc.ranking.respondRequest.useMutation({
    onSuccess: async ({ status }) => {
      await Promise.all([
        utils.ranking.friends.invalidate(),
        utils.ranking.searchUsers.invalidate(),
        utils.ranking.incomingRequests.invalidate(),
        utils.ranking.outgoingRequests.invalidate(),
      ]);
      toast.success(status === "accepted" ? "Pedido aceito." : "Pedido recusado.");
    },
    onError: (error) => {
      toast.error(error.message);
    },
  });

  const cancelRequestMutation = trpc.ranking.cancelRequest.useMutation({
    onSuccess: async () => {
      await Promise.all([
        utils.ranking.searchUsers.invalidate(),
        utils.ranking.incomingRequests.invalidate(),
        utils.ranking.outgoingRequests.invalidate(),
      ]);
      toast.success("Pedido cancelado.");
    },
    onError: (error) => {
      toast.error(error.message);
    },
  });

  const inviteUrl = myCode ? `${window.location.origin}?invite=${myCode.code}` : "";

  const copyInviteLink = () => {
    if (inviteUrl) {
      navigator.clipboard.writeText(inviteUrl);
      toast.success("Link copiado para a área de transferência!");
    }
  };

  const shareInvite = async () => {
    if (navigator.share && inviteUrl) {
      try {
        await navigator.share({
          title: "Convite para The Rail",
          text: `${user?.name || "Um amigo"} está te convidando para usar o The Rail!`,
          url: inviteUrl,
        });
      } catch (e) {
        copyInviteLink();
      }
    } else {
      copyInviteLink();
    }
  };

  const handleSendInvite = (e: React.FormEvent) => {
    e.preventDefault();
    if (email.trim()) {
      createInviteMutation.mutate({ email: email.trim() });
    }
  };

  const acceptedInvites = myInvites?.filter((i) => i.status === "accepted") || [];
  const pendingInvites = myInvites?.filter((i) => i.status === "pending") || [];
  const pendingOutgoingIds = new Set(outgoingRequests.map((request) => request.receiverId));

  if (loadingCode || loadingInvites || loadingRanking) {
    return (
      <div className="space-y-6">
        <Skeleton className="h-10 w-48" />
        <div className="grid gap-6 md:grid-cols-2">
          <Skeleton className="h-64" />
          <Skeleton className="h-64" />
        </div>
      </div>
    );
  }

  return (
    <div className="mx-auto max-w-6xl space-y-5">
      {/* Header */}
      <div>
        <h1 className="text-2xl font-bold">Amizades e Convites</h1>
        <p className="text-muted-foreground">
          Gerencie seus pedidos de amizade e convites da plataforma.
        </p>
      </div>

      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="flex items-center gap-2">
            <UserPlus className="h-5 w-5 text-primary" />
            Pedidos de Amizade
            {incomingRequests.length > 0 && (
              <Badge variant="destructive">{incomingRequests.length} novos</Badge>
            )}
          </CardTitle>
          <CardDescription>
            Envie, aceite ou recuse pedidos de amizade.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="space-y-2">
            <Label>Adicionar por nickname</Label>
            <div className="flex gap-2">
              <Input
                value={nicknameInput}
                onChange={(e) => setNicknameInput(e.target.value)}
                placeholder="Digite o nickname exato"
              />
              <Button
                type="button"
                onClick={() => sendFriendRequestByNicknameMutation.mutate({ nickname: nicknameInput })}
                disabled={sendFriendRequestByNicknameMutation.isPending || nicknameInput.trim().length < 2}
              >
                Enviar
              </Button>
            </div>
          </div>

          <div className="space-y-2">
            <Label>Buscar usuário para adicionar</Label>
            <div className="flex gap-2">
              <Input
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                placeholder="Buscar por nickname, email ou código"
              />
              <Button type="button" variant="outline" size="icon" disabled>
                <Search className="h-4 w-4" />
              </Button>
            </div>
            {search.trim().length >= 2 && (
              <div className="space-y-2">
                {loadingSearch ? (
                  <Skeleton className="h-12 w-full" />
                ) : searchResults.length === 0 ? (
                  <p className="text-sm text-muted-foreground">Nenhum usuário disponível para adicionar.</p>
                ) : (
                  searchResults.map((player) => (
                    <div key={player.id} className="flex items-center gap-3 rounded-lg border p-3">
                      <Avatar className="h-9 w-9">
                        <AvatarImage src={player.avatarUrl ?? undefined} />
                        <AvatarFallback>{getInitials(player.name)}</AvatarFallback>
                      </Avatar>
                      <div className="min-w-0 flex-1">
                        <p className="truncate font-medium">{player.name ?? "Jogador"}</p>
                        <p className="truncate text-xs text-muted-foreground">
                          {player.email ?? "Sem email publico"}
                        </p>
                      </div>
                      <Button
                        size="sm"
                        onClick={() => sendFriendRequestMutation.mutate({ friendId: player.id })}
                        disabled={sendFriendRequestMutation.isPending || pendingOutgoingIds.has(player.id)}
                      >
                        {pendingOutgoingIds.has(player.id) ? "Pendente" : "Enviar pedido"}
                      </Button>
                    </div>
                  ))
                )}
              </div>
            )}
          </div>

          <div className="grid gap-4 md:grid-cols-2">
            <div className="space-y-2">
              <p className="text-sm font-medium">Pedidos recebidos</p>
              {loadingIncomingRequests ? (
                <Skeleton className="h-12 w-full" />
              ) : incomingRequests.length === 0 ? (
                <p className="text-sm text-muted-foreground">Nenhum pedido pendente.</p>
              ) : (
                <div className="space-y-2 max-h-64 overflow-y-auto pr-1">
                  {incomingRequests.map((request) => (
                    <div key={request.id} className="flex items-center gap-3 rounded-lg border p-3">
                      <Avatar className="h-9 w-9">
                        <AvatarImage src={request.requester.avatarUrl ?? undefined} />
                        <AvatarFallback>{getInitials(request.requester.name)}</AvatarFallback>
                      </Avatar>
                      <div className="min-w-0 flex-1">
                        <p className="truncate font-medium">{request.requester.name ?? "Jogador"}</p>
                      </div>
                      <div className="flex gap-2">
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
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>

            <div className="space-y-2">
              <p className="text-sm font-medium">Pedidos enviados</p>
              {loadingOutgoingRequests ? (
                <Skeleton className="h-12 w-full" />
              ) : outgoingRequests.length === 0 ? (
                <p className="text-sm text-muted-foreground">Você não enviou pedidos pendentes.</p>
              ) : (
                <div className="space-y-2 max-h-64 overflow-y-auto pr-1">
                  {outgoingRequests.map((request) => (
                    <div key={request.id} className="flex items-center gap-3 rounded-lg border p-3">
                      <Avatar className="h-9 w-9">
                        <AvatarImage src={request.receiver.avatarUrl ?? undefined} />
                        <AvatarFallback>{getInitials(request.receiver.name)}</AvatarFallback>
                      </Avatar>
                      <div className="min-w-0 flex-1">
                        <p className="truncate font-medium">{request.receiver.name ?? "Jogador"}</p>
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
                  ))}
                </div>
              )}
            </div>
          </div>

          <div className="space-y-2">
            <p className="text-sm font-medium">Sua lista de amigos</p>
            {loadingFriends ? (
              <Skeleton className="h-12 w-full" />
            ) : friends.length === 0 ? (
              <p className="text-sm text-muted-foreground">Você ainda não adicionou ninguém.</p>
            ) : (
              <div className="space-y-2 max-h-64 overflow-y-auto pr-1">
                {friends.map((friend) => (
                  <div key={friend.id} className="flex items-center gap-3 rounded-lg border p-3">
                    <Avatar className="h-9 w-9">
                      <AvatarImage src={friend.avatarUrl ?? undefined} />
                      <AvatarFallback>{getInitials(friend.name)}</AvatarFallback>
                    </Avatar>
                    <div className="min-w-0">
                      <p className="truncate font-medium">{friend.name ?? "Jogador"}</p>
                      <p className="truncate text-xs text-muted-foreground">{friend.email ?? "Sem email publico"}</p>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        </CardContent>
      </Card>

      <div className="grid gap-4 xl:grid-cols-[1.25fr_0.95fr]">
        {/* My Invite Link */}
        <Card>
          <CardHeader className="pb-3">
            <CardTitle className="flex items-center gap-2">
              <Share2 className="h-5 w-5 text-primary" />
              Seu Link de Convite
            </CardTitle>
            <CardDescription>
              Compartilhe este link com seus amigos para convidá-los
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-3">
            <div className="flex flex-col gap-2 sm:flex-row">
              <Input
                value={inviteUrl}
                readOnly
                className="font-mono text-sm sm:flex-1"
              />
              <Button variant="outline" size="icon" onClick={copyInviteLink}>
                <Copy className="h-4 w-4" />
              </Button>
              <Button onClick={shareInvite} className="sm:min-w-[150px]">
                <Share2 className="h-4 w-4 mr-2" />
                Compartilhar
              </Button>
            </div>

            <div className="flex items-center gap-3 rounded-lg border border-border/40 bg-muted/30 px-4 py-3">
              <div className="flex items-center gap-2 rounded-full bg-background/70 px-3 py-2">
                <Users className="h-5 w-5 text-primary" />
                <span className="text-xl font-bold leading-none">{acceptedInvites.length}</span>
              </div>
              <div className="text-sm text-muted-foreground leading-tight">
                {acceptedInvites.length === 1 ? "amigo convidado" : "amigos convidados"}
              </div>
            </div>
          </CardContent>
        </Card>

        {/* Send Invite by Email */}
        <Card>
          <CardHeader className="pb-3">
            <CardTitle className="flex items-center gap-2">
              <Mail className="h-5 w-5 text-primary" />
              Enviar Convite por Email
            </CardTitle>
            <CardDescription>
              Envie um convite diretamente para o email do seu amigo
            </CardDescription>
          </CardHeader>
          <CardContent>
            <form onSubmit={handleSendInvite} className="space-y-3">
              <div className="space-y-2">
                <Label>Email do amigo</Label>
                <Input
                  type="email"
                  placeholder="amigo@email.com"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  required
                />
              </div>
              <Button
                type="submit"
                className="w-full"
                disabled={createInviteMutation.isPending}
              >
                {createInviteMutation.isPending ? "Enviando..." : "Enviar Convite"}
              </Button>
            </form>
          </CardContent>
        </Card>
      </div>

      {/* Tabs for Ranking and My Invites */}
      <Tabs defaultValue="ranking">
        <TabsList className="h-auto flex-wrap justify-start gap-1 bg-transparent p-0">
          <TabsTrigger value="ranking" className="flex items-center gap-2">
            <Trophy className="h-4 w-4" />
            Ranking
          </TabsTrigger>
          <TabsTrigger value="invites" className="flex items-center gap-2">
            <Users className="h-4 w-4" />
            Convites ({myInvites?.length || 0})
          </TabsTrigger>
        </TabsList>

        <TabsContent value="ranking" className="mt-4">
          <Card>
            <CardHeader className="pb-3">
              <CardTitle className="flex items-center gap-2">
                <Trophy className="h-5 w-5 text-yellow-500" />
                Ranking de Convites
              </CardTitle>
              <CardDescription>
                Os jogadores que mais convidaram amigos
              </CardDescription>
            </CardHeader>
            <CardContent>
              {ranking && ranking.length > 0 ? (
                <div className="space-y-2.5">
                  {ranking.map((player, index) => (
                    <div
                      key={player.id}
                      className={`flex items-center gap-3 rounded-lg p-3 ${
                        index < 3 ? "bg-muted/50" : ""
                      } ${player.id === user?.id ? "ring-2 ring-primary" : ""}`}
                    >
                      <div className="w-8 flex justify-center">
                        {getRankIcon(index + 1)}
                      </div>
                      <Avatar className="h-10 w-10">
                        <AvatarImage src={player.avatarUrl || undefined} />
                        <AvatarFallback>{getInitials(player.name)}</AvatarFallback>
                      </Avatar>
                      <div className="flex-1">
                        <p className="font-medium">
                          {player.name || "Jogador"}
                          {player.id === user?.id && (
                            <Badge variant="outline" className="ml-2">
                              Você
                            </Badge>
                          )}
                        </p>
                      </div>
                      <div className="text-right">
                        <p className="text-base font-bold text-primary leading-none">
                          {player.inviteCount}
                        </p>
                        <p className="text-xs text-muted-foreground">convites</p>
                      </div>
                    </div>
                  ))}
                </div>
              ) : (
                <div className="text-center py-8 text-muted-foreground">
                  <Trophy className="h-12 w-12 mx-auto mb-4 opacity-50" />
                  <p>Nenhum convite aceito ainda.</p>
                  <p className="text-sm">Seja o primeiro a convidar amigos!</p>
                </div>
              )}
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="invites" className="mt-4">
          <Card>
            <CardHeader className="pb-3">
              <CardTitle>Meus Convites Enviados</CardTitle>
              <CardDescription>
                Histórico de convites que você enviou
              </CardDescription>
            </CardHeader>
            <CardContent>
              {myInvites && myInvites.length > 0 ? (
                <div className="space-y-2.5">
                  {myInvites.map((invite) => (
                    <div
                      key={invite.id}
                      className="flex items-center gap-3 rounded-lg border border-border/40 bg-muted/20 p-3"
                    >
                      <div className="flex-1">
                        <p className="font-medium">
                          {invite.inviteeEmail || `Código: ${invite.code}`}
                        </p>
                        <p className="text-sm text-muted-foreground">
                          Enviado em {formatDate(invite.createdAt)}
                        </p>
                      </div>
                      <Badge
                        variant={
                          invite.status === "accepted"
                            ? "default"
                            : invite.status === "expired"
                            ? "destructive"
                            : "secondary"
                        }
                        className="flex items-center gap-1"
                      >
                        {invite.status === "accepted" ? (
                          <>
                            <Check className="h-3 w-3" /> Aceito
                          </>
                        ) : invite.status === "expired" ? (
                          <>
                            <Clock className="h-3 w-3" /> Expirado
                          </>
                        ) : (
                          <>
                            <Clock className="h-3 w-3" /> Pendente
                          </>
                        )}
                      </Badge>
                    </div>
                  ))}
                </div>
              ) : (
                <div className="text-center py-8 text-muted-foreground">
                  <Mail className="h-12 w-12 mx-auto mb-4 opacity-50" />
                  <p>Você ainda não enviou nenhum convite.</p>
                  <p className="text-sm">
                    Compartilhe seu link ou envie por email!
                  </p>
                </div>
              )}
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>
    </div>
  );
}
