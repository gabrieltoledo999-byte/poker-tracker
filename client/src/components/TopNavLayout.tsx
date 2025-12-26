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
} from "lucide-react";
import { useLocation } from "wouter";
import { DashboardLayoutSkeleton } from "./DashboardLayoutSkeleton";
import { trpc } from "@/lib/trpc";
import { useState } from "react";
import { Sheet, SheetContent, SheetTrigger } from "@/components/ui/sheet";

const menuItems = [
  { icon: LayoutDashboard, label: "Dashboard", path: "/" },
  { icon: ListChecks, label: "Sessões", path: "/sessions" },
  { icon: Wallet, label: "Fundos", path: "/funds" },
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
              <Spade className="h-8 w-8 text-primary" />
              <span className="text-3xl font-bold gradient-text">
                Poker Tracker
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
            className="w-full bg-[oklch(0.55_0.18_145)] hover:bg-[oklch(0.5_0.18_145)]"
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
      <header className="sticky top-0 z-50 w-full border-b border-[oklch(0.28_0.03_150)] bg-[oklch(0.14_0.01_150)]/95 backdrop-blur supports-[backdrop-filter]:bg-[oklch(0.14_0.01_150)]/60">
        <div className="container flex h-16 items-center justify-between">
          {/* Logo */}
          <div className="flex items-center gap-2">
            <Spade className="h-6 w-6 text-[oklch(0.55_0.18_145)]" />
            <span className="text-xl font-bold gradient-text hidden sm:inline">
              Poker Tracker
            </span>
          </div>

          {/* Desktop Navigation */}
          <nav className="hidden md:flex items-center gap-1">
            {menuItems.map((item) => {
              const Icon = item.icon;
              const isActive = location === item.path;
              return (
                <Button
                  key={item.path}
                  variant="ghost"
                  className={`gap-2 ${
                    isActive
                      ? "bg-[oklch(0.55_0.18_145)]/20 text-[oklch(0.6_0.2_145)]"
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
          <div className="flex items-center gap-2">
            {/* Mobile Menu */}
            <Sheet open={mobileMenuOpen} onOpenChange={setMobileMenuOpen}>
              <SheetTrigger asChild>
                <Button variant="ghost" size="icon" className="md:hidden">
                  <Menu className="h-5 w-5" />
                </Button>
              </SheetTrigger>
              <SheetContent
                side="left"
                className="bg-[oklch(0.14_0.01_150)] border-[oklch(0.28_0.03_150)]"
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
                            ? "bg-[oklch(0.55_0.18_145)]/20 text-[oklch(0.6_0.2_145)]"
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
                    <AvatarFallback className="bg-[oklch(0.55_0.18_145)] text-white">
                      {user.name?.charAt(0).toUpperCase() || "U"}
                    </AvatarFallback>
                  </Avatar>
                </Button>
              </DropdownMenuTrigger>
              <DropdownMenuContent
                align="end"
                className="bg-[oklch(0.18_0.02_150)] border-[oklch(0.28_0.03_150)]"
              >
                <div className="flex items-center justify-start gap-2 p-2">
                  <div className="flex flex-col space-y-1">
                    <p className="text-sm font-medium">{user.name}</p>
                    <p className="text-xs text-muted-foreground">
                      {user.email}
                    </p>
                  </div>
                </div>
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
