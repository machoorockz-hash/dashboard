import { useEffect, useRef, useState } from "react";
import { CoinIcon } from "./CoinIcon";

const API_BASE = import.meta.env.VITE_API_BASE ?? "";
const POLL_MS = 5_000;
const STALE_MS = 12_000;

interface DelistSymbol {
  symbol: string;
  date: string;
  time: string;
}

interface DelistData {
  active: boolean;
  symbols: DelistSymbol[];
  lastUpdated: string | null;
  lastHeartbeat: string | null;
}

export function TickerTape() {
  const [data, setData] = useState<DelistData | null>(null);
  const [stale, setStale] = useState(false);
  const lastFetchRef = useRef<number>(0);

  useEffect(() => {
    let timer: ReturnType<typeof setTimeout>;

    async function fetchData() {
      try {
        const r = await fetch(`${API_BASE}/api/delist/data`);
        const json: DelistData = await r.json();
        lastFetchRef.current = Date.now();
        setStale(false);
        setData(json);
      } catch {
        if (Date.now() - lastFetchRef.current > STALE_MS) setStale(true);
      } finally {
        timer = setTimeout(fetchData, POLL_MS);
      }
    }

    void fetchData();
    return () => clearTimeout(timer);
  }, []);

  const active = !stale && data?.active === true && data.symbols.length > 0;

  if (!active) return null;

  const symbols = data!.symbols;

  const row = (
    <div className="flex items-center gap-8 px-6 py-1.5 shrink-0">
      {symbols.map((item) => (
        <div key={item.symbol} className="flex items-center gap-2.5 text-xs whitespace-nowrap">
          <CoinIcon symbol={item.symbol} size={18} />
          <span className="font-bold text-foreground">{item.symbol}/USDT</span>
          <span className="font-black text-bear text-[11px]">▼ DELIST</span>
          {(item.date || item.time) && (
            <span className="flex items-center gap-1 text-[10px] font-medium text-muted-foreground/70 tabular-nums border-l border-border/50 pl-2.5">
              <span className="text-muted-foreground/50">📅</span>
              {item.date}
              {item.date && item.time && (
                <span className="text-muted-foreground/40 mx-0.5">·</span>
              )}
              {item.time}
            </span>
          )}
        </div>
      ))}
    </div>
  );

  return (
    <div className="border-b border-border bg-card/40 overflow-hidden">
      <div className="flex ticker-scroll w-max">
        {row}{row}
      </div>
    </div>
  );
}
