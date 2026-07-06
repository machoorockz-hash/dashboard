import { useEffect, useState } from "react";
import { AppLayout } from "../components/AppLayout";
import { CoinIcon } from "../components/CoinIcon";
import { PriceChart } from "../components/PriceChart";

const QUICK = ["BTC", "ETH", "SOL", "BNB", "XRP", "ADA", "DOGE", "AVAX"];

export default function LiveChartPage() {
  const [symbol, setSymbol] = useState("BTCUSDT");
  const [input, setInput] = useState("");
  const [livePrice, setLivePrice] = useState<number | null>(null);
  const [change, setChange] = useState<number>(0);
  const [flash, setFlash] = useState<"up" | "down" | null>(null);
  const [prevPrice, setPrevPrice] = useState<number | null>(null);

  useEffect(() => {
    setLivePrice(null);
    setPrevPrice(null);
    const ws = new WebSocket(`wss://stream.binance.com:9443/ws/${symbol.toLowerCase()}@ticker`);
    ws.onmessage = (e) => {
      try {
        const d = JSON.parse(e.data);
        const p = parseFloat(d.c);
        setChange(parseFloat(d.P));
        setLivePrice((prev) => {
          if (prev !== null && p !== prev) {
            setFlash(p > prev ? "up" : "down");
            setTimeout(() => setFlash(null), 600);
          }
          setPrevPrice(prev);
          return p;
        });
      } catch {}
    };
    return () => ws.close();
  }, [symbol]);

  const submit = (e: React.FormEvent) => {
    e.preventDefault();
    const v = input.trim().toUpperCase();
    if (!v) return;
    setSymbol(v.endsWith("USDT") ? v : `${v}USDT`);
    setInput("");
  };

  const base = symbol.replace(/USDT$/, "");
  const fmtP = (p: number) =>
    p.toLocaleString(undefined, { maximumFractionDigits: p < 1 ? 4 : 2, minimumFractionDigits: p < 1 ? 4 : 2 });

  return (
    <AppLayout>
      <style>{`
        @keyframes live-price-glow {
          0%, 100% {
            box-shadow:
              0 0 0 0 color-mix(in oklab, var(--primary) 0%, transparent),
              inset 0 0 0 0 color-mix(in oklab, var(--primary) 0%, transparent);
          }
          50% {
            box-shadow:
              0 0 18px 4px color-mix(in oklab, var(--primary) 22%, transparent),
              inset 0 0 12px 0 color-mix(in oklab, var(--primary) 8%, transparent);
          }
        }
        @keyframes live-dot-beat {
          0%, 100% { transform: scale(1); opacity: 1; }
          50%       { transform: scale(1.5); opacity: 0.6; }
        }
        @keyframes live-price-flash-up {
          0%   { color: #00d4a0; text-shadow: 0 0 18px rgba(0,212,160,0.7); }
          100% { color: inherit; text-shadow: none; }
        }
        @keyframes live-price-flash-down {
          0%   { color: #ff2d5f; text-shadow: 0 0 18px rgba(255,45,95,0.7); }
          100% { color: inherit; text-shadow: none; }
        }
        .live-price-box {
          animation: live-price-glow 2.4s ease-in-out infinite;
        }
        .live-dot {
          animation: live-dot-beat 1.4s ease-in-out infinite;
        }
        .price-flash-up   { animation: live-price-flash-up   0.6s ease-out both; }
        .price-flash-down { animation: live-price-flash-down 0.6s ease-out both; }
      `}</style>

      <div className="space-y-5">
        <section className="rounded-2xl border border-border bg-card p-4 md:p-5">
          <div className="flex flex-wrap items-center gap-3">

            {/* ── LIVE PRICE BOX ── */}
            <div className={`live-price-box flex items-center gap-3 rounded-xl border px-4 py-2.5 min-w-0 transition-all duration-300 ${
              flash === "up"
                ? "border-emerald-500/60 bg-emerald-500/10"
                : flash === "down"
                ? "border-red-500/60 bg-red-500/10"
                : "border-primary/30 bg-gradient-to-r from-primary/5 to-transparent"
            }`}>
              <CoinIcon symbol={base} size={32} />
              <div className="min-w-0">
                <div className="flex items-center gap-1.5">
                  <span
                    className={`h-2 w-2 rounded-full shrink-0 live-dot ${
                      flash === "up" ? "bg-emerald-400" : flash === "down" ? "bg-red-400" : "bg-primary"
                    }`}
                  />
                  <span className="font-bold text-xs text-muted-foreground truncate">{symbol}</span>
                  <span className="text-[9px] font-bold px-1.5 py-0.5 rounded-md bg-primary/15 text-primary uppercase tracking-widest">
                    LIVE
                  </span>
                </div>
                <div className="flex items-baseline gap-2 mt-0.5">
                  <span
                    key={livePrice}
                    className={`font-black text-xl tabular-nums leading-none ${
                      flash === "up"
                        ? "price-flash-up text-emerald-400"
                        : flash === "down"
                        ? "price-flash-down text-red-400"
                        : "text-foreground"
                    }`}
                  >
                    {livePrice ? `$${fmtP(livePrice)}` : "…"}
                  </span>
                  <span className={`text-xs font-bold ${change >= 0 ? "text-bull" : "text-bear"}`}>
                    {change >= 0 ? "▲" : "▼"} {Math.abs(change).toFixed(2)}%
                  </span>
                </div>
              </div>
            </div>

            <form onSubmit={submit} className="flex-1 flex items-center gap-2 min-w-[220px]">
              <input value={input} onChange={(e) => setInput(e.target.value)} placeholder="Symbol e.g. ETH"
                className="flex-1 bg-muted/30 border border-border rounded-xl px-4 py-2.5 text-sm focus:outline-none focus:border-primary" />
              <button type="submit" className="rounded-xl bg-primary/20 text-primary font-bold px-4 py-2.5 text-sm hover:bg-primary/30 transition-colors">
                Search
              </button>
            </form>
          </div>

          <div className="mt-4 flex gap-2 overflow-x-auto pb-1">
            {QUICK.map((s) => {
              const sym = `${s}USDT`;
              const active = sym === symbol;
              return (
                <button key={s} onClick={() => setSymbol(sym)}
                  className={`flex items-center gap-2 px-3 py-1.5 rounded-lg border text-sm font-bold shrink-0 transition-colors ${active ? "border-primary/60 bg-primary/10 text-primary" : "border-border bg-card text-muted-foreground hover:text-foreground"}`}>
                  <CoinIcon symbol={s} size={20} />{s}
                </button>
              );
            })}
          </div>
        </section>

        <PriceChart symbol={symbol} interval="1m" height={520} />
      </div>
    </AppLayout>
  );
}
