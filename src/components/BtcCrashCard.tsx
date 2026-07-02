import { useEffect, useState } from "react";
import { Activity, TrendingUp, Zap, Waves, TrendingDown, ArrowUpDown } from "lucide-react";
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

const STAGE_CONFIG: Record<string, {
  gradientFrom: string; gradientTo: string;
  borderColor: string; glowColor: string;
  dot: string; label: string; labelBg: string; labelText: string;
  outerGlow: string;
}> = {
  SAFE: {
    gradientFrom: "from-emerald-500/20", gradientTo: "to-transparent",
    borderColor: "border-emerald-500/30", glowColor: "rgba(16,185,129,0.15)",
    dot: "bg-emerald-400", label: "🟢 SAFE — OK TO TRADE ALTS",
    labelBg: "bg-emerald-500/15 border-emerald-500/30", labelText: "text-emerald-400",
    outerGlow: "shadow-[0_0_60px_-20px_rgba(16,185,129,0.4)]",
  },
  WATCH: {
    gradientFrom: "from-yellow-500/20", gradientTo: "to-transparent",
    borderColor: "border-yellow-500/30", glowColor: "rgba(234,179,8,0.15)",
    dot: "bg-yellow-400", label: "🟡 WATCH — BE SELECTIVE",
    labelBg: "bg-yellow-500/15 border-yellow-500/30", labelText: "text-yellow-400",
    outerGlow: "shadow-[0_0_60px_-20px_rgba(234,179,8,0.4)]",
  },
  RISK: {
    gradientFrom: "from-orange-500/20", gradientTo: "to-transparent",
    borderColor: "border-orange-500/30", glowColor: "rgba(249,115,22,0.15)",
    dot: "bg-orange-400", label: "🟠 RISK — HOLD OFF NEW BUYS",
    labelBg: "bg-orange-500/15 border-orange-500/30", labelText: "text-orange-400",
    outerGlow: "shadow-[0_0_60px_-20px_rgba(249,115,22,0.4)]",
  },
  SELL_ALERT: {
    gradientFrom: "from-red-500/20", gradientTo: "to-transparent",
    borderColor: "border-red-500/40", glowColor: "rgba(239,68,68,0.2)",
    dot: "bg-red-400", label: "🔴 SELL ALERT — PAUSE BUYING",
    labelBg: "bg-red-500/15 border-red-500/30", labelText: "text-red-400",
    outerGlow: "shadow-[0_0_60px_-20px_rgba(239,68,68,0.5)]",
  },
  DANGER: {
    gradientFrom: "from-red-600/25", gradientTo: "to-transparent",
    borderColor: "border-red-600/50", glowColor: "rgba(220,38,38,0.25)",
    dot: "bg-red-500 animate-pulse", label: "🚨 DANGER — CONSIDER SELLING",
    labelBg: "bg-red-600/20 border-red-600/40", labelText: "text-red-400",
    outerGlow: "shadow-[0_0_80px_-20px_rgba(220,38,38,0.6)]",
  },
};

const TIMEFRAMES: Array<{ label: string; dropKey: keyof BotData; peakKey: keyof BotData }> = [
  { label: "1m",  dropKey: "drop_1m",  peakKey: "peak_1m"  },
  { label: "5m",  dropKey: "drop_5m",  peakKey: "peak_5m"  },
  { label: "15m", dropKey: "drop_15m", peakKey: "peak_15m" },
  { label: "1h",  dropKey: "drop_1h",  peakKey: "peak_1h"  },
  { label: "4h",  dropKey: "drop_4h",  peakKey: "peak_4h"  },
];

const LEVEL_COLORS: Record<string, string> = {
  NORMAL: "text-emerald-400", WATCH: "text-yellow-400",
  RISK: "text-orange-400", DANGER: "text-red-400",
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

function dropBgColor(pct: number) {
  if (pct >= 4) return "bg-red-500";
  if (pct >= 2) return "bg-orange-500";
  if (pct >= 1) return "bg-yellow-400";
  return "bg-emerald-400";
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
    <span className={`px-2 py-0.5 rounded-full border text-[9px] font-black uppercase tracking-widest ${col} ${bg}`}>
      {level}
    </span>
  );
}

function GlassPanel({ children, className = "" }: { children: React.ReactNode; className?: string }) {
  return (
    <div className={`rounded-2xl border border-white/[0.07] bg-white/[0.04] backdrop-blur-sm ${className}`}>
      {children}
    </div>
  );
}

function SectionLabel({ icon, label }: { icon: React.ReactNode; label: string }) {
  return (
    <div className="flex items-center gap-2 px-4 pt-3 pb-2.5 border-b border-white/[0.06]">
      <div className="flex items-center justify-center h-5 w-5 rounded-md bg-primary/20 border border-primary/25 shrink-0">
        {icon}
      </div>
      <span className="text-[9px] uppercase tracking-[0.18em] font-black text-white/40">{label}</span>
    </div>
  );
}

export function BtcCrashCard() {
  const [snapshot, setSnapshot] = useState<Snapshot | null>(null);
  const [age, setAge]           = useState<string>("");
  const [livePrice, setLivePrice] = useState<number | null>(null);
  const [flash, setFlash]         = useState<"up" | "down" | null>(null);

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

  const d   = snapshot?.data;
  const stage = d?.status ?? "SAFE";
  const cfg   = STAGE_CONFIG[stage] ?? STAGE_CONFIG["SAFE"]!;
  const isPaused = d?.trade_mode === "Pause";

  const pauseReason: string = (() => {
    if (!d) return "";
    if (d.pause_reason && d.pause_reason.trim().length > 0) return d.pause_reason.trim();
    const drops = [
      { label: "1 min",  pct: d.drop_1m  },
      { label: "5 min",  pct: d.drop_5m  },
      { label: "15 min", pct: d.drop_15m },
      { label: "1 hr",   pct: d.drop_1h  },
      { label: "4 hr",   pct: d.drop_4h  },
    ];
    const worst = drops.reduce((a, b) => (b.pct > a.pct ? b : a));
    const parts: string[] = [];
    if (worst.pct >= 1) parts.push(`BTC ${worst.label} drop: −${worst.pct.toFixed(2)}%`);
    if ((d.consec_drops ?? 0) >= 3) parts.push(`${d.consec_drops} consecutive down-minutes`);
    if (d.vol_spike) parts.push("volume spike on red candle");
    if ((d.whale_count ?? 0) >= 3) parts.push(`${d.whale_count} whale sells in 60s`);
    if (d.liq_level === "DANGER") parts.push(`liquidations ${fmtLiq(d.liq_usd_60s ?? 0)}`);
    if (parts.length > 0) return parts.join(" · ");
    return "BTC conditions are elevated — avoid new alt buys until signals normalize";
  })();

  const whaleCount      = d?.whale_count       ?? 0;
  const whaleUsdTotal   = d?.whale_usd_total   ?? 0;
  const whaleBuyTotal   = d?.whale_buy_total   ?? 0;
  const whaleNetFlow    = d?.whale_net_flow    ?? 0;
  const whaleNetFlowLvl = d?.whale_net_flow_level ?? "NORMAL";
  const consecDrops     = d?.consec_drops      ?? 0;
  const volSpike        = d?.vol_spike         ?? false;
  const fundingRate     = d?.funding_rate      ?? 0;
  const fundingLvl      = d?.funding_level     ?? "NORMAL";
  const liqUsd          = d?.liq_usd_60s       ?? 0;
  const liqLvl          = d?.liq_level         ?? "NORMAL";
  const liqLargest      = d?.liq_largest       ?? 0;

  const whaleCritical   = whaleCount >= 3;
  const consecCritical  = consecDrops >= 5;
  const netFlowNeg      = whaleNetFlow < 0;
  const netFlowAbs      = Math.abs(whaleNetFlow);

  return (
    <>
      <style>{`
        @keyframes btc-shimmer-top {
          0%   { opacity: 0.5; }
          50%  { opacity: 1; }
          100% { opacity: 0.5; }
        }
        @keyframes btc-price-flash-up {
          0%   { color: #00d4a0; text-shadow: 0 0 30px rgba(0,212,160,0.9), 0 0 60px rgba(0,212,160,0.4); }
          100% { color: #F7931A; text-shadow: 0 0 20px rgba(247,147,26,0.5); }
        }
        @keyframes btc-price-flash-down {
          0%   { color: #ff2d5f; text-shadow: 0 0 30px rgba(255,45,95,0.9), 0 0 60px rgba(255,45,95,0.4); }
          100% { color: #F7931A; text-shadow: 0 0 20px rgba(247,147,26,0.5); }
        }
        @keyframes btc-dot-beat {
          0%, 100% { transform: scale(1); opacity: 1; }
          50%       { transform: scale(1.6); opacity: 0.5; }
        }
        @keyframes btc-danger-pulse {
          0%, 100% { box-shadow: 0 0 0 0 rgba(220,38,38,0); }
          50%       { box-shadow: 0 0 0 8px rgba(220,38,38,0.15); }
        }
        @keyframes btc-bar-fill {
          from { transform: scaleX(0); }
          to   { transform: scaleX(1); }
        }
        @keyframes btc-scan-line {
          0%   { transform: translateY(-100%); opacity: 0; }
          10%  { opacity: 0.6; }
          90%  { opacity: 0.6; }
          100% { transform: translateY(100%); opacity: 0; }
        }

        .btc-shimmer-top { animation: btc-shimmer-top 2.5s ease-in-out infinite; }
        .btc-price-flash-up   { animation: btc-price-flash-up   0.6s ease-out forwards; }
        .btc-price-flash-down { animation: btc-price-flash-down 0.6s ease-out forwards; }
        .btc-dot-beat  { animation: btc-dot-beat 1.6s ease-in-out infinite; }
        .btc-bar-fill  { transform-origin: left; animation: btc-bar-fill 0.8s cubic-bezier(0.22,1,0.36,1) both; }
        .btc-scan-line { animation: btc-scan-line 3s linear infinite; }

        .btc-status-danger { animation: btc-danger-pulse 1.5s ease-in-out infinite; }

        .btc-section-divider {
          height: 1px;
          background: linear-gradient(90deg, transparent, rgba(255,255,255,0.06) 30%, rgba(255,255,255,0.06) 70%, transparent);
        }

        .btc-tf-row:hover { background: rgba(255,255,255,0.03); }
        .btc-tf-row { transition: background 0.2s; }
      `}</style>

      <section className={`relative rounded-3xl overflow-hidden border ${cfg.borderColor} ${cfg.outerGlow} transition-all duration-700`}>

        {/* ── Animated gradient background ── */}
        <div className={`absolute inset-0 bg-gradient-to-br ${cfg.gradientFrom} via-transparent ${cfg.gradientTo} pointer-events-none transition-all duration-700`} />
        <div className="absolute inset-0 bg-[radial-gradient(ellipse_80%_50%_at_50%_0%,rgba(247,147,26,0.06),transparent)] pointer-events-none" />

        {/* ── Animated top shimmer bar ── */}
        <div className={`btc-shimmer-top absolute inset-x-0 top-0 h-[2px] pointer-events-none`}
          style={{ background: `linear-gradient(90deg, transparent 0%, ${cfg.glowColor.replace('0.15', '0.8').replace('0.2', '0.9').replace('0.25', '0.95')} 40%, #F7931A 50%, ${cfg.glowColor.replace('0.15', '0.8').replace('0.2', '0.9').replace('0.25', '0.95')} 60%, transparent 100%)` }}
        />

        {/* ── Scan line (subtle) ── */}
        <div className="absolute inset-x-0 h-[1px] btc-scan-line pointer-events-none opacity-20"
          style={{ background: "linear-gradient(90deg, transparent, rgba(247,147,26,0.6), transparent)" }}
        />

        <div className="relative flex flex-col gap-5 p-5 md:p-6">

          {/* ══════════════════════════════════════════
              HEADER
          ══════════════════════════════════════════ */}
          <div className="flex items-start justify-between gap-3 flex-wrap">
            <div className="flex items-center gap-3.5">
              <div className="relative shrink-0">
                <div className="absolute inset-0 rounded-full blur-lg opacity-60" style={{ background: "rgba(247,147,26,0.5)" }} />
                <CoinIcon symbol="BTC" size={42} className="relative" />
              </div>
              <div>
                <div className="flex items-center gap-2.5 flex-wrap">
                  <h3 className="font-black text-lg tracking-tight">BTC Crash Monitor</h3>
                  <div className="flex items-center gap-1.5">
                    <span className={`h-2 w-2 rounded-full shrink-0 btc-dot-beat ${d ? cfg.dot : "bg-white/20"}`} />
                    <span className="text-[9px] font-black uppercase tracking-[0.18em] text-white/35">
                      {d ? "live" : "offline"}
                    </span>
                  </div>
                </div>
                <div className="text-[11px] text-white/35 mt-0.5 font-medium">
                  {d ? `Updated ${age}` : "Waiting for bot data…"}
                </div>
              </div>
            </div>

            {/* Status badge */}
            <div className={`flex items-center gap-2 px-3.5 py-2 rounded-2xl border text-xs font-black ${
              d ? `${cfg.labelBg} ${cfg.labelText}` : "bg-red-500/10 text-red-400 border-red-500/30"
            } ${stage === "DANGER" ? "btc-status-danger" : ""}`}>
              {d ? cfg.label : "BOT OFFLINE"}
            </div>
          </div>

          {/* ══════════════════════════════════════════
              LIVE PRICE — premium display
          ══════════════════════════════════════════ */}
          <GlassPanel className={`relative overflow-hidden transition-all duration-300 ${
            flash === "up"   ? "border-emerald-500/50 shadow-[0_0_30px_-10px_rgba(0,212,160,0.5)]" :
            flash === "down" ? "border-red-500/50 shadow-[0_0_30px_-10px_rgba(255,45,95,0.5)]" :
            "border-[#F7931A]/20 shadow-[0_0_20px_-10px_rgba(247,147,26,0.3)]"
          }`}>
            <div className="absolute inset-0 bg-[radial-gradient(ellipse_at_right,rgba(247,147,26,0.06),transparent_60%)] pointer-events-none" />
            <div className="flex items-center justify-between px-5 py-4">
              <div>
                <div className="flex items-center gap-2 mb-1">
                  <Activity className="h-3 w-3 text-white/30" />
                  <span className="text-[9px] uppercase tracking-[0.18em] font-black text-white/30">BTC / USDT · Live</span>
                </div>
                <div className={`text-4xl md:text-5xl font-black tabular-nums tracking-tight leading-none transition-all duration-150 ${
                  flash === "up"   ? "btc-price-flash-up"   :
                  flash === "down" ? "btc-price-flash-down" : ""
                }`} style={!flash ? { color: "#F7931A", textShadow: "0 0 20px rgba(247,147,26,0.45)" } : {}}>
                  {livePrice ? `$${fmtPrice(livePrice)}` : "—"}
                </div>
              </div>
              <div className="text-right">
                <div className={`text-3xl font-black ${
                  flash === "up" ? "text-emerald-400" : flash === "down" ? "text-red-400" : "text-white/20"
                }`}>
                  {flash === "up" ? "▲" : flash === "down" ? "▼" : ""}
                </div>
                <div className="text-[9px] font-bold text-white/25 uppercase tracking-widest mt-1">Binance</div>
              </div>
            </div>
          </GlassPanel>

          {/* ══════════════════════════════════════════
              TRADING PAUSED BANNER
          ══════════════════════════════════════════ */}
          {isPaused && (
            <div className="relative flex items-start gap-3 rounded-2xl border border-yellow-500/40 bg-yellow-500/[0.08] px-4 py-3.5 overflow-hidden">
              <div className="absolute inset-0 bg-[radial-gradient(ellipse_at_left,rgba(234,179,8,0.08),transparent_60%)] pointer-events-none" />
              <div className="text-xl mt-0.5 shrink-0">⏸</div>
              <div className="min-w-0 relative">
                <div className="text-[10px] font-black text-yellow-400 uppercase tracking-[0.18em] mb-1">Trading Paused</div>
                <div className="text-[11px] text-yellow-400/70 leading-relaxed break-words">{pauseReason}</div>
              </div>
            </div>
          )}

          {/* ══════════════════════════════════════════
              SPEED & VOLATILITY
          ══════════════════════════════════════════ */}
          <div className="grid grid-cols-2 gap-3">
            {/* Speed */}
            <GlassPanel className="px-4 py-3.5 relative overflow-hidden">
              <div className="absolute inset-0 bg-[radial-gradient(ellipse_at_bottom_left,rgba(99,102,241,0.06),transparent_70%)] pointer-events-none" />
              <div className="flex items-center gap-1.5 mb-2">
                <span className="text-xs">⚡</span>
                <div className="text-[8px] uppercase tracking-[0.18em] font-black text-white/30">Speed (10s)</div>
              </div>
              <span className={`font-black tabular-nums text-2xl leading-none ${
                !d              ? "text-white/15" :
                d.speed > 0.05  ? "text-emerald-400" :
                d.speed < -0.05 ? "text-red-400"     :
                                  "text-white/50"
              }`} style={d && Math.abs(d.speed) > 0.05 ? {
                textShadow: d.speed > 0 ? "0 0 12px rgba(0,212,160,0.5)" : "0 0 12px rgba(255,45,95,0.5)"
              } : {}}>
                {!d ? "—" : `${d.speed > 0 ? "+" : ""}${d.speed.toFixed(2)}%`}
              </span>
            </GlassPanel>

            {/* Volatility */}
            <GlassPanel className="px-4 py-3.5 relative overflow-hidden">
              <div className="absolute inset-0 bg-[radial-gradient(ellipse_at_bottom_right,rgba(168,85,247,0.06),transparent_70%)] pointer-events-none" />
              <div className="flex items-center gap-1.5 mb-2">
                <span className="text-xs">🌪</span>
                <div className="text-[8px] uppercase tracking-[0.18em] font-black text-white/30">Volatility (10s)</div>
              </div>
              <span className={`font-black tabular-nums text-2xl leading-none ${
                !d                  ? "text-white/15"  :
                d.volatility >= 4   ? "text-red-400"   :
                d.volatility >= 2.5 ? "text-orange-400":
                                      "text-emerald-400"
              }`} style={d && d.volatility >= 2.5 ? {
                textShadow: d.volatility >= 4 ? "0 0 12px rgba(255,45,95,0.5)" : "0 0 12px rgba(249,115,22,0.5)"
              } : {}}>
                {!d ? "—" : `${d.volatility.toFixed(2)}%`}
              </span>
            </GlassPanel>
          </div>

          {/* ══════════════════════════════════════════
              PEAK PRICES & DROP TABLE
          ══════════════════════════════════════════ */}
          <GlassPanel>
            <SectionLabel
              icon={<TrendingUp className="h-3 w-3 text-primary" />}
              label="Peak Prices & Drop Analysis"
            />
            <div className="px-2 py-1">
              {/* Column headers */}
              <div className="grid grid-cols-[36px_1fr_76px_1fr] gap-x-3 px-2 py-2">
                <span className="text-[8px] uppercase tracking-[0.15em] text-white/25 font-black text-right">TF</span>
                <span className="text-[8px] uppercase tracking-[0.15em] text-white/25 font-black">Peak</span>
                <span className="text-[8px] uppercase tracking-[0.15em] text-white/25 font-black text-right">Drop</span>
                <span className="text-[8px] uppercase tracking-[0.15em] text-white/25 font-black pl-1">Intensity</span>
              </div>
              <div className="btc-section-divider mx-2 mb-1" />
              <div className="flex flex-col gap-0.5 pb-2">
                {TIMEFRAMES.map(({ label, dropKey, peakKey }) => {
                  const pct  = d ? (d[dropKey] as number) : 0;
                  const peak = d ? (d[peakKey] as number) : null;
                  const inactive = !d;
                  const barPct   = Math.min((pct / 6.0) * 100, 100);
                  const isHot    = pct >= 2;
                  return (
                    <div key={label} className="btc-tf-row grid grid-cols-[36px_1fr_76px_1fr] gap-x-3 items-center px-2 py-2 rounded-xl">
                      {/* Timeframe label */}
                      <span className={`text-[11px] font-black tabular-nums text-right ${
                        isHot && !inactive ? dropColor(pct) : "text-white/40"
                      }`}>{label}</span>

                      {/* Peak price */}
                      <span className={`text-[11px] font-bold tabular-nums ${inactive ? "text-white/15" : "text-white/55"}`}>
                        {inactive ? "—" : `$${fmtPrice(peak ?? 0)}`}
                      </span>

                      {/* Drop pct */}
                      <div className={`text-right text-xs font-black tabular-nums ${inactive ? "text-red-400/25" : dropColor(pct)}`}
                        style={!inactive && pct >= 2 ? { textShadow: pct >= 4 ? "0 0 8px rgba(255,45,95,0.6)" : "0 0 8px rgba(249,115,22,0.5)" } : {}}>
                        {inactive ? "–.–%" : `-${pct.toFixed(2)}%`}
                      </div>

                      {/* Progress bar — premium pill style */}
                      <div className="pl-1">
                        <div className="h-1.5 w-full rounded-full bg-white/[0.06] overflow-hidden">
                          <div
                            className={`h-full rounded-full btc-bar-fill ${inactive ? "bg-red-400/20" : dropBgColor(pct)}`}
                            style={{
                              width: `${inactive ? 0 : barPct}%`,
                              boxShadow: !inactive && pct >= 2
                                ? pct >= 4 ? "0 0 6px rgba(255,45,95,0.7)" : "0 0 6px rgba(249,115,22,0.6)"
                                : "none",
                            }}
                          />
                        </div>
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>
          </GlassPanel>

          {/* ══════════════════════════════════════════
              MARKET SIGNALS
          ══════════════════════════════════════════ */}
          <GlassPanel>
            <SectionLabel
              icon={<Zap className="h-3 w-3 text-primary" />}
              label="Market Signals"
            />

            <div className="flex flex-col gap-0 divide-y divide-white/[0.05]">

              {/* ── LIQUIDATIONS ── */}
              <div className="flex items-center justify-between px-4 py-3.5">
                <div className="flex items-center gap-3">
                  <div className="flex items-center justify-center h-8 w-8 rounded-xl bg-white/[0.04] border border-white/[0.06] text-base shrink-0">💥</div>
                  <div>
                    <div className="text-[9px] uppercase tracking-[0.15em] font-black text-white/30 mb-1">Liquidations (60s)</div>
                    <div className={`text-base font-black tabular-nums leading-none ${
                      !d                  ? "text-white/15"  :
                      liqLvl === "DANGER" ? "text-red-400"   :
                      liqLvl === "RISK"   ? "text-orange-400":
                      liqLvl === "WATCH"  ? "text-yellow-400":
                                            "text-emerald-400"
                    }`} style={!d ? {} : { textShadow: liqLvl === "DANGER" ? "0 0 10px rgba(255,45,95,0.5)" : "none" }}>
                      {!d ? "—" : fmtLiq(liqUsd)}
                      {d && liqLargest > 0 && (
                        <span className="ml-2 text-[10px] font-bold text-white/30">Lrg: {fmtLiq(liqLargest)}</span>
                      )}
                    </div>
                  </div>
                </div>
                {d ? <LevelBadge level={liqLvl} /> : <span className="text-white/15 text-xs">—</span>}
              </div>

              {/* ── FUNDING RATE ── */}
              <div className="flex items-center justify-between px-4 py-3.5">
                <div className="flex items-center gap-3">
                  <div className="flex items-center justify-center h-8 w-8 rounded-xl bg-white/[0.04] border border-white/[0.06] text-base shrink-0">💸</div>
                  <div>
                    <div className="text-[9px] uppercase tracking-[0.15em] font-black text-white/30 mb-1">Funding Rate</div>
                    <div className={`text-base font-black tabular-nums leading-none ${
                      !d                      ? "text-white/15"  :
                      fundingLvl === "DANGER" ? "text-red-400"   :
                      fundingLvl === "RISK"   ? "text-orange-400":
                      fundingLvl === "WATCH"  ? "text-yellow-400":
                                                "text-emerald-400"
                    }`}>
                      {!d ? "—" : fmtFunding(fundingRate)}
                    </div>
                  </div>
                </div>
                {d ? <LevelBadge level={fundingLvl} /> : <span className="text-white/15 text-xs">—</span>}
              </div>

              {/* ── WHALE SELLS + BLEED MINS side by side ── */}
              <div className="grid grid-cols-2 divide-x divide-white/[0.05]">
                {/* Whale Sells */}
                <div className="px-4 py-3.5">
                  <div className="flex items-center gap-1.5 mb-2">
                    <span className="text-xs">🐋</span>
                    <div className="text-[8px] uppercase tracking-[0.15em] font-black text-white/30">Whale Sells/60s</div>
                  </div>
                  <div className={`text-3xl font-black tabular-nums leading-none ${
                    !d             ? "text-white/15"  :
                    whaleCritical  ? "text-red-400"   :
                    whaleCount >= 1? "text-orange-400":
                                     "text-emerald-400"
                  }`} style={!d ? {} : {
                    textShadow: whaleCritical
                      ? "0 0 16px rgba(255,45,95,0.6)"
                      : whaleCount >= 1 ? "0 0 12px rgba(249,115,22,0.5)" : "none"
                  }}>
                    {!d ? "—" : whaleCount}
                  </div>
                  {d && (
                    <div className={`text-[10px] font-bold mt-1 tabular-nums ${
                      whaleCritical   ? "text-red-400/70"    :
                      whaleCount >= 1 ? "text-orange-400/70" :
                                        "text-emerald-400/50"
                    }`}>
                      {whaleUsdTotal > 0 ? fmtLiq(whaleUsdTotal) : "$0 sold"}
                    </div>
                  )}
                  {d && whaleCritical && (
                    <div className="flex items-center gap-1 mt-1">
                      <span className="h-1 w-1 rounded-full bg-red-400 animate-pulse" />
                      <span className="text-[8px] text-red-400/80 font-black uppercase tracking-widest">cluster alert</span>
                    </div>
                  )}
                </div>

                {/* Bleed Minutes */}
                <div className="px-4 py-3.5">
                  <div className="flex items-center gap-1.5 mb-2">
                    <TrendingDown className="h-3 w-3 text-white/30" />
                    <div className="text-[8px] uppercase tracking-[0.15em] font-black text-white/30">Bleed Mins</div>
                  </div>
                  <div className={`text-3xl font-black tabular-nums leading-none ${
                    !d               ? "text-white/15"  :
                    consecCritical   ? "text-red-400"   :
                    consecDrops >= 3 ? "text-orange-400":
                    consecDrops >= 1 ? "text-yellow-400":
                                       "text-emerald-400"
                  }`} style={!d ? {} : {
                    textShadow: consecCritical
                      ? "0 0 16px rgba(255,45,95,0.6)" : "none"
                  }}>
                    {!d ? "—" : consecDrops}
                  </div>
                  {d && consecCritical && (
                    <div className="flex items-center gap-1 mt-1">
                      <span className="h-1 w-1 rounded-full bg-red-400 animate-pulse" />
                      <span className="text-[8px] text-red-400/80 font-black uppercase tracking-widest">slow bleed!</span>
                    </div>
                  )}
                </div>
              </div>

              {/* ── NET WHALE FLOW ── */}
              <div className="px-4 py-3.5">
                <div className="flex items-center justify-between mb-3">
                  <div className="flex items-center gap-2">
                    <span className="text-xs">🌊</span>
                    <div className="text-[9px] uppercase tracking-[0.15em] font-black text-white/30">Net Whale Flow (60s)</div>
                  </div>
                  {d ? <LevelBadge level={whaleNetFlowLvl} /> : <span className="text-white/15 text-xs">—</span>}
                </div>
                <div className="grid grid-cols-3 gap-2">
                  <div className="rounded-xl bg-emerald-500/[0.08] border border-emerald-500/20 px-3 py-2.5 text-center">
                    <div className="text-[7px] uppercase tracking-[0.15em] font-black text-emerald-400/50 mb-1.5">Buys</div>
                    <div className={`text-xs font-black tabular-nums ${!d ? "text-white/15" : "text-emerald-400"}`}>
                      {!d ? "—" : fmtLiq(whaleBuyTotal)}
                    </div>
                  </div>
                  <div className="rounded-xl bg-red-500/[0.08] border border-red-500/20 px-3 py-2.5 text-center">
                    <div className="text-[7px] uppercase tracking-[0.15em] font-black text-red-400/50 mb-1.5">Sells</div>
                    <div className={`text-xs font-black tabular-nums ${!d ? "text-white/15" : "text-red-400"}`}>
                      {!d ? "—" : fmtLiq(whaleUsdTotal)}
                    </div>
                  </div>
                  <div className={`rounded-xl border px-3 py-2.5 text-center ${
                    !d                           ? "bg-white/[0.03] border-white/[0.06]" :
                    whaleNetFlowLvl === "DANGER" ? "bg-red-500/[0.08] border-red-500/25" :
                    whaleNetFlowLvl === "WATCH"  ? "bg-orange-500/[0.08] border-orange-500/25" :
                    netFlowNeg                   ? "bg-yellow-500/[0.08] border-yellow-500/25" :
                                                   "bg-emerald-500/[0.08] border-emerald-500/25"
                  }`}>
                    <div className="text-[7px] uppercase tracking-[0.15em] font-black text-white/30 mb-1.5">Net</div>
                    <div className={`text-xs font-black tabular-nums flex items-center justify-center gap-0.5 ${
                      !d                           ? "text-white/15"  :
                      whaleNetFlowLvl === "DANGER" ? "text-red-400"   :
                      whaleNetFlowLvl === "WATCH"  ? "text-orange-400":
                      netFlowNeg                   ? "text-yellow-400":
                                                     "text-emerald-400"
                    }`}>
                      {!d ? "—" : <><span>{netFlowNeg ? "▼" : "▲"}</span><span>{fmtLiq(netFlowAbs)}</span></>}
                    </div>
                  </div>
                </div>
              </div>

              {/* ── VOLUME SPIKE ── */}
              <div className="flex items-center justify-between px-4 py-3.5">
                <div className="flex items-center gap-3">
                  <div className="flex items-center justify-center h-8 w-8 rounded-xl bg-white/[0.04] border border-white/[0.06] shrink-0">
                    <Waves className="h-4 w-4 text-white/30" />
                  </div>
                  <div className="text-[9px] uppercase tracking-[0.15em] font-black text-white/30">Vol Spike on Red Candle</div>
                </div>
                {!d ? (
                  <span className="text-white/15 text-xs font-black">—</span>
                ) : volSpike ? (
                  <span className="flex items-center gap-1.5 px-3 py-1.5 rounded-xl bg-red-500/15 border border-red-500/30 text-red-400 text-[9px] font-black uppercase tracking-[0.15em]">
                    <span className="h-1.5 w-1.5 rounded-full bg-red-400 animate-pulse" />
                    SPIKE 🔥
                  </span>
                ) : (
                  <span className="px-3 py-1.5 rounded-xl bg-emerald-500/10 border border-emerald-500/25 text-emerald-400 text-[9px] font-black uppercase tracking-[0.15em]">
                    Normal
                  </span>
                )}
              </div>

            </div>
          </GlassPanel>

        </div>
      </section>
    </>
  );
}
