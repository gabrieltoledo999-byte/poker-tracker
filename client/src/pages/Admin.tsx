import { useEffect, useMemo, useState } from "react";
import {
  Activity,
  Bell,
  Building2,
  ChartBar,
  Clock3,
  Crown,
  ExternalLink,
  FolderOpen,
  FolderTree,
  Lock,
  MessageCircle,
  ShieldCheck,
  Sparkles,
  TrendingUp,
  UserPlus,
  Users,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { trpc } from "@/lib/trpc";
import { useAuth } from "@/_core/hooks/useAuth";
import { useLocation } from "wouter";
import { toast } from "sonner";
import { Cell, Pie, PieChart, ResponsiveContainer, Tooltip as RechartsTooltip } from "recharts";

const DRIVE_STORAGE_KEY = "the-rail-company-drive-url";

const defaultDriveUrl = import.meta.env.VITE_THE_RAIL_DRIVE_URL || "https://drive.google.com/drive/folders/1F10cYfnFre-VoqzGiGbBZVZDamwOv5wb";

const BOARD_ACCESS_IDENTIFIERS = ["toleto", "hugo"];
const BOARD_ACCESS_EMAILS = ["gabriel.toledo999@gmail.com"];

function normalizeIdentityToken(value: unknown): string {
  return String(value ?? "")
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .trim();
}

function isBoardAdminUser(user: {
  role?: string | null;
  name?: string | null;
  email?: string | null;
  openId?: string | null;
} | null | undefined): boolean {
  if (!user) return false;
  if (String(user.role ?? "").toLowerCase() !== "admin") return false;

  const normalizedEmail = normalizeIdentityToken(user.email);
  if (normalizedEmail && BOARD_ACCESS_EMAILS.includes(normalizedEmail)) return true;

  const tokens = [user.name, user.email, user.openId].map(normalizeIdentityToken).filter(Boolean);
  return tokens.some((token) => BOARD_ACCESS_IDENTIFIERS.some((id) => token.includes(id)));
}

const folders = [
  {
    name: "Estrategia",
    description: "Visao da empresa, objetivos, decisoes importantes e roadmap.",
    items: ["Visao da empresa", "Objetivos", "Decisoes importantes", "Roadmap"],
  },
  {
    name: "Equipe",
    description: "Gestao de pessoas, cargos, responsabilidades e planilha principal.",
    items: ["Planilha principal da equipe", "Definicao de cargos", "Responsabilidades"],
  },
  {
    name: "Produto",
    description: "Funcionalidades, melhorias, feedbacks e bugs.",
    items: ["Ideias de funcionalidades", "Melhorias", "Feedbacks", "Bugs"],
  },
  {
    name: "Operacoes",
    description: "Tarefas, processos e organizacao interna.",
    items: ["Tarefas", "Processos", "Organizacao interna"],
  },
  {
    name: "Financeiro",
    description: "Custos, receitas e planejamento financeiro para crescimento.",
    items: ["Custos", "Receitas", "Planejamento financeiro"],
  },
];

const LEVEL_DEFINITIONS = [
  { key: "N1", label: "Recreativo", visual: "A", color: "#6366f1" },
  { key: "N2", label: "Grinder", visual: "C", color: "#22c55e" },
  { key: "N3", label: "Reg", visual: "S", color: "#9ca3af" },
  { key: "N4", label: "Mid Stakes", visual: "D", color: "#f59e0b" },
  { key: "N5", label: "High Stakes", visual: "H", color: "#ef4444" },
  { key: "N6", label: "The Edge", visual: "AE", color: "#a855f7" },
  { key: "N7", label: "High Roller", visual: "HR", color: "#eab308" },
];

function normalizeLeagueToken(value: unknown): string {
  return String(value ?? "")
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .trim();
}

function inferLevelKey(userItem: any): string {
  const role = normalizeLeagueToken(userItem?.role);
  if (role === "admin" || role === "developer" || role === "system_ai_service") {
    return "N7";
  }

  const rawTier = normalizeLeagueToken(userItem?.tier);
  if (rawTier.includes("high roller")) return "N7";
  if (rawTier.includes("the edge") || rawTier.includes("edge")) return "N6";
  if (rawTier.includes("high stakes")) return "N5";
  if (rawTier.includes("mid stakes")) return "N4";
  if (rawTier === "reg" || rawTier.includes("regular")) return "N3";
  if (rawTier.includes("grinder")) return "N2";
  if (rawTier.includes("recreativo")) return "N1";

  return "N7";
}

function getAvatarSrc(entry: { id?: number; name?: string; email?: string; avatarUrl?: string }): string {
  if (entry.avatarUrl) return entry.avatarUrl;
  const seed = encodeURIComponent(String(entry.id ?? entry.email ?? entry.name ?? "the-rail"));
  return `https://api.dicebear.com/9.x/thumbs/svg?seed=${seed}`;
}

export default function Admin() {
  const { user, loading } = useAuth();
  const [, setLocation] = useLocation();
  const [driveUrl, setDriveUrl] = useState("");
  const [draftUrl, setDraftUrl] = useState("");
  const [userSearch, setUserSearch] = useState("");
  const [selectedUserId, setSelectedUserId] = useState<number | null>(null);

  const isBoardAdmin = isBoardAdminUser(user as any);

  const companyOverviewQuery = trpc.admin.companyOverview.useQuery(undefined, {
    enabled: !loading && isBoardAdmin,
    staleTime: 30 * 1000,
    refetchOnWindowFocus: false,
  });

  const onlineUsersQuery = trpc.admin.onlineUsers.useQuery(undefined, {
    enabled: !loading && isBoardAdmin,
    staleTime: 30 * 1000,
    refetchOnWindowFocus: false,
  });

  const selectedUser = useMemo(() => {
    if (!selectedUserId) return null;
    return (companyOverviewQuery.data?.users ?? []).find((entry: any) => Number(entry.id) === selectedUserId) ?? null;
  }, [companyOverviewQuery.data?.users, selectedUserId]);

  const diagnoseSearchValue = useMemo(() => {
    if (!selectedUser) return "";
    return String(selectedUser.email || selectedUser.name || selectedUser.id || "").trim();
  }, [selectedUser]);

  const diagnoseUserQuery = trpc.admin.diagnoseUser.useQuery(
    { search: diagnoseSearchValue },
    {
      enabled: !loading && isBoardAdmin && diagnoseSearchValue.length >= 2,
      staleTime: 30 * 1000,
      refetchOnWindowFocus: false,
    },
  );

  const selectedUserHistoryQuery = trpc.memory.playerHistoricalProfileByUserId.useQuery(
    { userId: Number(selectedUserId ?? 0) },
    {
      enabled: !loading && isBoardAdmin && Number(selectedUserId ?? 0) > 0,
      staleTime: 30 * 1000,
      refetchOnWindowFocus: false,
    },
  );

  // Redirect if not admin
  useEffect(() => {
    if (loading) return;
    if (!user) {
      setLocation("/login");
      return;
    }
    if (!isBoardAdminUser(user as any)) {
      toast.error("Acesso restrito a diretoria.");
      setLocation("/");
      return;
    }
  }, [user, loading, setLocation]);

  useEffect(() => {
    const saved = localStorage.getItem(DRIVE_STORAGE_KEY) || defaultDriveUrl;
    setDriveUrl(saved);
    setDraftUrl(saved);
  }, []);

  const handleSaveDriveUrl = () => {
    const cleaned = draftUrl.trim();
    localStorage.setItem(DRIVE_STORAGE_KEY, cleaned);
    setDriveUrl(cleaned);
    toast.success("Link do Google Drive salvo na aba Administracao.");
  };

  const handleOpenDrive = () => {
    if (!driveUrl) {
      toast.error("Defina o link do Google Drive antes de abrir.");
      return;
    }
    window.open(driveUrl, "_blank", "noopener,noreferrer");
  };

  // Show loading state while checking authentication
  if (loading) {
    return (
      <div className="flex items-center justify-center min-h-screen">
        <div className="text-center space-y-3">
          <ShieldCheck className="h-12 w-12 mx-auto text-muted-foreground" />
          <p className="text-muted-foreground">Verificando permissões...</p>
        </div>
      </div>
    );
  }

  // Show access denied if not board admin
  if (!user || !isBoardAdmin) {
    return (
      <div className="flex items-center justify-center min-h-screen">
        <Card className="max-w-md border-destructive/50">
          <CardHeader className="text-center">
            <div className="flex justify-center mb-3">
              <Lock className="h-12 w-12 text-destructive" />
            </div>
            <CardTitle>Acesso Negado</CardTitle>
            <CardDescription className="mt-2 text-base font-semibold text-destructive">
              Acesso restrito a diretoria.
            </CardDescription>
          </CardHeader>
          <CardContent>
            <Button onClick={() => setLocation("/")} className="w-full">
              Voltar ao Início
            </Button>
          </CardContent>
        </Card>
      </div>
    );
  }

  const overview = companyOverviewQuery.data;
  const users = overview?.users ?? [];
  const totals = overview?.totals;

  const createdInLast30Days = useMemo(() => {
    const now = Date.now();
    return users.filter((u: any) => {
      if (!u.createdAt) return false;
      const createdAt = new Date(u.createdAt).getTime();
      if (!Number.isFinite(createdAt)) return false;
      return now - createdAt <= 30 * 24 * 60 * 60 * 1000;
    }).length;
  }, [users]);

  const usersOnline = Number(onlineUsersQuery.data?.onlineNow ?? totals?.onlineNow ?? 0);
  const totalUsers = Number(totals?.totalUsers ?? 0);
  const withEmail = Number(totals?.withEmail ?? 0);
  const withAvatar = Number(totals?.withAvatar ?? 0);

  const filteredUsers = useMemo(() => {
    const token = normalizeLeagueToken(userSearch);
    if (!token) return users;
    return users.filter((entry: any) => {
      const haystack = [
        entry.id,
        entry.name,
        entry.email,
        entry.openId,
        entry.role,
      ]
        .map((value) => normalizeLeagueToken(value))
        .join(" ");
      return haystack.includes(token);
    });
  }, [users, userSearch]);

  useEffect(() => {
    if (filteredUsers.length === 0) {
      setSelectedUserId(null);
      return;
    }
    if (!selectedUserId || !filteredUsers.some((entry: any) => Number(entry.id) === selectedUserId)) {
      setSelectedUserId(Number(filteredUsers[0].id));
    }
  }, [filteredUsers, selectedUserId]);

  const latestUsers = useMemo(() => {
    return [...filteredUsers].slice(0, 20);
  }, [filteredUsers]);

  const formatDateOnly = (value: string | Date | null | undefined) => {
    if (!value) return "-";
    const date = new Date(value);
    if (!Number.isFinite(date.getTime())) return "-";
    return new Intl.DateTimeFormat("pt-BR", {
      day: "2-digit",
      month: "2-digit",
      year: "numeric",
    }).format(date);
  };

  const formatDateTime = (value: string | Date | null | undefined) => {
    if (!value) return "-";
    const date = new Date(value);
    if (!Number.isFinite(date.getTime())) return "-";
    return new Intl.DateTimeFormat("pt-BR", {
      day: "2-digit",
      month: "2-digit",
      year: "numeric",
      hour: "2-digit",
      minute: "2-digit",
    }).format(date);
  };

  const formatPercent = (value: number | null | undefined) => `${Number(value ?? 0).toFixed(1)}%`;

  const activityRows = useMemo(() => {
    return users
      .filter((u: any) => Boolean(u.lastSignedIn))
      .sort((a: any, b: any) => {
        const aTime = a.lastSignedIn ? new Date(a.lastSignedIn).getTime() : 0;
        const bTime = b.lastSignedIn ? new Date(b.lastSignedIn).getTime() : 0;
        return bTime - aTime;
      })
      .slice(0, 6);
  }, [users]);

  const levelCards = useMemo(() => {
    const countByLevel = new Map<string, number>();
    for (const def of LEVEL_DEFINITIONS) {
      countByLevel.set(def.key, 0);
    }

    for (const item of users) {
      const key = inferLevelKey(item);
      countByLevel.set(key, Number(countByLevel.get(key) ?? 0) + 1);
    }

    return LEVEL_DEFINITIONS.map((def) => {
      const count = Number(countByLevel.get(def.key) ?? 0);
      const pct = totalUsers > 0 ? (count / totalUsers) * 100 : 0;
      return {
        ...def,
        count,
        pct,
      };
    });
  }, [users, totalUsers]);

  const levelChartData = useMemo(() => {
    return levelCards
      .filter((item) => item.count > 0)
      .map((item) => ({
        name: `${item.key} ${item.label}`,
        value: item.count,
        fill: item.color,
      }));
  }, [levelCards]);

  const cards = [
    {
      title: "Usuarios Totais",
      value: String(totalUsers),
      subtitle: "Base geral ativa",
      icon: Users,
      tone: "from-violet-500/25 to-fuchsia-500/10 border-violet-400/30",
    },
    {
      title: "Novos (30 dias)",
      value: String(createdInLast30Days),
      subtitle: "Cadastros recentes",
      icon: UserPlus,
      tone: "from-emerald-500/25 to-lime-500/10 border-emerald-400/30",
    },
    {
      title: "Online Agora",
      value: String(usersOnline),
      subtitle: "Janela de 15 minutos",
      icon: Activity,
      tone: "from-cyan-500/25 to-blue-500/10 border-cyan-400/30",
    },
    {
      title: "Com Email",
      value: String(withEmail),
      subtitle: "Qualidade de cadastro",
      icon: MessageCircle,
      tone: "from-amber-500/25 to-orange-500/10 border-amber-400/30",
    },
    {
      title: "Com Avatar",
      value: String(withAvatar),
      subtitle: "Perfil completo",
      icon: Sparkles,
      tone: "from-indigo-500/25 to-violet-500/10 border-indigo-400/30",
    },
  ];

  const systemStatus = [
    { label: "Aplicacao", ok: true },
    { label: "Banco de Dados", ok: true },
    { label: "Notificacoes", ok: true },
    { label: "Sessoes", ok: true },
  ];

  return (
    <div className="mx-auto w-full max-w-[1320px] space-y-4">
      <div className="rounded-2xl border border-white/10 bg-[radial-gradient(circle_at_top_right,rgba(124,58,237,0.22),transparent_45%),radial-gradient(circle_at_top_left,rgba(6,182,212,0.18),transparent_35%),linear-gradient(180deg,rgba(2,6,23,0.95),rgba(2,6,23,0.9))] p-4 sm:p-5">
        <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
          <div>
            <h1 className="text-2xl font-black tracking-tight text-white">Painel Executivo</h1>
            <p className="text-sm text-slate-300">
              Panorama geral da empresa com dados reais do banco e visao estrategica da diretoria.
            </p>
          </div>
          <div className="flex flex-wrap items-center gap-2">
            <Badge className="gap-1.5 border-violet-400/40 bg-violet-500/20 text-violet-100 hover:bg-violet-500/30">
              <ShieldCheck className="h-3.5 w-3.5" />
              Diretoria
            </Badge>
            <Badge className="gap-1.5 border-emerald-400/40 bg-emerald-500/20 text-emerald-100 hover:bg-emerald-500/30">
              <TrendingUp className="h-3.5 w-3.5" />
              Atualizado em tempo real
            </Badge>
          </div>
        </div>

        <div className="mt-4 grid gap-3 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-5">
          {cards.map((item) => {
            const Icon = item.icon;
            return (
              <div
                key={item.title}
                className={`rounded-xl border ${item.tone} bg-gradient-to-br p-3 shadow-[0_0_0_1px_rgba(255,255,255,0.03),0_10px_30px_rgba(2,6,23,0.35)]`}
              >
                <div className="flex items-center justify-between">
                  <p className="text-xs uppercase tracking-[0.12em] text-slate-300">{item.title}</p>
                  <Icon className="h-4 w-4 text-white/80" />
                </div>
                <p className="mt-2 text-2xl font-black text-white">{item.value}</p>
                <p className="mt-1 text-[11px] text-slate-300">{item.subtitle}</p>
              </div>
            );
          })}
        </div>
      </div>

      <div className="grid gap-4 xl:grid-cols-[minmax(0,2fr)_minmax(0,1fr)]">
        <Card className="border-white/10 bg-slate-950/65 backdrop-blur xl:col-span-2">
          <CardHeader>
            <CardTitle className="flex items-center gap-2 text-base text-slate-100">
              <Crown className="h-4 w-4 text-amber-300" />
              Distribuicao por Nivel de Acesso
            </CardTitle>
            <CardDescription className="text-slate-400">
              Quantidade por nivel com visual de cards e grafico.
            </CardDescription>
          </CardHeader>
          <CardContent className="grid gap-4 lg:grid-cols-[minmax(0,2fr)_minmax(0,1fr)]">
            <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4 xl:grid-cols-7">
              {levelCards.map((level) => (
                <div key={level.key} className="rounded-xl border border-white/10 bg-white/[0.03] p-3 text-center">
                  <p className="text-xs font-semibold tracking-[0.12em] text-slate-400">{level.key}</p>
                  <div className="mx-auto mt-2 flex h-12 w-12 items-center justify-center rounded-full border text-sm font-black" style={{ borderColor: `${level.color}66`, color: level.color, backgroundColor: `${level.color}1A` }}>
                    {level.visual}
                  </div>
                  <p className="mt-2 text-xs font-semibold text-slate-200">{level.label}</p>
                  <p className="mt-1 text-lg font-black text-white">{level.count}</p>
                  <p className="text-[11px] text-slate-400">{level.pct.toFixed(1)}%</p>
                </div>
              ))}
            </div>

            <div className="rounded-xl border border-white/10 bg-white/[0.03] p-2">
              {levelChartData.length > 0 ? (
                <ResponsiveContainer width="100%" height={250}>
                  <PieChart>
                    <Pie
                      data={levelChartData}
                      dataKey="value"
                      nameKey="name"
                      cx="50%"
                      cy="50%"
                      innerRadius={55}
                      outerRadius={88}
                      stroke="rgba(15,23,42,0.8)"
                      strokeWidth={2}
                    >
                      {levelChartData.map((entry) => (
                        <Cell key={entry.name} fill={entry.fill} />
                      ))}
                    </Pie>
                    <RechartsTooltip
                      formatter={(value: number, name: string) => [String(value), name]}
                      contentStyle={{
                        background: "rgba(2,6,23,0.95)",
                        border: "1px solid rgba(148,163,184,0.3)",
                        color: "#e2e8f0",
                      }}
                    />
                  </PieChart>
                </ResponsiveContainer>
              ) : (
                <div className="flex h-[250px] items-center justify-center text-sm text-slate-400">
                  Sem dados para grafico.
                </div>
              )}
            </div>
          </CardContent>
        </Card>

        <Card className="border-white/10 bg-slate-950/65 backdrop-blur">
          <CardHeader>
            <CardTitle className="flex items-center gap-2 text-base text-slate-100">
              <ChartBar className="h-4 w-4 text-violet-300" />
              Usuarios (Busca e Filtro)
            </CardTitle>
            <CardDescription className="text-slate-400">
              Busca por nome, email, id, openId ou papel para achar qualquer usuario rapido.
            </CardDescription>
            <div className="pt-2">
              <Input
                value={userSearch}
                onChange={(event) => setUserSearch(event.target.value)}
                placeholder="Buscar usuario por nome, email, id, openId..."
                className="border-white/20 bg-white/5 text-slate-100 placeholder:text-slate-500"
              />
            </div>
          </CardHeader>
          <CardContent>
            {companyOverviewQuery.isLoading ? (
              <p className="text-sm text-slate-400">Carregando dados da empresa...</p>
            ) : latestUsers.length > 0 ? (
              <div className="overflow-x-auto">
                <table className="w-full min-w-[920px] text-sm">
                  <thead>
                    <tr className="border-b border-white/10 text-left text-[11px] uppercase tracking-[0.12em] text-slate-400">
                      <th className="py-2 font-medium">Usuario</th>
                      <th className="py-2 font-medium">Email</th>
                      <th className="py-2 font-medium">Nivel</th>
                      <th className="py-2 font-medium">Cadastro</th>
                      <th className="py-2 font-medium">Ultimo Acesso</th>
                      <th className="py-2 font-medium">Status</th>
                      <th className="py-2 font-medium">Perfil</th>
                    </tr>
                  </thead>
                  <tbody>
                    {latestUsers.map((entry: any) => {
                      return (
                        <tr
                          key={entry.id}
                          className={`border-b border-white/5 text-slate-200 ${selectedUserId === Number(entry.id) ? "bg-violet-500/10" : ""}`}
                        >
                          <td className="py-2.5">
                            <div className="flex items-center gap-2">
                              <Avatar className="h-8 w-8 border border-white/15">
                                <AvatarImage src={getAvatarSrc(entry)} alt={entry.name || "usuario"} />
                                <AvatarFallback className="text-[10px] font-semibold">{String(entry.name || "U").slice(0, 2).toUpperCase()}</AvatarFallback>
                              </Avatar>
                              <div>
                                <p className="font-medium">{entry.name}</p>
                                <p className="text-[11px] text-slate-400">ID {entry.id}</p>
                              </div>
                            </div>
                          </td>
                          <td className="py-2.5 text-slate-300">{entry.email || "-"}</td>
                          <td className="py-2.5">
                            <Badge variant="outline" className="border-white/20 bg-white/5 text-slate-200">
                              {inferLevelKey(entry)}
                            </Badge>
                          </td>
                          <td className="py-2.5 text-slate-300">{formatDateOnly(entry.createdAt)}</td>
                          <td className="py-2.5 text-slate-300">{formatDateTime(entry.lastSignedIn)}</td>
                          <td className="py-2.5">
                            <Badge className={entry.isOnline ? "bg-emerald-500/20 text-emerald-200 border-emerald-400/30" : "bg-slate-500/20 text-slate-300 border-slate-400/30"}>
                              {entry.isOnline ? "Online" : "Offline"}
                            </Badge>
                          </td>
                          <td className="py-2.5">
                            <Button
                              size="sm"
                              variant="outline"
                              className="border-white/20 bg-white/5 text-slate-100 hover:bg-white/10"
                              onClick={() => setSelectedUserId(Number(entry.id))}
                            >
                              Ver perfil
                            </Button>
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            ) : (
              <p className="text-sm text-slate-400">Nenhum usuario encontrado.</p>
            )}
          </CardContent>
        </Card>

        <div className="space-y-4">
          <Card className="border-white/10 bg-slate-950/65 backdrop-blur">
            <CardHeader>
              <CardTitle className="flex items-center gap-2 text-base text-slate-100">
                <Users className="h-4 w-4 text-violet-300" />
                Perfil Completo do Usuario
              </CardTitle>
              <CardDescription className="text-slate-400">
                Dados de pronta mao para auditoria (sem trocar de aba).
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-3">
              {selectedUser ? (
                <>
                  <div className="flex items-center gap-3 rounded-lg border border-white/10 bg-white/5 p-3">
                    <Avatar className="h-12 w-12 border border-white/15">
                      <AvatarImage src={getAvatarSrc(selectedUser)} alt={selectedUser.name || "usuario"} />
                      <AvatarFallback className="text-xs font-semibold">{String(selectedUser.name || "U").slice(0, 2).toUpperCase()}</AvatarFallback>
                    </Avatar>
                    <div>
                      <p className="font-semibold text-slate-100">{selectedUser.name}</p>
                      <p className="text-xs text-slate-400">{selectedUser.email || "Sem email"}</p>
                    </div>
                  </div>

                  <div className="grid gap-2 text-xs sm:grid-cols-2">
                    <div className="rounded-md border border-white/10 bg-white/5 p-2"><span className="text-slate-400">ID</span><p className="text-slate-100">{selectedUser.id}</p></div>
                    <div className="rounded-md border border-white/10 bg-white/5 p-2"><span className="text-slate-400">OpenID</span><p className="truncate text-slate-100">{selectedUser.openId || "-"}</p></div>
                    <div className="rounded-md border border-white/10 bg-white/5 p-2"><span className="text-slate-400">Papel</span><p className="text-slate-100">{selectedUser.role || "user"}</p></div>
                    <div className="rounded-md border border-white/10 bg-white/5 p-2"><span className="text-slate-400">Metodo de login</span><p className="text-slate-100">{selectedUser.loginMethod || "-"}</p></div>
                    <div className="rounded-md border border-white/10 bg-white/5 p-2"><span className="text-slate-400">Cadastro</span><p className="text-slate-100">{formatDateOnly(selectedUser.createdAt)}</p></div>
                    <div className="rounded-md border border-white/10 bg-white/5 p-2"><span className="text-slate-400">Ultimo acesso</span><p className="text-slate-100">{formatDateTime(selectedUser.lastSignedIn)}</p></div>
                    <div className="rounded-md border border-white/10 bg-white/5 p-2"><span className="text-slate-400">Atualizado em</span><p className="text-slate-100">{formatDateTime(selectedUser.updatedAt)}</p></div>
                    <div className="rounded-md border border-white/10 bg-white/5 p-2"><span className="text-slate-400">Nivel</span><p className="text-slate-100">{inferLevelKey(selectedUser)}</p></div>
                    <div className="rounded-md border border-white/10 bg-white/5 p-2"><span className="text-slate-400">Invite code</span><p className="text-slate-100">{selectedUser.inviteCode || "-"}</p></div>
                    <div className="rounded-md border border-white/10 bg-white/5 p-2"><span className="text-slate-400">Convidado por</span><p className="text-slate-100">{selectedUser.invitedBy ?? "-"}</p></div>
                    <div className="rounded-md border border-white/10 bg-white/5 p-2"><span className="text-slate-400">Convites enviados</span><p className="text-slate-100">{selectedUser.inviteCount ?? 0}</p></div>
                    <div className="rounded-md border border-white/10 bg-white/5 p-2"><span className="text-slate-400">Play type</span><p className="text-slate-100">{selectedUser.preferredPlayType || "-"}</p></div>
                  </div>

                  <div className="rounded-md border border-white/10 bg-white/5 p-2 text-xs">
                    <p className="text-slate-400">Preferencias</p>
                    <p className="mt-1 text-slate-100">Platforms: {selectedUser.preferredPlatforms || "-"}</p>
                    <p className="text-slate-100">Formats: {selectedUser.preferredFormats || "-"}</p>
                    <p className="text-slate-100">Buy-ins: {selectedUser.preferredBuyIns || "-"}</p>
                    <p className="text-slate-100">Buy-ins online: {selectedUser.preferredBuyInsOnline || "-"}</p>
                    <p className="text-slate-100">Buy-ins live: {selectedUser.preferredBuyInsLive || "-"}</p>
                  </div>

                  <div className="rounded-md border border-white/10 bg-white/5 p-2 text-xs">
                    <p className="text-slate-400">Flags</p>
                    <p className="text-slate-100">Multi-plataforma: {selectedUser.playsMultiPlatform ? "Sim" : "Nao"}</p>
                    <p className="text-slate-100">Ranking global: {selectedUser.showInGlobalRanking ? "Sim" : "Nao"}</p>
                    <p className="text-slate-100">Ranking amigos: {selectedUser.showInFriendsRanking ? "Sim" : "Nao"}</p>
                    <p className="text-slate-100">Consentimento ranking: {formatDateTime(selectedUser.rankingConsentAnsweredAt)}</p>
                    <p className="text-slate-100">Play style respondido: {formatDateTime(selectedUser.playStyleAnsweredAt)}</p>
                    <p className="text-slate-100">Onboarding concluido: {formatDateTime(selectedUser.onboardingCompletedAt)}</p>
                  </div>

                  <div className="rounded-md border border-white/10 bg-white/5 p-2 text-xs">
                    <p className="text-slate-400">Diagnostico tecnico</p>
                    {diagnoseUserQuery.isLoading ? (
                      <p className="text-slate-100">Carregando diagnostico...</p>
                    ) : diagnoseUserQuery.data?.[0] ? (
                      <>
                        <p className="text-slate-100">Mesas recentes: {diagnoseUserQuery.data[0].recentTables?.length ?? 0}</p>
                        <p className="text-slate-100">Mesas orfas: {diagnoseUserQuery.data[0].orphanTables?.length ?? 0}</p>
                        <p className="text-slate-100">Mesas silver: {diagnoseUserQuery.data[0].silverTables?.length ?? 0}</p>
                      </>
                    ) : (
                      <p className="text-slate-100">Sem diagnostico para este usuario.</p>
                    )}
                  </div>

                  <div className="rounded-md border border-white/10 bg-white/5 p-2 text-xs">
                    <p className="text-slate-400">Historico por posicao (VPIP/PFR/3-bet)</p>
                    {selectedUserHistoryQuery.isLoading ? (
                      <p className="text-slate-100">Carregando historico...</p>
                    ) : (selectedUserHistoryQuery.data?.positions?.byPosition?.length ?? 0) > 0 ? (
                      <div className="mt-2 overflow-x-auto">
                        <table className="w-full min-w-[460px] text-left text-xs">
                          <thead>
                            <tr className="border-b border-white/10 text-slate-400">
                              <th className="py-1 pr-3 font-medium">Posicao</th>
                              <th className="py-1 pr-3 font-medium">Maos</th>
                              <th className="py-1 pr-3 font-medium">VPIP</th>
                              <th className="py-1 pr-3 font-medium">PFR</th>
                              <th className="py-1 pr-3 font-medium">3-bet</th>
                            </tr>
                          </thead>
                          <tbody>
                            {selectedUserHistoryQuery.data.positions.byPosition.map((row: any) => (
                              <tr key={`hist-pos-${row.position}`} className="border-b border-white/5 text-slate-100">
                                <td className="py-1 pr-3 font-medium">{row.position}</td>
                                <td className="py-1 pr-3">{Number(row.handsPlayed ?? 0)}</td>
                                <td className="py-1 pr-3">{formatPercent(Number(row.vpip ?? 0))}</td>
                                <td className="py-1 pr-3">{formatPercent(Number(row.pfr ?? 0))}</td>
                                <td className="py-1 pr-3">{formatPercent(Number(row.threeBet ?? 0))}</td>
                              </tr>
                            ))}
                          </tbody>
                        </table>
                      </div>
                    ) : (
                      <p className="text-slate-100">Sem estatisticas historicas por posicao para este usuario.</p>
                    )}
                  </div>
                </>
              ) : (
                <p className="text-sm text-slate-400">Selecione um usuario na tabela para ver o perfil completo.</p>
              )}
            </CardContent>
          </Card>

          <Card className="border-white/10 bg-slate-950/65 backdrop-blur">
            <CardHeader>
              <CardTitle className="flex items-center gap-2 text-base text-slate-100">
                <Building2 className="h-4 w-4 text-cyan-300" />
                Status do Sistema
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-2">
              {systemStatus.map((item) => (
                <div key={item.label} className="flex items-center justify-between rounded-md border border-white/10 bg-white/5 px-3 py-2 text-sm">
                  <span className="text-slate-200">{item.label}</span>
                  <span className="text-emerald-300">{item.ok ? "Online" : "Instavel"}</span>
                </div>
              ))}
            </CardContent>
          </Card>

          <Card className="border-white/10 bg-slate-950/65 backdrop-blur">
            <CardHeader>
              <CardTitle className="flex items-center gap-2 text-base text-slate-100">
                <Clock3 className="h-4 w-4 text-amber-300" />
                Atividades Recentes
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-2">
              {activityRows.length > 0 ? activityRows.map((entry: any) => (
                <div key={`activity-${entry.id}`} className="rounded-md border border-white/10 bg-white/5 px-3 py-2">
                  <p className="text-sm text-slate-200">Login recente de <span className="font-semibold">{entry.name}</span></p>
                  <p className="text-xs text-slate-400">
                    {entry.lastSignedIn ? new Date(entry.lastSignedIn).toLocaleString("pt-BR") : "-"}
                  </p>
                </div>
              )) : (
                <p className="text-sm text-slate-400">Sem atividades recentes.</p>
              )}
            </CardContent>
          </Card>

          <Card className="border-white/10 bg-slate-950/65 backdrop-blur">
            <CardHeader>
              <CardTitle className="flex items-center gap-2 text-base text-slate-100">
                <Bell className="h-4 w-4 text-fuchsia-300" />
                Acoes Rapidas
              </CardTitle>
            </CardHeader>
            <CardContent className="grid gap-2">
              <Button variant="outline" className="justify-start border-white/20 bg-white/5 text-slate-100 hover:bg-white/10">
                <Users className="mr-2 h-4 w-4" /> Ver usuarios
              </Button>
              <Button variant="outline" className="justify-start border-white/20 bg-white/5 text-slate-100 hover:bg-white/10">
                <Crown className="mr-2 h-4 w-4" /> Revisar niveis
              </Button>
              <Button variant="outline" className="justify-start border-white/20 bg-white/5 text-slate-100 hover:bg-white/10">
                <MessageCircle className="mr-2 h-4 w-4" /> Enviar comunicacao
              </Button>
            </CardContent>
          </Card>
        </div>
      </div>

      <div className="grid gap-4 lg:grid-cols-2">
        <Card className="border-white/10 bg-slate-950/65 backdrop-blur">
          <CardHeader>
            <CardTitle className="flex items-center gap-2 text-base text-slate-100">
              <ExternalLink className="h-4 w-4 text-emerald-300" />
              Google Drive da Empresa
            </CardTitle>
            <CardDescription className="text-slate-400">
              Defina o link oficial para centralizar documentos da empresa.
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-3">
            <div className="space-y-2">
              <Label htmlFor="drive-url">Link do Google Drive</Label>
              <Input
                id="drive-url"
                placeholder="https://drive.google.com/drive/folders/..."
                value={draftUrl}
                onChange={(event) => setDraftUrl(event.target.value)}
              />
            </div>
            <div className="flex flex-wrap gap-2">
              <Button onClick={handleSaveDriveUrl}>Salvar Link</Button>
              <Button variant="outline" onClick={handleOpenDrive}>
                <ExternalLink className="mr-2 h-4 w-4" />
                Abrir Google Drive
              </Button>
            </div>
          </CardContent>
        </Card>

        <Card className="border-white/10 bg-slate-950/65 backdrop-blur">
          <CardHeader>
            <CardTitle className="flex items-center gap-2 text-base text-slate-100">
              <FolderOpen className="h-4 w-4 text-violet-300" />
              Estrutura Principal
            </CardTitle>
            <CardDescription className="text-slate-400">
              Pasta raiz THE RAIL com subpastas operacionais para planejamento.
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="rounded-xl border border-violet-400/30 bg-violet-500/10 p-3">
              <div className="flex items-center gap-2 text-violet-100">
                <FolderOpen className="h-4 w-4" />
                <p className="font-semibold">THE RAIL</p>
              </div>
              <p className="mt-1 text-xs text-violet-200/80">Pasta raiz operacional da empresa.</p>
            </div>

            <div className="grid gap-2 sm:grid-cols-2">
              {folders.map((folder) => (
                <div key={folder.name} className="rounded-lg border border-white/10 bg-white/5 p-3">
                  <div className="mb-1 flex items-center gap-2">
                    <FolderTree className="h-4 w-4 text-violet-300" />
                    <p className="font-semibold text-slate-100">{folder.name}</p>
                  </div>
                  <p className="text-xs text-slate-400">{folder.description}</p>
                </div>
              ))}
            </div>
          </CardContent>
        </Card>
      </div>

      {companyOverviewQuery.error ? (
        <Card className="border-destructive/40 bg-destructive/5">
          <CardContent className="py-4">
            <p className="text-sm text-destructive">
              Falha ao carregar painel: {companyOverviewQuery.error.message}
            </p>
          </CardContent>
        </Card>
      ) : null}

      <div className="flex items-center justify-between rounded-lg border border-white/10 bg-slate-950/40 px-4 py-2">
        <p className="text-xs text-slate-400">Visao de alto nivel restaurada para planejamento da diretoria.</p>
        <Badge variant="outline" className="border-white/20 bg-white/5 text-slate-300">
          <Sparkles className="mr-1 h-3 w-3" />
          Painel executivo ativo
        </Badge>
      </div>
    </div>
  );
}