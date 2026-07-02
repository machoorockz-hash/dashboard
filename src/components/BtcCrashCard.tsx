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

const STAGE_CONFIG: Record<string, { accent: string; glow: string; ring: string; scanColor: string; label: string; short: string }> = {
  SAFE:       { accent: "#10b981", glow: "rgba(16,185,129,0.18)", ring: "rgba(16,185,129,0.35)", scanColor: "#10b981", label: "SAFE — OK TO TRADE ALTS",      short: "SAFE" },
  WATCH:      { accent: "#f59e0b", glow: "rgba(245,158,11,0.18)",  ring: "rgba(245,158,11,0.35)",  scanColor: "#f59e0b", label: "WATCH — BE SELECTIVE",           short: "WATCH" },
  RISK:       { accent: "#f97316", glow: "rgba(249,115,22,0.18)",  ring: "rgba(249,115,22,0.35)",  scanColor: "#f97316", label: "RISK — HOLD OFF NEW BUYS",       short: "RISK" },
  SELL_ALERT: { accent: "#ef4444", glow: "rgba(239,68,68,0.18)",   ring: "rgba(239,68,68,0.35)",   scanColor: "#ef4444", label: "SELL ALERT — PAUSE BUYING",      short: "ALERT" },
  DANGER:     { accent: "#dc2626", glow: "rgba(220,38,38,0.22)",   ring: "rgba(220,38,38,0.45)",   scanColor: "#dc2626", label: "DANGER — CONSIDER SELLING",      short: "DANGER" },
};

const TIMEFRAMES: Array<{ label: string; dropKey: keyof BotData; peakKey: keyof BotData }> = [
  { label: "1m",  dropKey: "drop_1m",  peakKey: "peak_1m"  },
  { label: "5m",  dropKey: "drop_5m",  peakKey: "peak_5m"  },
  { label: "15m", dropKey: "drop_15m", peakKey: "peak_15m" },
  { label: "1h",  dropKey: "drop_1h",  peakKey: "peak_1h"  },
  { label: "4h",  dropKey: "drop_4h",  peakKey: "peak_4h"  },
];

const LEVEL_COLORS: Record<string, string> = {
  NORMAL: "#10b981",
  WATCH:  "#f59e0b",
  RISK:   "#f97316",
  DANGER: "#ef4444",
};

function dropColor(pct: number): string {
  if (pct >= 4) return "#ef4444";
  if (pct >= 2) return "#f97316";
  if (pct >= 1) return "#f59e0b";
  return "#10b981";
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

/** Segmented bar — futuristic HUD style */
function SegBar({ pct, inactive = false }: { pct: number; inactive?: boolean }) {
  const filled  = inactive ? 0 : Math.round(Math.min(pct / 6.0, 1.0) * 12);
  const empty   = 12 - filled;
  const color   =
    pct >= 4 ? "#ef4444" :
    pct >= 2 ? "#f97316" :
    pct >= 1 ? "#f59e0b" :
               "#10b981";
  return (
    <div style={{ display: "flex", alignItems: "center", gap: "2px" }}>
      {Array.from({ length: filled }).map((_, i) => (
        <div
          key={`f${i}`}
          style={{
            width: "4px", height: "10px", borderRadius: "1px",
            background: color,
            boxShadow: `0 0 4px ${color}80`,
          }}
        />
      ))}
      {Array.from({ length: empty }).map((_, i) => (
        <div
          key={`e${i}`}
          style={{
            width: "4px", height: "10px", borderRadius: "1px",
            background: inactive ? "rgba(239,68,68,0.12)" : "rgba(255,255,255,0.06)",
          }}
        />
      ))}
    </div>
  );
}

/** Level chip */
function LevelChip({ level }: { level: string }) {
  const color = LEVEL_COLORS[level] ?? "#10b981";
  return (
    <span style={{
      padding: "2px 7px",
      borderRadius: "4px",
      border: `1px solid ${color}50`,
      background: `${color}14`,
      color,
      fontSize: "9px",
      fontWeight: 900,
      letterSpacing: "0.1em",
      textTransform: "uppercase",
    }}>
      {level}
    </span>
  );
}

/** HUD section header */
function SectionHeader({ icon, label }: { icon: React.ReactNode; label: string }) {
  return (
    <div style={{
      display: "flex", alignItems: "center", gap: "8px",
      padding: "8px 14px",
      borderBottom: "1px solid rgba(255,255,255,0.05)",
      background: "rgba(255,255,255,0.02)",
    }}>
      <div style={{
        display: "flex", alignItems: "center", justifyContent: "center",
        width: "20px", height: "20px", borderRadius: "5px",
        background: "rgba(255,255,255,0.06)",
        border: "1px solid rgba(255,255,255,0.08)",
        color: "rgba(255,255,255,0.5)",
      }}>
        {icon}
      </div>
      <span style={{
        fontSize: "9px", fontWeight: 900, letterSpacing: "0.14em",
        textTransform: "uppercase", color: "rgba(255,255,255,0.35)",
      }}>
        {label}
      </span>
    </div>
  );
}

/** Metric cell used in the 2-col grid */
function MetricCell({
  label, value, sub, color, pulse, alert,
}: {
  label: string;
  value: React.ReactNode;
  sub?: React.ReactNode;
  color?: string;
  pulse?: boolean;
  alert?: string;
}) {
  return (
    <div style={{
      padding: "12px 14px",
      display: "flex", flexDirection: "column", gap: "4px",
    }}>
      <span style={{ fontSize: "9px", fontWeight: 700, letterSpacing: "0.1em", textTransform: "uppercase", color: "rgba(255,255,255,0.3)" }}>
        {label}
      </span>
      <span style={{
        fontSize: "22px", fontWeight: 900, lineHeight: 1, fontVariantNumeric: "tabular-nums",
        color: color ?? "rgba(255,255,255,0.85)",
        ...(pulse ? { animation: "btc-pulse 1.6s ease-in-out infinite" } : {}),
      }}>
        {value}
      </span>
      {sub && (
        <span style={{ fontSize: "10px", fontWeight: 600, color: "rgba(255,255,255,0.3)", fontVariantNumeric: "tabular-nums" }}>
          {sub}
        </span>
      )}
      {alert && (
        <span style={{ fontSize: "9px", fontWeight: 700, color, letterSpacing: "0.06em" }}>
          {alert}
        </span>
      )}
    </div>
  );
}

export function BtcCrashCard() {
  const [snapshot, setSnapshot]     = useState<Snapshot | null>(null);
  const [age, setAge]               = useState<string>("");
  const [livePrice, setLivePrice]   = useState<number | null>(null);
  const [flash, setFlash]           = useState<"up" | "down" | null>(null);

  /* ── Binance live price WebSocket ── */
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

  /* ── Bot data polling ── */
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

  /* ── Derived values ── */
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
  const whaleNetFlow    = d?.whale_net_flow      ?? 0;
  const whaleNetFlowLvl = d?.whale_net_flow_level ?? "NORMAL";
  const consecDrops     = d?.consec_drops        ?? 0;
  const volSpike        = d?.vol_spike           ?? false;
  const fundingRate     = d?.funding_rate        ?? 0;
  const fundingLvl      = d?.funding_level       ?? "NORMAL";
  const liqUsd          = d?.liq_usd_60s         ?? 0;
  const liqLvl          = d?.liq_level           ?? "NORMAL";
  const liqLargest      = d?.liq_largest         ?? 0;

  const whaleCritical   = whaleCount >= 3;
  const consecCritical  = consecDrops >= 5;
  const netFlowNeg      = whaleNetFlow < 0;
  const netFlowAbs      = Math.abs(whaleNetFlow);
  const netFlowStr      = (whaleNetFlow >= 0 ? "+" : "−") + fmtLiq(netFlowAbs);

  const flashBg =
    flash === "up"   ? "rgba(16,185,129,0.10)" :
    flash === "down" ? "rgba(239,68,68,0.10)"  :
    "transparent";
  const flashBorder =
    flash === "up"   ? "rgba(16,185,129,0.55)" :
    flash === "down" ? "rgba(239,68,68,0.55)"  :
    "rgba(255,255,255,0.07)";
  const priceColor =
    flash === "up"   ? "#10b981" :
    flash === "down" ? "#ef4444" :
    "#F7931A";

  return (
    <>
      <style>{`
        @keyframes btc-pulse {
          0%, 100% { opacity: 1; }
          50% { opacity: 0.65; }
        }
        @keyframes btc-scan {
          0%   { transform: translateY(-100%); opacity: 0; }
          10%  { opacity: 0.6; }
          90%  { opacity: 0.6; }
          100% { transform: translateY(900%); opacity: 0; }
        }
        @keyframes btc-shimmer {
          0%   { transform: translateX(-100%); }
          100% { transform: translateX(100%); }
        }
        @keyframes btc-dot-blink {
          0%, 100% { opacity: 1; }
          50% { opacity: 0.2; }
        }
        @keyframes btc-status-glow {
          0%, 100% { box-shadow: 0 0 10px 2px var(--btc-glow), inset 0 0 12px 0 var(--btc-glow); }
          50%       { box-shadow: 0 0 22px 6px var(--btc-glow), inset 0 0 20px 0 var(--btc-glow); }
        }
      `}</style>

      <section
        style={{
          position: "relative",
          borderRadius: "20px",
          overflow: "hidden",
          background: "linear-gradient(160deg, rgba(8,20,36,0.92) 0%, rgba(5,14,28,0.97) 100%)",
          backdropFilter: "blur(28px) saturate(160%)",
          WebkitBackdropFilter: "blur(28px) saturate(160%)",
          border: `1px solid ${cfg.ring}`,
          boxShadow: `0 0 0 1px rgba(255,255,255,0.04) inset, 0 2px 60px -20px ${cfg.glow}, 0 0 80px -40px ${cfg.glow}`,
          display: "flex",
          flexDirection: "column",
        }}
      >
        {/* ── Scan line ── */}
        <div
          aria-hidden
          style={{
            position: "absolute", inset: 0, pointerEvents: "none", zIndex: 0,
            overflow: "hidden",
          }}
        >
          <div style={{
            position: "absolute", left: 0, right: 0, height: "2px",
            background: `linear-gradient(90deg, transparent, ${cfg.accent}60, transparent)`,
            animation: "btc-scan 5s ease-in-out infinite",
          }} />
        </div>

        {/* ── Top shimmer line ── */}
        <div
          aria-hidden
          style={{
            position: "absolute", inset: "0 0 auto", height: "1px",
            background: `linear-gradient(90deg, transparent, ${cfg.accent}80, transparent)`,
            pointerEvents: "none", zIndex: 1,
          }}
        />

        {/* ─────────────────────────────────────────────────────
            HEADER
        ───────────────────────────────────────────────────── */}
        <div style={{
          position: "relative", zIndex: 2,
          display: "flex", alignItems: "center", justifyContent: "space-between",
          flexWrap: "wrap", gap: "12px",
          padding: "16px 18px 14px",
          borderBottom: "1px solid rgba(255,255,255,0.04)",
        }}>
          {/* Left: icon + title */}
          <div style={{ display: "flex", alignItems: "center", gap: "12px" }}>
            <div style={{ position: "relative", flexShrink: 0 }}>
              <CoinIcon symbol="BTC" size={40} />
              <span style={{
                position: "absolute", inset: "-3px", borderRadius: "50%",
                border: `1.5px solid ${cfg.accent}55`,
                animation: "btc-status-glow 2.5s ease-in-out infinite",
                // @ts-ignore
                "--btc-glow": cfg.glow,
              } as React.CSSProperties} />
            </div>
            <div>
              <div style={{ display: "flex", alignItems: "center", gap: "8px" }}>
                <h3 style={{ fontSize: "15px", fontWeight: 900, letterSpacing: "-0.02em", color: "#f0f4f8", margin: 0 }}>
                  BTC Crash Monitor
                </h3>
                <span style={{
                  width: "7px", height: "7px", borderRadius: "50%",
                  background: d ? cfg.accent : "rgba(255,255,255,0.18)",
                  boxShadow: d ? `0 0 6px ${cfg.accent}` : "none",
                  animation: d ? "btc-dot-blink 2s ease-in-out infinite" : "none",
                  flexShrink: 0,
                }} />
              </div>
              <div style={{ fontSize: "10px", color: "rgba(255,255,255,0.28)", marginTop: "2px", fontWeight: 500 }}>
                {d ? `synced ${age}` : "Waiting for bot data…"}
              </div>
            </div>
          </div>

          {/* Right: status badge */}
          <div style={{
            padding: "6px 14px",
            borderRadius: "8px",
            background: d ? `${cfg.accent}18` : "rgba(239,68,68,0.12)",
            border: `1px solid ${d ? cfg.ring : "rgba(239,68,68,0.35)"}`,
            boxShadow: d ? `0 0 14px -4px ${cfg.glow}` : "none",
            color: d ? cfg.accent : "#ef4444",
            fontSize: "10px", fontWeight: 900, letterSpacing: "0.1em",
            textTransform: "uppercase",
            display: "flex", alignItems: "center", gap: "6px",
          }}>
            <span style={{
              width: "6px", height: "6px", borderRadius: "50%",
              background: d ? cfg.accent : "#ef4444",
              boxShadow: d ? `0 0 5px ${cfg.accent}` : "none",
              animation: "btc-dot-blink 1.2s ease-in-out infinite",
            }} />
            {d ? cfg.label : "BOT IS NOT ACTIVE"}
          </div>
        </div>

        {/* ─────────────────────────────────────────────────────
            LIVE PRICE HERO
        ───────────────────────────────────────────────────── */}
        <div style={{
          position: "relative", zIndex: 2,
          margin: "14px 18px",
          borderRadius: "14px",
          border: `1px solid ${flashBorder}`,
          background: flashBg,
          transition: "border-color 0.25s ease, background 0.25s ease",
          padding: "14px 18px",
          display: "flex", alignItems: "center", justifyContent: "space-between",
          overflow: "hidden",
        }}>
          {/* Shimmer overlay */}
          <div style={{
            position: "absolute", inset: 0, pointerEvents: "none",
            background: "linear-gradient(90deg, transparent, rgba(255,255,255,0.025), transparent)",
            animation: "btc-shimmer 3.5s ease-in-out infinite",
          }} />
          <div style={{ display: "flex", alignItems: "center", gap: "8px" }}>
            <Activity style={{ width: "13px", height: "13px", color: "rgba(255,255,255,0.3)" }} />
            <span style={{ fontSize: "9px", fontWeight: 700, letterSpacing: "0.14em", textTransform: "uppercase", color: "rgba(255,255,255,0.3)" }}>
              BTC / USDT · Live
            </span>
          </div>
          <span style={{
            fontSize: "36px", fontWeight: 900, lineHeight: 1,
            fontVariantNumeric: "tabular-nums", letterSpacing: "-0.03em",
            color: priceColor,
            transition: "color 0.25s ease",
            textShadow: `0 0 24px ${priceColor}50`,
          }}>
            {livePrice ? `$${fmtPrice(livePrice)}` : "—"}
          </span>
        </div>

        {/* ─────────────────────────────────────────────────────
            TRADING PAUSED BANNER
        ───────────────────────────────────────────────────── */}
        {isPaused && (
          <div style={{
            margin: "0 18px 14px",
            borderRadius: "12px",
            border: "1px solid rgba(245,158,11,0.35)",
            background: "rgba(245,158,11,0.08)",
            padding: "12px 14px",
            display: "flex", alignItems: "flex-start", gap: "10px",
          }}>
            <span style={{ fontSize: "18px", lineHeight: 1, marginTop: "1px" }}>⏸</span>
            <div>
              <div style={{ fontSize: "10px", fontWeight: 900, color: "#f59e0b", letterSpacing: "0.1em", textTransform: "uppercase" }}>
                Trading Paused
              </div>
              <div style={{ fontSize: "11px", color: "rgba(245,158,11,0.75)", marginTop: "4px", lineHeight: 1.5 }}>
                {pauseReason}
              </div>
            </div>
          </div>
        )}

        {/* ─────────────────────────────────────────────────────
            SPEED + VOLATILITY — side by side hero metrics
        ───────────────────────────────────────────────────── */}
        <div style={{
          display: "grid", gridTemplateColumns: "1fr 1fr",
          gap: "1px",
          margin: "0 18px 14px",
          borderRadius: "14px",
          overflow: "hidden",
          border: "1px solid rgba(255,255,255,0.07)",
          background: "rgba(255,255,255,0.03)",
        }}>
          {/* Speed */}
          <div style={{ padding: "14px 16px", background: "rgba(0,0,0,0.2)" }}>
            <div style={{ fontSize: "9px", fontWeight: 700, letterSpacing: "0.12em", textTransform: "uppercase", color: "rgba(255,255,255,0.28)", marginBottom: "6px", display: "flex", alignItems: "center", gap: "5px" }}>
              <Zap style={{ width: "10px", height: "10px" }} /> Speed · 10s
            </div>
            <div style={{
              fontSize: "26px", fontWeight: 900, fontVariantNumeric: "tabular-nums", lineHeight: 1,
              color: !d ? "rgba(239,68,68,0.5)" : d.speed > 0 ? "#10b981" : d.speed < 0 ? "#ef4444" : "rgba(255,255,255,0.5)",
              textShadow: !d ? "none" : d.speed > 0 ? "0 0 12px rgba(16,185,129,0.4)" : d.speed < 0 ? "0 0 12px rgba(239,68,68,0.4)" : "none",
            }}>
              {!d ? "-0.00%" : `${d.speed > 0 ? "+" : ""}${d.speed.toFixed(2)}%`}
            </div>
          </div>
          {/* Volatility */}
          <div style={{ padding: "14px 16px", background: "rgba(0,0,0,0.2)", borderLeft: "1px solid rgba(255,255,255,0.05)" }}>
            <div style={{ fontSize: "9px", fontWeight: 700, letterSpacing: "0.12em", textTransform: "uppercase", color: "rgba(255,255,255,0.28)", marginBottom: "6px", display: "flex", alignItems: "center", gap: "5px" }}>
              <Waves style={{ width: "10px", height: "10px" }} /> Volatility · 10s
            </div>
            <div style={{
              fontSize: "26px", fontWeight: 900, fontVariantNumeric: "tabular-nums", lineHeight: 1,
              color: !d ? "rgba(239,68,68,0.5)" : d.volatility >= 4 ? "#ef4444" : d.volatility >= 2.5 ? "#f97316" : "#10b981",
              textShadow: !d ? "none" : d.volatility >= 4 ? "0 0 12px rgba(239,68,68,0.4)" : d.volatility >= 2.5 ? "0 0 12px rgba(249,115,22,0.4)" : "0 0 12px rgba(16,185,129,0.3)",
            }}>
              {!d ? "0.00%" : `${d.volatility.toFixed(2)}%`}
            </div>
          </div>
        </div>

        {/* ─────────────────────────────────────────────────────
            PEAK PRICES & DROP TABLE
        ───────────────────────────────────────────────────── */}
        <div style={{
          margin: "0 18px 14px",
          borderRadius: "14px",
          overflow: "hidden",
          border: "1px solid rgba(255,255,255,0.06)",
          background: "rgba(0,0,0,0.18)",
        }}>
          <SectionHeader icon={<TrendingUp style={{ width: "11px", height: "11px" }} />} label="Peak Prices & Drop" />

          {/* Column headers */}
          <div style={{
            display: "grid", gridTemplateColumns: "38px 1fr 70px 58px",
            padding: "6px 14px",
            borderBottom: "1px solid rgba(255,255,255,0.04)",
          }}>
            {["TF", "Peak", "Drop", "Bar"].map((h, i) => (
              <span key={h} style={{
                fontSize: "8px", fontWeight: 700, letterSpacing: "0.12em",
                textTransform: "uppercase", color: "rgba(255,255,255,0.2)",
                textAlign: i === 0 ? "right" : i === 2 ? "right" : "left",
              }}>
                {h}
              </span>
            ))}
          </div>

          {/* Rows */}
          {TIMEFRAMES.map(({ label, dropKey, peakKey }, idx) => {
            const pct      = d ? (d[dropKey] as number) : 0;
            const peak     = d ? (d[peakKey] as number) : null;
            const inactive = !d;
            const col      = inactive ? "rgba(255,255,255,0.15)" : dropColor(pct);
            const isLast   = idx === TIMEFRAMES.length - 1;
            return (
              <div
                key={label}
                style={{
                  display: "grid", gridTemplateColumns: "38px 1fr 70px 58px",
                  alignItems: "center",
                  padding: "9px 14px",
                  borderBottom: isLast ? "none" : "1px solid rgba(255,255,255,0.03)",
                  transition: "background 0.15s ease",
                }}
                onMouseEnter={(e) => (e.currentTarget.style.background = "rgba(255,255,255,0.025)")}
                onMouseLeave={(e) => (e.currentTarget.style.background = "transparent")}
              >
                <span style={{ fontSize: "10px", fontWeight: 800, color: "rgba(255,255,255,0.4)", textAlign: "right", fontVariantNumeric: "tabular-nums" }}>
                  {label}
                </span>
                <span style={{ fontSize: "11px", fontWeight: 700, color: inactive ? "rgba(255,255,255,0.15)" : "rgba(255,255,255,0.55)", fontVariantNumeric: "tabular-nums", paddingLeft: "8px" }}>
                  {inactive ? "—" : `$${fmtPrice(peak ?? 0)}`}
                </span>
                <div style={{ textAlign: "right", fontSize: "11px", fontWeight: 900, fontVariantNumeric: "tabular-nums", color: col, textShadow: inactive ? "none" : `0 0 8px ${col}60` }}>
                  {inactive ? "-.--%" : `-${pct.toFixed(2)}%`}
                </div>
                <div style={{ paddingLeft: "6px" }}>
                  <SegBar pct={pct} inactive={inactive} />
                </div>
              </div>
            );
          })}
        </div>

        {/* ─────────────────────────────────────────────────────
            MARKET SIGNALS
        ───────────────────────────────────────────────────── */}
        <div style={{
          margin: "0 18px 18px",
          borderRadius: "14px",
          overflow: "hidden",
          border: "1px solid rgba(255,255,255,0.06)",
          background: "rgba(0,0,0,0.18)",
        }}>
          <SectionHeader icon={<Zap style={{ width: "11px", height: "11px" }} />} label="Market Signals" />

          {/* ── Liquidations + Funding — 2-col ── */}
          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", borderBottom: "1px solid rgba(255,255,255,0.04)" }}>
            {/* Liquidations */}
            <div style={{ padding: "12px 14px", borderRight: "1px solid rgba(255,255,255,0.04)" }}>
              <div style={{ fontSize: "9px", fontWeight: 700, letterSpacing: "0.1em", textTransform: "uppercase", color: "rgba(255,255,255,0.28)", marginBottom: "5px" }}>
                💥 Liquidations · 60s
              </div>
              <div style={{
                fontSize: "20px", fontWeight: 900, fontVariantNumeric: "tabular-nums",
                color: !d ? "rgba(255,255,255,0.18)" :
                  liqLvl === "DANGER" ? "#ef4444" :
                  liqLvl === "RISK"   ? "#f97316" :
                  liqLvl === "WATCH"  ? "#f59e0b" : "#10b981",
              }}>
                {!d ? "—" : fmtLiq(liqUsd)}
              </div>
              {d && liqLargest > 0 && (
                <div style={{ fontSize: "9px", color: "rgba(255,255,255,0.28)", marginTop: "3px", fontVariantNumeric: "tabular-nums" }}>
                  Largest: {fmtLiq(liqLargest)}
                </div>
              )}
              {d && <div style={{ marginTop: "5px" }}><LevelChip level={liqLvl} /></div>}
            </div>
            {/* Funding Rate */}
            <div style={{ padding: "12px 14px" }}>
              <div style={{ fontSize: "9px", fontWeight: 700, letterSpacing: "0.1em", textTransform: "uppercase", color: "rgba(255,255,255,0.28)", marginBottom: "5px" }}>
                💸 Funding Rate
              </div>
              <div style={{
                fontSize: "20px", fontWeight: 900, fontVariantNumeric: "tabular-nums",
                color: !d ? "rgba(255,255,255,0.18)" :
                  fundingLvl === "DANGER" ? "#ef4444" :
                  fundingLvl === "RISK"   ? "#f97316" :
                  fundingLvl === "WATCH"  ? "#f59e0b" : "#10b981",
              }}>
                {!d ? "—" : fmtFunding(fundingRate)}
              </div>
              {d && <div style={{ marginTop: "5px" }}><LevelChip level={fundingLvl} /></div>}
            </div>
          </div>

          {/* ── Whale Sells + Bleed Mins — 2-col ── */}
          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", borderBottom: "1px solid rgba(255,255,255,0.04)" }}>
            {/* Whale Sells */}
            <div style={{ padding: "12px 14px", borderRight: "1px solid rgba(255,255,255,0.04)" }}>
              <div style={{ fontSize: "9px", fontWeight: 700, letterSpacing: "0.1em", textTransform: "uppercase", color: "rgba(255,255,255,0.28)", marginBottom: "5px", display: "flex", alignItems: "center", gap: "4px" }}>
                🐋 Whale Sells · 60s
              </div>
              <div style={{
                fontSize: "28px", fontWeight: 900, fontVariantNumeric: "tabular-nums", lineHeight: 1,
                color: !d ? "rgba(255,255,255,0.18)" : whaleCritical ? "#ef4444" : whaleCount >= 1 ? "#f97316" : "#10b981",
                textShadow: whaleCritical ? "0 0 12px rgba(239,68,68,0.5)" : "none",
              }}>
                {!d ? "—" : whaleCount}
              </div>
              {d && (
                <div style={{ fontSize: "10px", fontVariantNumeric: "tabular-nums", color: "rgba(255,255,255,0.3)", marginTop: "3px" }}>
                  {whaleUsdTotal > 0 ? fmtLiq(whaleUsdTotal) : "$0"}
                </div>
              )}
              {d && whaleCritical && (
                <div style={{ fontSize: "9px", fontWeight: 700, color: "#ef4444", marginTop: "3px", letterSpacing: "0.06em" }}>
                  CLUSTER ALERT
                </div>
              )}
            </div>
            {/* Bleed Mins */}
            <div style={{ padding: "12px 14px" }}>
              <div style={{ fontSize: "9px", fontWeight: 700, letterSpacing: "0.1em", textTransform: "uppercase", color: "rgba(255,255,255,0.28)", marginBottom: "5px", display: "flex", alignItems: "center", gap: "4px" }}>
                <TrendingDown style={{ width: "10px", height: "10px" }} /> Bleed Mins
              </div>
              <div style={{
                fontSize: "28px", fontWeight: 900, fontVariantNumeric: "tabular-nums", lineHeight: 1,
                color: !d ? "rgba(255,255,255,0.18)" : consecCritical ? "#ef4444" : consecDrops >= 3 ? "#f97316" : consecDrops >= 1 ? "#f59e0b" : "#10b981",
                textShadow: consecCritical ? "0 0 12px rgba(239,68,68,0.5)" : "none",
              }}>
                {!d ? "—" : consecDrops}
              </div>
              {d && consecCritical && (
                <div style={{ fontSize: "9px", fontWeight: 700, color: "#ef4444", marginTop: "3px", letterSpacing: "0.06em" }}>
                  SLOW BLEED
                </div>
              )}
            </div>
          </div>

          {/* ── Net Whale Flow ── */}
          <div style={{ padding: "12px 14px", borderBottom: "1px solid rgba(255,255,255,0.04)" }}>
            <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: "10px" }}>
              <div style={{ fontSize: "9px", fontWeight: 700, letterSpacing: "0.1em", textTransform: "uppercase", color: "rgba(255,255,255,0.28)", display: "flex", alignItems: "center", gap: "5px" }}>
                🌊 Net Whale Flow · 60s
              </div>
              {d ? <LevelChip level={whaleNetFlowLvl} /> : <span style={{ fontSize: "10px", color: "rgba(255,255,255,0.2)" }}>—</span>}
            </div>
            <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr", gap: "6px" }}>
              {/* Buys */}
              <div style={{
                borderRadius: "9px", padding: "8px 10px", textAlign: "center",
                background: "rgba(16,185,129,0.08)", border: "1px solid rgba(16,185,129,0.18)",
              }}>
                <div style={{ fontSize: "8px", fontWeight: 800, letterSpacing: "0.1em", color: "rgba(16,185,129,0.6)", textTransform: "uppercase", marginBottom: "3px" }}>Buys</div>
                <div style={{ fontSize: "11px", fontWeight: 900, fontVariantNumeric: "tabular-nums", color: !d ? "rgba(255,255,255,0.2)" : "#10b981" }}>
                  {!d ? "—" : fmtLiq(whaleBuyTotal)}
                </div>
              </div>
              {/* Sells */}
              <div style={{
                borderRadius: "9px", padding: "8px 10px", textAlign: "center",
                background: "rgba(239,68,68,0.08)", border: "1px solid rgba(239,68,68,0.18)",
              }}>
                <div style={{ fontSize: "8px", fontWeight: 800, letterSpacing: "0.1em", color: "rgba(239,68,68,0.6)", textTransform: "uppercase", marginBottom: "3px" }}>Sells</div>
                <div style={{ fontSize: "11px", fontWeight: 900, fontVariantNumeric: "tabular-nums", color: !d ? "rgba(255,255,255,0.2)" : "#ef4444" }}>
                  {!d ? "—" : fmtLiq(whaleUsdTotal)}
                </div>
              </div>
              {/* Net */}
              {(() => {
                const netColor =
                  !d ? "rgba(255,255,255,0.2)" :
                  whaleNetFlowLvl === "DANGER" ? "#ef4444" :
                  whaleNetFlowLvl === "WATCH"  ? "#f97316" :
                  netFlowNeg                    ? "#f59e0b" : "#10b981";
                const netBg =
                  !d ? "rgba(255,255,255,0.04)" :
                  whaleNetFlowLvl === "DANGER" ? "rgba(239,68,68,0.08)" :
                  whaleNetFlowLvl === "WATCH"  ? "rgba(249,115,22,0.08)" :
                  netFlowNeg                    ? "rgba(245,158,11,0.08)" : "rgba(16,185,129,0.08)";
                return (
                  <div style={{
                    borderRadius: "9px", padding: "8px 10px", textAlign: "center",
                    background: netBg, border: `1px solid ${netColor}30`,
                  }}>
                    <div style={{ fontSize: "8px", fontWeight: 800, letterSpacing: "0.1em", color: `${netColor}80`, textTransform: "uppercase", marginBottom: "3px" }}>Net</div>
                    <div style={{ fontSize: "11px", fontWeight: 900, fontVariantNumeric: "tabular-nums", color: netColor, display: "flex", alignItems: "center", justifyContent: "center", gap: "2px" }}>
                      {!d ? "—" : <><span>{netFlowNeg ? "▼" : "▲"}</span><span>{fmtLiq(netFlowAbs)}</span></>}
                    </div>
                  </div>
                );
              })()}
            </div>
          </div>

          {/* ── Vol Spike ── */}
          <div style={{
            display: "flex", alignItems: "center", justifyContent: "space-between",
            padding: "12px 14px",
          }}>
            <div style={{ display: "flex", alignItems: "center", gap: "8px" }}>
              <Waves style={{ width: "14px", height: "14px", color: "rgba(255,255,255,0.3)" }} />
              <span style={{ fontSize: "10px", fontWeight: 700, letterSpacing: "0.08em", textTransform: "uppercase", color: "rgba(255,255,255,0.35)" }}>
                Vol Spike · Red Candle
              </span>
            </div>
            {!d ? (
              <span style={{ fontSize: "11px", color: "rgba(255,255,255,0.2)", fontWeight: 700 }}>—</span>
            ) : volSpike ? (
              <div style={{
                display: "flex", alignItems: "center", gap: "6px",
                padding: "5px 10px", borderRadius: "7px",
                background: "rgba(239,68,68,0.12)", border: "1px solid rgba(239,68,68,0.35)",
                color: "#ef4444", fontSize: "10px", fontWeight: 900,
                letterSpacing: "0.1em", textTransform: "uppercase",
                boxShadow: "0 0 10px -2px rgba(239,68,68,0.3)",
              }}>
                <span style={{ width: "6px", height: "6px", borderRadius: "50%", background: "#ef4444", animation: "btc-dot-blink 0.8s ease-in-out infinite" }} />
                SPIKE 🔥
              </div>
            ) : (
              <div style={{
                padding: "5px 10px", borderRadius: "7px",
                background: "rgba(16,185,129,0.08)", border: "1px solid rgba(16,185,129,0.25)",
                color: "#10b981", fontSize: "10px", fontWeight: 900,
                letterSpacing: "0.1em", textTransform: "uppercase",
              }}>
                Normal
              </div>
            )}
          </div>
        </div>
      </section>
    </>
  );
}
