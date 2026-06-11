import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import {
  Outlet,
  createRootRouteWithContext,
  HeadContent,
  Scripts,
} from "@tanstack/react-router";
import { type ReactNode } from "react";

import appCss from "../styles.css?url";
import { AppLayout } from "@/components/AppLayout";

export const Route = createRootRouteWithContext<{ queryClient: QueryClient }>()({
  head: () => ({
    meta: [
      { charSet: "utf-8" },
      { name: "viewport", content: "width=device-width, initial-scale=1" },
      { title: "Binance Trading Dashboard" },
      { name: "description", content: "Binance Trade Dashboard" },
      { property: "og:title", content: "Binance Trading Dashboard" },
      { name: "twitter:title", content: "Binance Trading Dashboard" },
      { property: "og:description", content: "Binance Trade Dashboard" },
      { name: "twitter:description", content: "Binance Trade Dashboard" },
      { property: "og:image", content: "https://storage.googleapis.com/gpt-engineer-file-uploads/1fOi8WJUt6R6vBsy7mBNrVXIyCu1/social-images/social-1781166978012-Copilot_20260611_123530.webp" },
      { name: "twitter:image", content: "https://storage.googleapis.com/gpt-engineer-file-uploads/1fOi8WJUt6R6vBsy7mBNrVXIyCu1/social-images/social-1781166978012-Copilot_20260611_123530.webp" },
      { name: "twitter:card", content: "summary_large_image" },
      { property: "og:type", content: "website" },
    ],
    links: [{ rel: "stylesheet", href: appCss }],
  }),
  shellComponent: RootShell,
  component: RootComponent,
  notFoundComponent: () => (
    <AppLayout>
      <div className="grid place-items-center py-24 text-center">
        <div>
          <h1 className="text-5xl font-black text-primary">404</h1>
          <p className="text-muted-foreground mt-2">Page not found.</p>
        </div>
      </div>
    </AppLayout>
  ),
  errorComponent: ({ error }) => (
    <AppLayout>
      <div className="rounded-xl border border-destructive/40 bg-destructive/10 p-6">
        <h2 className="font-bold text-destructive">Something went wrong</h2>
        <p className="text-sm text-muted-foreground mt-1">{error.message}</p>
      </div>
    </AppLayout>
  ),
});

function RootShell({ children }: { children: ReactNode }) {
  return (
    <html lang="en" className="dark">
      <head>
        <HeadContent />
      </head>
      <body>
        {children}
        <Scripts />
      </body>
    </html>
  );
}

function RootComponent() {
  const { queryClient } = Route.useRouteContext();
  return (
    <QueryClientProvider client={queryClient}>
      <Outlet />
    </QueryClientProvider>
  );
}
