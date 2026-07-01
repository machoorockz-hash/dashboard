import { useEffect, useState } from "react";
import { Activity, TrendingUp, Zap, Waves, TrendingDown } from "lucide-react";
import { CoinIcon } from "./CoinIcon";

const API_BASE = import.meta.env.VITE_API_BASE ?? "";

interface BotData {
  price: number;
  drop_1m: number;
  drop_5m: number;
  drop_15m: number;
  drop_1h: number;
  drop_4h: number;
  peak_1m: number;
  peak_5m: number;
  peak_15m: number;
  peak_1h: number;
  peak_4h: number;
  speed: number;
  volatility: number;
  status: string;
  trade_mode?: string;
  pause_reason?: string;
  whale_count?: number;
  whale_usd_total?: number;
  whale_buy_total?: number;
  whale_net_flow?: number;
  whale_net_flow_level?: string;
  consec_drops?: number;
  vol_spike?: boolean;
  funding_rate?: number;
  funding_level?: string;
  liq_usd_60s?: number;
  liq_level?: string;
  liq_largest?: number;
}

interface Snapshot {
  key: string;
  updatedAt: string | null;
  data: BotData | null;
}

const STAGE_CONFIG: Record<string, { bg: string; text: string; border: string; dot: string; glow: string; label: string; gradientFrom: string }> = {
  SAFE:       { bg: "bg-emerald-500/10",  text: "text-emerald-400",  border: "border-emerald-500/30",  dot: "bg-emerald-400",           glow: "shadow-emerald-500/20", label: "SAFE — OK TO TRADE ALTS",    gradientFrom: "from-emerald-500/5" },
  WATCH:      { bg: "bg-yellow-500/10",   text: "text-yellow-400",   border: "border-yellow-500/30",   dot: "bg-yellow-400",            glow: "shadow-yellow-500/20",  label: "WATCH — BE SELECTIVE",       gradientFrom: "from-yellow-500/5"  },
  RISK:       { bg: "bg-orange-500/10",   text: "text-orange-400",   border: "border-orange-500/30",   dot: "bg-orange-400",            glow: "shadow-orange-500/20",  label: "RISK — HOLD OFF NEW BUYS",   gradientFrom: "from-orange-500/5"  },
  SELL_ALERT: { bg: "bg-red-500/10",      text: "text-red-400",      border: "border-red-500/30",      dot: "bg-red-400",               glow: "shadow-red-500/20",     label: "SELL ALERT — PAUSE BUYING",  gradientFrom: "from-red-500/5"     },
  DANGER:     { bg: "bg-red-600/15",      text: "text-red-400",      border: "border-red-600/40",      dot: "bg-red-500 animate-pulse", glow: "shadow-red-600/30",     label: "DANGER — CONSIDER SELLING",  gradientFrom: "from-red-600/8"     },
};

const STAGE_DOTS: Record<string, string> = {
  SAFE: "🟢", WATCH: "🟡", RISK: "🟠", SELL_ALERT: "🔴", DANGER: "🚨",
};

const TIMEFRAMES: Array<{ label: string; dropKey: keyof BotData; peakKey: keyof BotData }> = [
  { label: "1m",  dropKey: "drop_1m",  peakKey: "peak_1m"  },
  { label: "5m",  dropKey: "drop_5m",  peakKey: "peak_5m"  },
  { label: "15m", dropKey: "drop_15m", peakKey: "peak_15m" },
  { label: "1h",  dropKey: "drop_1h",  peakKey: "peak_1h"  },
  { label: "4h",  dropKey: "drop_4h",  peakKey: "peak_4h"  },
];

const LEVEL_COLORS: Record<string, string> = {
  NORMAL: "text-emerald-400",
  WATCH:  "text-yellow-400",
  RISK:   "text-orange-400",
  DANGER: "text-red-400",
};
const LEVEL_BG: Record<string, string> = {
  NORMAL: "bg-emerald-500/10 border-emerald-500/30",
  WATCH:  "bg-yellow-500/10 border-yellow-500/30",
  RISK:   "bg-orange-500/10 border-orange-500/30",
  DANGER: "bg-red-500/10 border-red-500/30",
};

function dropColor(pct: number) {
  if (pct >= 4) return "text-red-400";
  if (pct >= 2) return "text-orange-400";
  if (pct >= 1) return "text-yellow-400";
  return "text-emerald-400";
}

function IntensityBar({ pct, inactive = false }: { pct: number; inactive?: boolean }) {
  const filled = inactive ? 0 : Math.round(Math.min(pct / 6.0, 1.0) * 10);
  const empty = 10 - filled;
  const color =
    pct >= 4 ? "bg-red-500" :
    pct >= 2 ? "bg-orange-500" :
    pct >= 1 ? "bg-yellow-400" :
               "bg-emerald-400";
  return (
    <div className="flex items-center gap-[2px]">
      {Array.from({ length: filled }).map((_, i) => (
        <div key={`f${i}`} className={`h-[7px] w-[5px] rounded-[1px] ${color} opacity-90`} />
      ))}
      {Array.from({ length: empty }).map((_, i) => (
        <div key={`e${i}`} className={`h-[7px] w-[5px] rounded-[1px] ${inactive ? "bg-red-400/15" : "bg-white/8"}`} />
      ))}
    </div>
  );
}

function timeSince(iso: string) {
  const secs = Math.floor((Date.now() - new Date(iso).getTime()) / 1000);
  if (secs < 5)  return "just now";
  if (secs < 60) return `${secs}s ago`;
  return `${Math.floor(secs / 60)}m ${secs % 60}s ago`;
}

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

function LevelBadge({ level }: { level: string }) {
  const col = LEVEL_COLORS[level] ?? "text-emerald-400";
  const bg  = LEVEL_BG[level]    ?? "bg-emerald-500/10 border-emerald-500/30";
  return (
    <span className={`px-1.5 py-0.5 rounded-md border text-[9px] font-black uppercase tracking-widest ${col} ${bg}`}>
      {level}
    </span>
  );
}

/** Premium animated pause icon with pulsing glow ring */
function PauseIcon() {
  return (
    <div className="relative flex-shrink-0 w-11 h-11">
      {/* outer glow ring — pulses */}
      <span
        className="absolute inset-0 rounded-full animate-ping"
        style={{ background: "radial-gradient(circle, rgba(234,179,8,0.25) 0%, transparent 70%)" }}
      />
      {/* static ring */}
      <span
        className="absolute inset-0 rounded-full border-2 border-yellow-400/40"
        style={{ boxShadow: "0 0 12px 2px rgba(234,179,8,0.18)" }}
      />
      {/* icon container */}
      <span
        className="absolute inset-1 rounded-full flex items-center justify-center"
        style={{
          background: "linear-gradient(135deg, rgba(234,179,8,0.22) 0%, rgba(161,122,0,0.14) 100%)",
          boxShadow: "inset 0 1px 0 rgba(255,255,255,0.08)",
        }}
      >
        {/* SVG pause bars */}
        <svg width="18" height="18" viewBox="0 0 18 18" fill="none" xmlns="http://www.w3.org/2000/svg">
          <rect x="3" y="3" width="4.5" height="12" rx="1.5" fill="#FACC15" opacity="0.95" />
          <rect x="10.5" y="3" width="4.5" height="12" rx="1.5" fill="#FACC15" opacity="0.95" />
        </svg>
      </span>
    </div>
  );
}

/** Premium section header */
function SectionHeader({ icon, label }: { icon: React.ReactNode; label: string }) {
  return (
    <div className="flex items-center gap-2.5 px-4 pt-3.5 pb-2.5 border-b border-white/[0.06]">
      <div
        className="flex items-center justify-center h-5 w-5 rounded-md border border-white/10"
        style={{ background: "linear-gradient(135deg, rgba(255,255,255,0.08) 0%, rgba(255,255,255,0.03) 100%)" }}
      >
        {icon}
      </div>
      <span className="text-[10px] uppercase tracking-[0.12em] font-black text-white/40">{label}</span>
    </div>
  );
}

export function BtcCrashCard() {
  const [snapshot, setSnapshot] = useState<Snapshot | null>(null);
  const [age, setAge]           = useState<string>("");
  const [livePrice, setLivePrice] = useState<number | null>(null);
  const [flash, setFlash]       = useState<"up" | "down" | null>(null);

  useEffect(() => {
    const ws = new WebSocket("wss://data-stream.binance.vision/ws/btcusdt@trade");
    ws.onmessage = (e) => {
      try {
        const d = JSON.parse(e.data);
        const p = parseFloat(d.p);
        setLivePrice((prev) => {
          if (prev !== null && p !== prev) setFlash(p > prev ? "up" : "down");
          return p;
        });
      } catch {}
    };
    return () => ws.close();
  }, []);

  useEffect(() => {
    if (!flash) return;
    const t = setTimeout(() => setFlash(null), 500);
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

  const d        = snapshot?.data;
  const stage    = d?.status ?? "SAFE";
  const cfg      = STAGE_CONFIG[stage] ?? STAGE_CONFIG["SAFE"]!;
  const isPaused = d?.trade_mode === "Pause";

  const pauseReason: string = (() => {
    if (!d) return "";
    if (d.pause_reason && d.pause_reason.trim().length > 0) return d.pause_reason.trim();
    const drops: Array<{ label: string; pct: number }> = [
      { label: "1 min",  pct: d.drop_1m  },
      { label: "5 min",  pct: d.drop_5m  },
      { label: "15 min", pct: d.drop_15m },
      { label: "1 hr",   pct: d.drop_1h  },
      { label: "4 hr",   pct: d.drop_4h  },
    ];
    const worstDrop = drops.reduce((a, b) => (b.pct > a.pct ? b : a));
    const parts: string[] = [];
    if (worstDrop.pct >= 1) parts.push(`BTC ${worstDrop.label} drop: −${worstDrop.pct.toFixed(2)}%`);
    if ((d.consec_drops ?? 0) >= 3) parts.push(`${d.consec_drops} consecutive down-minutes`);
    if (d.vol_spike) parts.push("volume spike on red candle");
    if ((d.whale_count ?? 0) >= 3) parts.push(`${d.whale_count} whale sells in 60s`);
    if (d.liq_level === "DANGER") parts.push(`liquidations ${fmtLiq(d.liq_usd_60s ?? 0)}`);
    if (parts.length > 0) return parts.join(" · ");
    return "BTC conditions are elevated — avoid new alt buys until signals normalize";
  })();

  const whaleCount      = d?.whale_count         ?? 0;
  const whaleUsdTotal   = d?.whale_usd_total     ?? 0;
  const whaleBuyTotal   = d?.whale_buy_total     ?? 0;
  const whaleNetFlow    = d?.whale_net_flow       ?? 0;
  const whaleNetFlowLvl = d?.whale_net_flow_level ?? "NORMAL";
  const consecDrops     = d?.consec_drops         ?? 0;
  const volSpike        = d?.vol_spike            ?? false;
  const fundingRate     = d?.funding_rate         ?? 0;
  const fundingLvl      = d?.funding_level        ?? "NORMAL";
  const liqUsd          = d?.liq_usd_60s          ?? 0;
  const liqLvl          = d?.liq_level            ?? "NORMAL";
  const liqLargest      = d?.liq_largest          ?? 0;

  const whaleCritical  = whaleCount >= 3;
  const consecCritical = consecDrops >= 5;
  const netFlowNeg     = whaleNetFlow < 0;
  const netFlowAbs     = Math.abs(whaleNetFlow);
  const netFlowStr     = (whaleNetFlow >= 0 ? "+" : "−") + fmtLiq(netFlowAbs);

  return (
    <section
      className="relative overflow-hidden flex flex-col gap-0 rounded-2xl"
      style={{
        background: "linear-gradient(160deg, rgba(16,22,28,0.98) 0%, rgba(10,14,18,0.99) 100%)",
        border: "1px solid rgba(255,255,255,0.08)",
        boxShadow: "0 0 0 1px rgba(255,255,255,0.03), 0 24px 48px -12px rgba(0,0,0,0.6), 0 0 40px -10px rgba(20,184,166,0.06)",
      }}
    >
      {/* ── top accent line (teal) ── */}
      <div
        className="pointer-events-none absolute inset-x-0 top-0 h-[1.5px]"
        style={{ background: "linear-gradient(90deg, transparent 0%, rgba(20,184,166,0.7) 40%, rgba(52,211,153,0.5) 60%, transparent 100%)" }}
      />

      {/* ── subtle corner glow ── */}
      <div
        className="pointer-events-none absolute -top-12 -right-12 w-40 h-40 rounded-full blur-3xl"
        style={{ background: "radial-gradient(circle, rgba(20,184,166,0.08) 0%, transparent 70%)" }}
      />

      {/* ═══════════════════════════════════════════════════════
          HEADER
      ═══════════════════════════════════════════════════════ */}
      <div className="flex items-center justify-between flex-wrap gap-3 px-5 pt-5 pb-4">
        <div className="flex items-center gap-3.5">
          <div className="relative">
            <CoinIcon symbol="BTC" size={38} />
            {d && (
              <span
                className={`absolute -bottom-0.5 -right-0.5 h-2.5 w-2.5 rounded-full border-2 border-[#0a0e12] ${cfg.dot}`}
              />
            )}
          </div>
          <div>
            <div className="flex items-center gap-2">
              <h3 className="font-black text-[15px] tracking-tight text-white/90">BTC Crash Monitor</h3>
              <span
                className="px-1.5 py-0.5 rounded text-[9px] font-black uppercase tracking-widest border"
                style={{
                  color: "rgba(20,184,166,0.9)",
                  borderColor: "rgba(20,184,166,0.25)",
                  background: "rgba(20,184,166,0.08)",
                }}
              >
                LIVE
              </span>
            </div>
            <div className="text-[11px] text-white/35 mt-0.5 font-medium">
              {d ? `updated ${age}` : "Waiting for bot data…"}
            </div>
          </div>
        </div>

        {/* Status badge */}
        <div
          className={`flex items-center gap-2 px-3.5 py-2 rounded-xl border text-xs font-black tracking-wide ${
            d ? `${cfg.bg} ${cfg.text} ${cfg.border}` : "bg-red-500/10 text-red-400 border-red-500/30"
          }`}
          style={{ backdropFilter: "blur(8px)" }}
        >
          <span>{d ? STAGE_DOTS[stage] : "⛔"}</span>
          <span>{d ? cfg.label : "BOT IS NOT ACTIVE"}</span>
        </div>
      </div>

      {/* ── thin inner divider ── */}
      <div className="h-px mx-5" style={{ background: "linear-gradient(90deg, transparent, rgba(255,255,255,0.06), transparent)" }} />

      {/* ═══════════════════════════════════════════════════════
          LIVE PRICE
      ═══════════════════════════════════════════════════════ */}
      <div className="px-5 py-4">
        <div
          className={`relative rounded-xl px-5 py-4 flex items-center justify-between transition-all duration-300 overflow-hidden ${
            flash === "up"   ? "border border-emerald-500/50" :
            flash === "down" ? "border border-red-500/50"     :
            "border border-white/[0.07]"
          }`}
          style={{
            background: flash === "up"
              ? "linear-gradient(135deg, rgba(16,185,129,0.10) 0%, rgba(10,14,18,0.9) 100%)"
              : flash === "down"
              ? "linear-gradient(135deg, rgba(239,68,68,0.10) 0%, rgba(10,14,18,0.9) 100%)"
              : "linear-gradient(135deg, rgba(255,255,255,0.03) 0%, rgba(255,255,255,0.01) 100%)",
            boxShadow: flash === "up"
              ? "0 0 20px rgba(16,185,129,0.12)"
              : flash === "down"
              ? "0 0 20px rgba(239,68,68,0.12)"
              : "none",
          }}
        >
          {/* micro top shine */}
          <div className="pointer-events-none absolute inset-x-0 top-0 h-px" style={{ background: "linear-gradient(90deg, transparent, rgba(255,255,255,0.06), transparent)" }} />

          <span className="text-[10px] uppercase tracking-[0.14em] font-black text-white/35 flex items-center gap-1.5">
            <Activity className="h-3 w-3" /> BTC Live Price
          </span>
          <span
            className={`text-3xl md:text-4xl font-black tabular-nums tracking-tight transition-colors duration-300 ${
              flash === "up"   ? "text-emerald-400" :
              flash === "down" ? "text-red-400"     : ""
            }`}
            style={!flash ? { color: "#F7931A", textShadow: "0 0 20px rgba(247,147,26,0.30)" } : {}}
          >
            {livePrice ? `$${fmtPrice(livePrice)}` : "…"}
          </span>
        </div>
      </div>

      {/* ═══════════════════════════════════════════════════════
          TRADING PAUSED BANNER  (premium animated version)
      ═══════════════════════════════════════════════════════ */}
      {isPaused && (
        <div className="px-5 pb-4">
          <div
            className="relative flex items-start gap-4 rounded-2xl px-5 py-4 overflow-hidden"
            style={{
              background: "linear-gradient(135deg, rgba(234,179,8,0.13) 0%, rgba(161,122,0,0.07) 100%)",
              border: "1px solid rgba(234,179,8,0.30)",
              boxShadow: "0 0 24px rgba(234,179,8,0.10), inset 0 1px 0 rgba(255,255,255,0.05)",
            }}
          >
            {/* animated corner pulse */}
            <div
              className="pointer-events-none absolute inset-x-0 top-0 h-px"
              style={{ background: "linear-gradient(90deg, transparent, rgba(234,179,8,0.6), transparent)" }}
            />
            <div
              className="pointer-events-none absolute -top-6 left-1/2 -translate-x-1/2 w-24 h-6 blur-xl"
              style={{ background: "radial-gradient(ellipse, rgba(234,179,8,0.25) 0%, transparent 70%)" }}
            />

            {/* ── Premium pause icon ── */}
            <PauseIcon />

            {/* Text */}
            <div className="min-w-0 flex-1 pt-1">
              <div className="flex items-center gap-2 mb-1">
                <span
                  className="text-[11px] font-black uppercase tracking-[0.14em]"
                  style={{ color: "#FACC15", textShadow: "0 0 10px rgba(250,204,21,0.4)" }}
                >
                  Trading Paused
                </span>
                <span
                  className="px-1.5 py-0.5 rounded text-[8px] font-black uppercase tracking-widest border"
                  style={{
                    color: "rgba(234,179,8,0.8)",
                    borderColor: "rgba(234,179,8,0.25)",
                    background: "rgba(234,179,8,0.10)",
                  }}
                >
                  BOT HALTED
                </span>
              </div>
              <div className="text-[11px] text-yellow-400/70 leading-relaxed break-words">
                {pauseReason}
              </div>
            </div>
          </div>
        </div>
      )}

      {/* ═══════════════════════════════════════════════════════
          PEAK PRICES & DROP TABLE
      ═══════════════════════════════════════════════════════ */}
      <div
        className="mx-5 mb-4 rounded-xl overflow-hidden"
        style={{
          border: "1px solid rgba(255,255,255,0.07)",
          background: "linear-gradient(135deg, rgba(255,255,255,0.025) 0%, rgba(255,255,255,0.01) 100%)",
          boxShadow: "inset 0 1px 0 rgba(255,255,255,0.04)",
        }}
      >
        <SectionHeader
          icon={<TrendingUp className="h-3 w-3 text-white/50" />}
          label="Peak Prices & Drop"
        />

        {/* column labels */}
        <div className="grid grid-cols-[40px_1fr_80px_68px] gap-x-2 px-4 py-1.5 border-b border-white/[0.05]">
          <span className="text-[9px] uppercase tracking-widest text-white/25 font-bold text-right">TF</span>
          <span className="text-[9px] uppercase tracking-widest text-white/25 font-bold">Peak</span>
          <span className="text-[9px] uppercase tracking-widest text-white/25 font-bold text-right">Drop</span>
          <span className="text-[9px] uppercase tracking-widest text-white/25 font-bold pl-1">Bar</span>
        </div>

        <div className="divide-y divide-white/[0.04]">
          {TIMEFRAMES.map(({ label, dropKey, peakKey }) => {
            const pct      = d ? (d[dropKey] as number) : 0;
            const peak     = d ? (d[peakKey] as number) : null;
            const inactive = !d;
            return (
              <div
                key={label}
                className="grid grid-cols-[40px_1fr_80px_68px] gap-x-2 items-center px-4 py-2.5 transition-colors hover:bg-white/[0.025]"
              >
                <span className="text-[10px] font-black text-white/40 text-right tabular-nums">{label}</span>
                <span className={`text-[11px] font-semibold tabular-nums ${inactive ? "text-white/20" : "text-white/55"}`}>
                  {inactive ? "—" : `$${fmtPrice(peak ?? 0)}`}
                </span>
                <div className={`text-right text-xs font-black tabular-nums ${inactive ? "text-red-400/30" : dropColor(pct)}`}>
                  {inactive ? "-.--%" : `-${pct.toFixed(2)}%`}
                </div>
                <div className="pl-1">
                  <IntensityBar pct={pct} inactive={inactive} />
                </div>
              </div>
            );
          })}
        </div>
      </div>

      {/* ═══════════════════════════════════════════════════════
          SPEED & VOLATILITY
      ═══════════════════════════════════════════════════════ */}
      <div className="grid grid-cols-2 gap-3 px-5 mb-4">
        {[
          {
            label: "Speed (10s)",
            icon: "⚡",
            value: !d ? "-0.00%" : `${d.speed > 0 ? "+" : ""}${d.speed.toFixed(2)}%`,
            color: !d ? "text-red-400/50" : d.speed > 0 ? "text-emerald-400" : d.speed < 0 ? "text-red-400" : "text-white/50",
          },
          {
            label: "Volatility (10s)",
            icon: "🌪",
            value: !d ? "0.00%" : `${d.volatility.toFixed(2)}%`,
            color: !d ? "text-red-400/50" : d.volatility >= 4 ? "text-red-400" : d.volatility >= 2.5 ? "text-orange-400" : "text-emerald-400",
          },
        ].map((item) => (
          <div
            key={item.label}
            className="rounded-xl px-4 py-3 relative overflow-hidden"
            style={{
              border: "1px solid rgba(255,255,255,0.07)",
              background: "linear-gradient(135deg, rgba(255,255,255,0.03) 0%, rgba(255,255,255,0.01) 100%)",
              boxShadow: "inset 0 1px 0 rgba(255,255,255,0.04)",
            }}
          >
            <div className="text-[9px] uppercase tracking-[0.12em] font-black text-white/30 mb-1.5 flex items-center gap-1">
              <span>{item.icon}</span> {item.label}
            </div>
            <span className={`font-black tabular-nums text-sm ${item.color}`}>{item.value}</span>
          </div>
        ))}
      </div>

      {/* ═══════════════════════════════════════════════════════
          MARKET SIGNALS
      ═══════════════════════════════════════════════════════ */}
      <div
        className="mx-5 mb-5 rounded-xl overflow-hidden"
        style={{
          border: "1px solid rgba(255,255,255,0.07)",
          background: "linear-gradient(135deg, rgba(255,255,255,0.025) 0%, rgba(255,255,255,0.01) 100%)",
          boxShadow: "inset 0 1px 0 rgba(255,255,255,0.04)",
        }}
      >
        <SectionHeader
          icon={<Zap className="h-3 w-3 text-white/50" />}
          label="Market Signals"
        />

        <div className="divide-y divide-white/[0.04]">

          {/* ── Liquidations ── */}
          <div className="flex items-center justify-between px-4 py-3">
            <div className="flex items-center gap-2.5">
              <span className="text-base">💥</span>
              <div>
                <div className="text-[9px] uppercase tracking-[0.12em] font-black text-white/30 mb-0.5">Liquidations (60s)</div>
                <div className={`text-sm font-black tabular-nums ${
                  !d ? "text-white/20" :
                  liqLvl === "DANGER" ? "text-red-400" :
                  liqLvl === "RISK"   ? "text-orange-400" :
                  liqLvl === "WATCH"  ? "text-yellow-400" : "text-emerald-400"
                }`}>
                  {!d ? "—" : fmtLiq(liqUsd)}
                  {d && liqLargest > 0 && (
                    <span className="ml-2 text-[10px] font-bold text-white/35">
                      Lrg: {fmtLiq(liqLargest)}
                    </span>
                  )}
                </div>
              </div>
            </div>
            {d ? <LevelBadge level={liqLvl} /> : <span className="text-white/20 text-xs">—</span>}
          </div>

          {/* ── Funding Rate ── */}
          <div className="flex items-center justify-between px-4 py-3">
            <div className="flex items-center gap-2.5">
              <span className="text-base">💸</span>
              <div>
                <div className="text-[9px] uppercase tracking-[0.12em] font-black text-white/30 mb-0.5">Funding Rate</div>
                <div className={`text-sm font-black tabular-nums ${
                  !d ? "text-white/20" :
                  fundingLvl === "DANGER" ? "text-red-400" :
                  fundingLvl === "RISK"   ? "text-orange-400" :
                  fundingLvl === "WATCH"  ? "text-yellow-400" : "text-emerald-400"
                }`}>
                  {!d ? "—" : fmtFunding(fundingRate)}
                </div>
              </div>
            </div>
            {d ? <LevelBadge level={fundingLvl} /> : <span className="text-white/20 text-xs">—</span>}
          </div>

          {/* ── Whale Sells + Consec Drops ── */}
          <div className="grid grid-cols-2 divide-x divide-white/[0.04]">
            <div className="px-4 py-3">
              <div className="flex items-center gap-1.5 mb-1.5">
                <span className="text-xs">🐋</span>
                <div className="text-[9px] uppercase tracking-[0.12em] font-black text-white/30">Whale Sells/60s</div>
              </div>
              <div className={`text-xl font-black tabular-nums ${
                !d ? "text-white/20" :
                whaleCritical   ? "text-red-400" :
                whaleCount >= 1 ? "text-orange-400" : "text-emerald-400"
              }`}>
                {!d ? "—" : whaleCount}
              </div>
              {d && (
                <div className={`text-[10px] font-bold mt-0.5 tabular-nums ${
                  whaleCritical   ? "text-red-400/70" :
                  whaleCount >= 1 ? "text-orange-400/70" : "text-emerald-400/60"
                }`}>
                  {whaleUsdTotal > 0 ? fmtLiq(whaleUsdTotal) : "$0"}
                </div>
              )}
              {d && whaleCritical && (
                <div className="text-[9px] text-red-400/60 font-bold mt-0.5 uppercase tracking-wide">cluster alert!</div>
              )}
            </div>
            <div className="px-4 py-3">
              <div className="flex items-center gap-1.5 mb-1.5">
                <TrendingDown className="h-3 w-3 text-white/35" />
                <div className="text-[9px] uppercase tracking-[0.12em] font-black text-white/30">Bleed Mins</div>
              </div>
              <div className={`text-xl font-black tabular-nums ${
                !d ? "text-white/20" :
                consecCritical   ? "text-red-400" :
                consecDrops >= 3 ? "text-orange-400" :
                consecDrops >= 1 ? "text-yellow-400" : "text-emerald-400"
              }`}>
                {!d ? "—" : consecDrops}
              </div>
              {d && consecCritical && (
                <div className="text-[9px] text-red-400/60 font-bold mt-0.5 uppercase tracking-wide">slow bleed!</div>
              )}
            </div>
          </div>

          {/* ── Net Whale Flow ── */}
          <div className="px-4 py-3">
            <div className="flex items-center justify-between mb-2.5">
              <div className="flex items-center gap-1.5">
                <span className="text-xs">🌊</span>
                <div className="text-[9px] uppercase tracking-[0.12em] font-black text-white/30">Net Whale Flow (60s)</div>
              </div>
              {d ? <LevelBadge level={whaleNetFlowLvl} /> : <span className="text-white/20 text-xs">—</span>}
            </div>
            <div className="grid grid-cols-3 gap-2">
              {/* Buys */}
              <div
                className="rounded-lg px-2 py-2 text-center"
                style={{ background: "rgba(16,185,129,0.08)", border: "1px solid rgba(16,185,129,0.18)" }}
              >
                <div className="text-[8px] uppercase tracking-widest font-black text-emerald-400/60 mb-1">Buys</div>
                <div className={`text-xs font-black tabular-nums ${!d ? "text-white/20" : "text-emerald-400"}`}>
                  {!d ? "—" : fmtLiq(whaleBuyTotal)}
                </div>
              </div>
              {/* Sells */}
              <div
                className="rounded-lg px-2 py-2 text-center"
                style={{ background: "rgba(239,68,68,0.08)", border: "1px solid rgba(239,68,68,0.18)" }}
              >
                <div className="text-[8px] uppercase tracking-widest font-black text-red-400/60 mb-1">Sells</div>
                <div className={`text-xs font-black tabular-nums ${!d ? "text-white/20" : "text-red-400"}`}>
                  {!d ? "—" : fmtLiq(whaleUsdTotal)}
                </div>
              </div>
              {/* Net */}
              <div
                className="rounded-lg px-2 py-2 text-center"
                style={{
                  background: !d
                    ? "rgba(255,255,255,0.03)"
                    : whaleNetFlowLvl === "DANGER"
                    ? "rgba(239,68,68,0.08)"
                    : whaleNetFlowLvl === "WATCH"
                    ? "rgba(249,115,22,0.08)"
                    : netFlowNeg
                    ? "rgba(234,179,8,0.08)"
                    : "rgba(16,185,129,0.08)",
                  border: !d
                    ? "1px solid rgba(255,255,255,0.07)"
                    : whaleNetFlowLvl === "DANGER"
                    ? "1px solid rgba(239,68,68,0.22)"
                    : whaleNetFlowLvl === "WATCH"
                    ? "1px solid rgba(249,115,22,0.22)"
                    : netFlowNeg
                    ? "1px solid rgba(234,179,8,0.22)"
                    : "1px solid rgba(16,185,129,0.22)",
                }}
              >
                <div className="text-[8px] uppercase tracking-widest font-black text-white/35 mb-1">Net</div>
                <div className={`text-xs font-black tabular-nums flex items-center justify-center gap-0.5 ${
                  !d                          ? "text-white/20" :
                  whaleNetFlowLvl === "DANGER" ? "text-red-400" :
                  whaleNetFlowLvl === "WATCH"  ? "text-orange-400" :
                  netFlowNeg                   ? "text-yellow-400" : "text-emerald-400"
                }`}>
                  {!d ? "—" : (
                    <>
                      <span>{netFlowNeg ? "▼" : "▲"}</span>
                      <span>{fmtLiq(netFlowAbs)}</span>
                    </>
                  )}
                </div>
              </div>
            </div>
          </div>

          {/* ── Volume Spike ── */}
          <div className="flex items-center justify-between px-4 py-3">
            <div className="flex items-center gap-2.5">
              <Waves className="h-4 w-4 text-white/30" />
              <div className="text-[9px] uppercase tracking-[0.12em] font-black text-white/30">Vol Spike on Red Candle</div>
            </div>
            {!d ? (
              <span className="text-white/20 text-xs font-black">—</span>
            ) : volSpike ? (
              <span
                className="flex items-center gap-1.5 px-2.5 py-1 rounded-lg text-red-400 text-[10px] font-black uppercase tracking-widest"
                style={{
                  background: "rgba(239,68,68,0.12)",
                  border: "1px solid rgba(239,68,68,0.28)",
                  boxShadow: "0 0 10px rgba(239,68,68,0.10)",
                }}
              >
                <span className="h-1.5 w-1.5 rounded-full bg-red-400 animate-pulse" />
                SPIKE 🔥
              </span>
            ) : (
              <span
                className="px-2.5 py-1 rounded-lg text-emerald-400 text-[10px] font-black uppercase tracking-widest"
                style={{ background: "rgba(16,185,129,0.10)", border: "1px solid rgba(16,185,129,0.22)" }}
              >
                Normal
              </span>
            )}
          </div>

        </div>
      </div>

      {/* ── bottom accent line ── */}
      <div
        className="pointer-events-none absolute inset-x-0 bottom-0 h-[1px]"
        style={{ background: "linear-gradient(90deg, transparent, rgba(20,184,166,0.15), transparent)" }}
      />

    </section>
  );
}
