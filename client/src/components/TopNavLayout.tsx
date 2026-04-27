import { useAuth } from "@/_core/hooks/useAuth";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
  DropdownMenuSeparator,
} from "@/components/ui/dropdown-menu";
import { Button } from "./ui/button";
import {
  LayoutDashboard,
  LogOut,
  ListChecks,
  Settings,
  MapPin,
  Sun,
  Moon,
  Trophy,
  Menu,
  X,
  ChevronRight,
  Sparkles,
  ShieldCheck,
  ClipboardList,
  Hand,
  Calculator,
} from "lucide-react";
import { useTheme } from "@/contexts/ThemeContext";
import { useLocation } from "wouter";
import { SplashScreen } from "./SplashScreen";
import { trpc } from "@/lib/trpc";
import { useEffect, useMemo, useRef, useState } from "react";
import { toast } from "sonner";

const FEED_LAST_SEEN_KEY_PREFIX = "feed-last-seen-ms";
const MOBILE_DRAWER_EDGE_HITBOX_PX = 60;
const MOBILE_DRAWER_SWIPE_MIN_DISTANCE_PX = 56;
const MOBILE_DRAWER_SWIPE_MAX_VERTICAL_DRIFT_PX = 48;
const UNDER_CONSTRUCTION_PATHS = new Set(["/gto", "/icm-calculator"]);
const UNDER_CONSTRUCTION_GIF_URL = "https://media.tenor.com/4S4xWJ0mVxkAAAAi/under-construction.gif";

const menuItems = [
  { icon: LayoutDashboard, label: "Início", path: "/" },
  { icon: ListChecks, label: "Sessões", path: "/sessions" },
  { icon: Trophy, label: "Ranking", path: "/ranking" },
  { icon: MapPin, label: "Locais", path: "/venues" },
  { icon: ClipboardList, label: "GTO", path: "/gto" },
  { icon: Hand, label: "Revisor de Mãos", path: "/hand-reviewer" },
  { icon: Calculator, label: "Calculadora de ICM", path: "/icm-calculator" },
  { icon: Sparkles, label: "Comunidade", path: "/feed" },
  { icon: Settings, label: "Configurações", path: "/settings" },
];

const BOARD_ACCESS_IDENTIFIERS = ["toleto", "hugo"];
const BOARD_ACCESS_EMAILS = ["gabriel.toledo999@gmail.com"];

function normalizeIdentityToken(value: unknown): string {
  return String(value ?? "")
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .trim();
}

function isBoardAdminUser(user: { role?: string | null; name?: string | null; email?: string | null; openId?: string | null } | null | undefined): boolean {
  if (!user) return false;
  if (String(user.role ?? "").toLowerCase() !== "admin") return false;
  const normalizedEmail = normalizeIdentityToken(user.email);
  if (normalizedEmail && BOARD_ACCESS_EMAILS.includes(normalizedEmail)) return true;
  const tokens = [user.name, user.email, user.openId].map(normalizeIdentityToken).filter(Boolean);
  return tokens.some((token) => BOARD_ACCESS_IDENTIFIERS.some((id) => token.includes(id)));
}

const getAdminMenuItems = (user?: { role?: string | null; name?: string | null; email?: string | null; openId?: string | null } | null) => {
  if (isBoardAdminUser(user)) {
    return [{ icon: ShieldCheck, label: "Administracao", path: "/admin" }];
  }
  return [];
};

function getAvatarSrc(params: { id?: number | null; name?: string | null; email?: string | null; avatarUrl?: string | null }): string | undefined {
  const avatarUrl = params.avatarUrl?.trim();
  if (avatarUrl) return avatarUrl;

  const seedRaw = params.name?.trim() || params.email?.trim() || String(params.id ?? "user");
  const seed = encodeURIComponent(seedRaw);
  return `https://api.dicebear.com/9.x/thumbs/svg?seed=${seed}`;
}

type UserLeague = "Recreativo" | "Grinder" | "Reg" | "Mid Stakes" | "High Stakes" | "The Edge" | "High Roller";

function getAccessTierEmoji(league: UserLeague): string {
  if (league === "Recreativo") return "🃏";
  if (league === "Grinder") return "♣️";
  if (league === "Reg") return "♠️";
  if (league === "Mid Stakes") return "♦️";
  if (league === "High Stakes") return "♥️";
  if (league === "The Edge") return "🂡";
  return "💰";
}

function getAccessTierLabel(league: UserLeague): string {
  return league === "High Roller" ? "High Roller (interno)" : league;
}

function normalizeLeagueToken(value: string): string {
  return String(value || "")
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .trim();
}

function parseLeague(value: unknown): UserLeague | null {
  const token = normalizeLeagueToken(String(value ?? ""));
  if (!token) return null;

  if (token === "recreativo" || token === "casual" || token === "entry") return "Recreativo";
  if (token === "grinder") return "Grinder";
  if (token === "reg" || token === "regular") return "Reg";
  if (token === "midstakes" || token === "mid stakes") return "Mid Stakes";
  if (token === "highstakes" || token === "high stakes") return "High Stakes";
  if (token === "the edge" || token === "theedge" || token === "edge") return "The Edge";
  if (token === "high roller" || token === "highroller" || token === "roller") return "High Roller";

  // Legacy league labels mapped into new poker tiers.
  if (token === "bronze" || token === "prata" || token === "silver") return "Recreativo";
  if (token === "ouro" || token === "gold") return "Grinder";
  if (token === "platina" || token === "platinum") return "Reg";
  if (token === "esmeralda" || token === "emerald") return "Mid Stakes";
  if (token === "diamante" || token === "diamond") return "High Stakes";
  if (token === "mestre" || token === "master" || token === "grao-mestre" || token === "grao mestre" || token === "grandmaster") return "The Edge";
  return null;
}

function getLeagueFromLevel(levelInput: number): UserLeague {
  const level = Math.max(0, Math.round(levelInput));
  if (level <= 0) return "Recreativo";
  if (level === 1) return "Grinder";
  if (level === 2) return "Reg";
  if (level === 3) return "Mid Stakes";
  if (level <= 5) return "High Stakes";
  if (level === 6) return "The Edge";
  return "High Roller";
}

function getLeagueLevel(league: UserLeague): number {
  if (league === "Recreativo") return 0;
  if (league === "Grinder") return 1;
  if (league === "Reg") return 2;
  if (league === "Mid Stakes") return 3;
  if (league === "High Stakes") return 4;
  if (league === "The Edge") return 6;
  return 7;
}

export default function TopNavLayout({ children }: { children: React.ReactNode }) {
  const { loading, user } = useAuth();
  const [location, setLocation] = useLocation();
  const [mobileOpen, setMobileOpen] = useState(false);
  const [feedLastSeenMs, setFeedLastSeenMs] = useState(0);
  const mobileOpenSwipeStartRef = useRef<{ x: number; y: number } | null>(null);
  const mobileCloseSwipeStartRef = useRef<{ x: number; y: number } | null>(null);
  const { theme, toggleTheme } = useTheme();
  const { data: latestFeedPosts = [] } = trpc.feed.list.useQuery(
    { limit: 30, offset: 0 },
    {
      enabled: !!user,
      refetchInterval: 30000,
      staleTime: 10000,
    }
  );

  const { data: incomingFriendRequests = [] } = trpc.ranking.incomingRequests.useQuery(undefined, {
    enabled: !!user,
    refetchInterval: 15000,
    staleTime: 8000,
  });

  const { data: unreadChatData } = trpc.chat.unreadCount.useQuery(undefined, {
    enabled: !!user,
    refetchInterval: 15000,
    staleTime: 8000,
  });
  const unreadChatCount = unreadChatData?.count ?? 0;

  const { data: conversations = [] } = trpc.chat.conversations.useQuery(undefined, {
    enabled: !!user,
    refetchInterval: 15000,
    staleTime: 8000,
  });

  useEffect(() => {
    if (!user?.id) return;
    const key = `${FEED_LAST_SEEN_KEY_PREFIX}:${user.id}`;
    const savedValue = localStorage.getItem(key);
    const parsedValue = savedValue ? Number(savedValue) : 0;
    setFeedLastSeenMs(Number.isFinite(parsedValue) ? parsedValue : 0);
  }, [user?.id]);

  const pendingFeedCount = latestFeedPosts.filter((post) => {
    const createdAtMs = post.createdAt ? new Date(post.createdAt).getTime() : 0;
    return createdAtMs > 0 && createdAtMs > feedLastSeenMs && post.author?.id !== user?.id;
  }).length;

  // Red dot: unread messages (clears when on /chat)
  const hasUnreadMessages = !!user?.id && unreadChatCount > 0 && location !== "/chat";

  // Green badge: new feed posts + pending friend requests (clears when on /feed or /invites)
  const greenCount = pendingFeedCount + incomingFriendRequests.length;
  const hasFeedUpdates = !!user?.id && greenCount > 0 && location !== "/feed" && location !== "/invites";
  const feedUpdatesLabel = greenCount > 99 ? "99+" : String(greenCount);
  const previousIncomingCountRef = useRef(0);
  const previousUnreadChatCountRef = useRef(0);
  const audioCtxRef = useRef<AudioContext | null>(null);

  // Combine regular menu items with admin items (only if user is admin)
  const visibleMenuItems = [...menuItems, ...getAdminMenuItems(user as any)];

  useEffect(() => {
    if (!user?.id) return;

    const previous = previousIncomingCountRef.current;
    const current = incomingFriendRequests.length;
    const increased = current > previous;

    if (increased && location !== "/invites") {
      const delta = current - previous;
      toast.info(delta > 1 ? `${delta} novos pedidos de amizade` : "Novo pedido de amizade recebido", {
        description: "Abra a aba Amizades para aceitar, rejeitar ou bloquear.",
      });
    }

    previousIncomingCountRef.current = current;
  }, [incomingFriendRequests.length, location, user?.id]);

  useEffect(() => {
    if (!user?.id) return;

    const previous = previousUnreadChatCountRef.current;
    const current = unreadChatCount;
    const increased = current > previous;

    if (increased) {
      // Play a single subtle notification sound
      try {
        const ctx = audioCtxRef.current ?? new (window.AudioContext || (window as any).webkitAudioContext)();
        audioCtxRef.current = ctx;
        const now = ctx.currentTime;
        const osc = ctx.createOscillator();
        const gain = ctx.createGain();
        osc.type = "sine";
        osc.frequency.setValueAtTime(660, now);
        osc.frequency.exponentialRampToValueAtTime(480, now + 0.15);
        gain.gain.setValueAtTime(0.08, now);
        gain.gain.exponentialRampToValueAtTime(0.001, now + 0.3);
        osc.connect(gain).connect(ctx.destination);
        osc.start(now);
        osc.stop(now + 0.3);
      } catch { /* silent */ }
    }

    if (increased && location !== "/chat") {
      const delta = current - previous;
      const latestConv = conversations[0];
      const friendName = latestConv?.friend?.name ?? "Jogador";
      const friendId = latestConv?.friend?.id ?? 0;
      const friendAvatar = latestConv?.friend?.avatarUrl || getAvatarSrc({ id: friendId, name: friendName }) || "";

      toast.info(
        delta > 1 ? `${delta} novas mensagens` : "Mensagem nova",
        {
          description: latestConv ? (
            <div
              className="flex items-center gap-2 cursor-pointer hover:opacity-80 transition-opacity"
              onClick={() => friendId && setLocation(`/chat?friend=${friendId}`)}
            >
              <img
                src={friendAvatar}
                alt={friendName}
                className="h-8 w-8 rounded-full object-cover"
              />
              <p className="text-xs text-muted-foreground">Toque para responder</p>
            </div>
          ) : (
            "Abra o chat para responder."
          ),
        }
      );
    }

    previousUnreadChatCountRef.current = current;
  }, [location, unreadChatCount, user?.id, conversations]);

  useEffect(() => {
    if (!user?.id || location !== "/feed") return;
    const seenAt = Date.now();
    const key = `${FEED_LAST_SEEN_KEY_PREFIX}:${user.id}`;
    localStorage.setItem(key, String(seenAt));
    setFeedLastSeenMs(seenAt);
  }, [location, user?.id]);

  const logoutMutation = trpc.auth.logout.useMutation({
    onSuccess: () => { window.location.href = "/login"; },
  });

  const canOpenDrawerFromSwipe = (deltaX: number, deltaY: number) => {
    return (
      deltaX >= MOBILE_DRAWER_SWIPE_MIN_DISTANCE_PX &&
      Math.abs(deltaY) <= MOBILE_DRAWER_SWIPE_MAX_VERTICAL_DRIFT_PX &&
      Math.abs(deltaX) > Math.abs(deltaY)
    );
  };

  const canCloseDrawerFromSwipe = (deltaX: number, deltaY: number) => {
    return (
      deltaX <= -MOBILE_DRAWER_SWIPE_MIN_DISTANCE_PX &&
      Math.abs(deltaY) <= MOBILE_DRAWER_SWIPE_MAX_VERTICAL_DRIFT_PX &&
      Math.abs(deltaX) > Math.abs(deltaY)
    );
  };

  if (loading) return <SplashScreen />;

  if (!user) {
    window.location.replace("/login");
    return <SplashScreen />;
  }

  const userLeague: UserLeague = (() => {
    const role = String(user.role ?? "").trim().toLowerCase();
    if (role === "admin" || role === "developer" || role === "system_ai_service") {
      return "High Roller";
    }

    const numericLevel = Number((user as any)?.leagueLevel ?? (user as any)?.ligaNivel ?? (user as any)?.rankLevel);
    if (Number.isFinite(numericLevel) && numericLevel >= 0) {
      return getLeagueFromLevel(numericLevel);
    }

    const explicitLeague = parseLeague((user as any)?.league)
      ?? parseLeague((user as any)?.liga)
      ?? parseLeague((user as any)?.leagueTier)
      ?? parseLeague((user as any)?.rankLeague);
    if (explicitLeague) return explicitLeague;

    const starsFromUser = Number((user as any)?.starsLevel);
    if (Number.isFinite(starsFromUser)) {
      const normalizedStars = Math.max(0, Math.min(5, Math.round(starsFromUser)));
      if (normalizedStars <= 0) return "Recreativo";
      if (normalizedStars === 1) return "Grinder";
      if (normalizedStars === 2) return "Reg";
      if (normalizedStars === 3) return "Mid Stakes";
      if (normalizedStars === 4) return "High Stakes";
      return "The Edge";
    }

    return "Reg";
  })();

  const userLeagueLabel = getAccessTierLabel(userLeague);
  const userLeagueEmoji = getAccessTierEmoji(userLeague);
  const userLeagueCompact = userLeagueLabel.replace(" (interno)", "");

  const userAccessLevel = getLeagueLevel(userLeague);

  return (
    <div className="flex min-h-screen bg-background">
      {/* ── Sidebar Desktop ── */}
      <aside className="hidden md:flex flex-col w-64 shrink-0 border-r border-border/50 bg-card/30 sticky top-0 h-screen overflow-y-auto">
        {/* Logo */}
        <div className="border-b border-border/30 px-3 py-3">
          <div
            onClick={() => window.location.assign("/")}
            onKeyDown={(e) => {
              if (e.key === "Enter" || e.key === " ") {
                e.preventDefault();
                window.location.assign("/");
              }
            }}
            role="button"
            tabIndex={0}
            aria-label="Voltar para tela inicial"
            className="group flex cursor-pointer items-center gap-3 rounded-2xl px-3 py-3 transition-all duration-300 hover:bg-zinc-900/80 hover:shadow-[0_0_20px_#a855f7] active:scale-[0.97]"
          >
            <div className="flex h-10 w-10 items-center justify-center rounded-2xl bg-gradient-to-br from-purple-600 via-violet-600 to-fuchsia-600 text-2xl font-bold text-white shadow-lg transition-all group-hover:rotate-6">
              T
            </div>
            <div>
              <span className="bg-gradient-to-r from-purple-200 via-cyan-200 to-purple-200 bg-clip-text text-3xl font-bold tracking-[3px] text-transparent transition-all group-hover:brightness-125">
                THERAiL
              </span>
            </div>
          </div>
        </div>

        {/* Nav Items */}
        <nav className="flex-1 space-y-2 px-3 py-4">
          {visibleMenuItems.map((item) => {
            const Icon = item.icon;
            const isActive = location === item.path;
            return (
              <button
                key={item.path}
                onClick={() => setLocation(item.path)}
                className={`
                  group relative flex w-full items-center gap-4 overflow-hidden rounded-2xl px-5 py-4 text-left text-sm font-medium
                  transition-all duration-300
                  ${isActive
                    ? "bg-gradient-to-r from-purple-600 to-violet-600 text-white shadow-lg"
                    : "text-zinc-400 hover:text-white hover:bg-zinc-900"
                  }
                `}
              >
                <div
                  className={`absolute left-0 top-1/2 w-1 -translate-y-1/2 origin-center rounded-r-full bg-purple-400 transition-all duration-500 ease-out ${
                    isActive
                      ? "h-10 scale-y-125"
                      : "h-0 scale-y-0 group-hover:h-9 group-hover:scale-y-110"
                  }`}
                />
                <Icon className="relative z-10 h-5 w-5 shrink-0 text-2xl transition-transform duration-300 group-hover:scale-110" />
                <span className="relative z-10 transition-colors duration-300">{item.label}</span>
                <span className="relative z-10 ml-auto flex items-center gap-1.5">
                  {UNDER_CONSTRUCTION_PATHS.has(item.path) && (
                    <span className="inline-flex shrink-0 items-center gap-1 whitespace-nowrap text-[9px] font-semibold text-zinc-200">
                      <img
                        src={UNDER_CONSTRUCTION_GIF_URL}
                        alt="Em breve"
                        className="h-3.5 w-3.5 rounded-full object-cover"
                        loading="lazy"
                      />
                      🚧 em breve
                    </span>
                  )}
                  {item.path === "/chat" && unreadChatCount > 0 && (
                    <span
                      className="inline-flex min-w-5 items-center justify-center rounded-full bg-red-500 px-1.5 py-0.5 text-[10px] font-bold leading-none text-white shadow-[0_0_0_2px_hsl(var(--background))]"
                      aria-label={`${unreadChatCount > 99 ? "99+" : unreadChatCount} mensagens não lidas`}
                    >
                      {unreadChatCount > 99 ? "99+" : unreadChatCount}
                    </span>
                  )}
                  {item.path === "/invites" && incomingFriendRequests.length > 0 && (
                    <span
                      className="inline-flex min-w-5 items-center justify-center rounded-full bg-emerald-500 px-1.5 py-0.5 text-[10px] font-bold leading-none text-white shadow-[0_0_0_2px_hsl(var(--background))]"
                      aria-label={`${incomingFriendRequests.length > 99 ? "99+" : incomingFriendRequests.length} pedidos de amizade`}
                    >
                      {incomingFriendRequests.length > 99 ? "99+" : incomingFriendRequests.length}
                    </span>
                  )}
                  {item.path === "/feed" && hasFeedUpdates && (
                    <span
                      className="inline-flex min-w-5 items-center justify-center rounded-full bg-emerald-500 px-1.5 py-0.5 text-[10px] font-bold leading-none text-white shadow-[0_0_0_2px_hsl(var(--background))]"
                      aria-label={`${feedUpdatesLabel} atualizações`}
                    >
                      {feedUpdatesLabel}
                    </span>
                  )}
                  {item.path === "/feed" && hasUnreadMessages && (
                    <span
                      className="inline-flex min-w-5 items-center justify-center rounded-full bg-red-500 px-1.5 py-0.5 text-[10px] font-bold leading-none text-white shadow-[0_0_0_2px_hsl(var(--background))]"
                      aria-label={`${unreadChatCount > 99 ? "99+" : unreadChatCount} mensagens não lidas`}
                    >
                      {unreadChatCount > 99 ? "99+" : unreadChatCount}
                    </span>
                  )}
                  {isActive && <ChevronRight className="h-4 w-4 text-white/70" />}
                </span>
                <div className="pointer-events-none absolute inset-0 rounded-2xl bg-gradient-to-r from-purple-500/0 via-purple-500/10 to-transparent opacity-0 transition-opacity duration-300 group-hover:opacity-100" />
              </button>
            );
          })}
        </nav>

        {/* User Section */}
        <div className="border-t border-border/30 px-3 py-4">
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <button className="flex items-center gap-3 w-full px-3 py-2.5 rounded-lg hover:bg-muted/50 transition-colors">
                <Avatar className="h-9 w-9 shrink-0">
                    <AvatarImage src={getAvatarSrc({ id: user.id, name: user.name, email: user.email, avatarUrl: user.avatarUrl })} />
                  <AvatarFallback className="bg-primary text-primary-foreground text-sm">
                    {user.name?.charAt(0).toUpperCase() || "U"}
                  </AvatarFallback>
                </Avatar>
                <div className="flex flex-col items-start min-w-0 flex-1">
                  <span className="text-sm font-medium truncate w-full">{user.name}</span>
                  <span className="text-xs text-muted-foreground truncate w-full">{user.email}</span>
                  <span className="text-[11px] text-primary font-semibold truncate w-full">N{userAccessLevel} · {userLeagueCompact} {userLeagueEmoji}</span>
                </div>
              </button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end" side="top" className="w-52">
              <DropdownMenuItem onClick={toggleTheme} className="cursor-pointer gap-2">
                {theme === "dark" ? <Sun className="h-4 w-4" /> : <Moon className="h-4 w-4" />}
                {theme === "dark" ? "Tema Claro" : "Tema Escuro"}
              </DropdownMenuItem>
              <DropdownMenuSeparator />
              <DropdownMenuItem onClick={() => logoutMutation.mutate()} className="cursor-pointer text-destructive gap-2">
                <LogOut className="h-4 w-4" />
                Sair
              </DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>
        </div>
      </aside>

      {/* ── Mobile Header ── */}
      <div className="md:hidden fixed top-0 left-0 right-0 z-50 flex items-center justify-between px-4 h-14 bg-card/90 backdrop-blur border-b border-border/50">
        <div
          className="group flex h-full items-center cursor-pointer"
          onClick={() => window.location.assign("/")}
          role="button"
          tabIndex={0}
          onKeyDown={(e) => {
            if (e.key === "Enter" || e.key === " ") {
              e.preventDefault();
              window.location.assign("/");
            }
          }}
          aria-label="Voltar para tela inicial"
        >
          <div className="flex items-center gap-2 rounded-xl px-2 py-1 transition-all duration-300 group-hover:bg-zinc-900/80">
            <div className="flex h-8 w-8 items-center justify-center rounded-xl bg-gradient-to-br from-purple-600 via-violet-600 to-fuchsia-600 text-lg font-bold text-white shadow-lg">
              T
            </div>
            <span className="bg-gradient-to-r from-purple-200 via-cyan-200 to-purple-200 bg-clip-text text-lg font-bold tracking-[2px] text-transparent">
              THERAiL
            </span>
          </div>
        </div>
        <div className="flex items-center gap-2">
          <Button variant="ghost" size="icon" onClick={toggleTheme}>
            {theme === "dark" ? <Sun className="h-5 w-5" /> : <Moon className="h-5 w-5" />}
          </Button>
          <Button variant="ghost" size="icon" onClick={() => setMobileOpen(true)}>
            <Menu className="h-5 w-5" />
          </Button>
        </div>
      </div>

      {!mobileOpen && (
        <div
          className="md:hidden fixed left-0 top-16 bottom-6 z-40 w-16 pointer-events-auto"
          aria-hidden="true"
          onTouchStart={(event) => {
            const touch = event.touches[0];
            if (!touch || touch.clientX > MOBILE_DRAWER_EDGE_HITBOX_PX) {
              mobileOpenSwipeStartRef.current = null;
              return;
            }

            mobileOpenSwipeStartRef.current = { x: touch.clientX, y: touch.clientY };
          }}
          onTouchEnd={(event) => {
            const start = mobileOpenSwipeStartRef.current;
            mobileOpenSwipeStartRef.current = null;

            if (!start) return;

            const touch = event.changedTouches[0];
            if (!touch) return;

            const deltaX = touch.clientX - start.x;
            const deltaY = touch.clientY - start.y;

            if (canOpenDrawerFromSwipe(deltaX, deltaY)) {
              setMobileOpen(true);
            }
          }}
        />
      )}

      {/* ── Mobile Drawer ── */}
      {mobileOpen && (
        <div className="md:hidden fixed inset-0 z-50 flex">
          <div className="absolute inset-0 bg-black/60" onClick={() => setMobileOpen(false)} />
          <div
            className="relative w-72 bg-card h-full flex flex-col shadow-2xl"
            onTouchStart={(event) => {
              const touch = event.touches[0];
              if (!touch) {
                mobileCloseSwipeStartRef.current = null;
                return;
              }

              mobileCloseSwipeStartRef.current = { x: touch.clientX, y: touch.clientY };
            }}
            onTouchEnd={(event) => {
              const start = mobileCloseSwipeStartRef.current;
              mobileCloseSwipeStartRef.current = null;

              if (!start) return;

              const touch = event.changedTouches[0];
              if (!touch) return;

              const deltaX = touch.clientX - start.x;
              const deltaY = touch.clientY - start.y;

              if (canCloseDrawerFromSwipe(deltaX, deltaY)) {
                setMobileOpen(false);
              }
            }}
          >
            <div className="flex h-16 items-center justify-between px-5 border-b border-border/30">
              <div
                className="group flex h-full cursor-pointer items-center"
                onClick={() => {
                  setMobileOpen(false);
                  window.location.assign("/");
                }}
                role="button"
                tabIndex={0}
                onKeyDown={(e) => {
                  if (e.key === "Enter" || e.key === " ") {
                    e.preventDefault();
                    setMobileOpen(false);
                    window.location.assign("/");
                  }
                }}
                aria-label="Voltar para tela inicial"
              >
                <div className="flex items-center gap-2 rounded-xl px-2 py-1 transition-all duration-300 group-hover:bg-zinc-900/80">
                  <div className="flex h-9 w-9 items-center justify-center rounded-xl bg-gradient-to-br from-purple-600 via-violet-600 to-fuchsia-600 text-xl font-bold text-white shadow-lg">
                    T
                  </div>
                  <span className="bg-gradient-to-r from-purple-200 via-cyan-200 to-purple-200 bg-clip-text text-xl font-bold tracking-[2px] text-transparent">
                    THERAiL
                  </span>
                </div>
              </div>
              <Button variant="ghost" size="icon" onClick={() => setMobileOpen(false)}>
                <X className="h-5 w-5" />
              </Button>
            </div>
            <nav className="flex flex-col gap-1 px-3 py-4 flex-1">
              {visibleMenuItems.map((item) => {
                const Icon = item.icon;
                const isActive = location === item.path;
                return (
                  <button
                    key={item.path}
                    onClick={() => { setLocation(item.path); setMobileOpen(false); }}
                    className={`
                      group relative flex w-full items-center gap-4 overflow-hidden rounded-2xl px-5 py-4 text-left text-sm font-medium
                      transition-all duration-300
                      ${isActive
                        ? "bg-gradient-to-r from-purple-600 to-violet-600 text-white shadow-lg"
                        : "text-zinc-400 hover:text-white hover:bg-zinc-900"
                      }
                    `}
                  >
                    <div
                      className={`absolute left-0 top-1/2 h-9 w-1 -translate-y-1/2 origin-center rounded-r-full bg-purple-400 transition-all duration-300 ${
                        isActive ? "scale-y-125" : "scale-y-0 group-hover:scale-y-110"
                      }`}
                    />
                    <Icon className="h-5 w-5 shrink-0 text-2xl transition-transform duration-300 group-hover:scale-110" />
                    <span>{item.label}</span>
                    <span className="ml-auto flex items-center gap-1.5">
                      {UNDER_CONSTRUCTION_PATHS.has(item.path) && (
                        <span className="inline-flex shrink-0 items-center gap-1 whitespace-nowrap text-[9px] font-semibold text-zinc-200">
                          <img
                            src={UNDER_CONSTRUCTION_GIF_URL}
                            alt="Em breve"
                            className="h-3.5 w-3.5 rounded-full object-cover"
                            loading="lazy"
                          />
                          🚧 em breve
                        </span>
                      )}
                      {item.path === "/chat" && unreadChatCount > 0 && (
                        <span
                          className="inline-flex min-w-5 items-center justify-center rounded-full bg-red-500 px-1.5 py-0.5 text-[10px] font-bold leading-none text-white"
                          aria-label={`${unreadChatCount > 99 ? "99+" : unreadChatCount} mensagens não lidas`}
                        >
                          {unreadChatCount > 99 ? "99+" : unreadChatCount}
                        </span>
                      )}
                      {item.path === "/invites" && incomingFriendRequests.length > 0 && (
                        <span
                          className="inline-flex min-w-5 items-center justify-center rounded-full bg-emerald-500 px-1.5 py-0.5 text-[10px] font-bold leading-none text-white"
                          aria-label={`${incomingFriendRequests.length > 99 ? "99+" : incomingFriendRequests.length} pedidos de amizade`}
                        >
                          {incomingFriendRequests.length > 99 ? "99+" : incomingFriendRequests.length}
                        </span>
                      )}
                      {item.path === "/feed" && hasFeedUpdates && (
                        <span
                          className="inline-flex min-w-5 items-center justify-center rounded-full bg-emerald-500 px-1.5 py-0.5 text-[10px] font-bold leading-none text-white"
                          aria-label={`${feedUpdatesLabel} atualizações`}
                        >
                          {feedUpdatesLabel}
                        </span>
                      )}
                      {item.path === "/feed" && hasUnreadMessages && (
                        <span
                          className="inline-flex min-w-5 items-center justify-center rounded-full bg-red-500 px-1.5 py-0.5 text-[10px] font-bold leading-none text-white"
                          aria-label={`${unreadChatCount > 99 ? "99+" : unreadChatCount} mensagens não lidas`}
                        >
                          {unreadChatCount > 99 ? "99+" : unreadChatCount}
                        </span>
                      )}
                    </span>
                  </button>
                );
              })}
            </nav>
            <div className="border-t border-border/30 px-4 py-4">
              <div className="flex items-center gap-3 mb-3">
                <Avatar className="h-9 w-9">
                  <AvatarImage src={user.avatarUrl || undefined} />
                  <AvatarFallback className="bg-primary text-primary-foreground text-sm">
                    {user.name?.charAt(0).toUpperCase() || "U"}
                  </AvatarFallback>
                </Avatar>
                <div className="flex flex-col min-w-0">
                  <span className="text-sm font-medium truncate">{user.name}</span>
                  <span className="text-xs text-muted-foreground truncate">{user.email}</span>
                  <span className="text-[11px] text-primary font-semibold">N{userAccessLevel} · {userLeagueCompact} {userLeagueEmoji}</span>
                </div>
              </div>
              <Button variant="ghost" size="sm" className="w-full justify-start gap-2 text-destructive" onClick={() => logoutMutation.mutate()}>
                <LogOut className="h-4 w-4" /> Sair
              </Button>
            </div>
          </div>
        </div>
      )}

      {/* ── Main Content ── */}
      <main className="app-scrollbar flex-1 min-w-0 md:overflow-y-auto">
        <div className="md:hidden h-14" /> {/* spacer for mobile header */}
        <div className="p-4 md:p-6">
          {children}
        </div>
      </main>

    </div>
  );
}
