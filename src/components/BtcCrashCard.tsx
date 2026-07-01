import { useEffect, useState } from "react";

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
  price: 58782.0,
  drop_1m: 0.42, drop_5m: 1.18, drop_15m: 2.34, drop_1h: 3.12, drop_4h: 4.58,
  peak_1m: 67650.22, peak_5m: 68210.44, peak_15m: 68540.10, peak_1h: 69120.75, peak_4h: 70680.90,
  speed: -0.34, volatility: 2.87, status: "RISK",
  trade_mode: "Pause", pause_reason: "BTC 15 min drop: \u22122.34% \u00b7 4 consecutive down-minutes \u00b7 volume spike on red candle",
  whale_count: 4, whale_usd_total: 8_420_000, whale_buy_total: 1_250_000,
  whale_net_flow: -7_170_000, whale_net_flow_level: "DANGER",
  consec_drops: 4, vol_spike: true,
  funding_rate: -0.00042, funding_level: "WATCH",
  liq_usd_60s: 12_400_000, liq_level: "DANGER", liq_largest: 3_200_000,
};
const MOCK_SNAPSHOT: Snapshot = { key: "btc", updatedAt: new Date().toISOString(), data: MOCK_DATA };
const USE_MOCK = true;

const STAGE_CONFIG: Record<string, { accent: string; border: string; label: string; dot: string; sub: string; badgeBg: string }> = {
  SAFE:       { accent: "text-teal-400",   border: "border-teal-500/40",   dot: "bg-teal-400",                    sub: "OK TO TRADE ALTS",  label: "SAFE",       badgeBg: "bg-teal-500/20 border-teal-400/50"   },
  WATCH:      { accent: "text-amber-400",  border: "border-amber-500/40",  dot: "bg-amber-400",                   sub: "BE SELECTIVE",      label: "WATCH",      badgeBg: "bg-amber-500/20 border-amber-400/50" },
  RISK:       { accent: "text-orange-400", border: "border-orange-500/40", dot: "bg-orange-400",                  sub: "HOLD OFF NEW BUYS", label: "RISK",       badgeBg: "bg-orange-500/20 border-orange-400/50"},
  SELL_ALERT: { accent: "text-rose-400",   border: "border-rose-500/40",   dot: "bg-rose-400",                    sub: "PAUSE BUYING",      label: "SELL ALERT", badgeBg: "bg-rose-500/20 border-rose-400/50"   },
  DANGER:     { accent: "text-red-400",    border: "border-red-500/40",    dot: "bg-red-500 animate-pulse",       sub: "CONSIDER SELLING",  label: "DANGER",     badgeBg: "bg-red-500/20 border-red-400/50"     },
};

const TIMEFRAMES: Array<{ label: string; dropKey: keyof BotData; peakKey: keyof BotData }> = [
  { label: "1m",  dropKey: "drop_1m",  peakKey: "peak_1m"  },
  { label: "5m",  dropKey: "drop_5m",  peakKey: "peak_5m"  },
  { label: "15m", dropKey: "drop_15m", peakKey: "peak_15m" },
  { label: "1h",  dropKey: "drop_1h",  peakKey: "peak_1h"  },
  { label: "4h",  dropKey: "drop_4h",  peakKey: "peak_4h"  },
];

const LEVEL_COLORS: Record<string, string> = {
  NORMAL: "text-teal-400",
  WATCH:  "text-amber-400",
  RISK:   "text-orange-400",
  DANGER: "text-red-400",
};
const LEVEL_BADGE: Record<string, string> = {
  NORMAL: "text-teal-400 bg-teal-500/15 border border-teal-500/40",
  WATCH:  "text-amber-400 bg-amber-500/15 border border-amber-500/40",
  RISK:   "text-orange-400 bg-orange-500/15 border border-orange-500/40",
  DANGER: "text-red-400 bg-red-500/15 border border-red-500/40",
};

function dropColor(pct: number) {
  if (pct >= 4) return "text-red-400";
  if (pct >= 2) return "text-orange-400";
  if (pct >= 1) return "text-amber-400";
  return "text-teal-400";
}

function IntensityBar({ pct, inactive = false }: { pct: number; inactive?: boolean }) {
  const filled = inactive ? 0 : Math.round(Math.min(pct / 6.0, 1.0) * 10);
  const total = 10;
  const color =
    pct >= 4 ? "bg-red-400" :
    pct >= 2 ? "bg-orange-400" :
    pct >= 1 ? "bg-amber-300" :
               "bg-teal-400";
  return (
    <div className="flex items-center gap-[2px]">
      {Array.from({ length: total }).map((_, i) => (
        <div
          key={i}
          className={`h-[14px] w-[4px] rounded-[2px] transition-all ${
            i < filled ? color : "bg-white/[0.07]"
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
  const cls = LEVEL_BADGE[level] ?? LEVEL_BADGE.NORMAL;
  return (
    <span className={`px-1.5 py-[2px] rounded text-[8px] font-bold uppercase tracking-[0.12em] ${cls}`}>
      {level}
    </span>
  );
}

function BtcLogo() {
  return (
    <div className="relative h-10 w-10 shrink-0">
      <div className="absolute inset-0 rounded-full bg-[#f7931a]/30 blur-md" />
      <div className="relative flex h-10 w-10 items-center justify-center rounded-full bg-gradient-to-br from-[#f7931a] to-[#b86d12] shadow-lg shadow-[#f7931a]/20">
        <svg viewBox="0 0 32 32" className="h-5.5 w-5.5 text-white/90" fill="currentColor" aria-hidden>
          <path d="M22.4 14.3c.3-2-1.2-3.1-3.3-3.8l.7-2.7-1.7-.4-.7 2.6c-.4-.1-.9-.2-1.4-.3l.7-2.7L15 6.6l-.7 2.7c-.4-.1-.7-.2-1.1-.2l-2.3-.6-.5 1.8s1.2.3 1.2.3c.7.2.8.6.8 1l-.8 3.1c.1 0 .1 0 .2.1h-.2l-1.1 4.3c-.1.2-.3.5-.8.4 0 0-1.2-.3-1.2-.3l-.9 1.9 2.2.6c.4.1.8.2 1.2.3l-.7 2.8 1.7.4.7-2.7c.5.1.9.2 1.4.3l-.7 2.7 1.7.4.7-2.8c2.9.6 5.2.3 6.1-2.3.8-2.1 0-3.3-1.5-4.1 1.1-.3 1.9-1 2.1-2.5zm-3.9 5.5c-.5 2.1-4.1 1-5.2.7l.9-3.6c1.1.3 4.9.9 4.3 2.9zm.5-5.5c-.5 1.9-3.4.9-4.4.7l.8-3.3c1 .2 4.4.8 3.6 2.6z"/>
        </svg>
      </div>
    </div>
  );
}

function PauseIcon() {
  return (
    <div className="relative h-12 w-12 shrink-0 flex items-center justify-center">
      {/* outer pulse ring */}
      <div className="absolute inset-0 rounded-full bg-[#f7931a]/20 animate-ping" style={{ animationDuration: "2s" }} />
      {/* mid ring */}
      <div className="absolute inset-[3px] rounded-full border border-[#f7931a]/40" />
      {/* main circle */}
      <div className="relative flex h-10 w-10 items-center justify-center rounded-full bg-gradient-to-br from-[#f7931a] to-[#b86d12] shadow-lg shadow-[#f7931a]/30">
        {/* pause bars */}
        <div className="flex items-center gap-[4px]">
          <div className="h-[14px] w-[3.5px] rounded-full bg-white/95" />
          <div className="h-[14px] w-[3.5px] rounded-full bg-white/95" />
        </div>
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
    if (worst.pct >= 1) parts.push(`BTC ${worst.label} drop: \u2212${worst.pct.toFixed(2)}%`);
    if ((d.consec_drops ?? 0) >= 3) parts.push(`${d.consec_drops} consecutive down-minutes`);
    if (d.vol_spike) parts.push("volume spike on red candle");
    if ((d.whale_count ?? 0) >= 3) parts.push(`${d.whale_count} whale sells in 60s`);
    if (d.liq_level === "DANGER") parts.push(`liquidations ${fmtLiq(d.liq_usd_60s ?? 0)}`);
    if (parts.length) return parts.join(" \u00b7 ");
    return "BTC conditions are elevated \u2014 avoid new alt buys until signals normalize";
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

  const netFlowNeg = whaleNetFlow < 0;
  const netFlowAbs = Math.abs(whaleNetFlow);
  const whaleCritical = whaleCount >= 3;

  return (
    <section
      className="relative overflow-hidden rounded-2xl font-[var(--font-display)] text-white"
      style={{
        background: "linear-gradient(160deg, #0d1117 0%, #0a0e14 60%, #080b0f 100%)",
        border: "1px solid rgba(255,255,255,0.07)",
        fontFamily: "var(--font-display)",
      }}
    >
      {/* subtle top-edge highlight */}
      <div className="pointer-events-none absolute inset-x-0 top-0 h-px bg-gradient-to-r from-transparent via-white/10 to-transparent" />

      <div className="relative flex flex-col">

        {/* ── HEADER ── */}
        <div className="flex items-center justify-between gap-3 px-5 py-4 border-b border-white/[0.06]">
          <div className="flex items-center gap-3">
            <BtcLogo />
            <div>
              <div className="flex items-center gap-2">
                <span className="text-[15px] font-bold tracking-tight text-white">BTC Crash Monitor</span>
                <span className="px-2 py-[2px] rounded border border-white/15 text-[9px] font-bold uppercase tracking-[0.18em] text-white/50 bg-white/[0.04]">
                  Live
                </span>
              </div>
              <div className="mt-[3px] flex items-center gap-1.5 text-[11px] text-white/35">
                <span className={`h-1.5 w-1.5 rounded-full ${d ? cfg.dot : "bg-white/20"}`} />
                {d ? `updated ${age}` : "Waiting for bot data\u2026"}
              </div>
            </div>
          </div>

          {/* Status badge */}
          <div className={`flex items-center gap-2 px-3.5 py-2 rounded-xl border ${d ? cfg.badgeBg : "bg-red-500/15 border-red-400/40"}`}>
            <span className={`relative flex h-2 w-2`}>
              <span className={`absolute inset-0 rounded-full ${d ? cfg.dot : "bg-red-500"} opacity-50 animate-ping`} />
              <span className={`relative inline-flex h-2 w-2 rounded-full ${d ? cfg.dot : "bg-red-500"}`} />
            </span>
            <div className="flex flex-col leading-none">
              <span className={`text-[11px] font-extrabold tracking-[0.18em] ${d ? cfg.accent : "text-red-400"}`}>
                {d ? cfg.label : "OFFLINE"}
              </span>
              <span className="text-[8px] text-white/40 mt-[3px] tracking-[0.14em] uppercase">
                {d ? cfg.sub : "BOT IS NOT ACTIVE"}
              </span>
            </div>
          </div>
        </div>

        {/* ── HERO PRICE + QUICK STATS ── */}
        <div className="px-5 pt-4 pb-4 border-b border-white/[0.06]">
          {/* Price row */}
          <div className="flex items-center gap-3 mb-3">
            <span
              className={`font-mono text-[42px] font-extrabold tabular-nums leading-none transition-colors duration-200 ${
                flash === "up" ? "text-teal-300" :
                flash === "down" ? "text-red-400" : "text-teal-400"
              }`}
              style={{ textShadow: flash ? "0 0 30px currentColor" : "0 0 20px rgba(45,212,191,0.3)" }}
            >
              {livePrice ? `$${fmtPrice(livePrice)}` : "\u2014"}
            </span>
            {/* Trend arrow */}
            {d && (
              <svg
                viewBox="0 0 24 24"
                className={`h-6 w-6 mt-1 ${flash === "down" ? "text-red-400 rotate-90" : "text-teal-400 -rotate-45"} transition-all`}
                fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"
              >
                <path d="M5 12h14M13 6l6 6-6 6" />
              </svg>
            )}
          </div>

          {/* Quick stats row */}
          <div className="grid grid-cols-4 gap-3">
            {[
              {
                label: "Speed",
                value: !d ? "\u2014" : `${d.speed > 0 ? "+" : ""}${d.speed.toFixed(2)}%/min`,
                cls: !d ? "text-white/30" : d.speed > 0 ? "text-teal-400" : d.speed < 0 ? "text-red-400" : "text-white/60",
              },
              {
                label: "Volatility",
                value: !d ? "0.00%" : `${d.volatility.toFixed(2)}%`,
                cls: !d ? "text-white/30" : d.volatility >= 4 ? "text-red-400" : d.volatility >= 2.5 ? "text-orange-400" : "text-teal-400",
              },
              {
                label: "Consec Drops",
                value: !d ? "\u2014" : String(d.consec_drops ?? 0),
                cls: !d ? "text-white/30" : (d.consec_drops ?? 0) >= 5 ? "text-red-400" : (d.consec_drops ?? 0) >= 3 ? "text-orange-400" : "text-white/70",
              },
              {
                label: "\u26a1 Vol Spike",
                value: !d ? "\u2014" : volSpike ? "YES" : "No",
                cls: !d ? "text-white/30" : volSpike ? "text-red-400 font-extrabold" : "text-white/50",
              },
            ].map((s) => (
              <div key={s.label}>
                <div className="text-[8px] uppercase tracking-[0.2em] font-semibold text-white/35 mb-0.5">{s.label}</div>
                <div className={`font-mono text-[13px] font-bold tabular-nums ${s.cls}`}>{s.value}</div>
              </div>
            ))}
          </div>
        </div>

        {/* ── PRESSURE / PEAK / DROP TABLE ── */}
        <div className="px-5 py-3 border-b border-white/[0.06]">
          {/* table header */}
          <div className="grid grid-cols-[36px_1fr_72px_72px] gap-x-3 mb-1.5">
            <span />
            <span className="text-[8px] uppercase tracking-[0.2em] font-semibold text-white/30">Pressure</span>
            <span className="text-[8px] uppercase tracking-[0.2em] font-semibold text-white/30 text-right">Peak</span>
            <span className="text-[8px] uppercase tracking-[0.2em] font-semibold text-white/30 text-right">Drop</span>
          </div>

          <div className="flex flex-col gap-[5px]">
            {TIMEFRAMES.map(({ label, dropKey, peakKey }) => {
              const pct = d ? (d[dropKey] as number) : 0;
              const peak = d ? (d[peakKey] as number) : null;
              return (
                <div key={label} className="grid grid-cols-[36px_1fr_72px_72px] gap-x-3 items-center">
                  <span className="text-[10px] font-mono font-bold text-white/40 text-right">{label}</span>
                  <IntensityBar pct={pct} inactive={!d} />
                  <span className="text-right font-mono text-[11px] font-semibold text-white/55 tabular-nums">
                    {!d ? "\u2014" : `$${peak ? Math.round(peak).toLocaleString() : "0"}`}
                  </span>
                  <span className={`text-right font-mono text-[13px] font-bold tabular-nums ${!d ? "text-white/20" : dropColor(pct)}`}>
                    {!d ? "-.--%" : `\u2212${pct.toFixed(2)}%`}
                  </span>
                </div>
              );
            })}
          </div>
        </div>

        {/* ── THREE SIGNAL CARDS ── */}
        <div className="grid grid-cols-3 divide-x divide-white/[0.06] border-b border-white/[0.06]">
          {/* Whale Sells */}
          <div className="px-4 py-3">
            <div className="flex items-center justify-between mb-1.5">
              <span className="text-[8px] uppercase tracking-[0.15em] font-bold text-white/40">\u2261 Whale Sells</span>
              {d ? <LevelBadge level={whaleCritical ? "DANGER" : whaleCount >= 1 ? "WATCH" : "NORMAL"} /> : null}
            </div>
            <div className={`font-mono text-[26px] font-extrabold tabular-nums leading-none ${
              !d ? "text-white/20" :
              whaleCritical ? "text-red-400" :
              whaleCount >= 1 ? "text-orange-400" : "text-teal-400"
            }`}>
              {!d ? "\u2014" : `${whaleCount} txn`}
            </div>
            {d && whaleUsdTotal > 0 && (
              <div className="mt-1 text-[10px] font-mono font-semibold text-white/35">
                {fmtLiq(whaleUsdTotal)} total
              </div>
            )}
          </div>

          {/* Funding */}
          <div className="px-4 py-3">
            <div className="flex items-center justify-between mb-1.5">
              <span className="text-[8px] uppercase tracking-[0.15em] font-bold text-white/40">\u223f Funding</span>
              {d ? <LevelBadge level={fundingLvl} /> : null}
            </div>
            <div className={`font-mono text-[22px] font-extrabold tabular-nums leading-none ${
              !d ? "text-white/20" :
              fundingLvl === "DANGER" ? "text-red-400" :
              fundingLvl === "RISK" ? "text-orange-400" :
              fundingLvl === "WATCH" ? "text-amber-400" : "text-teal-400"
            }`}>
              {!d ? "\u2014" : fmtFunding(fundingRate)}
            </div>
          </div>

          {/* Liquidations */}
          <div className="px-4 py-3">
            <div className="flex items-center justify-between mb-1.5">
              <span className="text-[8px] uppercase tracking-[0.15em] font-bold text-white/40">\u2261\u2261 Liquidations</span>
              {d ? <LevelBadge level={liqLvl} /> : null}
            </div>
            <div className={`font-mono text-[22px] font-extrabold tabular-nums leading-none ${
              !d ? "text-white/20" :
              liqLvl === "DANGER" ? "text-red-400" :
              liqLvl === "RISK" ? "text-orange-400" :
              liqLvl === "WATCH" ? "text-amber-400" : "text-teal-400"
            }`}>
              {!d ? "\u2014" : fmtLiq(liqUsd)}
            </div>
            {d && liqLargest > 0 && (
              <div className="mt-1 text-[10px] font-mono font-semibold text-white/35">
                largest {fmtLiq(liqLargest)}
              </div>
            )}
          </div>
        </div>

        {/* ── WHALE NET FLOW ── */}
        <div className="flex items-center justify-between px-5 py-3 border-b border-white/[0.06]">
          <div className="flex items-center gap-2 text-[9px] uppercase tracking-[0.18em] font-bold text-white/35">
            <svg viewBox="0 0 24 24" className="h-3.5 w-3.5" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <path d="M12 2C6.5 2 2 6.5 2 12s4.5 10 10 10 10-4.5 10-10S17.5 2 12 2" />
              <path d="M12 8v8M8 12l4-4 4 4" />
            </svg>
            Whale Net Flow
          </div>
          {!d ? (
            <span className="text-white/20 font-mono text-sm">\u2014</span>
          ) : (
            <div className="flex items-center gap-2">
              <span className={`font-mono text-[15px] font-extrabold tabular-nums ${
                whaleNetFlowLvl === "DANGER" ? "text-red-400" :
                whaleNetFlowLvl === "WATCH" ? "text-orange-400" :
                netFlowNeg ? "text-amber-400" : "text-teal-400"
              }`}>
                {netFlowNeg ? "\u2212" : "+"}{fmtLiq(netFlowAbs)}
              </span>
              <span className={`text-[9px] font-semibold uppercase tracking-[0.12em] ${
                netFlowNeg ? "text-red-400/60" : "text-teal-400/60"
              }`}>
                ({netFlowNeg ? "SELL pressure" : "BUY pressure"})
              </span>
            </div>
          )}
        </div>

        {/* ── PAUSED BANNER ── */}
        {isPaused && (
          <div
            className="flex items-start gap-4 px-5 py-4"
            style={{
              background: "linear-gradient(90deg, rgba(247,147,26,0.07) 0%, rgba(247,147,26,0.03) 60%, transparent 100%)",
              borderTop: "1px solid rgba(247,147,26,0.15)",
            }}
          >
            <PauseIcon />
            <div className="min-w-0 pt-0.5">
              <div className="flex items-center gap-2 mb-1">
                <span className="text-[11px] font-extrabold tracking-[0.2em] text-[#f7931a] uppercase">
                  Trading Paused
                </span>
                <span className="px-1.5 py-[2px] rounded border border-[#f7931a]/40 bg-[#f7931a]/10 text-[8px] font-bold uppercase tracking-[0.15em] text-[#f7931a]/80">
                  BOT HALTED
                </span>
              </div>
              <p className="text-[11px] leading-relaxed text-white/50 break-words">
                {pauseReason}
              </p>
            </div>
          </div>
        )}

      </div>
    </section>
  );
}

export default BtcCrashCard;
