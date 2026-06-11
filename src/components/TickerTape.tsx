import { useEffect, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { CoinIcon } from "./CoinIcon";
import goldLogo from "@/assets/gold-logo.png.asset.json";
import { getOpenOrders } from "@/lib/binance.functions";

interface Tick {
  symbol: string; // display symbol, e.g. BTC, XAU
  label: string;  // BTC/USDT, XAU/USD, MEME/USDT
  price: number;
  changePct?: number;
  iconSymbol?: string; // for CoinIcon; "GOLD" -> special
}

function fmtPrice(n: number) {
  if (n >= 1000) return n.toLocaleString(undefined, { maximumFractionDigits: 2, minimumFractionDigits: 2 });
  if (n >= 1) return n.toFixed(3);
  if (n >= 0.01) return n.toFixed(4);
  return n.toFixed(6);
}

export function TickerTape() {
  const orders = useQuery({ queryKey: ["openOrders"], queryFn: () => getOpenOrders(), refetchInterval: 15_000 });
  const orderSymbol = orders.data?.[0]?.symbol; // e.g. "MEMEUSDT"
  const orderBase = orderSymbol?.replace(/USDT$|BUSD$|FDUSD$|BTC$|ETH$/, "");

  const [btc, setBtc] = useState<Tick | null>(null);
  const [order, setOrder] = useState<Tick | null>(null);
  const [gold, setGold] = useState<Tick | null>(null);

  // BTC + order coin via Binance ws
  useEffect(() => {
    const symbols = ["btcusdt"];
    if (orderSymbol && orderSymbol.toLowerCase() !== "btcusdt") symbols.push(orderSymbol.toLowerCase());
    const streams = symbols.map((s) => `${s}@ticker`).join("/");
    const ws = new WebSocket(`wss://data-stream.binance.vision/stream?streams=${streams}`);
    ws.onmessage = (e) => {
      try {
        const m = JSON.parse(e.data).data;
        if (!m) return;
        const sym: string = m.s;
        const tick: Tick = {
          symbol: sym.replace(/USDT$|BUSD$|FDUSD$/, ""),
          label: `${sym.replace(/USDT$|BUSD$|FDUSD$/, "")}/USDT`,
          price: parseFloat(m.c),
          changePct: parseFloat(m.P),
        };
        if (sym === "BTCUSDT") setBtc({ ...tick, iconSymbol: "BTC" });
        else if (orderSymbol && sym === orderSymbol) setOrder({ ...tick, iconSymbol: orderBase });
      } catch {}
    };
    return () => ws.close();
  }, [orderSymbol, orderBase]);

  // Gold (XAU/USD) via public api
  useEffect(() => {
    let alive = true;
    async function load() {
      try {
        const r = await fetch("https://api.gold-api.com/price/XAU");
        const d = await r.json();
        if (!alive) return;
        setGold({ symbol: "XAU", label: "XAU/USD", price: parseFloat(d.price), iconSymbol: "GOLD" });
      } catch {}
    }
    load();
    const id = setInterval(load, 60_000);
    return () => { alive = false; clearInterval(id); };
  }, []);

  const ticks: Tick[] = [];
  if (btc) ticks.push(btc);
  if (gold) ticks.push(gold);
  if (order && orderSymbol !== "BTCUSDT") ticks.push(order);

  if (ticks.length === 0) {
    return <div className="h-9 border-b border-border bg-card/40" />;
  }

  const row = (
    <div className="flex items-center gap-10 px-6 py-2 shrink-0">
      {ticks.map((t) => (
        <div key={t.label} className="flex items-center gap-2 text-xs whitespace-nowrap">
          {t.iconSymbol === "GOLD" ? (
            <img src={goldLogo.url} alt="XAU" width={20} height={20} className="rounded-full" />
          ) : (
            <CoinIcon symbol={t.iconSymbol ?? t.symbol} size={20} />
          )}
          <span className="font-bold text-muted-foreground">{t.label}</span>
          <span className="font-semibold tabular-nums">${fmtPrice(t.price)}</span>
          {t.changePct !== undefined && (
            <span className={t.changePct >= 0 ? "text-bull" : "text-bear"}>
              {t.changePct >= 0 ? "▲" : "▼"} {Math.abs(t.changePct).toFixed(2)}%
            </span>
          )}
        </div>
      ))}
    </div>
  );

  return (
    <div className="border-b border-border bg-card/40 overflow-hidden">
      <div className="flex ticker-scroll w-max">
        {row}
        {row}
      </div>
    </div>
  );
}
