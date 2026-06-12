import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { History, Search } from "lucide-react";
import { CoinIcon } from "./CoinIcon";
import { getMyTrades } from "../lib/binance";

function fmtPrice(p: number) {
  if (!isFinite(p)) return "—";
  if (p >= 1000) return p.toLocaleString(undefined, { maximumFractionDigits: 2, minimumFractionDigits: 2 });
  if (p >= 1) return p.toFixed(4);
  if (p >= 0.01) return p.toFixed(5);
  return p.toFixed(6);
}

function fmtTime(ms: number) {
  const d = new Date(ms);
  const date = d.toLocaleDateString("en-GB", { day: "2-digit", month: "2-digit", year: "numeric" });
  const time = d.toLocaleTimeString("en-US", { hour: "2-digit", minute: "2-digit", hour12: true }).toLowerCase();
  return { date, time };
}

interface Props {
  defaultSymbol?: string;
}

export default function TradeHistoryCard({ defaultSymbol }: Props) {
  const [symbol, setSymbol] = useState(defaultSymbol ?? "");
  const [input, setInput] = useState("");

  const { data: trades, isLoading, isError } = useQuery({
    queryKey: ["tradeHistory", symbol],
    queryFn: () => getMyTrades({ data: { symbol: symbol.toUpperCase(), limit: 200 } }),
    enabled: symbol.length > 0,
    refetchInterval: 60_000,
  });

  const sorted = trades ? [...trades].sort((a, b) => b.time - a.time) : [];
  const base = symbol.replace(/USDT$|BUSD$|FDUSD$|BTC$|ETH$/i, "");

  function submit(e: React.FormEvent) {
    e.preventDefault();
    let q = input.trim().toUpperCase().replace(/[^A-Z0-9]/g, "");
    if (!q) return;
    if (!/USDT$|BUSD$|FDUSD$|BTC$|ETH$/.test(q)) q += "USDT";
    setSymbol(q);
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
            {symbol && (
              <div className="flex items-center gap-1.5 mt-0.5">
                <CoinIcon symbol={base} size={12} />
                <span className="text-[10px] text-muted-foreground font-bold">{symbol}</span>
              </div>
            )}
          </div>
        </div>
        <form onSubmit={submit} className="flex items-center gap-1.5 bg-muted/40 rounded-xl px-2.5 py-1.5 border border-border focus-within:border-primary/40 transition-colors">
          <Search className="h-3.5 w-3.5 text-muted-foreground shrink-0" />
          <input
            value={input}
            onChange={(e) => setInput(e.target.value)}
            placeholder="e.g. SOL, ETHUSDT…"
            className="bg-transparent text-xs outline-none w-28 sm:w-36 placeholder:text-muted-foreground/50"
          />
          <button type="submit" className="text-[10px] font-bold px-2 py-0.5 rounded-lg bg-primary/20 text-primary hover:bg-primary/30 transition-colors shrink-0">GO</button>
        </form>
      </div>

      {/* ── EMPTY STATE ── */}
      {!symbol && (
        <div className="flex flex-col items-center justify-center py-8 gap-2">
          <div className="flex items-center justify-center h-10 w-10 rounded-xl bg-gradient-to-br from-primary/20 to-primary/5 border border-primary/20">
            <History className="h-5 w-5 text-primary/60" />
          </div>
          <span className="text-xs text-muted-foreground text-center">
            Search a symbol above<br />to view your trade history
          </span>
        </div>
      )}

      {/* ── LOADING ── */}
      {symbol && isLoading && (
        <div className="flex flex-col gap-2">
          {Array.from({ length: 5 }).map((_, i) => (
            <div key={i} className="h-14 rounded-xl bg-muted/30 animate-pulse" />
          ))}
        </div>
      )}

      {/* ── ERROR ── */}
      {isError && (
        <div className="text-center py-6 text-xs text-red-400 font-bold">
          Failed to load trades. Check your API keys.
        </div>
      )}

      {/* ── TRADE LIST ── */}
      {sorted.length > 0 && (
        <>
          <div
            className="flex flex-col gap-2 overflow-y-auto pr-1"
            style={{
              maxHeight: "22rem",
              scrollbarWidth: "thin",
              scrollbarColor: "color-mix(in oklab, var(--primary) 35%, transparent) transparent",
            }}
          >
            <style>{`
              .trade-scroll::-webkit-scrollbar { width: 3px; }
              .trade-scroll::-webkit-scrollbar-track { background: transparent; border-radius: 9999px; }
              .trade-scroll::-webkit-scrollbar-thumb { background: color-mix(in oklab, var(--primary) 35%, transparent); border-radius: 9999px; }
              .trade-scroll::-webkit-scrollbar-thumb:hover { background: color-mix(in oklab, var(--primary) 65%, transparent); }
            `}</style>
            <div className="trade-scroll flex flex-col gap-2 overflow-y-auto pr-1" style={{ maxHeight: "22rem" }}>
              {sorted.map((t) => {
                const { date, time } = fmtTime(t.time);
                const total = parseFloat(t.quoteQty);
                const price = parseFloat(t.price);
                const qty = parseFloat(t.qty);
                const tradingBase = t.symbol.replace(/USDT$|BUSD$|FDUSD$|BTC$|ETH$/, "");
                return (
                  <div key={t.id} className="flex items-center justify-between gap-3 rounded-xl border border-border bg-muted/20 px-3 py-2.5 hover:border-primary/20 transition-colors">
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
          </div>
          <div className="text-[9px] uppercase tracking-widest text-muted-foreground/50 text-center">
            {sorted.length} trade{sorted.length !== 1 ? "s" : ""} · most recent first
          </div>
        </>
      )}

      {/* ── NO TRADES ── */}
      {symbol && !isLoading && !isError && sorted.length === 0 && (
        <div className="text-center py-6 text-xs text-muted-foreground">
          No trades found for <span className="font-bold text-foreground">{symbol}</span>
        </div>
      )}
    </section>
  );
}
