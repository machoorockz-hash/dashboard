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

/**
 * Returns true if the delist date is today or in the future.
 * Accepts DD/MM/YYYY format. If the date is missing or unparseable,
 * the coin is shown (safe default).
 */
function isUpcoming(item: DelistSymbol): boolean {
  if (!item.date) return true;

  // Try DD/MM/YYYY (the format used throughout this project)
  const parts = item.date.split("/");
  if (parts.length === 3) {
    const [dd, mm, yyyy] = parts;
    const delistDate = new Date(Number(yyyy), Number(mm) - 1, Number(dd));
    if (!isNaN(delistDate.getTime())) {
      const today = new Date();
      today.setHours(0, 0, 0, 0);
      delistDate.setHours(0, 0, 0, 0);
      return delistDate >= today;
    }
  }

  // Fallback: try native Date parsing (YYYY-MM-DD, ISO, etc.)
  const d = new Date(item.date);
  if (!isNaN(d.getTime())) {
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    d.setHours(0, 0, 0, 0);
    return d >= today;
  }

  return true; // unparseable → show it
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

  const isActive = !stale && data?.active === true;

  // Only show coins whose delist date hasn't passed yet
  const upcomingSymbols = isActive ? (data?.symbols ?? []).filter(isUpcoming) : [];

  if (upcomingSymbols.length === 0) return null;

  const row = (
    <div className="flex items-center gap-8 px-6 py-1.5 shrink-0">
      {upcomingSymbols.map((item) => (
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
