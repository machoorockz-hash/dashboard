import { useEffect, useState } from "react";
import { TrendingDown, Zap, Waves } from "lucide-react";
import { CoinIcon } from "./CoinIcon";

const API_BASE = import.meta.env.VITE_API_BASE ?? "";

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

const STATUS = {
  SAFE:       { color: "#10b981", glow: "rgba(16,185,129,",  label: "SAFE",       sub: "OK TO TRADE ALTS",     ring: "#10b981", badge: "text-emerald-400 bg-emerald-500/10 border-emerald-500/30" },
  WATCH:      { color: "#eab308", glow: "rgba(234,179,8,",   label: "WATCH",      sub: "BE SELECTIVE",         ring: "#eab308", badge: "text-yellow-400 bg-yellow-500/10 border-yellow-500/30" },
  RISK:       { color: "#f97316", glow: "rgba(249,115,22,",  label: "RISK",       sub: "HOLD OFF NEW BUYS",    ring: "#f97316", badge: "text-orange-400 bg-orange-500/10 border-orange-500/30" },
  SELL_ALERT: { color: "#ef4444", glow: "rgba(239,68,68,",   label: "SELL ALERT", sub: "PAUSE BUYING",         ring: "#ef4444", badge: "text-red-400 bg-red-500/10 border-red-500/30" },
  DANGER:     { color: "#dc2626", glow: "rgba(220,38,38,",   label: "DANGER",     sub: "CONSIDER SELLING",     ring: "#dc2626", badge: "text-red-400 bg-red-600/15 border-red-600/40" },
};

const TIMEFRAMES = [
  { label: "1m",  dropKey: "drop_1m"  as keyof BotData, peakKey: "peak_1m"  as keyof BotData },
  { label: "5m",  dropKey: "drop_5m"  as keyof BotData, peakKey: "peak_5m"  as keyof BotData },
  { label: "15m", dropKey: "drop_15m" as keyof BotData, peakKey: "peak_15m" as keyof BotData },
  { label: "1h",  dropKey: "drop_1h"  as keyof BotData, peakKey: "peak_1h"  as keyof BotData },
  { label: "4h",  dropKey: "drop_4h"  as keyof BotData, peakKey: "peak_4h"  as keyof BotData },
];

function fmtPrice(p: number) {
  return p.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}
function fmtLiq(usd: number) {
  if (usd >= 1_000_000) return `$${(usd / 1_000_000).toFixed(1)}M`;
  if (usd >= 1_000)     return `$${(usd / 1_000).toFixed(0)}K`;
  return `$${usd.toFixed(0)}`;
}
function fmtFunding(rate: number) {
  return `${rate >= 0 ? "+" : ""}${(rate * 100).toFixed(4)}%`;
}
function timeSince(iso: string) {
  const s = Math.floor((Date.now() - new Date(iso).getTime()) / 1000);
  if (s < 5)  return "just now";
  if (s < 60) return `${s}s ago`;
  return `${Math.floor(s / 60)}m ${s % 60}s ago`;
}
function dropRgb(pct: number) {
  if (pct >= 4) return "#ef4444";
  if (pct >= 2) return "#f97316";
  if (pct >= 1) return "#eab308";
  return "#10b981";
}
function lvlColor(lvl: string) {
  const m: Record<string, string> = { NORMAL: "#10b981", WATCH: "#eab308", RISK: "#f97316", DANGER: "#ef4444" };
  return m[lvl] ?? "#10b981";
}

function RingStatus({ stage, active }: { stage: keyof typeof STATUS; active: boolean }) {
  const s = STATUS[stage] ?? STATUS.SAFE;
  const r = 34, cx = 40, cy = 40, circumference = 2 * Math.PI * r;
  return (
    <div className="relative flex items-center justify-center" style={{ width: 80, height: 80 }}>
      <svg width="80" height="80" className="absolute inset-0 -rotate-90">
        <circle cx={cx} cy={cy} r={r} fill="none" stroke="rgba(255,255,255,0.06)" strokeWidth="3" />
        {active && (
          <circle cx={cx} cy={cy} r={r} fill="none" stroke={s.ring} strokeWidth="3"
            strokeDasharray={`${circumference * 0.72} ${circumference}`}
            strokeLinecap="round" style={{ filter: `drop-shadow(0 0 6px ${s.ring})` }} />
        )}
      </svg>
      {active ? (
        <div className="relative flex items-center justify-center w-12 h-12 rounded-full"
          style={{ background: `radial-gradient(circle, ${s.glow}0.18) 0%, transparent 70%)`, boxShadow: `0 0 24px ${s.glow}0.35)` }}>
          <CoinIcon symbol="BTC" size={28} />
        </div>
      ) : (
        <div className="flex items-center justify-center w-12 h-12 rounded-full bg-white/[0.04]">
          <CoinIcon symbol="BTC" size={28} />
        </div>
      )}
    </div>
  );
}

function HexBadge({ label, value, color, sub }: { label: string; value: string; color: string; sub?: string }) {
  return (
    <div className="relative flex flex-col items-center justify-center rounded-2xl px-3 py-3 overflow-hidden"
      style={{ background: `${color}0d`, border: `1px solid ${color}30` }}>
      <div className="absolute inset-0 pointer-events-none"
        style={{ background: `radial-gradient(ellipse at 50% 0%, ${color}18, transparent 70%)` }} />
      <div className="text-[8px] uppercase tracking-[0.18em] font-black mb-1.5" style={{ color: `${color}80` }}>{label}</div>
      <div className="text-xl font-black tabular-nums leading-none" style={{ color, textShadow: `0 0 14px ${color}80` }}>{value}</div>
      {sub && <div className="text-[8px] font-bold mt-1" style={{ color: `${color}60` }}>{sub}</div>}
    </div>
  );
}

function SignalRow({ icon, label, value, color, badge }: { icon: string | React.ReactNode; label: string; value: string; color: string; badge?: React.ReactNode }) {
  return (
    <div className="flex items-center gap-3 px-4 py-3 border-b border-white/[0.04] last:border-0">
      <div className="flex items-center justify-center h-7 w-7 rounded-lg shrink-0"
        style={{ background: `${color}15`, border: `1px solid ${color}25` }}>
        {typeof icon === "string" ? <span className="text-sm leading-none">{icon}</span> : icon}
      </div>
      <div className="flex-1 min-w-0">
        <div className="text-[8px] uppercase tracking-[0.18em] font-black text-white/25 mb-0.5">{label}</div>
        <div className="text-sm font-black tabular-nums" style={{ color, textShadow: color !== "#ffffff" ? `0 0 10px ${color}50` : undefined }}>{value}</div>
      </div>
      {badge}
    </div>
  );
}

function LvlChip({ level }: { level: string }) {
  const c = lvlColor(level);
  return (
    <span className="px-2 py-0.5 rounded-full text-[8px] font-black uppercase tracking-[0.15em]"
      style={{ color: c, background: `${c}15`, border: `1px solid ${c}30` }}>
      {level}
    </span>
  );
}

export function BtcCrashCard() {
  const [snapshot, setSnapshot] = useState<Snapshot | null>(null);
  const [age, setAge]           = useState<string>("");
  const [livePrice, setLivePrice] = useState<number | null>(null);
  const [flash, setFlash]         = useState<"up" | "down" | null>(null);
  const [prevPrice, setPrevPrice] = useState<number | null>(null);

  useEffect(() => {
    const ws = new WebSocket("wss://data-stream.binance.vision/ws/btcusdt@trade");
    ws.onmessage = (e) => {
      try {
        const d = JSON.parse(e.data);
        const p = parseFloat(d.p);
        setLivePrice((prev) => {
          if (prev !== null && p !== prev) {
            setFlash(p > prev ? "up" : "down");
            setPrevPrice(prev);
          }
          return p;
        });
      } catch {}
    };
    return () => ws.close();
  }, []);

  useEffect(() => {
    if (!flash) return;
    const t = setTimeout(() => setFlash(null), 600);
    return () => clearTimeout(t);
  }, [flash]);

  useEffect(() => {
    let alive = true;
    async function poll() {
      try {
        const res = await fetch(`${API_BASE}/api/bot/data?key=btc`);
        if (!res.ok) return;
        const data = await res.json() as Snapshot;
        if (alive) setSnapshot(data);
      } catch {}
    }
    poll();
    const id = setInterval(poll, 3000);
    return () => { alive = false; clearInterval(id); };
  }, []);

  useEffect(() => {
    if (!snapshot?.updatedAt) return;
    const id = setInterval(() => setAge(timeSince(snapshot.updatedAt!)), 1000);
    setAge(timeSince(snapshot.updatedAt));
    return () => clearInterval(id);
  }, [snapshot?.updatedAt]);

  const d   = snapshot?.data;
  const stage = (d?.status ?? "SAFE") as keyof typeof STATUS;
  const s     = STATUS[stage] ?? STATUS.SAFE;
  const isPaused = d?.trade_mode === "Pause";

  const whaleCount    = d?.whale_count       ?? 0;
  const whaleUsd      = d?.whale_usd_total   ?? 0;
  const whaleBuy      = d?.whale_buy_total   ?? 0;
  const whaleNet      = d?.whale_net_flow    ?? 0;
  const whaleNetLvl   = d?.whale_net_flow_level ?? "NORMAL";
  const consec        = d?.consec_drops      ?? 0;
  const volSpike      = d?.vol_spike         ?? false;
  const funding       = d?.funding_rate      ?? 0;
  const fundingLvl    = d?.funding_level     ?? "NORMAL";
  const liqUsd        = d?.liq_usd_60s       ?? 0;
  const liqLvl        = d?.liq_level         ?? "NORMAL";
  const liqLargest    = d?.liq_largest       ?? 0;
  const netAbs        = Math.abs(whaleNet);
  const netNeg        = whaleNet < 0;

  const maxDrop = d ? Math.max(d.drop_1m, d.drop_5m, d.drop_15m, d.drop_1h, d.drop_4h) : 0;

  const pauseReason = (() => {
    if (!d) return "";
    if (d.pause_reason?.trim()) return d.pause_reason.trim();
    const parts: string[] = [];
    const drops = [
      { l: "1m", v: d.drop_1m }, { l: "5m", v: d.drop_5m }, { l: "15m", v: d.drop_15m },
      { l: "1h", v: d.drop_1h }, { l: "4h", v: d.drop_4h },
    ];
    const worst = drops.reduce((a, b) => b.v > a.v ? b : a);
    if (worst.v >= 1) parts.push(`BTC ${worst.l} drop: −${worst.v.toFixed(2)}%`);
    if (consec >= 3) parts.push(`${consec} consec down-mins`);
    if (volSpike) parts.push("vol spike on red candle");
    if (whaleCount >= 3) parts.push(`${whaleCount} whale sells/60s`);
    if (liqLvl === "DANGER") parts.push(`liq ${fmtLiq(liqUsd)}`);
    return parts.join(" · ") || "BTC conditions elevated — wait for normalization";
  })();

  return (
    <>
      <style>{`
        @keyframes _p_border_spin {
          from { transform: rotate(0deg); }
          to   { transform: rotate(360deg); }
        }
        @keyframes _p_flicker {
          0%,100% { opacity: 1; } 50% { opacity: 0.7; }
        }
        @keyframes _p_price_up {
          0%   { color: #00ffa3; text-shadow: 0 0 40px rgba(0,255,163,1), 0 0 80px rgba(0,255,163,0.5); transform: translateY(-3px); }
          100% { color: #F7931A; text-shadow: 0 0 30px rgba(247,147,26,0.6); transform: translateY(0); }
        }
        @keyframes _p_price_dn {
          0%   { color: #ff2d5f; text-shadow: 0 0 40px rgba(255,45,95,1), 0 0 80px rgba(255,45,95,0.5); transform: translateY(3px); }
          100% { color: #F7931A; text-shadow: 0 0 30px rgba(247,147,26,0.6); transform: translateY(0); }
        }
        @keyframes _p_bar_grow {
          from { width: 0%; } to { width: var(--bar-w); }
        }
        @keyframes _p_scan {
          0%   { top: -2px; opacity: 0; }
          5%   { opacity: 1; }
          95%  { opacity: 0.5; }
          100% { top: 100%; opacity: 0; }
        }
        @keyframes _p_pulse_ring {
          0%   { box-shadow: 0 0 0 0px var(--ring-c); }
          100% { box-shadow: 0 0 0 10px transparent; }
        }
        @keyframes _p_glow_in {
          from { opacity:0; transform:scale(0.96); } to { opacity:1; transform:scale(1); }
        }
        ._p_up   { animation: _p_price_up 0.7s cubic-bezier(0.22,1,0.36,1) both; }
        ._p_dn   { animation: _p_price_dn 0.7s cubic-bezier(0.22,1,0.36,1) both; }
        ._p_scan { position: absolute; left: 0; right: 0; height: 1px; pointer-events: none;
          background: linear-gradient(90deg, transparent, rgba(247,147,26,0.7), transparent);
          animation: _p_scan 4s linear infinite; }
        ._p_glow_in { animation: _p_glow_in 0.4s ease-out both; }
        ._p_pulse_ring { animation: _p_pulse_ring 1.2s ease-out infinite; }
        ._p_flicker { animation: _p_flicker 3s ease-in-out infinite; }
      `}</style>

      {/* ── Outer wrapper with status-colored border glow ── */}
      <div className="relative rounded-3xl p-[1px] overflow-hidden"
        style={{ boxShadow: d ? `0 0 80px -20px ${s.glow}0.5), inset 0 0 0 1px ${s.glow}0.2)` : undefined }}>

        {/* Spinning gradient border for active state */}
        {d && (
          <div className="absolute inset-0 rounded-3xl overflow-hidden pointer-events-none">
            <div style={{
              position: "absolute", inset: -60, borderRadius: "inherit",
              background: `conic-gradient(from 0deg, transparent 0deg, ${s.color} 60deg, transparent 120deg)`,
              animation: "_p_border_spin 4s linear infinite", opacity: 0.25,
            }} />
          </div>
        )}

        {/* ── Main card body ── */}
        <div className="relative rounded-3xl overflow-hidden"
          style={{ background: "linear-gradient(160deg, #0d0d12 0%, #0a0a0f 100%)", border: `1px solid ${d ? s.glow + "0.15)" : "rgba(255,255,255,0.06)"}` }}>

          {/* Scan line */}
          <div className="_p_scan" />

          {/* Ambient glow top */}
          {d && <div className="absolute inset-x-0 top-0 h-40 pointer-events-none"
            style={{ background: `radial-gradient(ellipse 80% 100% at 50% 0%, ${s.glow}0.12), transparent)` }} />}

          <div className="relative flex flex-col gap-0">

            {/* ══════════════════════════════════════════
                HERO HEADER
            ══════════════════════════════════════════ */}
            <div className="relative flex items-center justify-between gap-4 px-5 pt-5 pb-4"
              style={{ borderBottom: "1px solid rgba(255,255,255,0.05)" }}>

              <div className="flex items-center gap-4">
                <RingStatus stage={stage} active={!!d} />
                <div>
                  <div className="text-[9px] uppercase tracking-[0.22em] font-black text-white/25 mb-1">BTC Crash Monitor</div>
                  <div className="text-xl font-black tracking-tight leading-none"
                    style={{ color: d ? s.color : "rgba(255,255,255,0.3)", textShadow: d ? `0 0 20px ${s.glow}0.5)` : undefined }}>
                    {d ? s.label : "OFFLINE"}
                  </div>
                  <div className="text-[10px] font-semibold mt-1" style={{ color: d ? s.glow + "0.6)" : "rgba(255,255,255,0.2)" }}>
                    {d ? s.sub : "Waiting for bot data…"}
                  </div>
                </div>
              </div>

              {/* Live price bubble */}
              <div className="flex flex-col items-end">
                <div className="text-[8px] uppercase tracking-[0.18em] font-black text-white/20 mb-1">BTC/USDT</div>
                <div className={`text-3xl md:text-4xl font-black tabular-nums leading-none ${
                  flash === "up" ? "_p_up" : flash === "down" ? "_p_dn" : ""
                }`} style={!flash ? { color: "#F7931A", textShadow: "0 0 30px rgba(247,147,26,0.55)" } : {}}>
                  {livePrice ? `$${fmtPrice(livePrice)}` : "—"}
                </div>
                {flash && prevPrice && (
                  <div className={`text-[10px] font-black mt-0.5 tabular-nums ${flash === "up" ? "text-emerald-400" : "text-red-400"}`}>
                    {flash === "up" ? "▲" : "▼"} ${fmtPrice(Math.abs(livePrice! - prevPrice))}
                  </div>
                )}
                {d && !flash && (
                  <div className="flex items-center gap-1 mt-1">
                    <span className="h-1.5 w-1.5 rounded-full bg-emerald-400 _p_flicker" />
                    <span className="text-[8px] text-white/25 font-black uppercase tracking-widest">{age}</span>
                  </div>
                )}
              </div>
            </div>

            {/* ── PAUSE BANNER ── */}
            {isPaused && (
              <div className="flex items-start gap-3 px-5 py-3.5 text-yellow-400"
                style={{ background: "rgba(234,179,8,0.07)", borderBottom: "1px solid rgba(234,179,8,0.15)" }}>
                <span className="text-lg shrink-0">⏸</span>
                <div>
                  <div className="text-[9px] uppercase tracking-[0.18em] font-black mb-0.5">Trading Paused</div>
                  <div className="text-[11px] font-medium text-yellow-400/65 leading-relaxed">{pauseReason}</div>
                </div>
              </div>
            )}

            {/* ══════════════════════════════════════════
                SPEED + VOLATILITY + MAX DROP — 3 tiles
            ══════════════════════════════════════════ */}
            <div className="grid grid-cols-3 gap-2 p-4"
              style={{ borderBottom: "1px solid rgba(255,255,255,0.05)" }}>
              <HexBadge
                label="Speed 10s"
                value={!d ? "—" : `${d.speed > 0 ? "+" : ""}${d.speed.toFixed(2)}%`}
                color={!d ? "#555" : d.speed > 0.05 ? "#10b981" : d.speed < -0.05 ? "#ef4444" : "#888"}
              />
              <HexBadge
                label="Volatility 10s"
                value={!d ? "—" : `${d.volatility.toFixed(2)}%`}
                color={!d ? "#555" : d.volatility >= 4 ? "#ef4444" : d.volatility >= 2.5 ? "#f97316" : "#10b981"}
              />
              <HexBadge
                label="Max Drop"
                value={!d ? "—" : `-${maxDrop.toFixed(2)}%`}
                color={!d ? "#555" : dropRgb(maxDrop)}
                sub={!d ? undefined : maxDrop >= 4 ? "CRITICAL" : maxDrop >= 2 ? "ELEVATED" : maxDrop >= 1 ? "CAUTION" : "LOW"}
              />
            </div>

            {/* ══════════════════════════════════════════
                DROP ANALYSIS TABLE — compact dark rows
            ══════════════════════════════════════════ */}
            <div style={{ borderBottom: "1px solid rgba(255,255,255,0.05)" }}>
              {/* Header */}
              <div className="flex items-center justify-between px-4 py-2.5">
                <div className="flex items-center gap-2">
                  <TrendingDown className="h-3.5 w-3.5" style={{ color: "rgba(255,255,255,0.2)" }} />
                  <span className="text-[8px] uppercase tracking-[0.2em] font-black text-white/20">Drop Analysis by Timeframe</span>
                </div>
              </div>

              {/* Rows */}
              <div className="px-3 pb-3 flex flex-col gap-1.5">
                {TIMEFRAMES.map(({ label, dropKey, peakKey }) => {
                  const pct  = d ? (d[dropKey] as number) : 0;
                  const peak = d ? (d[peakKey] as number) : null;
                  const c    = d ? dropRgb(pct) : "#333";
                  const barW = Math.min((pct / 6) * 100, 100);
                  return (
                    <div key={label} className="relative flex items-center gap-3 rounded-xl px-3 py-2.5 overflow-hidden"
                      style={{ background: d ? `${c}0a` : "rgba(255,255,255,0.02)", border: `1px solid ${d ? c + "20" : "rgba(255,255,255,0.04)"}` }}>
                      {/* Subtle left accent */}
                      <div className="absolute left-0 top-2 bottom-2 w-[3px] rounded-r-full" style={{ background: d ? c : "#333" }} />

                      <span className="text-[11px] font-black w-7 text-right tabular-nums shrink-0"
                        style={{ color: d ? c : "#444" }}>{label}</span>

                      <div className="flex-1 min-w-0">
                        <div className="h-1.5 w-full rounded-full overflow-hidden" style={{ background: "rgba(255,255,255,0.06)" }}>
                          <div className="h-full rounded-full" style={{
                            width: d ? `${barW}%` : "0%",
                            background: d ? `linear-gradient(90deg, ${c}aa, ${c})` : "#333",
                            boxShadow: d && pct >= 2 ? `0 0 8px ${c}80` : undefined,
                            transition: "width 1s cubic-bezier(0.22,1,0.36,1)",
                          }} />
                        </div>
                      </div>

                      <div className="text-right shrink-0">
                        <div className="text-xs font-black tabular-nums leading-none"
                          style={{ color: d ? c : "#333", textShadow: d && pct >= 2 ? `0 0 8px ${c}70` : undefined }}>
                          {!d ? "–.–%" : `-${pct.toFixed(2)}%`}
                        </div>
                        {d && peak !== null && (
                          <div className="text-[9px] tabular-nums mt-0.5" style={{ color: "rgba(255,255,255,0.2)" }}>
                            ${fmtPrice(peak)}
                          </div>
                        )}
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>

            {/* ══════════════════════════════════════════
                MARKET SIGNALS — icon rows
            ══════════════════════════════════════════ */}
            <div>
              <div className="flex items-center gap-2 px-4 py-2.5" style={{ borderBottom: "1px solid rgba(255,255,255,0.04)" }}>
                <Zap className="h-3.5 w-3.5" style={{ color: "rgba(255,255,255,0.2)" }} />
                <span className="text-[8px] uppercase tracking-[0.2em] font-black text-white/20">Market Signals</span>
              </div>

              {/* Liquidations */}
              <SignalRow
                icon="💥" label="Liquidations (60s)"
                value={!d ? "—" : `${fmtLiq(liqUsd)}${liqLargest > 0 ? `  ·  Lrg ${fmtLiq(liqLargest)}` : ""}`}
                color={!d ? "#555" : lvlColor(liqLvl)}
                badge={d ? <LvlChip level={liqLvl} /> : undefined}
              />

              {/* Funding */}
              <SignalRow
                icon="💸" label="Funding Rate"
                value={!d ? "—" : fmtFunding(funding)}
                color={!d ? "#555" : lvlColor(fundingLvl)}
                badge={d ? <LvlChip level={fundingLvl} /> : undefined}
              />

              {/* Whale Sells + Bleed Mins — 2 col */}
              <div className="grid grid-cols-2 px-3 py-3 gap-2"
                style={{ borderBottom: "1px solid rgba(255,255,255,0.04)" }}>
                {/* Whale Sells */}
                <div className="rounded-2xl px-3 py-3 relative overflow-hidden"
                  style={{
                    background: !d ? "rgba(255,255,255,0.02)" : whaleCount >= 3 ? "rgba(239,68,68,0.07)" : whaleCount >= 1 ? "rgba(249,115,22,0.07)" : "rgba(16,185,129,0.05)",
                    border: `1px solid ${!d ? "rgba(255,255,255,0.05)" : whaleCount >= 3 ? "rgba(239,68,68,0.25)" : whaleCount >= 1 ? "rgba(249,115,22,0.2)" : "rgba(16,185,129,0.15)"}`,
                  }}>
                  <div className="flex items-center gap-1.5 mb-2">
                    <span className="text-sm">🐋</span>
                    <span className="text-[8px] uppercase tracking-[0.15em] font-black text-white/25">Whale Sells</span>
                  </div>
                  <div className="text-4xl font-black tabular-nums leading-none"
                    style={{
                      color: !d ? "#333" : whaleCount >= 3 ? "#ef4444" : whaleCount >= 1 ? "#f97316" : "#10b981",
                      textShadow: d && whaleCount >= 1 ? `0 0 20px ${whaleCount >= 3 ? "rgba(239,68,68,0.7)" : "rgba(249,115,22,0.6)"}` : undefined,
                    }}>
                    {!d ? "—" : whaleCount}
                  </div>
                  {d && (
                    <div className="text-[10px] font-bold mt-1"
                      style={{ color: whaleCount >= 3 ? "rgba(239,68,68,0.6)" : whaleCount >= 1 ? "rgba(249,115,22,0.6)" : "rgba(16,185,129,0.5)" }}>
                      {fmtLiq(whaleUsd)} sold
                    </div>
                  )}
                  {d && whaleCount >= 3 && (
                    <div className="flex items-center gap-1 mt-1.5">
                      <span className="h-1 w-1 rounded-full bg-red-400 animate-pulse" />
                      <span className="text-[7px] uppercase tracking-widest font-black text-red-400/70">cluster!</span>
                    </div>
                  )}
                </div>

                {/* Bleed Mins */}
                <div className="rounded-2xl px-3 py-3 relative overflow-hidden"
                  style={{
                    background: !d ? "rgba(255,255,255,0.02)" : consec >= 5 ? "rgba(239,68,68,0.07)" : consec >= 3 ? "rgba(249,115,22,0.07)" : consec >= 1 ? "rgba(234,179,8,0.05)" : "rgba(16,185,129,0.05)",
                    border: `1px solid ${!d ? "rgba(255,255,255,0.05)" : consec >= 5 ? "rgba(239,68,68,0.25)" : consec >= 3 ? "rgba(249,115,22,0.2)" : consec >= 1 ? "rgba(234,179,8,0.2)" : "rgba(16,185,129,0.15)"}`,
                  }}>
                  <div className="flex items-center gap-1.5 mb-2">
                    <TrendingDown className="h-3.5 w-3.5" style={{ color: "rgba(255,255,255,0.25)" }} />
                    <span className="text-[8px] uppercase tracking-[0.15em] font-black text-white/25">Bleed Mins</span>
                  </div>
                  <div className="text-4xl font-black tabular-nums leading-none"
                    style={{
                      color: !d ? "#333" : consec >= 5 ? "#ef4444" : consec >= 3 ? "#f97316" : consec >= 1 ? "#eab308" : "#10b981",
                      textShadow: d && consec >= 3 ? `0 0 20px ${consec >= 5 ? "rgba(239,68,68,0.7)" : "rgba(249,115,22,0.6)"}` : undefined,
                    }}>
                    {!d ? "—" : consec}
                  </div>
                  {d && consec >= 5 && (
                    <div className="flex items-center gap-1 mt-1.5">
                      <span className="h-1 w-1 rounded-full bg-red-400 animate-pulse" />
                      <span className="text-[7px] uppercase tracking-widest font-black text-red-400/70">slow bleed!</span>
                    </div>
                  )}
                </div>
              </div>

              {/* Net Whale Flow */}
              <div className="px-4 py-3" style={{ borderBottom: "1px solid rgba(255,255,255,0.04)" }}>
                <div className="flex items-center justify-between mb-2.5">
                  <div className="flex items-center gap-2">
                    <Waves className="h-3.5 w-3.5" style={{ color: "rgba(255,255,255,0.2)" }} />
                    <span className="text-[8px] uppercase tracking-[0.18em] font-black text-white/20">Net Whale Flow (60s)</span>
                  </div>
                  {d ? <LvlChip level={whaleNetLvl} /> : <span className="text-white/15 text-xs">—</span>}
                </div>
                <div className="grid grid-cols-3 gap-2">
                  {[
                    { l: "Buys",  v: !d ? "—" : fmtLiq(whaleBuy), c: "#10b981" },
                    { l: "Sells", v: !d ? "—" : fmtLiq(whaleUsd),  c: "#ef4444" },
                    { l: "Net",   v: !d ? "—" : `${netNeg ? "▼" : "▲"} ${fmtLiq(netAbs)}`,
                      c: !d ? "#555" : lvlColor(whaleNetLvl) },
                  ].map(({ l, v, c }) => (
                    <div key={l} className="rounded-xl py-2.5 px-2 text-center"
                      style={{ background: `${c}0d`, border: `1px solid ${c}22` }}>
                      <div className="text-[7px] uppercase tracking-[0.15em] font-black mb-1.5"
                        style={{ color: `${c}60` }}>{l}</div>
                      <div className="text-xs font-black tabular-nums" style={{ color: c }}>{v}</div>
                    </div>
                  ))}
                </div>
              </div>

              {/* Vol Spike */}
              <div className="flex items-center justify-between px-4 py-3.5">
                <div className="flex items-center gap-3">
                  <div className="flex items-center justify-center h-7 w-7 rounded-lg shrink-0"
                    style={{ background: "rgba(255,255,255,0.04)", border: "1px solid rgba(255,255,255,0.08)" }}>
                    <Waves className="h-3.5 w-3.5 text-white/30" />
                  </div>
                  <span className="text-[9px] uppercase tracking-[0.15em] font-black text-white/25">Vol Spike · Red Candle</span>
                </div>
                {!d ? (
                  <span className="text-white/15 text-xs font-black">—</span>
                ) : volSpike ? (
                  <span className="flex items-center gap-1.5 px-3 py-1.5 rounded-xl text-[9px] font-black uppercase tracking-[0.15em]"
                    style={{ color: "#ef4444", background: "rgba(239,68,68,0.12)", border: "1px solid rgba(239,68,68,0.3)" }}>
                    <span className="h-1.5 w-1.5 rounded-full bg-red-400 animate-pulse" />
                    SPIKE 🔥
                  </span>
                ) : (
                  <span className="px-3 py-1.5 rounded-xl text-[9px] font-black uppercase tracking-[0.15em]"
                    style={{ color: "#10b981", background: "rgba(16,185,129,0.08)", border: "1px solid rgba(16,185,129,0.2)" }}>
                    Normal
                  </span>
                )}
              </div>
            </div>

          </div>{/* end flex col */}
        </div>{/* end card body */}
      </div>{/* end outer wrapper */}
    </>
  );
}
