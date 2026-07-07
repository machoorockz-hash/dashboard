import { useQuery } from "@tanstack/react-query";
import { useEffect, useMemo, useRef, useState } from "react";
import { Wallet as WalletIcon, TrendingUp, Target, Shield, Activity, Layers, Clock } from "lucide-react";
import { AppLayout } from "../components/AppLayout";
import { CoinIcon } from "../components/CoinIcon";
import { PriceChart } from "../components/PriceChart";
import { BtcCrashCard } from "../components/BtcCrashCard";
import PumpScannerCard from "../components/PumpScannerCard";
import { getAccount, getOpenOrders, getAllPrices, getMyTrades } from "../lib/binance";

const API_BASE = import.meta.env.VITE_API_BASE ?? "";

// Spectrum palette for the wallet allocation bar & coin accent colours
const SPECTRUM_COLORS = [
  "#ef4444", "#f97316", "#f59e0b", "#22c55e",
  "#10b981", "#14b8a6", "#06b6d4", "#3b82f6",
  "#8b5cf6", "#ec4899",
];

function fmt(n: number, max = 2, min = max) {
  return n.toLocaleString(undefined, { maximumFractionDigits: max, minimumFractionDigits: min });
}
function fmtPrice(p: number) {
  if (!isFinite(p)) return "…";
  if (p >= 1000) return fmt(p, 2);
  if (p >= 1) return fmt(p, 4);
  if (p >= 0.01) return fmt(p, 5);
  return fmt(p, 6);
}

/** Format a unix-ms timestamp into UAE (Asia/Dubai, UTC+4) date & time strings */
function fmtUAE(ts: number): { date: string; time: string } {
  const dtf_date = new Intl.DateTimeFormat("en-GB", {
    timeZone: "Asia/Dubai",
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
  });
  const dtf_time = new Intl.DateTimeFormat("en-US", {
    timeZone: "Asia/Dubai",
    hour: "2-digit",
    minute: "2-digit",
    hour12: true,
  });
  const d = new Date(ts);
  const date = dtf_date.format(d);
  const time = dtf_time.format(d).toLowerCase();
  return { date, time };
}

/* ─────────────────────────────────────────────────────────────────────────────
   CYBER CYLINDER STEP VISUALISER
   Replaces the old flat StepSegments component.
───────────────────────────────────────────────────────────────────────────── */

const CYL_MAGENTA = "#e040fb";
const CYL_CYAN    = "#00e5ff";
const CYL_TEAL    = "var(--primary)";
const cylTealMix  = (pct: number) => `color-mix(in oklab, var(--primary) ${pct}%, transparent)`;
const cylMgMix    = (pct: number) => `color-mix(in oklab, ${CYL_MAGENTA} ${pct}%, transparent)`;
const cylCyMix    = (pct: number) => `color-mix(in oklab, ${CYL_CYAN} ${pct}%, transparent)`;

type CylState = "completed" | "active" | "pending";

function CyberCylinder({ stepNum, state }: { stepNum: number; state: CylState }) {
  const isCompleted = state === "completed";
  const isActive    = state === "active";

  const W      = isActive ? 58 : 44;
  const BODY_H = isActive ? 90 : isCompleted ? 60 : 66;
  const EH     = Math.round(W * 0.24);
  const totalH = BODY_H + EH * 2;

  const capTopBg = isCompleted
    ? `radial-gradient(ellipse at 38% 32%, ${cylTealMix(75)}, ${cylTealMix(35)})`
    : isActive
    ? `radial-gradient(ellipse at 38% 32%, ${cylCyMix(75)}, ${cylMgMix(50)})`
    : `color-mix(in oklab, var(--muted-foreground) 6%, transparent)`;

  const capTopBorder = isCompleted
    ? `1.5px solid ${cylTealMix(55)}`
    : isActive
    ? `1.5px solid ${cylCyMix(70)}`
    : `1px solid color-mix(in oklab, var(--muted-foreground) 16%, transparent)`;

  const capTopShadow = isCompleted
    ? `0 0 14px ${cylTealMix(55)}, inset 0 2px 5px ${cylTealMix(30)}`
    : isActive
    ? `0 0 20px ${cylCyMix(75)}, 0 0 36px ${cylMgMix(40)}`
    : "none";

  const capBotBg = isCompleted
    ? `radial-gradient(ellipse at 38% 68%, ${cylTealMix(55)}, ${cylTealMix(22)})`
    : isActive
    ? `radial-gradient(ellipse at 38% 68%, ${cylMgMix(65)}, ${cylCyMix(30)})`
    : `color-mix(in oklab, var(--muted-foreground) 4%, transparent)`;

  const capBotBorder = isCompleted
    ? `1px solid ${cylTealMix(40)}`
    : isActive
    ? `1.5px solid ${cylMgMix(55)}`
    : `1px solid color-mix(in oklab, var(--muted-foreground) 10%, transparent)`;

  const capBotShadow = isCompleted
    ? `0 0 22px ${cylTealMix(65)}, 0 6px 18px ${cylTealMix(45)}`
    : isActive
    ? `0 0 28px ${cylMgMix(80)}, 0 6px 22px ${cylCyMix(55)}`
    : "none";

  const badgeBorder = isCompleted
    ? `1px solid ${cylTealMix(50)}`
    : isActive
    ? `2px solid ${cylCyMix(70)}`
    : `1px solid color-mix(in oklab, var(--muted-foreground) 18%, transparent)`;

  const badgeBg = isCompleted
    ? cylTealMix(18)
    : isActive
    ? cylMgMix(14)
    : "transparent";

  const badgeColor = isCompleted
    ? CYL_TEAL
    : isActive
    ? CYL_CYAN
    : "color-mix(in oklab, var(--muted-foreground) 38%, transparent)";

  const badgeShadow = isActive
    ? `0 0 9px ${cylCyMix(65)}`
    : isCompleted
    ? `0 0 5px ${cylTealMix(30)}`
    : "none";

  return (
    <div style={{ display: "flex", flexDirection: "column", alignItems: "center", gap: 5 }}>
      {/* "NOW" floating label — only on active */}
      <div style={{ height: 16, display: "flex", alignItems: "center", justifyContent: "center" }}>
        {isActive && (
          <span style={{
            fontSize: 8,
            fontWeight: 900,
            letterSpacing: "0.22em",
            textTransform: "uppercase",
            color: CYL_CYAN,
            animation: "cyl-now-pulse 1.2s ease-in-out infinite",
          }}>
            NOW
          </span>
        )}
      </div>

      {/* ── Main cylinder wrapper ── */}
      <div style={{ position: "relative", width: W, height: totalH, flexShrink: 0 }}>

        {/* Outer orbit rings — active only */}
        {isActive && (
          <>
            <div style={{
              position: "absolute", inset: -9, borderRadius: "50%",
              border: `1.5px dashed ${cylMgMix(42)}`,
              animation: "cyl-ring-cw 3.8s linear infinite",
              pointerEvents: "none",
            }} />
            <div style={{
              position: "absolute", inset: -17, borderRadius: "50%",
              border: `1px dashed ${cylCyMix(28)}`,
              animation: "cyl-ring-ccw 6.5s linear infinite",
              pointerEvents: "none",
            }} />
            <div style={{
              position: "absolute", inset: -24, borderRadius: "50%",
              border: `1px solid ${cylMgMix(10)}`,
              animation: "cyl-ring-cw 11s linear infinite",
              pointerEvents: "none",
            }} />
          </>
        )}

        {/* ── TOP CAP ── */}
        <div style={{
          position: "absolute", top: 0, left: 0, right: 0,
          height: EH * 2, borderRadius: "50%", zIndex: 3,
          background: capTopBg, border: capTopBorder, boxShadow: capTopShadow,
        }} />

        {/* ── CYLINDER BODY ── */}
        <div style={{
          position: "absolute", top: EH, left: 0, right: 0,
          height: BODY_H, overflow: "hidden", zIndex: 2,
        }}>
          {/* Glass wall base */}
          <div style={{
            position: "absolute", inset: 0,
            background: isCompleted
              ? `linear-gradient(90deg, ${cylTealMix(14)} 0%, ${cylTealMix(6)} 50%, ${cylTealMix(18)} 100%)`
              : isActive
              ? `linear-gradient(90deg, ${cylMgMix(11)} 0%, ${cylCyMix(5)} 50%, ${cylMgMix(14)} 100%)`
              : "color-mix(in oklab, var(--muted-foreground) 3%, transparent)",
            backdropFilter: "blur(6px)",
          }} />

          {/* Left highlight strip */}
          <div style={{
            position: "absolute", left: 0, top: 0, bottom: 0,
            width: Math.max(3, W * 0.055),
            background: isCompleted
              ? `linear-gradient(180deg, ${cylTealMix(45)} 0%, ${cylTealMix(18)} 100%)`
              : isActive
              ? `linear-gradient(180deg, ${cylCyMix(55)} 0%, ${cylMgMix(28)} 100%)`
              : "color-mix(in oklab, var(--muted-foreground) 10%, transparent)",
          }} />

          {/* Right shadow strip */}
          <div style={{
            position: "absolute", right: 0, top: 0, bottom: 0,
            width: Math.max(3, W * 0.055),
            background: isCompleted
              ? `linear-gradient(180deg, ${cylTealMix(22)} 0%, ${cylTealMix(9)} 100%)`
              : isActive
              ? `linear-gradient(180deg, ${cylMgMix(28)} 0%, ${cylCyMix(14)} 100%)`
              : "color-mix(in oklab, var(--muted-foreground) 5%, transparent)",
          }} />

          {/* Wall borders */}
          <div style={{
            position: "absolute", inset: 0,
            borderLeft: isCompleted
              ? `1.5px solid ${cylTealMix(50)}`
              : isActive
              ? `1.5px solid ${cylMgMix(60)}`
              : `1px solid color-mix(in oklab, var(--muted-foreground) 14%, transparent)`,
            borderRight: isCompleted
              ? `1.5px solid ${cylTealMix(28)}`
              : isActive
              ? `1.5px solid ${cylCyMix(38)}`
              : `1px solid color-mix(in oklab, var(--muted-foreground) 9%, transparent)`,
          }} />

          {/* ── ACTIVE: plasma core ── */}
          {isActive && (
            <>
              <div style={{
                position: "absolute", inset: "8% 14%", borderRadius: "35%",
                background: `linear-gradient(0deg, ${CYL_MAGENTA} 0%, ${CYL_CYAN} 45%, ${CYL_MAGENTA} 100%)`,
                backgroundSize: "100% 250%",
                animation: "cyl-plasma-flow 1.35s ease-in-out infinite",
                filter: "blur(7px)", opacity: 0.62,
              }} />
              <div style={{
                position: "absolute", inset: "22% 28%", borderRadius: "30%",
                background: `radial-gradient(ellipse, rgba(255,255,255,0.9) 0%, ${CYL_CYAN} 40%, transparent 70%)`,
                animation: "cyl-plasma-spark 0.85s ease-in-out infinite alternate",
                filter: "blur(3px)", opacity: 0.55,
              }} />
              <div style={{
                position: "absolute", inset: 0,
                backgroundImage: `repeating-linear-gradient(0deg, transparent, transparent 7px, ${cylCyMix(7)} 7px, ${cylCyMix(7)} 8px)`,
                opacity: 0.55,
                animation: "cyl-plasma-scan 2s linear infinite",
                backgroundSize: "100% 16px",
              }} />
              <div style={{
                position: "absolute", inset: "0%",
                background: `radial-gradient(ellipse at 50% 50%, ${cylCyMix(16)}, transparent 70%)`,
                animation: "cyl-plasma-bloom 1.6s ease-in-out infinite alternate",
              }} />
            </>
          )}

          {/* ── COMPLETED: inner teal glow bloom ── */}
          {isCompleted && (
            <div style={{
              position: "absolute", inset: "12% 18%", borderRadius: "30%",
              background: `radial-gradient(ellipse, ${cylTealMix(65)}, ${cylTealMix(22)}, transparent)`,
              animation: "cyl-glow-breathe 2.6s ease-in-out infinite",
              filter: "blur(5px)",
            }} />
          )}

          {/* Centre icon / number */}
          <div style={{
            position: "absolute", inset: 0,
            display: "flex", alignItems: "center", justifyContent: "center", zIndex: 4,
          }}>
            {isCompleted ? (
              <svg viewBox="0 0 14 14" width={14} height={14} fill="none"
                stroke={CYL_TEAL} strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"
                style={{ filter: `drop-shadow(0 0 5px ${CYL_TEAL}) drop-shadow(0 0 10px ${cylTealMix(60)})` }}>
                <polyline points="2.5,7 5.5,10.5 11.5,3.5" />
              </svg>
            ) : isActive ? (
              <span style={{
                fontSize: 18, fontWeight: 900, color: "white", lineHeight: 1,
                animation: "cyl-plasma-num 1.4s ease-in-out infinite alternate",
                letterSpacing: "-0.02em",
              }}>
                {stepNum}
              </span>
            ) : (
              <span style={{
                fontSize: 11, fontWeight: 700, lineHeight: 1,
                color: "color-mix(in oklab, var(--muted-foreground) 32%, transparent)",
              }}>
                {stepNum}
              </span>
            )}
          </div>
        </div>

        {/* ── BOTTOM CAP ── */}
        <div style={{
          position: "absolute", bottom: 0, left: 0, right: 0,
          height: EH * 2, borderRadius: "50%", zIndex: 1,
          background: capBotBg, border: capBotBorder, boxShadow: capBotShadow,
        }} />

        {/* Base floor glow */}
        {(isCompleted || isActive) && (
          <div style={{
            position: "absolute", bottom: -10, left: "5%", right: "5%",
            height: 10, borderRadius: "50%",
            background: isCompleted
              ? `radial-gradient(ellipse, ${cylTealMix(55)}, transparent)`
              : `radial-gradient(ellipse, ${cylMgMix(65)}, transparent)`,
            filter: "blur(5px)",
            animation: isActive ? "cyl-base-pulse 1.2s ease-in-out infinite" : "cyl-glow-breathe 2.6s ease-in-out infinite",
            zIndex: 0,
          }} />
        )}
      </div>

      {/* Bottom badge */}
      <div style={{ display: "flex", flexDirection: "column", alignItems: "center", gap: 3 }}>
        <div style={{
          display: "flex", alignItems: "center", justifyContent: "center",
          width: 18, height: 18, borderRadius: "50%",
          border: badgeBorder, background: badgeBg, boxShadow: badgeShadow,
          fontSize: 8, fontWeight: 800, color: badgeColor,
        }}>
          {isCompleted ? (
            <svg viewBox="0 0 10 10" width={8} height={8} fill="none"
              stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round">
              <polyline points="1.5,5 4,8 8.5,2" />
            </svg>
          ) : stepNum}
        </div>
        <span style={{
          fontSize: 7, fontWeight: 700, letterSpacing: "0.07em", textTransform: "uppercase",
          color: isCompleted ? cylTealMix(58) : isActive ? cylCyMix(82) : "color-mix(in oklab, var(--muted-foreground) 28%, transparent)",
          textShadow: isActive ? `0 0 7px ${cylCyMix(70)}` : "none",
        }}>
          {isCompleted ? "done" : isActive ? "active" : `step ${stepNum}`}
        </span>
      </div>
    </div>
  );
}

function CylinderRow({ step, total }: { step: number; total: number }) {
  return (
    <>
      <style>{`
        @keyframes cyl-plasma-flow {
          0%   { background-position: 50% 110%; }
          50%  { background-position: 50% -10%; }
          100% { background-position: 50% 110%; }
        }
        @keyframes cyl-plasma-spark {
          from { opacity: 0.28; transform: scale(0.78); }
          to   { opacity: 0.60; transform: scale(1.12); }
        }
        @keyframes cyl-plasma-scan {
          from { background-position: 0 0; }
          to   { background-position: 0 16px; }
        }
        @keyframes cyl-plasma-bloom {
          from { opacity: 0.4; }
          to   { opacity: 0.9; }
        }
        @keyframes cyl-plasma-num {
          from { text-shadow: 0 0 8px #00e5ff, 0 0 20px #e040fb; opacity: 0.88; }
          to   { text-shadow: 0 0 18px #00e5ff, 0 0 38px #e040fb, 0 0 55px #00e5ff; opacity: 1; }
        }
        @keyframes cyl-now-pulse {
          0%, 100% { opacity: 0.68; letter-spacing: 0.22em; }
          50%       { opacity: 1;   letter-spacing: 0.28em;
                      text-shadow: 0 0 10px #00e5ff, 0 0 22px #e040fb; }
        }
        @keyframes cyl-ring-cw  { to { transform: rotate(360deg);  } }
        @keyframes cyl-ring-ccw { to { transform: rotate(-360deg); } }
        @keyframes cyl-glow-breathe {
          0%, 100% { opacity: 0.45; }
          50%       { opacity: 0.88; }
        }
        @keyframes cyl-base-pulse {
          0%, 100% { opacity: 0.38; transform: scaleX(0.88); }
          50%       { opacity: 0.88; transform: scaleX(1.14); }
        }
      `}</style>
      <div style={{ position: "relative", padding: "20px 4px 8px" }}>
        {/* Recessed platform base */}
        <div style={{
          position: "absolute", bottom: 28, left: "4%", right: "4%",
          height: 3, borderRadius: 2,
          background: "color-mix(in oklab, var(--muted-foreground) 7%, transparent)",
          backdropFilter: "blur(4px)",
        }} />
        <div style={{
          display: "flex", alignItems: "flex-end", justifyContent: "center",
          gap: 12, flexWrap: "wrap",
        }}>
          {Array.from({ length: total }).map((_, i) => {
            const state: CylState =
              i < step - 1 ? "completed" : i === step - 1 ? "active" : "pending";
            return <CyberCylinder key={i} stepNum={i + 1} state={state} />;
          })}
        </div>
      </div>
    </>
  );
}

/* ─────────────────────────────────────────────────────────────────────────────
   END CYBER CYLINDER — everything below is unchanged from original
───────────────────────────────────────────────────────────────────────────── */

interface DcaData {
  dca_step?: number;
  dca_total_steps?: number;
  status?: string;
  dca_step_amounts?: number[];
  dca_step_timestamps?: number[];
}

function useDcaData() {
  const [data, setData] = useState<DcaData | null>(null);
  useEffect(() => {
    let alive = true;
    let timer: ReturnType<typeof setTimeout>;
    async function poll() {
      try {
        const r = await fetch(`${API_BASE}/api/bot/data?key=dca`);
        if (r.ok) {
          const json = await r.json();
          if (alive && json?.data) setData(json.data as DcaData);
        }
      } catch {}
      timer = setTimeout(poll, 3000);
    }
    poll();
    return () => { alive = false; clearTimeout(timer); };
  }, []);
  return data;
}

/** Remembers the last active symbol in localStorage so we can fetch its
 *  trade history even after the order is no longer open. */
const LAST_SYMBOL_KEY = "dashboard_last_order_symbol";

interface LastTrade {
  symbol: string;
  base: string;
  price: number;
  qty: number;
  quoteQty: number;
  time: number; // unix ms
}

function useLastTrade(activeSymbol: string | undefined): LastTrade | null {
  // Keep storedSymbol in state so React re-renders when it changes
  const [storedSymbol, setStoredSymbol] = useState<string | undefined>(
    () => localStorage.getItem(LAST_SYMBOL_KEY) ?? undefined,
  );

  // Persist the last seen active symbol — update both localStorage AND state
  useEffect(() => {
    if (activeSymbol) {
      localStorage.setItem(LAST_SYMBOL_KEY, activeSymbol);
      setStoredSymbol(activeSymbol);
    }
  }, [activeSymbol]);

  // Only query when there is NO active trade
  const querySymbol = activeSymbol ? undefined : storedSymbol;

  const tradesQuery = useQuery({
    queryKey: ["lastTrades", querySymbol],
    queryFn: () => getMyTrades({ data: { symbol: querySymbol!, limit: 200 } }),
    enabled: !!querySymbol,
    staleTime: 0,
    refetchOnWindowFocus: true,
  });

  return useMemo(() => {
    if (!tradesQuery.data || tradesQuery.data.length === 0 || !querySymbol) return null;
    // Find the most recent SELL trade (trade where isBuyer === false means we sold)
    const sells = tradesQuery.data.filter((t) => !t.isBuyer);
    if (sells.length === 0) return null;
    const latest = sells.reduce((a, b) => (b.time > a.time ? b : a));
    const base = querySymbol.replace(/USDT$|BUSD$|FDUSD$|BTC$|ETH$/, "");
    return {
      symbol: querySymbol,
      base,
      price: parseFloat(latest.price),
      qty: parseFloat(latest.qty),
      quoteQty: parseFloat(latest.quoteQty ?? "0"),
      time: latest.time,
    };
  }, [tradesQuery.data, querySymbol]);
}

function useAnimatedBalance(target: number) {
  const [display, setDisplay] = useState(target);
  const [direction, setDirection] = useState<"up" | "down" | null>(null);
  const [delta, setDelta] = useState<number | null>(null);
  const [changeKey, setChangeKey] = useState(0);
  const prevRef = useRef(target);
  const rafRef = useRef<number | null>(null);
  const dirTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    const prev = prevRef.current;
    if (Math.abs(target - prev) < 0.001) return;
    const diff = target - prev;
    prevRef.current = target;

    setDirection(diff > 0 ? "up" : "down");
    setDelta(diff);
    setChangeKey((k) => k + 1);

    if (dirTimerRef.current) clearTimeout(dirTimerRef.current);
    dirTimerRef.current = setTimeout(() => {
      setDirection(null);
      setDelta(null);
    }, 2000);

    const DURATION = 950;
    const startTime = performance.now();
    const startVal = prev;

    const animate = (now: number) => {
      const elapsed = now - startTime;
      const t = Math.min(elapsed / DURATION, 1);
      const eased = 1 - Math.pow(1 - t, 4);
      setDisplay(startVal + diff * eased);
      if (t < 1) {
        rafRef.current = requestAnimationFrame(animate);
      } else {
        setDisplay(target);
      }
    };

    if (rafRef.current) cancelAnimationFrame(rafRef.current);
    rafRef.current = requestAnimationFrame(animate);

    return () => { if (rafRef.current) cancelAnimationFrame(rafRef.current); };
  }, [target]);

  return { display, direction, delta, changeKey };
}

export default function Dashboard() {
  const account = useQuery({ queryKey: ["account"], queryFn: () => getAccount(), refetchInterval: 15_000 });
  const orders = useQuery({ queryKey: ["openOrders"], queryFn: () => getOpenOrders(), refetchInterval: 8_000 });
  const prices = useQuery({ queryKey: ["prices"], queryFn: () => getAllPrices(), refetchInterval: 5_000 });
  const dcaData = useDcaData();

  const allOrders = orders.data ?? [];
  const primary = allOrders[0];
  const sameSymbol = allOrders.filter((o) => o.symbol === primary?.symbol);
  const tpOrder = sameSymbol.find((o) => parseFloat(o.stopPrice || "0") === 0) ?? primary;
  const slOrder = sameSymbol.find((o) => parseFloat(o.stopPrice || "0") > 0);
  const orderSymbol = primary?.symbol;
  const orderBase = orderSymbol?.replace(/USDT$|BUSD$|FDUSD$|BTC$|ETH$/, "") || "";

  const trades = useQuery({
    queryKey: ["trades", orderSymbol],
    queryFn: () => getMyTrades({ data: { symbol: orderSymbol!, limit: 200 } }),
    enabled: !!orderSymbol,
    refetchInterval: 60_000,
  });

  // Last closed trade — shown when no active order
  const lastTrade = useLastTrade(orderSymbol);

  const avgEntry = useMemo(() => {
    if (!trades.data || trades.data.length === 0) return 0;
    let cost = 0, qty = 0;
    for (const t of trades.data) {
      const p = parseFloat(t.price), q = parseFloat(t.qty);
      if (t.isBuyer) { cost += p * q; qty += q; }
      else if (qty > 0) {
        const ratio = Math.min(q, qty) / qty;
        cost = cost * (1 - ratio);
        qty -= Math.min(q, qty);
      }
    }
    return qty > 0 ? cost / qty : 0;
  }, [trades.data]);

  const [livePrice, setLivePrice] = useState<number | undefined>();
  const [flash, setFlash] = useState<"up" | "down" | null>(null);
  useEffect(() => {
    setLivePrice(undefined);
    if (!orderSymbol) return;
    const ws = new WebSocket(`wss://data-stream.binance.vision/ws/${orderSymbol.toLowerCase()}@trade`);
    ws.onmessage = (e) => {
      try {
        const d = JSON.parse(e.data);
        const p = parseFloat(d.p);
        setLivePrice((prev) => { if (prev !== undefined && p !== prev) setFlash(p > prev ? "up" : "down"); return p; });
      } catch {}
    };
    return () => ws.close();
  }, [orderSymbol]);
  useEffect(() => {
    if (!flash) return;
    const t = setTimeout(() => setFlash(null), 500);
    return () => clearTimeout(t);
  }, [flash]);

  const [chartSymbol, setChartSymbol] = useState<string>("BTCUSDT");
  useEffect(() => {
    if (orderSymbol) setChartSymbol(orderSymbol);
    else setChartSymbol("BTCUSDT");
  }, [orderSymbol]);

  const allAssets = useMemo(() => {
    if (!account.data || !prices.data) return [];
    return account.data.balances.map((b) => {
      const total = b.free + b.locked;
      const usd = b.asset === "USDT" ? total : total * (prices.data?.[`${b.asset}USDT`] ?? 0);
      return { ...b, total, usd };
    });
  }, [account.data, prices.data]);

  const walletAssets = useMemo(
    () => allAssets.filter((b) => b.usd >= 2).sort((a, b) => b.usd - a.usd),
    [allAssets],
  );

  const totalUsdt = allAssets.reduce((s, a) => s + a.usd, 0);
  const { display: animatedTotal, direction: balanceDir, delta: balanceDelta, changeKey: balanceKey } = useAnimatedBalance(totalUsdt);

  const tpPrice = tpOrder ? parseFloat(tpOrder.price) : 0;
  const slPrice = slOrder ? (parseFloat(slOrder.stopPrice) || parseFloat(slOrder.price)) : 0;
  const orderQty = primary ? parseFloat(primary.origQty) : 0;
  const entry = avgEntry > 0 ? avgEntry : (primary ? parseFloat(primary.price) : 0);
  const side = primary?.side ?? "";
  const dirMult = side === "SELL" ? 1 : 1;
  const cur = livePrice ?? (orderSymbol ? prices.data?.[orderSymbol] : undefined);

  const pnlPct = cur && entry ? ((cur - entry) / entry) * 100 * dirMult : 0;
  const pnlUsd = cur && entry ? (cur - entry) * orderQty * dirMult : 0;
  const targetPct = tpPrice && entry ? ((tpPrice - entry) / entry) * 100 : 0;
  const stopPct = slPrice && entry ? ((slPrice - entry) / entry) * 100 : 0;
  const distToTpPct = cur && tpPrice ? ((tpPrice - cur) / cur) * 100 : 0;
  const distToSlPct = cur && slPrice ? ((cur - slPrice) / cur) * 100 : 0;

  // ── FIXED BAR CALCULATIONS ──────────────────────────────────────────────────
  const tpProgress =
    cur && tpPrice && entry && tpPrice !== entry
      ? Math.max(0, Math.min(1, (cur - entry) / (tpPrice - entry)))
      : 0;

  const slProgress =
    cur && slPrice && entry && entry !== slPrice
      ? Math.max(0, Math.min(1, (entry - cur) / (entry - slPrice)))
      : 0;
  // ───────────────────────────────────────────────────────────────────────────

  const dcaStep       = dcaData?.dca_step ?? 0;
  const dcaTotal      = dcaData?.dca_total_steps ?? 6;
  const dcaAmounts    = dcaData?.dca_step_amounts;
  const dcaTimestamps = dcaData?.dca_step_timestamps;
  const showDca = !!primary && dcaStep > 0 && dcaData?.status !== "COMPLETED";

  const chartLines = useMemo(() => {
    const out: Array<{ price: number; label: string; color: string }> = [];
    if (orderSymbol && chartSymbol === orderSymbol) {
      if (entry > 0) out.push({ price: entry, label: `Entry ${fmtPrice(entry)}`, color: "#a3b1c2" });
      if (tpPrice > 0) out.push({ price: tpPrice, label: `TP ${fmtPrice(tpPrice)}`, color: "#10b981" });
      if (slPrice > 0) out.push({ price: slPrice, label: `SL ${fmtPrice(slPrice)}`, color: "#ef4444" });
    }
    return out;
  }, [orderSymbol, chartSymbol, entry, tpPrice, slPrice]);

  return (
    <AppLayout>
      <div className="space-y-5">

        {/* ── WALLET CARD — premium futuristic redesign ── */}
        <section
          className="rounded-2xl relative overflow-hidden"
          style={{
            background: "transparent",
            border: "1px solid oklch(0.78 0.07 200 / 22%)",
            backdropFilter: "blur(32px) saturate(180%)",
            WebkitBackdropFilter: "blur(32px) saturate(180%)",
          }}
        >

          <div className="relative p-5 md:p-6">
            {/* ── Header row ── */}
            <div className="flex items-center justify-between">
              <div
                className="flex items-center gap-2 text-[11px] uppercase tracking-[0.18em] font-bold"
                style={{ color: "color-mix(in oklab, var(--primary) 80%, var(--muted-foreground))" }}
              >
                {/* Pulsing status dot */}
                <span
                  className="h-2 w-2 rounded-full bg-primary animate-pulse shrink-0"
                  style={{ boxShadow: "0 0 6px 2px color-mix(in oklab, var(--primary) 55%, transparent)" }}
                />
                <WalletIcon className="h-3.5 w-3.5 shrink-0" />
                Wallet
              </div>

            </div>

            {/* ── Balance amount ── */}
            <div className="mt-4">
              <style>{`
                .bal-text {
                  display: inline-block;
                  background-image: linear-gradient(140deg, #f8fafc 0%, var(--primary) 55%, #94d9f5 100%);
                  -webkit-background-clip: text;
                  background-clip: text;
                  -webkit-text-fill-color: transparent;
                  color: transparent;
                }
                @keyframes bal-glow-up {
                  0%   { box-shadow: 0 0 0px 0px rgba(16,185,129,0); }
                  20%  { box-shadow: 0 0 52px 14px rgba(16,185,129,0.42); }
                  100% { box-shadow: 0 0 0px 0px rgba(16,185,129,0); opacity: 0; }
                }
                @keyframes bal-glow-down {
                  0%   { box-shadow: 0 0 0px 0px rgba(239,68,68,0); }
                  20%  { box-shadow: 0 0 52px 14px rgba(239,68,68,0.42); }
                  100% { box-shadow: 0 0 0px 0px rgba(239,68,68,0); opacity: 0; }
                }
                @keyframes bal-shimmer {
                  0%   { transform: translateX(-130%) skewX(-16deg); opacity: 0; }
                  15%  { opacity: 0.65; }
                  85%  { opacity: 0.65; }
                  100% { transform: translateX(230%) skewX(-16deg); opacity: 0; }
                }
                @keyframes delta-rise {
                  0%   { transform: translateY(0px); opacity: 1; }
                  65%  { opacity: 1; }
                  100% { transform: translateY(-32px); opacity: 0; }
                }
                @keyframes bal-scale-pop {
                  0%   { transform: scale(1); }
                  14%  { transform: scale(1.022); }
                  100% { transform: scale(1); }
                }
                .bal-glow-up   { animation: bal-glow-up   2s ease-out forwards; }
                .bal-glow-down { animation: bal-glow-down 2s ease-out forwards; }
                .bal-shimmer   { animation: bal-shimmer   0.9s ease-in-out forwards; }
                .bal-scale-pop { animation: bal-scale-pop 0.6s cubic-bezier(0.22,1,0.36,1) forwards; }
                .delta-rise    { animation: delta-rise    2s ease-out forwards; }
              `}</style>
              <div className="flex items-start gap-2 relative">
                <div style={{ position: "relative", display: "inline-block" }}>

                  {/* Glow halo — box-shadow on a sibling, never touches the text */}
                  {balanceDir && (
                    <div
                      key={`glow-${balanceKey}`}
                      className={balanceDir === "up" ? "bal-glow-up" : "bal-glow-down"}
                      style={{ position: "absolute", inset: "-4px", borderRadius: "12px", pointerEvents: "none" }}
                    />
                  )}

                  {/* Scale wrapper — transform-only, safe alongside background-clip:text */}
                  <div
                    key={`scale-${balanceKey}`}
                    className={balanceDir ? "bal-scale-pop" : ""}
                    style={{ display: "inline-block", position: "relative" }}
                  >
                    {/* Gradient text via CSS class — NOT inline styles, avoids React serialisation bugs */}
                    <span className="bal-text text-5xl md:text-7xl font-black tracking-tight leading-none tabular-nums">
                      {account.isLoading ? "…" : `$${fmt(animatedTotal)}`}
                    </span>

                    {/* Shimmer sweep */}
                    {balanceDir && (
                      <div
                        key={`shimmer-${balanceKey}`}
                        className="bal-shimmer"
                        style={{
                          position: "absolute", inset: 0, width: "32%", borderRadius: "4px", pointerEvents: "none",
                          background: `linear-gradient(90deg, transparent, ${balanceDir === "up" ? "rgba(16,185,129,0.2)" : "rgba(239,68,68,0.2)"}, transparent)`,
                        }}
                      />
                    )}
                  </div>
                </div>
              </div>
            </div>



            {/* ── Coin asset cards ── */}
            {walletAssets.length > 0 && (
              <div
                className="mt-3 flex gap-2 overflow-x-auto pb-1 -mx-1 px-1"
                style={{ scrollbarWidth: "none", msOverflowStyle: "none" } as React.CSSProperties}
              >
                {walletAssets.slice(0, 10).map((b, i) => {
                  const pct = totalUsdt > 0 ? (b.usd / totalUsdt) * 100 : 0;
                  const accentColor = SPECTRUM_COLORS[i % SPECTRUM_COLORS.length];

                  return (
                    <div
                      key={b.asset}
                      className="shrink-0 flex items-center gap-1.5 rounded-lg relative overflow-hidden cursor-default"
                      style={{
                        padding: "5px 8px",
                        background: "oklch(0.55 0.06 210 / 10%)",
                        border: `1px solid ${accentColor}28`,
                        backdropFilter: "blur(10px)",
                        WebkitBackdropFilter: "blur(10px)",
                        transition: "border-color 0.2s, box-shadow 0.2s",
                      }}
                      onMouseEnter={(e) => {
                        (e.currentTarget as HTMLDivElement).style.borderColor = `${accentColor}55`;
                        (e.currentTarget as HTMLDivElement).style.boxShadow = `0 0 12px -4px ${accentColor}40`;
                      }}
                      onMouseLeave={(e) => {
                        (e.currentTarget as HTMLDivElement).style.borderColor = `${accentColor}28`;
                        (e.currentTarget as HTMLDivElement).style.boxShadow = "none";
                      }}
                    >
                      {/* Accent left bar */}
                      <div
                        className="absolute inset-y-0 left-0 w-[2px]"
                        style={{ background: accentColor, opacity: 0.7 }}
                      />

                      <CoinIcon symbol={b.asset} size={16} />

                      <span className="text-[10px] font-black tracking-tight truncate" style={{ maxWidth: "48px" }}>
                        {b.asset}
                      </span>

                      <span
                        className="text-[9px] font-bold tabular-nums"
                        style={{ color: "oklch(0.82 0.01 200)" }}
                      >
                        ${fmt(b.usd, 2)}
                      </span>
                    </div>
                  );
                })}
              </div>
            )}
          </div>
        </section>

        {/* ── ACTIVE TRADE ── */}
        <section className={`rounded-2xl border bg-transparent p-5 md:p-6 relative overflow-hidden transition-shadow ${primary ? "border-primary/30 shadow-[0_0_60px_-20px_rgba(94,234,212,0.55)]" : "border-border"}`}>
          {primary ? (
            <>
              <div className="pointer-events-none absolute inset-x-0 top-0 h-px bg-gradient-to-r from-transparent via-primary/70 to-transparent" />
              <div className="relative flex items-center justify-between gap-3 flex-wrap">
                <div className="flex items-center gap-3 min-w-0">
                  <div className="relative">
                    <CoinIcon symbol={orderBase} size={52} className="ring-2 ring-primary/40" />
                    <span className="absolute -inset-1 rounded-full ring-2 ring-primary/40 animate-ping opacity-30" />
                  </div>
                  <div className="min-w-0">
                    <div className="flex items-center gap-2 flex-wrap">
                      <h2 className="text-xl md:text-2xl font-black truncate">{primary.symbol}</h2>
                    </div>
                    <div className="mt-1 flex items-center gap-1.5">
                      <span className="text-[10px] font-bold px-2 py-0.5 rounded-md bg-primary/15 text-primary uppercase tracking-wider">{primary.type}</span>
                      <span className={`text-[10px] font-bold px-2 py-0.5 rounded-md uppercase tracking-wider ${primary.side === "SELL" ? "bg-bear/15 text-bear" : "bg-bull/15 text-bull"}`}>{primary.side}</span>
                    </div>
                  </div>
                </div>
                <div className="text-right shrink-0">
                  <div className={`text-[1.2rem] md:text-[1.8rem] font-black tabular-nums ${pnlUsd >= 0 ? "text-bull" : "text-bear"}`}>
                    {pnlUsd >= 0 ? "+" : ""}${pnlUsd.toFixed(2)}
                  </div>
                  <div className={`text-xs font-bold ${pnlPct >= 0 ? "text-bull" : "text-bear"}`}>
                    {pnlPct >= 0 ? "▲" : "▼"} {Math.abs(pnlPct).toFixed(2)}%
                  </div>
                </div>
              </div>

              <div className={`relative mt-5 rounded-xl border bg-gradient-to-r from-primary/5 to-transparent px-4 py-3 flex items-center justify-between transition-all duration-300 ${flash === "up" ? "border-bull/60 bg-bull/10" : flash === "down" ? "border-bear/60 bg-bear/10" : "border-border"}`}>
                <span className="text-[10px] uppercase tracking-widest font-bold text-muted-foreground flex items-center gap-1.5">
                  <Activity className="h-3 w-3" /> Live price
                </span>
                <span className={`text-[1.95rem] md:text-[2.4375rem] font-black tabular-nums transition-colors ${flash === "up" ? "text-bull" : flash === "down" ? "text-bear" : ""}`}>
                  ${cur ? fmtPrice(cur) : "…"}
                </span>
              </div>

              {/* ── DCA STEP — now uses CylinderRow ── */}
              {showDca && (
                <div
                  className="relative mt-4 rounded-xl overflow-hidden px-4 py-4"
                  style={{
                    background: "linear-gradient(135deg, color-mix(in oklab,var(--primary) 8%,var(--card)) 0%, color-mix(in oklab,var(--primary) 4%,var(--card)) 100%)",
                    border: "1px solid color-mix(in oklab,var(--primary) 28%,transparent)",
                    boxShadow: "inset 0 1px 0 color-mix(in oklab,var(--primary) 20%,transparent), 0 0 20px -8px color-mix(in oklab,var(--primary) 30%,transparent)",
                  }}
                >
                  <div
                    className="absolute inset-x-0 top-0 h-px pointer-events-none"
                    style={{ background: "linear-gradient(90deg, transparent, color-mix(in oklab,var(--primary) 60%,transparent), transparent)" }}
                  />
                  <div
                    className="absolute -top-4 -left-4 w-24 h-24 rounded-full pointer-events-none"
                    style={{ background: "radial-gradient(circle, color-mix(in oklab,var(--primary) 12%,transparent), transparent 70%)" }}
                  />

                  <div className="relative flex items-center justify-between mb-3">
                    <div className="flex items-center gap-1.5">
                      <Layers className="h-3.5 w-3.5" style={{ color: "var(--primary)" }} />
                      <span className="text-[10px] uppercase tracking-widest font-bold" style={{ color: "color-mix(in oklab,var(--primary) 80%,var(--muted-foreground))" }}>
                        DCA Step
                      </span>
                    </div>
                    <div className="flex items-baseline gap-1">
                      <span
                        className="text-2xl font-black tabular-nums leading-none"
                        style={{
                          color: "var(--primary)",
                          textShadow: "0 0 16px color-mix(in oklab,var(--primary) 70%,transparent)",
                          letterSpacing: "-0.02em",
                        }}
                      >
                        {dcaStep}
                      </span>
                      <span
                        className="text-base font-black leading-none"
                        style={{ color: "color-mix(in oklab,var(--muted-foreground) 50%,transparent)" }}
                      >
                        /{dcaTotal}
                      </span>
                    </div>
                  </div>

                  <CylinderRow step={dcaStep} total={dcaTotal} />
                </div>
              )}

              <div className="relative mt-4 grid sm:grid-cols-2 gap-3">
                <ProgressTrack icon={<Target className="h-3.5 w-3.5" />} label="TAKE PROFIT"
                  fromLabel={`Entry $${fmtPrice(entry)}`} toLabel={tpPrice ? `TP $${fmtPrice(tpPrice)}` : "—"}
                  pct={tpProgress} rightValue={tpPrice ? `${targetPct >= 0 ? "+" : ""}${targetPct.toFixed(2)}%` : "—"}
                  hint={tpPrice && cur ? `${distToTpPct >= 0 ? "+" : ""}${distToTpPct.toFixed(2)}% to TP` : ""} color="bull" />
                <ProgressTrack icon={<Shield className="h-3.5 w-3.5" />} label="Stop loss"
                  fromLabel={`Entry $${fmtPrice(entry)}`} toLabel={slPrice ? `SL $${fmtPrice(slPrice)}` : "—"}
                  pct={slProgress} rightValue={slPrice ? `${stopPct.toFixed(2)}%` : "—"}
                  hint={slPrice && cur ? `${distToSlPct.toFixed(2)}% buffer` : ""} color="bear" />
              </div>

              <div className="relative mt-4 grid grid-cols-2 md:grid-cols-4 gap-2 text-xs">
                <Cell label="Entry (avg)" value={`$${fmtPrice(entry)}`} />
                <Cell label="Qty" value={`${fmt(orderQty, 4)} ${orderBase}`} />
                <Cell label="Take Profit" value={tpPrice ? `$${fmtPrice(tpPrice)}` : "—"} accent />
                <Cell label="Stop Loss" value={slPrice ? `$${fmtPrice(slPrice)}` : "—"} danger />
              </div>
            </>
          ) : (
            /* ── NO ACTIVE TRADE — show last closed trade ── */
            <NoActiveTrade lastTrade={lastTrade} />
          )}
        </section>

        <BtcCrashCard />

        <PumpScannerCard />

        <PriceChart symbol={chartSymbol} interval="1m" height={500} searchable onSymbolChange={setChartSymbol} priceLines={chartLines} />
      </div>
    </AppLayout>
  );
}

/* ─────────────────────────────────────────────────────────────────────────────
   NoActiveTrade — renders last closed trade info, or a generic placeholder
   when no trade history is available yet.
───────────────────────────────────────────────────────────────────────────── */
function NoActiveTrade({ lastTrade }: { lastTrade: LastTrade | null }) {
  if (!lastTrade) {
    return (
      <div className="py-10 text-center">
        <TrendingUp className="h-10 w-10 mx-auto text-muted-foreground/40" />
        <h2 className="mt-3 text-xl font-black">No Active Trade</h2>
        <p className="text-sm text-muted-foreground mt-1">Place a limit or OCO order on Binance and it will appear here.</p>
      </div>
    );
  }

  const { date, time } = fmtUAE(lastTrade.time);

  return (
    <div className="py-6">
      {/* Header label */}
      <div className="flex items-center gap-2 text-[10px] uppercase tracking-widest font-bold text-muted-foreground mb-5">
        <span className="h-1.5 w-1.5 rounded-full bg-muted-foreground/50" />
        Last Closed Trade
      </div>

      {/* Coin row */}
      <div className="flex items-center gap-4">
        {/* Coin logo */}
        <div className="relative shrink-0">
          <div className="absolute inset-0 rounded-full bg-muted/40 blur-md scale-110" />
          <CoinIcon symbol={lastTrade.base} size={56} className="relative" />
        </div>

        {/* Coin name + symbol */}
        <div className="min-w-0 flex-1">
          <div className="text-2xl md:text-3xl font-black tracking-tight truncate">
            {lastTrade.base}
            <span className="text-sm font-semibold text-muted-foreground ml-1.5">/ USDT</span>
          </div>
          <div className="text-xs text-muted-foreground mt-0.5 font-medium truncate">
            Sold · ${fmtPrice(lastTrade.price)}
            {lastTrade.quoteQty > 0 && (
              <span className="ml-2 text-muted-foreground/60">≈ ${fmt(lastTrade.quoteQty)}</span>
            )}
          </div>
        </div>

        {/* Sold badge */}
        <span className="shrink-0 text-[10px] font-bold px-2.5 py-1 rounded-lg bg-bear/10 text-bear border border-bear/20 uppercase tracking-wider">
          Sold
        </span>
      </div>

      {/* Date & time row */}
      <div className="mt-5 flex items-center gap-3 rounded-xl border border-border bg-muted/20 px-4 py-3">
        <Clock className="h-4 w-4 text-muted-foreground shrink-0" />
        <div className="flex flex-wrap gap-x-4 gap-y-1 text-sm font-semibold tabular-nums">
          <span>{date}</span>
          <span className="text-muted-foreground">{time} <span className="text-[10px] font-bold uppercase tracking-widest ml-0.5">UAE</span></span>
        </div>
      </div>
    </div>
  );
}

function Cell({ label, value, accent, danger }: { label: string; value: string; accent?: boolean; danger?: boolean }) {
  return (
    <div className={`rounded-lg border px-3 py-2 ${danger ? "border-bear/30 bg-bear/10" : accent ? "border-bull/30 bg-bull/10" : "border-border bg-muted/30"}`}>
      <div className="text-[9px] uppercase tracking-widest font-bold text-muted-foreground">{label}</div>
      <div className={`text-sm font-black mt-0.5 truncate tabular-nums ${danger ? "text-bear" : accent ? "text-bull" : ""}`}>{value}</div>
    </div>
  );
}

function ProgressTrack({ icon, label, fromLabel, toLabel, pct, rightValue, hint, color }: {
  icon: React.ReactNode; label: string; fromLabel: string; toLabel: string;
  pct: number; rightValue: string; hint?: string; color: "bull" | "bear";
}) {
  const w = Math.max(2, Math.min(100, pct * 100));
  const isBull = color === "bull";

  // Animated counter — smoothly counts from old value to new value
  const [displayPct, setDisplayPct] = useState(w);
  const prevWRef = useRef(w);
  const timerRef = useRef<ReturnType<typeof setInterval> | null>(null);

  useEffect(() => {
    const start = prevWRef.current;
    const end = w;
    prevWRef.current = w;

    if (Math.abs(end - start) < 0.05) return;

    if (timerRef.current) clearInterval(timerRef.current);

    const STEPS = 28;
    const DURATION_MS = 700;
    let step = 0;

    timerRef.current = setInterval(() => {
      step++;
      // ease-out cubic
      const t = step / STEPS;
      const eased = 1 - Math.pow(1 - t, 3);
      const next = start + (end - start) * eased;
      setDisplayPct(next);
      if (step >= STEPS) {
        setDisplayPct(end);
        if (timerRef.current) clearInterval(timerRef.current);
      }
    }, DURATION_MS / STEPS);

    return () => { if (timerRef.current) clearInterval(timerRef.current); };
  }, [w]);

  // badge pops in when value changes
  const [popKey, setPopKey] = useState(0);
  const prevRounded = useRef(Math.round(w * 10));
  useEffect(() => {
    const next = Math.round(w * 10);
    if (next !== prevRounded.current) {
      prevRounded.current = next;
      setPopKey((k) => k + 1);
    }
  }, [w]);

  return (
    <div className="rounded-xl border border-border bg-muted/20 p-3 relative overflow-hidden">
      <style>{`
        @keyframes progress-glow-bull {
          0%, 100% {
            box-shadow:
              0 0 2px 0px color-mix(in oklab, var(--bull) 12%, transparent),
              0 0 4px 1px color-mix(in oklab, var(--bull) 5%, transparent);
          }
          50% {
            box-shadow:
              0 0 3px 1px color-mix(in oklab, var(--bull) 18%, transparent),
              0 0 6px 1px color-mix(in oklab, var(--bull) 8%, transparent);
          }
        }
        @keyframes progress-glow-bear {
          0%, 100% {
            box-shadow:
              0 0 2px 0px color-mix(in oklab, var(--bear) 12%, transparent),
              0 0 4px 1px color-mix(in oklab, var(--bear) 5%, transparent);
          }
          50% {
            box-shadow:
              0 0 3px 1px color-mix(in oklab, var(--bear) 18%, transparent),
              0 0 6px 1px color-mix(in oklab, var(--bear) 8%, transparent);
          }
        }
        @keyframes progress-shimmer {
          0%   { transform: translateX(-160%) skewX(-12deg); opacity: 0; }
          20%  { opacity: 0.6; }
          80%  { opacity: 0.6; }
          100% { transform: translateX(280%) skewX(-12deg); opacity: 0; }
        }
        @keyframes progress-tip-beat-bull {
          0%, 100% {
            transform: translateY(-50%) scale(1);
            box-shadow:
              0 0 2px 1px color-mix(in oklab, var(--bull) 20%, transparent),
              0 0 4px 1px color-mix(in oklab, var(--bull) 9%, transparent);
          }
          50% {
            transform: translateY(-50%) scale(1.15);
            box-shadow:
              0 0 3px 1px color-mix(in oklab, var(--bull) 28%, transparent),
              0 0 6px 2px color-mix(in oklab, var(--bull) 12%, transparent);
          }
        }
        @keyframes progress-tip-beat-bear {
          0%, 100% {
            transform: translateY(-50%) scale(1);
            box-shadow:
              0 0 2px 1px color-mix(in oklab, var(--bear) 20%, transparent),
              0 0 4px 1px color-mix(in oklab, var(--bear) 9%, transparent);
          }
          50% {
            transform: translateY(-50%) scale(1.15);
            box-shadow:
              0 0 3px 1px color-mix(in oklab, var(--bear) 28%, transparent),
              0 0 6px 2px color-mix(in oklab, var(--bear) 12%, transparent);
          }
        }
        @keyframes pct-badge-pop {
          0%   { transform: translateX(-50%) scale(0.75); opacity: 0; }
          60%  { transform: translateX(-50%) scale(1.12); opacity: 1; }
          100% { transform: translateX(-50%) scale(1);    opacity: 1; }
        }
        @keyframes pct-digit-up {
          0%   { transform: translateY(60%); opacity: 0; }
          100% { transform: translateY(0);   opacity: 1; }
        }
        .progress-bar-glow-bull { animation: progress-glow-bull 2s ease-in-out infinite; }
        .progress-bar-glow-bear { animation: progress-glow-bear 2s ease-in-out 0.4s infinite; }
        .progress-shimmer        { animation: progress-shimmer  2.4s ease-in-out infinite; }
        .progress-tip-bull       { animation: progress-tip-beat-bull 1.8s ease-in-out infinite; }
        .progress-tip-bear       { animation: progress-tip-beat-bear 1.8s ease-in-out 0.4s infinite; }
        .pct-badge-pop           { animation: pct-badge-pop 0.35s cubic-bezier(0.22,1,0.36,1) both; }
        .pct-digit-up            { animation: pct-digit-up 0.22s ease-out both; }
      `}</style>

      <div className="flex items-center justify-between text-[10px] uppercase tracking-widest font-bold text-muted-foreground">
        <span className="flex items-center gap-1.5">{icon}{label}</span>
        <span className={`text-sm font-black tabular-nums ${isBull ? "text-bull" : "text-bear"}`}>{rightValue}</span>
      </div>

      {/* Track — extra top padding to make room for the floating badge */}
      <div className="relative mt-5" style={{ paddingBottom: "2px" }}>
        <div className="relative h-2 rounded-full bg-muted/60" style={{ overflow: "visible" }}>

          {/* Filled bar */}
          <div
            className={`relative h-full rounded-full transition-[width] duration-700 overflow-hidden ${isBull ? "progress-bar-glow-bull" : "progress-bar-glow-bear"}`}
            style={{
              width: `${w}%`,
              background: isBull
                ? "linear-gradient(90deg, color-mix(in oklab, var(--bull) 55%, transparent) 0%, var(--bull) 100%)"
                : "linear-gradient(90deg, color-mix(in oklab, var(--bear) 55%, transparent) 0%, var(--bear) 100%)",
            }}
          >
            {/* Shimmer sweep */}
            <div
              className="progress-shimmer absolute inset-y-0 pointer-events-none"
              style={{
                width: "38%",
                background: "linear-gradient(90deg, transparent, rgba(255,255,255,0.42), transparent)",
                borderRadius: "999px",
              }}
            />
          </div>

          {/* Glowing tip dot */}
          {w > 3 && (
            <div
              className={isBull ? "progress-tip-bull" : "progress-tip-bear"}
              style={{
                position: "absolute",
                top: "50%",
                left: `calc(${w}% - 5px)`,
                width: "10px",
                height: "10px",
                borderRadius: "999px",
                background: isBull ? "var(--bull)" : "var(--bear)",
                zIndex: 10,
                pointerEvents: "none",
              }}
            />
          )}

          {/* ── Floating percentage badge above tip ── */}
          {w > 3 && (
            <div
              key={popKey}
              className="pct-badge-pop"
              style={{
                position: "absolute",
                top: "-26px",
                left: `${w}%`,
                transform: "translateX(-50%)",
                pointerEvents: "none",
                zIndex: 20,
              }}
            >
              {/* Badge pill */}
              <div
                style={{
                  display: "inline-flex",
                  alignItems: "center",
                  gap: "2px",
                  padding: "2px 6px",
                  borderRadius: "999px",
                  fontSize: "9px",
                  fontWeight: 900,
                  fontVariantNumeric: "tabular-nums",
                  letterSpacing: "0.01em",
                  lineHeight: 1,
                  whiteSpace: "nowrap",
                  background: isBull
                    ? "color-mix(in oklab, var(--bull) 18%, var(--card))"
                    : "color-mix(in oklab, var(--bear) 18%, var(--card))",
                  border: isBull
                    ? "1px solid color-mix(in oklab, var(--bull) 50%, transparent)"
                    : "1px solid color-mix(in oklab, var(--bear) 50%, transparent)",
                  color: isBull ? "var(--bull)" : "var(--bear)",
                  boxShadow: isBull
                    ? "0 0 2px 0px color-mix(in oklab, var(--bull) 10%, transparent)"
                    : "0 0 2px 0px color-mix(in oklab, var(--bear) 10%, transparent)",
                }}
              >
                <span key={`${popKey}-num`} className="pct-digit-up">
                  {displayPct.toFixed(1)}%
                </span>
              </div>
              {/* Connector line from badge to dot */}
              <div
                style={{
                  position: "absolute",
                  left: "50%",
                  transform: "translateX(-50%)",
                  top: "100%",
                  width: "1px",
                  height: "8px",
                  background: isBull
                    ? "linear-gradient(to bottom, color-mix(in oklab, var(--bull) 60%, transparent), transparent)"
                    : "linear-gradient(to bottom, color-mix(in oklab, var(--bear) 60%, transparent), transparent)",
                }}
              />
            </div>
          )}
        </div>
      </div>

      <div className="mt-2 flex items-center justify-between text-[10px] text-muted-foreground">
        <span className="truncate">{fromLabel}</span>
        <span className="truncate">{toLabel}</span>
      </div>
      {hint && <div className="mt-1 text-[10px] font-bold text-muted-foreground">{hint}</div>}
    </div>
  );
}
