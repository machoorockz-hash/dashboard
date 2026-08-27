import { type ReactNode } from "react";
import { Link, useLocation } from "wouter";
import { LayoutGrid, Wallet, Activity } from "lucide-react";
import { TickerTape } from "./TickerTape";

const NAV = [
  { to: "/", label: "Dashboard", icon: LayoutGrid },
  { to: "/assets", label: "Assets", icon: Wallet },
  { to: "/live-chart", label: "Live Chart", icon: Activity },
] as const;

export function AppLayout({ children }: { children: ReactNode }) {
  const [pathname] = useLocation();

  return (
    <div className="min-h-screen flex w-full bg-background text-foreground">
      <aside className="hidden md:flex md:flex-col w-56 shrink-0 border-r border-border bg-sidebar">
        <div className="flex items-center gap-2 px-5 py-5">
          <span className="text-lg font-extrabold tracking-tight bg-gradient-to-r from-primary to-emerald-300 bg-clip-text text-transparent">
            Binance Live
          </span>
        </div>
        <nav className="flex-1 px-3 py-2 space-y-1">
          {NAV.map((item) => {
            const active = pathname === item.to;
            const Icon = item.icon;
            return (
              <Link
                key={item.to}
                href={item.to}
                className={`flex items-center gap-3 rounded-lg px-3 py-2.5 text-sm font-medium transition-colors ${
                  active
                    ? "bg-primary/15 text-primary border-l-2 border-primary"
                    : "text-sidebar-foreground/70 hover:bg-sidebar-accent hover:text-sidebar-foreground"
                }`}
              >
                <Icon className="h-4 w-4" />
                {item.label}
              </Link>
            );
          })}
        </nav>
      </aside>

      <div className="flex-1 flex flex-col min-w-0">
        <TickerTape />
        <main className="flex-1 p-4 md:p-6 pb-24 md:pb-6 min-w-0 overflow-x-hidden">
          {children}
        </main>
        <nav className="md:hidden fixed bottom-0 inset-x-0 z-40 border-t border-border bg-sidebar/95 backdrop-blur">
          <div className="grid grid-cols-3">
            {NAV.map((item) => {
              const active = pathname === item.to;
              const Icon = item.icon;
              return (
                <Link
                  key={item.to}
                  href={item.to}
                  className={`flex flex-col items-center gap-1 py-2.5 text-[10px] font-medium ${
                    active ? "text-primary" : "text-sidebar-foreground/60"
                  }`}
                >
                  <Icon className="h-5 w-5" />
                  {item.label}
                </Link>
              );
            })}
          </div>
        </nav>
      </div>
    </div>
  );
}
