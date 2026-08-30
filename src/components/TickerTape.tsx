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

// The /api/bot/data endpoint wraps bot fields inside a "data" key:
// { key, updatedAt, data: { trade_mode, ... } }
interface BotSnapshot {
  key: string;
  updatedAt: string | null;
  data: { trade_mode?: string } | null;
}

/**
 * Returns true if the delist datetime (date + time) is now or in the future.
 * Accepts DD/MM/YYYY date and "h:mm am/pm" time. If the date is missing or
 * unparseable the coin is shown (safe default). If time is missing the coin
 * is shown until the end of that day.
 */
function isUpcoming(item: DelistSymbol): boolean {
  if (!item.date) return true;

  // Helper: parse "1:00 pm" / "12:30 AM" → [hours24, minutes] or null
  function parseTime(t: string): [number, number] | null {
    const m = t.trim().match(/^(\d{1,2}):(\d{2})\s*(am|pm)$/i);
    if (!m) return null;
    let h = Number(m[1]);
    const min = Number(m[2]);
    const mer = m[3].toLowerCase();
    if (mer === "pm" && h !== 12) h += 12;
    if (mer === "am" && h === 12) h = 0;
    return [h, min];
  }

  // Try DD/MM/YYYY (the format used throughout this project)
  const parts = item.date.split("/");
  if (parts.length === 3) {
    const [dd, mm, yyyy] = parts;
    const delistDate = new Date(Number(yyyy), Number(mm) - 1, Number(dd));
    if (!isNaN(delistDate.getTime())) {
      if (item.time) {
        const parsed = parseTime(item.time);
        if (parsed) {
          delistDate.setHours(parsed[0], parsed[1], 0, 0);
        } else {
          // Unrecognised time format → keep until end of day
          delistDate.setHours(23, 59, 59, 999);
        }
      } else {
        // No time provided → keep until end of day
        delistDate.setHours(23, 59, 59, 999);
      }
      return delistDate >= new Date();
    }
  }

  // Fallback: try native Date parsing (YYYY-MM-DD, ISO, etc.)
  const d = new Date(item.date);
  if (!isNaN(d.getTime())) {
    if (item.time) {
      const parsed = parseTime(item.time);
      if (parsed) {
        d.setHours(parsed[0], parsed[1], 0, 0);
      } else {
        d.setHours(23, 59, 59, 999);
      }
    } else {
      d.setHours(23, 59, 59, 999);
    }
    return d >= new Date();
  }

  return true; // unparseable → show it
}

// Pause banner — scrolling ticker with a repeated "TRADE IS PAUSED" message
function PauseBanner() {
  const label = (
    <div className="flex items-center gap-6 px-8 py-1.5 shrink-0">
      {Array.from({ length: 6 }).map((_, i) => (
        <div key={i} className="flex items-center gap-2.5 whitespace-nowrap">
          <span className="text-sm">⏸</span>
          <span className="font-black text-xs tracking-widest text-yellow-400 uppercase">
            TRADE IS PAUSED
          </span>
          <span className="text-muted-foreground/30 text-xs">·</span>
        </div>
      ))}
    </div>
  );

  return (
    <div className="border-b border-yellow-500/40 bg-yellow-500/10 overflow-hidden">
      <div className="flex ticker-scroll w-max">
        {label}{label}
      </div>
    </div>
  );
}

export function TickerTape() {
  const [data, setData] = useState<DelistData | null>(null);
  const [stale, setStale] = useState(false);
  const lastFetchRef = useRef<number>(0);

  // Trade-mode state from /api/bot/data?key=btc
  const [tradeMode, setTradeMode] = useState<string | null>(null);

  // Poll delist data
  useEffect(() => {
    let timer: ReturnType<typeof setTimeout>;
    let mounted = true;

    async function fetchData() {
      try {
        const r = await fetch(`${API_BASE}/api/delist/data`);
        const json: DelistData = await r.json();
        if (mounted) {
          lastFetchRef.current = Date.now();
          setStale(false);
          setData(json);
        }
      } catch {
        if (mounted && Date.now() - lastFetchRef.current > STALE_MS) {
          setStale(true);
        }
      } finally {
        if (mounted) timer = setTimeout(fetchData, POLL_MS);
      }
    }

    void fetchData();
    return () => {
      mounted = false;
      clearTimeout(timer);
    };
  }, []);

  // Poll trade_mode from the bot endpoint (same cadence as delist poll)
  useEffect(() => {
    let timer: ReturnType<typeof setTimeout>;
    let mounted = true;

    async function fetchTradeMode() {
      try {
        const r = await fetch(`${API_BASE}/api/bot/data?key=btc`);
        // ✅ FIX: API returns { key, updatedAt, data: { trade_mode, ... } }
        //         trade_mode lives inside .data, not at the root level.
        const json: BotSnapshot = await r.json();
        if (mounted && typeof json?.data?.trade_mode === "string") {
          setTradeMode(json.data.trade_mode);
        }
      } catch {
        // keep last known value on error
      } finally {
        if (mounted) timer = setTimeout(fetchTradeMode, POLL_MS);
      }
    }

    void fetchTradeMode();
    return () => {
      mounted = false;
      clearTimeout(timer);
    };
  }, []);

  // Show pause banner when the bot reports trade_mode === "Pause"
  if (tradeMode === "Pause") {
    return <PauseBanner />;
  }

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
