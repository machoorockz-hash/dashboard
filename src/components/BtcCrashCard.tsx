import { useEffect, useState } from "react";
import {
  Activity, TrendingUp, TrendingDown, Zap, Waves,
  ArrowUpDown, Flame, AlertTriangle, ShieldCheck,
  ChevronDown, BarChart2, Droplets
} from "lucide-react";
import { CoinIcon } from "./CoinIcon";

const API_BASE = import.meta.env.VITE_API_BASE ?? "";

// ─────────────────────────────────────────────
// Types
// ─────────────────────────────────────────────
interface BotData {
  price: number;
  drop_1m: number; drop_5m: number; drop_15m: number; drop_1h: number; drop_4h: number;
  peak_1m: number; peak_5m: number; peak_15m: number; peak_1h: number; peak_4h: number;
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

// ─────────────────────────────────────────────
// Config
// ─────────────────────────────────────────────
const STAGE_CONFIG: Record<string, {
  gradient: string;
  border: string;
  text: string;
  dot: string;
  glow: string;
  label: string;
  icon: React.ReactNode;
}> = {
  SAFE:       {
    gradient: "from-emerald-500/8 to-transparent",
    border:   "border-emerald-500/20",
    text:     "text-emerald-400",
    dot:      "bg-emerald-400",
    glow:     "shadow-emerald-500/15",
    label:    "SAFE",
    icon:     <ShieldCheck className="h-3 w-3" />,
  },
  WATCH:      {
    gradient: "from-yellow-500/8 to-transparent",
    border:   "border-yellow-500/20",
    text:     "text-yellow-400",
    dot:      "bg-yellow-400",
    glow:     "shadow-yellow-500/15",
    label:    "WATCH",
    icon:     <AlertTriangle className="h-3 w-3" />,
  },
  RISK:       {
    gradient: "from-orange-500/8 to-transparent",
    border:   "border-orange-500/20",
    text:     "text-orange-400",
    dot:      "bg-orange-400",
    glow:     "shadow-orange-500/15",
    label:    "RISK",
    icon:     <AlertTriangle className="h-3 w-3" />,
  },
  SELL_ALERT: {
    gradient: "from-red-500/8 to-transparent",
    border:   "border-red-500/20",
    text:     "text-red-400",
    dot:      "bg-red-400",
    glow:     "shadow-red-500/15",
    label:    "SELL ALERT",
    icon:     <TrendingDown className="h-3 w-3" />,
  },
  DANGER:     {
    gradient: "from-red-600/12 to-transparent",
    border:   "border-red-600/30",
    text:     "text-red-400",
    dot:      "bg-red-500 animate-pulse",
    glow:     "shadow-red-600/25",
    label:    "DANGER",
    icon:     <Flame className="h-3 w-3" />,
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
  NORMAL: "text-emerald-400",
  WATCH:  "text-yellow-400",
  RISK:   "text-orange-400",
  DANGER: "text-red-400",
};

// ─────────────────────────────────────────────
// Helpers
// ─────────────────────────────────────────────
function dropColor(pct: number) {
  if (pct >= 4) return "text-red-400";
  if (pct >= 2) return "text-orange-400";
  if (pct >= 1) return "text-yellow-400";
  return "text-emerald-400";
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

// ─────────────────────────────────────────────
// Sub-components
// ─────────────────────────────────────────────

/** Slim segmented intensity bar */
function IntensityBar({ pct, inactive = false }: { pct: number; inactive?: boolean }) {
  const filled = inactive ? 0 : Math.round(Math.min(pct / 6.0, 1.0) * 8);
  const empty  = 8 - filled;
  const color =
    pct >= 4 ? "bg-red-400"     :
    pct >= 2 ? "bg-orange-400"  :
    pct >= 1 ? "bg-yellow-400"  :
               "bg-emerald-400";
  return (
    <div className="flex items-center gap-[2px]">
      {Array.from({ length: filled }).map((_, i) => (
        <div key={`f${i}`} className={`h-[5px] w-[4px] rounded-[1px] ${color} opacity-90`} />
      ))}
      {Array.from({ length: empty }).map((_, i) => (
        <div key={`e${i}`} className={`h-[5px] w-[4px] rounded-[1px] ${inactive ? "bg-white/5" : "bg-white/8"}`} />
      ))}
    </div>
  );
}

/** Pill-style level badge */
function LevelBadge({ level }: { level: string }) {
  const col = LEVEL_COLORS[level] ?? "text-emerald-400";
  const styles: Record<string, string> = {
    NORMAL: "bg-emerald-500/10 border-emerald-500/20 text-emerald-400",
    WATCH:  "bg-yellow-500/10  border-yellow-500/20  text-yellow-400",
    RISK:   "bg-orange-500/10  border-orange-500/20  text-orange-400",
    DANGER: "bg-red-500/10     border-red-500/20     text-red-400",
  };
  return (
    <span className={`inline-flex items-center px-2 py-0.5 rounded-full border text-[9px] font-black uppercase tracking-[0.12em] ${styles[level] ?? styles["NORMAL"]}`}>
      {level}
    </span>
  );
}

/** Small section label with icon */
function SectionHeader({ icon, label }: { icon: React.ReactNode; label: string }) {
  return (
    <div className="flex items-center gap-1.5 px-3 py-2 border-b border-white/5">
      <span className="text-white/30">{icon}</span>
      <span className="text-[9px] uppercase tracking-[0.15em] font-black text-white/30">{label}</span>
    </div>
  );
}

/** A stat cell used in the 2-col grid */
function StatCell({
  label, value, valueClass = "text-white/80", sub
}: {
  label: string; value: string; valueClass?: string; sub?: string
}) {
  return (
    <div className="px-3 py-2.5">
      <div className="text-[9px] uppercase tracking-[0.12em] font-bold text-white/25 mb-1">{label}</div>
      <div className={`text-sm font-black tabular-nums ${valueClass}`}>{value}</div>
      {sub && <div className="text-[10px] text-white/30 mt-0.5 tabular-nums">{sub}</div>}
    </div>
  );
}

// ─────────────────────────────────────────────
// Main card
// ─────────────────────────────────────────────
export function BtcCrashCard() {
  const [snapshot,  setSnapshot]  = useState<Snapshot | null>(null);
  const [age,       setAge]       = useState<string>("");
  const [livePrice, setLivePrice] = useState<number | null>(null);
  const [flash,     setFlash]     = useState<"up" | "down" | null>(null);

  /* Live price via Binance WS */
  useEffect(() => {
    const ws = new WebSocket("wss://data-stream.binance.vision/ws/btcusdt@trade");
    ws.onmessage = (e) => {
      try {
        const p = parseFloat(JSON.parse(e.data).p);
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
    const t = setTimeout(() => setFlash(null), 400);
    return () => clearTimeout(t);
  }, [flash]);

  /* Bot snapshot poll */
  useEffect(() => {
    let alive = true;
    async function poll() {
      try {
        const res = await fetch(`${API_BASE}/api/bot/data?key=btc`);
        if (!res.ok) return;
        const data = (await res.json()) as Snapshot;
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

  // ── Derived values ──
  const d      = snapshot?.data;
  const stage  = d?.status ?? "SAFE";
  const cfg    = STAGE_CONFIG[stage] ?? STAGE_CONFIG["SAFE"]!;
  const isPaused = d?.trade_mode === "Pause";

  const pauseReason: string = (() => {
    if (!d) return "";
    if (d.pause_reason?.trim()) return d.pause_reason.trim();
    const drops = [
      { label: "1m",  pct: d.drop_1m  },
      { label: "5m",  pct: d.drop_5m  },
      { label: "15m", pct: d.drop_15m },
      { label: "1h",  pct: d.drop_1h  },
      { label: "4h",  pct: d.drop_4h  },
    ];
    const worst = drops.reduce((a, b) => (b.pct > a.pct ? b : a));
    const parts: string[] = [];
    if (worst.pct >= 1)              parts.push(`${worst.label} drop −${worst.pct.toFixed(2)}%`);
    if ((d.consec_drops ?? 0) >= 3)  parts.push(`${d.consec_drops} consec. drops`);
    if (d.vol_spike)                 parts.push("vol spike");
    if ((d.whale_count ?? 0) >= 3)   parts.push(`${d.whale_count} whale sells`);
    if (d.liq_level === "DANGER")    parts.push(`liqs ${fmtLiq(d.liq_usd_60s ?? 0)}`);
    return parts.length > 0 ? parts.join(" · ") : "Signals elevated — avoid new alt buys";
  })();

  const whaleCount     = d?.whale_count       ?? 0;
  const whaleUsdTotal  = d?.whale_usd_total   ?? 0;
  const whaleBuyTotal  = d?.whale_buy_total   ?? 0;
  const whaleNetFlow   = d?.whale_net_flow    ?? 0;
  const whaleNetFlowLvl = d?.whale_net_flow_level ?? "NORMAL";
  const consecDrops    = d?.consec_drops      ?? 0;
  const volSpike       = d?.vol_spike         ?? false;
  const fundingRate    = d?.funding_rate      ?? 0;
  const fundingLvl     = d?.funding_level     ?? "NORMAL";
  const liqUsd         = d?.liq_usd_60s       ?? 0;
  const liqLvl         = d?.liq_level         ?? "NORMAL";
  const liqLargest     = d?.liq_largest       ?? 0;

  const whaleCritical  = whaleCount >= 3;
  const consecCritical = consecDrops >= 5;
  const netFlowNeg     = whaleNetFlow < 0;
  const netFlowAbs     = Math.abs(whaleNetFlow);

  // ── Render ──
  return (
    <section
      className={`
        relative flex flex-col overflow-hidden rounded-2xl
        border bg-[#0b0c10]
        ${cfg.border}
        shadow-2xl ${cfg.glow}
        w-full max-w-sm
      `}
      style={{ boxShadow: "0 0 0 1px rgba(255,255,255,0.04), 0 24px 48px rgba(0,0,0,0.6)" }}
    >
      {/* ── Ambient gradient background ── */}
      <div className={`pointer-events-none absolute inset-0 bg-gradient-to-b ${cfg.gradient}`} />
      {/* Top shimmer line */}
      <div className="pointer-events-none absolute inset-x-0 top-0 h-px bg-gradient-to-r from-transparent via-white/10 to-transparent" />

      {/* ════════════════════════════════
          HEADER
      ════════════════════════════════ */}
      <div className="relative flex items-center justify-between gap-2 px-4 pt-4 pb-3">
        <div className="flex items-center gap-2.5">
          {/* BTC icon */}
          <div className="relative flex items-center justify-center h-9 w-9 rounded-xl bg-[#F7931A]/10 border border-[#F7931A]/20 shrink-0">
            <span className="text-[#F7931A] font-black text-sm">₿</span>
          </div>
          <div>
            <div className="flex items-center gap-1.5">
              <span className="text-[13px] font-black tracking-tight text-white/90">BTC Crash Monitor</span>
              {/* live dot */}
              <span className={`h-1.5 w-1.5 rounded-full shrink-0 ${d ? cfg.dot : "bg-white/20"}`} />
            </div>
            <div className="text-[10px] text-white/25 mt-0.5 font-medium">
              {d ? `synced ${age}` : "awaiting bot…"}
            </div>
          </div>
        </div>

        {/* Status badge */}
        <div className={`
          inline-flex items-center gap-1.5 px-2.5 py-1 rounded-lg border
          text-[10px] font-black uppercase tracking-[0.1em]
          ${d ? `${cfg.text} border-current/20 bg-current/5` : "text-white/25 border-white/10 bg-white/5"}
        `}>
          {d ? cfg.icon : <Activity className="h-3 w-3" />}
          {d ? cfg.label : "OFFLINE"}
        </div>
      </div>

      {/* ════════════════════════════════
          LIVE PRICE
      ════════════════════════════════ */}
      <div className="relative mx-3 mb-3">
        <div
          className={`
            relative flex items-center justify-between
            rounded-xl px-3.5 py-3 border transition-all duration-200
            bg-white/[0.02]
            ${flash === "up"   ? "border-emerald-400/40 bg-emerald-500/5" :
              flash === "down" ? "border-red-400/40 bg-red-500/5"         :
                                 "border-white/6"}
          `}
        >
          <div className="flex items-center gap-1.5">
            <Activity className="h-3 w-3 text-white/25" />
            <span className="text-[9px] uppercase tracking-[0.15em] font-bold text-white/25">Live Price</span>
          </div>
          <span
            className={`
              text-2xl font-black tabular-nums tracking-tight transition-colors duration-200
              ${flash === "up"   ? "text-emerald-400" :
                flash === "down" ? "text-red-400"     :
                                   "text-[#F7931A]"}
            `}
          >
            {livePrice ? `$${fmtPrice(livePrice)}` : "—"}
          </span>
        </div>
      </div>

      {/* ════════════════════════════════
          PAUSE BANNER
      ════════════════════════════════ */}
      {isPaused && (
        <div className="mx-3 mb-3 flex items-start gap-2.5 rounded-xl border border-yellow-500/25 bg-yellow-500/6 px-3 py-2.5">
          <AlertTriangle className="h-3.5 w-3.5 text-yellow-400 shrink-0 mt-[1px]" />
          <div>
            <div className="text-[10px] font-black text-yellow-400 uppercase tracking-[0.12em]">Trading Paused</div>
            <div className="text-[10px] text-yellow-400/60 mt-0.5 leading-relaxed">{pauseReason}</div>
          </div>
        </div>
      )}

      {/* ════════════════════════════════
          PEAK PRICES & DROP TABLE
      ════════════════════════════════ */}
      <div className="mx-3 mb-3 rounded-xl border border-white/6 bg-white/[0.02] overflow-hidden">
        <SectionHeader icon={<TrendingUp className="h-3 w-3" />} label="Peak Prices & Drop" />

        {/* Column headers */}
        <div className="grid grid-cols-[36px_1fr_64px_52px] gap-x-2 px-3 py-1 border-b border-white/5">
          <span className="text-[8px] uppercase tracking-[0.12em] text-white/20 font-bold text-right">TF</span>
          <span className="text-[8px] uppercase tracking-[0.12em] text-white/20 font-bold">Peak</span>
          <span className="text-[8px] uppercase tracking-[0.12em] text-white/20 font-bold text-right">Drop</span>
          <span className="text-[8px] uppercase tracking-[0.12em] text-white/20 font-bold pl-1">Bar</span>
        </div>

        {/* Rows */}
        <div>
          {TIMEFRAMES.map(({ label, dropKey, peakKey }, idx) => {
            const pct     = d ? (d[dropKey] as number) : 0;
            const peak    = d ? (d[peakKey] as number) : null;
            const inactive = !d;
            return (
              <div
                key={label}
                className={`
                  grid grid-cols-[36px_1fr_64px_52px] gap-x-2 items-center px-3 py-[7px]
                  hover:bg-white/[0.025] transition-colors
                  ${idx < TIMEFRAMES.length - 1 ? "border-b border-white/4" : ""}
                `}
              >
                <span className="text-[10px] font-black text-white/30 text-right tabular-nums">{label}</span>
                <span className={`text-[11px] font-bold tabular-nums ${inactive ? "text-white/15" : "text-white/55"}`}>
                  {inactive ? "—" : `$${fmtPrice(peak ?? 0)}`}
                </span>
                <div className={`text-right text-[11px] font-black tabular-nums ${inactive ? "text-white/15" : dropColor(pct)}`}>
                  {inactive ? "—" : `-${pct.toFixed(2)}%`}
                </div>
                <div className="pl-1">
                  <IntensityBar pct={pct} inactive={inactive} />
                </div>
              </div>
            );
          })}
        </div>
      </div>

      {/* ════════════════════════════════
          SPEED & VOLATILITY  (2-col)
      ════════════════════════════════ */}
      <div className="mx-3 mb-3 grid grid-cols-2 gap-2">
        {/* Speed */}
        <div className="rounded-xl border border-white/6 bg-white/[0.02] px-3 py-2.5">
          <div className="flex items-center gap-1 mb-1.5">
            <Zap className="h-3 w-3 text-white/25" />
            <span className="text-[8px] uppercase tracking-[0.14em] font-bold text-white/25">Speed 10s</span>
          </div>
          <span className={`text-base font-black tabular-nums ${
            !d          ? "text-white/15" :
            d.speed > 0 ? "text-emerald-400" :
            d.speed < 0 ? "text-red-400"     : "text-white/40"
          }`}>
            {!d ? "—" : `${d.speed > 0 ? "+" : ""}${d.speed.toFixed(2)}%`}
          </span>
        </div>

        {/* Volatility */}
        <div className="rounded-xl border border-white/6 bg-white/[0.02] px-3 py-2.5">
          <div className="flex items-center gap-1 mb-1.5">
            <Waves className="h-3 w-3 text-white/25" />
            <span className="text-[8px] uppercase tracking-[0.14em] font-bold text-white/25">Vol 10s</span>
          </div>
          <span className={`text-base font-black tabular-nums ${
            !d                   ? "text-white/15" :
            d.volatility >= 4    ? "text-red-400"    :
            d.volatility >= 2.5  ? "text-orange-400" : "text-emerald-400"
          }`}>
            {!d ? "—" : `${d.volatility.toFixed(2)}%`}
          </span>
        </div>
      </div>

      {/* ════════════════════════════════
          MARKET SIGNALS
      ════════════════════════════════ */}
      <div className="mx-3 mb-4 rounded-xl border border-white/6 bg-white/[0.02] overflow-hidden">
        <SectionHeader icon={<BarChart2 className="h-3 w-3" />} label="Market Signals" />

        {/* ── Liquidations ── */}
        <div className="flex items-center justify-between px-3 py-2.5 border-b border-white/5">
          <div>
            <div className="text-[9px] uppercase tracking-[0.12em] font-bold text-white/25 mb-1">Liquidations (60s)</div>
            <div className={`text-sm font-black tabular-nums flex items-baseline gap-2 ${
              !d              ? "text-white/15" :
              liqLvl === "DANGER" ? "text-red-400"    :
              liqLvl === "RISK"   ? "text-orange-400" :
              liqLvl === "WATCH"  ? "text-yellow-400" : "text-emerald-400"
            }`}>
              {!d ? "—" : fmtLiq(liqUsd)}
              {d && liqLargest > 0 && (
                <span className="text-[10px] font-bold text-white/25">
                  lrg {fmtLiq(liqLargest)}
                </span>
              )}
            </div>
          </div>
          {d ? <LevelBadge level={liqLvl} /> : <span className="text-white/15 text-xs">—</span>}
        </div>

        {/* ── Funding Rate ── */}
        <div className="flex items-center justify-between px-3 py-2.5 border-b border-white/5">
          <div>
            <div className="text-[9px] uppercase tracking-[0.12em] font-bold text-white/25 mb-1">Funding Rate</div>
            <div className={`text-sm font-black tabular-nums ${
              !d ? "text-white/15" :
              fundingLvl === "DANGER" ? "text-red-400"    :
              fundingLvl === "RISK"   ? "text-orange-400" :
              fundingLvl === "WATCH"  ? "text-yellow-400" : "text-emerald-400"
            }`}>
              {!d ? "—" : fmtFunding(fundingRate)}
            </div>
          </div>
          {d ? <LevelBadge level={fundingLvl} /> : <span className="text-white/15 text-xs">—</span>}
        </div>

        {/* ── Whale Sells + Bleed Mins (2-col) ── */}
        <div className="grid grid-cols-2 border-b border-white/5">
          <div className="px-3 py-2.5 border-r border-white/5">
            <div className="flex items-center gap-1 mb-1.5">
              <ArrowUpDown className="h-3 w-3 text-white/25" />
              <span className="text-[9px] uppercase tracking-[0.12em] font-bold text-white/25">Whale Sells/60s</span>
            </div>
            <div className={`text-xl font-black tabular-nums ${
              !d              ? "text-white/15" :
              whaleCritical   ? "text-red-400"    :
              whaleCount >= 1 ? "text-orange-400" : "text-emerald-400"
            }`}>
              {!d ? "—" : whaleCount}
            </div>
            {d && (
              <div className={`text-[10px] font-bold tabular-nums mt-0.5 ${
                whaleCritical   ? "text-red-400/60"    :
                whaleCount >= 1 ? "text-orange-400/60" : "text-white/20"
              }`}>
                {whaleUsdTotal > 0 ? fmtLiq(whaleUsdTotal) : "$0"}
              </div>
            )}
            {d && whaleCritical && (
              <div className="text-[9px] text-red-400/60 font-bold mt-0.5 uppercase tracking-wide">cluster</div>
            )}
          </div>

          <div className="px-3 py-2.5">
            <div className="flex items-center gap-1 mb-1.5">
              <TrendingDown className="h-3 w-3 text-white/25" />
              <span className="text-[9px] uppercase tracking-[0.12em] font-bold text-white/25">Bleed Mins</span>
            </div>
            <div className={`text-xl font-black tabular-nums ${
              !d              ? "text-white/15"  :
              consecCritical  ? "text-red-400"    :
              consecDrops >= 3 ? "text-orange-400" :
              consecDrops >= 1 ? "text-yellow-400" : "text-emerald-400"
            }`}>
              {!d ? "—" : consecDrops}
            </div>
            {d && consecCritical && (
              <div className="text-[9px] text-red-400/60 font-bold mt-0.5 uppercase tracking-wide">slow bleed</div>
            )}
          </div>
        </div>

        {/* ── Net Whale Flow ── */}
        <div className="px-3 py-2.5 border-b border-white/5">
          <div className="flex items-center justify-between mb-2">
            <div className="flex items-center gap-1">
              <Droplets className="h-3 w-3 text-white/25" />
              <span className="text-[9px] uppercase tracking-[0.12em] font-bold text-white/25">Net Whale Flow (60s)</span>
            </div>
            {d ? <LevelBadge level={whaleNetFlowLvl} /> : <span className="text-white/15 text-xs">—</span>}
          </div>

          <div className="grid grid-cols-3 gap-1.5">
            {/* Buys */}
            <div className="rounded-lg bg-emerald-500/8 border border-emerald-500/15 px-2 py-1.5 text-center">
              <div className="text-[8px] uppercase tracking-widest font-black text-emerald-400/50 mb-0.5">Buys</div>
              <div className={`text-[11px] font-black tabular-nums ${!d ? "text-white/15" : "text-emerald-400"}`}>
                {!d ? "—" : fmtLiq(whaleBuyTotal)}
              </div>
            </div>
            {/* Sells */}
            <div className="rounded-lg bg-red-500/8 border border-red-500/15 px-2 py-1.5 text-center">
              <div className="text-[8px] uppercase tracking-widest font-black text-red-400/50 mb-0.5">Sells</div>
              <div className={`text-[11px] font-black tabular-nums ${!d ? "text-white/15" : "text-red-400"}`}>
                {!d ? "—" : fmtLiq(whaleUsdTotal)}
              </div>
            </div>
            {/* Net */}
            <div className={`rounded-lg border px-2 py-1.5 text-center ${
              !d                           ? "bg-white/3 border-white/8" :
              whaleNetFlowLvl === "DANGER" ? "bg-red-500/8 border-red-500/20" :
              whaleNetFlowLvl === "WATCH"  ? "bg-orange-500/8 border-orange-500/20" :
              netFlowNeg                   ? "bg-yellow-500/8 border-yellow-500/20" :
                                             "bg-emerald-500/8 border-emerald-500/20"
            }`}>
              <div className="text-[8px] uppercase tracking-widest font-black text-white/25 mb-0.5">Net</div>
              <div className={`text-[11px] font-black tabular-nums flex items-center justify-center gap-0.5 ${
                !d                           ? "text-white/15"  :
                whaleNetFlowLvl === "DANGER" ? "text-red-400"    :
                whaleNetFlowLvl === "WATCH"  ? "text-orange-400" :
                netFlowNeg                   ? "text-yellow-400" : "text-emerald-400"
              }`}>
                {!d ? "—" : <><span>{netFlowNeg ? "▼" : "▲"}</span><span>{fmtLiq(netFlowAbs)}</span></>}
              </div>
            </div>
          </div>
        </div>

        {/* ── Vol Spike ── */}
        <div className="flex items-center justify-between px-3 py-2.5">
          <div className="flex items-center gap-1.5">
            <Waves className="h-3 w-3 text-white/25" />
            <span className="text-[9px] uppercase tracking-[0.12em] font-bold text-white/25">Vol Spike on Red Candle</span>
          </div>
          {!d ? (
            <span className="text-white/15 text-xs font-black">—</span>
          ) : volSpike ? (
            <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full border border-red-500/25 bg-red-500/10 text-red-400 text-[9px] font-black uppercase tracking-[0.12em]">
              <span className="h-1.5 w-1.5 rounded-full bg-red-400 animate-pulse" />
              SPIKE
            </span>
          ) : (
            <span className="inline-flex items-center px-2 py-0.5 rounded-full border border-emerald-500/20 bg-emerald-500/8 text-emerald-400 text-[9px] font-black uppercase tracking-[0.12em]">
              NORMAL
            </span>
          )}
        </div>
      </div>

    </section>
  );
}
