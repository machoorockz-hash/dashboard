import { useQuery } from "@tanstack/react-query";
import { useEffect, useMemo, useRef, useState } from "react";
import type { ReactNode } from "react";
import {
  TrendingUp, Target, Shield, Activity, Layers, Clock,
  ArrowUpRight, ArrowDownRight,
} from "lucide-react";
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
function fmtUAE(ts: number): { date: string; time: string } {
  const d = new Date(ts);
  const date = new Intl.DateTimeFormat("en-GB", { timeZone: "Asia/Dubai", day: "2-digit", month: "2-digit", year: "numeric" }).format(d);
  const time = new Intl.DateTimeFormat("en-US", { timeZone: "Asia/Dubai", hour: "2-digit", minute: "2-digit", hour12: true }).format(d).toLowerCase();
  return { date, time };
}

/* ── DCA STEPPER ─────────────────────────────────────────────────────────── */
function DcaStepper({
  step, total, stepAmounts, stepTimestamps,
}: {
  step: number; total: number;
  stepAmounts?: number[]; stepTimestamps?: number[];
}) {
  const [hovered, setHovered] = useState<number | null>(null);

  return (
    <div style={{ display: "flex", gap: 6, alignItems: "flex-end" }}>
      {Array.from({ length: total }).map((_, i) => {
        const isPast   = i < step - 1;
        const isActive = i === step - 1;
        const isPending = !isPast && !isActive;
        const amount = stepAmounts?.[i];
        const ts = stepTimestamps?.[i];

        return (
          <div
            key={i}
            style={{ flex: 1, display: "flex", flexDirection: "column", gap: 4, position: "relative" }}
            onMouseEnter={() => setHovered(i)}
            onMouseLeave={() => setHovered(null)}
          >
            {/* Tooltip */}
            {hovered === i && (
              <div style={{
                position: "absolute", bottom: "calc(100% + 8px)", left: "50%", transform: "translateX(-50%)",
                background: "oklch(0.18 0.025 230)", border: "1px solid oklch(0.28 0.03 230)",
                borderRadius: 8, padding: "7px 10px", zIndex: 50, whiteSpace: "nowrap", pointerEvents: "none",
                boxShadow: "0 8px 24px rgba(0,0,0,0.5)",
                fontSize: 11, minWidth: 90,
              }}>
                <div style={{ fontWeight: 700, color: "var(--muted-foreground)", fontSize: 10, letterSpacing: "0.05em", textTransform: "uppercase" }}>
                  Step {i + 1}
                </div>
                {amount != null && (
                  <div style={{ fontWeight: 800, color: isActive ? "var(--primary)" : isPast ? "var(--foreground)" : "oklch(0.45 0.02 230)", marginTop: 3, fontSize: 13 }}>
                    ${fmt(amount, 0)}
                  </div>
                )}
                {ts && (
                  <div style={{ color: "oklch(0.50 0.02 230)", fontSize: 10, marginTop: 2 }}>
                    {fmtUAE(ts).time}
                  </div>
                )}
              </div>
            )}

            {/* Bar */}
            <div style={{
              height: isActive ? 32 : isPast ? 24 : 16,
              borderRadius: 4,
              transition: "height 0.3s ease",
              background: isActive
                ? "var(--primary)"
                : isPast
                ? "color-mix(in oklab, var(--primary) 45%, oklch(0.22 0.03 230))"
                : "oklch(0.20 0.025 230)",
              position: "relative",
              overflow: "hidden",
            }}>
              {isActive && (
                <div style={{
                  position: "absolute", inset: 0,
                  background: "linear-gradient(180deg, rgba(255,255,255,0.12) 0%, transparent 100%)",
                }} />
              )}
            </div>

            {/* Label below */}
            <div style={{
              textAlign: "center", fontSize: 9, fontWeight: 700,
              color: isActive ? "var(--primary)" : isPast ? "oklch(0.55 0.04 200)" : "oklch(0.38 0.02 230)",
              letterSpacing: "0.03em",
            }}>
              {amount != null ? `$${fmt(amount, 0)}` : `${i + 1}`}
            </div>
          </div>
        );
      })}
    </div>
  );
}

/* ── DATA HOOKS ───────────────────────────────────────────────────────────── */
interface DcaData {
  dca_step?: number; dca_total_steps?: number; status?: string;
  dca_step_amounts?: number[]; dca_step_timestamps?: number[];
}

function useDcaData() {
  const [data, setData] = useState<DcaData | null>(null);
  useEffect(() => {
    let alive = true;
    let timer: ReturnType<typeof setTimeout>;
    async function poll() {
      try {
        const r = await fetch(`${API_BASE}/api/bot/data?key=dca`);
        if (r.ok) { const j = await r.json(); if (alive && j?.data) setData(j.data); }
      } catch {}
      timer = setTimeout(poll, 3000);
    }
    poll();
    return () => { alive = false; clearTimeout(timer); };
  }, []);
  return data;
}

const LAST_SYMBOL_KEY = "dashboard_last_order_symbol";
interface LastTrade { symbol: string; base: string; price: number; qty: number; quoteQty: number; time: number; }

function useLastTrade(activeSymbol: string | undefined): LastTrade | null {
  const [storedSymbol, setStoredSymbol] = useState<string | undefined>(() => localStorage.getItem(LAST_SYMBOL_KEY) ?? undefined);
  useEffect(() => {
    if (activeSymbol) { localStorage.setItem(LAST_SYMBOL_KEY, activeSymbol); setStoredSymbol(activeSymbol); }
  }, [activeSymbol]);
  const querySymbol = activeSymbol ? undefined : storedSymbol;
  const tradesQuery = useQuery({
    queryKey: ["lastTrades", querySymbol],
    queryFn: () => getMyTrades({ data: { symbol: querySymbol!, limit: 200 } }),
    enabled: !!querySymbol, staleTime: 0, refetchOnWindowFocus: true,
  });
  return useMemo(() => {
    if (!tradesQuery.data?.length || !querySymbol) return null;
    const sells = tradesQuery.data.filter((t) => !t.isBuyer);
    if (!sells.length) return null;
    const latest = sells.reduce((a, b) => (b.time > a.time ? b : a));
    return {
      symbol: querySymbol,
      base: querySymbol.replace(/USDT$|BUSD$|FDUSD$|BTC$|ETH$/, ""),
      price: parseFloat(latest.price), qty: parseFloat(latest.qty),
      quoteQty: parseFloat(latest.quoteQty ?? "0"), time: latest.time,
    };
  }, [tradesQuery.data, querySymbol]);
}

/* ── SHARED COMPONENTS ───────────────────────────────────────────────────── */
function Divider() {
  return <div style={{ height: 1, background: "oklch(0.22 0.025 230 / 70%)", margin: "0 0" }} />;
}

function StatLabel({ children }: { children: ReactNode }) {
  return (
    <div style={{ fontSize: 10, fontWeight: 600, letterSpacing: "0.07em", textTransform: "uppercase", color: "oklch(0.48 0.03 220)" }}>
      {children}
    </div>
  );
}

/* ── MAIN DASHBOARD ──────────────────────────────────────────────────────── */
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
    enabled: !!orderSymbol, refetchInterval: 60_000,
  });

  const lastTrade = useLastTrade(orderSymbol);

  const avgEntry = useMemo(() => {
    if (!trades.data?.length) return 0;
    let cost = 0, qty = 0;
    for (const t of trades.data) {
      const p = parseFloat(t.price), q = parseFloat(t.qty);
      if (t.isBuyer) { cost += p * q; qty += q; }
      else if (qty > 0) { const r = Math.min(q, qty) / qty; cost *= (1 - r); qty -= Math.min(q, qty); }
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
  useEffect(() => { if (!flash) return; const t = setTimeout(() => setFlash(null), 600); return () => clearTimeout(t); }, [flash]);

  const [chartSymbol, setChartSymbol] = useState("BTCUSDT");
  useEffect(() => { setChartSymbol(orderSymbol ?? "BTCUSDT"); }, [orderSymbol]);

  const allAssets = useMemo(() => {
    if (!account.data || !prices.data) return [];
    return account.data.balances.map((b) => {
      const total = b.free + b.locked;
      const usd = b.asset === "USDT" ? total : total * (prices.data?.[`${b.asset}USDT`] ?? 0);
      return { ...b, total, usd };
    });
  }, [account.data, prices.data]);

  const walletAssets = useMemo(() => allAssets.filter((b) => b.usd >= 2).sort((a, b) => b.usd - a.usd), [allAssets]);
  const totalUsdt = allAssets.reduce((s, a) => s + a.usd, 0);

  const tpPrice  = tpOrder ? parseFloat(tpOrder.price) : 0;
  const slPrice  = slOrder ? (parseFloat(slOrder.stopPrice) || parseFloat(slOrder.price)) : 0;
  const orderQty = primary ? parseFloat(primary.origQty) : 0;
  const entry    = avgEntry > 0 ? avgEntry : (primary ? parseFloat(primary.price) : 0);
  const cur      = livePrice ?? (orderSymbol ? prices.data?.[orderSymbol] : undefined);

  const pnlPct = cur && entry ? ((cur - entry) / entry) * 100 : 0;
  const pnlUsd = cur && entry ? (cur - entry) * orderQty : 0;
  const targetPct  = tpPrice && entry ? ((tpPrice - entry) / entry) * 100 : 0;
  const stopPct    = slPrice && entry ? ((slPrice - entry) / entry) * 100 : 0;
  const distToTpPct = cur && tpPrice ? ((tpPrice - cur) / cur) * 100 : 0;
  const distToSlPct = cur && slPrice ? ((cur - slPrice) / cur) * 100 : 0;
  const tpProgress = cur && tpPrice && entry && tpPrice !== entry ? Math.max(0, Math.min(1, (cur - entry) / (tpPrice - entry))) : 0;
  const slProgress = cur && slPrice && entry && entry !== slPrice ? Math.max(0, Math.min(1, (entry - cur) / (entry - slPrice))) : 0;

  const dcaStep       = dcaData?.dca_step ?? 0;
  const dcaTotal      = dcaData?.dca_total_steps ?? 6;
  const dcaAmounts    = dcaData?.dca_step_amounts;
  const dcaTimestamps = dcaData?.dca_step_timestamps;
  const showDca = !!primary && dcaStep > 0 && dcaData?.status !== "COMPLETED";

  const chartLines = useMemo(() => {
    const out: Array<{ price: number; label: string; color: string }> = [];
    if (orderSymbol && chartSymbol === orderSymbol) {
      if (entry > 0)   out.push({ price: entry,   label: `Entry ${fmtPrice(entry)}`,   color: "oklch(0.65 0.04 220)" });
      if (tpPrice > 0) out.push({ price: tpPrice, label: `TP ${fmtPrice(tpPrice)}`,    color: "oklch(0.78 0.20 155)" });
      if (slPrice > 0) out.push({ price: slPrice, label: `SL ${fmtPrice(slPrice)}`,    color: "oklch(0.65 0.24 18)" });
    }
    return out;
  }, [orderSymbol, chartSymbol, entry, tpPrice, slPrice]);

  /* hue bands for allocation bar */
  const HUE  = [165, 185, 148, 200, 140, 175, 158];
  const LITE = [0.72, 0.67, 0.75, 0.65, 0.78, 0.69, 0.73];

  return (
    <AppLayout>
      <div style={{ display: "flex", flexDirection: "column", gap: 16 }}>

        {/* ══════════════════════════════════════════════
            PORTFOLIO PANEL
        ══════════════════════════════════════════════ */}
        <Panel>
          {/* Header */}
          <PanelHeader
            left={
              <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                <span style={{ fontSize: 11, fontWeight: 700, letterSpacing: "0.08em", textTransform: "uppercase", color: "oklch(0.55 0.04 210)" }}>
                  Portfolio
                </span>
                <LiveDot />
              </div>
            }
            right={
              <span style={{ fontSize: 11, color: "oklch(0.50 0.03 220)", fontWeight: 500 }}>
                {walletAssets.length} assets
              </span>
            }
          />

          <Divider />

          {/* Total value */}
          <div style={{ padding: "20px 20px 0" }}>
            <StatLabel>Total Portfolio Value</StatLabel>
            <div style={{ display: "flex", alignItems: "baseline", gap: 10, marginTop: 6 }}>
              {account.isLoading ? (
                <span style={{ fontSize: "clamp(2rem,7vw,3.2rem)", fontWeight: 900, letterSpacing: "-0.04em", color: "oklch(0.30 0.02 230)" }}>—</span>
              ) : (
                <span style={{
                  fontSize: "clamp(2rem,7vw,3.2rem)", fontWeight: 900,
                  letterSpacing: "-0.04em", lineHeight: 1,
                  color: "oklch(0.97 0.01 200)",
                }}>
                  ${fmt(totalUsdt)}
                </span>
              )}
              <span style={{ fontSize: 13, fontWeight: 600, color: "oklch(0.50 0.03 220)", letterSpacing: "0.04em" }}>USDT</span>
            </div>
          </div>

          {/* Allocation bar */}
          {walletAssets.length > 0 && totalUsdt > 0 && (
            <div style={{ padding: "16px 20px 0" }}>
              <div style={{ display: "flex", height: 6, borderRadius: 999, overflow: "hidden", gap: 2, background: "oklch(0.20 0.02 230)" }}>
                {walletAssets.slice(0, 8).map((b, i) => {
                  const pct = (b.usd / totalUsdt) * 100;
                  return (
                    <div key={b.asset} style={{
                      width: `${pct}%`, minWidth: pct > 0 ? 3 : 0, height: "100%",
                      background: `oklch(${LITE[i % LITE.length]} 0.16 ${HUE[i % HUE.length]})`,
                      opacity: 0.9 - i * 0.07,
                      borderRadius: 999,
                      transition: "width 0.8s cubic-bezier(0.4,0,0.2,1)",
                    }} />
                  );
                })}
              </div>
            </div>
          )}

          {/* Asset table */}
          {walletAssets.length > 0 && (
            <div style={{ marginTop: 16 }}>
              {/* Table header */}
              <div style={{
                display: "grid", gridTemplateColumns: "1fr 1fr 1fr 80px",
                padding: "6px 20px",
                background: "oklch(0.15 0.02 230 / 60%)",
                borderTop: "1px solid oklch(0.20 0.025 230)",
                borderBottom: "1px solid oklch(0.20 0.025 230)",
              }}>
                {["Asset", "Balance", "Value (USD)", "Alloc"].map((h) => (
                  <span key={h} style={{ fontSize: 9, fontWeight: 700, letterSpacing: "0.08em", textTransform: "uppercase", color: "oklch(0.42 0.03 220)" }}>
                    {h}
                  </span>
                ))}
              </div>

              {/* Table rows */}
              {walletAssets.slice(0, 8).map((b, i) => {
                const pct = totalUsdt > 0 ? (b.usd / totalUsdt) * 100 : 0;
                const isTop = i === 0;
                return (
                  <div
                    key={b.asset}
                    style={{
                      display: "grid", gridTemplateColumns: "1fr 1fr 1fr 80px",
                      alignItems: "center",
                      padding: "11px 20px",
                      borderBottom: i < walletAssets.slice(0, 8).length - 1 ? "1px solid oklch(0.19 0.022 230 / 60%)" : "none",
                      background: isTop ? "oklch(0.17 0.03 230 / 40%)" : "transparent",
                      transition: "background 0.15s ease",
                    }}
                  >
                    {/* Asset name + icon */}
                    <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
                      <CoinIcon symbol={b.asset} size={28} />
                      <div>
                        <div style={{ fontSize: 13, fontWeight: 700, color: "oklch(0.92 0.02 200)", letterSpacing: "-0.01em" }}>
                          {b.asset}
                        </div>
                        {isTop && (
                          <div style={{ fontSize: 9, fontWeight: 600, color: "var(--primary)", letterSpacing: "0.04em", marginTop: 1 }}>
                            TOP HOLD
                          </div>
                        )}
                      </div>
                    </div>

                    {/* Balance */}
                    <span style={{ fontSize: 12, fontWeight: 500, color: "oklch(0.65 0.03 215)", fontVariantNumeric: "tabular-nums" }}>
                      {fmt(b.total, b.total < 1 ? 6 : b.total < 100 ? 4 : 2)}
                    </span>

                    {/* USD value */}
                    <span style={{ fontSize: 13, fontWeight: 700, color: "oklch(0.88 0.02 200)", fontVariantNumeric: "tabular-nums", letterSpacing: "-0.01em" }}>
                      ${fmt(b.usd)}
                    </span>

                    {/* Allocation mini-bar */}
                    <div style={{ display: "flex", flexDirection: "column", gap: 3 }}>
                      <span style={{ fontSize: 10, fontWeight: 700, color: "oklch(0.62 0.04 210)", fontVariantNumeric: "tabular-nums" }}>
                        {pct.toFixed(1)}%
                      </span>
                      <div style={{ height: 3, borderRadius: 999, background: "oklch(0.22 0.02 230)", overflow: "hidden" }}>
                        <div style={{
                          width: `${Math.min(100, pct)}%`, height: "100%", borderRadius: 999,
                          background: `oklch(${LITE[i % LITE.length]} 0.16 ${HUE[i % HUE.length]})`,
                          transition: "width 0.8s ease",
                        }} />
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </Panel>

        {/* ══════════════════════════════════════════════
            ACTIVE TRADE PANEL
        ══════════════════════════════════════════════ */}
        <Panel accent={!!primary}>
          {primary ? (
            <>
              {/* Trade header */}
              <PanelHeader
                left={
                  <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
                    <div style={{ position: "relative" }}>
                      <CoinIcon symbol={orderBase} size={40} />
                      <div style={{
                        position: "absolute", bottom: 0, right: 0,
                        width: 9, height: 9, borderRadius: "50%",
                        background: "var(--bull)",
                        border: "2px solid oklch(0.14 0.025 230)",
                      }} />
                    </div>
                    <div>
                      <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                        <span style={{ fontSize: 18, fontWeight: 900, letterSpacing: "-0.02em", color: "oklch(0.96 0.01 200)" }}>
                          {primary.symbol}
                        </span>
                        <Badge color={primary.side === "SELL" ? "bear" : "bull"}>{primary.side}</Badge>
                        <Badge color="neutral">{primary.type}</Badge>
                      </div>
                      <div style={{ fontSize: 11, color: "oklch(0.50 0.03 220)", marginTop: 3, fontWeight: 500 }}>
                        {fmt(orderQty, 4)} {orderBase} · open position
                      </div>
                    </div>
                  </div>
                }
                right={
                  <div style={{ textAlign: "right" }}>
                    <div style={{
                      fontSize: 22, fontWeight: 900, letterSpacing: "-0.03em", fontVariantNumeric: "tabular-nums",
                      color: pnlUsd >= 0 ? "var(--bull)" : "var(--bear)",
                    }}>
                      {pnlUsd >= 0 ? "+" : ""}${pnlUsd.toFixed(2)}
                    </div>
                    <div style={{
                      fontSize: 12, fontWeight: 600, fontVariantNumeric: "tabular-nums",
                      color: pnlPct >= 0 ? "var(--bull)" : "var(--bear)",
                      display: "flex", alignItems: "center", gap: 3, justifyContent: "flex-end", marginTop: 2,
                    }}>
                      {pnlPct >= 0
                        ? <ArrowUpRight size={13} />
                        : <ArrowDownRight size={13} />}
                      {Math.abs(pnlPct).toFixed(2)}%
                    </div>
                  </div>
                }
              />

              <Divider />

              {/* Live price — the hero number */}
              <div style={{
                padding: "0 20px",
                display: "flex", alignItems: "center", justifyContent: "space-between",
                transition: "background 0.3s ease",
                background: flash === "up"
                  ? "color-mix(in oklab, var(--bull) 5%, transparent)"
                  : flash === "down"
                  ? "color-mix(in oklab, var(--bear) 5%, transparent)"
                  : "transparent",
              }}>
                <div style={{ padding: "16px 0" }}>
                  <div style={{ display: "flex", alignItems: "center", gap: 6, marginBottom: 4 }}>
                    <Activity size={12} style={{ color: "oklch(0.52 0.04 210)" }} />
                    <StatLabel>Live Price</StatLabel>
                  </div>
                  <div style={{
                    fontSize: "clamp(1.8rem,6vw,3rem)", fontWeight: 900, letterSpacing: "-0.04em",
                    fontVariantNumeric: "tabular-nums", lineHeight: 1,
                    color: flash === "up" ? "var(--bull)" : flash === "down" ? "var(--bear)" : "oklch(0.97 0.01 200)",
                    transition: "color 0.3s ease",
                  }}>
                    ${cur ? fmtPrice(cur) : "—"}
                  </div>
                </div>

                {/* Entry / TP / SL stat strip */}
                <div style={{ display: "flex", gap: 24 }}>
                  <StatItem label="Entry" value={`$${fmtPrice(entry)}`} />
                  <StatItem label="Take Profit" value={tpPrice ? `$${fmtPrice(tpPrice)}` : "—"} color="bull" />
                  <StatItem label="Stop Loss"   value={slPrice ? `$${fmtPrice(slPrice)}` : "—"} color="bear" />
                </div>
              </div>

              <Divider />

              {/* TP / SL Progress bars */}
              <div style={{ padding: "16px 20px", display: "flex", flexDirection: "column", gap: 14 }}>
                <TradeBar
                  label="Take Profit"
                  icon={<Target size={12} />}
                  progress={tpProgress}
                  color="bull"
                  leftNote={`+${targetPct.toFixed(2)}% target`}
                  rightNote={tpPrice && cur ? `${distToTpPct >= 0 ? "+" : ""}${distToTpPct.toFixed(2)}% remaining` : ""}
                />
                <TradeBar
                  label="Stop Loss"
                  icon={<Shield size={12} />}
                  progress={slProgress}
                  color="bear"
                  leftNote={`${stopPct.toFixed(2)}% from entry`}
                  rightNote={slPrice && cur ? `${distToSlPct.toFixed(2)}% buffer` : ""}
                />
              </div>

              {/* DCA Section */}
              {showDca && (
                <>
                  <Divider />
                  <div style={{ padding: "16px 20px" }}>
                    <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 14 }}>
                      <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
                        <Layers size={12} style={{ color: "var(--primary)" }} />
                        <StatLabel>DCA Progress</StatLabel>
                      </div>
                      <div style={{ display: "flex", alignItems: "baseline", gap: 4 }}>
                        <span style={{ fontSize: 20, fontWeight: 900, color: "var(--primary)", letterSpacing: "-0.02em" }}>
                          {dcaStep}
                        </span>
                        <span style={{ fontSize: 13, color: "oklch(0.42 0.03 220)", fontWeight: 700 }}>
                          / {dcaTotal}
                        </span>
                        <span style={{ fontSize: 10, color: "oklch(0.50 0.03 220)", marginLeft: 4, fontWeight: 600 }}>
                          steps completed
                        </span>
                      </div>
                    </div>
                    <DcaStepper
                      step={dcaStep} total={dcaTotal}
                      stepAmounts={dcaAmounts} stepTimestamps={dcaTimestamps}
                    />
                  </div>
                </>
              )}
            </>
          ) : (
            <NoActiveTrade lastTrade={lastTrade} />
          )}
        </Panel>

        <BtcCrashCard />
        <PumpScannerCard />
        <PriceChart symbol={chartSymbol} interval="1m" height={500} searchable onSymbolChange={setChartSymbol} priceLines={chartLines} />
      </div>

    </AppLayout>
  );
}

/* ── SUB-COMPONENTS ──────────────────────────────────────────────────────── */

function Panel({ children, accent }: { children: ReactNode; accent?: boolean }) {
  return (
    <div style={{
      borderRadius: 14,
      background: "oklch(0.14 0.022 230 / 80%)",
      backdropFilter: "blur(20px)",
      WebkitBackdropFilter: "blur(20px)",
      border: `1px solid ${accent ? "color-mix(in oklab, var(--primary) 18%, oklch(0.24 0.03 230))" : "oklch(0.22 0.025 230)"}`,
      boxShadow: accent
        ? "0 0 0 1px transparent, 0 20px 48px -16px rgba(0,0,0,0.6), 0 0 40px -20px color-mix(in oklab, var(--primary) 15%, transparent)"
        : "0 8px 32px -12px rgba(0,0,0,0.5)",
      overflow: "hidden",
    }}>
      {children}
    </div>
  );
}

function PanelHeader({ left, right }: { left: ReactNode; right?: ReactNode }) {
  return (
    <div style={{
      display: "flex", alignItems: "center", justifyContent: "space-between",
      padding: "14px 20px",
    }}>
      {left}
      {right && right}
    </div>
  );
}

function LiveDot() {
  return (
    <div style={{ display: "flex", alignItems: "center", gap: 5 }}>
      <span style={{
        width: 6, height: 6, borderRadius: "50%", background: "var(--primary)",
        display: "inline-block",
      }} />
      <span style={{ fontSize: 10, fontWeight: 700, color: "var(--primary)", letterSpacing: "0.06em" }}>LIVE</span>
    </div>
  );
}

function Badge({ children, color }: { children: ReactNode; color: "bull" | "bear" | "neutral" }) {
  const styles = {
    bull:    { bg: "color-mix(in oklab, var(--bull) 12%, transparent)",  border: "color-mix(in oklab, var(--bull) 25%, transparent)",  text: "var(--bull)" },
    bear:    { bg: "color-mix(in oklab, var(--bear) 12%, transparent)",  border: "color-mix(in oklab, var(--bear) 25%, transparent)",  text: "var(--bear)" },
    neutral: { bg: "oklch(0.20 0.025 230)", border: "oklch(0.28 0.03 230)", text: "oklch(0.60 0.04 215)" },
  }[color];
  return (
    <span style={{
      fontSize: 9, fontWeight: 800, letterSpacing: "0.07em", textTransform: "uppercase",
      padding: "3px 7px", borderRadius: 5,
      background: styles.bg, border: `1px solid ${styles.border}`, color: styles.text,
    }}>
      {children}
    </span>
  );
}

function StatItem({ label, value, color }: { label: string; value: string; color?: "bull" | "bear" }) {
  const valueColor = color === "bull" ? "var(--bull)" : color === "bear" ? "var(--bear)" : "oklch(0.88 0.02 200)";
  return (
    <div style={{ textAlign: "right" }}>
      <StatLabel>{label}</StatLabel>
      <div style={{ fontSize: 13, fontWeight: 800, fontVariantNumeric: "tabular-nums", color: valueColor, marginTop: 4, letterSpacing: "-0.01em" }}>
        {value}
      </div>
    </div>
  );
}

function TradeBar({ label, icon, progress, color, leftNote, rightNote }: {
  label: string; icon: ReactNode; progress: number;
  color: "bull" | "bear"; leftNote: string; rightNote: string;
}) {
  const w = Math.max(1, Math.min(100, progress * 100));
  const isBull = color === "bull";
  const c = isBull ? "var(--bull)" : "var(--bear)";

  const [displayW, setDisplayW] = useState(w);
  const prevRef = useRef(w);
  const timerRef = useRef<ReturnType<typeof setInterval> | null>(null);
  useEffect(() => {
    const start = prevRef.current, end = w;
    prevRef.current = w;
    if (Math.abs(end - start) < 0.1) return;
    if (timerRef.current) clearInterval(timerRef.current);
    let step = 0;
    timerRef.current = setInterval(() => {
      step++;
      const t = step / 24;
      setDisplayW(start + (end - start) * (1 - Math.pow(1 - t, 3)));
      if (step >= 24) { setDisplayW(end); clearInterval(timerRef.current!); }
    }, 700 / 24);
    return () => { if (timerRef.current) clearInterval(timerRef.current); };
  }, [w]);

  return (
    <div>
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 8 }}>
        <div style={{ display: "flex", alignItems: "center", gap: 5 }}>
          <span style={{ color: c, opacity: 0.8 }}>{icon}</span>
          <StatLabel>{label}</StatLabel>
        </div>
        <span style={{ fontSize: 11, fontWeight: 700, color: c, fontVariantNumeric: "tabular-nums" }}>
          {displayW.toFixed(1)}%
        </span>
      </div>

      {/* Track */}
      <div style={{ position: "relative", height: 5, borderRadius: 999, background: "oklch(0.20 0.02 230)", overflow: "hidden" }}>
        <div style={{
          position: "absolute", inset: 0, width: `${w}%`, borderRadius: 999,
          background: isBull
            ? `linear-gradient(90deg, color-mix(in oklab, var(--bull) 40%, transparent), var(--bull))`
            : `linear-gradient(90deg, color-mix(in oklab, var(--bear) 40%, transparent), var(--bear))`,
          transition: "width 0.7s cubic-bezier(0.4,0,0.2,1)",
        }} />
      </div>

      {/* Notes */}
      <div style={{ display: "flex", justifyContent: "space-between", marginTop: 5 }}>
        <span style={{ fontSize: 10, color: "oklch(0.48 0.03 220)", fontWeight: 500 }}>{leftNote}</span>
        <span style={{ fontSize: 10, color: "oklch(0.48 0.03 220)", fontWeight: 500 }}>{rightNote}</span>
      </div>
    </div>
  );
}

function NoActiveTrade({ lastTrade }: { lastTrade: LastTrade | null }) {
  if (!lastTrade) {
    return (
      <div style={{ padding: "48px 20px", textAlign: "center" }}>
        <TrendingUp size={36} style={{ color: "oklch(0.35 0.03 220)", margin: "0 auto 12px" }} />
        <div style={{ fontSize: 16, fontWeight: 800, color: "oklch(0.72 0.03 210)", letterSpacing: "-0.01em" }}>
          No Active Trade
        </div>
        <div style={{ fontSize: 13, color: "oklch(0.45 0.03 220)", marginTop: 6, fontWeight: 500 }}>
          Place a limit or OCO order on Binance to get started.
        </div>
      </div>
    );
  }

  const { date, time } = fmtUAE(lastTrade.time);

  return (
    <>
      <PanelHeader
        left={
          <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
            <div style={{ width: 6, height: 6, borderRadius: "50%", background: "oklch(0.45 0.03 220)" }} />
            <span style={{ fontSize: 11, fontWeight: 700, letterSpacing: "0.07em", textTransform: "uppercase", color: "oklch(0.50 0.03 220)" }}>
              Last Closed Trade
            </span>
          </div>
        }
      />
      <Divider />
      <div style={{ padding: "20px" }}>
        <div style={{ display: "flex", alignItems: "center", gap: 16 }}>
          <CoinIcon symbol={lastTrade.base} size={48} />
          <div style={{ flex: 1, minWidth: 0 }}>
            <div style={{ fontSize: 20, fontWeight: 900, letterSpacing: "-0.02em", color: "oklch(0.94 0.02 200)" }}>
              {lastTrade.base}
              <span style={{ fontSize: 13, fontWeight: 500, color: "oklch(0.48 0.03 220)", marginLeft: 6 }}>/USDT</span>
            </div>
            <div style={{ fontSize: 13, color: "oklch(0.58 0.04 210)", marginTop: 4, fontWeight: 500, fontVariantNumeric: "tabular-nums" }}>
              Sold at ${fmtPrice(lastTrade.price)}
              {lastTrade.quoteQty > 0 && (
                <span style={{ color: "oklch(0.42 0.03 220)", marginLeft: 8 }}>≈ ${fmt(lastTrade.quoteQty)}</span>
              )}
            </div>
          </div>
          <Badge color="bear">Sold</Badge>
        </div>

        <div style={{
          marginTop: 16, display: "flex", alignItems: "center", gap: 10,
          padding: "11px 14px", borderRadius: 10,
          background: "oklch(0.16 0.022 230 / 60%)", border: "1px solid oklch(0.22 0.025 230)",
        }}>
          <Clock size={14} style={{ color: "oklch(0.50 0.03 220)" }} />
          <span style={{ fontSize: 13, fontWeight: 600, color: "oklch(0.70 0.03 215)", fontVariantNumeric: "tabular-nums" }}>
            {date}
          </span>
          <span style={{ fontSize: 13, color: "oklch(0.50 0.03 220)", fontWeight: 500, fontVariantNumeric: "tabular-nums" }}>
            {time} <span style={{ fontSize: 9, fontWeight: 700, letterSpacing: "0.06em" }}>UAE</span>
          </span>
        </div>
      </div>
    </>
  );
}
