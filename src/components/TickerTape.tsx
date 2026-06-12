import { useEffect, useRef, useState } from "react";
import { CoinIcon } from "./CoinIcon";

const API_BASE = import.meta.env.VITE_API_BASE ?? "";
const POLL_MS  = 5_000;
const STALE_MS = 12_000;

interface DelistSymbol {
  symbol: string;
  date:   string;
  time:   string;
}

interface DelistData {
  active:        boolean;
  symbols:       DelistSymbol[];
  lastUpdated:   string | null;
  lastHeartbeat: string | null;
}

export function TickerTape() {
  const [data,  setData]  = useState<DelistData | null>(null);
  const [stale, setStale] = useState(false);
  const lastRef = useRef<number>(0);

  useEffect(() => {
    let t: ReturnType<typeof setTimeout>;
    async function poll() {
      try {
        const r    = await fetch(`${API_BASE}/api/delist/data`);
        const json: DelistData = await r.json();
        lastRef.current = Date.now();
        setStale(false);
        setData(json);
      } catch {
        if (Date.now() - lastRef.current > STALE_MS) setStale(true);
      } finally {
        t = setTimeout(poll, POLL_MS);
      }
    }
    void poll();
    return () => clearTimeout(t);
  }, []);

  const active = !stale && data?.active === true && data.symbols.length > 0;
  if (!active) return null;

  const items = data!.symbols;

  const row = (
    <div className="flex items-center shrink-0">
      {items.map((item, i) => (
        <div
          key={`${item.symbol}-${i}`}
          className="flex items-center gap-2.5 px-6 text-xs whitespace-nowrap border-r border-border/30"
        >
          {/* Coin icon + name */}
          <CoinIcon symbol={item.symbol} size={20} />
          <span className="font-bold tracking-wide text-foreground/90">
            {item.symbol}
            <span className="text-muted-foreground/50 font-normal">/USDT</span>
          </span>

          {/* DELIST badge */}
          <span
            className="flex items-center gap-1 px-2 py-0.5 rounded text-[10px] font-black tracking-[0.12em] uppercase"
            style={{
              background:  "oklch(0.65 0.24 18 / 0.12)",
              color:       "oklch(0.72 0.22 18)",
              border:      "1px solid oklch(0.65 0.24 18 / 0.35)",
              boxShadow:   "0 0 8px oklch(0.65 0.24 18 / 0.18), inset 0 0 4px oklch(0.65 0.24 18 / 0.06)",
            }}
          >
            <span
              className="w-1.5 h-1.5 rounded-full animate-pulse"
              style={{ background: "oklch(0.72 0.22 18)" }}
            />
            ▼ Delist
          </span>

          {/* Date / time block */}
          {(item.date || item.time) && (
            <span
              className="flex items-center gap-1.5 pl-2.5 text-[10px] tabular-nums font-medium"
              style={{
                borderLeft: "1px solid oklch(0.30 0.02 220 / 50%)",
                color:      "oklch(0.68 0.02 220)",
              }}
            >
              {/* Date */}
              {item.date && (
                <>
                  <svg className="w-3 h-3 shrink-0" viewBox="0 0 16 16" fill="none"
                    style={{ color: "oklch(0.65 0.24 18 / 0.55)" }}>
                    <rect x="1" y="3" width="14" height="11" rx="2" stroke="currentColor" strokeWidth="1.4" />
                    <path d="M1 7h14" stroke="currentColor" strokeWidth="1.4" />
                    <path d="M5 1v4M11 1v4" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" />
                  </svg>
                  <span style={{ color: "oklch(0.80 0.02 220)" }}>{item.date}</span>
                </>
              )}

              {item.date && item.time && (
                <span style={{ color: "oklch(0.40 0.02 220)" }}>·</span>
              )}

              {/* Time */}
              {item.time && (
                <>
                  <svg className="w-3 h-3 shrink-0" viewBox="0 0 16 16" fill="none"
                    style={{ color: "oklch(0.82 0.18 165 / 0.55)" }}>
                    <circle cx="8" cy="8" r="6.5" stroke="currentColor" strokeWidth="1.4" />
                    <path d="M8 5v3.5l2 2" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" strokeLinejoin="round" />
                  </svg>
                  <span style={{ color: "oklch(0.82 0.18 165 / 0.85)" }}>{item.time}</span>
                  <span
                    className="text-[9px] font-semibold px-1 py-px rounded-sm"
                    style={{
                      background: "oklch(0.82 0.18 165 / 0.10)",
                      color:      "oklch(0.82 0.18 165 / 0.65)",
                      border:     "1px solid oklch(0.82 0.18 165 / 0.18)",
                      letterSpacing: "0.08em",
                    }}
                  >
                    GST
                  </span>
                </>
              )}
            </span>
          )}
        </div>
      ))}
    </div>
  );

  return (
    <div
      className="relative overflow-hidden border-b"
      style={{
        background:   "oklch(0.18 0.022 220)",
        borderColor:  "oklch(0.65 0.24 18 / 0.25)",
        borderTop:    "1px solid oklch(0.65 0.24 18 / 0.20)",
      }}
    >
      {/* Top glow line */}
      <div
        className="absolute top-0 inset-x-0 h-px pointer-events-none"
        style={{
          background: "linear-gradient(90deg, transparent 0%, oklch(0.65 0.24 18 / 0.50) 40%, oklch(0.72 0.22 18 / 0.70) 50%, oklch(0.65 0.24 18 / 0.50) 60%, transparent 100%)",
        }}
      />

      {/* Scrolling band */}
      <div className="flex ticker-scroll w-max py-2">
        {row}{row}
      </div>

      {/* Bottom glow line */}
      <div
        className="absolute bottom-0 inset-x-0 h-px pointer-events-none"
        style={{
          background: "linear-gradient(90deg, transparent 0%, oklch(0.65 0.24 18 / 0.20) 50%, transparent 100%)",
        }}
      />
    </div>
  );
}
