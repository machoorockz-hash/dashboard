import { useQuery } from "@tanstack/react-query";
import { useEffect, useMemo, useRef, useState } from "react";
import { Wallet as WalletIcon, TrendingUp, Target, Shield, Activity, Clock } from "lucide-react";
import { AppLayout } from "../components/AppLayout";
import { CoinIcon } from "../components/CoinIcon";
import { PriceChart } from "../components/PriceChart";
import { BtcCrashCard } from "../components/BtcCrashCard";
import PumpScannerCard from "../components/PumpScannerCard";
import { getAccount, getOpenOrders, getAllPrices, getMyTrades } from "../lib/binance";

const API_BASE = import.meta.env.VITE_API_BASE ?? "";

/* ── Shared glassmorphism tokens ──────────────────────────────────────────── */
const glass = {
  card: {
    background:    "rgba(255,255,255,0.04)",
    backdropFilter:"blur(24px) saturate(160%)",
    WebkitBackdropFilter: "blur(24px) saturate(160%)",
    border:        "1px solid rgba(255,255,255,0.09)",
    boxShadow:     "0 4px 32px rgba(0,0,0,0.28), inset 0 1px 0 rgba(255,255,255,0.07)",
  } as React.CSSProperties,
  chip: {
    background:    "rgba(255,255,255,0.06)",
    backdropFilter:"blur(16px) saturate(140%)",
    WebkitBackdropFilter: "blur(16px) saturate(140%)",
    border:        "1px solid rgba(255,255,255,0.10)",
    boxShadow:     "0 2px 12px rgba(0,0,0,0.18)",
  } as React.CSSProperties,
  inner: {
    background:    "rgba(255,255,255,0.05)",
    backdropFilter:"blur(12px)",
    WebkitBackdropFilter: "blur(12px)",
    border:        "1px solid rgba(255,255,255,0.08)",
  } as React.CSSProperties,
} as const;

function fmt(n: number, max = 2, min = max) {
  return n.toLocaleString(undefined, { maximumFractionDigits: max, minimumFractionDigits: min });
}
function fmtPrice(p: number) {
  if (!isFinite(p)) return "…";
  if (p >= 1000) return fmt(p, 2);
  if (p >= 1)    return fmt(p, 4);
  if (p >= 0.01) return fmt(p, 5);
  return fmt(p, 6);
}

function fmtUAE(ts: number): { date: string; time: string } {
  const d = new Date(ts);
  const date = new Intl.DateTimeFormat("en-GB", {
    timeZone: "Asia/Dubai", day: "2-digit", month: "2-digit", year: "numeric",
  }).format(d);
  const time = new Intl.DateTimeFormat("en-US", {
    timeZone: "Asia/Dubai", hour: "2-digit", minute: "2-digit", hour12: true,
  }).format(d).toLowerCase();
  return { date, time };
}

/* ─────────────────────────────────────────────────────────────────────────────
   DcaSteps — glass orb chain (refined)
   Soft glow, checkmarks on completed orbs, advanced stat footer.
───────────────────────────────────────────────────────────────────────────── */
function DcaSteps({ step, total }: { step: number; total: number }) {
  const pct       = Math.round((step / total) * 100);
  const remaining = total - step;

  return (
    <>
      <style>{`
        @keyframes orb-breathe {
          0%,100% {
            box-shadow:
              0 0 0 2px  color-mix(in oklab,var(--primary)  8%,transparent),
              0 0 8px 1px color-mix(in oklab,var(--primary) 28%,transparent),
              inset 0 0 7px 1px color-mix(in oklab,var(--primary) 22%,transparent),
              inset 0 1px 0 rgba(255,255,255,0.18);
          }
          50% {
            box-shadow:
              0 0 0 4px  color-mix(in oklab,var(--primary)  6%,transparent),
              0 0 12px 2px color-mix(in oklab,var(--primary) 38%,transparent),
              inset 0 0 10px 2px color-mix(in oklab,var(--primary) 30%,transparent),
              inset 0 1px 0 rgba(255,255,255,0.26);
          }
        }
        @keyframes orb-spin {
          from { transform: rotate(0deg); }
          to   { transform: rotate(360deg); }
        }
        @keyframes tube-fill {
          from { width: 0%; }
          to   { width: 100%; }
        }
        .orb-breathe { animation: orb-breathe 3s ease-in-out infinite; }
        .orb-spin    { animation: orb-spin 12s linear infinite; }
      `}</style>

      <div className="mt-5 select-none">

        {/* ── Header ── */}
        <div className="flex items-center justify-between mb-1">
          <span style={{ fontSize:9, fontWeight:700, letterSpacing:"0.18em", textTransform:"uppercase",
            color:"color-mix(in oklab,var(--primary) 60%,rgba(255,255,255,0.40))" }}>
            DCA STEP
          </span>
          <div style={{ display:"flex", alignItems:"center", gap:8 }}>
            {/* Completed badge */}
            <span style={{
              fontSize:9, fontWeight:700, letterSpacing:"0.06em", textTransform:"uppercase",
              padding:"2px 7px", borderRadius:999,
              background:"color-mix(in oklab,var(--primary) 10%,rgba(255,255,255,0.04))",
              border:"1px solid color-mix(in oklab,var(--primary) 22%,rgba(255,255,255,0.06))",
              color:"color-mix(in oklab,var(--primary) 70%,rgba(255,255,255,0.50))",
            }}>
              {step - 1} done
            </span>
            <span style={{ fontSize:10, fontWeight:700, color:"rgba(255,255,255,0.30)", fontVariantNumeric:"tabular-nums" }}>
              <span style={{ color:"var(--primary)", fontWeight:900, fontSize:13 }}>{step}</span>
              {" / "}{total}
            </span>
          </div>
        </div>

        {/* ── Orb chain ── */}
        <div style={{ display:"flex", alignItems:"center", marginTop:16 }}>
          {Array.from({ length: total }).map((_, i) => {
            const isActive = i === step - 1;
            const isPast   = i < step - 1;
            const isLast   = i === total - 1;

            return (
              <div key={i} style={{ display:"flex", alignItems:"center", flex: isLast ? "0 0 auto" : 1 }}>

                {/* ── Orb ── */}
                <div style={{ display:"flex", flexDirection:"column", alignItems:"center", gap:5, flexShrink:0 }}>
                  {/* Subtle outer ring (active only) */}
                  <div style={{ position:"relative" }}>
                    {isActive && (
                      <div style={{
                        position:"absolute", inset:-5, borderRadius:"50%", pointerEvents:"none",
                        border:"1px solid color-mix(in oklab,var(--primary) 20%,transparent)",
                      }} />
                    )}

                    <div
                      className={isActive ? "orb-breathe" : ""}
                      style={{
                        width:  isActive ? 36 : isPast ? 24 : 18,
                        height: isActive ? 36 : isPast ? 24 : 18,
                        borderRadius:"50%",
                        position:"relative",
                        overflow:"hidden",
                        flexShrink:0,
                        transition:"width 0.5s cubic-bezier(0.34,1.56,0.64,1), height 0.5s cubic-bezier(0.34,1.56,0.64,1)",
                        background: isActive
                          ? "radial-gradient(circle at 35% 30%, rgba(255,255,255,0.14), rgba(255,255,255,0.03))"
                          : isPast
                          ? "radial-gradient(circle at 35% 30%, color-mix(in oklab,var(--primary) 42%,rgba(255,255,255,0.08)), color-mix(in oklab,var(--primary) 18%,transparent))"
                          : "radial-gradient(circle at 35% 30%, rgba(255,255,255,0.04), rgba(255,255,255,0.01))",
                        backdropFilter:"blur(12px)",
                        WebkitBackdropFilter:"blur(12px)",
                        border: isActive
                          ? "1px solid rgba(255,255,255,0.18)"
                          : isPast
                          ? "1px solid color-mix(in oklab,var(--primary) 40%,rgba(255,255,255,0.06))"
                          : "1px solid rgba(255,255,255,0.07)",
                      }}
                    >
                      {/* Very subtle rotating conic (active only, low opacity) */}
                      {isActive && (
                        <div className="orb-spin" style={{
                          position:"absolute", inset:0, borderRadius:"50%", opacity:0.18,
                          background:"conic-gradient(from 0deg,transparent 65%,rgba(255,255,255,0.9) 82%,transparent 100%)",
                        }} />
                      )}
                      {/* Specular */}
                      <div style={{
                        position:"absolute", top:"10%", left:"16%",
                        width:"32%", height:"22%", borderRadius:"50%",
                        background:"rgba(255,255,255,0.22)", filter:"blur(1.5px)", pointerEvents:"none",
                      }} />
                      {/* Icon: checkmark for past, number for active/future */}
                      <div style={{ position:"absolute", inset:0, display:"flex", alignItems:"center", justifyContent:"center" }}>
                        {isPast ? (
                          <svg width={isPast ? 10 : 8} height={isPast ? 10 : 8} viewBox="0 0 10 10" fill="none" style={{ position:"relative", zIndex:1 }}>
                            <path d="M2 5.2L4.1 7.4L8 3" stroke="rgba(255,255,255,0.75)" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" />
                          </svg>
                        ) : (
                          <span style={{
                            fontSize: isActive ? 13 : 8,
                            fontWeight:900, fontVariantNumeric:"tabular-nums", lineHeight:1,
                            position:"relative", zIndex:1,
                            color: isActive ? "var(--primary)" : "rgba(255,255,255,0.18)",
                            transition:"font-size 0.4s, color 0.4s",
                          }}>
                            {i + 1}
                          </span>
                        )}
                      </div>
                    </div>
                  </div>

                  {/* Step label below orb */}
                  <span style={{
                    fontSize:8, fontWeight:700, letterSpacing:"0.04em",
                    fontVariantNumeric:"tabular-nums",
                    color: isActive
                      ? "color-mix(in oklab,var(--primary) 80%,rgba(255,255,255,0.5))"
                      : isPast
                      ? "rgba(255,255,255,0.28)"
                      : "rgba(255,255,255,0.10)",
                    transition:"color 0.4s",
                  }}>
                    {i + 1}
                  </span>
                </div>

                {/* ── Connecting tube ── */}
                {!isLast && (
                  <div style={{ flex:1, height:1.5, position:"relative", margin:"0 3px", marginBottom:13 }}>
                    <div style={{ position:"absolute", inset:0, borderRadius:999, background:"rgba(255,255,255,0.06)" }} />
                    {isPast && (
                      <div style={{
                        position:"absolute", inset:0, borderRadius:999,
                        background:"linear-gradient(90deg,color-mix(in oklab,var(--primary) 40%,transparent),color-mix(in oklab,var(--primary) 50%,transparent))",
                      }} />
                    )}
                    {isActive && i > 0 && (
                      <div style={{
                        position:"absolute", left:0, top:0, bottom:0, width:"50%", borderRadius:999,
                        background:"color-mix(in oklab,var(--primary) 30%,transparent)",
                      }} />
                    )}
                  </div>
                )}
              </div>
            );
          })}
        </div>

        {/* ── Stat footer ── */}
        <div style={{
          marginTop:14,
          padding:"8px 10px",
          borderRadius:10,
          background:"rgba(255,255,255,0.03)",
          border:"1px solid rgba(255,255,255,0.06)",
          display:"flex", alignItems:"center", gap:0,
        }}>
          {/* Progress bar + pct */}
          <div style={{ flex:1 }}>
            <div style={{ display:"flex", alignItems:"center", justifyContent:"space-between", marginBottom:5 }}>
              <span style={{ fontSize:8, fontWeight:700, letterSpacing:"0.10em", textTransform:"uppercase", color:"rgba(255,255,255,0.22)" }}>
                Progress
              </span>
              <span style={{ fontSize:9, fontWeight:800, fontVariantNumeric:"tabular-nums",
                color:"color-mix(in oklab,var(--primary) 70%,rgba(255,255,255,0.5))" }}>
                {pct}%
              </span>
            </div>
            <div style={{ height:3, borderRadius:999, background:"rgba(255,255,255,0.07)", position:"relative" }}>
              <div style={{
                position:"absolute", left:0, top:0, bottom:0, borderRadius:999,
                width:`${pct}%`,
                background:`linear-gradient(90deg,color-mix(in oklab,var(--primary) 40%,transparent),var(--primary))`,
                transition:"width 0.8s cubic-bezier(0.4,0,0.2,1)",
              }} />
            </div>
          </div>

          {/* Divider */}
          <div style={{ width:1, height:28, background:"rgba(255,255,255,0.07)", margin:"0 12px", flexShrink:0 }} />

          {/* Remaining */}
          <div style={{ textAlign:"center", flexShrink:0 }}>
            <div style={{ fontSize:16, fontWeight:900, lineHeight:1, fontVariantNumeric:"tabular-nums",
              color:"rgba(255,255,255,0.40)" }}>
              {remaining}
            </div>
            <div style={{ fontSize:7.5, fontWeight:700, letterSpacing:"0.10em", textTransform:"uppercase",
              color:"rgba(255,255,255,0.18)", marginTop:2 }}>
              left
            </div>
          </div>

          {/* Divider */}
          <div style={{ width:1, height:28, background:"rgba(255,255,255,0.07)", margin:"0 12px", flexShrink:0 }} />

          {/* Status pill */}
          <div style={{ flexShrink:0 }}>
            <div style={{
              display:"inline-flex", alignItems:"center", gap:5,
              padding:"3px 8px", borderRadius:999,
              background:"color-mix(in oklab,var(--primary) 8%,rgba(255,255,255,0.03))",
              border:"1px solid color-mix(in oklab,var(--primary) 18%,rgba(255,255,255,0.05))",
            }}>
              <span style={{
                width:5, height:5, borderRadius:"50%", flexShrink:0,
                background:"var(--primary)",
                boxShadow:"0 0 4px 1px color-mix(in oklab,var(--primary) 45%,transparent)",
                animation:"pulse 2.5s ease-in-out infinite",
              }} />
              <span style={{ fontSize:8, fontWeight:700, letterSpacing:"0.08em", textTransform:"uppercase",
                color:"color-mix(in oklab,var(--primary) 65%,rgba(255,255,255,0.45))" }}>
                Active
              </span>
            </div>
          </div>
        </div>

      </div>
    </>
  );
}

interface DcaData { dca_step?: number; dca_total_steps?: number; status?: string; }
function useDcaData() {
  const [data, setData] = useState<DcaData | null>(null);
  useEffect(() => {
    let alive = true;
    let timer: ReturnType<typeof setTimeout>;
    async function poll() {
      try {
        const r = await fetch(`${API_BASE}/api/bot/data?key=dca`);
        if (r.ok) { const j = await r.json(); if (alive && j?.data) setData(j.data as DcaData); }
      } catch {}
      timer = setTimeout(poll, 3000);
    }
    poll();
    return () => { alive = false; clearTimeout(timer); };
  }, []);
  return data;
}

const LAST_SYMBOL_KEY = "dashboard_last_order_symbol";
interface LastTrade { symbol:string; base:string; price:number; qty:number; quoteQty:number; time:number; }

function useLastTrade(activeSymbol: string | undefined): LastTrade | null {
  useEffect(() => { if (activeSymbol) localStorage.setItem(LAST_SYMBOL_KEY, activeSymbol); }, [activeSymbol]);
  const storedSymbol = localStorage.getItem(LAST_SYMBOL_KEY) ?? undefined;
  const querySymbol  = activeSymbol ? undefined : storedSymbol;
  const q = useQuery({
    queryKey:["lastTrades", querySymbol],
    queryFn: () => getMyTrades({ data:{ symbol:querySymbol!, limit:200 } }),
    enabled: !!querySymbol, staleTime:60_000,
  });
  return useMemo(() => {
    if (!q.data || !querySymbol) return null;
    const sells = q.data.filter((t) => !t.isBuyer);
    if (!sells.length) return null;
    const latest = sells.reduce((a,b) => b.time>a.time?b:a);
    return {
      symbol: querySymbol,
      base:     querySymbol.replace(/USDT$|BUSD$|FDUSD$|BTC$|ETH$/,""),
      price:    parseFloat(latest.price),
      qty:      parseFloat(latest.qty),
      quoteQty: parseFloat(latest.quoteQty??"0"),
      time:     latest.time,
    };
  }, [q.data, querySymbol]);
}

/* ── Dashboard ────────────────────────────────────────────────────────────── */
export default function Dashboard() {
  const account = useQuery({ queryKey:["account"],    queryFn:getAccount,    refetchInterval:15_000 });
  const orders  = useQuery({ queryKey:["openOrders"], queryFn:getOpenOrders, refetchInterval:8_000  });
  const prices  = useQuery({ queryKey:["prices"],     queryFn:getAllPrices,  refetchInterval:5_000  });
  const dcaData = useDcaData();

  const allOrders   = orders.data ?? [];
  const primary     = allOrders[0];
  const sameSymbol  = allOrders.filter((o) => o.symbol === primary?.symbol);
  const tpOrder     = sameSymbol.find((o) => parseFloat(o.stopPrice||"0")===0) ?? primary;
  const slOrder     = sameSymbol.find((o) => parseFloat(o.stopPrice||"0")>0);
  const orderSymbol = primary?.symbol;
  const orderBase   = orderSymbol?.replace(/USDT$|BUSD$|FDUSD$|BTC$|ETH$/,"") || "";

  const trades = useQuery({
    queryKey:["trades",orderSymbol],
    queryFn: () => getMyTrades({ data:{ symbol:orderSymbol!, limit:200 } }),
    enabled: !!orderSymbol, refetchInterval:60_000,
  });
  const lastTrade = useLastTrade(orderSymbol);

  const avgEntry = useMemo(() => {
    if (!trades.data?.length) return 0;
    let cost=0, qty=0;
    for (const t of trades.data) {
      const p=parseFloat(t.price), q=parseFloat(t.qty);
      if (t.isBuyer) { cost+=p*q; qty+=q; }
      else if (qty>0) { const r=Math.min(q,qty)/qty; cost*=(1-r); qty-=Math.min(q,qty); }
    }
    return qty>0 ? cost/qty : 0;
  }, [trades.data]);

  const [livePrice,setLivePrice] = useState<number|undefined>();
  const [flash,setFlash]         = useState<"up"|"down"|null>(null);
  useEffect(() => {
    setLivePrice(undefined);
    if (!orderSymbol) return;
    const ws = new WebSocket(`wss://data-stream.binance.vision/ws/${orderSymbol.toLowerCase()}@trade`);
    ws.onmessage = (e) => {
      try {
        const d=JSON.parse(e.data), p=parseFloat(d.p);
        setLivePrice((prev) => { if (prev!==undefined&&p!==prev) setFlash(p>prev?"up":"down"); return p; });
      } catch {}
    };
    return () => ws.close();
  }, [orderSymbol]);
  useEffect(() => { if (!flash) return; const t=setTimeout(()=>setFlash(null),500); return ()=>clearTimeout(t); }, [flash]);

  const [chartSymbol,setChartSymbol] = useState("BTCUSDT");
  useEffect(() => { setChartSymbol(orderSymbol || "BTCUSDT"); }, [orderSymbol]);

  const allAssets = useMemo(() => {
    if (!account.data||!prices.data) return [];
    return account.data.balances.map((b) => {
      const total = b.free+b.locked;
      const usd   = b.asset==="USDT" ? total : total*(prices.data?.[`${b.asset}USDT`]??0);
      return { ...b, total, usd };
    });
  }, [account.data, prices.data]);

  const walletAssets = useMemo(() => allAssets.filter((b)=>b.usd>=2).sort((a,b)=>b.usd-a.usd), [allAssets]);
  const totalUsdt    = allAssets.reduce((s,a)=>s+a.usd,0);

  const tpPrice  = tpOrder  ? parseFloat(tpOrder.price)                                    : 0;
  const slPrice  = slOrder  ? (parseFloat(slOrder.stopPrice)||parseFloat(slOrder.price))   : 0;
  const orderQty = primary  ? parseFloat(primary.origQty)                                  : 0;
  const entry    = avgEntry>0 ? avgEntry : (primary?parseFloat(primary.price):0);
  const cur      = livePrice ?? (orderSymbol?prices.data?.[orderSymbol]:undefined);

  const pnlPct      = cur&&entry ? ((cur-entry)/entry)*100 : 0;
  const pnlUsd      = cur&&entry ? (cur-entry)*orderQty    : 0;
  const targetPct   = tpPrice&&entry ? ((tpPrice-entry)/entry)*100 : 0;
  const stopPct     = slPrice&&entry ? ((slPrice-entry)/entry)*100 : 0;
  const distToTpPct = cur&&tpPrice  ? ((tpPrice-cur)/cur)*100 : 0;
  const distToSlPct = cur&&slPrice  ? ((cur-slPrice)/cur)*100 : 0;

  const tpProgress = cur&&tpPrice&&entry&&tpPrice!==entry ? Math.max(0,Math.min(1,(cur-entry)/(tpPrice-entry))) : 0;
  const slProgress = cur&&slPrice&&entry&&entry!==slPrice ? Math.max(0,Math.min(1,(entry-cur)/(entry-slPrice))) : 0;

  const dcaStep  = dcaData?.dca_step        ?? 0;
  const dcaTotal = dcaData?.dca_total_steps ?? 6;
  const showDca  = !!primary && dcaStep>0 && dcaData?.status!=="COMPLETED";

  const chartLines = useMemo(() => {
    const out:Array<{price:number;label:string;color:string}> = [];
    if (orderSymbol && chartSymbol===orderSymbol) {
      if (entry  >0) out.push({ price:entry,   label:`Entry ${fmtPrice(entry)}`,   color:"#a3b1c2" });
      if (tpPrice>0) out.push({ price:tpPrice, label:`TP ${fmtPrice(tpPrice)}`,    color:"#10b981" });
      if (slPrice>0) out.push({ price:slPrice, label:`SL ${fmtPrice(slPrice)}`,    color:"#ef4444" });
    }
    return out;
  }, [orderSymbol,chartSymbol,entry,tpPrice,slPrice]);

  return (
    <AppLayout>
      {/* Ambient background glow — bleeds through every glass panel */}
      <div className="relative space-y-5">
        <div className="pointer-events-none fixed inset-0 -z-10"
          style={{
            background:[
              "radial-gradient(ellipse 70% 45% at 15% 10%, color-mix(in oklab,var(--primary) 14%,transparent), transparent)",
              "radial-gradient(ellipse 55% 35% at 85% 80%, color-mix(in oklab,var(--primary) 8%,transparent), transparent)",
            ].join(","),
          }}
        />

        {/* ── WALLET ── */}
        <section className="rounded-2xl p-5 md:p-6 relative overflow-hidden" style={glass.card}>
          {/* top sheen */}
          <div className="absolute inset-x-0 top-0 h-px pointer-events-none"
            style={{ background:"linear-gradient(90deg,transparent,rgba(255,255,255,0.22),transparent)" }} />
          {/* radial glow */}
          <div className="absolute inset-0 pointer-events-none"
            style={{ background:"radial-gradient(circle at top right,color-mix(in oklab,var(--primary) 16%,transparent),transparent 60%)" }} />

          <div className="relative flex items-center gap-2 text-[11px] uppercase tracking-widest text-primary/80 font-bold">
            <span className="h-2 w-2 rounded-full bg-primary animate-pulse" />
            <WalletIcon className="h-3.5 w-3.5" />
            Wallet
          </div>
          <div className="relative mt-3">
            <span className="text-4xl md:text-6xl font-black tracking-tight bg-gradient-to-br from-white to-primary/70 bg-clip-text text-transparent">
              ${account.isLoading ? "…" : fmt(totalUsdt)}
            </span>
          </div>

          {walletAssets.length>0 && (
            <div className="relative mt-4 flex gap-2 overflow-x-auto pb-1 -mx-1 px-1">
              {walletAssets.slice(0,10).map((b) => (
                <div key={b.asset} className="shrink-0 rounded-xl px-3 py-2 flex items-center gap-2 min-w-[150px] hover:scale-[1.02] transition-transform cursor-default"
                  style={glass.chip}>
                  <CoinIcon symbol={b.asset} size={28} />
                  <div className="min-w-0">
                    <div className="text-xs font-bold truncate text-white/90">{b.asset}</div>
                    <div className="text-[10px] text-white/45 tabular-nums">${fmt(b.usd)}</div>
                  </div>
                </div>
              ))}
            </div>
          )}
        </section>

        {/* ── ACTIVE TRADE ── */}
        <section className="rounded-2xl p-5 md:p-6 relative overflow-hidden" style={{
          ...glass.card,
          ...(primary ? {
            border:"1px solid color-mix(in oklab,var(--primary) 35%,rgba(255,255,255,0.06))",
            boxShadow:"0 0 60px -16px color-mix(in oklab,var(--primary) 40%,transparent), 0 4px 32px rgba(0,0,0,0.30), inset 0 1px 0 rgba(255,255,255,0.10)",
          } : {}),
        }}>
          {/* top sheen */}
          <div className="absolute inset-x-0 top-0 h-px pointer-events-none"
            style={{ background: primary
              ? "linear-gradient(90deg,transparent,color-mix(in oklab,var(--primary) 80%,rgba(255,255,255,0.5)),transparent)"
              : "linear-gradient(90deg,transparent,rgba(255,255,255,0.15),transparent)" }} />

          {primary ? (
            <>
              {/* Coin header */}
              <div className="relative flex items-center justify-between gap-3 flex-wrap">
                <div className="flex items-center gap-3 min-w-0">
                  <div className="relative">
                    <CoinIcon symbol={orderBase} size={52} className="ring-2 ring-primary/40 drop-shadow-lg" />
                    <span className="absolute -inset-1 rounded-full ring-2 ring-primary/40 animate-ping opacity-30" />
                  </div>
                  <div className="min-w-0">
                    <div className="flex items-center gap-2 flex-wrap">
                      <h2 className="text-xl md:text-2xl font-black truncate text-white">{primary.symbol}</h2>
                      <span className="text-[10px] font-bold px-2 py-0.5 rounded-md uppercase tracking-wider"
                        style={{ background:"rgba(255,255,255,0.08)", color:"var(--primary)", border:"1px solid rgba(255,255,255,0.10)" }}>
                        {primary.type}
                      </span>
                      <span className={`text-[10px] font-bold px-2 py-0.5 rounded-md uppercase tracking-wider ${primary.side==="SELL" ? "text-bear" : "text-bull"}`}
                        style={{ background:"rgba(255,255,255,0.06)", border:"1px solid rgba(255,255,255,0.08)" }}>
                        {primary.side}
                      </span>
                    </div>
                    <div className="text-xs text-white/45 mt-1 flex items-center gap-1.5">
                      <span className="inline-block h-1.5 w-1.5 rounded-full bg-bull animate-pulse" />
                      Live · {fmt(orderQty,4)} {orderBase}
                    </div>
                  </div>
                </div>
                <div className="text-right shrink-0">
                  <div className={`text-2xl md:text-4xl font-black tabular-nums ${pnlUsd>=0?"text-bull":"text-bear"}`}>
                    {pnlUsd>=0?"+":""}${pnlUsd.toFixed(2)}
                  </div>
                  <div className={`text-xs font-bold ${pnlPct>=0?"text-bull":"text-bear"}`}>
                    {pnlPct>=0?"▲":"▼"} {Math.abs(pnlPct).toFixed(2)}%
                  </div>
                </div>
              </div>

              {/* Live price */}
              <div className="relative mt-5 rounded-xl px-4 py-3 flex items-center justify-between transition-all duration-300"
                style={{
                  ...glass.inner,
                  ...(flash==="up"  ? { background:"rgba(16,185,129,0.10)", border:"1px solid rgba(16,185,129,0.30)" }
                    : flash==="down"? { background:"rgba(239,68,68,0.10)",  border:"1px solid rgba(239,68,68,0.30)" }
                    : {}),
                }}>
                <span className="text-[10px] uppercase tracking-widest font-bold text-white/40 flex items-center gap-1.5">
                  <Activity className="h-3 w-3" /> Live price
                </span>
                <span className={`text-2xl md:text-3xl font-black tabular-nums transition-colors ${flash==="up"?"text-bull":flash==="down"?"text-bear":"text-white"}`}>
                  ${cur ? fmtPrice(cur) : "…"}
                </span>
              </div>

              {/* DCA */}
              {showDca && <DcaSteps step={dcaStep} total={dcaTotal} />}

              {/* TP / SL */}
              <div className="relative mt-4 grid sm:grid-cols-2 gap-3">
                <ProgressTrack icon={<Target className="h-3.5 w-3.5"/>} label="TAKE PROFIT"
                  fromLabel={`Entry $${fmtPrice(entry)}`} toLabel={tpPrice?`TP $${fmtPrice(tpPrice)}`:"—"}
                  pct={tpProgress} rightValue={tpPrice?`${targetPct>=0?"+":""}${targetPct.toFixed(2)}%`:"—"}
                  hint={tpPrice&&cur?`${distToTpPct>=0?"+":""}${distToTpPct.toFixed(2)}% to TP`:""} color="bull" />
                <ProgressTrack icon={<Shield className="h-3.5 w-3.5"/>} label="Stop loss"
                  fromLabel={`Entry $${fmtPrice(entry)}`} toLabel={slPrice?`SL $${fmtPrice(slPrice)}`:"—"}
                  pct={slProgress} rightValue={slPrice?`${stopPct.toFixed(2)}%`:"—"}
                  hint={slPrice&&cur?`${distToSlPct.toFixed(2)}% buffer`:""} color="bear" />
              </div>

              {/* Summary cells */}
              <div className="relative mt-4 grid grid-cols-2 md:grid-cols-4 gap-2">
                <Cell label="Entry (avg)" value={`$${fmtPrice(entry)}`} />
                <Cell label="Qty"         value={`${fmt(orderQty,4)} ${orderBase}`} />
                <Cell label="Take Profit" value={tpPrice?`$${fmtPrice(tpPrice)}`:"—"} accent />
                <Cell label="Stop Loss"   value={slPrice?`$${fmtPrice(slPrice)}`:"—"} danger />
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

/* ── NoActiveTrade ────────────────────────────────────────────────────────── */
function NoActiveTrade({ lastTrade }: { lastTrade: LastTrade | null }) {
  if (!lastTrade) {
    return (
      <div className="py-10 text-center">
        <TrendingUp className="h-10 w-10 mx-auto text-white/20" />
        <h2 className="mt-3 text-xl font-black text-white/80">No Active Trade</h2>
        <p className="text-sm text-white/35 mt-1">Place a limit or OCO order on Binance and it will appear here.</p>
      </div>
    );
  }
  const { date, time } = fmtUAE(lastTrade.time);
  return (
    <div className="py-6">
      <div className="flex items-center gap-2 text-[10px] uppercase tracking-widest font-bold text-white/30 mb-5">
        <span className="h-1.5 w-1.5 rounded-full bg-white/20" />
        Last Closed Trade
      </div>
      <div className="flex items-center gap-4">
        <div className="relative shrink-0">
          <div className="absolute inset-0 rounded-full blur-xl scale-125" style={{ background:"color-mix(in oklab,var(--primary) 25%,transparent)" }} />
          <CoinIcon symbol={lastTrade.base} size={56} className="relative" />
        </div>
        <div className="min-w-0 flex-1">
          <div className="text-2xl md:text-3xl font-black tracking-tight truncate text-white">
            {lastTrade.base}
            <span className="text-sm font-semibold text-white/35 ml-1.5">/ USDT</span>
          </div>
          <div className="text-xs text-white/40 mt-0.5 font-medium truncate">
            Sold · ${fmtPrice(lastTrade.price)}
            {lastTrade.quoteQty>0 && <span className="ml-2 text-white/25">≈ ${fmt(lastTrade.quoteQty)}</span>}
          </div>
        </div>
        <span className="shrink-0 text-[10px] font-bold px-2.5 py-1 rounded-lg text-bear uppercase tracking-wider"
          style={{ background:"rgba(239,68,68,0.10)", border:"1px solid rgba(239,68,68,0.20)" }}>
          Sold
        </span>
      </div>
      <div className="mt-5 flex items-center gap-3 rounded-xl px-4 py-3" style={glass.inner}>
        <Clock className="h-4 w-4 text-white/35 shrink-0" />
        <div className="flex flex-wrap gap-x-4 gap-y-1 text-sm font-semibold tabular-nums text-white/80">
          <span>{date}</span>
          <span className="text-white/40">{time} <span className="text-[10px] font-bold uppercase tracking-widest ml-0.5">UAE</span></span>
        </div>
      </div>
    </div>
  );
}

/* ── Cell ─────────────────────────────────────────────────────────────────── */
function Cell({ label, value, accent, danger }: { label:string; value:string; accent?:boolean; danger?:boolean }) {
  return (
    <div className="rounded-lg px-3 py-2" style={{
      ...glass.inner,
      ...(danger ? { border:"1px solid rgba(239,68,68,0.22)",  background:"rgba(239,68,68,0.08)"  } : {}),
      ...(accent ? { border:"1px solid rgba(16,185,129,0.22)", background:"rgba(16,185,129,0.08)" } : {}),
    }}>
      <div className="text-[9px] uppercase tracking-widest font-bold text-white/35">{label}</div>
      <div className={`text-sm font-black mt-0.5 truncate tabular-nums ${danger?"text-bear":accent?"text-bull":"text-white/90"}`}>{value}</div>
    </div>
  );
}

/* ── ProgressTrack ────────────────────────────────────────────────────────── */
function ProgressTrack({ icon, label, fromLabel, toLabel, pct, rightValue, hint, color }: {
  icon:React.ReactNode; label:string; fromLabel:string; toLabel:string;
  pct:number; rightValue:string; hint?:string; color:"bull"|"bear";
}) {
  const w = Math.max(2, Math.min(100, pct*100));
  const isBull = color==="bull";

  const [displayPct,setDisplayPct] = useState(w);
  const prevW   = useRef(w);
  const timerR  = useRef<ReturnType<typeof setInterval>|null>(null);
  useEffect(() => {
    const start=prevW.current, end=w;
    prevW.current=w;
    if (Math.abs(end-start)<0.05) return;
    if (timerR.current) clearInterval(timerR.current);
    const STEPS=28, DUR=700; let step=0;
    timerR.current = setInterval(() => {
      step++; const t=step/STEPS, e=1-Math.pow(1-t,3);
      setDisplayPct(start+(end-start)*e);
      if (step>=STEPS) { setDisplayPct(end); if(timerR.current) clearInterval(timerR.current); }
    }, DUR/STEPS);
    return () => { if(timerR.current) clearInterval(timerR.current); };
  }, [w]);

  const [popKey,setPopKey] = useState(0);
  const prevRnd = useRef(Math.round(w*10));
  useEffect(() => {
    const n=Math.round(w*10);
    if (n!==prevRnd.current) { prevRnd.current=n; setPopKey((k)=>k+1); }
  }, [w]);

  return (
    <div className="rounded-xl p-3 relative overflow-hidden" style={glass.inner}>
      <style>{`
        @keyframes pt-glow-bull { 0%,100%{box-shadow:0 0 2px 0 color-mix(in oklab,var(--bull) 12%,transparent),0 0 4px 1px color-mix(in oklab,var(--bull) 5%,transparent);}50%{box-shadow:0 0 3px 1px color-mix(in oklab,var(--bull) 18%,transparent),0 0 6px 1px color-mix(in oklab,var(--bull) 8%,transparent);} }
        @keyframes pt-glow-bear { 0%,100%{box-shadow:0 0 2px 0 color-mix(in oklab,var(--bear) 12%,transparent),0 0 4px 1px color-mix(in oklab,var(--bear) 5%,transparent);}50%{box-shadow:0 0 3px 1px color-mix(in oklab,var(--bear) 18%,transparent),0 0 6px 1px color-mix(in oklab,var(--bear) 8%,transparent);} }
        @keyframes pt-shimmer   { 0%{transform:translateX(-160%) skewX(-12deg);opacity:0;}20%{opacity:.6;}80%{opacity:.6;}100%{transform:translateX(280%) skewX(-12deg);opacity:0;} }
        @keyframes pt-tip-bull  { 0%,100%{transform:translateY(-50%) scale(1);box-shadow:0 0 2px 1px color-mix(in oklab,var(--bull) 20%,transparent),0 0 4px 1px color-mix(in oklab,var(--bull) 9%,transparent);}50%{transform:translateY(-50%) scale(1.15);box-shadow:0 0 3px 1px color-mix(in oklab,var(--bull) 28%,transparent),0 0 6px 2px color-mix(in oklab,var(--bull) 12%,transparent);} }
        @keyframes pt-tip-bear  { 0%,100%{transform:translateY(-50%) scale(1);box-shadow:0 0 2px 1px color-mix(in oklab,var(--bear) 20%,transparent),0 0 4px 1px color-mix(in oklab,var(--bear) 9%,transparent);}50%{transform:translateY(-50%) scale(1.15);box-shadow:0 0 3px 1px color-mix(in oklab,var(--bear) 28%,transparent),0 0 6px 2px color-mix(in oklab,var(--bear) 12%,transparent);} }
        @keyframes pt-badge-pop { 0%{transform:translateX(-50%) scale(.75);opacity:0;}60%{transform:translateX(-50%) scale(1.12);opacity:1;}100%{transform:translateX(-50%) scale(1);opacity:1;} }
        @keyframes pt-digit-up  { 0%{transform:translateY(60%);opacity:0;}100%{transform:translateY(0);opacity:1;} }
        .pt-bar-bull  { animation: pt-glow-bull 2s ease-in-out infinite; }
        .pt-bar-bear  { animation: pt-glow-bear 2s ease-in-out .4s infinite; }
        .pt-shimmer   { animation: pt-shimmer   2.4s ease-in-out infinite; }
        .pt-tip-bull  { animation: pt-tip-bull  1.8s ease-in-out infinite; }
        .pt-tip-bear  { animation: pt-tip-bear  1.8s ease-in-out .4s infinite; }
        .pt-badge-pop { animation: pt-badge-pop .35s cubic-bezier(.22,1,.36,1) both; }
        .pt-digit-up  { animation: pt-digit-up  .22s ease-out both; }
      `}</style>

      <div className="flex items-center justify-between text-[10px] uppercase tracking-widest font-bold text-white/35">
        <span className="flex items-center gap-1.5">{icon}{label}</span>
        <span className={`text-sm font-black tabular-nums ${isBull?"text-bull":"text-bear"}`}>{rightValue}</span>
      </div>

      <div className="relative mt-5" style={{ paddingBottom:"2px" }}>
        <div className="relative h-2 rounded-full" style={{ overflow:"visible", background:"rgba(255,255,255,0.08)" }}>
          <div className={`relative h-full rounded-full transition-[width] duration-700 overflow-hidden ${isBull?"pt-bar-bull":"pt-bar-bear"}`}
            style={{
              width:`${w}%`,
              background:isBull
                ? "linear-gradient(90deg,color-mix(in oklab,var(--bull) 55%,transparent),var(--bull))"
                : "linear-gradient(90deg,color-mix(in oklab,var(--bear) 55%,transparent),var(--bear))",
            }}>
            <div className="pt-shimmer absolute inset-y-0 pointer-events-none"
              style={{ width:"38%", background:"linear-gradient(90deg,transparent,rgba(255,255,255,0.42),transparent)", borderRadius:"999px" }} />
          </div>
          {w>3 && (
            <div className={isBull?"pt-tip-bull":"pt-tip-bear"}
              style={{ position:"absolute", top:"50%", left:`calc(${w}% - 5px)`,
                width:10, height:10, borderRadius:"50%",
                background:isBull?"var(--bull)":"var(--bear)", zIndex:10, pointerEvents:"none" }} />
          )}
          {w>3 && (
            <div key={popKey} className="pt-badge-pop"
              style={{ position:"absolute", top:"-26px", left:`${w}%`, transform:"translateX(-50%)", pointerEvents:"none", zIndex:20 }}>
              <div style={{
                display:"inline-flex", alignItems:"center", padding:"2px 6px",
                borderRadius:"999px", fontSize:9, fontWeight:900, fontVariantNumeric:"tabular-nums",
                letterSpacing:"0.01em", lineHeight:1, whiteSpace:"nowrap",
                background:isBull?"rgba(16,185,129,0.18)":"rgba(239,68,68,0.18)",
                border:isBull?"1px solid rgba(16,185,129,0.40)":"1px solid rgba(239,68,68,0.40)",
                color:isBull?"var(--bull)":"var(--bear)",
              }}>
                <span key={`${popKey}-n`} className="pt-digit-up">{displayPct.toFixed(1)}%</span>
              </div>
              <div style={{
                position:"absolute", left:"50%", transform:"translateX(-50%)", top:"100%",
                width:1, height:8,
                background:isBull
                  ? "linear-gradient(to bottom,rgba(16,185,129,0.6),transparent)"
                  : "linear-gradient(to bottom,rgba(239,68,68,0.6),transparent)",
              }} />
            </div>
          )}
        </div>
      </div>

      <div className="mt-2 flex items-center justify-between text-[10px] text-white/30">
        <span className="truncate">{fromLabel}</span>
        <span className="truncate">{toLabel}</span>
      </div>
      {hint && <div className="mt-1 text-[10px] font-bold text-white/30">{hint}</div>}
    </div>
  );
}
