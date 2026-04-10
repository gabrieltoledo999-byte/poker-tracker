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
  Wallet,
  Sun,
  Moon,
  Trophy,
  Menu,
  X,
  ChevronRight,
  Sparkles,
} from "lucide-react";
import { useTheme } from "@/contexts/ThemeContext";
import { useLocation } from "wouter";
import { SplashScreen } from "./SplashScreen";
import { trpc } from "@/lib/trpc";
import { useEffect, useRef, useState } from "react";
import { toast } from "sonner";

const FEED_LAST_SEEN_KEY_PREFIX = "feed-last-seen-ms";

const menuItems = [
  { icon: LayoutDashboard, label: "Início", path: "/" },
  { icon: ListChecks, label: "Sessões", path: "/sessions" },
  { icon: Wallet, label: "Fundos", path: "/funds" },
  { icon: Trophy, label: "Ranking", path: "/ranking" },
  { icon: MapPin, label: "Locais", path: "/venues" },
  { icon: Sparkles, label: "Comunidade", path: "/feed" },
  { icon: Settings, label: "Configurações", path: "/settings" },
];

function getAvatarSrc(params: { id?: number | null; name?: string | null; email?: string | null; avatarUrl?: string | null }): string | undefined {
  const avatarUrl = params.avatarUrl?.trim();
  if (avatarUrl) return avatarUrl;

  const seedRaw = params.name?.trim() || params.email?.trim() || String(params.id ?? "user");
  const seed = encodeURIComponent(seedRaw);
  return `https://api.dicebear.com/9.x/thumbs/svg?seed=${seed}`;
}

export default function TopNavLayout({ children }: { children: React.ReactNode }) {
  const { loading, user } = useAuth();
  const [location, setLocation] = useLocation();
  const [mobileOpen, setMobileOpen] = useState(false);
  const [feedLastSeenMs, setFeedLastSeenMs] = useState(0);
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
    refetchInterval: 3000,
    staleTime: 1500,
    refetchOnWindowFocus: true,
  });

  const { data: unreadChatData } = trpc.chat.unreadCount.useQuery(undefined, {
    enabled: !!user,
    refetchInterval: 3000,
    staleTime: 1500,
    refetchOnWindowFocus: true,
  });
  const unreadChatCount = unreadChatData?.count ?? 0;

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
  const socialPendingCount = pendingFeedCount + incomingFriendRequests.length + unreadChatCount;
  const isInsideSocial = location === "/social" || location === "/feed" || location === "/invites" || location === "/chat";
  const hasPendingSocial = !!user?.id && !isInsideSocial && socialPendingCount > 0;
  const socialBadgeLabel = socialPendingCount > 99 ? "99+" : String(socialPendingCount);
  const previousIncomingCountRef = useRef(0);
  const previousUnreadChatCountRef = useRef(0);
  const audioContextRef = useRef<AudioContext | null>(null);

  const ensureAudioContext = () => {
    if (typeof window === "undefined") return null;
    const AudioContextCtor = window.AudioContext || (window as typeof window & { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
    if (!AudioContextCtor) return null;
    if (!audioContextRef.current) {
      audioContextRef.current = new AudioContextCtor();
    }
    if (audioContextRef.current.state === "suspended") {
      void audioContextRef.current.resume();
    }
    return audioContextRef.current;
  };

  const playIncomingMessageSound = () => {
    const audioContext = ensureAudioContext();
    if (!audioContext) return;

    const now = audioContext.currentTime;
    const gain = audioContext.createGain();
    gain.connect(audioContext.destination);
    gain.gain.setValueAtTime(0.0001, now);
    gain.gain.exponentialRampToValueAtTime(0.08, now + 0.02);
    gain.gain.exponentialRampToValueAtTime(0.0001, now + 0.4);

    const oscillator = audioContext.createOscillator();
    oscillator.type = "sine";
    oscillator.frequency.setValueAtTime(740, now);
    oscillator.frequency.exponentialRampToValueAtTime(520, now + 0.17);
    oscillator.connect(gain);
    oscillator.start(now);
    oscillator.stop(now + 0.22);

    const click = audioContext.createOscillator();
    const clickGain = audioContext.createGain();
    click.type = "triangle";
    click.frequency.setValueAtTime(980, now + 0.03);
    clickGain.gain.setValueAtTime(0.0001, now + 0.03);
    clickGain.gain.exponentialRampToValueAtTime(0.045, now + 0.05);
    clickGain.gain.exponentialRampToValueAtTime(0.0001, now + 0.16);
    click.connect(clickGain);
    clickGain.connect(audioContext.destination);
    click.start(now + 0.03);
    click.stop(now + 0.17);
  };

  useEffect(() => {
    const unlock = () => {
      ensureAudioContext();
      window.removeEventListener("pointerdown", unlock);
      window.removeEventListener("keydown", unlock);
    };

    window.addEventListener("pointerdown", unlock);
    window.addEventListener("keydown", unlock);

    return () => {
      window.removeEventListener("pointerdown", unlock);
      window.removeEventListener("keydown", unlock);
    };
  }, []);

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

    if (increased && document.visibilityState === "visible") {
      playIncomingMessageSound();

      if (location !== "/chat") {
        const delta = current - previous;
        toast.info(delta > 1 ? `${delta} novas mensagens` : "Nova mensagem recebida", {
          description: "Abra a aba Mensagens para responder.",
        });
      }
    }

    previousUnreadChatCountRef.current = current;
  }, [location, unreadChatCount, user?.id]);

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

  if (loading) return <SplashScreen />;

  if (!user) {
    window.location.replace("/login");
    return <SplashScreen />;
  }

  return (
    <div className="flex min-h-screen bg-background">
      {/* ── Sidebar Desktop ── */}
      <aside className="hidden md:flex flex-col w-64 shrink-0 border-r border-border/50 bg-card/30 sticky top-0 h-screen overflow-y-auto">
        {/* Logo */}
        <div
          className="flex items-center gap-3 px-5 py-5 cursor-pointer border-b border-border/30"
          onClick={() => setLocation("/")}
        >
          <img
            src="/favicon-symbol-large.png"
            alt="The Rail"
            className="h-14 w-14 object-contain"
          />
          <span className="text-xl font-bold tracking-tight gradient-text">The Rail</span>
        </div>

        {/* Nav Items */}
        <nav className="flex flex-col gap-1 px-3 py-4 flex-1">
          {menuItems.map((item) => {
            const Icon = item.icon;
            const isActive = location === item.path;
            return (
              <button
                key={item.path}
                onClick={() => setLocation(item.path)}
                className={`flex items-center gap-3 px-4 py-3 rounded-lg text-sm font-medium transition-all duration-150 w-full text-left
                  ${isActive
                    ? "bg-primary/15 text-primary border border-primary/20"
                    : "text-muted-foreground hover:text-foreground hover:bg-muted/50"
                  }`}
              >
                <Icon className={`h-5 w-5 shrink-0 ${isActive ? "text-primary" : ""}`} />
                <span className="text-base">{item.label}</span>
                {((item.path === "/social" && hasPendingSocial) ||
                  isActive) && (
                  <span className="ml-auto flex items-center gap-2">
                    {item.path === "/social" && hasPendingSocial && (
                      <span
                        className="inline-flex min-w-5 items-center justify-center rounded-full bg-red-500 px-1.5 py-0.5 text-[10px] font-bold leading-none text-white shadow-[0_0_0_2px_hsl(var(--background))]"
                        aria-label={`${socialBadgeLabel} novidades na Comunidade`}
                      >
                        {socialBadgeLabel}
                      </span>
                    )}
                    {isActive && <ChevronRight className="h-4 w-4 text-primary/60" />}
                  </span>
                )}
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
        <div className="flex items-center gap-2" onClick={() => setLocation("/")}>
          <img
            src="/favicon-symbol-large.png"
            alt="The Rail"
            className="h-10 w-10 object-contain"
          />
          <span className="font-bold gradient-text">The Rail</span>
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

      {/* ── Mobile Drawer ── */}
      {mobileOpen && (
        <div className="md:hidden fixed inset-0 z-50 flex">
          <div className="absolute inset-0 bg-black/60" onClick={() => setMobileOpen(false)} />
          <div className="relative w-72 bg-card h-full flex flex-col shadow-2xl">
            <div className="flex items-center justify-between px-5 py-4 border-b border-border/30">
              <div className="flex items-center gap-2">
                <img
                  src="/favicon-symbol-large.png"
                  alt="The Rail"
                  className="h-11 w-11 object-contain"
                />
                <span className="font-bold text-lg gradient-text">The Rail</span>
              </div>
              <Button variant="ghost" size="icon" onClick={() => setMobileOpen(false)}>
                <X className="h-5 w-5" />
              </Button>
            </div>
            <nav className="flex flex-col gap-1 px-3 py-4 flex-1">
              {menuItems.map((item) => {
                const Icon = item.icon;
                const isActive = location === item.path;
                return (
                  <button
                    key={item.path}
                    onClick={() => { setLocation(item.path); setMobileOpen(false); }}
                    className={`flex items-center gap-3 px-4 py-3 rounded-lg text-sm font-medium transition-all w-full text-left
                      ${isActive
                        ? "bg-primary/15 text-primary border border-primary/20"
                        : "text-muted-foreground hover:text-foreground hover:bg-muted/50"
                      }`}
                  >
                    <Icon className={`h-5 w-5 shrink-0 ${isActive ? "text-primary" : ""}`} />
                    <span className="text-base">{item.label}</span>
                    {item.path === "/social" && hasPendingSocial && (
                      <span
                        className="ml-auto inline-flex min-w-5 items-center justify-center rounded-full bg-red-500 px-1.5 py-0.5 text-[10px] font-bold leading-none text-white"
                        aria-label={`${socialBadgeLabel} novidades na Comunidade`}
                      >
                        {socialBadgeLabel}
                      </span>
                    )}
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
