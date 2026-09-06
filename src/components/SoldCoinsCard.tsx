import { useEffect, useState } from "react";
import { CircleDollarSign } from "lucide-react";
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
    raw.average_entry_price,
    raw.buy_price,
    raw.cost_price,
    raw.dca_avg_price,
  );
  let pnlUsd = numberValue(
    raw.pnl_usd,
    raw.profit_usdt,
    raw.profit_loss_usdt,
    raw.realized_pnl_usdt,
    raw.realised_pnl_usdt,
    raw.dca_pnl_usd,
  );
  let pnlPct = numberValue(
    raw.pnl_pct,
    raw.profit_pct,
    raw.profit_loss_pct,
    raw.realized_pnl_pct,
    raw.realised_pnl_pct,
    raw.dca_pnl_pct,
  );

  if (pnlUsd == null && entryPrice != null) {
    pnlUsd = (price - entryPrice) * qty;
  }
  if (pnlPct == null && pnlUsd != null && entryPrice != null && entryPrice > 0) {
    pnlPct = (pnlUsd / (entryPrice * qty)) * 100;
  }

  const rawId = raw.id ?? raw.orderId ?? raw.order_id;
  const identity = rawId != null && String(rawId).trim()
    ? String(rawId)
    : `${time}:${price}:${qty}:${quoteQty}`;
  const id = `${symbol}:${identity}`;

  return { id, symbol, base, price, qty, quoteQty, time, entryPrice, pnlPct, pnlUsd };
}

function tradeFingerprint(trade: SoldTrade) {
  return `${trade.symbol}:${trade.time}:${trade.price}:${trade.qty}:${trade.quoteQty}`;
}

function mergeTrades(current: SoldTrade[], incoming: SoldTrade[]) {
  const byFingerprint = new Map<string, SoldTrade>();
  for (const trade of [...current, ...incoming]) {
    byFingerprint.set(tradeFingerprint(trade), trade);
  }
  return [...byFingerprint.values()].sort((a, b) => b.time - a.time).slice(0, MAX_RECORDS);
}

function readStoredTrades(): SoldTrade[] {
  try {
    const saved = JSON.parse(localStorage.getItem(STORAGE_KEY) ?? "[]");
    if (!Array.isArray(saved)) return [];
    const normalized = saved
      .map((item) => normalizeTrade(item as Record<string, unknown>))
      .filter((item): item is SoldTrade => item !== null);
    return mergeTrades([], normalized);
  } catch {
    return [];
  }
}

function fmtPrice(value: number) {
  if (!Number.isFinite(value)) return "â€”";
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
            <svg
              viewBox="0 0 48 48"
              className="h-10 w-10 shrink-0"
              role="img"
              aria-label="Sold coins"
            >
              <defs>
                <radialGradient id="soldCoinFace" cx="31%" cy="24%" r="82%">
                  <stop offset="0%" stopColor="#E61C2B" />
                  <stop offset="42%" stopColor="#C41526" />
                  <stop offset="78%" stopColor="#8D0E1B" />
                  <stop offset="100%" stopColor="#42060D" />
                </radialGradient>
                <linearGradient id="soldCoinEdge" x1="0%" y1="0%" x2="100%" y2="100%">
                  <stop offset="0%" stopColor="#B91524" />
                  <stop offset="45%" stopColor="#24040A" />
                  <stop offset="100%" stopColor="#6C0A15" />
                </linearGradient>
                <linearGradient id="soldCoinDollar" x1="12%" y1="0%" x2="82%" y2="100%">
                  <stop offset="0%" stopColor="#fffef7" />
                  <stop offset="48%" stopColor="#f7f2e7" />
                  <stop offset="100%" stopColor="#d9d4c7" />
                </linearGradient>
                <filter id="soldCoinShadow" x="-30%" y="-30%" width="160%" height="180%">
                  <feDropShadow dx="0" dy="2.2" stdDeviation="2.1" floodColor="#000000" floodOpacity="0.72" />
                  <feDropShadow dx="0" dy="-0.2" stdDeviation="1.2" floodColor="#E61C2B" floodOpacity="0.28" />
                </filter>
                <filter id="soldCoinSymbol" x="-35%" y="-25%" width="170%" height="160%">
                  <feDropShadow dx="0" dy="1.4" stdDeviation="1.2" floodColor="#000000" floodOpacity="0.82" />
                  <feDropShadow dx="0" dy="0" stdDeviation="0.65" floodColor="#fffdf3" floodOpacity="0.52" />
                </filter>
              </defs>
              <g filter="url(#soldCoinShadow)">
                <ellipse cx="25" cy="27.4" rx="18" ry="14.8" fill="url(#soldCoinEdge)" />
                <circle cx="24" cy="22" r="18.25" fill="url(#soldCoinFace)" stroke="#E61C2B" strokeOpacity="0.7" strokeWidth="0.9" />
                <circle cx="24" cy="22" r="17.25" fill="none" stroke="#e37a82" strokeOpacity="0.28" strokeWidth="0.7" />
                <path d="M10.4 15.8c3.4-6.2 9.1-9.4 16.2-9.5" fill="none" stroke="#ff8890" strokeLinecap="round" strokeOpacity="0.62" strokeWidth="0.9" />
                <path d="M12 12.4c2.9-2.9 6.3-4.7 10.6-5.4" fill="none" stroke="#ffc0c4" strokeLinecap="round" strokeOpacity="0.24" strokeWidth="0.7" />
                <path d="M11.2 31.9c4.9 4.4 11.8 6.1 18.8 4.4" fill="none" stroke="#21080f" strokeLinecap="round" strokeOpacity="0.68" strokeWidth="1.1" />
                <text x="24" y="34.4" textAnchor="middle" fontFamily="Arial Black, Arial, sans-serif" fontSize="31" fontWeight="900" fill="url(#soldCoinDollar)" stroke="#351018" strokeOpacity="0.9" strokeWidth="1.15" paintOrder="stroke" filter="url(#soldCoinSymbol)">
                  $
                </text>
              </g>
            </svg>
            <div>
              <div
                style={{
                  fontFamily: "Inter, ui-sans-serif, system-ui, sans-serif",
                  fontSize: "13.2px",
                  fontWeight: 900,
                  letterSpacing: "0.12em",
                  textTransform: "uppercase",
                    background: "#EE1120",
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
                  <div className="flex items-center gap-3">
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
                            <span>{date}</span>
                            <span className="block">{time}</span>
                        </div>
                      </div>
                    </div>

                    <div className="grid grid-cols-2 gap-2 sm:flex sm:items-center sm:gap-3">
                      <InlineMetric label="Sell Price" value={`$${fmtPrice(trade.price)}`} />
                      <InlineMetric label="Sold Value" value={`${trade.quoteQty.toFixed(2)} USDT`} tone="primary" />
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
    <div className="shrink-0 bg-transparent">
      <div className="text-[8px] uppercase tracking-widest font-bold text-muted-foreground">{label}</div>
      <div className={`mt-1 text-[10px] font-black tabular-nums truncate ${tone === "primary" ? "text-primary" : ""}`}>{value}</div>
    </div>
  );
}
