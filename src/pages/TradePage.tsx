import { useQuery } from "@tanstack/react-query";
import { useEffect, useMemo, useState } from "react";
import { AppLayout } from "../components/AppLayout";
import { CoinIcon } from "../components/CoinIcon";
import { PriceChart } from "../components/PriceChart";
import { getOpenOrders, getAllPrices } from "../lib/binance";

function fmt(n: number, d = 4) {
  return n.toLocaleString(undefined, { maximumFractionDigits: d, minimumFractionDigits: d });
}

export default function TradePage() {
  const orders = useQuery({ queryKey: ["openOrders"], queryFn: () => getOpenOrders(), refetchInterval: 8_000 });
  const prices = useQuery({ queryKey: ["prices"], queryFn: () => getAllPrices(), refetchInterval: 6_000 });

  const [selected, setSelected] = useState<string | null>(null);
  useEffect(() => {
    if (!selected && orders.data && orders.data.length > 0) setSelected(String(orders.data[0].orderId));
  }, [orders.data, selected]);

  const order = useMemo(
    () => orders.data?.find((o) => String(o.orderId) === selected) ?? orders.data?.[0],
    [orders.data, selected],
  );

  if (orders.isLoading) return <AppLayout><div className="text-muted-foreground">Loading…</div></AppLayout>;

  if (!order) return (
    <AppLayout>
      <div className="rounded-2xl border border-border bg-card p-10 text-center">
        <h2 className="text-xl font-bold">No open orders on Binance</h2>
        <p className="text-sm text-muted-foreground mt-2">When you have an active limit order, it will appear here.</p>
      </div>
    </AppLayout>
  );

  const base = order.symbol.replace(/USDT$|BUSD$|FDUSD$|BTC$|ETH$/, "");
  const livePrice = prices.data?.[order.symbol];
  const entry = parseFloat(order.price);
  const qty = parseFloat(order.origQty);
  const stop = parseFloat(order.stopPrice);
  const dirMult = order.side === "SELL" ? -1 : 1;
  const pnlPct = livePrice ? ((livePrice - entry) / entry) * 100 * dirMult : 0;
  const pnlUsd = livePrice ? (livePrice - entry) * qty * dirMult : 0;

  return (
    <AppLayout>
      <div className="space-y-5">
        {orders.data && orders.data.length > 1 && (
          <div className="flex gap-2 flex-wrap">
            {orders.data.map((o) => {
              const b = o.symbol.replace(/USDT$|BUSD$|FDUSD$|BTC$|ETH$/, "");
              const active = String(o.orderId) === String(order.orderId);
              return (
                <button key={o.orderId} onClick={() => setSelected(String(o.orderId))}
                  className={`flex items-center gap-2 px-3 py-2 rounded-lg border text-sm font-bold transition-colors ${active ? "border-primary/60 bg-primary/10 text-primary" : "border-border bg-card text-muted-foreground hover:text-foreground"}`}>
                  <CoinIcon symbol={b} size={20} />{o.symbol}
                </button>
              );
            })}
          </div>
        )}

        <section className="rounded-2xl border border-border bg-card p-5 md:p-6">
          <div className="flex flex-wrap items-start gap-4 justify-between">
            <div className="flex min-w-0 items-center gap-3">
              <CoinIcon symbol={base} size={48} />
              <div className="min-w-0">
                <div className="flex items-center gap-2 flex-wrap">
                  <h1 className="text-xl md:text-2xl font-black truncate">{order.symbol}</h1>
                  <span className="text-[10px] font-bold px-2 py-0.5 rounded-md bg-primary/15 text-primary">{order.type} {order.side}</span>
                </div>
                <div className="text-xs text-muted-foreground mt-0.5">
                  <span className="inline-block h-1.5 w-1.5 rounded-full bg-bull mr-1.5 align-middle animate-pulse" />
                  Detected from Binance · {fmt(qty)} {base}
                </div>
              </div>
            </div>
            <div className="text-right shrink-0">
              <div className={`text-2xl md:text-3xl font-black ${pnlUsd >= 0 ? "text-bull" : "text-bear"}`}>
                {pnlUsd >= 0 ? "+" : ""}{pnlUsd.toFixed(2)} <span className="text-sm">USDT</span>
              </div>
              <div className={`text-xs font-bold ${pnlPct >= 0 ? "text-bull" : "text-bear"}`}>
                {pnlPct >= 0 ? "▲" : "▼"} {Math.abs(pnlPct).toFixed(2)}% unrealised
              </div>
            </div>
          </div>
          <div className="mt-5 grid grid-cols-2 md:grid-cols-4 gap-3">
            <Cell label="Entry" value={`$${fmt(entry, entry < 1 ? 4 : 2)}`} />
            <Cell label="Live Price" value={livePrice ? `$${fmt(livePrice, livePrice < 1 ? 4 : 2)}` : "…"} accent />
            <Cell label="Quantity" value={`${fmt(qty)} ${base}`} />
            <Cell label="Stop Loss" value={stop > 0 ? `$${fmt(stop, stop < 1 ? 4 : 2)}` : "—"} danger />
          </div>
        </section>
        <PriceChart symbol={order.symbol} interval="1m" height={460} />
      </div>
    </AppLayout>
  );
}

function Cell({ label, value, accent, danger }: { label: string; value: string; accent?: boolean; danger?: boolean }) {
  return (
    <div className={`rounded-xl border px-4 py-3 ${danger ? "border-bear/30 bg-bear/10" : accent ? "border-primary/30 bg-primary/10" : "border-border bg-muted/30"}`}>
      <div className="text-[10px] uppercase tracking-widest font-bold text-muted-foreground">{label}</div>
      <div className={`text-base md:text-lg font-black mt-1 truncate ${danger ? "text-bear" : accent ? "text-primary" : ""}`}>{value}</div>
    </div>
  );
}
