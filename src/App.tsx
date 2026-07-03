import { Switch, Route, Router as WouterRouter } from "wouter";
    import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
    import Dashboard from "./pages/Dashboard";
    import TradePage from "./pages/TradePage";
    import AssetsPage from "./pages/AssetsPage";
    import LiveChartPage from "./pages/LiveChartPage";
    import NotFound from "./pages/not-found";

    // staleTime: 10_000 — data fetched in the last 10s won't be re-requested
    // when you switch browser tabs back to the dashboard. Previously staleTime: 0
    // caused ALL queries to fire at once on every tab focus, spiking Binance API weight.
    //
    // retry: 1 — if Binance returns 429/418, don't hammer it with 2 more retries.
    const queryClient = new QueryClient({
    defaultOptions: { queries: { staleTime: 10_000, retry: 1 } },
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
    
