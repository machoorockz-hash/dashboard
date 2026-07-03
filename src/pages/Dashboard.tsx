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

// Background particles — fixed positions so they don't re-randomize on render
const PARTICLES = [
  { left: "12%", top: "18%", delay: "0s",   dur: "5.2s" },
  { left: "28%", top: "72%", delay: "1.1s", dur: "6.8s" },
  { left: "48%", top: "35%", delay: "0.6s", dur: "4.9s" },
  { left: "68%", top: "60%", delay: "1.8s", dur: "7.1s" },
  { left: "82%", top: "22%", delay: "0.3s", dur: "5.6s" },
  { left: "92%", top: "80%", delay: "2.2s", dur: "6.2s" },
];

// All wallet card CSS animations in one block
const WALLET_STYLES = `
  @keyframes w-scan {
    0%   { top: -2px; opacity: 0; }
    3%   { opacity: 1; }
    94%  { opacity: 0.7; }
    100% { top: calc(100% + 2px); opacity: 0; }
  }
  @keyframes w-orb-a {
    0%,100% { transform: translate(0px, 0px) scale(1); }
    33%     { transform: translate(18px, -14px) scale(1.09); }
    66%     { transform: translate(-10px, 8px) scale(0.94); }
  }
  @keyframes w-orb-b {
    0%,100% { transform: translate(0px, 0px) scale(1); }
    40%     { transform: translate(-14px, 12px) scale(1.07); }
    70%     { transform: translate(10px, -7px) scale(0.96); }
  }
  @keyframes w-orb-c {
    0%,100% { transform: translate(0px, 0px) scale(1); opacity: 0.5; }
    50%     { transform: translate(6px, -10px) scale(1.12); opacity: 0.8; }
  }
  @keyframes w-holo {
    0%   { background-position: 0% 50%; }
    50%  { background-position: 100% 50%; }
    100% { background-position: 0% 50%; }
  }
  @keyframes w-shimmer-sweep {
    0%   { left: -70%; }
    100% { left: 160%; }
  }
  @keyframes w-neon-ring {
    0%,100% {
      box-shadow:
        0 0 0 1px color-mix(in oklab, var(--primary) 22%, transparent),
        0 0 28px -6px color-mix(in oklab, var(--primary) 16%, transparent);
    }
    50% {
      box-shadow:
        0 0 0 1px color-mix(in oklab, var(--primary) 45%, transparent),
        0 0 45px -6px color-mix(in oklab, var(--primary) 30%, transparent),
        0 0 80px -12px color-mix(in oklab, var(--primary) 10%, transparent);
    }
  }
  @keyframes w-balance-glow {
    0%,100% { filter: drop-shadow(0 0 16px color-mix(in oklab, var(--primary) 22%, transparent)); }
    50%     { filter: drop-shadow(0 0 44px color-mix(in oklab, var(--primary) 46%, transparent))
                      drop-shadow(0 0 80px color-mix(in oklab, var(--primary) 14%, transparent)); }
  }
  @keyframes w-glitch {
    0%,88%,100% { clip-path: none; transform: none; color: inherit; }
    89% { clip-path: polygon(0 18%, 100% 18%, 100% 48%, 0 48%); transform: translateX(-3px); }
    91% { clip-path: polygon(0 52%, 100% 52%, 100% 82%, 0 82%); transform: translateX(3px); }
    93% { clip-path: none; transform: none; }
  }
  @keyframes w-spectrum-in {
    0%   { transform: scaleX(0); }
    100% { transform: scaleX(1); }
  }
  @keyframes w-card-in {
    0%   { opacity: 0; transform: translateY(16px) scale(0.93); filter: blur(4px); }
    100% { opacity: 1; transform: translateY(0)    scale(1);    filter: blur(0px); }
  }
  @keyframes w-card-shimmer {
    0%   { left: -90%; }
    100% { left: 130%; }
  }
  @keyframes w-dot-ring {
    0%   { transform: scale(1);   opacity: 0.8; }
    100% { transform: scale(3.2); opacity: 0;   }
  }
  @keyframes w-particle {
    0%,100% { transform: translateY(0px) translateX(0px);  opacity: 0.3; }
    50%     { transform: translateY(-16px) translateX(5px); opacity: 0.65; }
  }
  @keyframes w-meta-in {
    0%   { opacity: 0; transform: translateX(-8px); }
    100% { opacity: 1; transform: translateX(0px);  }
  }
  @keyframes w-grid-spin {
    0%   { transform: rotate(0deg); }
    100% { transform: rotate(90deg); }
  }
  @keyframes w-top-line-pulse {
    0%,100% { opacity: 0.55; }
    50%     { opacity: 1; }
  }
  @keyframes w-corner-draw {
    0%   { stroke-dashoffset: 80; opacity: 0; }
    30%  { opacity: 1; }
    100% { stroke-dashoffset: 0; opacity: 1; }
  }
  @keyframes w-spectrum-shimmer {
    0%   { left: -50%; }
    100% { left: 150%; }
  }
  .w-balance-glow   { animation: w-balance-glow   3.5s ease-in-out infinite; }
  .w-balance-glitch { animation: w-glitch          9s   ease-in-out infinite 2s; }
  .w-neon-ring      { animation: w-neon-ring       4s   ease-in-out infinite; }
  .w-shimmer-sweep  { animation: w-shimmer-sweep   3.8s ease-in-out infinite 1.2s; }
  .w-top-line       { animation: w-top-line-pulse  3s   ease-in-out infinite; }
`;

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

function StepSegments({
  step,
  total,
  stepAmounts,
  stepTimestamps,
}: {
  step: number;
  total: number;
  stepAmounts?: number[];
  stepTimestamps?: number[];
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
        .dca-node-breathe { animation: dca-node-breathe 2.4s ease-in-out infinite; }
        .dca-check-pop    { animation: dca-check-pop    0.35s cubic-bezier(0.34,1.56,0.64,1) both; }
        .dca-tooltip-in   { animation: dca-tooltip-in   0.22s cubic-bezier(0.22,1,0.36,1) both; }
      `}</style>

      <div style={{ display: "flex", alignItems: "flex-start", width: "100%" }}>
        {Array.from({ length: total }).map((_, i) => {
          const filled    = i < step;
          const isActive  = i === step - 1;
          const isPast    = filled && !isActive;
          const isLast    = i === total - 1;
          const isHovered = hoveredIdx === i;

          const nodeSize       = isActive ? 30 : isPast ? 22 : 20;
          const borderW        = isActive ? 2 : isPast ? 0 : 1.5;
          const NODE_CONTAINER = 32;

          const statusLabel  = isPast ? "Completed" : isActive ? "Active" : "Pending";
          const statusColor  = isPast || isActive ? "var(--primary)" : "color-mix(in oklab,var(--muted-foreground) 55%,transparent)";
          const statusBg     = isPast ? "color-mix(in oklab,var(--primary) 18%,var(--card))" : isActive ? "color-mix(in oklab,var(--primary) 12%,var(--card))" : "color-mix(in oklab,var(--muted-foreground) 8%,var(--card))";
          const statusBorder = isPast || isActive ? "color-mix(in oklab,var(--primary) 35%,transparent)" : "color-mix(in oklab,var(--muted-foreground) 18%,transparent)";

          const amount    = stepAmounts?.[i];
          const timestamp = stepTimestamps?.[i];
          const timeStr   = timestamp ? fmtUAE(timestamp) : null;

          return (
            <div key={i} style={{ display: "flex", alignItems: "flex-start", flex: isLast ? "0 0 auto" : 1 }}>
              <div
                style={{ display: "flex", flexDirection: "column", alignItems: "center", gap: "5px", flexShrink: 0, position: "relative" }}
                onMouseEnter={() => setHoveredIdx(i)}
                onMouseLeave={() => setHoveredIdx(null)}
              >
                {isHovered && (
                  <div className="dca-tooltip-in" style={{ position: "absolute", bottom: `calc(100% + 10px)`, left: "50%", zIndex: 50, pointerEvents: "none", minWidth: "110px", maxWidth: "160px" }}>
                    <div style={{ background: "color-mix(in oklab,var(--card) 92%,transparent)", backdropFilter: "blur(14px)", WebkitBackdropFilter: "blur(14px)", border: `1px solid color-mix(in oklab,var(--primary) ${isPast || isActive ? "30%" : "14%"},transparent)`, borderRadius: "10px", padding: "8px 10px", boxShadow: "0 8px 24px -4px rgba(0,0,0,0.45)" }}>
                      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: "8px" }}>
                        <span style={{ fontSize: "10px", fontWeight: 800, letterSpacing: "0.06em", textTransform: "uppercase", color: "var(--muted-foreground)" }}>Step {i + 1}</span>
                        <span style={{ fontSize: "8px", fontWeight: 800, letterSpacing: "0.05em", textTransform: "uppercase", padding: "2px 6px", borderRadius: "999px", lineHeight: 1.4, color: statusColor, background: statusBg, border: `1px solid ${statusBorder}`, ...(isActive ? { filter: "drop-shadow(0 0 4px color-mix(in oklab,var(--primary) 60%,transparent))" } : {}) }}>{statusLabel}</span>
                      </div>
                      <div style={{ margin: "6px 0", height: "1px", background: `linear-gradient(90deg,transparent,color-mix(in oklab,var(--primary) ${isPast || isActive ? "25%" : "10%"},transparent),transparent)` }} />
                      {amount != null ? (
                        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: "6px" }}>
                          <span style={{ fontSize: "9px", color: "color-mix(in oklab,var(--muted-foreground) 70%,transparent)", fontWeight: 600 }}>Buy</span>
                          <span style={{ fontSize: "11px", fontWeight: 900, fontVariantNumeric: "tabular-nums", color: isActive ? "var(--primary)" : isPast ? "var(--foreground)" : "color-mix(in oklab,var(--muted-foreground) 60%,transparent)" }}>${fmt(amount, 2)}</span>
                        </div>
                      ) : (
                        <div style={{ display: "flex", gap: "5px" }}>
                          <span style={{ display: "inline-block", width: "32px", height: "5px", borderRadius: "999px", background: "color-mix(in oklab,var(--muted-foreground) 12%,transparent)" }} />
                          <span style={{ display: "inline-block", width: "20px", height: "5px", borderRadius: "999px", background: "color-mix(in oklab,var(--muted-foreground) 7%,transparent)" }} />
                        </div>
                      )}
                      {timeStr && <div style={{ marginTop: "4px", fontSize: "9px", fontVariantNumeric: "tabular-nums", color: "color-mix(in oklab,var(--muted-foreground) 55%,transparent)", fontWeight: 500 }}>{timeStr.date} · {timeStr.time}</div>}
                    </div>
                    <div style={{ position: "absolute", bottom: "-5px", left: "50%", transform: "translateX(-50%) rotate(45deg)", width: "9px", height: "9px", background: "color-mix(in oklab,var(--card) 92%,transparent)", backdropFilter: "blur(14px)", border: `1px solid color-mix(in oklab,var(--primary) ${isPast || isActive ? "30%" : "14%"},transparent)`, borderTop: "none", borderLeft: "none" }} />
                  </div>
                )}

                <div style={{ width: `${NODE_CONTAINER}px`, height: `${NODE_CONTAINER}px`, display: "flex", alignItems: "center", justifyContent: "center", position: "relative" }}>
                  <div
                    className={isActive ? "dca-node-breathe" : ""}
                    style={{ width: `${nodeSize}px`, height: `${nodeSize}px`, borderRadius: "50%", display: "flex", alignItems: "center", justifyContent: "center", transition: "all 0.35s ease", cursor: "default", position: "relative", background: isActive ? "radial-gradient(circle at 35% 35%, color-mix(in oklab,var(--primary) 22%,var(--card)), var(--card))" : isPast ? "var(--primary)" : "color-mix(in oklab,var(--primary) 7%,var(--card))", border: isActive ? `${borderW}px solid var(--primary)` : isPast ? "none" : `${borderW}px solid color-mix(in oklab,var(--primary) 20%,var(--card))`, ...(isHovered && !isActive ? { transform: "scale(1.12)", boxShadow: `0 0 0 3px color-mix(in oklab,var(--primary) ${isPast ? "22%" : "12%"},transparent)` } : {}) }}
                  >
                    {isActive && <div style={{ position: "absolute", inset: "-5px", borderRadius: "50%", border: "1.5px dashed color-mix(in oklab,var(--primary) 35%,transparent)", animation: "dca-ring-spin 8s linear infinite" }} />}
                    {isPast ? (
                      <svg className="dca-check-pop" viewBox="0 0 12 12" width="11" height="11" fill="none" stroke="var(--card)" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><polyline points="2,6 5,9.5 10,3" /></svg>
                    ) : (
                      <span style={{ fontSize: isActive ? "12px" : "9px", fontWeight: 700, lineHeight: 1, color: isActive ? "var(--primary)" : "color-mix(in oklab,var(--muted-foreground) 40%,transparent)", ...(isActive ? { filter: "drop-shadow(0 0 5px color-mix(in oklab,var(--primary) 80%,transparent))" } : {}) }}>{i + 1}</span>
                    )}
                  </div>
                </div>

                <div style={{ height: "14px", display: "flex", alignItems: "center", justifyContent: "center" }}>
                  {amount != null ? (
                    <span style={{ fontSize: "9px", fontWeight: 700, fontVariantNumeric: "tabular-nums", lineHeight: 1, whiteSpace: "nowrap", color: isActive ? "var(--primary)" : isPast ? "color-mix(in oklab,var(--primary) 65%,var(--muted-foreground))" : "color-mix(in oklab,var(--muted-foreground) 30%,transparent)", ...(isActive ? { filter: "drop-shadow(0 0 4px color-mix(in oklab,var(--primary) 55%,transparent))" } : {}) }}>${fmt(amount, 0)}</span>
                  ) : (isPast || isActive) ? (
                    <span style={{ display: "inline-block", width: "18px", height: "3px", borderRadius: "999px", background: isPast ? "color-mix(in oklab,var(--primary) 22%,transparent)" : "color-mix(in oklab,var(--primary) 14%,transparent)" }} />
                  ) : null}
                </div>
              </div>

              {!isLast && (
                <div style={{ flex: 1, height: "1.5px", marginTop: `${NODE_CONTAINER / 2 - 0.75}px`, position: "relative", overflow: "hidden" }}>
                  <div style={{ position: "absolute", inset: 0, background: "color-mix(in oklab,var(--primary) 8%,var(--card))" }} />
                  <div style={{ position: "absolute", inset: 0, transition: "background 0.5s ease", background: isPast ? "linear-gradient(90deg, color-mix(in oklab,var(--primary) 70%,transparent), color-mix(in oklab,var(--primary) 50%,transparent))" : isActive ? "linear-gradient(90deg, color-mix(in oklab,var(--primary) 55%,transparent) 0%, color-mix(in oklab,var(--primary) 12%,transparent) 100%)" : "transparent" }} />
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

const LAST_SYMBOL_KEY = "dashboard_last_order_symbol";

interface LastTrade {
  symbol: string;
  base: string;
  price: number;
  qty: number;
  quoteQty: number;
  time: number;
}

function useLastTrade(activeSymbol: string | undefined): LastTrade | null {
  const [storedSymbol, setStoredSymbol] = useState<string | undefined>(
    () => localStorage.getItem(LAST_SYMBOL_KEY) ?? undefined,
  );
  useEffect(() => {
    if (activeSymbol) {
      localStorage.setItem(LAST_SYMBOL_KEY, activeSymbol);
      setStoredSymbol(activeSymbol);
    }
  }, [activeSymbol]);

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

export default function Dashboard() {
  const account = useQuery({ queryKey: ["account"], queryFn: () => getAccount(), refetchInterval: 15_000 });
  const orders  = useQuery({ queryKey: ["openOrders"], queryFn: () => getOpenOrders(), refetchInterval: 8_000 });
  const prices  = useQuery({ queryKey: ["prices"], queryFn: () => getAllPrices(), refetchInterval: 5_000 });
  const dcaData = useDcaData();

  const allOrders  = orders.data ?? [];
  const primary    = allOrders[0];
  const sameSymbol = allOrders.filter((o) => o.symbol === primary?.symbol);
  const tpOrder    = sameSymbol.find((o) => parseFloat(o.stopPrice || "0") === 0) ?? primary;
  const slOrder    = sameSymbol.find((o) => parseFloat(o.stopPrice || "0") > 0);
  const orderSymbol = primary?.symbol;
  const orderBase   = orderSymbol?.replace(/USDT$|BUSD$|FDUSD$|BTC$|ETH$/, "") || "";

  const trades = useQuery({
    queryKey: ["trades", orderSymbol],
    queryFn: () => getMyTrades({ data: { symbol: orderSymbol!, limit: 200 } }),
    enabled: !!orderSymbol,
    refetchInterval: 60_000,
  });

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

  // ── Animated balance counter ──────────────────────────────────────────────
  const [displayBalance, setDisplayBalance] = useState(0);
  const balancePrevRef  = useRef(0);
  const balanceTimerRef = useRef<ReturnType<typeof setInterval> | null>(null);
  useEffect(() => {
    if (!totalUsdt) return;
    const start = balancePrevRef.current;
    const end   = totalUsdt;
    balancePrevRef.current = end;
    if (balanceTimerRef.current) clearInterval(balanceTimerRef.current);
    const STEPS = 55;
    const DURATION = 1100;
    let step = 0;
    balanceTimerRef.current = setInterval(() => {
      step++;
      const t = step / STEPS;
      const eased = 1 - Math.pow(1 - t, 3);
      setDisplayBalance(start + (end - start) * eased);
      if (step >= STEPS) {
        setDisplayBalance(end);
        if (balanceTimerRef.current) clearInterval(balanceTimerRef.current);
      }
    }, DURATION / STEPS);
    return () => { if (balanceTimerRef.current) clearInterval(balanceTimerRef.current); };
  }, [totalUsdt]);

  // Wallet cards re-animate entrance when assets change
  const [cardAnimKey, setCardAnimKey] = useState(0);
  useEffect(() => {
    if (walletAssets.length > 0) setCardAnimKey((k) => k + 1);
  }, [walletAssets.length]);

  const tpPrice  = tpOrder ? parseFloat(tpOrder.price) : 0;
  const slPrice  = slOrder ? (parseFloat(slOrder.stopPrice) || parseFloat(slOrder.price)) : 0;
  const orderQty = primary ? parseFloat(primary.origQty) : 0;
  const entry    = avgEntry > 0 ? avgEntry : (primary ? parseFloat(primary.price) : 0);
  const side     = primary?.side ?? "";
  const dirMult  = side === "SELL" ? 1 : 1;
  const cur      = livePrice ?? (orderSymbol ? prices.data?.[orderSymbol] : undefined);

  const pnlPct      = cur && entry ? ((cur - entry) / entry) * 100 * dirMult : 0;
  const pnlUsd      = cur && entry ? (cur - entry) * orderQty * dirMult : 0;
  const targetPct   = tpPrice && entry ? ((tpPrice - entry) / entry) * 100 : 0;
  const stopPct     = slPrice && entry ? ((slPrice - entry) / entry) * 100 : 0;
  const distToTpPct = cur && tpPrice ? ((tpPrice - cur) / cur) * 100 : 0;
  const distToSlPct = cur && slPrice ? ((cur - slPrice) / cur) * 100 : 0;

  const tpProgress =
    cur && tpPrice && entry && tpPrice !== entry
      ? Math.max(0, Math.min(1, (cur - entry) / (tpPrice - entry)))
      : 0;
  const slProgress =
    cur && slPrice && entry && entry !== slPrice
      ? Math.max(0, Math.min(1, (entry - cur) / (entry - slPrice)))
      : 0;

  const dcaStep       = dcaData?.dca_step ?? 0;
  const dcaTotal      = dcaData?.dca_total_steps ?? 6;
  const dcaAmounts    = dcaData?.dca_step_amounts;
  const dcaTimestamps = dcaData?.dca_step_timestamps;
  const showDca = !!primary && dcaStep > 0 && dcaData?.status !== "COMPLETED";

  const chartLines = useMemo(() => {
    const out: Array<{ price: number; label: string; color: string }> = [];
    if (orderSymbol && chartSymbol === orderSymbol) {
      if (entry > 0)   out.push({ price: entry,   label: `Entry ${fmtPrice(entry)}`,   color: "#a3b1c2" });
      if (tpPrice > 0) out.push({ price: tpPrice, label: `TP ${fmtPrice(tpPrice)}`,    color: "#10b981" });
      if (slPrice > 0) out.push({ price: slPrice, label: `SL ${fmtPrice(slPrice)}`,    color: "#ef4444" });
    }
    return out;
  }, [orderSymbol, chartSymbol, entry, tpPrice, slPrice]);

  // Largest coin % — used to normalize mini-bars
  const maxPct = walletAssets.length > 0 && totalUsdt > 0
    ? (walletAssets[0].usd / totalUsdt) * 100
    : 100;

  return (
    <AppLayout>
      <div className="space-y-5">

        {/* ══════════════════════════════════════════════════════════════════════
            WALLET CARD — ultra-premium futuristic redesign
        ══════════════════════════════════════════════════════════════════════ */}
        <section
          className="w-neon-ring rounded-2xl relative overflow-hidden"
          style={{
            /* Iridescent shifting background */
            background: [
              "linear-gradient(135deg,",
              "  oklch(0.17 0.07 215 / 90%) 0%,",
              "  oklch(0.13 0.09 205 / 94%) 40%,",
              "  oklch(0.15 0.07 225 / 90%) 75%,",
              "  oklch(0.12 0.06 200 / 92%) 100%",
              ")",
            ].join(""),
            backdropFilter: "blur(36px) saturate(200%)",
            WebkitBackdropFilter: "blur(36px) saturate(200%)",
          }}
        >
          <style>{WALLET_STYLES}</style>

          {/* ── Holographic iridescent overlay ── */}
          <div
            className="absolute inset-0 pointer-events-none"
            style={{
              background: [
                "linear-gradient(125deg,",
                "  oklch(0.60 0.14 165 / 4%) 0%,",
                "  oklch(0.55 0.10 210 / 2%) 25%,",
                "  oklch(0.65 0.16 280 / 5%) 50%,",
                "  oklch(0.55 0.12 165 / 3%) 75%,",
                "  oklch(0.60 0.14 200 / 4%) 100%",
                ")",
              ].join(""),
              backgroundSize: "300% 300%",
              animation: "w-holo 10s ease infinite",
              mixBlendMode: "screen",
            }}
          />

          {/* ── Scanline grid ── */}
          <div
            className="absolute inset-0 pointer-events-none"
            style={{
              backgroundImage: [
                "linear-gradient(oklch(0.85 0.05 200 / 3.5%) 1px, transparent 1px),",
                "linear-gradient(90deg, oklch(0.85 0.05 200 / 3.5%) 1px, transparent 1px)",
              ].join(""),
              backgroundSize: "40px 40px",
            }}
          />

          {/* ── Floating ambient orbs ── */}
          <div
            className="absolute pointer-events-none"
            style={{
              top: "-60px", right: "-60px", width: "300px", height: "300px",
              borderRadius: "50%",
              background: "radial-gradient(circle, color-mix(in oklab, var(--primary) 16%, transparent) 0%, transparent 65%)",
              animation: "w-orb-a 9s ease-in-out infinite",
            }}
          />
          <div
            className="absolute pointer-events-none"
            style={{
              bottom: "-40px", left: "-30px", width: "200px", height: "200px",
              borderRadius: "50%",
              background: "radial-gradient(circle, oklch(0.55 0.20 260 / 9%) 0%, transparent 65%)",
              animation: "w-orb-b 12s ease-in-out infinite 2s",
            }}
          />
          <div
            className="absolute pointer-events-none"
            style={{
              top: "40%", left: "45%", width: "120px", height: "120px",
              borderRadius: "50%",
              background: "radial-gradient(circle, color-mix(in oklab, var(--primary) 8%, transparent) 0%, transparent 70%)",
              animation: "w-orb-c 7s ease-in-out infinite 1s",
            }}
          />

          {/* ── Floating particles ── */}
          {PARTICLES.map((p, i) => (
            <div
              key={i}
              className="absolute pointer-events-none rounded-full"
              style={{
                left: p.left, top: p.top,
                width: "3px", height: "3px",
                background: "var(--primary)",
                boxShadow: "0 0 6px 2px color-mix(in oklab, var(--primary) 60%, transparent)",
                animation: `w-particle ${p.dur} ease-in-out infinite ${p.delay}`,
                opacity: 0.4,
              }}
            />
          ))}

          {/* ── Diagonal shimmer sweep ── */}
          <div
            className="absolute inset-y-0 w-shimmer-sweep pointer-events-none"
            style={{
              width: "35%",
              background: "linear-gradient(90deg, transparent 0%, oklch(0.92 0.04 200 / 5%) 40%, oklch(0.95 0.06 165 / 8%) 55%, transparent 100%)",
              transform: "skewX(-18deg)",
            }}
          />

          {/* ── Periodic scan line ── */}
          <div
            className="absolute inset-x-0 pointer-events-none"
            style={{
              height: "2px",
              background: "linear-gradient(90deg, transparent 0%, color-mix(in oklab, var(--primary) 50%, transparent) 30%, oklch(0.95 0.06 165 / 55%) 55%, color-mix(in oklab, var(--primary) 40%, transparent) 70%, transparent 100%)",
              boxShadow: "0 0 12px 3px color-mix(in oklab, var(--primary) 30%, transparent)",
              animation: "w-scan 7s ease-in-out infinite 0.5s",
            }}
          />

          {/* ── Top shimmer line ── */}
          <div
            className="w-top-line absolute inset-x-0 top-0 h-px pointer-events-none"
            style={{
              background: "linear-gradient(90deg, transparent 0%, color-mix(in oklab, var(--primary) 65%, transparent) 30%, oklch(0.95 0.06 200 / 50%) 55%, transparent 100%)",
            }}
          />

          {/* ── Bottom edge line ── */}
          <div
            className="absolute inset-x-0 bottom-0 h-px pointer-events-none"
            style={{ background: "linear-gradient(90deg, transparent 0%, oklch(0.78 0.07 200 / 18%) 50%, transparent 100%)" }}
          />

          {/* ── Circuit corner decorations ── */}
          {/* Top-left */}
          <svg className="absolute top-0 left-0 pointer-events-none" width="60" height="60" viewBox="0 0 60 60" fill="none">
            <path d="M 2 30 L 2 8 Q 2 2 8 2 L 30 2" stroke="color-mix(in oklab, var(--primary) 35%, transparent)" strokeWidth="1" strokeDasharray="80" fill="none" style={{ animation: "w-corner-draw 1.5s ease-out both 0.2s" }} />
            <circle cx="2" cy="30" r="2" fill="color-mix(in oklab, var(--primary) 50%, transparent)" />
            <circle cx="30" cy="2" r="2" fill="color-mix(in oklab, var(--primary) 50%, transparent)" />
            <path d="M 14 2 L 14 8" stroke="color-mix(in oklab, var(--primary) 25%, transparent)" strokeWidth="1" />
            <path d="M 2 14 L 8 14" stroke="color-mix(in oklab, var(--primary) 25%, transparent)" strokeWidth="1" />
          </svg>
          {/* Top-right */}
          <svg className="absolute top-0 right-0 pointer-events-none" width="60" height="60" viewBox="0 0 60 60" fill="none">
            <path d="M 58 30 L 58 8 Q 58 2 52 2 L 30 2" stroke="color-mix(in oklab, var(--primary) 35%, transparent)" strokeWidth="1" strokeDasharray="80" fill="none" style={{ animation: "w-corner-draw 1.5s ease-out both 0.4s" }} />
            <circle cx="58" cy="30" r="2" fill="color-mix(in oklab, var(--primary) 50%, transparent)" />
            <circle cx="30" cy="2" r="2" fill="color-mix(in oklab, var(--primary) 50%, transparent)" />
          </svg>
          {/* Bottom-left */}
          <svg className="absolute bottom-0 left-0 pointer-events-none" width="40" height="40" viewBox="0 0 40 40" fill="none">
            <path d="M 2 20 L 2 36 Q 2 38 4 38 L 20 38" stroke="color-mix(in oklab, var(--primary) 20%, transparent)" strokeWidth="1" fill="none" />
          </svg>

          {/* ── Card content ── */}
          <div className="relative p-5 md:p-6">

            {/* ── Header row ── */}
            <div className="flex items-center justify-between">
              <div
                className="flex items-center gap-2.5 select-none"
                style={{ animation: "w-meta-in 0.6s ease-out both" }}
              >
                {/* Pulsing dot with expanding ring */}
                <div className="relative flex items-center justify-center shrink-0" style={{ width: "14px", height: "14px" }}>
                  <div
                    className="absolute rounded-full"
                    style={{
                      width: "8px", height: "8px",
                      background: "var(--primary)",
                      boxShadow: "0 0 8px 2px color-mix(in oklab, var(--primary) 60%, transparent)",
                      animation: "none",
                    }}
                  />
                  <div
                    className="absolute rounded-full"
                    style={{
                      width: "8px", height: "8px",
                      border: "1.5px solid var(--primary)",
                      animation: "w-dot-ring 2.4s ease-out infinite",
                    }}
                  />
                  <div
                    className="absolute rounded-full"
                    style={{
                      width: "8px", height: "8px",
                      border: "1.5px solid var(--primary)",
                      animation: "w-dot-ring 2.4s ease-out infinite 0.8s",
                    }}
                  />
                </div>

                <WalletIcon
                  className="h-3.5 w-3.5 shrink-0"
                  style={{ color: "color-mix(in oklab, var(--primary) 85%, var(--muted-foreground))" }}
                />
                <span
                  className="text-[11px] uppercase font-black"
                  style={{
                    letterSpacing: "0.20em",
                    color: "color-mix(in oklab, var(--primary) 80%, var(--muted-foreground))",
                    textShadow: "0 0 12px color-mix(in oklab, var(--primary) 40%, transparent)",
                  }}
                >
                  Total Balance
                </span>
              </div>

              {/* 3×3 grid icon button */}
              <button
                className="h-10 w-10 rounded-xl flex items-center justify-center shrink-0 group"
                style={{
                  background: "linear-gradient(145deg, color-mix(in oklab, var(--primary) 14%, oklch(0.50 0.06 210 / 28%)) 0%, oklch(0.40 0.06 210 / 20%) 100%)",
                  border: "1px solid color-mix(in oklab, var(--primary) 32%, oklch(0.78 0.07 200 / 18%))",
                  boxShadow: [
                    "0 0 18px -5px color-mix(in oklab, var(--primary) 28%, transparent)",
                    "inset 0 1px 0 oklch(0.92 0.04 200 / 12%)",
                  ].join(", "),
                  cursor: "default",
                  transition: "box-shadow 0.3s",
                }}
              >
                <svg
                  width="16" height="16" viewBox="0 0 16 16" fill="none"
                  style={{ transition: "transform 0.4s cubic-bezier(0.34,1.56,0.64,1)" }}
                >
                  {[0, 1, 2].flatMap((row) =>
                    [0, 1, 2].map((col) => {
                      const isCentre = row === 1 && col === 1;
                      return (
                        <rect
                          key={`${row}-${col}`}
                          x={col * 5 + 0.5} y={row * 5 + 0.5}
                          width="3.5" height="3.5" rx="1"
                          fill="currentColor"
                          style={{
                            color: "var(--primary)",
                            opacity: isCentre ? 1 : 0.55,
                            filter: isCentre
                              ? "drop-shadow(0 0 3px color-mix(in oklab, var(--primary) 80%, transparent))"
                              : "none",
                          }}
                        />
                      );
                    })
                  )}
                </svg>
              </button>
            </div>

            {/* ── Balance number with count-up + glow breathe + micro glitch ── */}
            <div className="mt-5 flex items-start gap-2">
              <span
                className="text-[15px] font-bold uppercase tracking-widest mt-3 shrink-0 select-none"
                style={{
                  color: "color-mix(in oklab, var(--muted-foreground) 45%, transparent)",
                  animation: "w-meta-in 0.7s ease-out both 0.15s",
                }}
              >
                USD
              </span>

              <span
                className="w-balance-glow w-balance-glitch text-5xl md:text-[4.5rem] font-black tracking-tight leading-none tabular-nums select-none"
                style={{
                  background: [
                    "linear-gradient(145deg,",
                    "  oklch(0.98 0.01 200) 0%,",
                    "  color-mix(in oklab, var(--primary) 98%, oklch(0.98 0.01 200)) 45%,",
                    "  color-mix(in oklab, var(--primary) 75%, oklch(0.60 0.20 280)) 80%,",
                    "  color-mix(in oklab, var(--primary) 60%, transparent) 100%",
                    ")",
                  ].join(""),
                  WebkitBackgroundClip: "text",
                  backgroundClip: "text",
                  WebkitTextFillColor: "transparent",
                  animation: "w-balance-glow 3.8s ease-in-out infinite, w-glitch 11s ease-in-out infinite 3s",
                }}
              >
                {account.isLoading ? "…" : `$${fmt(displayBalance)}`}
              </span>
            </div>

            {/* ── Meta row ── */}
            <div
              className="mt-2.5 flex items-center gap-2.5 select-none"
              style={{ animation: "w-meta-in 0.8s ease-out both 0.25s" }}
            >
              <span className="text-[11px] font-bold uppercase tracking-[0.12em]"
                style={{ color: "color-mix(in oklab, var(--muted-foreground) 48%, transparent)" }}>
                {walletAssets.length} assets
              </span>
              <span className="h-3 w-px rounded-full"
                style={{ background: "color-mix(in oklab, var(--muted-foreground) 20%, transparent)" }} />
              <span
                className="flex items-center gap-1.5 text-[11px] font-semibold"
                style={{ color: "color-mix(in oklab, var(--muted-foreground) 55%, transparent)" }}
              >
                <span
                  className="inline-block h-1.5 w-1.5 rounded-full"
                  style={{
                    background: "var(--bull)",
                    boxShadow: "0 0 5px 1px color-mix(in oklab, var(--bull) 55%, transparent)",
                    animation: "w-dot-ring 2.8s ease-out infinite",
                  }}
                />
                live · Binance
              </span>
            </div>

            {/* ── Rainbow spectrum allocation bar ── */}
            {walletAssets.length > 0 && totalUsdt > 0 && (
              <div
                className="mt-5"
                style={{ animation: "w-meta-in 0.9s ease-out both 0.35s" }}
              >
                {/* Labels row */}
                <div className="flex items-center justify-between mb-1.5">
                  <span className="text-[9px] uppercase tracking-widest font-bold"
                    style={{ color: "color-mix(in oklab, var(--muted-foreground) 40%, transparent)" }}>
                    Portfolio allocation
                  </span>
                  <span className="text-[9px] uppercase tracking-widest font-bold"
                    style={{ color: "color-mix(in oklab, var(--muted-foreground) 40%, transparent)" }}>
                    {walletAssets.length} assets
                  </span>
                </div>

                {/* Bar */}
                <div className="relative flex rounded-full overflow-hidden" style={{ height: "7px", gap: "2px" }}>
                  {walletAssets.slice(0, 10).map((b, i) => {
                    const pct   = (b.usd / totalUsdt) * 100;
                    const color = SPECTRUM_COLORS[i % SPECTRUM_COLORS.length];
                    const isFirst = i === 0;
                    const isLast  = i === Math.min(walletAssets.length, 10) - 1;
                    return (
                      <div
                        key={b.asset}
                        title={`${b.asset} ${pct.toFixed(1)}%`}
                        style={{
                          flex: pct,
                          position: "relative",
                          overflow: "hidden",
                          background: `linear-gradient(90deg, ${color}bb 0%, ${color} 100%)`,
                          borderRadius: isFirst ? "999px 0 0 999px" : isLast ? "0 999px 999px 0" : "0",
                          boxShadow: `0 0 10px 1px ${color}55`,
                          minWidth: "4px",
                          transformOrigin: "left",
                          animation: `w-spectrum-in 0.8s cubic-bezier(0.22,1,0.36,1) both ${0.5 + i * 0.06}s`,
                        }}
                      >
                        {/* Inner shimmer on each segment */}
                        <div
                          style={{
                            position: "absolute", inset: 0,
                            background: "linear-gradient(90deg, transparent 0%, rgba(255,255,255,0.28) 50%, transparent 100%)",
                            animation: `w-spectrum-shimmer ${3.5 + i * 0.4}s ease-in-out infinite ${i * 0.3}s`,
                          }}
                        />
                      </div>
                    );
                  })}
                </div>

                {/* Coin name ticks below bar */}
                <div className="flex mt-1" style={{ gap: "2px" }}>
                  {walletAssets.slice(0, 10).map((b, i) => {
                    const pct   = (b.usd / totalUsdt) * 100;
                    const color = SPECTRUM_COLORS[i % SPECTRUM_COLORS.length];
                    return (
                      <div key={b.asset} style={{ flex: pct, minWidth: "4px", overflow: "hidden" }}>
                        <span style={{
                          display: "block",
                          fontSize: "8px",
                          fontWeight: 800,
                          letterSpacing: "0.04em",
                          color,
                          opacity: 0.75,
                          whiteSpace: "nowrap",
                          overflow: "hidden",
                          textOverflow: "clip",
                          lineHeight: 1,
                        }}>
                          {pct > 6 ? b.asset : ""}
                        </span>
                      </div>
                    );
                  })}
                </div>
              </div>
            )}

            {/* ── Divider ── */}
            {walletAssets.length > 0 && (
              <div
                className="mt-5 mb-4"
                style={{
                  height: "1px",
                  background: "linear-gradient(90deg, transparent 0%, color-mix(in oklab, var(--primary) 18%, transparent) 30%, oklch(0.78 0.07 200 / 15%) 70%, transparent 100%)",
                }}
              />
            )}

            {/* ── Coin asset cards ── */}
            {walletAssets.length > 0 && (
              <div
                key={cardAnimKey}
                className="flex gap-3 overflow-x-auto pb-2 -mx-1 px-1"
                style={{ scrollbarWidth: "none", msOverflowStyle: "none" } as React.CSSProperties}
              >
                {walletAssets.slice(0, 10).map((b, i) => {
                  const pct        = totalUsdt > 0 ? (b.usd / totalUsdt) * 100 : 0;
                  const accentColor = SPECTRUM_COLORS[i % SPECTRUM_COLORS.length];
                  const barWidth   = maxPct > 0 ? Math.min(100, (pct / maxPct) * 100) : 0;

                  return (
                    <div
                      key={b.asset}
                      className="shrink-0 flex flex-col relative overflow-hidden"
                      style={{
                        minWidth: "142px",
                        borderRadius: "14px",
                        padding: "11px 12px 12px",
                        background: [
                          "linear-gradient(160deg,",
                          `  ${accentColor}08 0%,`,
                          "  oklch(0.50 0.06 210 / 10%) 60%,",
                          "  oklch(0.40 0.06 210 / 7%) 100%",
                          ")",
                        ].join(""),
                        border: `1px solid ${accentColor}22`,
                        backdropFilter: "blur(16px)",
                        WebkitBackdropFilter: "blur(16px)",
                        transition: "border-color 0.25s, box-shadow 0.25s, transform 0.22s",
                        animation: `w-card-in 0.55s cubic-bezier(0.22,1,0.36,1) both ${i * 0.07}s`,
                        cursor: "default",
                      }}
                      onMouseEnter={(e) => {
                        const el = e.currentTarget as HTMLDivElement;
                        el.style.borderColor = `${accentColor}55`;
                        el.style.boxShadow = `0 0 24px -6px ${accentColor}50, 0 8px 24px -8px rgba(0,0,0,0.5), inset 0 1px 0 ${accentColor}20`;
                        el.style.transform = "translateY(-2px) scale(1.012)";
                        const shimmer = el.querySelector<HTMLDivElement>(".coin-shimmer");
                        if (shimmer) shimmer.style.animation = "w-card-shimmer 0.65s ease-in-out";
                      }}
                      onMouseLeave={(e) => {
                        const el = e.currentTarget as HTMLDivElement;
                        el.style.borderColor = `${accentColor}22`;
                        el.style.boxShadow = "none";
                        el.style.transform = "translateY(0) scale(1)";
                        const shimmer = el.querySelector<HTMLDivElement>(".coin-shimmer");
                        if (shimmer) shimmer.style.animation = "none";
                      }}
                    >
                      {/* Accent top bar */}
                      <div
                        className="absolute inset-x-0 top-0 rounded-t-[14px]"
                        style={{
                          height: "2.5px",
                          background: `linear-gradient(90deg, ${accentColor}00 0%, ${accentColor} 45%, ${accentColor}cc 100%)`,
                          boxShadow: `0 0 8px 1px ${accentColor}55`,
                        }}
                      />

                      {/* Hover shimmer */}
                      <div
                        className="coin-shimmer absolute inset-y-0 pointer-events-none"
                        style={{
                          width: "55%",
                          left: "-90%",
                          background: "linear-gradient(90deg, transparent, rgba(255,255,255,0.07), transparent)",
                          transform: "skewX(-15deg)",
                          animation: "none",
                        }}
                      />

                      {/* Icon + name row */}
                      <div className="flex items-center gap-2 relative">
                        {/* Coin icon with accent ring */}
                        <div
                          className="shrink-0 rounded-full p-[2.5px]"
                          style={{
                            background: `linear-gradient(145deg, ${accentColor}28, ${accentColor}10)`,
                            border: `1.5px solid ${accentColor}40`,
                            boxShadow: `0 0 10px -2px ${accentColor}45`,
                          }}
                        >
                          <CoinIcon symbol={b.asset} size={26} />
                        </div>

                        {/* Name + % badge */}
                        <div className="min-w-0 flex-1">
                          <div className="flex items-center justify-between gap-1">
                            <span
                              className="text-[13px] font-black tracking-tight truncate"
                              style={{ color: "oklch(0.97 0.01 200)" }}
                            >
                              {b.asset}
                            </span>
                            <span
                              className="text-[10px] font-black tabular-nums shrink-0 rounded-md px-1.5 py-0.5 leading-none"
                              style={{
                                color: accentColor,
                                background: `${accentColor}18`,
                                border: `1px solid ${accentColor}35`,
                                boxShadow: `0 0 6px -1px ${accentColor}30`,
                                letterSpacing: "0.02em",
                              }}
                            >
                              {pct.toFixed(1)}%
                            </span>
                          </div>
                        </div>
                      </div>

                      {/* USD value */}
                      <div className="mt-3 relative">
                        <span
                          className="text-[14px] font-black tabular-nums tracking-tight leading-none"
                          style={{
                            background: `linear-gradient(120deg, oklch(0.96 0.01 200), color-mix(in oklab, ${accentColor} 55%, oklch(0.96 0.01 200)))`,
                            WebkitBackgroundClip: "text",
                            backgroundClip: "text",
                            WebkitTextFillColor: "transparent",
                          }}
                        >
                          ${fmt(b.usd)}
                        </span>
                      </div>

                      {/* Mini allocation bar */}
                      <div
                        className="mt-2.5 rounded-full overflow-hidden"
                        style={{ height: "3px", background: `${accentColor}14` }}
                      >
                        <div
                          style={{
                            height: "100%",
                            width: `${barWidth}%`,
                            borderRadius: "999px",
                            background: `linear-gradient(90deg, ${accentColor}77, ${accentColor})`,
                            boxShadow: `0 0 6px 1px ${accentColor}55`,
                            transition: "width 0.8s cubic-bezier(0.22,1,0.36,1)",
                          }}
                        />
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </div>
        </section>
        {/* ══════════════════════════════════════════════════════════════════════ */}

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
                      <span className="text-[10px] font-bold px-2 py-0.5 rounded-md bg-primary/15 text-primary uppercase tracking-wider">{primary.type}</span>
                      <span className={`text-[10px] font-bold px-2 py-0.5 rounded-md uppercase tracking-wider ${primary.side === "SELL" ? "bg-bear/15 text-bear" : "bg-bull/15 text-bull"}`}>{primary.side}</span>
                    </div>
                    <div className="text-xs text-muted-foreground mt-1 flex items-center gap-1.5">
                      <span className="inline-block h-1.5 w-1.5 rounded-full bg-bull animate-pulse" />
                      Live · {fmt(orderQty, 4)} {orderBase}
                    </div>
                  </div>
                </div>
                <div className="text-right shrink-0">
                  <div className={`text-2xl md:text-4xl font-black tabular-nums ${pnlUsd >= 0 ? "text-bull" : "text-bear"}`}>
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
                <span className={`text-2xl md:text-3xl font-black tabular-nums transition-colors ${flash === "up" ? "text-bull" : flash === "down" ? "text-bear" : ""}`}>
                  ${cur ? fmtPrice(cur) : "…"}
                </span>
              </div>

              {/* ── DCA STEP ── */}
              {showDca && (
                <div
                  className="relative mt-4 rounded-xl overflow-hidden px-4 py-4"
                  style={{
                    background: "linear-gradient(135deg, color-mix(in oklab,var(--primary) 8%,var(--card)) 0%, color-mix(in oklab,var(--primary) 4%,var(--card)) 100%)",
                    border: "1px solid color-mix(in oklab,var(--primary) 28%,transparent)",
                    boxShadow: "inset 0 1px 0 color-mix(in oklab,var(--primary) 20%,transparent), 0 0 20px -8px color-mix(in oklab,var(--primary) 30%,transparent)",
                  }}
                >
                  <div className="absolute inset-x-0 top-0 h-px pointer-events-none" style={{ background: "linear-gradient(90deg, transparent, color-mix(in oklab,var(--primary) 60%,transparent), transparent)" }} />
                  <div className="absolute -top-4 -left-4 w-24 h-24 rounded-full pointer-events-none" style={{ background: "radial-gradient(circle, color-mix(in oklab,var(--primary) 12%,transparent), transparent 70%)" }} />
                  <div className="relative flex items-center justify-between mb-3">
                    <div className="flex items-center gap-1.5">
                      <Layers className="h-3.5 w-3.5" style={{ color: "var(--primary)" }} />
                      <span className="text-[10px] uppercase tracking-widest font-bold" style={{ color: "color-mix(in oklab,var(--primary) 80%,var(--muted-foreground))" }}>DCA Step</span>
                    </div>
                    <div className="flex items-baseline gap-1">
                      <span className="text-2xl font-black tabular-nums leading-none" style={{ color: "var(--primary)", textShadow: "0 0 16px color-mix(in oklab,var(--primary) 70%,transparent)", letterSpacing: "-0.02em" }}>{dcaStep}</span>
                      <span className="text-base font-black leading-none" style={{ color: "color-mix(in oklab,var(--muted-foreground) 50%,transparent)" }}>/{dcaTotal}</span>
                    </div>
                  </div>
                  <StepSegments step={dcaStep} total={dcaTotal} stepAmounts={dcaAmounts} stepTimestamps={dcaTimestamps} />
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
   NoActiveTrade
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
      <div className="flex items-center gap-2 text-[10px] uppercase tracking-widest font-bold text-muted-foreground mb-5">
        <span className="h-1.5 w-1.5 rounded-full bg-muted-foreground/50" />
        Last Closed Trade
      </div>
      <div className="flex items-center gap-4">
        <div className="relative shrink-0">
          <div className="absolute inset-0 rounded-full bg-muted/40 blur-md scale-110" />
          <CoinIcon symbol={lastTrade.base} size={56} className="relative" />
        </div>
        <div className="min-w-0 flex-1">
          <div className="text-2xl md:text-3xl font-black tracking-tight truncate">
            {lastTrade.base}
            <span className="text-sm font-semibold text-muted-foreground ml-1.5">/ USDT</span>
          </div>
          <div className="text-xs text-muted-foreground mt-0.5 font-medium truncate">
            Sold · ${fmtPrice(lastTrade.price)}
            {lastTrade.quoteQty > 0 && <span className="ml-2 text-muted-foreground/60">≈ ${fmt(lastTrade.quoteQty)}</span>}
          </div>
        </div>
        <span className="shrink-0 text-[10px] font-bold px-2.5 py-1 rounded-lg bg-bear/10 text-bear border border-bear/20 uppercase tracking-wider">Sold</span>
      </div>
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

  const [displayPct, setDisplayPct] = useState(w);
  const prevWRef = useRef(w);
  const timerRef = useRef<ReturnType<typeof setInterval> | null>(null);

  useEffect(() => {
    const start = prevWRef.current;
    const end = w;
    prevWRef.current = w;
    if (Math.abs(end - start) < 0.05) return;
    if (timerRef.current) clearInterval(timerRef.current);
    const STEPS = 28, DURATION_MS = 700;
    let step = 0;
    timerRef.current = setInterval(() => {
      step++;
      const t = step / STEPS;
      const eased = 1 - Math.pow(1 - t, 3);
      setDisplayPct(start + (end - start) * eased);
      if (step >= STEPS) { setDisplayPct(end); if (timerRef.current) clearInterval(timerRef.current); }
    }, DURATION_MS / STEPS);
    return () => { if (timerRef.current) clearInterval(timerRef.current); };
  }, [w]);

  const [popKey, setPopKey] = useState(0);
  const prevRounded = useRef(Math.round(w * 10));
  useEffect(() => {
    const next = Math.round(w * 10);
    if (next !== prevRounded.current) { prevRounded.current = next; setPopKey((k) => k + 1); }
  }, [w]);

  return (
    <div className="rounded-xl border border-border bg-muted/20 p-3 relative overflow-hidden">
      <style>{`
        @keyframes progress-glow-bull { 0%,100% { box-shadow: 0 0 2px 0px color-mix(in oklab,var(--bull) 12%,transparent); } 50% { box-shadow: 0 0 4px 1px color-mix(in oklab,var(--bull) 18%,transparent); } }
        @keyframes progress-glow-bear { 0%,100% { box-shadow: 0 0 2px 0px color-mix(in oklab,var(--bear) 12%,transparent); } 50% { box-shadow: 0 0 4px 1px color-mix(in oklab,var(--bear) 18%,transparent); } }
        @keyframes progress-shimmer { 0% { transform: translateX(-160%) skewX(-12deg); opacity:0; } 20% { opacity:0.6; } 80% { opacity:0.6; } 100% { transform: translateX(280%) skewX(-12deg); opacity:0; } }
        @keyframes progress-tip-beat-bull { 0%,100% { transform:translateY(-50%) scale(1); } 50% { transform:translateY(-50%) scale(1.15); } }
        @keyframes progress-tip-beat-bear { 0%,100% { transform:translateY(-50%) scale(1); } 50% { transform:translateY(-50%) scale(1.15); } }
        @keyframes pct-badge-pop { 0% { transform:translateX(-50%) scale(0.75); opacity:0; } 60% { transform:translateX(-50%) scale(1.12); opacity:1; } 100% { transform:translateX(-50%) scale(1); opacity:1; } }
        @keyframes pct-digit-up { 0% { transform:translateY(60%); opacity:0; } 100% { transform:translateY(0); opacity:1; } }
        .progress-bar-glow-bull { animation: progress-glow-bull 2s ease-in-out infinite; }
        .progress-bar-glow-bear { animation: progress-glow-bear 2s ease-in-out 0.4s infinite; }
        .progress-shimmer        { animation: progress-shimmer 2.4s ease-in-out infinite; }
        .progress-tip-bull       { animation: progress-tip-beat-bull 1.8s ease-in-out infinite; }
        .progress-tip-bear       { animation: progress-tip-beat-bear 1.8s ease-in-out 0.4s infinite; }
        .pct-badge-pop           { animation: pct-badge-pop 0.35s cubic-bezier(0.22,1,0.36,1) both; }
        .pct-digit-up            { animation: pct-digit-up 0.22s ease-out both; }
      `}</style>

      <div className="flex items-center justify-between text-[10px] uppercase tracking-widest font-bold text-muted-foreground">
        <span className="flex items-center gap-1.5">{icon}{label}</span>
        <span className={`text-sm font-black tabular-nums ${isBull ? "text-bull" : "text-bear"}`}>{rightValue}</span>
      </div>

      <div className="relative mt-5" style={{ paddingBottom: "2px" }}>
        <div className="relative h-2 rounded-full bg-muted/60" style={{ overflow: "visible" }}>
          <div
            className={`relative h-full rounded-full transition-[width] duration-700 overflow-hidden ${isBull ? "progress-bar-glow-bull" : "progress-bar-glow-bear"}`}
            style={{ width: `${w}%`, background: isBull ? "linear-gradient(90deg, color-mix(in oklab,var(--bull) 55%,transparent), var(--bull))" : "linear-gradient(90deg, color-mix(in oklab,var(--bear) 55%,transparent), var(--bear))" }}
          >
            <div className="progress-shimmer absolute inset-y-0 pointer-events-none" style={{ width: "38%", background: "linear-gradient(90deg, transparent, rgba(255,255,255,0.42), transparent)", borderRadius: "999px" }} />
          </div>

          {w > 3 && (
            <div className={isBull ? "progress-tip-bull" : "progress-tip-bear"} style={{ position: "absolute", top: "50%", left: `calc(${w}% - 5px)`, width: "10px", height: "10px", borderRadius: "999px", background: isBull ? "var(--bull)" : "var(--bear)", zIndex: 10, pointerEvents: "none" }} />
          )}

          {w > 3 && (
            <div key={popKey} className="pct-badge-pop" style={{ position: "absolute", top: "-26px", left: `${w}%`, transform: "translateX(-50%)", pointerEvents: "none", zIndex: 20 }}>
              <div style={{ display: "inline-flex", alignItems: "center", padding: "2px 6px", borderRadius: "999px", fontSize: "9px", fontWeight: 900, fontVariantNumeric: "tabular-nums", lineHeight: 1, whiteSpace: "nowrap", background: isBull ? "color-mix(in oklab,var(--bull) 18%,var(--card))" : "color-mix(in oklab,var(--bear) 18%,var(--card))", border: isBull ? "1px solid color-mix(in oklab,var(--bull) 50%,transparent)" : "1px solid color-mix(in oklab,var(--bear) 50%,transparent)", color: isBull ? "var(--bull)" : "var(--bear)" }}>
                <span key={`${popKey}-num`} className="pct-digit-up">{displayPct.toFixed(1)}%</span>
              </div>
              <div style={{ position: "absolute", left: "50%", transform: "translateX(-50%)", top: "100%", width: "1px", height: "8px", background: isBull ? "linear-gradient(to bottom,color-mix(in oklab,var(--bull) 60%,transparent),transparent)" : "linear-gradient(to bottom,color-mix(in oklab,var(--bear) 60%,transparent),transparent)" }} />
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
