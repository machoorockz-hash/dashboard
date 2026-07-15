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
// UAE Dirham is pegged to the US Dollar at a fixed rate
const AED_RATE = 3.669989119;

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
  // en-GB gives DD/MM/YYYY
  const date = dtf_date.format(d);
  // en-US h12 gives e.g. "08:04 AM" — lowercase it
  const time = dtf_time.format(d).toLowerCase();
  return { date, time };
}

function StepSegments({
  step,
  total,
  stepAmounts,
  stepTimestamps,
  skippedSteps,
}: {
  step: number;
  total: number;
  stepAmounts?: number[];
  stepTimestamps?: number[];
  skippedSteps?: number[];
}) {
  const [hoveredIdx, setHoveredIdx] = useState<number | null>(null);

  return (
    <>
      <style>{`
        @keyframes dca-node-breathe {
          0%, 100% {
            box-shadow:
              0 0 0 3px color-mix(in oklab, var(--primary) 15%, transparent),
              0 0 10px 2px color-mix(in oklab, var(--primary) 20%, transparent),
              0 0 22px 4px color-mix(in oklab, var(--primary) 10%, transparent);
          }
          50% {
            box-shadow:
              0 0 0 4px color-mix(in oklab, var(--primary) 25%, transparent),
              0 0 16px 4px color-mix(in oklab, var(--primary) 28%, transparent),
              0 0 32px 8px color-mix(in oklab, var(--primary) 12%, transparent);
          }
        }
        @keyframes dca-ring-spin {
          0%   { transform: rotate(0deg); }
          100% { transform: rotate(360deg); }
        }
        @keyframes dca-check-pop {
          0%   { transform: scale(0.4); opacity: 0; }
          60%  { transform: scale(1.15); opacity: 1; }
          100% { transform: scale(1); opacity: 1; }
        }
        @keyframes dca-tooltip-in {
          0%   { opacity: 0; transform: translateX(-50%) translateY(6px) scale(0.94); }
          100% { opacity: 1; transform: translateX(-50%) translateY(0px) scale(1); }
        }
        .dca-node-breathe { animation: dca-node-breathe 2.4s ease-in-out infinite; will-change: box-shadow; }
        .dca-check-pop    { animation: dca-check-pop    0.35s cubic-bezier(0.34,1.56,0.64,1) both; }
        .dca-tooltip-in   { animation: dca-tooltip-in   0.22s cubic-bezier(0.22,1,0.36,1) both; }
      `}</style>

      {/* Outer row — nodes + connectors; labels sit below each node */}
      <div style={{ display: "flex", alignItems: "flex-start", width: "100%" }}>
        {Array.from({ length: total }).map((_, i) => {
          const stepNumber = i + 1;
          const isSkipped  = !!skippedSteps?.includes(stepNumber);
          const filled    = i < step;
          const isActive  = i === step - 1;
          const isPast    = filled && !isActive && !isSkipped;
          const isLast    = i === total - 1;
          const isHovered = hoveredIdx === i;

          const nodeSize      = isActive ? 30 : (isPast || isSkipped) ? 22 : 20;
          const borderW       = isActive ? 2 : 1.5;
          const NODE_CONTAINER = 32; // fixed height so connector always centres correctly

          const statusLabel  = isSkipped ? "Skipped" : isPast ? "Done" : isActive ? "Active" : "Pending";
          const statusColor  = isSkipped ? "#ef4444" : isPast ? "#f59e0b" : isActive ? "var(--primary)" : "color-mix(in oklab,var(--muted-foreground) 55%,transparent)";
          const statusBg     = isSkipped ? "color-mix(in oklab,#ef4444 18%,var(--card))" : isPast ? "color-mix(in oklab,#f59e0b 18%,var(--card))" : isActive ? "color-mix(in oklab,var(--primary) 12%,var(--card))" : "color-mix(in oklab,var(--muted-foreground) 8%,var(--card))";
          const statusBorder = isSkipped ? "color-mix(in oklab,#ef4444 40%,transparent)" : isPast ? "color-mix(in oklab,#f59e0b 40%,transparent)" : isActive ? "color-mix(in oklab,var(--primary) 35%,transparent)" : "color-mix(in oklab,var(--muted-foreground) 18%,transparent)";

          const amount    = stepAmounts?.[i];
          const timestamp = stepTimestamps?.[i];
          const timeStr   = timestamp ? fmtUAE(timestamp) : null;

          return (
            <div
              key={i}
              style={{ display: "flex", alignItems: "flex-start", flex: isLast ? "0 0 auto" : 1 }}
            >
              {/* ── Node column: circle + USDT label stacked ── */}
              <div
                style={{ display: "flex", flexDirection: "column", alignItems: "center", gap: "5px", flexShrink: 0, position: "relative" }}
                onMouseEnter={() => setHoveredIdx(i)}
                onMouseLeave={() => setHoveredIdx(null)}
              >
                {/* ── Tooltip ── */}
                {isHovered && (
                  <div
                    className="dca-tooltip-in"
                    style={{
                      position: "absolute",
                      bottom: `calc(100% + 10px)`,
                      left: "50%",
                      zIndex: 50,
                      pointerEvents: "none",
                      minWidth: "110px",
                      maxWidth: "160px",
                    }}
                  >
                    <div style={{
                      background: "transparent",
                      backdropFilter: "blur(14px)",
                      WebkitBackdropFilter: "blur(14px)",
                      border: isSkipped ? `1px solid color-mix(in oklab,#ef4444 30%,transparent)` : isPast ? `1px solid color-mix(in oklab,#f59e0b 30%,transparent)` : `1px solid color-mix(in oklab,var(--primary) ${isActive ? "30%" : "14%"},transparent)`,
                      borderRadius: "10px",
                      padding: "8px 10px",
                      boxShadow: "0 8px 24px -4px rgba(0,0,0,0.45), 0 2px 8px -2px rgba(0,0,0,0.3)",
                    }}>
                      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: "8px" }}>
                        <span style={{ fontSize: "10px", fontWeight: 800, letterSpacing: "0.06em", textTransform: "uppercase", color: "var(--muted-foreground)" }}>
                          Step {i + 1}
                        </span>
                        <span style={{
                          fontSize: "8px", fontWeight: 800, letterSpacing: "0.05em", textTransform: "uppercase",
                          padding: "2px 6px", borderRadius: "999px", lineHeight: 1.4,
                          color: statusColor, background: statusBg, border: `1px solid ${statusBorder}`,
                          ...(isActive ? { filter: "drop-shadow(0 0 4px color-mix(in oklab,var(--primary) 60%,transparent))" } : {}),
                        }}>
                          {statusLabel}
                        </span>
                      </div>
                      <div style={{ margin: "6px 0", height: "1px", background: isSkipped ? `linear-gradient(90deg,transparent,color-mix(in oklab,#ef4444 25%,transparent),transparent)` : isPast ? `linear-gradient(90deg,transparent,color-mix(in oklab,#f59e0b 25%,transparent),transparent)` : `linear-gradient(90deg,transparent,color-mix(in oklab,var(--primary) ${isActive ? "25%" : "10%"},transparent),transparent)` }} />
                      {amount != null ? (
                        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: "6px" }}>
                          <span style={{ fontSize: "9px", color: "color-mix(in oklab,var(--muted-foreground) 70%,transparent)", fontWeight: 600 }}>Buy</span>
                          <span style={{ fontSize: "11px", fontWeight: 900, fontVariantNumeric: "tabular-nums", letterSpacing: "-0.01em", color: isActive ? "var(--primary)" : isPast ? "var(--foreground)" : "color-mix(in oklab,var(--muted-foreground) 60%,transparent)" }}>
                            ${fmt(amount, 2)}
                          </span>
                        </div>
                      ) : (
                        <div style={{ display: "flex", gap: "5px" }}>
                          <span style={{ display: "inline-block", width: "32px", height: "5px", borderRadius: "999px", background: "color-mix(in oklab,var(--muted-foreground) 12%,transparent)" }} />
                          <span style={{ display: "inline-block", width: "20px", height: "5px", borderRadius: "999px", background: "color-mix(in oklab,var(--muted-foreground) 7%,transparent)" }} />
                        </div>
                      )}
                      {timeStr && (
                        <div style={{ marginTop: "4px", fontSize: "9px", fontVariantNumeric: "tabular-nums", color: "color-mix(in oklab,var(--muted-foreground) 55%,transparent)", fontWeight: 500 }}>
                          {timeStr.date} · {timeStr.time}
                        </div>
                      )}
                    </div>
                    {/* Arrow */}
                    <div style={{
                      position: "absolute", bottom: "-5px", left: "50%",
                      transform: "translateX(-50%) rotate(45deg)",
                      width: "9px", height: "9px",
                      background: "transparent",
                      backdropFilter: "blur(14px)",
                      border: isSkipped ? `1px solid color-mix(in oklab,#ef4444 30%,transparent)` : isPast ? `1px solid color-mix(in oklab,#f59e0b 30%,transparent)` : `1px solid color-mix(in oklab,var(--primary) ${isActive ? "30%" : "14%"},transparent)`,
                      borderTop: "none", borderLeft: "none",
                    }} />
                  </div>
                )}

                {/* ── Fixed-height node container so connector always aligns ── */}
                <div style={{ width: `${NODE_CONTAINER}px`, height: `${NODE_CONTAINER}px`, display: "flex", alignItems: "center", justifyContent: "center", position: "relative" }}>
                  <div
                    className={isActive ? "dca-node-breathe" : ""}
                    style={{
                      width: `${nodeSize}px`,
                      height: `${nodeSize}px`,
                      borderRadius: "50%",
                      display: "flex",
                      alignItems: "center",
                      justifyContent: "center",
                      transition: "all 0.35s ease",
                      cursor: "default",
                      position: "relative",
                      background: isSkipped
                        ? "color-mix(in oklab,#ef4444 16%,var(--card))"
                        : isPast
                        ? "color-mix(in oklab,#f59e0b 16%,var(--card))"
                        : isActive
                        ? "radial-gradient(circle at 35% 35%, color-mix(in oklab,var(--primary) 22%,var(--card)), var(--card))"
                        : "color-mix(in oklab,var(--primary) 7%,var(--card))",
                      border: isSkipped
                        ? `${borderW}px dashed color-mix(in oklab,#ef4444 55%,transparent)`
                        : isPast
                        ? `${borderW}px dashed color-mix(in oklab,#f59e0b 55%,transparent)`
                        : isActive
                        ? `${borderW}px solid var(--primary)`
                        : `${borderW}px solid color-mix(in oklab,var(--primary) 20%,var(--card))`,
                      ...(isHovered && !isActive ? {
                        transform: "scale(1.12)",
                        boxShadow: isSkipped
                          ? "0 0 0 3px color-mix(in oklab,#ef4444 25%,transparent), 0 4px 12px -2px rgba(0,0,0,0.4)"
                          : isPast
                          ? "0 0 0 3px color-mix(in oklab,#f59e0b 25%,transparent), 0 4px 12px -2px rgba(0,0,0,0.4)"
                          : `0 0 0 3px color-mix(in oklab,var(--primary) 12%,transparent), 0 4px 12px -2px rgba(0,0,0,0.4)`,
                      } : {}),
                    }}
                  >
                    {isActive && (
                      <div style={{
                        position: "absolute", inset: "-5px", borderRadius: "50%",
                        border: "1.5px dashed color-mix(in oklab,var(--primary) 35%,transparent)",
                        animation: "dca-ring-spin 8s linear infinite",
                        willChange: "transform",
                      }} />
                    )}
                    {isSkipped ? (
                      <svg viewBox="0 0 12 12" width="11" height="11" fill="none" stroke="#ef4444" strokeWidth="2" strokeLinecap="round">
                        <path d="M3,3 L9,9 M9,3 L3,9" />
                      </svg>
                    ) : isPast ? (
                      <svg className="dca-check-pop" viewBox="0 0 12 12" width="11" height="11" fill="none" stroke="#f59e0b" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                        <polyline points="2,6 5,9.5 10,3" />
                      </svg>
                    ) : (
                      <span style={{
                        fontSize: isActive ? "12px" : "9px", fontWeight: 700, lineHeight: 1, letterSpacing: "-0.02em", transition: "all 0.4s ease",
                        color: isActive ? "var(--primary)" : "color-mix(in oklab,var(--muted-foreground) 40%,transparent)",
                        ...(isActive ? { filter: "drop-shadow(0 0 5px color-mix(in oklab,var(--primary) 80%,transparent))", textShadow: "0 0 8px color-mix(in oklab,var(--primary) 60%,transparent)" } : {}),
                      }}>
                        {i + 1}
                      </span>
                    )}
                  </div>
                </div>

                {/* ── USDT amount label below the node ── */}
                <div style={{ height: "14px", display: "flex", alignItems: "center", justifyContent: "center" }}>
                  {isSkipped ? (
                    <span style={{
                      fontSize: "8px",
                      fontWeight: 800,
                      letterSpacing: "0.05em",
                      textTransform: "uppercase",
                      lineHeight: 1,
                      whiteSpace: "nowrap",
                      color: "#ef4444",
                    }}>
                      Skipped
                    </span>
                  ) : isPast ? (
                    <span style={{
                      fontSize: "8px",
                      fontWeight: 800,
                      letterSpacing: "0.05em",
                      textTransform: "uppercase",
                      lineHeight: 1,
                      whiteSpace: "nowrap",
                      color: "#f59e0b",
                    }}>
                      Done
                    </span>
                  ) : isActive ? (
                    <span style={{
                      fontSize: "8px",
                      fontWeight: 800,
                      letterSpacing: "0.05em",
                      textTransform: "uppercase",
                      lineHeight: 1,
                      whiteSpace: "nowrap",
                      color: "var(--primary)",
                      filter: "drop-shadow(0 0 4px color-mix(in oklab,var(--primary) 55%,transparent))",
                    }}>
                      Active
                    </span>
                  ) : amount != null ? (
                    <span style={{
                      fontSize: "9px",
                      fontWeight: 700,
                      fontVariantNumeric: "tabular-nums",
                      letterSpacing: "-0.01em",
                      lineHeight: 1,
                      whiteSpace: "nowrap",
                      color: isActive
                        ? "var(--primary)"
                        : isPast
                        ? "color-mix(in oklab,var(--primary) 65%,var(--muted-foreground))"
                        : "color-mix(in oklab,var(--muted-foreground) 30%,transparent)",
                      ...(isActive ? { filter: "drop-shadow(0 0 4px color-mix(in oklab,var(--primary) 55%,transparent))" } : {}),
                    }}>
                      ${fmt(amount, 0)}
                    </span>
                  ) : (isPast || isActive) ? (
                    <span style={{
                      display: "inline-block", width: "18px", height: "3px", borderRadius: "999px",
                      background: isPast
                        ? "color-mix(in oklab,var(--primary) 22%,transparent)"
                        : "color-mix(in oklab,var(--primary) 14%,transparent)",
                    }} />
                  ) : null}
                </div>
              </div>

              {/* ── Connector line — marginTop centres it with the node circles ── */}
              {!isLast && (
                <div style={{ flex: 1, height: "1.5px", marginTop: `${NODE_CONTAINER / 2 - 0.75}px`, position: "relative", overflow: "hidden" }}>
                  <div style={{ position: "absolute", inset: 0, background: "color-mix(in oklab,var(--primary) 8%,var(--card))" }} />
                  <div style={{
                    position: "absolute", inset: 0, transition: "background 0.5s ease",
                    background: isSkipped
                      ? "linear-gradient(90deg, color-mix(in oklab,#ef4444 45%,transparent), color-mix(in oklab,#ef4444 25%,transparent))"
                      : isPast
                      ? "linear-gradient(90deg, color-mix(in oklab,#f59e0b 45%,transparent), color-mix(in oklab,#f59e0b 25%,transparent))"
                      : isActive
                      ? "linear-gradient(90deg, color-mix(in oklab,var(--primary) 55%,transparent) 0%, color-mix(in oklab,var(--primary) 12%,transparent) 100%)"
                      : "transparent",
                  }} />
                </div>
              )}
            </div>
          );
        })}
      </div>
    </>
  );
}

interface DcaData {
  dca_step?: number;
  dca_total_steps?: number;
  status?: string;
  dca_step_amounts?: number[];      // USDT spent per step, e.g. [50, 100, 150]
  dca_step_timestamps?: number[];   // unix-ms per step
  dca_skipped_steps?: number[];     // step numbers jumped over on a fast drop, e.g. [3, 4]
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
    // Always refetch fresh data on mount/symbol-change instead of trusting a
    // cached result — otherwise a coin that was traded before can keep
    // showing its previous closed-trade details.
    refetchOnMount: "always",
    // Safety-net polling so the card eventually corrects itself even if a
    // refetch trigger is missed (e.g. tab stays focused the whole time).
    refetchInterval: querySymbol ? 10_000 : false,
  });

  // Track transitions from "has an active order" -> "no active order". That
  // transition means a trade just closed. If the newly-closed trade is on
  // the SAME symbol as a previous closed trade, react-query would otherwise
  // keep serving the old cached result for that query key (queryKey doesn't
  // change), so the card can silently show stale coin details. Force a
  // fresh fetch whenever this happens.
  const prevActiveSymbolRef = useRef<string | undefined>(activeSymbol);
  useEffect(() => {
    const wasActive = !!prevActiveSymbolRef.current;
    prevActiveSymbolRef.current = activeSymbol;
    if (wasActive && !activeSymbol && querySymbol) {
      tradesQuery.refetch();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [activeSymbol, querySymbol]);

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

/** Live clock — ticks every second in UAE (Asia/Dubai, UTC+4) timezone */
function useClock() {
  function snapshot() {
    const now = Date.now();
    const dtf = new Intl.DateTimeFormat("en-US", {
      timeZone: "Asia/Dubai",
      hour: "2-digit",
      minute: "2-digit",
      second: "2-digit",
      hour12: true,
      weekday: "short",
      month: "short",
      day: "numeric",
    });
    const parts = dtf.formatToParts(new Date(now));
    const get = (t: string) => parts.find((p) => p.type === t)?.value ?? "";
    return {
      hours: get("hour"),
      minutes: get("minute"),
      seconds: get("second"),
      ampm: get("dayPeriod").toUpperCase(),
      dayStr: get("weekday").toUpperCase(),
      monthStr: get("month").toUpperCase(),
      dayNum: get("day"),
    };
  }
  const [tick, setTick] = useState(snapshot);
  useEffect(() => {
    const id = setInterval(() => setTick(snapshot()), 1000);
    return () => clearInterval(id);
  }, []);
  return tick;
}

export default function Dashboard() {
  const account = useQuery({ queryKey: ["account"], queryFn: () => getAccount(), refetchInterval: 15_000 });
  const orders = useQuery({ queryKey: ["openOrders"], queryFn: () => getOpenOrders(), refetchInterval: 8_000 });
  const prices = useQuery({ queryKey: ["prices"], queryFn: () => getAllPrices(), refetchInterval: 5_000 });
  const dcaData = useDcaData();
  const clockTime = useClock();

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
  const dcaSkipped    = dcaData?.dca_skipped_steps;
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
      {/*
        FIX: willChange: "transform" promotes this layer to its own GPU
        compositor layer, so the browser can scroll it without re-painting
        the backdrop-filter blurs on every frame.
      */}
      <div className="space-y-5" style={{ willChange: "transform" }}>

        {/* ── WALLET CARD — premium futuristic redesign ── */}
        <section
          className="rounded-2xl relative overflow-hidden"
          style={{
            background: "transparent",
            border: "1px solid oklch(0.78 0.07 200 / 22%)",
            /*
              FIX: Reduced blur from 32px → 8px.
              32px blur forces the GPU to sample a huge radius on every scroll
              frame, which is the primary cause of mobile scroll jank.
              8px is visually indistinguishable at card size but ~16× cheaper.
            */
            backdropFilter: "blur(8px) saturate(150%)",
            WebkitBackdropFilter: "blur(8px) saturate(150%)",
          }}
        >

          <div className="relative p-5 md:p-6">
            {/* ── Header row ── */}
            <div className="flex items-center justify-between">
              <div
                className="flex items-center gap-2 text-[11px] uppercase tracking-[0.18em] font-bold"
                style={{ color: "color-mix(in oklab, var(--primary) 80%, var(--muted-foreground))" }}
              >
                <WalletIcon className="h-3.5 w-3.5 shrink-0" />
                Wallet
              </div>

              {/* ── Live date (UAE timezone) ── */}
              <div
                style={{
                  fontSize: "0.6rem",
                  fontWeight: 700,
                  letterSpacing: "0.12em",
                  color: "color-mix(in oklab, var(--muted-foreground) 70%, transparent)",
                }}
              >
                {clockTime.dayStr}, {clockTime.monthStr} {clockTime.dayNum}
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
                .bal-glow-up   { animation: bal-glow-up   2s ease-out forwards; will-change: box-shadow; }
                .bal-glow-down { animation: bal-glow-down 2s ease-out forwards; will-change: box-shadow; }
                .bal-shimmer   { animation: bal-shimmer   0.9s ease-in-out forwards; will-change: transform; }
                .bal-scale-pop { animation: bal-scale-pop 0.6s cubic-bezier(0.22,1,0.36,1) forwards; will-change: transform; }
                .delta-rise    { animation: delta-rise    2s ease-out forwards; will-change: transform, opacity; }
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

              {/* ── AED equivalent value ── */}
              <div
                className="mt-1.5 text-base md:text-lg font-bold tabular-nums"
                style={{ color: "color-mix(in oklab, var(--muted-foreground) 75%, transparent)" }}
              >
                {account.isLoading ? "…" : `≈ AED ${fmt(animatedTotal * AED_RATE)}`}
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
                        /*
                          FIX: Reduced blur from 10px → 4px on each chip card.
                          With up to 10 chips rendered, each with a 10px blur,
                          the composite cost multiplies significantly on mobile.
                          4px retains the frosted look with a fraction of the GPU cost.
                        */
                        backdropFilter: "blur(4px)",
                        WebkitBackdropFilter: "blur(4px)",
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
        <section
          className={`rounded-2xl border p-5 md:p-6 relative overflow-hidden transition-all duration-500 bg-transparent ${
            primary
              ? pnlUsd < 0
                ? "border-bear/40 shadow-[0_0_60px_-20px_rgba(239,68,68,0.45)]"
                : "border-bull/40 shadow-[0_0_60px_-20px_rgba(16,185,129,0.45)]"
              : "border-border"
          }`}
        >
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

              <div className={`relative mt-5 rounded-xl border bg-transparent px-4 py-3 flex items-center justify-between transition-all duration-300 ${flash === "up" ? "border-bull/60" : flash === "down" ? "border-bear/60" : "border-border"}`}>
                <span className="text-[10px] uppercase tracking-widest font-bold text-muted-foreground flex items-center gap-1.5">
                  <Activity className="h-3 w-3" /> Live price
                </span>
                <span className={`text-[1.95rem] md:text-[2.4375rem] font-black tabular-nums transition-colors ${flash === "up" ? "text-bull" : flash === "down" ? "text-bear" : ""}`}>
                  ${cur ? fmtPrice(cur) : "…"}
                </span>
              </div>

              {/* ── DCA STEP ── */}
              {showDca && (
                <div
                  className="relative mt-4 rounded-xl overflow-hidden px-4 py-4"
                  style={{
                    background: "transparent",
                    border: "1px solid color-mix(in oklab,var(--primary) 28%,transparent)",
                  }}
                >
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

                  <StepSegments
                    step={dcaStep}
                    total={dcaTotal}
                    stepAmounts={dcaAmounts}
                    stepTimestamps={dcaTimestamps}
                    skippedSteps={dcaSkipped}
                  />
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
      <div className="mt-5 flex items-center gap-3 rounded-xl border border-border bg-transparent px-4 py-3">
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
    <div className={`rounded-lg border bg-transparent px-3 py-2 ${danger ? "border-bear/30" : accent ? "border-bull/30" : "border-border"}`}>
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

  // Animated counter — uses requestAnimationFrame instead of setInterval
  // for smooth, jank-free updates that are tied to the display refresh rate.
  const [displayPct, setDisplayPct] = useState(w);
  const prevWRef = useRef(w);
  const rafRef = useRef<number | null>(null);

  useEffect(() => {
    const start = prevWRef.current;
    const end = w;
    prevWRef.current = w;

    if (Math.abs(end - start) < 0.05) return;

    if (rafRef.current) cancelAnimationFrame(rafRef.current);

    const DURATION_MS = 700;
    const startTime = performance.now();

    const tick = (now: number) => {
      const elapsed = now - startTime;
      const t = Math.min(elapsed / DURATION_MS, 1);
      // ease-out cubic
      const eased = 1 - Math.pow(1 - t, 3);
      const next = start + (end - start) * eased;
      setDisplayPct(next);
      if (t < 1) {
        rafRef.current = requestAnimationFrame(tick);
      } else {
        setDisplayPct(end);
      }
    };

    rafRef.current = requestAnimationFrame(tick);
    return () => { if (rafRef.current) cancelAnimationFrame(rafRef.current); };
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
    <div className="rounded-xl border border-border bg-transparent p-3 relative overflow-hidden">
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
        .progress-bar-glow-bull { animation: progress-glow-bull 2s ease-in-out infinite; will-change: box-shadow; }
        .progress-bar-glow-bear { animation: progress-glow-bear 2s ease-in-out 0.4s infinite; will-change: box-shadow; }
        .progress-shimmer        { animation: progress-shimmer  2.4s ease-in-out infinite; will-change: transform; }
        .progress-tip-bull       { animation: progress-tip-beat-bull 1.8s ease-in-out infinite; will-change: transform, box-shadow; }
        .progress-tip-bear       { animation: progress-tip-beat-bear 1.8s ease-in-out 0.4s infinite; will-change: transform, box-shadow; }
        .pct-badge-pop           { animation: pct-badge-pop 0.35s cubic-bezier(0.22,1,0.36,1) both; will-change: transform, opacity; }
        .pct-digit-up            { animation: pct-digit-up 0.22s ease-out both; will-change: transform, opacity; }
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
