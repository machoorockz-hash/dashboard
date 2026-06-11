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

  useEffect(() => {
    const ws = new WebSocket(`wss://stream.binance.com:9443/ws/${symbol.toLowerCase()}@ticker`);
    ws.onmessage = (e) => {
      try { const d = JSON.parse(e.data); setLivePrice(parseFloat(d.c)); setChange(parseFloat(d.P)); } catch {}
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

  return (
    <AppLayout>
      <div className="space-y-5">
        <section className="rounded-2xl border border-border bg-card p-4 md:p-5">
          <div className="flex flex-wrap items-center gap-3">
            <div className="flex items-center gap-3 rounded-xl border border-border bg-muted/30 px-4 py-2.5 min-w-0">
              <CoinIcon symbol={base} size={32} />
              <div className="min-w-0">
                <div className="font-bold truncate">{symbol}</div>
                <div className="text-[11px] text-muted-foreground">Binance Spot</div>
              </div>
              <div className="ml-3 text-right">
                <div className="font-black text-lg">
                  ${livePrice ? livePrice.toLocaleString(undefined, { maximumFractionDigits: livePrice < 1 ? 4 : 2 }) : "…"}
                </div>
                <div className={`text-xs font-bold ${change >= 0 ? "text-bull" : "text-bear"}`}>
                  {change >= 0 ? "▲" : "▼"} {Math.abs(change).toFixed(2)}%
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
