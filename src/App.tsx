import { Switch, Route, Router as WouterRouter } from "wouter";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import Dashboard from "./pages/Dashboard";
import TradePage from "./pages/TradePage";
import AssetsPage from "./pages/AssetsPage";
import LiveChartPage from "./pages/LiveChartPage";
import NotFound from "./pages/not-found";

const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      // Keep data in cache for 5 minutes after a component unmounts.
      // This means navigating away and back shows instant data instead
      // of a blank screen while the next fetch completes.
      gcTime: 5 * 60 * 1000,

      // Always consider data stale so background refetches run on schedule.
      staleTime: 0,

      // Retry up to 3 times with exponential back-off (1 s → 2 s → 4 s).
      // This handles Binance 429 rate-limit bursts and transient 5xx errors
      // without hammering the endpoint immediately.
      retry: 3,
      retryDelay: (attempt) => Math.min(1000 * 2 ** attempt, 10_000),
    },
  },
});

function Router() {
  return (
    <Switch>
      <Route path="/" component={Dashboard} />
      <Route path="/trade" component={TradePage} />
      <Route path="/assets" component={AssetsPage} />
      <Route path="/live-chart" component={LiveChartPage} />
      <Route component={NotFound} />
    </Switch>
  );
}

export default function App() {
  return (
    <QueryClientProvider client={queryClient}>
      <WouterRouter>
        <Router />
      </WouterRouter>
    </QueryClientProvider>
  );
}
