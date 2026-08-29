import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { History, Search } from "lucide-react";
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

function fmtPrice(p: number) {
  if (!isFinite(p)) return "—";
  if (p >= 1000) return p.toLocaleString(undefined, { maximumFractionDigits: 2, minimumFractionDigits: 2 });
  if (p >= 1)    return p.toFixed(4);
  if (p >= 0.01) return p.toFixed(5);
  return p.toFixed(6);
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

  const { data: allTrades, isLoading, isError } = useQuery({
    queryKey: ["allTrades"],
    queryFn: getAllTrades,
    refetchInterval: 300_000,
    retry: false,
    refetchOnWindowFocus: false,
    refetchOnReconnect: false,
  });

  const { data: symbolTrades, isLoading: isLoadingSymbol } = useQuery({
    queryKey: ["tradeHistory", filterSymbol],
    queryFn: () => getMyTrades({ data: { symbol: filterSymbol.toUpperCase(), limit: 500 } }),
    enabled: filterSymbol.length > 0,
    refetchInterval: 300_000,
    retry: false,
    refetchOnWindowFocus: false,
    refetchOnReconnect: false,
  });

  const trades    = filterSymbol ? symbolTrades : allTrades;
  const loading   = filterSymbol ? isLoadingSymbol : isLoading;
  const sorted    = trades ? [...trades].sort((a, b) => b.time - a.time) : [];

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

      {/* ── LOADING ── */}
      {loading && (
        <div className="flex flex-col gap-2">
          {Array.from({ length: 5 }).map((_, i) => (
            <div key={i} className="h-16 rounded-xl bg-muted/30 animate-pulse" />
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
              const qty   = parseFloat(t.qty);

              // Strip the quote asset to get the base coin (e.g. SOLUSDT → SOL)
              const tradingBase = t.symbol
                .replace(/USDT$|BUSD$|FDUSD$|USDC$|BTC$|ETH$|BNB$/, "");

              const isBuy = t.isBuyer;

              return (
                <div
                  key={`${t.symbol}-${t.id}`}
                  className={`flex items-center justify-between gap-3 rounded-xl border bg-muted/20 px-3 py-2.5 transition-colors ${
                    isBuy
                      ? "border-bull/20 hover:border-bull/40"
                      : "border-bear/20 hover:border-bear/40"
                  }`}
                >
                  {/* ── LEFT: coin + meta ── */}
                  <div className="flex items-center gap-3 min-w-0">
                    {/* Coin logo with coloured ring matching buy/sell */}
                    <div className={`shrink-0 rounded-full p-[2px] ${isBuy ? "bg-bull/20" : "bg-bear/20"}`}>
                      <CoinIcon symbol={tradingBase} size={32} />
                    </div>

                    <div className="min-w-0">
                      <div className="flex items-center gap-1.5 flex-wrap">
                        <span className="font-black text-sm truncate">{tradingBase}</span>
                        <span className="text-muted-foreground font-normal text-xs">/USDT</span>

                        {/* BUY / SELL badge */}
                        <span className={`text-[9px] font-black px-1.5 py-0.5 rounded-md uppercase tracking-wider ${
                          isBuy
                            ? "bg-bull/15 text-bull border border-bull/25"
                            : "bg-bear/15 text-bear border border-bear/25"
                        }`}>
                          {isBuy ? "BUY" : "SELL"}
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

                  {/* ── RIGHT: price + qty ── */}
                  <div className="text-right shrink-0">
                    {/* Price in green for BUY, red for SELL */}
                    <div className={`font-black text-sm tabular-nums ${isBuy ? "text-bull" : "text-bear"}`}>
                      ${fmtPrice(price)}
                    </div>
                    <div className="text-[10px] text-muted-foreground tabular-nums mt-0.5">
                      <span>{qty.toFixed(4)} {tradingBase}</span>
                      <span className="mx-1 opacity-40">·</span>
                      <span className={`font-semibold ${isBuy ? "text-bull/70" : "text-bear/70"}`}>
                        ${total.toFixed(2)}
                      </span>
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
