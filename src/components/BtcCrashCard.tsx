/**
 * BTC Crash Monitor — Premium Edition
 *
 * Drop-in replacement for BtcCrashCard.tsx.
 * Same props/exports/data interfaces — completely new visual design.
 *
 * Requires: lucide-react, CoinIcon (already in your project)
 */
import { useEffect, useRef, useState } from "react";
import { TrendingDown, Zap, Waves, Activity } from "lucide-react";
import { CoinIcon } from "./CoinIcon";

const API_BASE = import.meta.env.VITE_API_BASE ?? "";

/* ── Types ──────────────────────────────────────────────── */
interface BotData {
  price: number;
  drop_1m: number; drop_5m: number; drop_15m: number; drop_1h: number; drop_4h: number;
  peak_1m: number; peak_5m: number; peak_15m: number; peak_1h: number; peak_4h: number;
  speed: number; volatility: number; status: string;
  trade_mode?: string; pause_reason?: string;
  whale_count?: number; whale_usd_total?: number; whale_buy_total?: number;
  whale_net_flow?: number; whale_net_flow_level?: string; consec_drops?: number;
  vol_spike?: boolean; funding_rate?: number; funding_level?: string;
  liq_usd_60s?: number; liq_level?: string; liq_largest?: number;
}
interface Snapshot { key: string; updatedAt: string | null; data: BotData | null; }

/* ── Palette ─────────────────────────────────────────────── */
const STAGE = {
  SAFE:       { hex:"#00d48e", r:0,   g:212, b:142, label:"SAFE",       sub:"OK TO TRADE ALTS"  },
  WATCH:      { hex:"#f5c842", r:245, g:200, b:66,  label:"WATCH",      sub:"BE SELECTIVE"      },
  RISK:       { hex:"#ff8c42", r:255, g:140, b:66,  label:"RISK",       sub:"HOLD OFF NEW BUYS" },
  SELL_ALERT: { hex:"#ff4f6b", r:255, g:79,  b:107, label:"SELL ALERT", sub:"PAUSE BUYING"      },
  DANGER:     { hex:"#ff2d55", r:255, g:45,  b:85,  label:"⚠ DANGER",  sub:"CONSIDER SELLING"  },
} as const;
type Stage = keyof typeof STAGE;

const DROP_COLOR = (p: number) => p >= 4 ? "#ff2d55" : p >= 2 ? "#ff8c42" : p >= 1 ? "#f5c842" : "#00d48e";
const LVL_COLOR  = (l: string) => ({ NORMAL:"#00d48e", WATCH:"#f5c842", RISK:"#ff8c42", DANGER:"#ff2d55" } as Record<string,string>)[l] ?? "#00d48e";

/* ── Utils ───────────────────────────────────────────────── */
const f$  = (p: number) => p.toLocaleString(undefined,{minimumFractionDigits:2,maximumFractionDigits:2});
const fM  = (u: number) => u>=1e6?`$${(u/1e6).toFixed(1)}M`:u>=1e3?`$${(u/1e3).toFixed(0)}K`:`$${u.toFixed(0)}`;
const fFn = (r: number) => `${r>=0?"+":""}${(r*100).toFixed(4)}%`;
const ago = (iso: string) => { const s=Math.floor((Date.now()-new Date(iso).getTime())/1e3); return s<5?"just now":s<60?`${s}s ago`:`${Math.floor(s/60)}m ${s%60}s ago`; };

/* ── Glow helper (converts hex to rgb triple once) ──────── */
function hexRgb(hex: string): [number,number,number] {
  const m = hex.slice(1).match(/.{2}/g)!;
  return [parseInt(m[0],16), parseInt(m[1],16), parseInt(m[2],16)];
}

/* ── Glass tile ─────────────────────────────────────────── */
function GlassTile({
  label, value, sub, hex, giant=false, children,
  className="",
}:{
  label?:string; value?:string; sub?:string; hex:string;
  giant?:boolean; children?:React.ReactNode; className?:string;
}) {
  const [r,g,b]=hexRgb(hex);
  return (
    <div className={`relative rounded-2xl overflow-hidden flex flex-col ${className}`}
      style={{
        background:`rgba(${r},${g},${b},0.08)`,
        border:`1px solid rgba(${r},${g},${b},0.25)`,
        backdropFilter:"blur(20px) saturate(180%)",
        WebkitBackdropFilter:"blur(20px) saturate(180%)",
        boxShadow:`0 4px 32px -12px rgba(${r},${g},${b},0.35), inset 0 1px 0 rgba(255,255,255,0.10)`,
      }}>
      {/* Top shimmer line */}
      <div className="absolute inset-x-0 top-0 h-[1.5px] rounded-t-2xl"
        style={{background:`linear-gradient(90deg,transparent,rgba(${r},${g},${b},0.8),transparent)`}}/>
      {label&&<div className="px-4 pt-3.5 text-[8px] uppercase tracking-[0.22em] font-black"
        style={{color:`rgba(${r},${g},${b},0.55)`}}>{label}</div>}
      {value!==undefined&&(
        <div className={`px-4 font-black tabular-nums leading-none ${label?"mt-1.5 pb-1":"pt-3.5 pb-0.5"} ${giant?"text-5xl":"text-2xl"}`}
          style={{color:hex,textShadow:`0 0 22px rgba(${r},${g},${b},0.75),0 0 50px rgba(${r},${g},${b},0.25)`}}>
          {value}
        </div>
      )}
      {sub&&<div className="px-4 pb-3.5 text-[9px] font-bold mt-1"
        style={{color:`rgba(${r},${g},${b},0.45)`}}>{sub}</div>}
      {children}
    </div>
  );
}

/* ── Level chip ─────────────────────────────────────────── */
function Chip({level}:{level:string}) {
  const c=LVL_COLOR(level); const [r,g,b]=hexRgb(c);
  return (
    <span className="px-2.5 py-[3px] rounded-full text-[8px] font-black uppercase tracking-[0.18em]"
      style={{color:c,background:`rgba(${r},${g},${b},0.14)`,border:`1px solid rgba(${r},${g},${b},0.32)`}}>
      {level}
    </span>
  );
}

/* ── Animated drop bars (SVG sparkline) ─────────────────── */
function DropBars({ drops }: { drops: {label:string; pct:number}[] }) {
  const max = 6;
  return (
    <div className="flex items-end gap-2 h-14 px-1">
      {drops.map(({ label, pct }) => {
        const c   = DROP_COLOR(pct);
        const [r,g,b] = hexRgb(c);
        const h   = Math.max((pct / max) * 100, pct > 0 ? 8 : 3);
        return (
          <div key={label} className="flex-1 flex flex-col items-center gap-1">
            <div className="text-[8px] font-black tabular-nums"
              style={{color:pct>0?c:"rgba(255,255,255,0.2)",textShadow:pct>=2?`0 0 6px rgba(${r},${g},${b},0.8)`:undefined}}>
              {pct>0?`-${pct.toFixed(1)}%`:"—"}
            </div>
            <div className="w-full rounded-t-sm relative flex-1" style={{background:"rgba(255,255,255,0.04)"}}>
              <div className="absolute inset-x-0 bottom-0 rounded-t-sm"
                style={{
                  height:`${h}%`,
                  background:`linear-gradient(to top, ${c}, rgba(${r},${g},${b},0.4))`,
                  boxShadow:pct>=1?`0 -2px 12px rgba(${r},${g},${b},0.6)`:undefined,
                  transition:"height 1.2s cubic-bezier(0.22,1,0.36,1)",
                }}/>
            </div>
            <div className="text-[8px] font-black" style={{color:"rgba(255,255,255,0.3)"}}>{label}</div>
          </div>
        );
      })}
    </div>
  );
}

/* ── Radial status dial ─────────────────────────────────── */
function StatusDial({ hex, pct, label, sub, danger }: { hex:string; pct:number; label:string; sub:string; danger:boolean }) {
  const [r,g,b] = hexRgb(hex);
  const R=44; const circ=2*Math.PI*R; const arc=circ*0.75; const filled=arc*(pct/100);
  return (
    <div className="relative flex flex-col items-center justify-center">
      <svg width="108" height="108" style={{overflow:"visible"}}>
        {/* glow layer */}
        <circle cx="54" cy="54" r={R} fill="none" stroke={hex} strokeWidth="10" strokeOpacity="0.10"
          strokeDasharray={`${arc} ${circ}`} transform="rotate(135 54 54)" strokeLinecap="round"/>
        {/* track */}
        <circle cx="54" cy="54" r={R} fill="none" stroke="rgba(255,255,255,0.07)" strokeWidth="4"
          strokeDasharray={`${arc} ${circ}`} transform="rotate(135 54 54)" strokeLinecap="round"/>
        {/* fill */}
        <circle cx="54" cy="54" r={R} fill="none" stroke={hex} strokeWidth="4"
          strokeDasharray={`${filled} ${circ}`} transform="rotate(135 54 54)" strokeLinecap="round"
          style={{filter:`drop-shadow(0 0 8px ${hex})`,transition:"stroke-dasharray 1s cubic-bezier(0.22,1,0.36,1), stroke .7s ease"}}/>
        {/* tick marks */}
        {[0,25,50,75,100].map(t => {
          const a=(135+t*2.7)*Math.PI/180;
          const x1=54+(R-10)*Math.cos(a); const y1=54+(R-10)*Math.sin(a);
          const x2=54+(R-6)*Math.cos(a);  const y2=54+(R-6)*Math.sin(a);
          return <line key={t} x1={x1} y1={y1} x2={x2} y2={y2} stroke="rgba(255,255,255,0.15)" strokeWidth="1.5" strokeLinecap="round"/>;
        })}
      </svg>
      {/* Center content */}
      <div className="absolute inset-0 flex flex-col items-center justify-center gap-0.5">
        <div className="relative"><div className="absolute inset-0 rounded-full blur-xl" style={{background:`rgba(${r},${g},${b},0.5)`,transform:"scale(1.5)"}}/>
          <CoinIcon symbol="BTC" size={26} className="relative"/></div>
        <div className="text-[11px] font-black leading-tight text-center mt-1" style={{color:hex,textShadow:`0 0 12px rgba(${r},${g},${b},0.9)`,maxWidth:72}}>
          {label}
        </div>
      </div>
      {danger&&(
        <div className="absolute inset-0 rounded-full pointer-events-none"
          style={{animation:"btc_danger_ring 1.4s ease-out infinite",boxShadow:`0 0 0 0 rgba(${r},${g},${b},0.5)`}}/>
      )}
    </div>
  );
}

/* ── Main component ─────────────────────────────────────── */
export function BtcCrashCard() {
  const [snap,  setSnap]  = useState<Snapshot|null>(null);
  const [age,   setAge]   = useState("");
  const [price, setPrice] = useState<number|null>(null);
  const [flash, setFlash] = useState<"up"|"dn"|null>(null);
  const prevRef = useRef<number|null>(null);

  /* WebSocket live price */
  useEffect(()=>{
    const ws=new WebSocket("wss://data-stream.binance.vision/ws/btcusdt@trade");
    ws.onmessage=(e)=>{
      try {
        const p=parseFloat(JSON.parse(e.data).p);
        setFlash(prevRef.current!==null?p>prevRef.current!"up":"dn":null);
        prevRef.current=p;
        setPrice(p);
      } catch{}
    };
    return ()=>ws.close();
  },[]);
  useEffect(()=>{ if(!flash)return; const t=setTimeout(()=>setFlash(null),800); return()=>clearTimeout(t); },[flash]);

  /* Bot poll */
  useEffect(()=>{
    let ok=true;
    const poll=async()=>{ try{ const r=await fetch(`${API_BASE}/api/bot/data?key=btc`); if(r.ok&&ok)setSnap(await r.json()); }catch{} };
    poll(); const id=setInterval(poll,3000); return()=>{ ok=false; clearInterval(id); };
  },[]);

  /* Age */
  useEffect(()=>{
    if(!snap?.updatedAt)return;
    const id=setInterval(()=>setAge(ago(snap.updatedAt!)),1000);
    setAge(ago(snap.updatedAt)); return()=>clearInterval(id);
  },[snap?.updatedAt]);

  const d         = snap?.data;
  const stage     = (d?.status??"SAFE") as Stage;
  const st        = STAGE[stage]??STAGE.SAFE;
  const [r,g,b]   = [st.r, st.g, st.b];
  const isDanger  = stage==="DANGER"||stage==="SELL_ALERT";
  const isPaused  = d?.trade_mode==="Pause";

  /* derived signals */
  const wCount    = d?.whale_count??0;
  const wUsd      = d?.whale_usd_total??0;
  const wBuy      = d?.whale_buy_total??0;
  const wNet      = d?.whale_net_flow??0;
  const wNetLvl   = d?.whale_net_flow_level??"NORMAL";
  const consec    = d?.consec_drops??0;
  const volSpike  = d?.vol_spike??false;
  const funding   = d?.funding_rate??0;
  const fundLvl   = d?.funding_level??"NORMAL";
  const liqUsd    = d?.liq_usd_60s??0;
  const liqLvl    = d?.liq_level??"NORMAL";
  const liqLargest= d?.liq_largest??0;
  const netAbs    = Math.abs(wNet);
  const netNeg    = wNet<0;
  const maxDrop   = d?Math.max(d.drop_1m,d.drop_5m,d.drop_15m,d.drop_1h,d.drop_4h):0;
  const dialPct   = Math.min((maxDrop/6)*100,100);

  const drops=[
    {label:"1m",  pct:d?.drop_1m??0},
    {label:"5m",  pct:d?.drop_5m??0},
    {label:"15m", pct:d?.drop_15m??0},
    {label:"1h",  pct:d?.drop_1h??0},
    {label:"4h",  pct:d?.drop_4h??0},
  ];

  const pauseReason=(()=>{
    if(!d)return "";
    if(d.pause_reason?.trim())return d.pause_reason.trim();
    const parts:string[]=[];
    drops.forEach(({label,pct})=>{ if(pct>=1)parts.push(`${label}: −${pct.toFixed(2)}%`); });
    if(consec>=3)parts.push(`${consec} bleed mins`);
    if(volSpike)parts.push("vol spike");
    if(wCount>=3)parts.push(`${wCount} whale sells`);
    return parts.join(" · ")||"Conditions elevated — awaiting normalization";
  })();

  return (
    <>
      <style>{`
        @keyframes btc_border_spin { from{transform:rotate(0)} to{transform:rotate(360deg)} }
        @keyframes btc_danger_ring { 0%{box-shadow:0 0 0 0 rgba(${r},${g},${b},.55)} 100%{box-shadow:0 0 0 18px rgba(${r},${g},${b},0)} }
        @keyframes btc_price_up    { 0%{color:#00ffc8;text-shadow:0 0 60px rgba(0,255,200,1),0 0 120px rgba(0,255,200,.4);transform:translateY(-5px) scale(1.04)} 100%{color:#F7931A;text-shadow:0 0 35px rgba(247,147,26,.7);transform:none} }
        @keyframes btc_price_dn    { 0%{color:#ff2d55;text-shadow:0 0 60px rgba(255,45,85,1),0 0 120px rgba(255,45,85,.4);transform:translateY(5px) scale(1.04)}  100%{color:#F7931A;text-shadow:0 0 35px rgba(247,147,26,.7);transform:none} }
        @keyframes btc_float       { 0%,100%{transform:translateY(0)} 50%{transform:translateY(-4px)} }
        @keyframes btc_scan_h      { 0%{top:-1px;opacity:0} 8%{opacity:1} 92%{opacity:.4} 100%{top:100%;opacity:0} }
        @keyframes btc_fade_in     { from{opacity:0;transform:translateY(6px)} to{opacity:1;transform:none} }
        .btc-price-up { animation:btc_price_up .75s cubic-bezier(.22,1,.36,1) both }
        .btc-price-dn { animation:btc_price_dn .75s cubic-bezier(.22,1,.36,1) both }
        .btc-float    { animation:btc_float 4s ease-in-out infinite }
        .btc-scan-h   { position:absolute;left:0;right:0;height:1px;pointer-events:none;background:linear-gradient(90deg,transparent,rgba(247,147,26,.9),transparent);animation:btc_scan_h 6s ease-in-out infinite }
        .btc-fade-in  { animation:btc_fade_in .5s ease-out both }
      `}</style>

      {/* ═══════ OUTER SHELL ═══════ */}
      <div className="relative rounded-3xl overflow-hidden"
        style={{
          backdropFilter:"blur(28px) saturate(200%)",
          WebkitBackdropFilter:"blur(28px) saturate(200%)",
          background:`linear-gradient(158deg, rgba(${r},${g},${b},0.12) 0%, rgba(10,12,20,0.65) 45%, rgba(${r},${g},${b},0.06) 100%)`,
          border:`1px solid rgba(${r},${g},${b},0.28)`,
          boxShadow:`0 0 0 1px rgba(${r},${g},${b},0.08), 0 8px 64px -16px rgba(${r},${g},${b},0.50), 0 32px 80px -32px rgba(0,0,0,0.6), inset 0 1px 0 rgba(255,255,255,0.12)`,
          transition:"border-color .7s,box-shadow .7s",
        }}>

        {/* Grid texture */}
        <div className="absolute inset-0 pointer-events-none" style={{opacity:.028,backgroundImage:`linear-gradient(rgba(255,255,255,1) 1px,transparent 1px),linear-gradient(90deg,rgba(255,255,255,1) 1px,transparent 1px)`,backgroundSize:"28px 28px"}}/>
        {/* Top corner glow */}
        <div className="absolute -top-20 -right-20 w-80 h-80 rounded-full pointer-events-none" style={{background:`radial-gradient(circle, rgba(${r},${g},${b},0.15) 0%, transparent 70%)`}}/>
        {/* Bottom left glow */}
        <div className="absolute -bottom-16 -left-16 w-64 h-64 rounded-full pointer-events-none" style={{background:`radial-gradient(circle, rgba(247,147,26,0.08) 0%, transparent 70%)`}}/>
        {/* Spinning conic ring */}
        <div className="absolute inset-0 rounded-3xl overflow-hidden pointer-events-none" style={{opacity:.15}}>
          <div style={{position:"absolute",inset:-120,background:`conic-gradient(from 0deg,transparent,rgba(${r},${g},${b},1) 30deg,transparent 70deg)`,animation:"btc_border_spin 8s linear infinite"}}/>
        </div>
        {/* Scan line */}
        <div className="btc-scan-h"/>

        <div className="relative flex flex-col">

          {/* ════════════════════════════════
              HERO: price left, dial right
          ════════════════════════════════ */}
          <div className="flex items-center justify-between gap-3 px-5 pt-6 pb-5"
            style={{borderBottom:`1px solid rgba(${r},${g},${b},0.14)`}}>

            {/* Left: label + price + change */}
            <div className="flex flex-col gap-1 min-w-0">
              <div className="flex items-center gap-2 mb-1">
                <Activity className="h-3 w-3" style={{color:"rgba(255,255,255,0.22)"}}/>
                <span className="text-[8px] uppercase tracking-[0.25em] font-black" style={{color:"rgba(255,255,255,0.22)"}}>
                  BTC Crash Monitor · BTC/USDT
                </span>
              </div>

              {/* ── LIVE PRICE ── */}
              <div className={`text-5xl md:text-6xl font-black tabular-nums leading-none tracking-tight ${flash==="up"?"btc-price-up":flash==="dn"?"btc-price-dn":""}`}
                style={!flash?{color:"#F7931A",textShadow:"0 0 35px rgba(247,147,26,.75), 0 0 70px rgba(247,147,26,.25)"}:{}}>
                {price?`$${f$(price)}`:"—"}
              </div>

              <div className="flex items-center gap-3 mt-2 flex-wrap">
                {/* Flash indicator */}
                <div className={`flex items-center gap-1.5 text-sm font-black tabular-nums transition-all duration-300 ${flash==="up"?"text-emerald-400":flash==="dn"?"text-red-400":"opacity-0"}`}>
                  <span>{flash==="up"?"▲":"▼"}</span>
                  <span>{flash?"live":""}</span>
                </div>
                {/* Live dot */}
                <div className="flex items-center gap-1.5">
                  <span className="h-2 w-2 rounded-full" style={{background:d?"#00d48e":"rgba(255,255,255,0.2)",boxShadow:d?"0 0 8px #00d48e":undefined,animation:d?"btc_float 2s ease-in-out infinite":undefined}}/>
                  <span className="text-[9px] font-black uppercase tracking-[0.18em]" style={{color:"rgba(255,255,255,0.28)"}}>
                    {d?age:"offline"}
                  </span>
                </div>
              </div>
            </div>

            {/* Right: status dial */}
            <div className="btc-float shrink-0">
              <StatusDial hex={st.hex} pct={d?dialPct:0} label={d?st.label:"OFFLINE"} sub={st.sub} danger={isDanger}/>
            </div>
          </div>

          {/* ── PAUSE BANNER ── */}
          {isPaused&&(
            <div className="flex items-start gap-3 px-5 py-3.5 btc-fade-in"
              style={{background:"rgba(245,200,66,0.08)",borderBottom:"1px solid rgba(245,200,66,0.20)"}}>
              <span className="text-xl shrink-0 mt-0.5">⏸</span>
              <div>
                <div className="text-[9px] font-black uppercase tracking-[0.2em] text-yellow-400 mb-0.5">Trading Paused</div>
                <div className="text-[11px] font-medium leading-relaxed" style={{color:"rgba(245,200,66,0.6)"}}>{pauseReason}</div>
              </div>
            </div>
          )}

          {/* ════════════════════════════════
              DROP SPARKLINE
          ════════════════════════════════ */}
          <div className="px-4 pt-4 pb-2" style={{borderBottom:`1px solid rgba(${r},${g},${b},0.10)`}}>
            <div className="flex items-center justify-between mb-3">
              <div className="flex items-center gap-2">
                <TrendingDown className="h-3.5 w-3.5" style={{color:"rgba(255,255,255,0.2)"}}/>
                <span className="text-[8px] uppercase tracking-[0.22em] font-black" style={{color:"rgba(255,255,255,0.22)"}}>
                  Drop from Peak
                </span>
              </div>
              {d&&(
                <span className="text-[9px] font-black tabular-nums" style={{color:DROP_COLOR(maxDrop),textShadow:`0 0 10px ${DROP_COLOR(maxDrop)}80`}}>
                  Max −{maxDrop.toFixed(2)}%
                </span>
              )}
            </div>
            {d
              ? <DropBars drops={drops}/>
              : <div className="h-14 flex items-center justify-center text-[10px] font-black uppercase tracking-widest" style={{color:"rgba(255,255,255,0.12)"}}>No data</div>
            }
          </div>

          {/* ════════════════════════════════
              SPEED + VOLATILITY tiles
          ════════════════════════════════ */}
          <div className="grid grid-cols-2 gap-2.5 p-4" style={{borderBottom:`1px solid rgba(${r},${g},${b},0.10)`}}>
            <GlassTile
              label="⚡ Speed (10s)"
              value={!d?"—":`${d.speed>0?"+":""}${d.speed.toFixed(2)}%`}
              hex={!d?"#444":d.speed>0.05?"#00d48e":d.speed<-0.05?"#ff2d55":"#888"}
            />
            <GlassTile
              label="🌪 Volatility (10s)"
              value={!d?"—":`${d.volatility.toFixed(2)}%`}
              hex={!d?"#444":d.volatility>=4?"#ff2d55":d.volatility>=2.5?"#ff8c42":"#00d48e"}
            />
          </div>

          {/* ════════════════════════════════
              WHALE SELLS + BLEED giant tiles
          ════════════════════════════════ */}
          <div className="grid grid-cols-2 gap-2.5 px-4 pb-4" style={{borderBottom:`1px solid rgba(${r},${g},${b},0.10)`}}>
            <GlassTile
              label="🐋 Whale Sells / 60s"
              value={!d?"—":`${wCount}`}
              sub={d?(wCount>=3?`⚠ CLUSTER · ${fM(wUsd)} sold`:wUsd>0?`${fM(wUsd)} sold`:"$0 sold"):undefined}
              hex={!d?"#444":wCount>=3?"#ff2d55":wCount>=1?"#ff8c42":"#00d48e"}
              giant
            />
            <GlassTile
              label="📉 Bleed Minutes"
              value={!d?"—":`${consec}`}
              sub={d?(consec>=5?"⚠ SLOW BLEED":consec>=3?"SUSTAINED":consec>=1?"DOWNTREND":"STABLE"):undefined}
              hex={!d?"#444":consec>=5?"#ff2d55":consec>=3?"#ff8c42":consec>=1?"#f5c842":"#00d48e"}
              giant
            />
          </div>

          {/* ════════════════════════════════
              MARKET SIGNALS — glass rows
          ════════════════════════════════ */}
          <div className="px-4 pt-3 pb-4 flex flex-col gap-2">

            <div className="flex items-center gap-2 mb-1">
              <Zap className="h-3.5 w-3.5" style={{color:"rgba(255,255,255,0.2)"}}/>
              <span className="text-[8px] uppercase tracking-[0.22em] font-black" style={{color:"rgba(255,255,255,0.2)"}}>Market Signals</span>
            </div>

            {/* Liquidations */}
            {(()=>{
              const c=LVL_COLOR(liqLvl); const [lr,lg,lb]=hexRgb(c);
              return (
                <div className="flex items-center justify-between rounded-2xl px-4 py-3 relative overflow-hidden"
                  style={{background:`rgba(${lr},${lg},${lb},0.08)`,border:`1px solid rgba(${lr},${lg},${lb},0.25)`,backdropFilter:"blur(16px)",boxShadow:`0 2px 20px -8px rgba(${lr},${lg},${lb},0.30)`}}>
                  <div className="absolute inset-x-0 top-0 h-[1.5px]" style={{background:`linear-gradient(90deg,transparent,rgba(${lr},${lg},${lb},0.8),transparent)`}}/>
                  <div className="flex items-center gap-3">
                    <span className="text-xl">💥</span>
                    <div>
                      <div className="text-[8px] uppercase tracking-[0.18em] font-black mb-1" style={{color:`rgba(${lr},${lg},${lb},0.5)`}}>Liquidations (60s)</div>
                      <div className="text-lg font-black tabular-nums leading-none"
                        style={{color:d?c:"#333",textShadow:d?`0 0 16px rgba(${lr},${lg},${lb},0.7)`:undefined}}>
                        {!d?"—":fM(liqUsd)}
                        {d&&liqLargest>0&&<span className="text-[10px] font-bold ml-2" style={{color:`rgba(${lr},${lg},${lb},0.45)`}}>Lrg {fM(liqLargest)}</span>}
                      </div>
                    </div>
                  </div>
                  {d?<Chip level={liqLvl}/>:null}
                </div>
              );
            })()}

            {/* Funding rate */}
            {(()=>{
              const c=LVL_COLOR(fundLvl); const [fr,fg,fb]=hexRgb(c);
              return (
                <div className="flex items-center justify-between rounded-2xl px-4 py-3 relative overflow-hidden"
                  style={{background:`rgba(${fr},${fg},${fb},0.08)`,border:`1px solid rgba(${fr},${fg},${fb},0.25)`,backdropFilter:"blur(16px)",boxShadow:`0 2px 20px -8px rgba(${fr},${fg},${fb},0.30)`}}>
                  <div className="absolute inset-x-0 top-0 h-[1.5px]" style={{background:`linear-gradient(90deg,transparent,rgba(${fr},${fg},${fb},0.8),transparent)`}}/>
                  <div className="flex items-center gap-3">
                    <span className="text-xl">💸</span>
                    <div>
                      <div className="text-[8px] uppercase tracking-[0.18em] font-black mb-1" style={{color:`rgba(${fr},${fg},${fb},0.5)`}}>Funding Rate</div>
                      <div className="text-lg font-black tabular-nums leading-none"
                        style={{color:d?c:"#333",textShadow:d?`0 0 16px rgba(${fr},${fg},${fb},0.7)`:undefined}}>
                        {!d?"—":fFn(funding)}
                      </div>
                    </div>
                  </div>
                  {d?<Chip level={fundLvl}/>:null}
                </div>
              );
            })()}

            {/* Net whale flow */}
            <div className="rounded-2xl px-4 py-3 relative overflow-hidden"
              style={{background:"rgba(255,255,255,0.04)",border:"1px solid rgba(255,255,255,0.09)",backdropFilter:"blur(16px)"}}>
              <div className="flex items-center justify-between mb-3">
                <div className="flex items-center gap-2">
                  <Waves className="h-3.5 w-3.5" style={{color:"rgba(255,255,255,0.2)"}}/>
                  <span className="text-[8px] uppercase tracking-[0.2em] font-black" style={{color:"rgba(255,255,255,0.2)"}}>Net Whale Flow (60s)</span>
                </div>
                {d?<Chip level={wNetLvl}/>:null}
              </div>
              <div className="grid grid-cols-3 gap-2">
                {([
                  {label:"Buys",  val:!d?"—":fM(wBuy), c:"#00d48e"},
                  {label:"Sells", val:!d?"—":fM(wUsd),  c:"#ff2d55"},
                  {label:"Net",   val:!d?"—":`${netNeg?"▼":"▲"} ${fM(netAbs)}`, c:d?LVL_COLOR(wNetLvl):"#444"},
                ] as const).map(({label,val,c})=>{
                  const [_r,_g,_b]=hexRgb(c);
                  return (
                    <div key={label} className="rounded-xl py-2.5 px-2 text-center"
                      style={{background:`rgba(${_r},${_g},${_b},0.10)`,border:`1px solid rgba(${_r},${_g},${_b},0.25)`}}>
                      <div className="text-[7px] uppercase tracking-[0.2em] font-black mb-1.5" style={{color:`rgba(${_r},${_g},${_b},0.5)`}}>{label}</div>
                      <div className="text-sm font-black tabular-nums" style={{color:c,textShadow:`0 0 10px rgba(${_r},${_g},${_b},0.65)`}}>{val}</div>
                    </div>
                  );
                })}
              </div>
            </div>

            {/* Vol spike */}
            {(()=>{
              const active=!!d&&volSpike;
              return (
                <div className="flex items-center justify-between rounded-2xl px-4 py-3 relative overflow-hidden"
                  style={{
                    background:active?"rgba(255,45,85,0.10)":"rgba(255,255,255,0.04)",
                    border:active?"1px solid rgba(255,45,85,0.35)":"1px solid rgba(255,255,255,0.09)",
                    backdropFilter:"blur(16px)",
                    boxShadow:active?"0 0 28px -8px rgba(255,45,85,0.45)":undefined,
                    transition:"all .4s ease",
                  }}>
                  {active&&<div className="absolute inset-x-0 top-0 h-[1.5px]" style={{background:"linear-gradient(90deg,transparent,rgba(255,45,85,0.9),transparent)"}}/>}
                  <div className="flex items-center gap-3">
                    <Waves className="h-4 w-4" style={{color:active?"#ff2d55":"rgba(255,255,255,0.2)"}}/>
                    <span className="text-[9px] uppercase tracking-[0.18em] font-black"
                      style={{color:active?"rgba(255,45,85,.75)":"rgba(255,255,255,0.22)"}}>
                      Vol Spike · Red Candle
                    </span>
                  </div>
                  {!d?(
                    <span className="text-xs font-black" style={{color:"rgba(255,255,255,0.15)"}}>—</span>
                  ):volSpike?(
                    <span className="flex items-center gap-2 px-3 py-1.5 rounded-xl text-[9px] font-black uppercase tracking-[0.18em]"
                      style={{color:"#ff2d55",background:"rgba(255,45,85,0.16)",border:"1px solid rgba(255,45,85,0.40)",textShadow:"0 0 12px rgba(255,45,85,.9)",boxShadow:"0 0 18px -4px rgba(255,45,85,.55)"}}>
                      <span className="h-1.5 w-1.5 rounded-full bg-red-400 animate-pulse"/>
                      SPIKE 🔥
                    </span>
                  ):(
                    <span className="px-3 py-1.5 rounded-xl text-[9px] font-black uppercase tracking-[0.18em]"
                      style={{color:"#00d48e",background:"rgba(0,212,142,0.10)",border:"1px solid rgba(0,212,142,0.25)"}}>
                      Normal
                    </span>
                  )}
                </div>
              );
            })()}

          </div>
        </div>
      </div>
    </>
  );
}
