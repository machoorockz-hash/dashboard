import { type ReactNode } from "react";
import { TickerTape } from "./TickerTape";

export function AppLayout({ children }: { children: ReactNode }) {
  return (
    <div className="min-h-screen flex w-full bg-background text-foreground">
      <div className="flex-1 flex flex-col min-w-0">
        <TickerTape />

        <main className="flex-1 p-4 md:p-6 min-w-0 overflow-x-hidden">
          {children}
        </main>
      </div>
    </div>
  );
}
