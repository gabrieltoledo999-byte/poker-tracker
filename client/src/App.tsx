import { Toaster } from "@/components/ui/sonner";
import { TooltipProvider } from "@/components/ui/tooltip";
import { trpc } from "@/lib/trpc";
import NotFound from "@/pages/NotFound";
import { useEffect, useRef } from "react";
import { Route, Switch } from "wouter";
import ErrorBoundary from "./components/ErrorBoundary";
import { ThemeProvider } from "./contexts/ThemeContext";
import { useAuth } from "./_core/hooks/useAuth";
import TopNavLayout from "./components/TopNavLayout";
import Dashboard from "./pages/Dashboard";
import Sessions from "./pages/Sessions";
import Settings from "./pages/Settings";
import Venues from "./pages/Venues";
import Invites from "./pages/Invites";
import Ranking from "./pages/Ranking";
import Feed from "./pages/Feed";
import Login from "./pages/Login";
import Onboarding from "./pages/Onboarding";
import Chat from "./pages/Chat";
import Admin from "./pages/Admin";
import Gto from "./pages/Gto";
import GtoStudyTable from "./pages/GtoStudyTable";
import HandReviewer from "./pages/HandReviewer";
import HandReviewerReplay from "./pages/HandReviewerReplay";
import LandingReplayerPreview from "./pages/LandingReplayerPreview";
import LandingReplayerHub from "./pages/LandingReplayerHub";
import IcmCalculator from "./pages/IcmCalculator";
import OddsCalculator from "./pages/OddsCalculator";
import SocialProfile from "./pages/SocialProfile";

function Router() {
  return (
    <Switch>
      <Route path="/preview/replayer-landing" component={LandingReplayerPreview} />
      <Route path="/preview/replayer-hub" component={LandingReplayerHub} />
      <Route path="/login" component={Login} />
      <Route path="/onboarding" component={Onboarding} />
      <Route path="/hand-review/replay/:sessionId" component={HandReviewerReplay} />
      <Route>
        <TopNavLayout>
          <Switch>
            <Route path="/" component={Dashboard} />
            <Route path="/dashboard" component={Dashboard} />
            <Route path="/sessions" component={Sessions} />
            <Route path="/venues" component={Venues} />
            <Route path="/invites" component={Invites} />
            <Route path="/gto" component={Gto} />
            <Route path="/gto-study-table" component={GtoStudyTable} />
            <Route path="/hand-reviewer" component={HandReviewer} />
            <Route path="/hand-review/import" component={HandReviewer} />
            <Route path="/icm-calculator" component={IcmCalculator} />
            <Route path="/equity-calculator" component={OddsCalculator} />
            <Route path="/social" component={Feed} />
            <Route path="/chat" component={Chat} />
            <Route path="/ranking" component={Ranking} />
            <Route path="/feed" component={Feed} />
            <Route path="/profile/:username" component={SocialProfile} />
            <Route path="/settings" component={Settings} />
            <Route path="/admin" component={Admin} />
            <Route path="/404" component={NotFound} />
            <Route component={NotFound} />
          </Switch>
        </TopNavLayout>
      </Route>
    </Switch>
  );
}

const APP_PRESENCE_SESSION_KEY = "app-presence-session-key";
const APP_PRESENCE_HEARTBEAT_MS = 60_000;

function getPresenceSessionKey() {
  if (typeof window === "undefined") return "";

  const existing = window.sessionStorage.getItem(APP_PRESENCE_SESSION_KEY);
  if (existing && existing.length >= 16) return existing;

  const generated = typeof crypto !== "undefined" && "randomUUID" in crypto
    ? crypto.randomUUID().replace(/-/g, "")
    : `${Date.now()}${Math.random().toString(16).slice(2)}${Math.random().toString(16).slice(2)}`;

  window.sessionStorage.setItem(APP_PRESENCE_SESSION_KEY, generated);
  return generated;
}

function PresenceTracker() {
  const { user, isAuthenticated, loading } = useAuth();
  const pingMutation = trpc.presence.ping.useMutation();
  const closeMutation = trpc.presence.close.useMutation();
  const pingRef = useRef(pingMutation.mutate);
  const closeRef = useRef(closeMutation.mutate);

  pingRef.current = pingMutation.mutate;
  closeRef.current = closeMutation.mutate;

  const userId = user?.id ?? null;

  useEffect(() => {
    if (loading || !isAuthenticated || !userId) return;
    if (typeof window === "undefined") return;

    const sessionKey = getPresenceSessionKey();
    if (!sessionKey) return;

    const safePing = () => {
      if (document.visibilityState === "hidden") return;
      pingRef.current({ sessionKey });
    };

    safePing();

    const intervalId = window.setInterval(safePing, APP_PRESENCE_HEARTBEAT_MS);
    const onVisibilityChange = () => {
      if (document.visibilityState === "visible") {
        safePing();
        return;
      }
      closeRef.current({ sessionKey });
    };
    const onPageHide = () => {
      closeRef.current({ sessionKey });
    };

    document.addEventListener("visibilitychange", onVisibilityChange);
    window.addEventListener("pagehide", onPageHide);

    return () => {
      window.clearInterval(intervalId);
      document.removeEventListener("visibilitychange", onVisibilityChange);
      window.removeEventListener("pagehide", onPageHide);
      closeRef.current({ sessionKey });
    };
  }, [isAuthenticated, loading, userId]);

  return null;
}

function App() {
  return (
    <ErrorBoundary>
      <ThemeProvider defaultTheme="dark" switchable={true}>
        <TooltipProvider>
          <PresenceTracker />
          <Toaster />
          <Router />
        </TooltipProvider>
      </ThemeProvider>
    </ErrorBoundary>
  );
}

export default App;
