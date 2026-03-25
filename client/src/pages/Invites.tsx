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

  const { data: myCode, isLoading: loadingCode } = trpc.invites.getMyCode.useQuery();
  const { data: myInvites, isLoading: loadingInvites } = trpc.invites.list.useQuery();
  const { data: ranking, isLoading: loadingRanking } = trpc.invites.ranking.useQuery({ limit: 10 });

  const createInviteMutation = trpc.invites.create.useMutation({
    onSuccess: () => {
      toast.success("Convite enviado com sucesso!");
      setEmail("");
    },
    onError: (error) => {
      toast.error(`Erro ao criar convite: ${error.message}`);
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
    <div className="space-y-6">
      {/* Header */}
      <div>
        <h1 className="text-2xl font-bold">Convites</h1>
        <p className="text-muted-foreground">
          Convide amigos e suba no ranking!
        </p>
      </div>

      <div className="grid gap-6 md:grid-cols-2">
        {/* My Invite Link */}
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <Share2 className="h-5 w-5 text-primary" />
              Seu Link de Convite
            </CardTitle>
            <CardDescription>
              Compartilhe este link com seus amigos para convidá-los
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="flex gap-2">
              <Input
                value={inviteUrl}
                readOnly
                className="font-mono text-sm"
              />
              <Button variant="outline" size="icon" onClick={copyInviteLink}>
                <Copy className="h-4 w-4" />
              </Button>
              <Button onClick={shareInvite}>
                <Share2 className="h-4 w-4 mr-2" />
                Compartilhar
              </Button>
            </div>

            <div className="flex items-center gap-4 p-4 bg-muted/50 rounded-lg">
              <div className="flex items-center gap-2">
                <Users className="h-5 w-5 text-primary" />
                <span className="text-2xl font-bold">{acceptedInvites.length}</span>
              </div>
              <div className="text-sm text-muted-foreground">
                {acceptedInvites.length === 1 ? "amigo convidado" : "amigos convidados"}
              </div>
            </div>
          </CardContent>
        </Card>

        {/* Send Invite by Email */}
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <Mail className="h-5 w-5 text-primary" />
              Enviar Convite por Email
            </CardTitle>
            <CardDescription>
              Envie um convite diretamente para o email do seu amigo
            </CardDescription>
          </CardHeader>
          <CardContent>
            <form onSubmit={handleSendInvite} className="space-y-4">
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
        <TabsList>
          <TabsTrigger value="ranking" className="flex items-center gap-2">
            <Trophy className="h-4 w-4" />
            Ranking
          </TabsTrigger>
          <TabsTrigger value="invites" className="flex items-center gap-2">
            <Users className="h-4 w-4" />
            Meus Convites ({myInvites?.length || 0})
          </TabsTrigger>
        </TabsList>

        <TabsContent value="ranking" className="mt-4">
          <Card>
            <CardHeader>
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
                <div className="space-y-3">
                  {ranking.map((player, index) => (
                    <div
                      key={player.id}
                      className={`flex items-center gap-4 p-3 rounded-lg ${
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
                        <p className="text-lg font-bold text-primary">
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
            <CardHeader>
              <CardTitle>Meus Convites Enviados</CardTitle>
              <CardDescription>
                Histórico de convites que você enviou
              </CardDescription>
            </CardHeader>
            <CardContent>
              {myInvites && myInvites.length > 0 ? (
                <div className="space-y-3">
                  {myInvites.map((invite) => (
                    <div
                      key={invite.id}
                      className="flex items-center gap-4 p-3 rounded-lg bg-muted/30"
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
