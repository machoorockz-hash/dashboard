import { useEffect, useState } from "react";
import { Activity, TrendingUp } from "lucide-react";
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

function dropColor(pct: number) {
  if (pct >= 4) return "text-red-400";
  if (pct >= 2) return "text-orange-400";
  if (pct >= 1) return "text-yellow-400";
  return "text-emerald-400";
}

function dropBg(pct: number) {
  if (pct >= 4) return "bg-red-500/10 border-red-500/20";
  if (pct >= 2) return "bg-orange-500/10 border-orange-500/20";
  if (pct >= 1) return "bg-yellow-500/10 border-yellow-500/20";
  return "bg-emerald-500/10 border-emerald-500/20";
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

export function BtcCrashCard() {
  const [snapshot, setSnapshot] = useState<Snapshot | null>(null);
  const [age, setAge]           = useState<string>("");
  const [livePrice, setLivePrice] = useState<number | null>(null);
  const [flash, setFlash]       = useState<"up" | "down" | null>(null);

  // Live BTC price via Binance WebSocket
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

  // Poll bot data every 3s
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

  return (
    <section className={`rounded-2xl border bg-card p-5 md:p-6 relative overflow-hidden flex flex-col gap-4 ${cfg.border}`}>

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
      <div className={`relative rounded-xl border px-4 py-3 flex items-center justify-between transition-all duration-300 bg-gradient-to-r from-primary/5 to-transparent ${
        flash === "up"   ? "border-bull/60 bg-bull/10"  :
        flash === "down" ? "border-bear/60 bg-bear/10"  :
        "border-border"
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
        <div className="flex items-center gap-2.5 rounded-xl border border-yellow-500/40 bg-yellow-500/10 px-4 py-3">
          <span className="text-lg">⏸</span>
          <div>
            <div className="text-xs font-black text-yellow-400 uppercase tracking-widest">Trading Paused</div>
            <div className="text-[11px] text-yellow-400/70 mt-0.5">
              BTC dropped ≥ 2.6% — avoid new alt buys until drop recovers below 2.3%
            </div>
          </div>
        </div>
      )}

      {/* ── PEAK PRICES + DROP TABLE ── */}
      <div className="rounded-xl border border-border bg-muted/10 overflow-hidden">

        {/* section header */}
        <div className="flex items-center gap-2 px-3 pt-3 pb-2 border-b border-border/50">
          <div className="flex items-center justify-center h-5 w-5 rounded-md bg-primary/15 border border-primary/20">
            <TrendingUp className="h-3 w-3 text-primary" />
          </div>
          <span className="text-[10px] uppercase tracking-widest font-black text-muted-foreground">Peak Prices & Drop</span>
        </div>

        {/* column headers */}
        <div className="grid grid-cols-[40px_1fr_80px_68px] gap-x-2 px-3 py-1.5 border-b border-border/40">
          <span className="text-[9px] uppercase tracking-widest text-muted-foreground/60 font-bold text-right">TF</span>
          <span className="text-[9px] uppercase tracking-widest text-muted-foreground/60 font-bold">Peak Price</span>
          <span className="text-[9px] uppercase tracking-widest text-muted-foreground/60 font-bold text-right">Drop</span>
          <span className="text-[9px] uppercase tracking-widest text-muted-foreground/60 font-bold pl-1">Bar</span>
        </div>

        {/* rows */}
        <div className="divide-y divide-border/30">
          {TIMEFRAMES.map(({ label, dropKey, peakKey }) => {
            const pct      = d ? (d[dropKey] as number) : 0;
            const peak     = d ? (d[peakKey] as number) : null;
            const inactive = !d;

            return (
              <div
                key={label}
                className="grid grid-cols-[40px_1fr_80px_68px] gap-x-2 items-center px-3 py-2 hover:bg-muted/20 transition-colors"
              >
                {/* timeframe label */}
                <span className="text-[10px] font-black text-muted-foreground text-right tabular-nums">
                  {label}
                </span>

                {/* peak price chip */}
                <div className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-md border text-[11px] font-black tabular-nums w-fit ${
                  inactive
                    ? "bg-muted/30 border-border text-muted-foreground/50"
                    : "bg-amber-500/10 border-amber-500/25 text-amber-400"
                }`}>
                  {inactive ? "—" : `$${fmtPrice(peak ?? 0)}`}
                </div>

                {/* drop % */}
                <div className={`text-right text-xs font-black tabular-nums ${inactive ? "text-red-400/50" : dropColor(pct)}`}>
                  {inactive ? "-.--%" : `-${pct.toFixed(2)}%`}
                </div>

                {/* intensity bar */}
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
        <div className="rounded-xl border border-border bg-muted/20 px-3 py-2.5">
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
        <div className="rounded-xl border border-border bg-muted/20 px-3 py-2.5">
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

      {/* ── STATUS BANNER ── */}
      <div className={`w-full text-center rounded-xl border py-3 font-black text-sm tracking-wide shadow-lg ${
        d ? `${cfg.bg} ${cfg.text} ${cfg.border} ${cfg.glow}` : "bg-red-500/10 text-red-400 border-red-500/30"
      }`}>
        {d ? cfg.label : "BOT IS NOT ACTIVE"}
      </div>
    </section>
  );
}
