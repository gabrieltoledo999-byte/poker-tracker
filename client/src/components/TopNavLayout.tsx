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
  Users,
  Wallet,
  Sun,
  Moon,
  Trophy,
  Globe,
  Menu,
  X,
  ChevronRight,
} from "lucide-react";
import { useTheme } from "@/contexts/ThemeContext";
import { useLocation } from "wouter";
import { SplashScreen } from "./SplashScreen";
import { trpc } from "@/lib/trpc";
import { useEffect, useState } from "react";

const FEED_LAST_SEEN_KEY_PREFIX = "feed-last-seen-ms";

const menuItems = [
  { icon: LayoutDashboard, label: "Início", path: "/" },
  { icon: ListChecks, label: "Sessões", path: "/sessions" },
  { icon: Wallet, label: "Fundos", path: "/funds" },
  { icon: Trophy, label: "Ranking", path: "/ranking" },
  { icon: Globe, label: "Feed", path: "/feed" },
  { icon: MapPin, label: "Locais", path: "/venues" },
  { icon: Users, label: "Amizades", path: "/invites" },
  { icon: Settings, label: "Configurações", path: "/settings" },
];

export default function TopNavLayout({ children }: { children: React.ReactNode }) {
  const { loading, user } = useAuth();
  const [location, setLocation] = useLocation();
  const [mobileOpen, setMobileOpen] = useState(false);
  const [feedLastSeenMs, setFeedLastSeenMs] = useState(0);
  const { theme, toggleTheme } = useTheme();

  const { data: latestFeedPosts } = trpc.feed.list.useQuery(
    { limit: 1, offset: 0 },
    {
      enabled: !!user,
      refetchInterval: 30000,
      staleTime: 10000,
    }
  );

  const { data: incomingFriendRequests = [] } = trpc.ranking.incomingRequests.useQuery(undefined, {
    enabled: !!user,
    refetchInterval: 30000,
    staleTime: 5000,
  });

  useEffect(() => {
    if (!user?.id) return;
    const key = `${FEED_LAST_SEEN_KEY_PREFIX}:${user.id}`;
    const savedValue = localStorage.getItem(key);
    const parsedValue = savedValue ? Number(savedValue) : 0;
    setFeedLastSeenMs(Number.isFinite(parsedValue) ? parsedValue : 0);
  }, [user?.id]);

  const latestPost = latestFeedPosts?.[0];
  const latestPostMs = latestPost?.createdAt ? new Date(latestPost.createdAt).getTime() : 0;
  const latestPostAuthorId = latestPost?.author?.id;
  const hasPendingFeedPost =
    !!user?.id &&
    location !== "/feed" &&
    latestPostMs > 0 &&
    latestPostAuthorId !== user.id &&
    latestPostMs > feedLastSeenMs;
  const hasPendingFriendRequest =
    !!user?.id && location !== "/invites" && incomingFriendRequests.length > 0;

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
                {item.path === "/feed" && hasPendingFeedPost && (
                  <span className="ml-auto h-2.5 w-2.5 rounded-full bg-red-500 shadow-[0_0_0_2px_hsl(var(--background))]" aria-label="Novo post no feed" />
                )}
                {item.path === "/invites" && hasPendingFriendRequest && (
                  <span className="ml-auto h-2.5 w-2.5 rounded-full bg-red-500 shadow-[0_0_0_2px_hsl(var(--background))]" aria-label="Novo pedido de amizade" />
                )}
                {isActive && <ChevronRight className="h-4 w-4 ml-auto text-primary/60" />}
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
                  <AvatarImage src={user.avatarUrl || undefined} />
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
                    {item.path === "/feed" && hasPendingFeedPost && (
                      <span className="ml-auto h-2.5 w-2.5 rounded-full bg-red-500" aria-label="Novo post no feed" />
                    )}
                    {item.path === "/invites" && hasPendingFriendRequest && (
                      <span className="ml-auto h-2.5 w-2.5 rounded-full bg-red-500" aria-label="Novo pedido de amizade" />
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
      <main className="flex-1 min-w-0 md:overflow-y-auto">
        <div className="md:hidden h-14" /> {/* spacer for mobile header */}
        <div className="p-4 md:p-6">
          {children}
        </div>
      </main>
    </div>
  );
}
