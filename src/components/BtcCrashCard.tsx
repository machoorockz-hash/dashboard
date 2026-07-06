import { useEffect, useState } from "react";
import { Activity, TrendingUp, Zap, Waves, TrendingDown } from "lucide-react";

const API_BASE = import.meta.env.VITE_API_BASE ?? "";

interface BotData {
  price: number;
  drop_1m: number; drop_5m: number; drop_15m: number; drop_1h: number; drop_4h: number;
  peak_1m: number; peak_5m: number; peak_15m: number; peak_1h: number; peak_4h: number;
  speed: number; volatility: number; status: string;
  trade_mode?: string; pause_reason?: string;
  whale_count?: number; whale_usd_total?: number; whale_buy_total?: number;
  whale_net_flow?: number; whale_net_flow_level?: string;
  consec_drops?: number; vol_spike?: boolean;
  funding_rate?: number; funding_level?: string;
  liq_usd_60s?: number; liq_level?: string; liq_largest?: number;
}

interface Snapshot { key: string; updatedAt: string | null; data: BotData | null; }

const MOCK_DATA: BotData = {
  price: 67432.18,
  drop_1m: 0.42, drop_5m: 1.18, drop_15m: 2.34, drop_1h: 3.12, drop_4h: 4.58,
  peak_1m: 67650.22, peak_5m: 68210.44, peak_15m: 68540.10, peak_1h: 69120.75, peak_4h: 70680.90,
  speed: -0.34, volatility: 2.87, status: "RISK",
  trade_mode: "Pause", pause_reason: "BTC 15 min drop: −2.34% · 4 consecutive down-minutes · volume spike on red candle",
  whale_count: 4, whale_usd_total: 8_420_000, whale_buy_total: 1_250_000,
  whale_net_flow: -7_170_000, whale_net_flow_level: "DANGER",
  consec_drops: 4, vol_spike: true,
  funding_rate: -0.00042, funding_level: "WATCH",
  liq_usd_60s: 12_400_000, liq_level: "DANGER", liq_largest: 3_200_000,
};
const MOCK_SNAPSHOT: Snapshot = { key: "btc", updatedAt: new Date().toISOString(), data: MOCK_DATA };
const USE_MOCK = true;

const STAGE_CONFIG: Record<string, { accent: string; ring: string; label: string; dot: string; sub: string }> = {
  SAFE:       { accent: "text-teal-300", ring: "ring-teal-400/30", dot: "bg-teal-400",           sub: "OK TO TRADE ALTS",       label: "SAFE" },
  WATCH:      { accent: "text-amber-300",   ring: "ring-amber-400/30",   dot: "bg-amber-400",             sub: "BE SELECTIVE",           label: "WATCH" },
  RISK:       { accent: "text-orange-300",  ring: "ring-orange-400/30",  dot: "bg-orange-400",            sub: "HOLD OFF NEW BUYS",      label: "RISK" },
  SELL_ALERT: { accent: "text-rose-300",    ring: "ring-rose-400/30",    dot: "bg-rose-400",              sub: "PAUSE BUYING",           label: "SELL ALERT" },
  DANGER:     { accent: "text-red-300",     ring: "ring-red-500/40",     dot: "bg-red-500 animate-pulse", sub: "CONSIDER SELLING",       label: "DANGER" },
};

const TIMEFRAMES: Array<{ label: string; dropKey: keyof BotData; peakKey: keyof BotData }> = [
  { label: "1m",  dropKey: "drop_1m",  peakKey: "peak_1m"  },
  { label: "5m",  dropKey: "drop_5m",  peakKey: "peak_5m"  },
  { label: "15m", dropKey: "drop_15m", peakKey: "peak_15m" },
  { label: "1h",  dropKey: "drop_1h",  peakKey: "peak_1h"  },
  { label: "4h",  dropKey: "drop_4h",  peakKey: "peak_4h"  },
];

const LEVEL_COLORS: Record<string, string> = {
  NORMAL: "text-teal-300",
  WATCH:  "text-amber-300",
  RISK:   "text-orange-300",
  DANGER: "text-red-300",
};
const LEVEL_RING: Record<string, string> = {
  NORMAL: "ring-teal-400/25 bg-teal-500/5",
  WATCH:  "ring-amber-400/25 bg-amber-500/5",
  RISK:   "ring-orange-400/25 bg-orange-500/5",
  DANGER: "ring-red-400/30 bg-red-500/5",
};

function dropColor(pct: number) {
  if (pct >= 4) return "text-red-300";
  if (pct >= 2) return "text-orange-300";
  if (pct >= 1) return "text-amber-300";
  return "text-teal-300";
}

function IntensityBar({ pct, inactive = false }: { pct: number; inactive?: boolean }) {
  const filled = inactive ? 0 : Math.round(Math.min(pct / 6.0, 1.0) * 12);
  const total = 12;
  const color =
    pct >= 4 ? "bg-red-400 shadow-[0_0_6px_theme(colors.red.400)]" :
    pct >= 2 ? "bg-orange-400 shadow-[0_0_6px_theme(colors.orange.400)]" :
    pct >= 1 ? "bg-amber-300 shadow-[0_0_6px_theme(colors.amber.300)]" :
               "bg-teal-400 shadow-[0_0_6px_theme(colors.teal.400)]";
  return (
    <div className="flex items-center gap-[3px]">
      {Array.from({ length: total }).map((_, i) => (
        <div
          key={i}
          className={`h-3 w-[3px] rounded-full transition-all ${
            i < filled ? color : inactive ? "bg-red-400/10" : "bg-white/[0.06]"
          }`}
        />
      ))}
    </div>
  );
}

function timeSince(iso: string) {
  const secs = Math.floor((Date.now() - new Date(iso).getTime()) / 1000);
  if (secs < 5) return "just now";
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
  const col = LEVEL_COLORS[level] ?? "text-teal-300";
  const ring = LEVEL_RING[level] ?? "ring-teal-400/25 bg-teal-500/5";
  return (
    <span className={`px-2 py-[3px] rounded-full ring-1 text-[9px] font-bold uppercase tracking-[0.15em] ${col} ${ring}`}>
      {level}
    </span>
  );
}

function BtcLogo() {
  return (
    <div className="relative h-11 w-11 shrink-0">
      <div className="absolute inset-0 rounded-full bg-gradient-to-br from-[var(--color-btc-orange)] to-[#b86d12] blur-md opacity-60" />
      <div className="relative flex h-11 w-11 items-center justify-center rounded-full bg-gradient-to-br from-[var(--color-btc-orange)] to-[#b86d12] ring-1 ring-white/20 shadow-lg">
        <svg viewBox="0 0 32 32" className="h-6 w-6 text-black/85" fill="currentColor" aria-hidden>
          <path d="M22.4 14.3c.3-2-1.2-3.1-3.3-3.8l.7-2.7-1.7-.4-.7 2.6c-.4-.1-.9-.2-1.4-.3l.7-2.7L15 6.6l-.7 2.7c-.4-.1-.7-.2-1.1-.2l-2.3-.6-.5 1.8s1.2.3 1.2.3c.7.2.8.6.8 1l-.8 3.1c.1 0 .1 0 .2.1h-.2l-1.1 4.3c-.1.2-.3.5-.8.4 0 0-1.2-.3-1.2-.3l-.9 1.9 2.2.6c.4.1.8.2 1.2.3l-.7 2.8 1.7.4.7-2.7c.5.1.9.2 1.4.3l-.7 2.7 1.7.4.7-2.8c2.9.6 5.2.3 6.1-2.3.8-2.1 0-3.3-1.5-4.1 1.1-.3 1.9-1 2.1-2.5zm-3.9 5.5c-.5 2.1-4.1 1-5.2.7l.9-3.6c1.1.3 4.9.9 4.3 2.9zm.5-5.5c-.5 1.9-3.4.9-4.4.7l.8-3.3c1 .2 4.1.7 3.6 2.6z"/>
        </svg>
      </div>
    </div>
  );
}

export function BtcCrashCard() {
  const [snapshot, setSnapshot] = useState<Snapshot | null>(null);
  const [age, setAge] = useState<string>("");
  const [livePrice, setLivePrice] = useState<number | null>(null);
  const [flash, setFlash] = useState<"up" | "down" | null>(null);

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
    if (!API_BASE && USE_MOCK) {
      setSnapshot({ ...MOCK_SNAPSHOT, updatedAt: new Date().toISOString() });
      return () => { alive = false; };
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

  const d = snapshot?.data;
  const stage = d?.status ?? "SAFE";
  const cfg = STAGE_CONFIG[stage] ?? STAGE_CONFIG.SAFE!;
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
    if (parts.length) return parts.join(" · ");
    return "BTC conditions are elevated — avoid new alt buys until signals normalize";
  })();

  const whaleCount = d?.whale_count ?? 0;
  const whaleUsdTotal = d?.whale_usd_total ?? 0;
  const whaleBuyTotal = d?.whale_buy_total ?? 0;
  const whaleNetFlow = d?.whale_net_flow ?? 0;
  const whaleNetFlowLvl = d?.whale_net_flow_level ?? "NORMAL";
  const consecDrops = d?.consec_drops ?? 0;
  const volSpike = d?.vol_spike ?? false;
  const fundingRate = d?.funding_rate ?? 0;
  const fundingLvl = d?.funding_level ?? "NORMAL";
  const liqUsd = d?.liq_usd_60s ?? 0;
  const liqLvl = d?.liq_level ?? "NORMAL";
  const liqLargest = d?.liq_largest ?? 0;

  const whaleCritical = whaleCount >= 3;
  const consecCritical = consecDrops >= 5;
  const netFlowNeg = whaleNetFlow < 0;
  const netFlowAbs = Math.abs(whaleNetFlow);

  return (
    <section
      className="glass-surface relative overflow-hidden rounded-[28px] p-6 md:p-7 font-[var(--font-display)] text-white/90"
      style={{ fontFamily: "var(--font-display)" }}
    >
      {/* animated grid + glow overlays */}
      <div className="pointer-events-none absolute inset-0 grid-bg opacity-40" />
      <div className="pointer-events-none absolute -top-24 -right-16 h-64 w-64 rounded-full bg-[var(--color-btc)]/20 blur-3xl" />
      <div className={`pointer-events-none absolute -bottom-24 -left-16 h-64 w-64 rounded-full blur-3xl opacity-40 ${
        stage === "DANGER" || stage === "SELL_ALERT" ? "bg-red-500/40" :
        stage === "RISK" ? "bg-orange-500/30" :
        stage === "WATCH" ? "bg-amber-500/25" : "bg-teal-500/25"
      }`} />
      <div className="pointer-events-none absolute inset-x-6 top-0 h-px bg-gradient-to-r from-transparent via-[var(--color-btc-glow)]/60 to-transparent" />

      <div className="relative flex flex-col gap-5">
        {/* HEADER */}
        <header className="flex items-center justify-between gap-3 flex-wrap">
          <div className="flex items-center gap-3">
            <BtcLogo />
            <div>
              <div className="flex items-center gap-2">
                <h3 className="text-[15px] font-bold tracking-tight">BTC Crash Monitor</h3>
                <span className="text-[10px] px-1.5 py-0.5 rounded-md bg-white/5 ring-1 ring-white/10 text-white/50 font-mono uppercase tracking-widest">Live</span>
              </div>
              <div className="mt-0.5 flex items-center gap-1.5 text-[11px] text-white/40">
                <span className={`h-1.5 w-1.5 rounded-full ${d ? cfg.dot : "bg-white/20"}`} />
                {d ? `updated ${age}` : "Waiting for bot data…"}
              </div>
            </div>
          </div>

          <div className={`group relative flex items-center gap-2.5 pl-3 pr-4 py-2 rounded-full ring-1 ${d ? cfg.ring : "ring-red-500/30"} bg-black/30 backdrop-blur`}>
            <span className={`relative flex h-2 w-2`}>
              <span className={`absolute inset-0 rounded-full ${d ? cfg.dot : "bg-red-500"} opacity-60 animate-ping`} />
              <span className={`relative inline-flex h-2 w-2 rounded-full ${d ? cfg.dot : "bg-red-500"}`} />
            </span>
            <div className="flex flex-col leading-none">
              <span className={`text-[11px] font-bold tracking-[0.2em] ${d ? cfg.accent : "text-red-300"}`}>
                {d ? cfg.label : "OFFLINE"}
              </span>
              <span className="text-[9px] text-white/40 mt-0.5 tracking-[0.15em]">
                {d ? cfg.sub : "BOT IS NOT ACTIVE"}
              </span>
            </div>
          </div>
        </header>

        {/* HERO PRICE */}
        <div className="relative rounded-2xl bg-gradient-to-br from-white/[0.04] to-white/[0.01] ring-1 ring-white/10 px-5 py-4 overflow-hidden">
          <div className="absolute inset-y-0 right-0 w-1/2 bg-gradient-to-l from-[var(--color-btc)]/10 to-transparent" />
          <div className="relative flex items-end justify-between">
            <div>
              <div className="flex items-center gap-1.5 text-[10px] uppercase tracking-[0.25em] font-semibold text-white/50">
                <Activity className="h-3 w-3" /> BTC / USDT
              </div>
              <div className="mt-2 flex items-baseline gap-2">
                <span
                  className={`font-mono text-4xl md:text-5xl font-extrabold tabular-nums tracking-tight transition-colors duration-300 ${
                    flash === "up" ? "text-[var(--color-btc-orange)]" :
                    flash === "down" ? "text-[var(--color-bear)]" : "text-[var(--color-btc-orange)]"
                  }`}
                  style={{ textShadow: "0 0 24px color-mix(in oklab, currentColor 40%, transparent)" }}
                >
                  {livePrice ? `$${fmtPrice(livePrice)}` : "—"}
                </span>
                <span className={`text-xs font-mono font-bold ${
                  flash === "up" ? "text-[var(--color-btc-orange)]" :
                  flash === "down" ? "text-[var(--color-bear)]" : "text-white/30"
                }`}>
                  {flash === "up" ? "▲" : flash === "down" ? "▼" : "●"}
                </span>
              </div>
            </div>
            <div className="hidden sm:flex flex-col items-end gap-1">
              <div className="text-[9px] uppercase tracking-[0.25em] text-white/40">Streaming</div>
              <div className="flex items-end gap-[2px] h-6">
                {[3,5,4,6,3,5,7,4,6,5].map((h,i) => (
                  <div key={i} className="w-[3px] rounded-sm bg-[var(--color-btc-glow)]/70 animate-pulse" style={{ height: `${h*3}px`, animationDelay: `${i*80}ms` }} />
                ))}
              </div>
            </div>
          </div>
        </div>

        {/* PAUSED BANNER */}
        {isPaused && (
          <div className="relative flex items-start gap-3 rounded-2xl ring-1 ring-amber-400/30 bg-gradient-to-r from-amber-500/10 via-amber-500/5 to-transparent px-4 py-3">
            <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-amber-400/15 ring-1 ring-amber-400/30 text-amber-300">⏸</div>
            <div className="min-w-0">
              <div className="text-[11px] font-bold text-amber-300 uppercase tracking-[0.2em]">Trading Paused</div>
              <div className="mt-1 text-[12px] leading-relaxed text-amber-100/70 break-words">{pauseReason}</div>
            </div>
          </div>
        )}

        {/* PEAK & DROPS */}
        <div className="rounded-2xl ring-1 ring-white/10 bg-black/20 overflow-hidden">
          <div className="flex items-center justify-between px-4 pt-3 pb-2 border-b border-white/5">
            <div className="flex items-center gap-2">
              <div className="h-6 w-6 rounded-lg bg-[var(--color-btc)]/15 ring-1 ring-[var(--color-btc)]/30 flex items-center justify-center">
                <TrendingUp className="h-3.5 w-3.5 text-[var(--color-btc-glow)]" />
              </div>
              <span className="text-[10px] uppercase tracking-[0.25em] font-bold text-white/60">Peak & Drawdown</span>
            </div>
            <span className="text-[9px] font-mono uppercase tracking-widest text-white/30">5 windows</span>
          </div>
          <div className="grid grid-cols-[44px_1fr_84px_88px] gap-x-3 px-4 py-2 text-[9px] uppercase tracking-[0.2em] font-semibold text-white/35">
            <span className="text-right">TF</span>
            <span>Peak</span>
            <span className="text-right">Drop</span>
            <span className="pl-1">Intensity</span>
          </div>
          <div className="divide-y divide-white/[0.04]">
            {TIMEFRAMES.map(({ label, dropKey, peakKey }) => {
              const pct = d ? (d[dropKey] as number) : 0;
              const peak = d ? (d[peakKey] as number) : null;
              const inactive = !d;
              return (
                <div key={label} className="grid grid-cols-[44px_1fr_84px_88px] gap-x-3 items-center px-4 py-2.5 hover:bg-white/[0.02] transition-colors">
                  <span className="text-[10px] font-mono font-bold text-white/40 text-right">{label}</span>
                  <span className={`text-[12px] font-mono font-semibold tabular-nums ${inactive ? "text-white/20" : "text-white/70"}`}>
                    {inactive ? "—" : `$${fmtPrice(peak ?? 0)}`}
                  </span>
                  <div className={`text-right text-[13px] font-mono font-bold tabular-nums ${inactive ? "text-white/20" : dropColor(pct)}`}>
                    {inactive ? "-.--%" : `−${pct.toFixed(2)}%`}
                  </div>
                  <div className="pl-1">
                    <IntensityBar pct={pct} inactive={inactive} />
                  </div>
                </div>
              );
            })}
          </div>
        </div>

        {/* SPEED / VOL */}
        <div className="grid grid-cols-2 gap-3">
          {[
            { icon: "⚡", label: "Speed · 10s", value: !d ? "—" : `${d.speed > 0 ? "+" : ""}${d.speed.toFixed(2)}%`,
              cls: !d ? "text-white/30" : d.speed > 0 ? "text-[var(--color-bull)]" : d.speed < 0 ? "text-[var(--color-bear)]" : "text-white/60" },
            { icon: "🌪", label: "Volatility · 10s", value: !d ? "0.00%" : `${d.volatility.toFixed(2)}%`,
              cls: !d ? "text-white/30" : d.volatility >= 4 ? "text-red-300" : d.volatility >= 2.5 ? "text-orange-300" : "text-teal-300" },
          ].map((m) => (
            <div key={m.label} className="relative rounded-2xl ring-1 ring-white/10 bg-gradient-to-br from-white/[0.04] to-transparent px-4 py-3 overflow-hidden">
              <div className="absolute -top-6 -right-6 h-16 w-16 rounded-full bg-white/[0.03] blur-xl" />
              <div className="text-[9px] uppercase tracking-[0.25em] font-semibold text-white/50">{m.icon} {m.label}</div>
              <div className={`mt-1.5 font-mono text-lg font-extrabold tabular-nums ${m.cls}`}>{m.value}</div>
            </div>
          ))}
        </div>

        {/* MARKET SIGNALS */}
        <div className="rounded-2xl ring-1 ring-white/10 bg-black/20 overflow-hidden">
          <div className="flex items-center justify-between px-4 pt-3 pb-2 border-b border-white/5">
            <div className="flex items-center gap-2">
              <div className="h-6 w-6 rounded-lg bg-[var(--color-btc)]/15 ring-1 ring-[var(--color-btc)]/30 flex items-center justify-center">
                <Zap className="h-3.5 w-3.5 text-[var(--color-btc-glow)]" />
              </div>
              <span className="text-[10px] uppercase tracking-[0.25em] font-bold text-white/60">Market Signals</span>
            </div>
            <span className="text-[9px] font-mono uppercase tracking-widest text-white/30">60s window</span>
          </div>

          <div className="divide-y divide-white/[0.04]">
            {/* Liquidations */}
            <div className="flex items-center justify-between px-4 py-3">
              <div className="flex items-center gap-3">
                <span className="text-base">💥</span>
                <div>
                  <div className="text-[10px] uppercase tracking-[0.2em] font-semibold text-white/45">Liquidations</div>
                  <div className={`mt-0.5 font-mono text-sm font-bold tabular-nums ${
                    !d ? "text-white/25" :
                    liqLvl === "DANGER" ? "text-red-300" :
                    liqLvl === "RISK" ? "text-orange-300" :
                    liqLvl === "WATCH" ? "text-amber-300" : "text-teal-300"
                  }`}>
                    {!d ? "—" : fmtLiq(liqUsd)}
                    {d && liqLargest > 0 && (
                      <span className="ml-2 text-[10px] font-semibold text-white/40">Lrg {fmtLiq(liqLargest)}</span>
                    )}
                  </div>
                </div>
              </div>
              {d ? <LevelBadge level={liqLvl} /> : <span className="text-white/25 text-xs">—</span>}
            </div>

            {/* Funding */}
            <div className="flex items-center justify-between px-4 py-3">
              <div className="flex items-center gap-3">
                <span className="text-base">💸</span>
                <div>
                  <div className="text-[10px] uppercase tracking-[0.2em] font-semibold text-white/45">Funding Rate</div>
                  <div className={`mt-0.5 font-mono text-sm font-bold tabular-nums ${
                    !d ? "text-white/25" :
                    fundingLvl === "DANGER" ? "text-red-300" :
                    fundingLvl === "RISK" ? "text-orange-300" :
                    fundingLvl === "WATCH" ? "text-amber-300" : "text-teal-300"
                  }`}>
                    {!d ? "—" : fmtFunding(fundingRate)}
                  </div>
                </div>
              </div>
              {d ? <LevelBadge level={fundingLvl} /> : <span className="text-white/25 text-xs">—</span>}
            </div>

            {/* Whales + bleed */}
            <div className="grid grid-cols-2 divide-x divide-white/[0.05]">
              <div className="px-4 py-3">
                <div className="flex items-center gap-1.5 text-[9px] uppercase tracking-[0.2em] font-semibold text-white/45">
                  🐋 <span>Whale Sells</span>
                </div>
                <div className={`mt-1 font-mono text-2xl font-extrabold tabular-nums ${
                  !d ? "text-white/25" :
                  whaleCritical ? "text-red-300" :
                  whaleCount >= 1 ? "text-orange-300" : "text-teal-300"
                }`}>{!d ? "—" : whaleCount}</div>
                {d && (
                  <div className={`text-[10px] font-mono font-semibold mt-0.5 tabular-nums ${
                    whaleCritical ? "text-red-300/70" :
                    whaleCount >= 1 ? "text-orange-300/70" : "text-teal-300/60"
                  }`}>{whaleUsdTotal > 0 ? fmtLiq(whaleUsdTotal) : "$0"}</div>
                )}
                {d && whaleCritical && <div className="mt-1 text-[9px] uppercase tracking-widest font-bold text-red-300/80">cluster alert</div>}
              </div>
              <div className="px-4 py-3">
                <div className="flex items-center gap-1.5 text-[9px] uppercase tracking-[0.2em] font-semibold text-white/45">
                  <TrendingDown className="h-3 w-3" /> Bleed Mins
                </div>
                <div className={`mt-1 font-mono text-2xl font-extrabold tabular-nums ${
                  !d ? "text-white/25" :
                  consecCritical ? "text-red-300" :
                  consecDrops >= 3 ? "text-orange-300" :
                  consecDrops >= 1 ? "text-amber-300" : "text-teal-300"
                }`}>{!d ? "—" : consecDrops}</div>
                {d && consecCritical && <div className="mt-1 text-[9px] uppercase tracking-widest font-bold text-red-300/80">slow bleed</div>}
              </div>
            </div>

            {/* Net whale flow */}
            <div className="px-4 py-3">
              <div className="flex items-center justify-between mb-2.5">
                <div className="flex items-center gap-1.5 text-[9px] uppercase tracking-[0.2em] font-semibold text-white/45">
                  🌊 <span>Net Whale Flow</span>
                </div>
                {d ? <LevelBadge level={whaleNetFlowLvl} /> : <span className="text-white/25 text-xs">—</span>}
              </div>
              <div className="grid grid-cols-3 gap-2">
                <div className="rounded-xl ring-1 ring-teal-400/20 bg-teal-500/[0.06] px-2.5 py-2 text-center">
                  <div className="text-[8px] uppercase tracking-[0.2em] font-bold text-teal-300/70">Buys</div>
                  <div className={`mt-1 font-mono text-[13px] font-bold tabular-nums ${!d ? "text-white/25" : "text-teal-300"}`}>
                    {!d ? "—" : fmtLiq(whaleBuyTotal)}
                  </div>
                </div>
                <div className="rounded-xl ring-1 ring-red-400/20 bg-red-500/[0.06] px-2.5 py-2 text-center">
                  <div className="text-[8px] uppercase tracking-[0.2em] font-bold text-red-300/70">Sells</div>
                  <div className={`mt-1 font-mono text-[13px] font-bold tabular-nums ${!d ? "text-white/25" : "text-red-300"}`}>
                    {!d ? "—" : fmtLiq(whaleUsdTotal)}
                  </div>
                </div>
                <div className={`rounded-xl ring-1 px-2.5 py-2 text-center ${
                  !d ? "ring-white/10 bg-white/[0.03]" :
                  whaleNetFlowLvl === "DANGER" ? "ring-red-400/30 bg-red-500/[0.08]" :
                  whaleNetFlowLvl === "WATCH" ? "ring-orange-400/30 bg-orange-500/[0.08]" :
                  netFlowNeg ? "ring-amber-400/30 bg-amber-500/[0.08]" :
                               "ring-teal-400/30 bg-teal-500/[0.08]"
                }`}>
                  <div className="text-[8px] uppercase tracking-[0.2em] font-bold text-white/50">Net</div>
                  <div className={`mt-1 font-mono text-[13px] font-bold tabular-nums flex items-center justify-center gap-1 ${
                    !d ? "text-white/25" :
                    whaleNetFlowLvl === "DANGER" ? "text-red-300" :
                    whaleNetFlowLvl === "WATCH" ? "text-orange-300" :
                    netFlowNeg ? "text-amber-300" : "text-teal-300"
                  }`}>
                    {!d ? "—" : (<><span>{netFlowNeg ? "▼" : "▲"}</span><span>{fmtLiq(netFlowAbs)}</span></>)}
                  </div>
                </div>
              </div>
            </div>

            {/* Vol spike */}
            <div className="flex items-center justify-between px-4 py-3">
              <div className="flex items-center gap-2.5">
                <Waves className="h-4 w-4 text-white/50" />
                <div className="text-[10px] uppercase tracking-[0.2em] font-semibold text-white/45">Vol Spike · Red Candle</div>
              </div>
              {!d ? (
                <span className="text-white/25 text-xs font-bold">—</span>
              ) : volSpike ? (
                <span className="flex items-center gap-1.5 px-2.5 py-1 rounded-full ring-1 ring-red-400/40 bg-red-500/10 text-red-300 text-[10px] font-bold uppercase tracking-[0.2em]">
                  <span className="h-1.5 w-1.5 rounded-full bg-red-400 animate-pulse" /> Spike 🔥
                </span>
              ) : (
                <span className="px-2.5 py-1 rounded-full ring-1 ring-teal-400/25 bg-teal-500/[0.06] text-teal-300 text-[10px] font-bold uppercase tracking-[0.2em]">
                  Normal
                </span>
              )}
            </div>
          </div>
        </div>
      </div>
    </section>
  );
}

export default BtcCrashCard;
