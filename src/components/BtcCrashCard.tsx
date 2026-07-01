import { useEffect, useState } from "react";
import { Activity, TrendingUp, Zap, Waves, DollarSign, TrendingDown, ArrowUpDown } from "lucide-react";
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
  pause_reason?: string;        // ← NEW: exact reason the bot paused trading
  // ── Market signals ──
  whale_count?: number;
  whale_usd_total?: number;   // total USD of whale sells in 60s
  whale_buy_total?: number;   // total USD of whale buys in 60s
  whale_net_flow?: number;    // net flow = buys - sells (negative = selling pressure)
  whale_net_flow_level?: string; // NORMAL / WATCH / DANGER
  consec_drops?: number;
  vol_spike?: boolean;
  funding_rate?: number;
  funding_level?: string;
  liq_usd_60s?: number;
  liq_level?: string;
  liq_largest?: number;       // largest single liquidation event in 60s
}

interface Snapshot {
  key: string;
  updatedAt: string | null;
  data: BotData | null;
}

const STAGE_CONFIG: Record<string, { bg: string; text: string; border: string; dot: string; glow: string; label: string }> = {
  SAFE:       { bg: "bg-emerald-500/10",  text: "text-emerald-400",  border: "border-emerald-500/30",  dot: "bg-emerald-400",           glow: "shadow-emerald-500/20", label: "🟢 SAFE — OK TO TRADE ALTS" },
  WATCH:      { bg: "bg-yellow-500/10",   text: "text-yellow-400",   border: "border-yellow-500/30",   dot: "bg-yellow-400",            glow: "shadow-yellow-500/20",  label: "🟡 WATCH — BE SELECTIVE" },
  RISK:       { bg: "bg-orange-500/10",   text: "text-orange-400",   border: "border-orange-500/30",   dot: "bg-orange-400",            glow: "shadow-orange-500/20",  label: "🟠 RISK — HOLD OFF NEW BUYS" },
  SELL_ALERT: { bg: "bg-red-500/10",      text: "text-red-400",      border: "border-red-500/30",      dot: "bg-red-400",               glow: "shadow-red-500/20",     label: "🔴 SELL ALERT — PAUSE BUYING" },
  DANGER:     { bg: "bg-red-600/15",      text: "text-red-400",      border: "border-red-600/40",      dot: "bg-red-500 animate-pulse", glow: "shadow-red-600/30",     label: "🚨 DANGER — CONSIDER SELLING" },
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
        <div key={`f${i}`} className={`h-2 w-[5px] rounded-[1px] ${color}`} />
      ))}
      {Array.from({ length: empty }).map((_, i) => (
        <div key={`e${i}`} className={`h-2 w-[5px] rounded-[1px] ${inactive ? "bg-red-400/25" : "bg-muted/50"}`} />
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

/** A mini pill badge for signal levels */
function LevelBadge({ level }: { level: string }) {
  const col = LEVEL_COLORS[level] ?? "text-emerald-400";
  const bg  = LEVEL_BG[level]    ?? "bg-emerald-500/10 border-emerald-500/30";
  return (
    <span className={`px-1.5 py-0.5 rounded-md border text-[9px] font-black uppercase tracking-widest ${col} ${bg}`}>
      {level}
    </span>
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

  // Pause reason: use bot-supplied reason if available, otherwise build one from signals
  const pauseReason: string = (() => {
    if (!d) return "";
    // 1. Prefer the explicit reason sent by the bot
    if (d.pause_reason && d.pause_reason.trim().length > 0) return d.pause_reason.trim();
    // 2. Derive a reason from the largest drop that crossed the threshold
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
    // 3. Generic fallback
    return "BTC conditions are elevated — avoid new alt buys until signals normalize";
  })();

  // Signal values
  const whaleCount    = d?.whale_count       ?? 0;
  const whaleUsdTotal = d?.whale_usd_total   ?? 0;
  const whaleBuyTotal = d?.whale_buy_total   ?? 0;
  const whaleNetFlow  = d?.whale_net_flow    ?? 0;
  const whaleNetFlowLvl = d?.whale_net_flow_level ?? "NORMAL";
  const consecDrops   = d?.consec_drops      ?? 0;
  const volSpike      = d?.vol_spike         ?? false;
  const fundingRate   = d?.funding_rate      ?? 0;
  const fundingLvl    = d?.funding_level     ?? "NORMAL";
  const liqUsd        = d?.liq_usd_60s       ?? 0;
  const liqLvl        = d?.liq_level         ?? "NORMAL";
  const liqLargest    = d?.liq_largest       ?? 0;

  const whaleCritical  = whaleCount >= 3;
  const consecCritical = consecDrops >= 5;

  // Net flow direction helpers
  const netFlowNeg     = whaleNetFlow < 0;
  const netFlowAbs     = Math.abs(whaleNetFlow);
  const netFlowStr     = (whaleNetFlow >= 0 ? "+" : "−") + fmtLiq(netFlowAbs);

  return (
    <section className={`rounded-2xl bg-card p-5 md:p-6 relative overflow-hidden flex flex-col gap-4`}>

      {/* top shimmer line */}
      <div className="pointer-events-none absolute inset-x-0 top-0 h-px bg-gradient-to-r from-transparent via-primary/50 to-transparent" />

      {/* ── HEADER ── */}
      <div className="flex items-center justify-between flex-wrap gap-3">
        <div className="flex items-center gap-3">
          <CoinIcon symbol="BTC" size={36} />
          <div>
            <div className="flex items-center gap-2">
              <h3 className="font-black text-base">BTC Crash Monitor</h3>
              <span className={`h-2 w-2 rounded-full ${d ? cfg.dot : "bg-muted-foreground/40"}`} />
            </div>
            <div className="text-[11px] text-muted-foreground mt-0.5">
              {d ? `updated ${age}` : "Waiting for bot data…"}
            </div>
          </div>
        </div>
        <div className={`flex items-center gap-2 px-3 py-1.5 rounded-lg border text-xs font-bold ${
          d ? `${cfg.bg} ${cfg.text} ${cfg.border}` : "bg-red-500/10 text-red-400 border-red-500/30"
        }`}>
          {d ? cfg.label : "BOT IS NOT ACTIVE"}
        </div>
      </div>

      {/* ── LIVE PRICE ── */}
      <div className={`relative rounded-xl px-4 py-3 flex items-center justify-between transition-all duration-300 bg-gradient-to-r from-primary/5 to-transparent ${
        flash === "up"   ? "bg-bull/10"  :
        flash === "down" ? "bg-bear/10"  :
        ""
      }`}>
        <span className="text-[10px] uppercase tracking-widest font-bold text-muted-foreground flex items-center gap-1.5">
          <Activity className="h-3 w-3" /> BTC Live Price
        </span>
        <span className={`text-3xl md:text-4xl font-black tabular-nums tracking-tight transition-colors duration-300 ${
          flash === "up"   ? "text-bull"  :
          flash === "down" ? "text-bear"  : ""
        }`} style={!flash ? { color: "#F7931A" } : {}}>
          {livePrice ? `$${fmtPrice(livePrice)}` : "…"}
        </span>
      </div>

      {/* ── TRADING PAUSED BANNER ── */}
      {isPaused && (
        <div className="flex items-start gap-2.5 rounded-xl border border-yellow-500/40 bg-yellow-500/10 px-4 py-3">
          <span className="text-lg mt-0.5">⏸</span>
          <div className="min-w-0">
            <div className="text-xs font-black text-yellow-400 uppercase tracking-widest">Trading Paused</div>
            <div className="text-[11px] text-yellow-400/80 mt-1 leading-relaxed break-words">
              {pauseReason}
            </div>
          </div>
        </div>
      )}

      {/* ── PEAK PRICES + DROP TABLE ── */}
      <div className="rounded-xl bg-muted/10 overflow-hidden">
        <div className="flex items-center gap-2 px-3 pt-3 pb-2 border-b border-border/50">
          <div className="flex items-center justify-center h-5 w-5 rounded-md bg-primary/15 border border-primary/20">
            <TrendingUp className="h-3 w-3 text-primary" />
          </div>
          <span className="text-[10px] uppercase tracking-widest font-black text-muted-foreground">Peak Prices & Drop</span>
        </div>
        <div className="grid grid-cols-[40px_1fr_80px_68px] gap-x-2 px-3 py-1.5 border-b border-border/40">
          <span className="text-[9px] uppercase tracking-widest text-muted-foreground/60 font-bold text-right">TF</span>
          <span className="text-[9px] uppercase tracking-widest text-muted-foreground/60 font-bold">Peak Price</span>
          <span className="text-[9px] uppercase tracking-widest text-muted-foreground/60 font-bold text-right">Drop</span>
          <span className="text-[9px] uppercase tracking-widest text-muted-foreground/60 font-bold pl-1">Bar</span>
        </div>
        <div className="divide-y divide-border/30">
          {TIMEFRAMES.map(({ label, dropKey, peakKey }) => {
            const pct      = d ? (d[dropKey] as number) : 0;
            const peak     = d ? (d[peakKey] as number) : null;
            const inactive = !d;
            return (
              <div key={label} className="grid grid-cols-[40px_1fr_80px_68px] gap-x-2 items-center px-3 py-2 hover:bg-muted/20 transition-colors">
                <span className="text-[10px] font-black text-muted-foreground text-right tabular-nums">{label}</span>
                <span className={`text-[11px] font-black tabular-nums ${inactive ? "text-muted-foreground/30" : "text-muted-foreground"}`}>
                  {inactive ? "—" : `$${fmtPrice(peak ?? 0)}`}
                </span>
                <div className={`text-right text-xs font-black tabular-nums ${inactive ? "text-red-400/50" : dropColor(pct)}`}>
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

      {/* ── SPEED & VOLATILITY ── */}
      <div className="grid grid-cols-2 gap-2">
        <div className="rounded-xl bg-muted/20 px-3 py-2.5">
          <div className="text-[9px] uppercase tracking-widest font-bold text-muted-foreground mb-1">⚡ Speed (10s)</div>
          <span className={`font-black tabular-nums text-sm ${
            !d             ? "text-red-400/60" :
            d.speed > 0    ? "text-emerald-400" :
            d.speed < 0    ? "text-red-400"     :
                             "text-muted-foreground"
          }`}>
            {!d ? "-0.00%" : `${d.speed > 0 ? "+" : ""}${d.speed.toFixed(2)}%`}
          </span>
        </div>
        <div className="rounded-xl bg-muted/20 px-3 py-2.5">
          <div className="text-[9px] uppercase tracking-widest font-bold text-muted-foreground mb-1">🌪 Vol (10s)</div>
          <span className={`font-black tabular-nums text-sm ${
            !d                    ? "text-red-400/60"  :
            d.volatility >= 4     ? "text-red-400"     :
            d.volatility >= 2.5   ? "text-orange-400"  :
                                    "text-emerald-400"
          }`}>
            {!d ? "0.00%" : `${d.volatility.toFixed(2)}%`}
          </span>
        </div>
      </div>

      {/* ── MARKET SIGNALS ── */}
      <div className="rounded-xl bg-muted/10 overflow-hidden">
        <div className="flex items-center gap-2 px-3 pt-3 pb-2 border-b border-border/50">
          <div className="flex items-center justify-center h-5 w-5 rounded-md bg-primary/15 border border-primary/20">
            <Zap className="h-3 w-3 text-primary" />
          </div>
          <span className="text-[10px] uppercase tracking-widest font-black text-muted-foreground">Market Signals</span>
        </div>

        <div className="divide-y divide-border/30">

          {/* ── Liquidations (total + largest) ── */}
          <div className="flex items-center justify-between px-3 py-2.5">
            <div className="flex items-center gap-2">
              <span className="text-sm">💥</span>
              <div>
                <div className="text-[10px] uppercase tracking-widest font-black text-muted-foreground">Liquidations (60s)</div>
                <div className={`text-sm font-black tabular-nums mt-0.5 ${
                  !d ? "text-muted-foreground/30" :
                  liqLvl === "DANGER" ? "text-red-400" :
                  liqLvl === "RISK"   ? "text-orange-400" :
                  liqLvl === "WATCH"  ? "text-yellow-400" :
                                        "text-emerald-400"
                }`}>
                  {!d ? "—" : fmtLiq(liqUsd)}
                  {d && liqLargest > 0 && (
                    <span className="ml-2 text-[10px] font-bold text-muted-foreground">
                      Lrg: {fmtLiq(liqLargest)}
                    </span>
                  )}
                </div>
              </div>
            </div>
            {d ? <LevelBadge level={liqLvl} /> : <span className="text-muted-foreground/30 text-xs">—</span>}
          </div>

          {/* ── Funding Rate ── */}
          <div className="flex items-center justify-between px-3 py-2.5">
            <div className="flex items-center gap-2">
              <span className="text-sm">💸</span>
              <div>
                <div className="text-[10px] uppercase tracking-widest font-black text-muted-foreground">Funding Rate</div>
                <div className={`text-sm font-black tabular-nums mt-0.5 ${
                  !d ? "text-muted-foreground/30" :
                  fundingLvl === "DANGER" ? "text-red-400" :
                  fundingLvl === "RISK"   ? "text-orange-400" :
                  fundingLvl === "WATCH"  ? "text-yellow-400" :
                                            "text-emerald-400"
                }`}>
                  {!d ? "—" : fmtFunding(fundingRate)}
                </div>
              </div>
            </div>
            {d ? <LevelBadge level={fundingLvl} /> : <span className="text-muted-foreground/30 text-xs">—</span>}
          </div>

          {/* ── Whale Sells + Consec Drops side by side ── */}
          <div className="grid grid-cols-2 divide-x divide-border/30">
            <div className="px-3 py-2.5">
              <div className="flex items-center gap-1.5 mb-1">
                <span className="text-xs">🐋</span>
                <div className="text-[9px] uppercase tracking-widest font-black text-muted-foreground">Whale Sells/60s</div>
              </div>
              <div className={`text-xl font-black tabular-nums ${
                !d ? "text-muted-foreground/30" :
                whaleCritical        ? "text-red-400" :
                whaleCount >= 1      ? "text-orange-400" :
                                       "text-emerald-400"
              }`}>
                {!d ? "—" : whaleCount}
              </div>
              {d && (
                <div className={`text-[10px] font-bold mt-0.5 tabular-nums ${
                  whaleCritical   ? "text-red-400/80" :
                  whaleCount >= 1 ? "text-orange-400/80" :
                                    "text-emerald-400/60"
                }`}>
                  {whaleUsdTotal > 0 ? fmtLiq(whaleUsdTotal) : "$0"}
                </div>
              )}
              {d && whaleCritical && (
                <div className="text-[9px] text-red-400/70 font-bold mt-0.5">cluster alert!</div>
              )}
            </div>
            <div className="px-3 py-2.5">
              <div className="flex items-center gap-1.5 mb-1">
                <TrendingDown className="h-3 w-3 text-muted-foreground" />
                <div className="text-[9px] uppercase tracking-widest font-black text-muted-foreground">Bleed Mins</div>
              </div>
              <div className={`text-xl font-black tabular-nums ${
                !d ? "text-muted-foreground/30" :
                consecCritical       ? "text-red-400" :
                consecDrops >= 3     ? "text-orange-400" :
                consecDrops >= 1     ? "text-yellow-400" :
                                       "text-emerald-400"
              }`}>
                {!d ? "—" : consecDrops}
              </div>
              {d && consecCritical && (
                <div className="text-[9px] text-red-400/70 font-bold mt-0.5">slow bleed!</div>
              )}
            </div>
          </div>

          {/* ── Net Whale Flow (B vs S vs Net) ── */}
          <div className="px-3 py-2.5">
            <div className="flex items-center justify-between mb-2">
              <div className="flex items-center gap-1.5">
                <span className="text-xs">🌊</span>
                <div className="text-[9px] uppercase tracking-widest font-black text-muted-foreground">Net Whale Flow (60s)</div>
              </div>
              {d ? <LevelBadge level={whaleNetFlowLvl} /> : <span className="text-muted-foreground/30 text-xs">—</span>}
            </div>
            <div className="grid grid-cols-3 gap-2">
              {/* Buys */}
              <div className="rounded-lg bg-emerald-500/10 border border-emerald-500/20 px-2 py-1.5 text-center">
                <div className="text-[8px] uppercase tracking-widest font-black text-emerald-400/70 mb-0.5">Buys</div>
                <div className={`text-xs font-black tabular-nums ${!d ? "text-muted-foreground/30" : "text-emerald-400"}`}>
                  {!d ? "—" : fmtLiq(whaleBuyTotal)}
                </div>
              </div>
              {/* Sells */}
              <div className="rounded-lg bg-red-500/10 border border-red-500/20 px-2 py-1.5 text-center">
                <div className="text-[8px] uppercase tracking-widest font-black text-red-400/70 mb-0.5">Sells</div>
                <div className={`text-xs font-black tabular-nums ${!d ? "text-muted-foreground/30" : "text-red-400"}`}>
                  {!d ? "—" : fmtLiq(whaleUsdTotal)}
                </div>
              </div>
              {/* Net */}
              <div className={`rounded-lg border px-2 py-1.5 text-center ${
                !d                          ? "bg-muted/20 border-border" :
                whaleNetFlowLvl === "DANGER" ? "bg-red-500/10 border-red-500/30" :
                whaleNetFlowLvl === "WATCH"  ? "bg-orange-500/10 border-orange-500/30" :
                netFlowNeg                   ? "bg-yellow-500/10 border-yellow-500/30" :
                                               "bg-emerald-500/10 border-emerald-500/30"
              }`}>
                <div className="text-[8px] uppercase tracking-widest font-black text-muted-foreground/70 mb-0.5">Net</div>
                <div className={`text-xs font-black tabular-nums flex items-center justify-center gap-0.5 ${
                  !d                          ? "text-muted-foreground/30" :
                  whaleNetFlowLvl === "DANGER" ? "text-red-400" :
                  whaleNetFlowLvl === "WATCH"  ? "text-orange-400" :
                  netFlowNeg                   ? "text-yellow-400" :
                                                 "text-emerald-400"
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
          <div className="flex items-center justify-between px-3 py-2.5">
            <div className="flex items-center gap-2">
              <Waves className="h-4 w-4 text-muted-foreground" />
              <div className="text-[10px] uppercase tracking-widest font-black text-muted-foreground">Vol Spike on Red Candle</div>
            </div>
            {!d ? (
              <span className="text-muted-foreground/30 text-xs font-black">—</span>
            ) : volSpike ? (
              <span className="flex items-center gap-1.5 px-2 py-1 rounded-lg bg-red-500/15 border border-red-500/30 text-red-400 text-[10px] font-black uppercase tracking-widest">
                <span className="h-1.5 w-1.5 rounded-full bg-red-400 animate-pulse" />
                SPIKE 🔥
              </span>
            ) : (
              <span className="px-2 py-1 rounded-lg bg-emerald-500/10 border border-emerald-500/30 text-emerald-400 text-[10px] font-black uppercase tracking-widest">
                Normal
              </span>
            )}
          </div>
        </div>
      </div>

    </section>
  );
}
