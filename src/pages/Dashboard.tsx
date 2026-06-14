import { useQuery } from "@tanstack/react-query";
import { useEffect, useMemo, useRef, useState } from "react";
import { Wallet as WalletIcon, TrendingUp, Target, Shield, Activity, Layers } from "lucide-react";
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

function useWalletCountUp(target: number, duration = 1400) {
  const [value, setValue] = useState(0);
  const raf = useRef<number>(0);
  const startRef = useRef<number | null>(null);
  const prevTarget = useRef<number>(0);

  useEffect(() => {
    if (target === 0) return;
    if (target === prevTarget.current) return;
    prevTarget.current = target;
    startRef.current = null;
    cancelAnimationFrame(raf.current);
    function step(ts: number) {
      if (!startRef.current) startRef.current = ts;
      const elapsed = ts - startRef.current;
      const progress = Math.min(elapsed / duration, 1);
      const ease = 1 - Math.pow(1 - progress, 4);
      setValue(target * ease);
      if (progress < 1) raf.current = requestAnimationFrame(step);
      else setValue(target);
    }
    raf.current = requestAnimationFrame(step);
    return () => cancelAnimationFrame(raf.current);
  }, [target, duration]);

  return value;
}

function StepSegments({ step, total }: { step: number; total: number }) {
  return (
    <>
      <style>{`
        @keyframes dca-glow-breathe {
          0%, 100% {
            box-shadow:
              0 0 6px 1px color-mix(in oklab,var(--primary) 45%,transparent),
              0 0 18px 4px color-mix(in oklab,var(--primary) 22%,transparent),
              0 0 40px 8px color-mix(in oklab,var(--primary) 10%,transparent);
          }
          50% {
            box-shadow:
              0 0 12px 3px color-mix(in oklab,var(--primary) 75%,transparent),
              0 0 28px 8px color-mix(in oklab,var(--primary) 38%,transparent),
              0 0 55px 14px color-mix(in oklab,var(--primary) 18%,transparent);
          }
        }
        @keyframes dca-shimmer-sweep {
          0%   { transform: translateX(-180%) skewX(-15deg); opacity: 0; }
          15%  { opacity: 1; }
          85%  { opacity: 1; }
          100% { transform: translateX(280%) skewX(-15deg); opacity: 0; }
        }
        .dca-glow-breathe  { animation: dca-glow-breathe  2.2s ease-in-out infinite; }
        .dca-shimmer-sweep { animation: dca-shimmer-sweep 2.4s ease-in-out infinite; }
      `}</style>

      <div style={{ display: "flex", gap: "6px", alignItems: "center" }}>
        {Array.from({ length: total }).map((_, i) => {
          const filled   = i < step;
          const isActive = i === step - 1;
          const isPast   = filled && !isActive;

          return (
            <div key={i} style={{ flex: 1, display: "flex", flexDirection: "column", alignItems: "center", gap: "7px" }}>
              <div style={{ position: "relative", width: "100%", height: "7px" }}>
                <div
                  className={isActive ? "dca-glow-breathe" : ""}
                  style={{
                    position: "absolute",
                    inset: 0,
                    borderRadius: "999px",
                    background: isActive
                      ? "linear-gradient(90deg, color-mix(in oklab,var(--primary) 85%,white), var(--primary))"
                      : isPast
                      ? "linear-gradient(90deg, color-mix(in oklab,var(--primary) 55%,transparent), color-mix(in oklab,var(--primary) 68%,transparent))"
                      : "color-mix(in oklab,var(--primary) 9%,var(--card))",
                    transition: "background 0.5s ease",
                  }}
                />
                {isActive && (
                  <div style={{ position: "absolute", inset: 0, borderRadius: "999px", overflow: "hidden" }}>
                    <div
                      className="dca-shimmer-sweep"
                      style={{
                        position: "absolute",
                        top: 0, bottom: 0,
                        width: "40%",
                        background: "linear-gradient(90deg, transparent, rgba(255,255,255,0.50), transparent)",
                        borderRadius: "999px",
                      }}
                    />
                  </div>
                )}
              </div>
              <span style={{
                fontSize: "9px",
                fontWeight: 700,
                lineHeight: 1,
                transition: "color 0.4s",
                color: isActive
                  ? "var(--primary)"
                  : isPast
                  ? "color-mix(in oklab,var(--primary) 45%,var(--muted-foreground))"
                  : "color-mix(in oklab,var(--muted-foreground) 35%,transparent)",
                ...(isActive ? { filter: "drop-shadow(0 0 4px color-mix(in oklab,var(--primary) 70%,transparent))" } : {}),
              }}>
                {i + 1}
              </span>
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

  // ── Wallet animation state ──
  const animatedTotal = useWalletCountUp(totalUsdt);
  const [walletVisible, setWalletVisible] = useState(false);
  const [walletCardsVisible, setWalletCardsVisible] = useState(false);
  useEffect(() => {
    const t1 = setTimeout(() => setWalletVisible(true), 120);
    const t2 = setTimeout(() => setWalletCardsVisible(true), 600);
    return () => { clearTimeout(t1); clearTimeout(t2); };
  }, []);

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
  const tpProgress = cur && tpPrice
    ? (slPrice && tpPrice !== slPrice
        ? Math.max(0, Math.min(1, (cur - slPrice) / (tpPrice - slPrice)))
        : entry && tpPrice !== entry
        ? Math.max(0, Math.min(1, (cur - entry) / (tpPrice - entry)))
        : 0)
    : 0;
  const slProgress = cur && slPrice
    ? (tpPrice && tpPrice !== slPrice
        ? Math.max(0, Math.min(1, (tpPrice - cur) / (tpPrice - slPrice)))
        : entry && entry !== slPrice
        ? Math.max(0, Math.min(1, (entry - cur) / (entry - slPrice)))
        : 0)
    : 0;

  const dcaStep = dcaData?.dca_step ?? 0;
  const dcaTotal = dcaData?.dca_total_steps ?? 6;
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

  // Format animated balance
  const animatedStr = account.isLoading
    ? "0.00"
    : animatedTotal.toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
  const [walletDollars, walletCents] = animatedStr.split(".");

  // Per-asset allocation pct for mini bars
  const totalForPct = walletAssets.reduce((s, a) => s + a.usd, 0) || 1;

  return (
    <AppLayout>
      <div className="space-y-5">

        {/* ── WALLET ── */}
        <section style={{ position: "relative", overflow: "hidden" }}>
          <style>{`
            @keyframes wallet-shimmer {
              0%   { background-position: -200% center; }
              100% { background-position: 200% center; }
            }
            @keyframes wallet-dot-pulse {
              0%, 100% { opacity: 1; transform: scale(1); }
              50%       { opacity: 0.45; transform: scale(0.7); }
            }
            @keyframes wallet-float {
              0%, 100% { transform: translateY(0px); }
              50%       { transform: translateY(-4px); }
            }
            @keyframes wallet-card-in {
              from { opacity: 0; transform: translateY(14px) scale(0.97); }
              to   { opacity: 1; transform: translateY(0) scale(1); }
            }
            .wallet-shimmer-text {
              background: linear-gradient(90deg,#c7d2fe 0%,#fff 30%,#a5b4fc 50%,#fff 70%,#c7d2fe 100%);
              background-size: 200% auto;
              -webkit-background-clip: text;
              -webkit-text-fill-color: transparent;
              background-clip: text;
              animation: wallet-shimmer 3s linear infinite;
            }
            .wallet-dot-pulse  { animation: wallet-dot-pulse 2s ease-in-out infinite; }
            .wallet-float-icon { animation: wallet-float 3.5s ease-in-out infinite; }
            .wallet-asset-card { animation: wallet-card-in 0.42s cubic-bezier(0.22,1,0.36,1) both; }
          `}</style>

          <div style={{
            borderRadius: "24px",
            background: "linear-gradient(160deg,#111120 0%,#0d0d1c 50%,#0a0a16 100%)",
            border: "1px solid rgba(99,102,241,0.18)",
            boxShadow: "0 0 0 1px rgba(99,102,241,0.07),0 32px 80px rgba(0,0,0,0.55),0 0 120px rgba(99,102,241,0.06)",
            position: "relative",
            overflow: "hidden",
          }}>
            {/* Ambient glows */}
            <div style={{ position:"absolute", top:"-80px", right:"-80px", width:"300px", height:"300px", borderRadius:"50%", background:"radial-gradient(circle,rgba(99,102,241,0.13) 0%,transparent 70%)", pointerEvents:"none" }} />
            <div style={{ position:"absolute", bottom:"-60px", left:"-60px", width:"220px", height:"220px", borderRadius:"50%", background:"radial-gradient(circle,rgba(167,139,250,0.07) 0%,transparent 70%)", pointerEvents:"none" }} />

            {/* Header */}
            <div style={{ padding:"28px 28px 20px" }}>
              <div style={{ display:"flex", alignItems:"center", justifyContent:"space-between", marginBottom:"22px" }}>
                <div style={{ display:"flex", alignItems:"center", gap:"9px" }}>
                  <span className="wallet-dot-pulse" style={{ display:"block", width:"7px", height:"7px", borderRadius:"50%", background:"#6366f1", boxShadow:"0 0 8px #6366f1", flexShrink:0 }} />
                  <span style={{ fontSize:"10px", fontWeight:700, letterSpacing:"0.14em", textTransform:"uppercase", color:"rgba(165,180,252,0.65)" }}>
                    Wallet
                  </span>
                </div>
                <div className="wallet-float-icon" style={{ width:"34px", height:"34px", borderRadius:"10px", background:"linear-gradient(135deg,rgba(99,102,241,0.22),rgba(139,92,246,0.12))", border:"1px solid rgba(99,102,241,0.28)", display:"flex", alignItems:"center", justifyContent:"center", flexShrink:0 }}>
                  <WalletIcon style={{ width:"15px", height:"15px", color:"rgba(165,180,252,0.85)" }} />
                </div>
              </div>

              {/* Balance */}
              <div style={{ display:"flex", alignItems:"flex-end", gap:"3px", opacity: walletVisible ? 1 : 0, transition:"opacity 0.45s" }}>
                <span style={{ fontSize:"13px", fontWeight:700, color:"rgba(165,180,252,0.45)", marginBottom:"12px" }}>$</span>
                <span className="wallet-shimmer-text" style={{ fontSize:"clamp(44px,8vw,64px)", fontWeight:900, lineHeight:1, letterSpacing:"-0.03em" }}>
                  {account.isLoading ? "…" : walletDollars}
                </span>
                <span style={{ fontSize:"clamp(20px,3.5vw,26px)", fontWeight:700, color:"rgba(165,180,252,0.38)", marginBottom:"9px", letterSpacing:"-0.01em" }}>
                  {account.isLoading ? "" : `.${walletCents}`}
                </span>
              </div>

              {/* 24h change placeholder — replace with real data if available */}
              <div style={{ display:"flex", alignItems:"center", gap:"8px", marginTop:"8px", opacity: walletVisible ? 1 : 0, transform: walletVisible ? "translateY(0)" : "translateY(8px)", transition:"all 0.5s ease 0.25s" }}>
                <div style={{ display:"flex", alignItems:"center", gap:"4px", background:"rgba(99,102,241,0.1)", border:"1px solid rgba(99,102,241,0.2)", borderRadius:"100px", padding:"3px 10px" }}>
                  <span style={{ fontSize:"11px", fontWeight:700, color:"rgba(165,180,252,0.8)" }}>
                    {walletAssets.length} asset{walletAssets.length !== 1 ? "s" : ""}
                  </span>
                </div>
              </div>
            </div>

            {/* Divider */}
            <div style={{ height:"1px", margin:"0 28px", background:"linear-gradient(90deg,transparent,rgba(99,102,241,0.18),transparent)" }} />

            {/* Holdings */}
            {walletAssets.length > 0 && (
              <div style={{ padding:"18px 28px 24px", display:"flex", flexDirection:"column", gap:"8px" }}>
                <div style={{ fontSize:"9.5px", fontWeight:600, letterSpacing:"0.13em", textTransform:"uppercase", color:"rgba(148,163,184,0.35)", marginBottom:"4px" }}>
                  Holdings
                </div>
                {walletAssets.slice(0, 8).map((b, i) => {
                  const pct = (b.usd / totalForPct) * 100;
                  return (
                    <div
                      key={b.asset}
                      className="wallet-asset-card"
                      style={{
                        display:"flex",
                        alignItems:"center",
                        gap:"12px",
                        padding:"11px 14px",
                        borderRadius:"14px",
                        background:"rgba(255,255,255,0.025)",
                        border:"1px solid rgba(255,255,255,0.055)",
                        animationDelay: walletCardsVisible ? `${i * 60 + 80}ms` : "9999s",
                        transition:"background 0.2s,border-color 0.2s",
                        cursor:"default",
                      }}
                      onMouseEnter={e => {
                        (e.currentTarget as HTMLDivElement).style.background = "rgba(99,102,241,0.07)";
                        (e.currentTarget as HTMLDivElement).style.borderColor = "rgba(99,102,241,0.22)";
                      }}
                      onMouseLeave={e => {
                        (e.currentTarget as HTMLDivElement).style.background = "rgba(255,255,255,0.025)";
                        (e.currentTarget as HTMLDivElement).style.borderColor = "rgba(255,255,255,0.055)";
                      }}
                    >
                      {/* Coin logo */}
                      <div style={{ flexShrink:0 }}>
                        <CoinIcon symbol={b.asset} size={36} />
                      </div>

                      {/* Symbol + name */}
                      <div style={{ flex:1, minWidth:0 }}>
                        <div style={{ fontSize:"13px", fontWeight:700, color:"rgba(226,232,240,0.92)", lineHeight:1.2 }}>{b.asset}</div>
                        <div style={{ fontSize:"10.5px", color:"rgba(148,163,184,0.45)", marginTop:"2px" }}>{fmt(b.total, 4)} coins</div>
                      </div>

                      {/* Mini bar */}
                      <div style={{ width:"60px", flexShrink:0 }}>
                        <div style={{ height:"3px", borderRadius:"2px", background:"rgba(255,255,255,0.06)", overflow:"hidden" }}>
                          <div style={{
                            height:"100%",
                            width: walletCardsVisible ? `${Math.min(pct, 100)}%` : "0%",
                            background:"linear-gradient(90deg,rgba(99,102,241,0.6),rgba(99,102,241,0.9))",
                            borderRadius:"2px",
                            transition:`width 0.85s cubic-bezier(0.34,1.2,0.64,1) ${i * 70 + 300}ms`,
                          }} />
                        </div>
                        <div style={{ fontSize:"9.5px", fontWeight:600, color:"rgba(99,102,241,0.65)", marginTop:"3px", textAlign:"right" }}>
                          {pct.toFixed(1)}%
                        </div>
                      </div>

                      {/* USD value */}
                      <div style={{ textAlign:"right", flexShrink:0, minWidth:"72px" }}>
                        <div style={{ fontSize:"13px", fontWeight:700, color:"rgba(226,232,240,0.88)", letterSpacing:"-0.01em" }}>
                          ${fmt(b.usd)}
                        </div>
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </div>
        </section>

        {/* ── ACTIVE TRADE ── */}
        <section className={`rounded-2xl border bg-card p-5 md:p-6 relative overflow-hidden transition-shadow ${primary ? "border-primary/30 shadow-[0_0_60px_-20px_rgba(94,234,212,0.55)]" : "border-border"}`}>
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

                  <StepSegments step={dcaStep} total={dcaTotal} />
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
            <div className="py-10 text-center">
              <TrendingUp className="h-10 w-10 mx-auto text-muted-foreground/40" />
              <h2 className="mt-3 text-xl font-black">No Active Trade</h2>
              <p className="text-sm text-muted-foreground mt-1">Place a limit or OCO order on Binance and it will appear here.</p>
            </div>
          )}
        </section>

        <BtcCrashCard />

        <PumpScannerCard />

        <PriceChart symbol={chartSymbol} interval="1m" height={500} searchable onSymbolChange={setChartSymbol} priceLines={chartLines} />
      </div>
    </AppLayout>
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
    <div className="rounded-xl border border-border bg-muted/20 p-3 relative overflow-hidden">
      <style>{`
        @keyframes progress-glow-bull {
          0%, 100% { box-shadow: 0 0 2px 0px color-mix(in oklab, var(--bull) 12%, transparent), 0 0 4px 1px color-mix(in oklab, var(--bull) 5%, transparent); }
          50%       { box-shadow: 0 0 3px 1px color-mix(in oklab, var(--bull) 18%, transparent), 0 0 6px 1px color-mix(in oklab, var(--bull) 8%, transparent); }
        }
        @keyframes progress-glow-bear {
          0%, 100% { box-shadow: 0 0 2px 0px color-mix(in oklab, var(--bear) 12%, transparent), 0 0 4px 1px color-mix(in oklab, var(--bear) 5%, transparent); }
          50%       { box-shadow: 0 0 3px 1px color-mix(in oklab, var(--bear) 18%, transparent), 0 0 6px 1px color-mix(in oklab, var(--bear) 8%, transparent); }
        }
        @keyframes progress-shimmer {
          0%   { transform: translateX(-100%); }
          100% { transform: translateX(350%); }
        }
        @keyframes progress-tip-beat-bull {
          0%, 100% { transform: translateY(-50%) scale(1);    box-shadow: 0 0 2px 1px color-mix(in oklab, var(--bull) 20%, transparent), 0 0 4px 1px color-mix(in oklab, var(--bull) 9%, transparent); }
          50%       { transform: translateY(-50%) scale(1.15); box-shadow: 0 0 3px 1px color-mix(in oklab, var(--bull) 28%, transparent), 0 0 6px 2px color-mix(in oklab, var(--bull) 12%, transparent); }
        }
        @keyframes progress-tip-beat-bear {
          0%, 100% { transform: translateY(-50%) scale(1);    box-shadow: 0 0 2px 1px color-mix(in oklab, var(--bear) 20%, transparent), 0 0 4px 1px color-mix(in oklab, var(--bear) 9%, transparent); }
          50%       { transform: translateY(-50%) scale(1.15); box-shadow: 0 0 3px 1px color-mix(in oklab, var(--bear) 28%, transparent), 0 0 6px 2px color-mix(in oklab, var(--bear) 12%, transparent); }
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

      <div className="relative mt-5" style={{ paddingBottom: "2px" }}>
        <div className="relative h-2 rounded-full bg-muted/60" style={{ overflow: "visible" }}>
          <div
            className={`relative h-full rounded-full transition-[width] duration-700 overflow-hidden ${isBull ? "progress-bar-glow-bull" : "progress-bar-glow-bear"}`}
            style={{
              width: `${w}%`,
              background: isBull
                ? "linear-gradient(90deg, color-mix(in oklab, var(--bull) 55%, transparent) 0%, var(--bull) 100%)"
                : "linear-gradient(90deg, color-mix(in oklab, var(--bear) 55%, transparent) 0%, var(--bear) 100%)",
            }}
          >
            <div
              className="progress-shimmer absolute inset-y-0 pointer-events-none"
              style={{ width: "38%", background: "linear-gradient(90deg, transparent, rgba(255,255,255,0.42), transparent)", borderRadius: "999px" }}
            />
          </div>

          {w > 3 && (
            <div
              className={isBull ? "progress-tip-bull" : "progress-tip-bear"}
              style={{ position:"absolute", top:"50%", left:`calc(${w}% - 5px)`, width:"10px", height:"10px", borderRadius:"999px", background: isBull ? "var(--bull)" : "var(--bear)", zIndex:10, pointerEvents:"none" }}
            />
          )}

          {w > 3 && (
            <div
              key={popKey}
              className="pct-badge-pop"
              style={{ position:"absolute", top:"-26px", left:`${w}%`, transform:"translateX(-50%)", pointerEvents:"none", zIndex:20 }}
            >
              <div style={{ display:"inline-flex", alignItems:"center", gap:"2px", padding:"2px 6px", borderRadius:"999px", fontSize:"9px", fontWeight:900, fontVariantNumeric:"tabular-nums", letterSpacing:"0.01em", lineHeight:1, whiteSpace:"nowrap", background: isBull ? "color-mix(in oklab, var(--bull) 18%, var(--card))" : "color-mix(in oklab, var(--bear) 18%, var(--card))", border: isBull ? "1px solid color-mix(in oklab, var(--bull) 50%, transparent)" : "1px solid color-mix(in oklab, var(--bear) 50%, transparent)", color: isBull ? "var(--bull)" : "var(--bear)", boxShadow: isBull ? "0 0 2px 0px color-mix(in oklab, var(--bull) 10%, transparent)" : "0 0 2px 0px color-mix(in oklab, var(--bear) 10%, transparent)" }}>
                <span key={`${popKey}-num`} className="pct-digit-up">{displayPct.toFixed(1)}%</span>
              </div>
              <div style={{ position:"absolute", left:"50%", transform:"translateX(-50%)", top:"100%", width:"1px", height:"8px", background: isBull ? "linear-gradient(to bottom, color-mix(in oklab, var(--bull) 60%, transparent), transparent)" : "linear-gradient(to bottom, color-mix(in oklab, var(--bear) 60%, transparent), transparent)" }} />
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
