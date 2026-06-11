import { useEffect, useState } from "react";
import { Activity } from "lucide-react";
import { CoinIcon } from "./CoinIcon";

interface BotData {
  price: number;
  drop_1m: number;
  drop_5m: number;
  drop_15m: number;
  drop_1h: number;
  drop_4h: number;
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

const STAGE_CONFIG: Record<string, { bg: string; text: string; border: string; dot: string; label: string }> = {
  SAFE:       { bg: "bg-emerald-500/10",  text: "text-emerald-400",  border: "border-emerald-500/30",  dot: "bg-emerald-400",           label: "🟢 SAFE — OK TO TRADE ALTS" },
  WATCH:      { bg: "bg-yellow-500/10",   text: "text-yellow-400",   border: "border-yellow-500/30",   dot: "bg-yellow-400",            label: "🟡 WATCH — BE SELECTIVE" },
  RISK:       { bg: "bg-orange-500/10",   text: "text-orange-400",   border: "border-orange-500/30",   dot: "bg-orange-400",            label: "🟠 RISK — HOLD OFF NEW BUYS" },
  SELL_ALERT: { bg: "bg-red-500/10",      text: "text-red-400",      border: "border-red-500/30",      dot: "bg-red-400",               label: "🔴 SELL ALERT — PAUSE BUYING" },
  DANGER:     { bg: "bg-red-600/15",      text: "text-red-400",      border: "border-red-600/40",      dot: "bg-red-500 animate-pulse", label: "🚨 DANGER — CONSIDER SELLING" },
};

const TIMEFRAMES = [
  { key: "drop_1m" as const,  label: "1m" },
  { key: "drop_5m" as const,  label: "5m" },
  { key: "drop_15m" as const, label: "15m" },
  { key: "drop_1h" as const,  label: "1h" },
  { key: "drop_4h" as const,  label: "4h" },
];

function dropColor(pct: number) {
  if (pct >= 4) return "text-red-400";
  if (pct >= 2) return "text-orange-400";
  if (pct >= 1) return "text-yellow-400";
  return "text-emerald-400";
}

function IntensityBar({ pct }: { pct: number }) {
  const filled = Math.round(Math.min(pct / 6.0, 1.0) * 10);
  const empty = 10 - filled;
  const color = pct >= 4 ? "bg-red-500" : pct >= 2 ? "bg-orange-500" : pct >= 1 ? "bg-yellow-400" : "bg-emerald-400";
  return (
    <div className="flex items-center gap-px">
      {Array.from({ length: filled }).map((_, i) => <div key={`f${i}`} className={`h-2.5 w-1.5 rounded-[1px] ${color}`} />)}
      {Array.from({ length: empty }).map((_, i) => <div key={`e${i}`} className="h-2.5 w-1.5 rounded-[1px] bg-muted/50" />)}
    </div>
  );
}

function timeSince(iso: string) {
  const secs = Math.floor((Date.now() - new Date(iso).getTime()) / 1000);
  if (secs < 5) return "just now";
  if (secs < 60) return `${secs}s ago`;
  return `${Math.floor(secs / 60)}m ${secs % 60}s ago`;
}

export function BtcCrashCard() {
  const [snapshot, setSnapshot] = useState<Snapshot | null>(null);
  const [age, setAge] = useState<string>("");
  const [livePrice, setLivePrice] = useState<number | null>(null);
  const [flash, setFlash] = useState<"up" | "down" | null>(null);

  // Live BTC price via WebSocket
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

  // Clear flash after 500ms
  useEffect(() => {
    if (!flash) return;
    const t = setTimeout(() => setFlash(null), 500);
    return () => clearTimeout(t);
  }, [flash]);

  // Bot data polling
  useEffect(() => {
    let alive = true;
    async function poll() {
      try {
        const res = await fetch("/api/bot/data?key=btc");
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

  const d = snapshot?.data;
  const stage = d?.status ?? "SAFE";
  const cfg = STAGE_CONFIG[stage] ?? STAGE_CONFIG["SAFE"]!;
  const isPaused = d?.trade_mode === "Pause";

  const fmtLive = (p: number) =>
    p.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 });

  return (
    <section className={`rounded-2xl border bg-card p-5 md:p-6 relative overflow-hidden ${cfg.border}`}>
      {/* top shimmer line */}
      <div className="pointer-events-none absolute inset-x-0 top-0 h-px bg-gradient-to-r from-transparent via-primary/50 to-transparent" />

      {/* header row */}
      <div className="relative flex items-center justify-between flex-wrap gap-3 mb-4">
        <div className="flex items-center gap-3">
          <CoinIcon symbol="BTC" size={36} />
          <div>
            <div className="flex items-center gap-2">
              <h3 className="font-black text-base">BTC Crash Monitor</h3>
              <span className={`h-2 w-2 rounded-full ${d ? cfg.dot : "bg-muted-foreground/40"}`} />
            </div>
            <div className="text-[11px] text-muted-foreground mt-0.5">
              {d ? (
                <><span>updated {age}</span></>
              ) : "Waiting for bot data…"}
            </div>
          </div>
        </div>
        {d && (
          <div className={`flex items-center gap-2 px-3 py-1.5 rounded-lg border text-xs font-bold ${cfg.bg} ${cfg.text} ${cfg.border}`}>
            {cfg.label}
          </div>
        )}
      </div>

      {/* ── LIVE PRICE DISPLAY ── */}
      <div className={`relative mb-4 rounded-xl border px-4 py-3 flex items-center justify-between transition-all duration-300 bg-gradient-to-r from-primary/5 to-transparent ${
        flash === "up"   ? "border-bull/60 bg-bull/10"  :
        flash === "down" ? "border-bear/60 bg-bear/10"  :
        "border-border"
      }`}>
        <span className="text-[10px] uppercase tracking-widest font-bold text-muted-foreground flex items-center gap-1.5">
          <Activity className="h-3 w-3" /> BTC Live Price
        </span>
        <span className={`text-3xl md:text-4xl font-black tabular-nums tracking-tight transition-colors duration-300 ${
          flash === "up"   ? "text-bull"  :
          flash === "down" ? "text-bear"  :
          ""
        }`} style={!flash ? { color: "#F7931A" } : {}}>
          {livePrice ? `$${fmtLive(livePrice)}` : "…"}
        </span>
      </div>

      {/* trade paused banner */}
      {isPaused && (
        <div className="mb-3 flex items-center gap-2.5 rounded-xl border border-yellow-500/40 bg-yellow-500/10 px-4 py-3">
          <span className="text-lg">⏸</span>
          <div>
            <div className="text-xs font-black text-yellow-400 uppercase tracking-widest">Trading Paused</div>
            <div className="text-[11px] text-yellow-400/70 mt-0.5">BTC dropped ≥ 2.6% — avoid new alt buys until drop recovers below 2.3%</div>
          </div>
        </div>
      )}

      {!d ? (
        <div className="py-8 text-center text-muted-foreground text-sm">
          <div className="mb-2 text-2xl">📡</div>
          Bot is offline. Run <code className="bg-muted/40 px-1.5 py-0.5 rounded text-xs font-mono">BTCCRASHBOT.py</code> to push live data.
        </div>
      ) : (
        <>
          <div className="rounded-xl border border-border bg-muted/20 p-3 mb-3">
            <div className="text-[10px] uppercase tracking-widest font-bold text-muted-foreground mb-2">Drop from Peak</div>
            <div className="space-y-1.5">
              {TIMEFRAMES.map(({ key, label }) => {
                const pct = d[key];
                return (
                  <div key={key} className="flex items-center gap-3 text-xs">
                    <span className="w-8 text-right text-muted-foreground font-bold tabular-nums">{label}</span>
                    <span className={`w-16 text-right font-black tabular-nums ${dropColor(pct)}`}>-{pct.toFixed(2)}%</span>
                    <IntensityBar pct={pct} />
                  </div>
                );
              })}
            </div>
          </div>
          <div className="grid grid-cols-2 gap-2 mb-3">
            <div className="rounded-xl border border-border bg-muted/20 px-3 py-2">
              <div className="text-[9px] uppercase tracking-widest font-bold text-muted-foreground mb-1">⚡ Speed (10s)</div>
              <span className={`font-black tabular-nums ${d.speed > 0 ? "text-emerald-400" : d.speed < 0 ? "text-red-400" : "text-muted-foreground"}`}>
                {d.speed > 0 ? "+" : ""}{d.speed.toFixed(2)}%
              </span>
            </div>
            <div className="rounded-xl border border-border bg-muted/20 px-3 py-2">
              <div className="text-[9px] uppercase tracking-widest font-bold text-muted-foreground mb-1">🌪 Vol (10s)</div>
              <span className={`font-black tabular-nums ${d.volatility >= 4 ? "text-red-400" : d.volatility >= 2.5 ? "text-orange-400" : "text-emerald-400"}`}>
                {d.volatility.toFixed(2)}%
              </span>
            </div>
          </div>
          <div className={`w-full text-center rounded-xl border py-3 font-black text-sm tracking-wide ${cfg.bg} ${cfg.text} ${cfg.border}`}>
            {cfg.label}
          </div>
        </>
      )}
    </section>
  );
}
