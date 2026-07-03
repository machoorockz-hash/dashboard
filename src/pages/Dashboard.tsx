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
          const NODE_CONTAINER = 32;

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

              {/* ── Connector line ── */}
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
      if (entry > 0) out.push({ price: entry, label: `Entry ${fmtPrice(entry)}`, color: "#a3b1c2" });
      if (tpPrice > 0) out.push({ price: tpPrice, label: `TP ${fmtPrice(tpPrice)}`, color: "#10b981" });
      if (slPrice > 0) out.push({ price: slPrice, label: `SL ${fmtPrice(slPrice)}`, color: "#ef4444" });
    }
    return out;
  }, [orderSymbol, chartSymbol, entry, tpPrice, slPrice]);

  return (
    <AppLayout>
      <style>{`
        @keyframes orb-drift-a {
          0%, 100% { transform: scale(1) translate(0, 0); opacity: 0.14; }
          40%       { transform: scale(1.07) translate(8px, -5px); opacity: 0.20; }
          70%       { transform: scale(0.95) translate(-4px, 3px); opacity: 0.16; }
        }
        @keyframes orb-drift-b {
          0%, 100% { transform: scale(1) translate(0, 0); opacity: 0.09; }
          35%       { transform: scale(1.05) translate(-6px, 5px); opacity: 0.14; }
          65%       { transform: scale(0.97) translate(4px, -3px); opacity: 0.10; }
        }
        @keyframes wallet-value-in {
          0%   { opacity: 0; transform: translateY(8px); }
          100% { opacity: 1; transform: translateY(0); }
        }
        .orb-a { animation: orb-drift-a 9s ease-in-out infinite; }
        .orb-b { animation: orb-drift-b 11s ease-in-out 2s infinite; }
        .wallet-value-in { animation: wallet-value-in 0.55s cubic-bezier(0.22,1,0.36,1) both; }
      `}</style>

      <div className="space-y-4">

        {/* ── PORTFOLIO CARD ── */}
        <section
          className="rounded-2xl relative overflow-hidden"
          style={{
            padding: "1.5rem",
            background: "linear-gradient(160deg, oklch(0.17 0.035 235) 0%, oklch(0.13 0.025 225) 45%, oklch(0.15 0.03 230) 100%)",
            border: "1px solid oklch(0.28 0.04 230 / 60%)",
            boxShadow:
              "0 1px 0 inset oklch(0.55 0.06 200 / 14%), " +
              "0 32px 64px -20px rgba(0,0,0,0.7), " +
              "0 8px 24px -8px rgba(0,0,0,0.5)",
          }}
        >
          {/* Subtle top accent line */}
          <div
            className="pointer-events-none absolute inset-x-0 top-0 h-px"
            style={{
              background: "linear-gradient(90deg, transparent 5%, color-mix(in oklab, var(--primary) 55%, transparent) 35%, color-mix(in oklab, var(--primary) 70%, transparent) 50%, color-mix(in oklab, var(--primary) 55%, transparent) 65%, transparent 95%)",
            }}
          />

          {/* Ambient orbs */}
          <div
            className="orb-a pointer-events-none absolute rounded-full"
            style={{
              top: "-60px", right: "-40px", width: "240px", height: "240px",
              background: "radial-gradient(circle, color-mix(in oklab, var(--primary) 18%, transparent) 0%, transparent 68%)",
            }}
          />
          <div
            className="orb-b pointer-events-none absolute rounded-full"
            style={{
              bottom: "-50px", left: "-30px", width: "180px", height: "180px",
              background: "radial-gradient(circle, color-mix(in oklab, var(--primary) 11%, transparent) 0%, transparent 65%)",
            }}
          />

          {/* Content */}
          <div className="relative" style={{ zIndex: 2 }}>

            {/* Header */}
            <div className="flex items-center justify-between mb-5">
              <div className="flex items-center gap-2.5">
                <div
                  className="flex items-center justify-center rounded-xl"
                  style={{
                    width: 34, height: 34,
                    background: "color-mix(in oklab, var(--primary) 12%, oklch(0.22 0.05 220 / 50%))",
                    border: "1px solid color-mix(in oklab, var(--primary) 22%, transparent)",
                    boxShadow: "0 2px 8px -2px rgba(0,0,0,0.4)",
                  }}
                >
                  <WalletIcon style={{ width: 15, height: 15, color: "var(--primary)" }} />
                </div>
                <div>
                  <div style={{ fontSize: 11, fontWeight: 700, letterSpacing: "0.08em", textTransform: "uppercase", color: "color-mix(in oklab, var(--primary) 75%, var(--muted-foreground))" }}>
                    Portfolio
                  </div>
                  <div style={{ fontSize: 10, color: "color-mix(in oklab, var(--muted-foreground) 45%, transparent)", fontWeight: 500, marginTop: 1 }}>
                    {walletAssets.length} assets tracked
                  </div>
                </div>
              </div>

              {/* Live pill — clean and minimal */}
              <div
                className="flex items-center gap-1.5"
                style={{
                  padding: "5px 11px",
                  borderRadius: 999,
                  fontSize: 10,
                  fontWeight: 700,
                  letterSpacing: "0.06em",
                  textTransform: "uppercase",
                  color: "var(--primary)",
                  background: "color-mix(in oklab, var(--primary) 8%, transparent)",
                  border: "1px solid color-mix(in oklab, var(--primary) 20%, transparent)",
                }}
              >
                <span className="animate-pulse" style={{ width: 5, height: 5, borderRadius: "50%", background: "var(--primary)", display: "inline-block" }} />
                Live
              </div>
            </div>

            {/* Total value — hero number */}
            <div>
              <div style={{ fontSize: 10, fontWeight: 600, letterSpacing: "0.07em", textTransform: "uppercase", color: "color-mix(in oklab, var(--muted-foreground) 45%, transparent)", marginBottom: 6 }}>
                Total Value
              </div>
              <div className="flex items-end gap-3 flex-wrap">
                {account.isLoading ? (
                  <span style={{ fontSize: "clamp(2.4rem,8vw,3.8rem)", fontWeight: 900, lineHeight: 1, color: "color-mix(in oklab, var(--muted-foreground) 20%, transparent)", letterSpacing: "-0.04em" }}>
                    —
                  </span>
                ) : (
                  <span
                    className="wallet-value-in"
                    style={{
                      fontSize: "clamp(2.4rem,8vw,3.8rem)",
                      fontWeight: 900,
                      lineHeight: 1,
                      letterSpacing: "-0.04em",
                      color: "oklch(0.96 0.015 200)",
                    }}
                  >
                    ${fmt(totalUsdt)}
                  </span>
                )}
                <div
                  style={{
                    marginBottom: 7,
                    padding: "3px 8px",
                    borderRadius: 6,
                    fontSize: 10,
                    fontWeight: 700,
                    letterSpacing: "0.05em",
                    color: "color-mix(in oklab, var(--primary) 80%, white)",
                    background: "color-mix(in oklab, var(--primary) 10%, transparent)",
                    border: "1px solid color-mix(in oklab, var(--primary) 18%, transparent)",
                  }}
                >
                  USDT
                </div>
              </div>
            </div>

            {/* Allocation bar */}
            {walletAssets.length > 0 && totalUsdt > 0 && (
              <div className="mt-5">
                <div
                  className="flex overflow-hidden gap-px"
                  style={{ height: 4, borderRadius: 999, background: "oklch(0.28 0.03 230 / 40%)" }}
                >
                  {walletAssets.slice(0, 7).map((b, idx) => {
                    const pct = (b.usd / totalUsdt) * 100;
                    const hues = [165, 185, 148, 200, 138, 175, 155];
                    const lightness = [0.72, 0.67, 0.75, 0.65, 0.77, 0.69, 0.73];
                    return (
                      <div
                        key={b.asset}
                        style={{
                          width: `${pct}%`,
                          minWidth: pct > 0 ? 3 : 0,
                          height: "100%",
                          borderRadius: 999,
                          background: `oklch(${lightness[idx % lightness.length]} 0.15 ${hues[idx % hues.length]})`,
                          transition: "width 0.7s ease",
                          opacity: 1 - idx * 0.1,
                        }}
                      />
                    );
                  })}
                </div>
                <div className="mt-2.5 flex items-center gap-x-3 gap-y-1 flex-wrap">
                  {walletAssets.slice(0, 5).map((b) => {
                    const pct = (b.usd / totalUsdt) * 100;
                    return (
                      <span key={b.asset} style={{ fontSize: 10, color: "color-mix(in oklab, var(--muted-foreground) 50%, transparent)", fontVariantNumeric: "tabular-nums" }}>
                        <span style={{ fontWeight: 700, color: "oklch(0.80 0.05 210)" }}>{b.asset}</span>
                        {" "}{pct.toFixed(1)}%
                      </span>
                    );
                  })}
                  {walletAssets.length > 5 && (
                    <span style={{ fontSize: 10, color: "color-mix(in oklab, var(--muted-foreground) 35%, transparent)" }}>
                      +{walletAssets.length - 5} more
                    </span>
                  )}
                </div>
              </div>
            )}

            {/* Asset chips — premium card style */}
            {walletAssets.length > 0 && (
              <div
                className="mt-5 flex gap-2.5 pb-1 -mx-1 px-1"
                style={{ overflowX: "auto", scrollbarWidth: "none" }}
              >
                {walletAssets.slice(0, 10).map((b, idx) => {
                  const pct = totalUsdt > 0 ? (b.usd / totalUsdt) * 100 : 0;
                  const isTop = idx === 0;

                  return (
                    <div
                      key={b.asset}
                      className="shrink-0"
                      style={{
                        minWidth: 148,
                        padding: "12px 13px",
                        borderRadius: 16,
                        cursor: "default",
                        background: isTop
                          ? "linear-gradient(145deg, oklch(0.22 0.06 220 / 80%) 0%, oklch(0.18 0.04 225 / 70%) 100%)"
                          : "oklch(0.19 0.04 228 / 55%)",
                        border: isTop
                          ? "1px solid color-mix(in oklab, var(--primary) 30%, oklch(0.40 0.05 220 / 40%))"
                          : "1px solid oklch(0.28 0.03 230 / 50%)",
                        backdropFilter: "blur(16px)",
                        WebkitBackdropFilter: "blur(16px)",
                        boxShadow: isTop
                          ? "0 4px 20px -6px rgba(0,0,0,0.5), 0 1px 0 inset oklch(0.55 0.06 200 / 10%)"
                          : "0 2px 10px -4px rgba(0,0,0,0.35)",
                      }}
                    >
                      {/* Top row: icon + percentage */}
                      <div className="flex items-center justify-between mb-3">
                        <CoinIcon symbol={b.asset} size={26} />
                        <span
                          style={{
                            fontSize: 10,
                            fontWeight: 700,
                            fontVariantNumeric: "tabular-nums",
                            color: isTop
                              ? "color-mix(in oklab, var(--primary) 85%, white)"
                              : "color-mix(in oklab, var(--muted-foreground) 50%, transparent)",
                            letterSpacing: "0.01em",
                          }}
                        >
                          {pct.toFixed(1)}%
                        </span>
                      </div>

                      <div style={{ fontSize: 13, fontWeight: 800, letterSpacing: "-0.015em", lineHeight: 1.1, color: isTop ? "oklch(0.96 0.015 200)" : "var(--foreground)" }}>
                        {b.asset}
                      </div>
                      <div style={{ fontSize: 11, fontWeight: 500, fontVariantNumeric: "tabular-nums", marginTop: 3, color: "color-mix(in oklab, var(--muted-foreground) 65%, transparent)" }}>
                        ${fmt(b.usd)}
                      </div>

                      {/* Thin allocation bar */}
                      <div
                        style={{
                          marginTop: 10,
                          height: 2,
                          borderRadius: 999,
                          background: "oklch(0.28 0.03 230 / 50%)",
                          overflow: "hidden",
                        }}
                      >
                        <div
                          style={{
                            width: `${Math.min(100, pct)}%`,
                            height: "100%",
                            borderRadius: 999,
                            background: isTop
                              ? "linear-gradient(90deg, color-mix(in oklab, var(--primary) 50%, transparent), var(--primary))"
                              : "color-mix(in oklab, var(--primary) 28%, transparent)",
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
        <section
          className="rounded-2xl relative overflow-hidden"
          style={{
            padding: "1.25rem 1.5rem",
            background: primary
              ? "linear-gradient(160deg, oklch(0.16 0.035 230) 0%, oklch(0.13 0.025 225) 100%)"
              : "oklch(0.14 0.02 225 / 60%)",
            border: primary
              ? "1px solid color-mix(in oklab, var(--primary) 22%, oklch(0.28 0.04 230 / 50%))"
              : "1px solid oklch(0.22 0.03 230 / 50%)",
            boxShadow: primary
              ? "0 0 0 1px transparent, 0 16px 48px -16px color-mix(in oklab, var(--primary) 20%, rgba(0,0,0,0.5)), 0 4px 16px -6px rgba(0,0,0,0.5)"
              : "0 4px 16px -6px rgba(0,0,0,0.4)",
          }}
        >
          {primary && (
            <div className="pointer-events-none absolute inset-x-0 top-0 h-px"
              style={{ background: "linear-gradient(90deg, transparent 10%, color-mix(in oklab, var(--primary) 40%, transparent) 40%, color-mix(in oklab, var(--primary) 55%, transparent) 50%, color-mix(in oklab, var(--primary) 40%, transparent) 60%, transparent 90%)" }}
            />
          )}
          {primary ? (
            <>
              <div className="relative flex items-center justify-between gap-3 flex-wrap">
                <div className="flex items-center gap-3 min-w-0">
                  <div className="relative shrink-0">
                    <CoinIcon symbol={orderBase} size={50} />
                    <span className="absolute -inset-1.5 rounded-full ring-1 ring-primary/25" />
                  </div>
                  <div className="min-w-0">
                    <div className="flex items-center gap-2 flex-wrap">
                      <h2 className="text-xl md:text-2xl font-black tracking-tight truncate">{primary.symbol}</h2>
                      <span
                        style={{
                          fontSize: 9, fontWeight: 800, padding: "3px 8px", borderRadius: 6,
                          background: "color-mix(in oklab, var(--primary) 10%, transparent)",
                          color: "var(--primary)",
                          border: "1px solid color-mix(in oklab, var(--primary) 20%, transparent)",
                          letterSpacing: "0.07em", textTransform: "uppercase",
                        }}
                      >
                        {primary.type}
                      </span>
                      <span
                        style={{
                          fontSize: 9, fontWeight: 800, padding: "3px 8px", borderRadius: 6,
                          background: primary.side === "SELL" ? "color-mix(in oklab, var(--bear) 10%, transparent)" : "color-mix(in oklab, var(--bull) 10%, transparent)",
                          color: primary.side === "SELL" ? "var(--bear)" : "var(--bull)",
                          border: primary.side === "SELL" ? "1px solid color-mix(in oklab, var(--bear) 20%, transparent)" : "1px solid color-mix(in oklab, var(--bull) 20%, transparent)",
                          letterSpacing: "0.07em", textTransform: "uppercase",
                        }}
                      >
                        {primary.side}
                      </span>
                    </div>
                    <div className="text-xs text-muted-foreground mt-1.5 flex items-center gap-1.5" style={{ fontWeight: 500 }}>
                      <span className="inline-block h-1.5 w-1.5 rounded-full bg-bull animate-pulse" />
                      Live · {fmt(orderQty, 4)} {orderBase}
                    </div>
                  </div>
                </div>
                <div className="text-right shrink-0">
                  <div className={`text-2xl md:text-4xl font-black tabular-nums tracking-tight ${pnlUsd >= 0 ? "text-bull" : "text-bear"}`}>
                    {pnlUsd >= 0 ? "+" : ""}${pnlUsd.toFixed(2)}
                  </div>
                  <div className={`text-xs font-semibold mt-0.5 tabular-nums ${pnlPct >= 0 ? "text-bull" : "text-bear"}`}>
                    {pnlPct >= 0 ? "▲" : "▼"} {Math.abs(pnlPct).toFixed(2)}%
                  </div>
                </div>
              </div>

              {/* Live price */}
              <div
                className={`relative mt-4 rounded-xl px-4 py-3 flex items-center justify-between transition-all duration-300`}
                style={{
                  background: flash === "up"
                    ? "color-mix(in oklab, var(--bull) 7%, oklch(0.16 0.03 230 / 60%))"
                    : flash === "down"
                    ? "color-mix(in oklab, var(--bear) 7%, oklch(0.16 0.03 230 / 60%))"
                    : "oklch(0.16 0.03 230 / 60%)",
                  border: flash === "up"
                    ? "1px solid color-mix(in oklab, var(--bull) 30%, transparent)"
                    : flash === "down"
                    ? "1px solid color-mix(in oklab, var(--bear) 30%, transparent)"
                    : "1px solid oklch(0.25 0.03 230 / 50%)",
                }}
              >
                <span style={{ fontSize: 10, fontWeight: 700, letterSpacing: "0.07em", textTransform: "uppercase", color: "color-mix(in oklab, var(--muted-foreground) 60%, transparent)" }} className="flex items-center gap-1.5">
                  <Activity className="h-3 w-3" /> Live price
                </span>
                <span className={`text-2xl md:text-3xl font-black tabular-nums tracking-tight transition-colors ${flash === "up" ? "text-bull" : flash === "down" ? "text-bear" : ""}`}>
                  ${cur ? fmtPrice(cur) : "…"}
                </span>
              </div>

              {/* DCA Step */}
              {showDca && (
                <div
                  className="relative mt-4 rounded-xl overflow-hidden px-4 py-4"
                  style={{
                    background: "oklch(0.15 0.03 230 / 70%)",
                    border: "1px solid color-mix(in oklab,var(--primary) 20%,oklch(0.28 0.04 230 / 40%))",
                  }}
                >
                  <div
                    className="absolute inset-x-0 top-0 h-px pointer-events-none"
                    style={{ background: "linear-gradient(90deg, transparent, color-mix(in oklab,var(--primary) 45%,transparent), transparent)" }}
                  />
                  <div className="relative flex items-center justify-between mb-3">
                    <div className="flex items-center gap-1.5">
                      <Layers className="h-3.5 w-3.5" style={{ color: "var(--primary)" }} />
                      <span style={{ fontSize: 10, letterSpacing: "0.07em", textTransform: "uppercase", fontWeight: 700, color: "color-mix(in oklab,var(--primary) 75%,var(--muted-foreground))" }}>
                        DCA Step
                      </span>
                    </div>
                    <div className="flex items-baseline gap-1">
                      <span className="text-2xl font-black tabular-nums leading-none" style={{ color: "var(--primary)", letterSpacing: "-0.02em" }}>
                        {dcaStep}
                      </span>
                      <span className="text-base font-black leading-none" style={{ color: "color-mix(in oklab,var(--muted-foreground) 40%,transparent)" }}>
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

              {/* TP / SL Progress */}
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

              {/* Stats grid */}
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
            {lastTrade.quoteQty > 0 && (
              <span className="ml-2 text-muted-foreground/60">≈ ${fmt(lastTrade.quoteQty)}</span>
            )}
          </div>
        </div>

        <span className="shrink-0 text-[10px] font-bold px-2.5 py-1 rounded-lg bg-bear/10 text-bear border border-bear/20 uppercase tracking-wider">
          Sold
        </span>
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
    <div
      style={{
        borderRadius: 10,
        padding: "9px 12px",
        background: danger
          ? "color-mix(in oklab, var(--bear) 7%, oklch(0.16 0.03 230 / 50%))"
          : accent
          ? "color-mix(in oklab, var(--bull) 7%, oklch(0.16 0.03 230 / 50%))"
          : "oklch(0.16 0.03 230 / 50%)",
        border: danger
          ? "1px solid color-mix(in oklab, var(--bear) 20%, transparent)"
          : accent
          ? "1px solid color-mix(in oklab, var(--bull) 20%, transparent)"
          : "1px solid oklch(0.25 0.03 230 / 45%)",
      }}
    >
      <div style={{ fontSize: 9, letterSpacing: "0.07em", textTransform: "uppercase", fontWeight: 700, color: "color-mix(in oklab, var(--muted-foreground) 55%, transparent)" }}>{label}</div>
      <div style={{ fontSize: 13, fontWeight: 800, marginTop: 3, letterSpacing: "-0.01em", fontVariantNumeric: "tabular-nums", color: danger ? "var(--bear)" : accent ? "var(--bull)" : "var(--foreground)" }}>{value}</div>
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

    const STEPS = 28;
    const DURATION_MS = 700;
    let step = 0;

    timerRef.current = setInterval(() => {
      step++;
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
    <div
      style={{
        borderRadius: 12,
        padding: "12px 14px",
        background: "oklch(0.15 0.03 230 / 60%)",
        border: "1px solid oklch(0.24 0.03 230 / 50%)",
        position: "relative",
        overflow: "hidden",
      }}
    >
      <style>{`
        @keyframes progress-shimmer {
          0%   { transform: translateX(-160%) skewX(-12deg); opacity: 0; }
          20%  { opacity: 0.5; }
          80%  { opacity: 0.5; }
          100% { transform: translateX(280%) skewX(-12deg); opacity: 0; }
        }
        @keyframes progress-tip-beat-bull {
          0%, 100% { transform: translateY(-50%) scale(1); }
          50%       { transform: translateY(-50%) scale(1.2); }
        }
        @keyframes progress-tip-beat-bear {
          0%, 100% { transform: translateY(-50%) scale(1); }
          50%       { transform: translateY(-50%) scale(1.2); }
        }
        @keyframes pct-badge-pop {
          0%   { transform: translateX(-50%) scale(0.75); opacity: 0; }
          60%  { transform: translateX(-50%) scale(1.08); opacity: 1; }
          100% { transform: translateX(-50%) scale(1);    opacity: 1; }
        }
        @keyframes pct-digit-up {
          0%   { transform: translateY(60%); opacity: 0; }
          100% { transform: translateY(0);   opacity: 1; }
        }
        .progress-shimmer        { animation: progress-shimmer  2.4s ease-in-out infinite; }
        .progress-tip-bull       { animation: progress-tip-beat-bull 2s ease-in-out infinite; }
        .progress-tip-bear       { animation: progress-tip-beat-bear 2s ease-in-out 0.4s infinite; }
        .pct-badge-pop           { animation: pct-badge-pop 0.35s cubic-bezier(0.22,1,0.36,1) both; }
        .pct-digit-up            { animation: pct-digit-up 0.22s ease-out both; }
      `}</style>

      <div className="flex items-center justify-between" style={{ fontSize: 10, textTransform: "uppercase", letterSpacing: "0.07em", fontWeight: 700, color: "color-mix(in oklab, var(--muted-foreground) 55%, transparent)" }}>
        <span className="flex items-center gap-1.5">{icon}{label}</span>
        <span style={{ fontSize: 13, fontWeight: 800, fontVariantNumeric: "tabular-nums", letterSpacing: "-0.01em", color: isBull ? "var(--bull)" : "var(--bear)" }}>{rightValue}</span>
      </div>

      {/* Track */}
      <div className="relative mt-5" style={{ paddingBottom: "2px" }}>
        <div className="relative h-1.5 rounded-full" style={{ background: "oklch(0.22 0.03 230 / 60%)", overflow: "visible" }}>

          {/* Filled bar */}
          <div
            className="relative h-full rounded-full transition-[width] duration-700 overflow-hidden"
            style={{
              width: `${w}%`,
              background: isBull
                ? "linear-gradient(90deg, color-mix(in oklab, var(--bull) 50%, transparent) 0%, var(--bull) 100%)"
                : "linear-gradient(90deg, color-mix(in oklab, var(--bear) 50%, transparent) 0%, var(--bear) 100%)",
            }}
          >
            <div
              className="progress-shimmer absolute inset-y-0 pointer-events-none"
              style={{ width: "38%", background: "linear-gradient(90deg, transparent, rgba(255,255,255,0.35), transparent)", borderRadius: "999px" }}
            />
          </div>

          {/* Tip dot */}
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
                boxShadow: isBull
                  ? "0 0 6px 1px color-mix(in oklab, var(--bull) 40%, transparent)"
                  : "0 0 6px 1px color-mix(in oklab, var(--bear) 40%, transparent)",
                zIndex: 10,
                pointerEvents: "none",
              }}
            />
          )}

          {/* Floating percentage badge */}
          {w > 3 && (
            <div
              key={popKey}
              className="pct-badge-pop"
              style={{ position: "absolute", top: "-26px", left: `${w}%`, transform: "translateX(-50%)", pointerEvents: "none", zIndex: 20 }}
            >
              <div
                style={{
                  display: "inline-flex",
                  alignItems: "center",
                  padding: "2px 6px",
                  borderRadius: "999px",
                  fontSize: "9px",
                  fontWeight: 900,
                  fontVariantNumeric: "tabular-nums",
                  letterSpacing: "0.01em",
                  lineHeight: 1,
                  whiteSpace: "nowrap",
                  background: isBull
                    ? "color-mix(in oklab, var(--bull) 15%, oklch(0.18 0.03 230))"
                    : "color-mix(in oklab, var(--bear) 15%, oklch(0.18 0.03 230))",
                  border: isBull
                    ? "1px solid color-mix(in oklab, var(--bull) 40%, transparent)"
                    : "1px solid color-mix(in oklab, var(--bear) 40%, transparent)",
                  color: isBull ? "var(--bull)" : "var(--bear)",
                }}
              >
                <span key={`${popKey}-num`} className="pct-digit-up">
                  {displayPct.toFixed(1)}%
                </span>
              </div>
              <div
                style={{
                  position: "absolute", left: "50%", transform: "translateX(-50%)", top: "100%",
                  width: "1px", height: "8px",
                  background: isBull
                    ? "linear-gradient(to bottom, color-mix(in oklab, var(--bull) 50%, transparent), transparent)"
                    : "linear-gradient(to bottom, color-mix(in oklab, var(--bear) 50%, transparent), transparent)",
                }}
              />
            </div>
          )}
        </div>
      </div>

      <div className="mt-2 flex items-center justify-between" style={{ fontSize: 10, color: "color-mix(in oklab, var(--muted-foreground) 45%, transparent)" }}>
        <span className="truncate">{fromLabel}</span>
        <span className="truncate">{toLabel}</span>
      </div>
      {hint && <div className="mt-1" style={{ fontSize: 10, fontWeight: 600, color: "color-mix(in oklab, var(--muted-foreground) 50%, transparent)" }}>{hint}</div>}
    </div>
  );
}
