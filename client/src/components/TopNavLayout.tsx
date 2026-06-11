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
import { OnlinePresenceDot } from "./OnlinePresence";
import {
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
  Bell,
  Compass,
  Users,
  Search,
  MessageCircle,
  User,
  Plus,
} from "lucide-react";
import { useTheme } from "@/contexts/ThemeContext";
import { evaluateOnboardingStatus } from "@/lib/onboarding";
import { buildProfilePath } from "@/lib/socialProfile";
import { ensureBrowserNotificationPermission, showBrowserNotification } from "@/lib/browserNotifications";
import { useLocation } from "wouter";
import { SplashScreen } from "./SplashScreen";
import { trpc } from "@/lib/trpc";
import { PUBLIC_LANDING_URL } from "@/const";
import { useEffect, useMemo, useRef, useState } from "react";
import { toast } from "sonner";

const FEED_LAST_SEEN_KEY_PREFIX = "feed-last-seen-ms";
const LOCATION_REFRESH_INTERVAL_MS = 365 * 24 * 60 * 60 * 1000;
const MOBILE_DRAWER_EDGE_HITBOX_PX = 60;
const MOBILE_DRAWER_SWIPE_MIN_DISTANCE_PX = 56;
const MOBILE_DRAWER_SWIPE_MAX_VERTICAL_DRIFT_PX = 48;
const UNDER_CONSTRUCTION_PATHS = new Set(["/icm-calculator", "/gto"]);
const UNDER_CONSTRUCTION_GIF_URL = "https://media.tenor.com/4S4xWJ0mVxkAAAAi/under-construction.gif";

const menuItems = [
  { icon: ListChecks, label: "Sessões", path: "/sessions" },
  { icon: Trophy, label: "Ranking", path: "/ranking" },
  { icon: MapPin, label: "Locais", path: "/venues" },
  { icon: ClipboardList, label: "GTO", path: "/gto" },
  { icon: Calculator, label: "Odds / Equity", path: "/equity-calculator" },
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

function hasSavedLocationProfile(profile: { country?: unknown; stateRegion?: unknown; city?: unknown } | null | undefined): boolean {
  return Boolean(
    String(profile?.country ?? "").trim()
    && String(profile?.stateRegion ?? "").trim()
    && String(profile?.city ?? "").trim(),
  );
}

function isLocationRefreshDue(
  locationConsentAt: string | Date | null | undefined,
  profile: { country?: unknown; stateRegion?: unknown; city?: unknown } | null | undefined,
): boolean {
  if (!hasSavedLocationProfile(profile)) return true;
  if (!locationConsentAt) return true;
  const consentMs = new Date(locationConsentAt as any).getTime();
  if (!Number.isFinite(consentMs)) return true;
  return (Date.now() - consentMs) >= LOCATION_REFRESH_INTERVAL_MS;
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

function getAccessTierLabel(league: UserLeague): string {
  return league;
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
  if (token === "the edge" || token === "theedge" || token === "edge") return "High Roller";
  if (token === "high roller" || token === "highroller" || token === "roller") return "The Edge";

  // Legacy league labels mapped into new poker tiers.
  if (token === "bronze" || token === "prata" || token === "silver") return "Recreativo";
  if (token === "ouro" || token === "gold") return "Grinder";
  if (token === "platina" || token === "platinum") return "Reg";
  if (token === "esmeralda" || token === "emerald") return "Mid Stakes";
  if (token === "diamante" || token === "diamond") return "High Stakes";
  if (token === "mestre" || token === "master" || token === "grao-mestre" || token === "grao mestre" || token === "grandmaster") return "High Roller";
  return null;
}

function getLeagueFromLevel(levelInput: number): UserLeague {
  const level = Math.max(0, Math.round(levelInput));
  if (level <= 0) return "Recreativo";
  if (level === 1) return "Grinder";
  if (level === 2) return "Reg";
  if (level === 3) return "Mid Stakes";
  if (level <= 5) return "High Stakes";
  if (level === 6) return "High Roller";
  return "The Edge";
}

export default function TopNavLayout({ children }: { children: React.ReactNode }) {
  const { loading, user } = useAuth();
  const [location, setLocation] = useLocation();
  const isGtoEngineRoute = location.startsWith("/gto");
  const isCommunityRoute = location === "/social" || location === "/feed" || location === "/chat" || location === "/invites" || location.startsWith("/profile/");
  const [mobileOpen, setMobileOpen] = useState(false);
  const [communityPanel, setCommunityPanel] = useState<"none" | "search" | "notifications">("none");
  const [communitySearch, setCommunitySearch] = useState("");
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
  const onlineFriendsCount = conversations.filter((conversation) => conversation.isOnline).length;
  const onlineFriendsLabel = onlineFriendsCount > 0 ? `${onlineFriendsCount} online` : "online";

  const { data: onboardingProfile } = trpc.sessions.getOnboardingProfile.useQuery(undefined, {
    enabled: !!user,
    staleTime: 30000,
    refetchOnWindowFocus: true,
  });

  const { data: communityUserResults = [] } = trpc.ranking.searchUsers.useQuery(
    { query: communitySearch.trim() },
    {
      enabled: isCommunityRoute && communitySearch.trim().length >= 1,
      staleTime: 8000,
      refetchInterval: 15000,
    }
  );

  const locationNudgeShownRef = useRef(false);

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

  const communityPostResults = useMemo(() => {
    const token = communitySearch.trim().toLowerCase();
    if (!token) return [];
    return latestFeedPosts
      .filter((post) => {
        const content = String(post.content ?? "").toLowerCase();
        const authorName = String(post.author?.name ?? "").toLowerCase();
        return content.includes(token) || authorName.includes(token);
      })
      .slice(0, 5);
  }, [communitySearch, latestFeedPosts]);

  // Red dot: unread messages (clears when on /chat)
  const hasUnreadMessages = !!user?.id && unreadChatCount > 0 && location !== "/chat";

  // Green badge: new feed posts + pending friend requests (clears when on /feed or /invites)
  const greenCount = pendingFeedCount + incomingFriendRequests.length;
  const hasFeedUpdates = !!user?.id && greenCount > 0 && location !== "/feed" && location !== "/invites";
  const feedUpdatesLabel = greenCount > 99 ? "99+" : String(greenCount);
  const previousIncomingCountRef = useRef(0);
  const previousUnreadChatCountRef = useRef(0);
  const previousPendingFeedCountRef = useRef(0);
  const notificationPermissionPromptedRef = useRef(false);
  const audioCtxRef = useRef<AudioContext | null>(null);

  // Combine regular menu items with admin items (only if user is admin)
  const visibleMenuItems = [...menuItems, ...getAdminMenuItems(user as any)];

  useEffect(() => {
    if (!user?.id) return;
    if (typeof window === "undefined" || !("Notification" in window)) return;

    if (Notification.permission === "default" && !notificationPermissionPromptedRef.current) {
      notificationPermissionPromptedRef.current = true;
      void ensureBrowserNotificationPermission(true);
    }
  }, [user?.id]);

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

      void showBrowserNotification({
        title: delta > 1 ? `${delta} novos pedidos de amizade` : "Novo pedido de amizade",
        body: "Abra a aba Amizades para responder.",
        tag: `friend-requests-${user.id}`,
        route: "/invites",
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

      const chatRoute = friendId ? `/chat?friend=${friendId}` : "/chat";
      void showBrowserNotification({
        title: delta > 1 ? `${delta} novas mensagens` : `Mensagem nova de ${friendName}`,
        body: "Abra o chat para responder.",
        tag: friendId ? `chat-friend-${friendId}` : `chat-user-${user.id}`,
        route: chatRoute,
        icon: friendAvatar,
      });
    }

    previousUnreadChatCountRef.current = current;
  }, [location, unreadChatCount, user?.id, conversations]);

  useEffect(() => {
    if (!user?.id) return;

    const previous = previousPendingFeedCountRef.current;
    const current = pendingFeedCount;
    const increased = current > previous;

    if (increased && location !== "/feed") {
      const delta = current - previous;
      toast.info(delta > 1 ? `${delta} novas publicacoes na comunidade` : "Nova publicacao na comunidade", {
        description: "Abra a comunidade para conferir.",
      });

      void showBrowserNotification({
        title: delta > 1 ? `${delta} novas publicacoes` : "Nova publicacao na comunidade",
        body: "Abra a aba Comunidade para ver os detalhes.",
        tag: `feed-updates-${user.id}`,
        route: "/feed",
      });
    }

    previousPendingFeedCountRef.current = current;
  }, [location, pendingFeedCount, user?.id]);

  useEffect(() => {
    if (!user?.id || location !== "/feed") return;
    const seenAt = Date.now();
    const key = `${FEED_LAST_SEEN_KEY_PREFIX}:${user.id}`;
    localStorage.setItem(key, String(seenAt));
    setFeedLastSeenMs(seenAt);
  }, [location, user?.id]);

  useEffect(() => {
    if (!isCommunityRoute) {
      setCommunityPanel("none");
      setCommunitySearch("");
    }
  }, [isCommunityRoute]);

  useEffect(() => {
    if (!user?.id || onboardingProfile === undefined) return;
    const locationUpdateDue = isLocationRefreshDue((onboardingProfile as any)?.locationConsentAt, onboardingProfile as any);
    if (!locationUpdateDue) {
      locationNudgeShownRef.current = false;
      return;
    }

    if (!locationNudgeShownRef.current) {
      toast.info("Complete sua localizacao para continuar.", {
        description: "Precisamos de pais, cidade e endereco para finalizar seu cadastro.",
      });
      locationNudgeShownRef.current = true;
    }

    // Keep only the onboarding nudge without forcing route changes.
  }, [user?.id, onboardingProfile, location, setLocation]);

  useEffect(() => {
    if (!user?.id || onboardingProfile === undefined) return;
    const status = evaluateOnboardingStatus(user, onboardingProfile);
    if (status.complete) return;
    const next = encodeURIComponent(location || "/");
    setLocation(`/onboarding?next=${next}`);
  }, [user, onboardingProfile, location, setLocation]);

  const logoutMutation = trpc.auth.logout.useMutation({
    onSuccess: () => { window.location.href = PUBLIC_LANDING_URL; },
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
    // Sessao ausente dentro do app: vai para /login (a landing e somente entrada publica).
    if (window.location.pathname !== "/login") {
      window.location.replace("/login");
    }
    return <SplashScreen />;
  }

  const userLeague: UserLeague = "The Edge";

  const userLeagueLabel = getAccessTierLabel(userLeague);
  const myProfilePath = buildProfilePath({ id: user.id, name: user.name });

  if (isGtoEngineRoute) {
    return (
      <div className="min-h-dvh w-full overflow-x-hidden overflow-y-auto bg-[#050913] text-white">
        {children}
      </div>
    );
  }

  if (isCommunityRoute) {
    return (
      <div
        className="relative flex min-h-dvh w-full flex-col overflow-hidden"
        style={{
          backgroundImage: "radial-gradient(circle at 18% 22%, rgba(56,189,248,0.22), transparent 46%), radial-gradient(circle at 82% 76%, rgba(16,185,129,0.2), transparent 45%), linear-gradient(180deg, #030712 0%, #0b1220 100%)",
          backgroundPosition: "center",
          backgroundSize: "cover",
          backgroundRepeat: "no-repeat",
        }}
      >

        <aside
          className="fixed left-0 top-1/2 z-50 hidden w-32 -translate-y-1/2 flex-col md:flex"
          onMouseLeave={() => setCommunityPanel("none")}
          aria-label="Barra lateral da comunidade"
        >
          <div className="flex flex-col gap-2 px-2 py-2">
            <button
              type="button"
              onClick={() => setLocation("/")}
              className="group/item relative mb-3 mt-2 flex h-16 w-full items-center justify-center rounded-xl px-2.5 text-white/75 transition-colors duration-200 hover:text-white"
              aria-label="Ir para pagina principal do site"
            >
              <span className="relative inline-flex h-10 w-10 items-center justify-center">
                <img
                  src="/all-in-edge-logo-branco.png"
                  alt="All in Edge"
                  className="h-10 w-10 object-contain"
                />
              </span>
              <span className="pointer-events-none absolute left-full ml-2 origin-left scale-x-0 whitespace-nowrap rounded-md bg-black/85 px-2 py-1 text-xs font-semibold text-white opacity-0 shadow-lg transition-[transform,opacity] duration-300 ease-out group-hover/item:scale-x-100 group-hover/item:opacity-100">
                Home page
              </span>
            </button>

            <nav className="flex flex-col gap-2">
              {[
                { key: "search", label: "Pesquisa", icon: Search, panel: "search" as const },
                { key: "notifications", label: "Notificacoes", icon: Bell, panel: "notifications" as const },
                { key: "create", label: "+ Criar", icon: Plus, path: "/feed" },
                { key: "feed", label: "Feed global", icon: Compass, path: "/feed" },
                { key: "friends", label: "Feed amigos", icon: Users, path: "/feed" },
                { key: "chat", label: "Mensagens", icon: MessageCircle, path: "/chat" },
                { key: "profile", label: "Meu perfil", icon: User, path: myProfilePath },
              ].map((item) => {
                const Icon = item.icon;
                const routeActive = item.path ? location === item.path : false;
                const panelActive = item.panel ? communityPanel === item.panel : false;
                const isActive = routeActive || panelActive;

                return (
                  <button
                    key={item.key}
                    type="button"
                    onClick={() => {
                      if (item.path) {
                        if (item.key === "create") {
                          localStorage.setItem("social-open-create-post", "1");
                          setLocation("/feed");
                          setTimeout(() => window.dispatchEvent(new Event("social:open-create-post")), 40);
                          setCommunityPanel("none");
                          return;
                        }

                        if (item.key === "friends") {
                          localStorage.setItem("social-feed-scope", "friends");
                          setLocation("/feed");
                          window.dispatchEvent(new CustomEvent("social:set-feed-scope", { detail: "friends" }));
                          setCommunityPanel("none");
                          return;
                        }

                        if (item.key === "feed") {
                          localStorage.setItem("social-feed-scope", "global");
                          window.dispatchEvent(new CustomEvent("social:set-feed-scope", { detail: "global" }));
                        }

                        setLocation(item.path);
                        setCommunityPanel("none");
                      } else if (item.panel) {
                        setCommunityPanel((prev) => (prev === item.panel ? "none" : item.panel));
                      }
                    }}
                    className={`group/item relative flex h-11 w-full items-center justify-center rounded-xl px-2.5 transition-all duration-200 ${
                      isActive
                        ? "text-white"
                        : "text-white/75 hover:text-white"
                    }`}
                    aria-label={item.label}
                  >
                    <span className="relative inline-flex h-10 w-10 items-center justify-center">
                      {item.key === "profile" ? (
                        <Avatar className="h-10 w-10">
                          <AvatarImage src={getAvatarSrc({ id: user.id, name: user.name, email: user.email, avatarUrl: user.avatarUrl })} />
                          <AvatarFallback className="text-base">
                            {user.name?.charAt(0).toUpperCase() || <User className="h-5 w-5" />}
                          </AvatarFallback>
                        </Avatar>
                      ) : (
                        <Icon className="h-7 w-7" />
                      )}
                      {item.key === "notifications" && (incomingFriendRequests.length + unreadChatCount + pendingFeedCount) > 0 && (
                        <span className="absolute -right-1.5 -top-1.5 inline-flex min-w-4 items-center justify-center rounded-full bg-red-500 px-1 text-[9px] font-bold leading-none text-white">
                          {incomingFriendRequests.length + unreadChatCount + pendingFeedCount > 99 ? "99+" : incomingFriendRequests.length + unreadChatCount + pendingFeedCount}
                        </span>
                      )}
                      {item.key === "chat" && unreadChatCount > 0 && (
                        <span className="absolute -right-1.5 -top-1.5 inline-flex min-w-4 items-center justify-center rounded-full bg-red-500 px-1 text-[9px] font-bold leading-none text-white">
                          {unreadChatCount > 99 ? "99+" : unreadChatCount}
                        </span>
                      )}
                    </span>
                    <span className="pointer-events-none absolute left-full ml-2 origin-left scale-x-0 whitespace-nowrap rounded-md bg-black/85 px-2 py-1 text-xs font-semibold text-white opacity-0 shadow-lg transition-[transform,opacity] duration-300 ease-out group-hover/item:scale-x-100 group-hover/item:opacity-100">
                      {item.label}
                    </span>
                  </button>
                );
              })}
            </nav>

            {communityPanel !== "none" && (
              <div className="absolute left-full top-0 ml-2 w-72 rounded-xl border border-white/10 bg-black/85 p-3 text-white/90 shadow-xl backdrop-blur">
                {communityPanel === "search" && (
                  <div className="flex flex-row gap-4">
                    {/* Sugestões Online e Destaques */}
                    <div className="flex flex-col gap-4 w-32 min-w-[8rem]">
                      <div>
                        <p className="text-[10px] font-semibold uppercase tracking-[0.12em] text-emerald-400 mb-1">Sugestões Online</p>
                        <ul className="space-y-1">
                          <li className="text-xs text-white/80">@hugogol</li>
                          <li className="text-xs text-white/80">@neymar</li>
                          <li className="text-xs text-white/80">@marialima</li>
                        </ul>
                      </div>
                      <div>
                        <p className="text-[10px] font-semibold uppercase tracking-[0.12em] text-yellow-400 mb-1">Destaques</p>
                        <ul className="space-y-1">
                          <li className="text-xs text-white/80">Top 1: @hugogol</li>
                          <li className="text-xs text-white/80">Top 2: @neymar</li>
                        </ul>
                      </div>
                    </div>
                    {/* Campo de busca e resultados */}
                    <div className="flex-1 space-y-3">
                      <div className="relative">
                        <Search className="pointer-events-none absolute left-2.5 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-white/45" />
                        <input
                          value={communitySearch}
                          onChange={(event) => setCommunitySearch(event.target.value)}
                          placeholder="Buscar usuarios ou posts"
                          className="h-9 w-full rounded-lg border border-white/15 bg-black/30 pl-8 pr-3 text-xs text-white outline-none placeholder:text-white/45 focus:border-white/30"
                        />
                      </div>

                      <div className="space-y-2">
                        <p className="text-[10px] font-semibold uppercase tracking-[0.12em] text-white/55">Usuarios</p>
                        {communityUserResults.length === 0 ? (
                          <p className="text-xs text-white/45">Sem usuarios para este termo.</p>
                        ) : (
                          communityUserResults.slice(0, 4).map((result: any) => (
                            <button
                              key={`community-user-${result.id}`}
                              type="button"
                              onClick={() => {
                                setLocation(buildProfilePath({ id: Number(result.id), name: result.name }));
                                setCommunityPanel("none");
                              }}
                              className="flex w-full items-center gap-2 rounded-lg px-2 py-1.5 text-left text-xs text-white/85 transition-colors hover:bg-white/10"
                            >
                              <Avatar className="h-6 w-6">
                                <AvatarImage src={getAvatarSrc({ id: Number(result.id), name: result.name, email: result.email, avatarUrl: result.avatarUrl })} />
                                <AvatarFallback className="text-[10px]">
                                  {String(result.name ?? "?").slice(0, 2).toUpperCase()}
                                </AvatarFallback>
                              </Avatar>
                              <span className="truncate">{result.name ?? `Jogador ${result.id}`}</span>
                            </button>
                          ))
                        )}
                      </div>

                      <div className="space-y-2">
                        <p className="text-[10px] font-semibold uppercase tracking-[0.12em] text-white/55">Posts</p>
                        {communityPostResults.length === 0 ? (
                          <p className="text-xs text-white/45">Sem posts para este termo.</p>
                        ) : (
                          communityPostResults.map((post: any) => (
                            <button
                              key={`community-post-${post.id}`}
                              type="button"
                              onClick={() => {
                                setLocation("/feed");
                                setCommunityPanel("none");
                              }}
                              className="w-full rounded-lg px-2 py-1.5 text-left text-xs text-white/85 transition-colors hover:bg-white/10"
                            >
                              <p className="truncate font-medium">{post.author?.name ?? "Jogador"}</p>
                              <p className="truncate text-white/55">{String(post.content ?? "Post com imagem")}</p>
                            </button>
                          ))
                        )}
                      </div>
                    </div>
                  </div>
                )}

                {communityPanel === "notifications" && (
                  <div className="space-y-2">
                    <p className="text-[10px] font-semibold uppercase tracking-[0.12em] text-white/55">Notificacoes</p>
                    <button
                      type="button"
                      onClick={() => {
                        setLocation("/chat");
                        setCommunityPanel("none");
                      }}
                      className="flex w-full items-center justify-between rounded-lg px-2 py-1.5 text-xs text-white/85 transition-colors hover:bg-white/10"
                    >
                      <span>Mensagem</span>
                      <span className="rounded-full bg-red-500 px-1.5 py-0.5 text-[10px] font-bold leading-none text-white">{unreadChatCount > 99 ? "99+" : unreadChatCount}</span>
                    </button>
                    <button
                      type="button"
                      onClick={() => {
                        setLocation("/invites");
                        setCommunityPanel("none");
                      }}
                      className="flex w-full items-center justify-between rounded-lg px-2 py-1.5 text-xs text-white/85 transition-colors hover:bg-white/10"
                    >
                      <span>Pedidos de amizade</span>
                      <span className="rounded-full bg-emerald-500 px-1.5 py-0.5 text-[10px] font-bold leading-none text-white">{incomingFriendRequests.length > 99 ? "99+" : incomingFriendRequests.length}</span>
                    </button>
                    <button
                      type="button"
                      onClick={() => {
                        setLocation("/feed");
                        setCommunityPanel("none");
                      }}
                      className="flex w-full items-center justify-between rounded-lg px-2 py-1.5 text-xs text-white/85 transition-colors hover:bg-white/10"
                    >
                      <span>Atualizacoes do feed</span>
                      <span className="rounded-full bg-emerald-500 px-1.5 py-0.5 text-[10px] font-bold leading-none text-white">{pendingFeedCount > 99 ? "99+" : pendingFeedCount}</span>
                    </button>
                  </div>
                )}
              </div>
            )}
          </div>
        </aside>

        <main className="app-scrollbar flex-1 overflow-y-auto">
          <div className="w-full px-3 py-3 pb-6 md:pl-24 md:pr-4 md:py-4 lg:pb-5">
            {children}
          </div>
        </main>
      </div>
    );
  }

  return (
    <div className="flex h-dvh w-full overflow-hidden bg-background">
      {/* ── Sidebar Desktop ── */}
      <aside className="hidden md:fixed md:inset-y-0 md:left-0 md:z-30 md:flex md:w-64 md:flex-col border-r border-border/50 bg-card/30 overflow-y-auto">
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
            className="group flex cursor-pointer items-center gap-3 rounded-2xl px-3 py-3 transition-all duration-300 active:scale-[0.97]"
          >
            <img
              src="/all-in-edge-logo-neymar-homebar.png"
              alt="All in Edge"
              className="h-11 w-auto object-contain transition-transform duration-300 ease-out group-hover:scale-110"
            />
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
                <Icon className="relative z-10 h-5 w-5 shrink-0 text-2xl transition-transform duration-300 ease-out group-hover:scale-110" />
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
                <div className="flex flex-col items-start min-w-0 flex-1 pl-0.5">
                  <span className="text-sm font-medium truncate w-full">{user.name}</span>
                  <span className="text-[11px] text-primary font-semibold truncate w-full">{userLeagueLabel}</span>
                  <div className="mt-1 w-full pl-1.5">
                    <span className="block w-full truncate text-[11px] font-semibold leading-none text-emerald-400/90">
                      online
                    </span>
                  </div>
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
          <div className="flex items-center gap-2 rounded-xl px-2 py-1 transition-all duration-300">
            <img
              src="/all-in-edge-logo-neymar-homebar.png"
              alt="All in Edge"
              className="h-8 w-auto object-contain transition-transform duration-300 ease-out group-hover:scale-110"
            />
          </div>
        </div>
        <div className="flex items-center gap-2">
          <button
            type="button"
            className={`inline-flex min-w-[74px] items-center justify-center gap-1.5 rounded-full border px-2 py-1 text-[10px] font-semibold transition-all ${
              onlineFriendsCount > 0
                ? "border-emerald-400/35 bg-emerald-500/15 text-emerald-200"
                : "border-emerald-400/25 bg-emerald-500/10 text-emerald-300"
            }`}
            onClick={() => setLocation("/chat")}
            aria-label={`${onlineFriendsCount} amigos online no app`}
          >
            {onlineFriendsCount > 0 ? (
              <OnlinePresenceDot className="h-3 w-3 shrink-0" />
            ) : (
              <span className="h-2.5 w-2.5 shrink-0 rounded-full bg-emerald-400/60" aria-hidden="true" />
            )}
            <span className="leading-none tabular-nums whitespace-nowrap">{onlineFriendsCount} online</span>
          </button>
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
                <div className="flex items-center gap-2 rounded-xl px-2 py-1 transition-all duration-300">
                  <img
                    src="/all-in-edge-logo-neymar-homebar.png"
                    alt="All in Edge"
                    className="h-9 w-auto object-contain transition-transform duration-300 ease-out group-hover:scale-110"
                  />
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
                    <Icon className="h-5 w-5 shrink-0 text-2xl transition-transform duration-300 ease-out group-hover:scale-110" />
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
                  <span className="text-[11px] text-primary font-semibold">{userLeagueLabel}</span>
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
      <main className="app-scrollbar flex-1 min-w-0 overflow-y-auto md:ml-64">
        <div className="md:hidden h-14" /> {/* spacer for mobile header */}
        <div className="p-4 md:p-6">
          {children}
        </div>
      </main>

    </div>
  );
}
