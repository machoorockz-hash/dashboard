import { useEffect, useRef, useState } from "react";
import { CoinIcon } from "./CoinIcon";

const API_BASE = import.meta.env.VITE_API_BASE ?? "";
const PUMP_KEY = import.meta.env.VITE_PUMP_KEY ?? "pump";
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

interface PumpSnapshot {
  paused?: boolean;
  newsStatus?: string;
  newsReason?: string;
  whaleStatus?: string;
  whaleReason?: string;
  pauseReason?: string;
  reason?: string;
  status?: string;
}

function textValue(value: unknown) {
  return typeof value === "string" ? value.trim() : "";
}

function isScannerPaused(data: PumpSnapshot | null): boolean {
  if (!data) return false;

  const responseStatus = String(
    data.newsStatus ?? data.status ?? "",
  ).toUpperCase();

  const newsStatus = String(data.newsStatus ?? "").toUpperCase();
  const whaleStatus = String(data.whaleStatus ?? "").toUpperCase();

  return (
    data.paused === true ||
    responseStatus === "RISK" ||
    responseStatus === "PAUSED" ||
    newsStatus === "RISK" ||
    whaleStatus === "HOLD"
  );
}

function getPauseReasons(data: PumpSnapshot | null): string[] {
  if (!data) return [];

  const newsStatus = String(data.newsStatus ?? "").toUpperCase();
  const whaleStatus = String(data.whaleStatus ?? "").toUpperCase();

  const reasons = [
    newsStatus === "RISK" ? textValue(data.newsReason) : "",
    whaleStatus === "HOLD" ? textValue(data.whaleReason) : "",
  ].filter(Boolean);

  if (reasons.length === 0) {
    const generalReason = textValue(data.pauseReason ?? data.reason);

    if (generalReason) {
      reasons.push(generalReason);
    }
  }

  return reasons;
}

function isMarketSessionPause(data: PumpSnapshot | null): boolean {
  const reasons = getPauseReasons(data);

  return reasons.length === 1 && /\bsession\b/i.test(reasons[0]);
}

function isMarketResetPause(data: PumpSnapshot | null): boolean {
  const reasons = getPauseReasons(data);

  return reasons.length === 1 && /\bweekely\b/i.test(reasons[0]);
}

function isEventGuardPause(data: PumpSnapshot | null): boolean {
  const reasons = getPauseReasons(data);

  return reasons.length === 1 && /\bevent guard\b\s*:?/i.test(reasons[0]);
}

/**
 * Returns true if the delist datetime (date + time) is now or in the future.
 * Accepts DD/MM/YYYY date and "h:mm am/pm" time. If the date is missing or
 * unparseable the coin is shown (safe default). If time is missing the coin
 * is shown until the end of that day.
 */
function isUpcoming(item: DelistSymbol): boolean {
  if (!item.date) return true;

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

  const parts = item.date.split("/");

  if (parts.length === 3) {
    const [dd, mm, yyyy] = parts;
    const delistDate = new Date(
      Number(yyyy),
      Number(mm) - 1,
      Number(dd),
    );

    if (!isNaN(delistDate.getTime())) {
      if (item.time) {
        const parsed = parseTime(item.time);

        if (parsed) {
          delistDate.setHours(parsed[0], parsed[1], 0, 0);
        } else {
          delistDate.setHours(23, 59, 59, 999);
        }
      } else {
        delistDate.setHours(23, 59, 59, 999);
      }

      return delistDate >= new Date();
    }
  }

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

  return true;
}

// Pause banner — scrolling ticker with repeated pause messages
function PauseBanner({
  messages,
  scannerSessionPause,
  scannerMarketResetPause,
  scannerEventGuardPause,
}: {
  messages: string[];
  scannerSessionPause: boolean;
  scannerMarketResetPause: boolean;
  scannerEventGuardPause: boolean;
}) {
  const items = messages.length > 0 ? messages : ["PAUSED"];

  const label = (
    <div className="flex items-center gap-6 px-8 py-1.5 shrink-0">
      {Array.from({ length: 6 }).map((_, i) => (
        <div
          key={i}
          className="flex items-center gap-2.5 whitespace-nowrap"
        >
          <span className="text-sm">⏸</span>

          <span
            className={`font-black text-xs tracking-widest uppercase ${
              items[i % items.length] === "TRADE PAUSED"
                ? "text-[#FF3333]"
                : items[i % items.length] === "EVENT GUARD" &&
              scannerEventGuardPause
                ? "text-[#0047AB]"
                : items[i % items.length] === "MARKET SESSION" &&
              scannerSessionPause
                ? "text-purple-400"
                : items[i % items.length] === "MARKET RESET" &&
              scannerMarketResetPause
                ? "text-purple-400"
                : "text-yellow-400"
            }`}
          >
            {items[i % items.length]}
          </span>

          <span className="text-muted-foreground/30 text-xs">·</span>
        </div>
      ))}
    </div>
  );

  return (
    <div className="border-b border-yellow-500/40 bg-yellow-500/10 overflow-hidden">
      <div className="flex ticker-scroll w-max">
        {label}
        {label}
      </div>
    </div>
  );
}

export function TickerTape() {
  const [data, setData] = useState<DelistData | null>(null);
  const [stale, setStale] = useState(false);
  const lastFetchRef = useRef<number>(0);

  const [tradeMode, setTradeMode] = useState<string | null>(null);
  const [scannerPaused, setScannerPaused] = useState(false);
  const [scannerSessionPause, setScannerSessionPause] = useState(false);
  const [scannerMarketResetPause, setScannerMarketResetPause] = useState(false);
  const [scannerEventGuardPause, setScannerEventGuardPause] = useState(false);

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
        if (mounted) {
          timer = setTimeout(fetchData, POLL_MS);
        }
      }
    }

    void fetchData();

    return () => {
      mounted = false;
      clearTimeout(timer);
    };
  }, []);

  // Poll trade_mode from the bot endpoint
  useEffect(() => {
    let timer: ReturnType<typeof setTimeout>;
    let mounted = true;

    async function fetchTradeMode() {
      try {
        const r = await fetch(`${API_BASE}/api/bot/data?key=btc`);
        const json: BotSnapshot = await r.json();

        if (mounted && typeof json?.data?.trade_mode === "string") {
          setTradeMode(json.data.trade_mode);
        }
      } catch {
        // Keep last known value on error
      } finally {
        if (mounted) {
          timer = setTimeout(fetchTradeMode, POLL_MS);
        }
      }
    }

    void fetchTradeMode();

    return () => {
      mounted = false;
      clearTimeout(timer);
    };
  }, []);

  // Poll pump scanner pause state
  useEffect(() => {
    let timer: ReturnType<typeof setTimeout>;
    let mounted = true;

    async function fetchPumpStatus() {
      try {
        const r = await fetch(`${API_BASE}/api/pump/data?key=${PUMP_KEY}`);
        const json: PumpSnapshot = await r.json();

        if (mounted) {
          setScannerPaused(isScannerPaused(json));
          setScannerSessionPause(isMarketSessionPause(json));
          setScannerMarketResetPause(isMarketResetPause(json));
          setScannerEventGuardPause(isEventGuardPause(json));
        }
      } catch {
        // Keep last known value on error
      } finally {
        if (mounted) {
          timer = setTimeout(fetchPumpStatus, POLL_MS);
        }
      }
    }

    void fetchPumpStatus();

    return () => {
      mounted = false;
      clearTimeout(timer);
    };
  }, []);

  const tradePaused = tradeMode === "Pause";

  const pauseMessages = [
    ...(tradePaused ? ["TRADE PAUSED"] : []),
    ...(scannerPaused
      ? [
          scannerEventGuardPause
            ? "EVENT GUARD"
            : scannerSessionPause
              ? "MARKET SESSION"
              : scannerMarketResetPause
                ? "MARKET RESET"
              : "SCANNER PAUSED",
        ]
      : []),
  ];

  // Show pause banner when trade and/or pump scanner is paused
  if (pauseMessages.length > 0) {
    return (
      <PauseBanner
        messages={pauseMessages}
        scannerSessionPause={scannerSessionPause}
        scannerMarketResetPause={scannerMarketResetPause}
        scannerEventGuardPause={scannerEventGuardPause}
      />
    );
  }

  const isActive = !stale && data?.active === true;

  const upcomingSymbols = isActive
    ? (data?.symbols ?? []).filter(isUpcoming)
    : [];

  if (upcomingSymbols.length === 0) return null;

  const row = (
    <div className="flex items-center gap-8 px-6 py-1.5 shrink-0">
      {upcomingSymbols.map((item) => (
        <div
          key={item.symbol}
          className="flex items-center gap-2.5 text-xs whitespace-nowrap"
        >
          <CoinIcon symbol={item.symbol} size={18} />

          <span className="font-bold text-foreground">
            {item.symbol}/USDT
          </span>

          <span className="font-black text-bear text-[11px]">
            ▼ DELIST
          </span>

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
        {row}
        {row}
      </div>
    </div>
  );
}
