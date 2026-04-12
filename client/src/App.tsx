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
import Funds from "./pages/Funds";
import Ranking from "./pages/Ranking";
import Feed from "./pages/Feed";
import Login from "./pages/Login";
import Chat from "./pages/Chat";
import Admin from "./pages/Admin";
function Router() {
  return (
    <Switch>
      <Route path="/login" component={Login} />
      <Route>
        <TopNavLayout>
          <Switch>
            <Route path="/" component={Dashboard} />
            <Route path="/sessions" component={Sessions} />
            <Route path="/venues" component={Venues} />
            <Route path="/invites" component={Invites} />
            <Route path="/funds" component={Funds} />
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
