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

      {/* Outer row — nodes + connectors; labels sit below each node */}
      <div style={{ display: "flex", alignItems: "flex-start", width: "100%" }}>
        {Array.from({ length: total }).map((_, i) => {
          const filled    = i < step;
          const isActive  = i === step - 1;
          const isPast    = filled && !isActive;
          const isLast    = i === total - 1;
          const isHovered = hoveredIdx === i;

          const nodeSize      = isActive ? 30 : isPast ? 22 : 20;
          const borderW       = isActive ? 2 : isPast ? 0 : 1.5;
          const NODE_CONTAINER = 32; // fixed height so connector always centres correctly

          const statusLabel  = isPast ? "Completed" : isActive ? "Active" : "Pending";
          const statusColor  = isPast || isActive ? "var(--primary)" : "color-mix(in oklab,var(--muted-foreground) 55%,transparent)";
          const statusBg     = isPast ? "color-mix(in oklab,var(--primary) 18%,var(--card))" : isActive ? "color-mix(in oklab,var(--primary) 12%,var(--card))" : "color-mix(in oklab,var(--muted-foreground) 8%,var(--card))";
          const statusBorder = isPast || isActive ? "color-mix(in oklab,var(--primary) 35%,transparent)" : "color-mix(in oklab,var(--muted-foreground) 18%,transparent)";

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
                      background: "color-mix(in oklab,var(--card) 92%,transparent)",
                      backdropFilter: "blur(14px)",
                      WebkitBackdropFilter: "blur(14px)",
                      border: `1px solid color-mix(in oklab,var(--primary) ${isPast || isActive ? "30%" : "14%"},transparent)`,
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
                      <div style={{ margin: "6px 0", height: "1px", background: `linear-gradient(90deg,transparent,color-mix(in oklab,var(--primary) ${isPast || isActive ? "25%" : "10%"},transparent),transparent)` }} />
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
                      background: "color-mix(in oklab,var(--card) 92%,transparent)",
                      backdropFilter: "blur(14px)",
                      border: `1px solid color-mix(in oklab,var(--primary) ${isPast || isActive ? "30%" : "14%"},transparent)`,
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
                      background: isActive
                        ? "radial-gradient(circle at 35% 35%, color-mix(in oklab,var(--primary) 22%,var(--card)), var(--card))"
                        : isPast ? "var(--primary)"
                        : "color-mix(in oklab,var(--primary) 7%,var(--card))",
                      border: isActive
                        ? `${borderW}px solid var(--primary)`
                        : isPast ? "none"
                        : `${borderW}px solid color-mix(in oklab,var(--primary) 20%,var(--card))`,
                      ...(isHovered && !isActive ? {
                        transform: "scale(1.12)",
                        boxShadow: `0 0 0 3px color-mix(in oklab,var(--primary) ${isPast ? "22%" : "12%"},transparent), 0 4px 12px -2px rgba(0,0,0,0.4)`,
                      } : {}),
                    }}
                  >
                    {isActive && (
                      <div style={{
                        position: "absolute", inset: "-5px", borderRadius: "50%",
                        border: "1.5px dashed color-mix(in oklab,var(--primary) 35%,transparent)",
                        animation: "dca-ring-spin 8s linear infinite",
                      }} />
                    )}
                    {isPast ? (
                      <svg className="dca-check-pop" viewBox="0 0 12 12" width="11" height="11" fill="none" stroke="var(--card)" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
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
                  {amount != null ? (
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
                    background: isPast
                      ? "linear-gradient(90deg, color-mix(in oklab,var(--primary) 70%,transparent), color-mix(in oklab,var(--primary) 50%,transparent))"
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

        {/* ── WALLET CARD (PREMIUM) ── */}
        <section
          className="rounded-2xl relative overflow-hidden"
          style={{
            padding: "1.25rem 1.5rem",
            background:
              "linear-gradient(135deg, color-mix(in oklab, var(--primary) 8%, oklch(0.18 0.05 215 / 70%)) 0%, oklch(0.14 0.04 215 / 65%) 55%, color-mix(in oklab, var(--primary) 4%, oklch(0.16 0.04 215 / 60%)) 100%)",
            backdropFilter: "blur(28px) saturate(180%)",
            WebkitBackdropFilter: "blur(28px) saturate(180%)",
            border: "1px solid color-mix(in oklab, var(--primary) 28%, oklch(0.80 0.06 200 / 12%))",
            boxShadow:
              "0 0 0 1px color-mix(in oklab, var(--primary) 6%, transparent), " +
              "0 0 60px -15px color-mix(in oklab, var(--primary) 28%, transparent), " +
              "0 20px 60px -20px rgba(0,0,0,0.6), " +
              "inset 0 1px 0 color-mix(in oklab, var(--primary) 18%, oklch(0.90 0.04 200 / 8%))",
          }}
        >
          <style>{`
            @keyframes wallet-scan {
              0%   { top: 0%; opacity: 0; }
              8%   { opacity: 1; }
              92%  { opacity: 0.6; }
              100% { top: 100%; opacity: 0; }
            }
            @keyframes wallet-orb-drift {
              0%, 100% { transform: scale(1) translate(0, 0); opacity: 0.18; }
              33%       { transform: scale(1.06) translate(6px, -4px); opacity: 0.26; }
              66%       { transform: scale(0.96) translate(-4px, 3px); opacity: 0.20; }
            }
            @keyframes wallet-orb-drift-2 {
              0%, 100% { transform: scale(1) translate(0, 0); opacity: 0.12; }
              40%       { transform: scale(1.08) translate(-5px, 4px); opacity: 0.20; }
              70%       { transform: scale(0.94) translate(3px, -3px); opacity: 0.14; }
            }
            @keyframes wallet-border-pulse {
              0%, 100% { opacity: 0.55; }
              50%       { opacity: 1; }
            }
            @keyframes wallet-chip-shimmer {
              0%   { transform: translateX(-120%) skewX(-12deg); }
              100% { transform: translateX(300%) skewX(-12deg); }
            }
            @keyframes wallet-number-glow {
              0%, 100% { filter: drop-shadow(0 0 12px color-mix(in oklab, var(--primary) 22%, transparent)); }
              50%       { filter: drop-shadow(0 0 28px color-mix(in oklab, var(--primary) 38%, transparent)); }
            }
            .wallet-scan-line    { animation: wallet-scan 5s ease-in-out infinite; }
            .wallet-orb-1        { animation: wallet-orb-drift 7s ease-in-out infinite; }
            .wallet-orb-2        { animation: wallet-orb-drift-2 9s ease-in-out 1.5s infinite; }
            .wallet-border-pulse { animation: wallet-border-pulse 3s ease-in-out infinite; }
            .wallet-chip-shimmer { animation: wallet-chip-shimmer 3.8s ease-in-out infinite; }
            .wallet-number-glow  { animation: wallet-number-glow 3s ease-in-out infinite; }
          `}</style>

          {/* ── Ambient orbs ── */}
          <div
            className="wallet-orb-1 pointer-events-none absolute rounded-full"
            style={{
              top: "-40px", right: "-30px", width: "200px", height: "200px",
              background: "radial-gradient(circle, color-mix(in oklab, var(--primary) 22%, transparent) 0%, transparent 70%)",
            }}
          />
          <div
            className="wallet-orb-2 pointer-events-none absolute rounded-full"
            style={{
              bottom: "-30px", left: "-20px", width: "140px", height: "140px",
              background: "radial-gradient(circle, color-mix(in oklab, var(--primary) 14%, transparent) 0%, transparent 70%)",
            }}
          />

          {/* ── Scanning line ── */}
          <div
            className="wallet-scan-line pointer-events-none absolute inset-x-0 h-px"
            style={{
              background:
                "linear-gradient(90deg, transparent 0%, color-mix(in oklab, var(--primary) 0%, transparent) 5%, color-mix(in oklab, var(--primary) 80%, transparent) 40%, color-mix(in oklab, var(--primary) 100%, transparent) 50%, color-mix(in oklab, var(--primary) 80%, transparent) 60%, color-mix(in oklab, var(--primary) 0%, transparent) 95%, transparent 100%)",
              zIndex: 2,
            }}
          />

          {/* ── Top edge highlight ── */}
          <div
            className="wallet-border-pulse pointer-events-none absolute inset-x-0 top-0 h-px"
            style={{
              background:
                "linear-gradient(90deg, transparent 0%, color-mix(in oklab, var(--primary) 50%, transparent) 25%, color-mix(in oklab, var(--primary) 90%, transparent) 50%, color-mix(in oklab, var(--primary) 50%, transparent) 75%, transparent 100%)",
            }}
          />

          {/* ── Corner brackets ── */}
          {/* top-left */}
          <div className="pointer-events-none absolute" style={{ top: 10, left: 10, width: 18, height: 18, borderTop: "1.5px solid var(--primary)", borderLeft: "1.5px solid var(--primary)", opacity: 0.65, borderRadius: "2px 0 0 0" }} />
          {/* top-right */}
          <div className="pointer-events-none absolute" style={{ top: 10, right: 10, width: 18, height: 18, borderTop: "1.5px solid var(--primary)", borderRight: "1.5px solid var(--primary)", opacity: 0.65, borderRadius: "0 2px 0 0" }} />
          {/* bottom-left */}
          <div className="pointer-events-none absolute" style={{ bottom: 10, left: 10, width: 18, height: 18, borderBottom: "1.5px solid var(--primary)", borderLeft: "1.5px solid var(--primary)", opacity: 0.65, borderRadius: "0 0 0 2px" }} />
          {/* bottom-right */}
          <div className="pointer-events-none absolute" style={{ bottom: 10, right: 10, width: 18, height: 18, borderBottom: "1.5px solid var(--primary)", borderRight: "1.5px solid var(--primary)", opacity: 0.65, borderRadius: "0 0 2px 0" }} />

          {/* ── Content ── */}
          <div className="relative" style={{ zIndex: 3 }}>

            {/* Header row */}
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2.5">
                {/* Icon box */}
                <div
                  className="flex items-center justify-center rounded-lg"
                  style={{
                    width: 30, height: 30,
                    background: "color-mix(in oklab, var(--primary) 14%, oklch(0.55 0.06 210 / 20%))",
                    border: "1px solid color-mix(in oklab, var(--primary) 30%, transparent)",
                    boxShadow: "0 0 12px -4px color-mix(in oklab, var(--primary) 40%, transparent), inset 0 1px 0 color-mix(in oklab, var(--primary) 20%, transparent)",
                  }}
                >
                  <WalletIcon style={{ width: 14, height: 14, color: "var(--primary)" }} />
                </div>
                <div>
                  <div className="flex items-center gap-1.5" style={{ fontSize: 10, fontWeight: 800, letterSpacing: "0.10em", textTransform: "uppercase", color: "color-mix(in oklab, var(--primary) 85%, var(--muted-foreground))" }}>
                    Portfolio
                    <span style={{ width: 4, height: 4, borderRadius: "50%", background: "var(--primary)", display: "inline-block", boxShadow: "0 0 5px var(--primary)" }} />
                    <span style={{ color: "color-mix(in oklab, var(--muted-foreground) 55%, transparent)", fontWeight: 600 }}>
                      {walletAssets.length} assets
                    </span>
                  </div>
                </div>
              </div>

              {/* Live pill */}
              <div
                className="flex items-center gap-1.5"
                style={{
                  padding: "4px 10px",
                  borderRadius: 999,
                  fontSize: 9,
                  fontWeight: 800,
                  letterSpacing: "0.09em",
                  textTransform: "uppercase",
                  color: "var(--primary)",
                  background: "color-mix(in oklab, var(--primary) 10%, oklch(0.55 0.06 210 / 12%))",
                  border: "1px solid color-mix(in oklab, var(--primary) 28%, transparent)",
                  boxShadow: "0 0 10px -4px color-mix(in oklab, var(--primary) 30%, transparent)",
                }}
              >
                <span className="animate-pulse" style={{ width: 5, height: 5, borderRadius: "50%", background: "var(--primary)", display: "inline-block", boxShadow: "0 0 4px var(--primary)" }} />
                Live
              </div>
            </div>

            {/* Total value */}
            <div className="mt-4">
              <div style={{ fontSize: 10, fontWeight: 600, letterSpacing: "0.07em", textTransform: "uppercase", color: "color-mix(in oklab, var(--muted-foreground) 55%, transparent)", marginBottom: 4 }}>
                Total Portfolio Value
              </div>
              <div className="flex items-end gap-3 flex-wrap">
                {account.isLoading ? (
                  <span style={{ fontSize: "clamp(2.2rem,7vw,3.5rem)", fontWeight: 900, lineHeight: 1, color: "color-mix(in oklab, var(--muted-foreground) 30%, transparent)", letterSpacing: "-0.03em" }}>
                    —
                  </span>
                ) : (
                  <span
                    className="wallet-number-glow"
                    style={{
                      fontSize: "clamp(2.2rem,7vw,3.5rem)",
                      fontWeight: 900,
                      lineHeight: 1,
                      letterSpacing: "-0.03em",
                      background: "linear-gradient(135deg, oklch(0.96 0.01 200) 0%, var(--primary) 55%, color-mix(in oklab, var(--primary) 75%, white) 100%)",
                      WebkitBackgroundClip: "text",
                      WebkitTextFillColor: "transparent",
                      backgroundClip: "text",
                    }}
                  >
                    ${fmt(totalUsdt)}
                  </span>
                )}
                <div
                  style={{
                    marginBottom: 6,
                    padding: "3px 8px",
                    borderRadius: 6,
                    fontSize: 10,
                    fontWeight: 800,
                    letterSpacing: "0.06em",
                    color: "color-mix(in oklab, var(--primary) 90%, white)",
                    background: "color-mix(in oklab, var(--primary) 12%, transparent)",
                    border: "1px solid color-mix(in oklab, var(--primary) 22%, transparent)",
                  }}
                >
                  USDT
                </div>
              </div>
            </div>

            {/* Portfolio allocation bar */}
            {walletAssets.length > 0 && totalUsdt > 0 && (
              <div className="mt-4">
                {/* Segmented bar */}
                <div
                  className="flex gap-0.5 overflow-hidden"
                  style={{ height: 5, borderRadius: 999, background: "color-mix(in oklab, var(--muted-foreground) 8%, transparent)" }}
                >
                  {walletAssets.slice(0, 7).map((b, idx) => {
                    const pct = (b.usd / totalUsdt) * 100;
                    // Hue rotation through the teal-cyan spectrum for visual variety
                    const hues = [165, 185, 148, 200, 138, 175, 155];
                    const lightness = [0.75, 0.70, 0.78, 0.68, 0.80, 0.72, 0.76];
                    return (
                      <div
                        key={b.asset}
                        style={{
                          width: `${pct}%`,
                          minWidth: pct > 0 ? 3 : 0,
                          height: "100%",
                          borderRadius: 999,
                          background: idx === 0
                            ? `linear-gradient(90deg, color-mix(in oklab, oklch(${lightness[0]} 0.18 ${hues[0]}) 70%, transparent), oklch(${lightness[0]} 0.18 ${hues[0]}))`
                            : `oklch(${lightness[idx % lightness.length]} 0.14 ${hues[idx % hues.length]})`,
                          transition: "width 0.7s ease",
                          opacity: 1 - idx * 0.08,
                        }}
                      />
                    );
                  })}
                </div>

                {/* Legend */}
                <div className="mt-2 flex items-center gap-x-3 gap-y-1 flex-wrap">
                  {walletAssets.slice(0, 5).map((b) => {
                    const pct = (b.usd / totalUsdt) * 100;
                    return (
                      <span key={b.asset} style={{ fontSize: 9, color: "color-mix(in oklab, var(--muted-foreground) 55%, transparent)", fontVariantNumeric: "tabular-nums" }}>
                        <span style={{ fontWeight: 800, color: "var(--muted-foreground)" }}>{b.asset}</span>
                        {" "}{pct.toFixed(1)}%
                      </span>
                    );
                  })}
                  {walletAssets.length > 5 && (
                    <span style={{ fontSize: 9, color: "color-mix(in oklab, var(--muted-foreground) 38%, transparent)" }}>
                      +{walletAssets.length - 5} more
                    </span>
                  )}
                </div>
              </div>
            )}

            {/* ── Asset chips ── */}
            {walletAssets.length > 0 && (
              <div
                className="mt-4 flex gap-2 pb-1 -mx-1 px-1"
                style={{ overflowX: "auto", scrollbarWidth: "none" }}
              >
                {walletAssets.slice(0, 10).map((b, idx) => {
                  const pct = totalUsdt > 0 ? (b.usd / totalUsdt) * 100 : 0;
                  const isTop = idx === 0;

                  return (
                    <div
                      key={b.asset}
                      className="shrink-0 relative overflow-hidden"
                      style={{
                        minWidth: 158,
                        padding: "10px 12px",
                        borderRadius: 14,
                        cursor: "default",
                        background: isTop
                          ? "linear-gradient(135deg, color-mix(in oklab, var(--primary) 14%, oklch(0.22 0.06 215 / 60%)) 0%, color-mix(in oklab, var(--primary) 6%, oklch(0.18 0.05 215 / 55%)) 100%)"
                          : "oklch(0.18 0.05 215 / 45%)",
                        border: isTop
                          ? "1px solid color-mix(in oklab, var(--primary) 38%, transparent)"
                          : "1px solid color-mix(in oklab, var(--primary) 10%, oklch(0.80 0.06 200 / 10%))",
                        backdropFilter: "blur(14px)",
                        WebkitBackdropFilter: "blur(14px)",
                        boxShadow: isTop
                          ? "0 0 24px -8px color-mix(in oklab, var(--primary) 35%, transparent), inset 0 1px 0 color-mix(in oklab, var(--primary) 18%, transparent), 0 4px 16px -6px rgba(0,0,0,0.5)"
                          : "inset 0 1px 0 oklch(0.90 0.04 200 / 5%), 0 2px 10px -4px rgba(0,0,0,0.4)",
                        transition: "border-color 0.2s ease, box-shadow 0.2s ease",
                      }}
                    >
                      {/* Shimmer sweep on top chip */}
                      {isTop && (
                        <div
                          className="wallet-chip-shimmer pointer-events-none absolute inset-y-0"
                          style={{
                            width: "35%",
                            background: "linear-gradient(90deg, transparent, rgba(255,255,255,0.07), transparent)",
                            borderRadius: 14,
                          }}
                        />
                      )}

                      {/* Top row: icon + percentage */}
                      <div className="flex items-center justify-between mb-2">
                        <CoinIcon symbol={b.asset} size={26} />
                        <span
                          style={{
                            fontSize: 10,
                            fontWeight: 800,
                            fontVariantNumeric: "tabular-nums",
                            color: isTop
                              ? "var(--primary)"
                              : "color-mix(in oklab, var(--muted-foreground) 55%, transparent)",
                            letterSpacing: "-0.01em",
                            ...(isTop
                              ? { filter: "drop-shadow(0 0 4px color-mix(in oklab, var(--primary) 55%, transparent))" }
                              : {}),
                          }}
                        >
                          {pct.toFixed(1)}%
                        </span>
                      </div>

                      {/* Asset name */}
                      <div style={{ fontSize: 12, fontWeight: 900, letterSpacing: "-0.01em", lineHeight: 1.1, color: "var(--foreground)" }}>
                        {b.asset}
                      </div>

                      {/* USD value */}
                      <div style={{ fontSize: 11, fontWeight: 600, fontVariantNumeric: "tabular-nums", marginTop: 2, color: "color-mix(in oklab, var(--muted-foreground) 75%, transparent)" }}>
                        ${fmt(b.usd)}
                      </div>

                      {/* Mini allocation bar */}
                      <div
                        style={{
                          marginTop: 8,
                          height: 2,
                          borderRadius: 999,
                          background: "color-mix(in oklab, var(--muted-foreground) 10%, transparent)",
                          overflow: "hidden",
                        }}
                      >
                        <div
                          style={{
                            width: `${Math.min(100, pct)}%`,
                            height: "100%",
                            borderRadius: 999,
                            background: isTop
                              ? "linear-gradient(90deg, color-mix(in oklab, var(--primary) 55%, transparent), var(--primary))"
                              : "color-mix(in oklab, var(--primary) 32%, transparent)",
                            boxShadow: isTop ? "0 0 4px var(--primary)" : "none",
                            transition: "width 0.7s ease",
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

                  <StepSegments
                    step={dcaStep}
                    total={dcaTotal}
                    stepAmounts={dcaAmounts}
                    stepTimestamps={dcaTimestamps}
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
