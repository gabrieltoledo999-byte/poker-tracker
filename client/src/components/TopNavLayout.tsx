import { useAuth } from "@/_core/hooks/useAuth";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Button } from "./ui/button";
import { getLoginUrl } from "@/const";
import {
  LayoutDashboard,
  LogOut,
  ListChecks,
  Settings,
  Spade,
  MapPin,
  Users,
  Wallet,
  Menu,
  Sun,
  Moon,
  Trophy,
  Globe,
} from "lucide-react";
import { useTheme } from "@/contexts/ThemeContext";
import { DropdownMenuSeparator } from "@/components/ui/dropdown-menu";
import { useLocation } from "wouter";
import { DashboardLayoutSkeleton } from "./DashboardLayoutSkeleton";
import { trpc } from "@/lib/trpc";
import { useState } from "react";
import { Sheet, SheetContent, SheetTrigger } from "@/components/ui/sheet";

const menuItems = [
  { icon: ListChecks, label: "Sessões", path: "/sessions" },
  { icon: Wallet, label: "Fundos", path: "/funds" },
  { icon: Trophy, label: "Ranking", path: "/ranking" },
  { icon: Globe, label: "Feed", path: "/feed" },
  { icon: MapPin, label: "Locais", path: "/venues" },
  { icon: Users, label: "Convites", path: "/invites" },
  { icon: Settings, label: "Configurações", path: "/settings" },
];

export default function TopNavLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const { loading, user } = useAuth();
  const [location, setLocation] = useLocation();
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);
  const { theme, toggleTheme } = useTheme();
  const logoutMutation = trpc.auth.logout.useMutation({
    onSuccess: () => {
      window.location.href = getLoginUrl();
    },
  });

  if (loading) {
    return <DashboardLayoutSkeleton />;
  }

  if (!user) {
    return (
      <div className="flex items-center justify-center min-h-screen">
        <div className="flex flex-col items-center gap-8 p-8 max-w-md w-full">
          <div className="flex flex-col items-center gap-6">
            <div className="flex items-center gap-2 mb-2">
              <img
                src="https://d2xsxph8kpxj0f.cloudfront.net/310419663029227103/D9ekUW97UoPRMShDJUiuZL/therail-logo-no-bg_405c3687.png"
                alt="The Rail"
                className="h-12 w-12 object-contain"
              />
              <span className="text-3xl font-bold gradient-text">
                The Rail
              </span>
            </div>
            <h1 className="text-2xl font-semibold tracking-tight text-center">
              Entre para continuar
            </h1>
            <p className="text-sm text-muted-foreground text-center max-w-sm">
              Faça login para acessar seu painel de controle de poker e
              gerenciar seu bankroll.
            </p>
          </div>
          <Button
            onClick={() => {
              window.location.href = getLoginUrl();
            }}
            size="lg"
            className="w-full bg-primary hover:opacity-90"
          >
            Entrar com Manus
          </Button>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen flex flex-col">
      {/* Top Navigation Bar */}
      <header className="sticky top-0 z-50 w-full border-b border-border bg-background/95 backdrop-blur supports-[backdrop-filter]:bg-background/60">
        <div className="container flex h-24 items-center gap-4">
          {/* Logo */}
          <button
            onClick={() => setLocation("/")}
            className="group relative flex items-center cursor-pointer shrink-0 transition-all duration-500"
            title="Voltar ao Dashboard"
          >
            <img
              src="https://d2xsxph8kpxj0f.cloudfront.net/310419663029227103/D9ekUW97UoPRMShDJUiuZL/therail-logo-no-bg_405c3687.png"
              alt="The Rail"
              className="h-40 w-40 object-contain relative z-10 transition-all duration-500 group-hover:scale-[1.04] group-hover:drop-shadow-[0_0_8px_rgba(34,211,238,0.5)]"
            />
            <span className="absolute inset-0 rounded-full bg-gradient-to-br from-cyan-400/0 via-purple-500/0 to-cyan-400/0 group-hover:from-cyan-400/10 group-hover:via-purple-500/10 group-hover:to-cyan-400/10 blur-md transition-all duration-500" />
          </button>

          {/* Desktop Navigation */}
          <nav className="hidden md:flex items-center gap-1 flex-1 justify-center">
            {menuItems.map((item) => {
              const Icon = item.icon;
              const isActive = location === item.path;
              return (
                <Button
                  key={item.path}
                  variant="ghost"
                  className={`gap-2 ${
                    isActive
                      ? "bg-primary/20 text-primary"
                      : "text-muted-foreground hover:text-foreground"
                  }`}
                  onClick={() => setLocation(item.path)}
                >
                  <Icon className="h-4 w-4" />
                  <span>{item.label}</span>
                </Button>
              );
            })}
          </nav>

            {/* User Menu */}
          <div className="flex items-center gap-2 shrink-0 ml-auto">
            {/* Theme Toggle Button */}
            <Button
              variant="ghost"
              size="icon"
              onClick={toggleTheme}
              title={theme === "dark" ? "Mudar para tema claro" : "Mudar para tema escuro"}
              className="text-muted-foreground hover:text-foreground"
            >
              {theme === "dark" ? <Sun className="h-5 w-5" /> : <Moon className="h-5 w-5" />}
            </Button>
            {/* Mobile Menu */}
            <Sheet open={mobileMenuOpen} onOpenChange={setMobileMenuOpen}>
              <SheetTrigger asChild>
                <Button variant="ghost" size="icon" className="md:hidden">
                  <Menu className="h-5 w-5" />
                </Button>
              </SheetTrigger>
              <SheetContent
                side="left"
                className="bg-background border-border"
              >
                <div className="flex flex-col gap-2 mt-8">
                  {menuItems.map((item) => {
                    const Icon = item.icon;
                    const isActive = location === item.path;
                    return (
                      <Button
                        key={item.path}
                        variant="ghost"
                        className={`justify-start gap-2 ${
                          isActive
                            ? "bg-primary/20 text-primary"
                            : "text-muted-foreground hover:text-foreground"
                        }`}
                        onClick={() => {
                          setLocation(item.path);
                          setMobileMenuOpen(false);
                        }}
                      >
                        <Icon className="h-4 w-4" />
                        <span>{item.label}</span>
                      </Button>
                    );
                  })}
                </div>
              </SheetContent>
            </Sheet>

            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <Button
                  variant="ghost"
                  className="relative h-10 w-10 rounded-full"
                >
                  <Avatar className="h-10 w-10">
                    <AvatarImage src={user.avatarUrl || undefined} />
                    <AvatarFallback className="bg-primary text-primary-foreground">
                      {user.name?.charAt(0).toUpperCase() || "U"}
                    </AvatarFallback>
                  </Avatar>
                </Button>
              </DropdownMenuTrigger>
              <DropdownMenuContent
                align="end"
                className="bg-popover border-border"
              >
                <div className="flex items-center justify-start gap-2 p-2">
                  <div className="flex flex-col space-y-1">
                    <p className="text-sm font-medium">{user.name}</p>
                    <p className="text-xs text-muted-foreground">
                      {user.email}
                    </p>
                  </div>
                </div>
                <DropdownMenuSeparator />
                <DropdownMenuItem
                  onClick={toggleTheme}
                  className="cursor-pointer"
                >
                  {theme === "dark" ? (
                    <><Sun className="mr-2 h-4 w-4" />Tema Claro</>
                  ) : (
                    <><Moon className="mr-2 h-4 w-4" />Tema Escuro</>
                  )}
                </DropdownMenuItem>
                <DropdownMenuSeparator />
                <DropdownMenuItem
                  onClick={() => logoutMutation.mutate()}
                  className="cursor-pointer text-[oklch(0.55_0.22_25)]"
                >
                  <LogOut className="mr-2 h-4 w-4" />
                  Sair
                </DropdownMenuItem>
              </DropdownMenuContent>
            </DropdownMenu>
          </div>
        </div>
      </header>

      {/* Main Content */}
      <main className="flex-1 container py-6">{children}</main>
    </div>
  );
}
