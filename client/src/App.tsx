import { Toaster } from "@/components/ui/sonner";
import { TooltipProvider } from "@/components/ui/tooltip";
import NotFound from "@/pages/NotFound";
import { Route, Switch } from "wouter";
import ErrorBoundary from "./components/ErrorBoundary";
import { ThemeProvider } from "./contexts/ThemeContext";
import TopNavLayout from "./components/TopNavLayout";
import Dashboard from "./pages/Dashboard";
import Sessions from "./pages/Sessions";
import Settings from "./pages/Settings";
import Venues from "./pages/Venues";
import Invites from "./pages/Invites";
import Ranking from "./pages/Ranking";
import Feed from "./pages/Feed";
import Login from "./pages/Login";
import Chat from "./pages/Chat";
import Admin from "./pages/Admin";
import Gto from "./pages/Gto";
import HandReviewer from "./pages/HandReviewer";
import HandReviewerReplay from "./pages/HandReviewerReplay";
import IcmCalculator from "./pages/IcmCalculator";
function Router() {
  return (
    <Switch>
      <Route path="/login" component={Login} />
      <Route path="/hand-review/replay/:sessionId" component={HandReviewerReplay} />
      <Route>
        <TopNavLayout>
          <Switch>
            <Route path="/" component={Dashboard} />
            <Route path="/sessions" component={Sessions} />
            <Route path="/venues" component={Venues} />
            <Route path="/invites" component={Invites} />
            <Route path="/gto" component={Gto} />
            <Route path="/hand-reviewer" component={HandReviewer} />
            <Route path="/hand-review/import" component={HandReviewer} />
            <Route path="/icm-calculator" component={IcmCalculator} />
            <Route path="/social" component={Feed} />
            <Route path="/chat" component={Chat} />
            <Route path="/ranking" component={Ranking} />
            <Route path="/feed" component={Feed} />
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

function App() {
  return (
    <ErrorBoundary>
      <ThemeProvider defaultTheme="dark" switchable={true}>
        <TooltipProvider>
          <Toaster />
          <Router />
        </TooltipProvider>
      </ThemeProvider>
    </ErrorBoundary>
  );
}

export default App;
