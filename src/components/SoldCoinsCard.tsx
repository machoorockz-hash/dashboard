import { useEffect, useState } from "react";
import { CircleDollarSign, History, TrendingDown, TrendingUp } from "lucide-react";
import { CoinIcon } from "./CoinIcon";
import { coinName } from "../lib/coinMeta";

const API_BASE = import.meta.env.VITE_API_BASE ?? "";
const STORAGE_KEY = "binance-dashboard:sold-coins:v1";
const POLL_MS = 5_000;
const MAX_RECORDS = 100;

type SoldTrade = {
  id: string;
  symbol: string;
  base: string;
  price: number;
  qty: number;
  quoteQty: number;
  time: number;
  entryPrice: number | null;
  pnlPct: number | null;
  pnlUsd: number | null;
};

function numberValue(...values: unknown[]): number | null {
  for (const value of values) {
    if (value === null || value === undefined || value === "") continue;
    const number = typeof value === "number" ? value : Number(value);
    if (Number.isFinite(number)) return number;
  }
  return null;
}

function baseFromSymbol(symbol: string) {
  return symbol.replace(/USDT$|BUSD$|FDUSD$|USDC$|BTC$|ETH$|BNB$/, "");
}

function normalizeTrade(raw: Record<string, unknown>): SoldTrade | null {
  const symbol = String(raw.symbol ?? raw.pair ?? "").toUpperCase();
  const base = String(raw.base ?? baseFromSymbol(symbol)).toUpperCase();
  const price = numberValue(raw.price, raw.sell_price) ?? 0;
  const qty = numberValue(raw.qty, raw.quantity, raw.sold_qty) ?? 0;
  const quoteQty = numberValue(raw.quoteQty, raw.quote_qty, raw.sell_value, raw.usdt_value) ?? price * qty;
  const time = numberValue(raw.time, raw.sold_at, raw.closed_at, raw.timestamp) ?? 0;

  if (!symbol || !base || !time || price <= 0 || qty <= 0) return null;

  const entryPrice = numberValue(
    raw.entry_price,
    raw.avg_price,
    raw.average_entry,
    raw.buy_price,
    raw.cost_price,
  );
  let pnlUsd = numberValue(raw.pnl_usd, raw.profit_usdt, raw.profit_loss_usdt);
  let pnlPct = numberValue(raw.pnl_pct, raw.profit_pct, raw.profit_loss_pct);

  if (pnlUsd == null && entryPrice != null) {
    pnlUsd = (price - entryPrice) * qty;
  }
  if (pnlPct == null && pnlUsd != null && entryPrice != null && entryPrice > 0) {
    pnlPct = (pnlUsd / (entryPrice * qty)) * 100;
  }

  const orderId = String(raw.orderId ?? raw.order_id ?? "");
  const id = `${symbol}:${String(raw.id ?? orderId ?? `${time}:${price}:${qty}`)}`;

  return { id, symbol, base, price, qty, quoteQty, time, entryPrice, pnlPct, pnlUsd };
}

function mergeTrades(current: SoldTrade[], incoming: SoldTrade[]) {
  const byId = new Map<string, SoldTrade>();
  for (const trade of [...current, ...incoming]) byId.set(trade.id, trade);
  return [...byId.values()].sort((a, b) => b.time - a.time).slice(0, MAX_RECORDS);
}

function readStoredTrades(): SoldTrade[] {
  try {
    const saved = JSON.parse(localStorage.getItem(STORAGE_KEY) ?? "[]");
    if (!Array.isArray(saved)) return [];
    return saved
      .map((item) => normalizeTrade(item as Record<string, unknown>))
      .filter((item): item is SoldTrade => item !== null);
  } catch {
    return [];
  }
}

function fmtPrice(value: number) {
  if (!Number.isFinite(value)) return "—";
  if (value >= 1000) return value.toLocaleString(undefined, { maximumFractionDigits: 2, minimumFractionDigits: 2 });
  if (value >= 1) return value.toFixed(4);
  if (value >= 0.01) return value.toFixed(5);
  return value.toFixed(8);
}

function fmtTime(timestamp: number) {
  const date = new Date(timestamp);
  return {
    date: date.toLocaleDateString("en-GB", {
      timeZone: "Asia/Dubai",
      day: "2-digit",
      month: "2-digit",
      year: "numeric",
    }),
    time: date.toLocaleTimeString("en-US", {
      timeZone: "Asia/Dubai",
      hour: "2-digit",
      minute: "2-digit",
      hour12: true,
    }).toLowerCase(),
  };
}

export default function SoldCoinsCard() {
  const [trades, setTrades] = useState<SoldTrade[]>(readStoredTrades);
  const [isLoading, setIsLoading] = useState(true);

  useEffect(() => {
    let alive = true;
    let timer: ReturnType<typeof setTimeout>;

    async function poll() {
      try {
        const [historyResponse, snapshotResponse] = await Promise.all([
          fetch(`${API_BASE}/api/bot/sold-trades?key=dca`),
          fetch(`${API_BASE}/api/bot/data?key=dca`),
        ]);

        const incoming: SoldTrade[] = [];
        if (historyResponse.ok) {
          const history = await historyResponse.json();
          if (Array.isArray(history?.trades)) {
            for (const item of history.trades) {
              const trade = normalizeTrade(item as Record<string, unknown>);
              if (trade) incoming.push(trade);
            }
          }
        }

        // Also read the latest snapshot so a sale is visible immediately,
        // even before the history endpoint is next polled.
        if (snapshotResponse.ok) {
          const snapshot = await snapshotResponse.json();
          const latest = snapshot?.data?.last_closed_trade;
          if (latest && typeof latest === "object") {
            const trade = normalizeTrade(latest as Record<string, unknown>);
            if (trade) incoming.push(trade);
          }
        }

        if (alive) {
          setTrades((current) => {
            const next = mergeTrades(current, incoming);
            try {
              localStorage.setItem(STORAGE_KEY, JSON.stringify(next));
            } catch {}
            return next;
          });
          setIsLoading(false);
        }
      } catch {
        if (alive) setIsLoading(false);
      } finally {
        if (alive) timer = setTimeout(poll, POLL_MS);
      }
    }

    poll();
    return () => {
      alive = false;
      clearTimeout(timer);
    };
  }, []);

  return (
    <section
      className="rounded-2xl relative overflow-hidden"
      style={{
        background: "transparent",
        border: "1px solid color-mix(in oklab, var(--primary) 24%, transparent)",
        backdropFilter: "blur(8px) saturate(150%)",
        WebkitBackdropFilter: "blur(8px) saturate(150%)",
        boxShadow: "0 0 45px -25px color-mix(in oklab, var(--primary) 55%, transparent)",
      }}
    >
      <div className="pointer-events-none absolute inset-x-0 top-0 h-px bg-gradient-to-r from-transparent via-primary/70 to-transparent" />

      <div className="relative p-5 md:p-6">
        <div className="flex items-center justify-between gap-3 mb-4">
          <div className="flex items-center gap-2.5">
            <div className="relative flex items-center justify-center h-8 w-8 rounded-xl border border-primary/30 bg-gradient-to-br from-primary/25 via-primary/10 to-transparent">
              <div className="absolute inset-0 rounded-xl bg-[radial-gradient(circle_at_top_left,color-mix(in_oklab,var(--primary)_30%,transparent),transparent_70%)]" />
              <History className="relative h-4 w-4 text-primary" strokeWidth={2.5} />
            </div>
            <div>
              <div
                style={{
                  fontFamily: "Inter, ui-sans-serif, system-ui, sans-serif",
                  fontSize: "13.2px",
                  fontWeight: 900,
                  letterSpacing: "0.12em",
                  textTransform: "uppercase",
                  background: "linear-gradient(90deg, rgba(255,255,255,0.92), rgba(255,255,255,0.5))",
                  WebkitBackgroundClip: "text",
                  WebkitTextFillColor: "transparent",
                }}
              >
                Sold Coins
              </div>
              <div className="text-[10px] text-muted-foreground mt-0.5">
                {trades.length ? `${trades.length} recorded sale${trades.length === 1 ? "" : "s"}` : "Realised trade ledger"}
              </div>
            </div>
          </div>
        </div>

        {isLoading && trades.length === 0 && (
          <div className="flex flex-col gap-2">
            {Array.from({ length: 2 }).map((_, index) => (
              <div key={index} className="h-[76px] rounded-xl bg-muted/20 animate-pulse" />
            ))}
          </div>
        )}

        {!isLoading && trades.length === 0 && (
          <div className="rounded-xl border border-border/60 bg-transparent py-8 text-center">
            <CircleDollarSign className="h-8 w-8 mx-auto text-muted-foreground/35" />
            <div className="mt-2 text-sm font-bold text-muted-foreground">No sold coins yet</div>
            <div className="mt-1 text-[10px] text-muted-foreground/60">Completed sales will appear here one by one.</div>
          </div>
        )}

        {trades.length > 0 && (
          <div
            className="flex flex-col gap-2 overflow-y-auto pr-1"
            style={{
              maxHeight: "29rem",
              scrollbarWidth: "thin",
              scrollbarColor: "color-mix(in oklab, var(--primary) 35%, transparent) transparent",
            }}
          >
            {trades.map((trade) => {
              const { date, time } = fmtTime(trade.time);
              const hasPnl = trade.pnlUsd != null || trade.pnlPct != null;
              const profitable = (trade.pnlUsd ?? trade.pnlPct ?? 0) >= 0;

              return (
                <div
                  key={trade.id}
                  className={`rounded-xl border bg-transparent px-3 py-3 transition-colors ${
                    profitable ? "border-bull/20 hover:border-bull/40" : "border-bear/20 hover:border-bear/40"
                  }`}
                >
                  <div className="flex flex-col gap-3 sm:flex-row sm:items-center">
                    <div className="flex flex-1 items-center gap-3 min-w-0">
                      <div className={`shrink-0 rounded-full p-[2px] ${profitable ? "bg-bull/20" : "bg-bear/20"}`}>
                        <CoinIcon symbol={trade.base} size={34} />
                      </div>
                      <div className="min-w-0">
                        <div className="flex items-center gap-1.5 min-w-0">
                           <span className={`font-black text-sm truncate ${hasPnl ? (profitable ? "text-bull" : "text-bear") : ""}`}>
                             {coinName(trade.base)}
                           </span>
                        </div>
                        <div className="text-[10px] text-muted-foreground tabular-nums mt-0.5">
                          Sold {date} · {time}
                        </div>
                      </div>
                    </div>

                    <div className="grid grid-cols-2 gap-2 sm:flex sm:items-center sm:gap-3">
                      <InlineMetric label="Sell price" value={`$${fmtPrice(trade.price)}`} />
                      <InlineMetric label="Sold value" value={`${trade.quoteQty.toFixed(2)} USDT`} tone="primary" />
                      <MiniMetric
                        label="Profit / loss USDT"
                        value={hasPnl && trade.pnlUsd != null ? `${trade.pnlUsd >= 0 ? "+" : ""}${trade.pnlUsd.toFixed(2)} USDT` : "—"}
                        tone={hasPnl ? (profitable ? "bull" : "bear") : undefined}
                      />
                      <MiniMetric
                        label="Profit / loss %"
                        value={hasPnl && trade.pnlPct != null ? `${trade.pnlPct >= 0 ? "+" : ""}${trade.pnlPct.toFixed(2)}%` : "—"}
                        tone={hasPnl ? (profitable ? "bull" : "bear") : undefined}
                        icon={hasPnl ? (profitable ? <TrendingUp className="h-3 w-3" /> : <TrendingDown className="h-3 w-3" />) : undefined}
                      />
                    </div>
                </div>
                </div>
              );
            })}
          </div>
        )}
      </div>
    </section>
  );
}

function MiniMetric({
  label,
  value,
  tone,
  icon,
}: {
  label: string;
  value: string;
  tone?: "bull" | "bear";
  icon?: React.ReactNode;
}) {
  return (
    <div className={`min-w-[124px] rounded-lg border px-2.5 py-2 bg-transparent ${tone === "bull" ? "border-bull/20" : tone === "bear" ? "border-bear/20" : "border-border/60"}`}>
      <div className="flex items-center gap-1 text-[8px] uppercase tracking-widest font-bold text-muted-foreground">
        {icon}
        {label}
      </div>
      <div className={`mt-1 text-[10px] font-black tabular-nums truncate ${tone === "bull" ? "text-bull" : tone === "bear" ? "text-bear" : ""}`}>
        {value}
      </div>
    </div>
  );
}

function InlineMetric({
  label,
  value,
  tone,
}: {
  label: string;
  value: string;
  tone?: "primary";
}) {
  return (
    <div className={`min-w-[112px] shrink-0 rounded-lg border px-2.5 py-2 bg-transparent ${tone === "primary" ? "border-primary/20" : "border-border/60"}`}>
      <div className="text-[8px] uppercase tracking-widest font-bold text-muted-foreground">{label}</div>
      <div className={`mt-1 text-[10px] font-black tabular-nums truncate ${tone === "primary" ? "text-primary" : ""}`}>{value}</div>
    </div>
  );
}
