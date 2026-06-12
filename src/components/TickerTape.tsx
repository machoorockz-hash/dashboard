import { useEffect, useRef, useState } from "react";
import { CoinIcon } from "./CoinIcon";

const API_BASE = import.meta.env.VITE_API_BASE ?? "";
const POLL_MS = 5_000;
const STALE_MS = 12_000;

interface DelistData {
  active: boolean;
  symbols: string[];
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

  // Bot offline or no symbols → show nothing at all
  if (!active) return null;

  const symbols = data!.symbols;

  const row = (
    <div className="flex items-center gap-10 px-6 py-2 shrink-0">
      {symbols.map((sym) => (
        <div key={sym} className="flex items-center gap-2 text-xs whitespace-nowrap">
          <CoinIcon symbol={sym} size={20} />
          <span className="font-bold text-muted-foreground">{sym}/USDT</span>
          <span className="font-black text-bear">▼ DELIST</span>
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
