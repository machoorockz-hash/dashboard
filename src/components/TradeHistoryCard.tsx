import { useState, useMemo } from "react";
import { useQuery } from "@tanstack/react-query";
import { History, Search, TrendingUp, TrendingDown, ChevronDown, ChevronUp } from "lucide-react";
import { CoinIcon } from "./CoinIcon";
import { getMyTrades } from "../lib/binance";

const API_BASE = import.meta.env.VITE_API_BASE ?? "";

type Trade = {
  symbol: string; id: number; orderId: number; price: string; qty: string;
  quoteQty: string; commission: string; commissionAsset: string;
  time: number; isBuyer: boolean; isMaker: boolean;
};

async function getAllTrades(): Promise<Trade[]> {
  const res = await fetch(`${API_BASE}/api/binance/allTrades`);
  if (!res.ok) throw new Error(`allTrades ${res.status}`);
  return res.json();
}

// Realized P&L per symbol:
// net = sum(sell quoteQty) - sum(buy quoteQty)
// Positive = profited overall, Negative = still in loss
function calcPnlBySymbol(trades: Trade[]): Array<{
  symbol: string;
  base: string;
  buys: number;
  sells: number;
  net: number;
  tradeCount: number;
}> {
  const map = new Map<string, { buys: number; sells: number; tradeCount: number }>();
  for (const t of trades) {
    const entry = map.get(t.symbol) ?? { buys: 0, sells: 0, tradeCount: 0 };
    const q = parseFloat(t.quoteQty);
    if (t.isBuyer) entry.buys += q;
    else entry.sells += q;
    entry.tradeCount += 1;
    map.set(t.symbol, entry);
  }
  return Array.from(map.entries())
    .map(([symbol, { buys, sells, tradeCount }]) => ({
      symbol,
      base: symbol.replace(/USDT$|BUSD$|FDUSD$|BTC$|ETH$/, ""),
      buys,
      sells,
      net: sells - buys,
      tradeCount,
    }))
    .sort((a, b) => b.net - a.net);
}

function fmtPrice(p: number) {
  if (!isFinite(p)) return "—";
  if (p >= 1000) return p.toLocaleString(undefined, { maximumFractionDigits: 2, minimumFractionDigits: 2 });
  if (p >= 1) return p.toFixed(4);
  if (p >= 0.01) return p.toFixed(5);
  return p.toFixed(6);
}

function fmtUsd(n: number) {
  return n.toLocaleString(undefined, { maximumFractionDigits: 2, minimumFractionDigits: 2 });
}

function fmtTime(ms: number) {
  const d = new Date(ms);
  const date = d.toLocaleDateString("en-GB", { day: "2-digit", month: "2-digit", year: "numeric" });
  const time = d.toLocaleTimeString("en-US", { hour: "2-digit", minute: "2-digit", hour12: true }).toLowerCase();
  return { date, time };
}

export default function TradeHistoryCard({ defaultSymbol }: { defaultSymbol?: string }) {
  const [filterSymbol, setFilterSymbol] = useState("");
  const [input, setInput] = useState("");
  const [showPnl, setShowPnl] = useState(true);

  // Auto-load ALL trades
  const { data: allTrades, isLoading, isError } = useQuery({
    queryKey: ["allTrades"],
    queryFn: getAllTrades,
    refetchInterval: 60_000,
  });

  // Per-symbol drill-down
  const { data: symbolTrades, isLoading: isLoadingSymbol } = useQuery({
    queryKey: ["tradeHistory", filterSymbol],
    queryFn: () => getMyTrades({ data: { symbol: filterSymbol.toUpperCase(), limit: 500 } }),
    enabled: filterSymbol.length > 0,
    refetchInterval: 60_000,
  });

  const trades = filterSymbol ? symbolTrades : allTrades;
  const loading = filterSymbol ? isLoadingSymbol : isLoading;
  const sorted = trades ? [...trades].sort((a, b) => b.time - a.time) : [];

  const pnlRows = useMemo(() => calcPnlBySymbol(allTrades ?? []), [allTrades]);
  const totalNet = pnlRows.reduce((s, r) => s + r.net, 0);
  const totalBuys = pnlRows.reduce((s, r) => s + r.buys, 0);
  const totalSells = pnlRows.reduce((s, r) => s + r.sells, 0);

  function submit(e: React.FormEvent) {
    e.preventDefault();
    if (!input.trim() && filterSymbol) { setFilterSymbol(""); return; }
    let q = input.trim().toUpperCase().replace(/[^A-Z0-9]/g, "");
    if (!q) return;
    if (!/USDT$|BUSD$|FDUSD$|BTC$|ETH$/.test(q)) q += "USDT";
    setFilterSymbol(q);
    setInput("");
  }

  return (
    <section className="rounded-2xl border border-border bg-card p-5 flex flex-col gap-4">

      {/* ── HEADER ── */}
      <div className="flex items-center justify-between gap-3 flex-wrap">
        <div className="flex items-center gap-2.5">
          <div className="relative flex items-center justify-center h-8 w-8 rounded-xl border border-primary/30 bg-gradient-to-br from-primary/25 via-primary/10 to-transparent">
            <div className="absolute inset-0 rounded-xl bg-[radial-gradient(circle_at_top_left,color-mix(in_oklab,var(--primary)_30%,transparent),transparent_70%)]" />
            <History className="relative h-4 w-4 text-primary" strokeWidth={2.5} />
          </div>
          <div>
            <div className="font-black text-sm tracking-wide uppercase">Trade History</div>
            <div className="text-[10px] text-muted-foreground mt-0.5">
              {filterSymbol ? `Filtered: ${filterSymbol}` : `All symbols · ${sorted.length} trades`}
            </div>
          </div>
        </div>
        <form onSubmit={submit} className="flex items-center gap-1.5 bg-muted/40 rounded-xl px-2.5 py-1.5 border border-border focus-within:border-primary/40 transition-colors">
          <Search className="h-3.5 w-3.5 text-muted-foreground shrink-0" />
          <input
            value={input}
            onChange={(e) => setInput(e.target.value)}
            placeholder="Filter by symbol…"
            className="bg-transparent text-xs outline-none w-28 sm:w-36 placeholder:text-muted-foreground/50"
          />
          <button type="submit" className="text-[10px] font-bold px-2 py-0.5 rounded-lg bg-primary/20 text-primary hover:bg-primary/30 transition-colors shrink-0">
            {filterSymbol ? "CLEAR" : "GO"}
          </button>
          {filterSymbol && (
            <button type="button" onClick={() => { setFilterSymbol(""); setInput(""); }}
              className="text-[10px] font-bold px-2 py-0.5 rounded-lg bg-muted/60 text-muted-foreground hover:text-foreground transition-colors shrink-0">
              ✕
            </button>
          )}
        </form>
      </div>

      {/* ── P&L SUMMARY SECTION ── */}
      {!isLoading && !isError && pnlRows.length > 0 && (
        <div className="rounded-xl border border-border bg-muted/10 overflow-hidden">
          {/* Collapsible header */}
          <button
            onClick={() => setShowPnl((v) => !v)}
            className="w-full flex items-center justify-between px-4 py-3 hover:bg-muted/20 transition-colors"
          >
            <div className="flex items-center gap-2.5">
              {totalNet >= 0
                ? <TrendingUp className="h-4 w-4 text-emerald-400" />
                : <TrendingDown className="h-4 w-4 text-red-400" />
              }
              <span className="text-xs font-black uppercase tracking-widest">Realized P&amp;L Summary</span>
            </div>
            <div className="flex items-center gap-3">
              <div className="text-right">
                <div className={`text-sm font-black tabular-nums ${totalNet >= 0 ? "text-emerald-400" : "text-red-400"}`}>
                  {totalNet >= 0 ? "+" : ""}${fmtUsd(totalNet)}
                </div>
                <div className="text-[9px] text-muted-foreground">
                  {totalNet >= 0 ? "net profit" : "net loss"} · {pnlRows.length} symbol{pnlRows.length !== 1 ? "s" : ""}
                </div>
              </div>
              {showPnl ? <ChevronUp className="h-4 w-4 text-muted-foreground" /> : <ChevronDown className="h-4 w-4 text-muted-foreground" />}
            </div>
          </button>

          {showPnl && (
            <>
              {/* Overall totals bar */}
              <div className="grid grid-cols-3 gap-px bg-border mx-4 mb-3 rounded-lg overflow-hidden">
                <div className="bg-card px-3 py-2 text-center">
                  <div className="text-[9px] uppercase tracking-widest text-muted-foreground font-bold">Total Bought</div>
                  <div className="text-xs font-black text-red-400 tabular-nums mt-0.5">${fmtUsd(totalBuys)}</div>
                </div>
                <div className="bg-card px-3 py-2 text-center">
                  <div className="text-[9px] uppercase tracking-widest text-muted-foreground font-bold">Total Sold</div>
                  <div className="text-xs font-black text-emerald-400 tabular-nums mt-0.5">${fmtUsd(totalSells)}</div>
                </div>
                <div className="bg-card px-3 py-2 text-center">
                  <div className="text-[9px] uppercase tracking-widest text-muted-foreground font-bold">Net P&amp;L</div>
                  <div className={`text-xs font-black tabular-nums mt-0.5 ${totalNet >= 0 ? "text-emerald-400" : "text-red-400"}`}>
                    {totalNet >= 0 ? "+" : ""}${fmtUsd(totalNet)}
                  </div>
                </div>
              </div>

              {/* Per-symbol rows */}
              <div
                className="flex flex-col gap-1.5 px-4 pb-3 overflow-y-auto"
                style={{
                  maxHeight: "14rem",
                  scrollbarWidth: "thin",
                  scrollbarColor: "color-mix(in oklab, var(--primary) 35%, transparent) transparent",
                }}
              >
                {pnlRows.map((row) => {
                  const pct = row.buys > 0 ? (row.net / row.buys) * 100 : 0;
                  const barWidth = Math.min(100, Math.abs(pct) * 2);
                  return (
                    <div
                      key={row.symbol}
                      className="flex items-center gap-3 rounded-lg border border-border bg-card px-3 py-2 hover:border-primary/20 transition-colors cursor-pointer"
                      onClick={() => setFilterSymbol(row.symbol)}
                      title={`Click to filter trades for ${row.symbol}`}
                    >
                      <CoinIcon symbol={row.base} size={24} />
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center justify-between gap-2 mb-1">
                          <span className="text-xs font-black">{row.base}</span>
                          <span className={`text-xs font-black tabular-nums ${row.net >= 0 ? "text-emerald-400" : "text-red-400"}`}>
                            {row.net >= 0 ? "+" : ""}${fmtUsd(row.net)}
                          </span>
                        </div>
                        {/* Progress bar */}
                        <div className="h-1 rounded-full bg-muted/40 overflow-hidden">
                          <div
                            className={`h-full rounded-full transition-all ${row.net >= 0 ? "bg-emerald-500" : "bg-red-500"}`}
                            style={{ width: `${barWidth}%` }}
                          />
                        </div>
                        <div className="flex justify-between mt-1">
                          <span className="text-[9px] text-muted-foreground">{row.tradeCount} trade{row.tradeCount !== 1 ? "s" : ""}</span>
                          <span className={`text-[9px] font-bold ${row.net >= 0 ? "text-emerald-400/70" : "text-red-400/70"}`}>
                            {pct >= 0 ? "+" : ""}{pct.toFixed(1)}%
                          </span>
                        </div>
                      </div>
                    </div>
                  );
                })}
              </div>
              <div className="px-4 pb-3 text-[9px] text-muted-foreground/40 text-center">
                P&amp;L = total sold − total bought · click a symbol to filter trades below
              </div>
            </>
          )}
        </div>
      )}

      {/* ── LOADING ── */}
      {loading && (
        <div className="flex flex-col gap-2">
          {Array.from({ length: 5 }).map((_, i) => (
            <div key={i} className="h-14 rounded-xl bg-muted/30 animate-pulse" />
          ))}
        </div>
      )}

      {/* ── ERROR ── */}
      {isError && !filterSymbol && (
        <div className="text-center py-6 text-xs text-red-400 font-bold">
          Failed to load trades. Check your Binance API keys.
        </div>
      )}

      {/* ── TRADE LIST ── */}
      {sorted.length > 0 && (
        <>
          <div
            className="flex flex-col gap-2 overflow-y-auto pr-1"
            style={{
              maxHeight: "26rem",
              scrollbarWidth: "thin",
              scrollbarColor: "color-mix(in oklab, var(--primary) 35%, transparent) transparent",
            }}
          >
            {sorted.map((t) => {
              const { date, time } = fmtTime(t.time);
              const total = parseFloat(t.quoteQty);
              const price = parseFloat(t.price);
              const qty = parseFloat(t.qty);
              const tradingBase = t.symbol.replace(/USDT$|BUSD$|FDUSD$|BTC$|ETH$/, "");
              return (
                <div
                  key={`${t.symbol}-${t.id}`}
                  className="flex items-center justify-between gap-3 rounded-xl border border-border bg-muted/20 px-3 py-2.5 hover:border-primary/20 transition-colors"
                >
                  <div className="flex items-center gap-2.5 min-w-0">
                    <CoinIcon symbol={tradingBase} size={28} />
                    <div className="min-w-0">
                      <div className="flex items-center gap-1.5 flex-wrap">
                        <span className="font-black text-sm truncate">{tradingBase}</span>
                        <span className="text-muted-foreground font-normal text-xs">/USDT</span>
                        <span className={`text-[9px] font-black px-1.5 py-0.5 rounded-md uppercase tracking-wider ${t.isBuyer ? "bg-emerald-500/15 text-emerald-400 border border-emerald-500/20" : "bg-red-500/15 text-red-400 border border-red-500/20"}`}>
                          {t.isBuyer ? "BUY" : "SELL"}
                        </span>
                        {t.isMaker && (
                          <span className="text-[9px] font-bold px-1.5 py-0.5 rounded-md bg-muted/60 text-muted-foreground border border-border uppercase tracking-wider">
                            Maker
                          </span>
                        )}
                      </div>
                      <div className="text-[10px] text-muted-foreground tabular-nums mt-0.5">
                        {date} · {time}
                      </div>
                    </div>
                  </div>
                  <div className="text-right shrink-0">
                    <div className="font-black text-xs tabular-nums">${fmtPrice(price)}</div>
                    <div className="text-[10px] text-muted-foreground tabular-nums">
                      {qty.toFixed(4)} · ${total.toFixed(2)}
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
          <div className="text-[9px] uppercase tracking-widest text-muted-foreground/50 text-center">
            {sorted.length} trade{sorted.length !== 1 ? "s" : ""} · most recent first
          </div>
        </>
      )}

      {/* ── NO TRADES ── */}
      {!loading && !isError && sorted.length === 0 && (
        <div className="text-center py-6 text-xs text-muted-foreground">
          No trades found{filterSymbol ? ` for ${filterSymbol}` : " in your account"}
        </div>
      )}
    </section>
  );
}
