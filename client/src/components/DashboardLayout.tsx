import { useAuth } from "@/_core/hooks/useAuth";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import {
  Sidebar,
  SidebarContent,
  SidebarFooter,
  SidebarHeader,
  SidebarInset,
  SidebarMenu,
  SidebarMenuButton,
  SidebarMenuItem,
  SidebarProvider,
  SidebarTrigger,
  useSidebar,
} from "@/components/ui/sidebar";
import { useIsMobile } from "@/hooks/useMobile";
import { LayoutDashboard, LogOut, PanelLeft, ListChecks, Settings, MapPin, Users, Wallet, Palette } from "lucide-react";
import { CSSProperties, useEffect, useRef, useState } from "react";
import { useLocation } from "wouter";
import { DashboardLayoutSkeleton } from './DashboardLayoutSkeleton';
import { Button } from "./ui/button";
import { useTheme, ACCENT_COLORS, AccentColor } from "@/contexts/ThemeContext";
import { DropdownMenuSeparator } from "@/components/ui/dropdown-menu";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip";

function ColorPickerButton({ isCollapsed, compact = false }: { isCollapsed: boolean; compact?: boolean }) {
  const { accentColor } = useTheme();
  const currentColor = ACCENT_COLORS[accentColor];
  return (
    <TooltipProvider delayDuration={300}>
      <Tooltip>
        <Popover>
          <TooltipTrigger asChild>
            <PopoverTrigger asChild>
              <button
                className={`flex items-center gap-2 rounded-lg hover:bg-accent/50 transition-colors focus:outline-none focus-visible:ring-2 focus-visible:ring-ring ${
                  compact ? "p-1.5 shrink-0" : "w-full px-2 py-2 text-left"
                }`}
              >
                <span
                  className="h-5 w-5 rounded-full border-2 border-white/30 shrink-0 flex items-center justify-center"
                  style={{ backgroundColor: currentColor.hex }}
                >
                  <Palette className="h-2.5 w-2.5 text-white" />
                </span>
                {!isCollapsed && !compact && (
                  <span className="text-xs text-muted-foreground truncate">
                    Cor: <span className="font-medium" style={{ color: currentColor.hex }}>{currentColor.label}</span>
                  </span>
                )}
              </button>
            </PopoverTrigger>
          </TooltipTrigger>
          <TooltipContent side="bottom">
            <p>Mudar cor de destaque</p>
          </TooltipContent>
          <PopoverContent side="bottom" align="end" className="w-52 p-3">
            <p className="text-xs font-medium mb-3 flex items-center gap-1.5">
              <Palette className="h-3.5 w-3.5" /> Cor de destaque
            </p>
            <ColorPicker />
          </PopoverContent>
        </Popover>
      </Tooltip>
    </TooltipProvider>
  );
}

function ColorPicker() {
  const { accentColor, setAccentColor } = useTheme();
  return (
    <div className="flex gap-2 flex-wrap" onClick={(e) => e.stopPropagation()}>
      {(Object.entries(ACCENT_COLORS) as [AccentColor, { label: string; hex: string; hue: number; chroma: number }][]).map(([key, val]) => (
        <button
          key={key}
          title={val.label}
          type="button"
          onMouseDown={(e) => {
            e.preventDefault();
            e.stopPropagation();
            setAccentColor(key);
          }}
          className={`h-6 w-6 rounded-full border-2 transition-all ${
            accentColor === key ? "border-white scale-110 shadow-lg" : "border-transparent opacity-70 hover:opacity-100 hover:scale-105"
          }`}
          style={{ backgroundColor: val.hex }}
        />
      ))}
    </div>
  );
}

const menuItems = [
  { icon: LayoutDashboard, label: "Dashboard", path: "/" },
  { icon: ListChecks, label: "Sessões", path: "/sessions" },
  { icon: Wallet, label: "Caixa", path: "/funds" },
  { icon: MapPin, label: "Salas", path: "/venues" },
  { icon: Users, label: "Amizades", path: "/invites" },
  { icon: Settings, label: "Configurações", path: "/settings" },
];

const SIDEBAR_WIDTH_KEY = "sidebar-width";
const DEFAULT_WIDTH = 280;
const MIN_WIDTH = 200;
const MAX_WIDTH = 480;

export default function DashboardLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const [sidebarWidth, setSidebarWidth] = useState(() => {
    const saved = localStorage.getItem(SIDEBAR_WIDTH_KEY);
    return saved ? parseInt(saved, 10) : DEFAULT_WIDTH;
  });
  const { loading, user } = useAuth();

  useEffect(() => {
    localStorage.setItem(SIDEBAR_WIDTH_KEY, sidebarWidth.toString());
  }, [sidebarWidth]);

  if (loading) {
    return <DashboardLayoutSkeleton />
  }

  if (!user) {
    return (
      <div className="flex items-center justify-center min-h-screen bg-background">
        <div className="flex flex-col items-center gap-10 p-8 max-w-sm w-full">
          {/* Logo grande */}
          <div className="flex flex-col items-center gap-4">
            <img
              src="/favicon-symbol-large.png"
              alt="The Rail"
              className="h-44 md:h-48 w-auto object-contain drop-shadow-xl"
            />
            <div className="flex flex-col items-center gap-1">
              <span className="text-sm text-muted-foreground tracking-widest uppercase">Poker Bankroll Tracker</span>
            </div>
          </div>
          {/* Texto e botão */}
          <div className="flex flex-col items-center gap-4 w-full">
            <h1 className="text-xl font-semibold tracking-tight text-center">
              Entre para continuar
            </h1>
            <p className="text-sm text-muted-foreground text-center max-w-xs">
              Gerencie seu bankroll, registre sessões e acompanhe sua evolução no poker.
            </p>
            <Button
              onClick={() => {
                window.location.href = "/login";
              }}
              size="lg"
              className="w-full shadow-lg hover:shadow-xl transition-all mt-2"
            >
              Entrar
            </Button>
          </div>
        </div>
      </div>
    );
  }

  return (
    <SidebarProvider
      style={
        {
          "--sidebar-width": `${sidebarWidth}px`,
        } as CSSProperties
      }
    >
      <DashboardLayoutContent setSidebarWidth={setSidebarWidth}>
        {children}
      </DashboardLayoutContent>
    </SidebarProvider>
  );
}

type DashboardLayoutContentProps = {
  children: React.ReactNode;
  setSidebarWidth: (width: number) => void;
};

function DashboardLayoutContent({
  children,
  setSidebarWidth,
}: DashboardLayoutContentProps) {
  const { user, logout } = useAuth();
  const [location, setLocation] = useLocation();
  const { state, toggleSidebar } = useSidebar();
  const isCollapsed = state === "collapsed";
  const [isResizing, setIsResizing] = useState(false);
  const sidebarRef = useRef<HTMLDivElement>(null);
  const activeMenuItem = menuItems.find(item => item.path === location);
  const isMobile = useIsMobile();
  const [isBrandHovered, setIsBrandHovered] = useState(false);
  const [hoveredMenuPath, setHoveredMenuPath] = useState<string | null>(null);

  useEffect(() => {
    if (isCollapsed) {
      setIsResizing(false);
    }
  }, [isCollapsed]);

  useEffect(() => {
    const handleMouseMove = (e: MouseEvent) => {
      if (!isResizing) return;

      const sidebarLeft = sidebarRef.current?.getBoundingClientRect().left ?? 0;
      const newWidth = e.clientX - sidebarLeft;
      if (newWidth >= MIN_WIDTH && newWidth <= MAX_WIDTH) {
        setSidebarWidth(newWidth);
      }
    };

    const handleMouseUp = () => {
      setIsResizing(false);
    };

    if (isResizing) {
      document.addEventListener("mousemove", handleMouseMove);
      document.addEventListener("mouseup", handleMouseUp);
      document.body.style.cursor = "col-resize";
      document.body.style.userSelect = "none";
    }

    return () => {
      document.removeEventListener("mousemove", handleMouseMove);
      document.removeEventListener("mouseup", handleMouseUp);
      document.body.style.cursor = "";
      document.body.style.userSelect = "";
    };
  }, [isResizing, setSidebarWidth]);

  return (
    <>
      <div className="relative" ref={sidebarRef}>
        <Sidebar
          collapsible="icon"
          className="border-r-0"
          disableTransition={isResizing}
        >
          <SidebarHeader className="h-16 justify-center">
            <div className="flex items-center gap-2 px-2 transition-all w-full">
              <button
                onClick={toggleSidebar}
                className="h-8 w-8 flex items-center justify-center hover:bg-accent rounded-lg transition-colors focus:outline-none focus-visible:ring-2 focus-visible:ring-ring shrink-0"
                aria-label="Toggle navigation"
              >
                <PanelLeft className="h-4 w-4 text-muted-foreground" />
              </button>
              {!isCollapsed ? (
                <div
                  className="flex items-center gap-2 min-w-0 flex-1 cursor-pointer rounded-xl px-1.5 py-1"
                  onMouseEnter={() => setIsBrandHovered(true)}
                  onMouseLeave={() => setIsBrandHovered(false)}
                  onClick={() => setLocation("/")}
                  style={{
                    transform: isBrandHovered ? "scale(1.04)" : "scale(1)",
                    background: isBrandHovered
                      ? "linear-gradient(90deg, color-mix(in oklab, var(--primary) 26%, transparent), color-mix(in oklab, var(--secondary) 16%, transparent), color-mix(in oklab, var(--primary) 26%, transparent))"
                      : "transparent",
                    boxShadow: isBrandHovered
                      ? "0 0 0 1px rgba(255,255,255,0.10), 0 12px 26px rgba(0,0,0,0.22)"
                      : "none",
                    transition: "transform 0.2s ease, box-shadow 0.2s ease, background 0.2s ease",
                  }}
                >
                  <img
                    src="/therail-logo.png"
                    alt="The Rail"
                    className="h-10 w-auto object-contain"
                    style={{
                      transform: isBrandHovered ? "scale(1.12)" : "scale(1)",
                      filter: isBrandHovered
                        ? "drop-shadow(0 0 10px rgba(239,68,68,0.85)) drop-shadow(0 0 18px rgba(59,130,246,0.35))"
                        : "none",
                      transition: "transform 0.2s ease, filter 0.2s ease",
                    }}
                  />
                  <span
                    className="font-semibold tracking-wide text-sm md:text-base whitespace-nowrap"
                    style={{
                      transform: isBrandHovered ? "scale(1.06)" : "scale(1)",
                      color: isBrandHovered ? "color-mix(in oklab, var(--foreground) 60%, var(--primary) 40%)" : "",
                      textShadow: isBrandHovered ? "0 0 10px rgba(239,68,68,0.55)" : "none",
                      transition: "transform 0.2s ease, color 0.2s ease, text-shadow 0.2s ease",
                    }}
                  >
                    The Rail
                  </span>
                </div>
              ) : (
                <div
                  className="flex justify-center cursor-pointer rounded-xl px-1 py-1"
                  onMouseEnter={() => setIsBrandHovered(true)}
                  onMouseLeave={() => setIsBrandHovered(false)}
                  onClick={() => setLocation("/")}
                  style={{
                    transform: isBrandHovered ? "scale(1.04)" : "scale(1)",
                    background: isBrandHovered
                      ? "linear-gradient(90deg, color-mix(in oklab, var(--primary) 24%, transparent), color-mix(in oklab, var(--secondary) 14%, transparent))"
                      : "transparent",
                    boxShadow: isBrandHovered
                      ? "0 0 0 1px rgba(255,255,255,0.10), 0 10px 24px rgba(0,0,0,0.20)"
                      : "none",
                    transition: "transform 0.2s ease, box-shadow 0.2s ease, background 0.2s ease",
                  }}
                >
                  <img
                    src="/therail-logo.png"
                    alt="The Rail"
                    className="h-10 w-auto object-contain"
                    style={{
                      transform: isBrandHovered ? "scale(1.12)" : "scale(1)",
                      filter: isBrandHovered ? "drop-shadow(0 0 12px rgba(239,68,68,0.85))" : "none",
                      transition: "transform 0.2s ease, filter 0.2s ease",
                    }}
                  />
                </div>
              )}
            </div>
          </SidebarHeader>

          <SidebarContent className="gap-0">
            <SidebarMenu className="px-2 py-1">
              {menuItems.map(item => {
                const isActive = location === item.path;
                const isHovered = hoveredMenuPath === item.path;
                return (
                  <SidebarMenuItem key={item.path}>
                    <SidebarMenuButton
                      isActive={isActive}
                      onClick={() => setLocation(item.path)}
                      onMouseEnter={() => setHoveredMenuPath(item.path)}
                      onMouseLeave={() => setHoveredMenuPath(null)}
                      tooltip={item.label}
                      className={`h-10 transition-all font-normal`}
                      style={{
                        transform: isHovered ? "translateX(4px) scale(1.02)" : "translateX(0) scale(1)",
                        background: isHovered
                          ? "linear-gradient(90deg, color-mix(in oklab, var(--primary) 18%, transparent), color-mix(in oklab, var(--secondary) 10%, transparent))"
                          : undefined,
                        boxShadow: isHovered
                          ? "inset 2px 0 0 color-mix(in oklab, var(--primary) 72%, transparent), 0 6px 14px rgba(0,0,0,0.14)"
                          : undefined,
                        transition: "transform 0.18s ease, box-shadow 0.18s ease, background 0.18s ease",
                      }}
                    >
                      <item.icon
                        className={`h-4 w-4 ${isActive ? "text-primary" : ""}`}
                        style={{
                          transform: isHovered ? "scale(1.12)" : "scale(1)",
                          filter: isHovered ? "drop-shadow(0 0 8px rgba(239,68,68,0.55))" : "none",
                          transition: "transform 0.18s ease, filter 0.18s ease",
                        }}
                      />
                      <span
                        style={{
                          textShadow: isHovered ? "0 0 8px rgba(239,68,68,0.30)" : "none",
                          transition: "text-shadow 0.18s ease",
                        }}
                      >
                        {item.label}
                      </span>
                    </SidebarMenuButton>
                  </SidebarMenuItem>
                );
              })}
            </SidebarMenu>
          </SidebarContent>


          <SidebarFooter className="p-3">
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <button className="flex items-center gap-3 rounded-lg px-1 py-1 hover:bg-accent/50 transition-colors w-full text-left group-data-[collapsible=icon]:justify-center focus:outline-none focus-visible:ring-2 focus-visible:ring-ring">
                  <Avatar className="h-9 w-9 border shrink-0">
                    <AvatarImage src={(user as any)?.avatarUrl || undefined} />
                    <AvatarFallback className="text-xs font-medium">
                      {user?.name?.charAt(0).toUpperCase()}
                    </AvatarFallback>
                  </Avatar>
                  <div className="flex-1 min-w-0 group-data-[collapsible=icon]:hidden">
                    <p className="text-sm font-medium truncate leading-none">
                      {user?.name || "-"}
                    </p>
                    <p className="text-xs text-muted-foreground truncate mt-1.5">
                      {user?.email || "-"}
                    </p>
                  </div>
                </button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="end" className="w-52">
                <div className="px-2 py-2">
                  <p className="text-xs text-muted-foreground mb-2 flex items-center gap-1"><Palette className="h-3 w-3" /> Cor de destaque</p>
                  <ColorPicker />
                </div>
                <DropdownMenuSeparator />
                <DropdownMenuItem
                  onClick={logout}
                  className="cursor-pointer text-destructive focus:text-destructive"
                >
                  <LogOut className="mr-2 h-4 w-4" />
                  <span>Sair</span>
                </DropdownMenuItem>
              </DropdownMenuContent>
            </DropdownMenu>
          </SidebarFooter>
        </Sidebar>
        <div
          className={`absolute top-0 right-0 w-1 h-full cursor-col-resize hover:bg-primary/20 transition-colors ${isCollapsed ? "hidden" : ""}`}
          onMouseDown={() => {
            if (isCollapsed) return;
            setIsResizing(true);
          }}
          style={{ zIndex: 50 }}
        />
      </div>

      <SidebarInset>
        {/* Topbar — desktop e mobile */}
        <div className="flex border-b h-14 items-center justify-between bg-background/95 px-4 backdrop-blur supports-[backdrop-filter]:backdrop-blur sticky top-0 z-40">
          <div className="flex items-center gap-2">
            {isMobile && <SidebarTrigger className="h-9 w-9 rounded-lg bg-background" />}
            <span className="tracking-tight text-foreground font-medium">
              {activeMenuItem?.label ?? ""}
            </span>
          </div>
          <div className="flex items-center gap-2">
            <ColorPickerButton isCollapsed={false} compact />
          </div>
        </div>
        <main className="flex-1 p-4 lg:p-5">
          <div className="mx-auto w-full max-w-[1380px]">{children}</div>
        </main>
      </SidebarInset>
    </>
  );
}
