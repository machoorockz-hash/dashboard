import { useEffect, useState } from "react";
import {
  Activity, TrendingUp, TrendingDown, Zap, Waves,
  DollarSign, BarChart2,
} from "lucide-react";

const API_BASE = (typeof import.meta !== "undefined" && (import.meta as Record<string, unknown>).env)
  ? ((import.meta as Record<string, { VITE_API_BASE?: string }>).env.VITE_API_BASE ?? "")
  : "";

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
  trade_mode: "Pause",
  pause_reason: "BTC 15 min drop: −2.34% · 4 consecutive down-minutes · volume spike on red candle",
  whale_count: 4, whale_usd_total: 8_420_000, whale_buy_total: 1_250_000,
  whale_net_flow: -7_170_000, whale_net_flow_level: "DANGER",
  consec_drops: 4, vol_spike: true,
  funding_rate: -0.00042, funding_level: "WATCH",
  liq_usd_60s: 12_400_000, liq_level: "DANGER", liq_largest: 3_200_000,
};
const MOCK_SNAPSHOT: Snapshot = { key: "btc", updatedAt: new Date().toISOString(), data: MOCK_DATA };
const USE_MOCK = true;

interface StageStyle {
  glow: string; label: string; sub: string; barColor: string;
}
const STAGE: Record<string, StageStyle> = {
  SAFE:       { glow: "oklch(0.82 0.18 165 / 0.20)",  label: "SAFE",       sub: "OK TO TRADE ALTS",    barColor: "oklch(0.82 0.18 165)" },
  WATCH:      { glow: "rgba(245,158,11,0.18)",  label: "WATCH",      sub: "BE SELECTIVE",         barColor: "#fbbf24" },
  RISK:       { glow: "rgba(249,115,22,0.20)",  label: "RISK",       sub: "HOLD OFF NEW BUYS",    barColor: "#fb923c" },
  SELL_ALERT: { glow: "rgba(244,63,94,0.22)",   label: "SELL ALERT", sub: "PAUSE BUYING",         barColor: "#fb7185" },
  DANGER:     { glow: "rgba(239,68,68,0.28)",   label: "DANGER",     sub: "CONSIDER SELLING",     barColor: "#f87171" },
};

const LEVEL_COLOR: Record<string, string> = {
  NORMAL: "oklch(0.82 0.18 165)", WATCH: "#fbbf24", RISK: "#fb923c", DANGER: "#f87171",
};
const LEVEL_BG: Record<string, string> = {
  NORMAL: "oklch(0.82 0.18 165 / 0.10)",
  WATCH:  "rgba(251,191,36,0.08)",
  RISK:   "rgba(251,146,60,0.08)",
  DANGER: "rgba(248,113,113,0.10)",
};
const LEVEL_BORDER: Record<string, string> = {
  NORMAL: "oklch(0.82 0.18 165 / 0.28)",
  WATCH:  "rgba(251,191,36,0.20)",
  RISK:   "rgba(251,146,60,0.20)",
  DANGER: "rgba(248,113,113,0.25)",
};

const TIMEFRAMES = [
  { label: "1m",  dk: "drop_1m"  as const, pk: "peak_1m"  as const },
  { label: "5m",  dk: "drop_5m"  as const, pk: "peak_5m"  as const },
  { label: "15m", dk: "drop_15m" as const, pk: "peak_15m" as const },
  { label: "1h",  dk: "drop_1h"  as const, pk: "peak_1h"  as const },
  { label: "4h",  dk: "drop_4h"  as const, pk: "peak_4h"  as const },
];

function dropColor(pct: number) {
  if (pct >= 4) return "#f87171";
  if (pct >= 2) return "#fb923c";
  if (pct >= 1) return "#fbbf24";
  return "oklch(0.82 0.18 165)";
}
function fmtPrice(p: number) {
  return p.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}
function fmtPeakShort(p: number) {
  if (p >= 100_000) return `$${(p / 1000).toFixed(1)}K`;
  return `$${p.toLocaleString(undefined, { maximumFractionDigits: 0 })}`;
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
  const secs = Math.floor((Date.now() - new Date(iso).getTime()) / 1000);
  if (secs < 5) return "just now";
  if (secs < 60) return `${secs}s ago`;
  return `${Math.floor(secs / 60)}m ${secs % 60}s ago`;
}

function BtcLogo({ size = 48 }: { size?: number }) {
  return (
    <div style={{ position: "relative", width: size, height: size, flexShrink: 0 }}>
      <div style={{
        position: "absolute", inset: -4, borderRadius: "50%",
        background: "radial-gradient(circle, rgba(247,147,26,0.35) 0%, transparent 70%)",
        filter: "blur(8px)", animation: "btcGlow 3s ease-in-out infinite",
      }} />
      <div style={{
        position: "relative", width: size, height: size, borderRadius: "50%",
        background: "linear-gradient(135deg, #f7931a 0%, #c96b12 100%)",
        display: "flex", alignItems: "center", justifyContent: "center",
        boxShadow: "0 0 0 1px rgba(255,255,255,0.15), 0 4px 24px rgba(247,147,26,0.35)",
      }}>
        <svg viewBox="0 0 32 32" style={{ width: size * 0.52, height: size * 0.52, color: "rgba(0,0,0,0.85)" }} fill="currentColor" aria-hidden>
          <path d="M22.4 14.3c.3-2-1.2-3.1-3.3-3.8l.7-2.7-1.7-.4-.7 2.6c-.4-.1-.9-.2-1.4-.3l.7-2.7L15 6.6l-.7 2.7c-.4-.1-.7-.2-1.1-.2l-2.3-.6-.5 1.8s1.2.3 1.2.3c.7.2.8.6.8 1l-.8 3.1c.1 0 .1 0 .2.1h-.2l-1.1 4.3c-.1.2-.3.5-.8.4 0 0-1.2-.3-1.2-.3l-.9 1.9 2.2.6c.4.1.8.2 1.2.3l-.7 2.8 1.7.4.7-2.7c.5.1.9.2 1.4.3l-.7 2.7 1.7.4.7-2.8c2.9.6 5.2.3 6.1-2.3.8-2.1 0-3.3-1.5-4.1 1.1-.3 1.9-1 2.1-2.5zm-3.9 5.5c-.5 2.1-4.1 1-5.2.7l.9-3.6c1.1.3 4.9.9 4.3 2.9zm.5-5.5c-.5 1.9-3.4.9-4.4.7l.8-3.3c1 .2 4.1.8 3.6 2.6z"/>
        </svg>
      </div>
    </div>
  );
}

function PauseIcon() {
  return (
    <div style={{ position: "relative", width: 56, height: 56, flexShrink: 0 }}>
      {/* Outer rotating ring */}
      <div className="pause-ring-spin" style={{
        position: "absolute", inset: 0, borderRadius: "50%",
        border: "2px solid transparent",
        borderTopColor: "#fb923c",
        borderRightColor: "rgba(251,146,60,0.3)",
      }} />
      {/* Pulsing glow */}
      <div className="pause-glow-pulse" style={{
        position: "absolute", inset: -6, borderRadius: "50%",
        background: "radial-gradient(circle, rgba(251,146,60,0.25) 0%, transparent 70%)",
        filter: "blur(6px)",
      }} />
      {/* Circle bg */}
      <div style={{
        position: "absolute", inset: 4, borderRadius: "50%",
        background: "rgba(251,146,60,0.12)",
        border: "1px solid rgba(251,146,60,0.35)",
        display: "flex", alignItems: "center", justifyContent: "center",
        backdropFilter: "blur(8px)",
      }}>
        {/* Pause bars */}
        <div style={{ display: "flex", gap: 5, alignItems: "center" }}>
          <div className="pause-bar-pulse" style={{
            width: 5, height: 18, borderRadius: 3,
            background: "linear-gradient(180deg, #fbbf24 0%, #fb923c 100%)",
            boxShadow: "0 0 8px rgba(251,191,36,0.6)",
          }} />
          <div className="pause-bar-pulse" style={{
            width: 5, height: 18, borderRadius: 3,
            background: "linear-gradient(180deg, #fbbf24 0%, #fb923c 100%)",
            boxShadow: "0 0 8px rgba(251,191,36,0.6)",
            animationDelay: "0.15s",
          }} />
        </div>
      </div>
    </div>
  );
}

function DropBar({ pct, color }: { pct: number; color: string }) {
  const filled = Math.round(Math.min(pct / 5, 1) * 10);
  return (
    <div style={{ display: "flex", gap: 2, alignItems: "center" }}>
      {Array.from({ length: 10 }).map((_, i) => (
        <div key={i} style={{
          width: 3, height: 14, borderRadius: 2,
          background: i < filled ? color : "rgba(255,255,255,0.05)",
          boxShadow: i < filled ? `0 0 5px ${color}80` : "none",
          transition: "all 0.4s ease",
        }} />
      ))}
    </div>
  );
}

function MetricPanel({ icon, label, value, level, sub }: {
  icon: React.ReactNode; label: string; value: string; level?: string; sub?: string;
}) {
  const lc = LEVEL_COLOR[level ?? "NORMAL"] ?? "oklch(0.82 0.18 165)";
  const lb = LEVEL_BG[level ?? "NORMAL"] ?? "oklch(0.82 0.18 165 / 0.10)";
  const lbr = LEVEL_BORDER[level ?? "NORMAL"] ?? "oklch(0.82 0.18 165 / 0.28)";
  return (
    <div style={{
      padding: "10px 10px", borderRadius: 14,
      border: "1px solid rgba(255,255,255,0.06)",
      background: "rgba(255,255,255,0.03)",
      backdropFilter: "blur(12px)",
      display: "flex", flexDirection: "column", gap: 5,
      minWidth: 0, overflow: "hidden",
    }}>
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 4, minWidth: 0 }}>
        <div style={{ display: "flex", alignItems: "center", gap: 4, color: "rgba(255,255,255,0.4)", fontSize: 9, fontWeight: 700, letterSpacing: "0.10em", textTransform: "uppercase", minWidth: 0, overflow: "hidden", whiteSpace: "nowrap" }}>
          <span style={{ flexShrink: 0 }}>{icon}</span>
          <span style={{ overflow: "hidden", textOverflow: "ellipsis" }}>{label}</span>
        </div>
        {level && level !== "NORMAL" && (
          <span style={{
            padding: "2px 5px", borderRadius: 999, fontSize: 7.5, fontWeight: 800,
            letterSpacing: "0.12em", textTransform: "uppercase", flexShrink: 0,
            color: lc, background: lb, border: `1px solid ${lbr}`,
          }}>
            {level}
          </span>
        )}
      </div>
      <div style={{ fontSize: 15, fontWeight: 900, fontVariantNumeric: "tabular-nums", letterSpacing: "-0.02em", color: "rgba(255,255,255,0.90)" }}>
        {value}
      </div>
      {sub && <div style={{ fontSize: 10, color: "rgba(255,255,255,0.35)", fontWeight: 500, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>{sub}</div>}
    </div>
  );
}

function Stat({ label, value, color, icon }: { label: string; value: string; color: string; icon?: React.ReactNode }) {
  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 2 }}>
      <span style={{ fontSize: 9, fontWeight: 700, letterSpacing: "0.12em", textTransform: "uppercase", color: "rgba(255,255,255,0.35)", display: "flex", alignItems: "center", gap: 3 }}>
        {icon}{label}
      </span>
      <span style={{ fontSize: 12, fontWeight: 800, fontVariantNumeric: "tabular-nums", color }}>{value}</span>
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
      } catch { /* ignore */ }
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
      } catch { /* ignore */ }
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
  const cfg = STAGE[stage] ?? STAGE["SAFE"]!;
  const isPaused = d?.trade_mode === "Pause";
  const displayPrice = livePrice ?? d?.price ?? 0;

  const pauseReason: string = (() => {
    if (!d) return "";
    if (d.pause_reason?.trim()) return d.pause_reason.trim();
    const parts: string[] = [];
    const worst = TIMEFRAMES.reduce((a, b) => (d[b.dk] > d[a.dk] ? b : a));
    if (d[worst.dk] >= 1) parts.push(`BTC ${worst.label} drop: −${d[worst.dk].toFixed(2)}%`);
    if ((d.consec_drops ?? 0) >= 3) parts.push(`${d.consec_drops} consecutive down-minutes`);
    if (d.vol_spike) parts.push("volume spike on red candle");
    if ((d.whale_count ?? 0) >= 3) parts.push(`${d.whale_count} whale sells`);
    if (d.liq_level === "DANGER") parts.push(`liquidations ${fmtLiq(d.liq_usd_60s ?? 0)}`);
    return parts.length ? parts.join(" · ") : "BTC conditions elevated — avoid new alt buys";
  })();

  return (
    <>
      <style>{`
        @keyframes btcGlow {
          0%,100% { opacity: 0.7; transform: scale(1); }
          50% { opacity: 1; transform: scale(1.12); }
        }
        @keyframes priceFlashUp {
          0% { color: oklch(0.82 0.18 165); text-shadow: 0 0 20px oklch(0.82 0.18 165 / 0.8); }
          100% { color: rgba(255,255,255,0.95); text-shadow: none; }
        }
        @keyframes priceFlashDown {
          0% { color: #f87171; text-shadow: 0 0 20px rgba(248,113,113,0.8); }
          100% { color: rgba(255,255,255,0.95); text-shadow: none; }
        }
        @keyframes statusPing {
          0%,100% { transform: scale(1); opacity: 1; }
          50% { transform: scale(1.8); opacity: 0; }
        }
        @keyframes slideUp {
          from { opacity: 0; transform: translateY(10px); }
          to   { opacity: 1; transform: translateY(0); }
        }
        @keyframes topGlow {
          0%,100% { opacity: 0.5; }
          50%      { opacity: 1; }
        }
        @keyframes pauseRingSpin {
          from { transform: rotate(0deg); }
          to   { transform: rotate(360deg); }
        }
        @keyframes pauseGlowPulse {
          0%,100% { opacity: 0.6; transform: scale(1); }
          50%     { opacity: 1;   transform: scale(1.15); }
        }
        @keyframes pauseBarPulse {
          0%,100% { opacity: 1;   transform: scaleY(1); }
          50%     { opacity: 0.55; transform: scaleY(0.7); }
        }
        @keyframes pauseBannerIn {
          from { opacity: 0; transform: translateY(6px) scale(0.98); }
          to   { opacity: 1; transform: translateY(0) scale(1); }
        }
        .btc-price-up      { animation: priceFlashUp   0.55s ease-out both; }
        .btc-price-down    { animation: priceFlashDown  0.55s ease-out both; }
        .btc-dot-ping      { animation: statusPing 1.6s ease-in-out infinite; }
        .btc-top-glow      { animation: topGlow 2.4s ease-in-out infinite; }
        .pause-ring-spin   { animation: pauseRingSpin   1.8s linear infinite; }
        .pause-glow-pulse  { animation: pauseGlowPulse  1.4s ease-in-out infinite; }
        .pause-bar-pulse   { animation: pauseBarPulse   0.9s ease-in-out infinite; }
        .pause-banner-in   { animation: pauseBannerIn   0.5s cubic-bezier(0.22,1,0.36,1) both; }
      `}</style>

      <section style={{
        position: "relative", overflow: "hidden", borderRadius: 28,
        border: "1px solid",
        borderColor: d ? cfg.barColor + "40" : "rgba(255,255,255,0.08)",
        background: "oklch(0.55 0.06 210 / 10%)",
        backdropFilter: "blur(28px) saturate(160%)",
        WebkitBackdropFilter: "blur(28px) saturate(160%)",
        boxShadow: `0 0 0 1px rgba(255,255,255,0.04) inset, 0 2px 0 rgba(255,255,255,0.06) inset, 0 20px 60px -20px ${d ? cfg.glow : "rgba(0,0,0,0.4)"}`,
        fontFamily: "'Inter', ui-sans-serif, system-ui, sans-serif",
        color: "rgba(255,255,255,0.9)",
      }}>

        {/* Animated top edge glow */}
        <div className="btc-top-glow" style={{
          position: "absolute", top: 0, left: "10%", right: "10%", height: 1,
          background: `linear-gradient(90deg, transparent, ${d ? cfg.barColor : "rgba(255,255,255,0.2)"}, transparent)`,
          pointerEvents: "none",
        }} />

        {/* Stage wash */}
        <div style={{
          position: "absolute", inset: 0, pointerEvents: "none",
          background: `linear-gradient(160deg, ${d ? cfg.glow : "transparent"} 0%, transparent 55%)`,
        }} />

        {/* Grid */}
        <div style={{
          position: "absolute", inset: 0, pointerEvents: "none", opacity: 0.22,
          backgroundImage: "linear-gradient(rgba(255,255,255,0.04) 1px, transparent 1px), linear-gradient(90deg, rgba(255,255,255,0.04) 1px, transparent 1px)",
          backgroundSize: "40px 40px",
        }} />

        {/* BTC ambient sphere */}
        <div style={{
          position: "absolute", top: -60, right: -40, width: 200, height: 200,
          borderRadius: "50%",
          background: "radial-gradient(circle, rgba(247,147,26,0.14) 0%, transparent 70%)",
          pointerEvents: "none",
        }} />

        <div style={{ position: "relative", display: "flex", flexDirection: "column" }}>

          {/* ── HEADER ── */}
          <div style={{ padding: "22px 24px 18px", display: "flex", alignItems: "center", justifyContent: "space-between", gap: 12, flexWrap: "wrap" }}>
            <div style={{ display: "flex", alignItems: "center", gap: 14 }}>
              <BtcLogo size={52} />
              <div>
                <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                  <span style={{ fontSize: 15, fontWeight: 800, letterSpacing: "-0.02em" }}>BTC Crash Monitor</span>
                  <span style={{
                    fontSize: 9, padding: "2px 7px", borderRadius: 6,
                    background: "rgba(255,255,255,0.06)", border: "1px solid rgba(255,255,255,0.10)",
                    color: "rgba(255,255,255,0.45)", fontWeight: 700, textTransform: "uppercase", letterSpacing: "0.12em",
                  }}>Live</span>
                </div>
                <div style={{ marginTop: 3, display: "flex", alignItems: "center", gap: 5, fontSize: 11, color: "rgba(255,255,255,0.38)", fontWeight: 500 }}>
                  <span style={{ width: 6, height: 6, borderRadius: "50%", background: d ? cfg.barColor : "rgba(255,255,255,0.2)", display: "inline-block", flexShrink: 0 }} />
                  {d ? `updated ${age}` : "Waiting for bot data…"}
                </div>
              </div>
            </div>

            {/* Status badge */}
            <div style={{
              display: "flex", alignItems: "center", gap: 10,
              padding: "9px 16px", borderRadius: 999,
              border: "1px solid",
              borderColor: d ? cfg.barColor + "50" : "rgba(255,255,255,0.10)",
              background: "rgba(0,0,0,0.25)",
              backdropFilter: "blur(12px)",
            }}>
              <div style={{ position: "relative", width: 8, height: 8, flexShrink: 0 }}>
                <div className="btc-dot-ping" style={{
                  position: "absolute", inset: 0, borderRadius: "50%",
                  background: d ? cfg.barColor : "#ef4444", opacity: 0.6,
                }} />
                <div style={{ position: "relative", width: 8, height: 8, borderRadius: "50%", background: d ? cfg.barColor : "#ef4444" }} />
              </div>
              <div style={{ display: "flex", flexDirection: "column", gap: 1 }}>
                <span style={{
                  fontSize: 11, fontWeight: 800, letterSpacing: "0.18em", textTransform: "uppercase",
                  color: d ? cfg.barColor : "#f87171",
                  textShadow: d ? `0 0 12px ${cfg.barColor}60` : "none",
                }}>
                  {d ? cfg.label : "OFFLINE"}
                </span>
                <span style={{ fontSize: 9, color: "rgba(255,255,255,0.35)", letterSpacing: "0.12em", textTransform: "uppercase" }}>
                  {d ? cfg.sub : "BOT NOT ACTIVE"}
                </span>
              </div>
            </div>
          </div>

          {/* ── LIVE PRICE STRIP ── */}
          <div style={{
            margin: "0 16px",
            padding: "14px 18px", borderRadius: 18,
            background: "rgba(255,255,255,0.03)",
            border: "1px solid rgba(255,255,255,0.07)",
            display: "flex", alignItems: "center", justifyContent: "space-between", gap: 12, flexWrap: "wrap",
          }}>
            <div style={{ display: "flex", alignItems: "baseline", gap: 8 }}>
              <span
                key={`${livePrice}-${flash}`}
                className={flash === "up" ? "btc-price-up" : flash === "down" ? "btc-price-down" : ""}
                style={{
                  fontSize: 32, fontWeight: 900, fontVariantNumeric: "tabular-nums",
                  letterSpacing: "-0.04em", lineHeight: 1,
                  color: flash === "up" ? "oklch(0.82 0.18 165)" : flash === "down" ? "#f87171" : "rgba(255,255,255,0.95)",
                }}
              >
                ${displayPrice > 0 ? fmtPrice(displayPrice) : "…"}
              </span>
              {flash === "up"   && <TrendingUp   style={{ width: 18, height: 18, color: "oklch(0.82 0.18 165)", flexShrink: 0 }} />}
              {flash === "down" && <TrendingDown style={{ width: 18, height: 18, color: "#f87171", flexShrink: 0 }} />}
            </div>
            <div style={{ display: "flex", gap: 16, flexWrap: "wrap" }}>
              <Stat label="Speed"     value={d ? `${d.speed >= 0 ? "+" : ""}${d.speed.toFixed(2)}%/min` : "—"} color={d && d.speed >= 0 ? "oklch(0.82 0.18 165)" : "#f87171"} />
              <Stat label="Volatility" value={d ? `${d.volatility.toFixed(2)}%` : "—"} color="#fbbf24" />
              {(d?.consec_drops ?? 0) > 0 && (
                <Stat label="Consec Drops" value={`${d!.consec_drops}`} color="#fb923c" />
              )}
              {d?.vol_spike && (
                <Stat label="Vol Spike" value="YES" color="#f87171" icon={<Zap style={{ width: 10, height: 10 }} />} />
              )}
            </div>
          </div>

          {/* ── DROP FROM PEAK TIMEFRAMES ── */}
          <div style={{ padding: "16px 20px 4px" }}>
            {/* Column headers */}
            <div style={{
              display: "grid",
              gridTemplateColumns: "28px 1fr 72px 56px",
              gap: "0 10px",
              marginBottom: 8,
              paddingBottom: 7,
              borderBottom: "1px solid rgba(255,255,255,0.06)",
            }}>
              <span />
              <span style={{ fontSize: 8, fontWeight: 700, letterSpacing: "0.14em", textTransform: "uppercase", color: "rgba(255,255,255,0.22)" }}>
                PRESSURE
              </span>
              <span style={{ fontSize: 8, fontWeight: 700, letterSpacing: "0.14em", textTransform: "uppercase", color: "rgba(255,255,255,0.22)", textAlign: "right" }}>
                PEAK
              </span>
              <span style={{ fontSize: 8, fontWeight: 700, letterSpacing: "0.14em", textTransform: "uppercase", color: "rgba(255,255,255,0.22)", textAlign: "right" }}>
                DROP
              </span>
            </div>

            {/* Data rows */}
            <div style={{ display: "flex", flexDirection: "column", gap: 9 }}>
              {TIMEFRAMES.map(({ label, dk, pk }) => {
                const pct  = d?.[dk] ?? 0;
                const peak = d?.[pk] ?? 0;
                const color = dropColor(pct);
                return (
                  <div key={label} style={{
                    display: "grid",
                    gridTemplateColumns: "28px 1fr 72px 56px",
                    gap: "0 10px",
                    alignItems: "center",
                  }}>
                    {/* TF label */}
                    <span style={{
                      fontSize: 10, fontWeight: 800,
                      color: "oklch(0.82 0.18 165 / 0.80)",
                      fontVariantNumeric: "tabular-nums",
                      letterSpacing: "0.05em",
                      textShadow: "0 0 10px oklch(0.82 0.18 165 / 0.30)",
                    }}>
                      {label}
                    </span>

                    {/* Bar */}
                    <DropBar pct={pct} color={color} />

                    {/* Peak price — its own column */}
                    <div style={{ textAlign: "right" }}>
                      {peak > 0 ? (
                        <span style={{
                          fontSize: 11, fontWeight: 700,
                          color: "oklch(0.82 0.18 165 / 0.85)",
                          fontVariantNumeric: "tabular-nums",
                          letterSpacing: "-0.02em",
                          textShadow: "0 0 14px oklch(0.82 0.18 165 / 0.35)",
                        }}>
                          {fmtPeakShort(peak)}
                        </span>
                      ) : (
                        <span style={{ fontSize: 11, color: "rgba(255,255,255,0.15)" }}>—</span>
                      )}
                    </div>

                    {/* Drop % — its own column */}
                    <div style={{ textAlign: "right" }}>
                      <span style={{
                        fontSize: 13, fontWeight: 900,
                        fontVariantNumeric: "tabular-nums",
                        letterSpacing: "-0.02em",
                        color,
                        textShadow: pct >= 2 ? `0 0 10px ${color}55` : "none",
                      }}>
                        {d ? `−${pct.toFixed(2)}%` : "—"}
                      </span>
                    </div>
                  </div>
                );
              })}
            </div>
          </div>

          {/* ── DIVIDER ── */}
          <div style={{ margin: "16px 24px 0", height: 1, background: "rgba(255,255,255,0.05)" }} />

          {/* ── METRICS GRID ── */}
          <div style={{ padding: "16px 20px 16px 20px", display: "grid", gridTemplateColumns: "repeat(3, minmax(0, 1fr))", gap: 8 }}>
            <MetricPanel
              icon={<Waves style={{ width: 10, height: 10 }} />}
              label="Whale Sells"
              value={d ? `${d.whale_count ?? 0} txn` : "—"}
              level={d?.whale_net_flow_level}
              sub={d?.whale_usd_total ? fmtLiq(d.whale_usd_total) + " total" : undefined}
            />
            <MetricPanel
              icon={<Activity style={{ width: 10, height: 10 }} />}
              label="Funding"
              value={d?.funding_rate != null ? fmtFunding(d.funding_rate) : "—"}
              level={d?.funding_level}
            />
            <MetricPanel
              icon={<BarChart2 style={{ width: 10, height: 10 }} />}
              label="Liquidations"
              value={d?.liq_usd_60s ? fmtLiq(d.liq_usd_60s) : "—"}
              level={d?.liq_level}
              sub={d?.liq_largest ? `largest ${fmtLiq(d.liq_largest)}` : undefined}
            />
          </div>

          {/* ── WHALE NET FLOW ── */}
          {d && (d.whale_net_flow ?? 0) !== 0 && (
            <div style={{ margin: "0 24px", marginBottom: 8 }}>
              <div style={{
                padding: "10px 14px", borderRadius: 14,
                border: "1px solid rgba(255,255,255,0.06)",
                background: (d.whale_net_flow ?? 0) < 0 ? "rgba(248,113,113,0.06)" : "oklch(0.82 0.18 165 / 0.07)",
                display: "flex", alignItems: "center", justifyContent: "space-between", gap: 8,
              }}>
                <div style={{ display: "flex", alignItems: "center", gap: 6, fontSize: 10, fontWeight: 700, letterSpacing: "0.1em", textTransform: "uppercase", color: "rgba(255,255,255,0.4)" }}>
                  <DollarSign style={{ width: 10, height: 10 }} />
                  Whale Net Flow
                </div>
                <span style={{ fontSize: 14, fontWeight: 900, fontVariantNumeric: "tabular-nums", color: (d.whale_net_flow ?? 0) < 0 ? "#f87171" : "oklch(0.82 0.18 165)" }}>
                  {(d.whale_net_flow ?? 0) < 0 ? "−" : "+"}{fmtLiq(Math.abs(d.whale_net_flow ?? 0))}
                  <span style={{ fontSize: 10, fontWeight: 600, marginLeft: 4, color: "rgba(255,255,255,0.35)" }}>
                    ({(d.whale_net_flow ?? 0) < 0 ? "SELL" : "BUY"} pressure)
                  </span>
                </span>
              </div>
            </div>
          )}

          {/* ── PAUSE BANNER ── */}
          {isPaused && pauseReason && (
            <div className="pause-banner-in" style={{ margin: "0 24px 16px" }}>
              <div style={{
                borderRadius: 18,
                border: "1px solid rgba(251,146,60,0.30)",
                background: "linear-gradient(135deg, rgba(251,146,60,0.10) 0%, rgba(251,146,60,0.05) 100%)",
                overflow: "hidden",
                boxShadow: "0 0 0 1px rgba(251,191,36,0.08) inset, 0 8px 32px -8px rgba(251,146,60,0.25)",
              }}>
                {/* Shimmer line at top */}
                <div style={{
                  height: 1, width: "100%",
                  background: "linear-gradient(90deg, transparent 0%, rgba(251,191,36,0.6) 50%, transparent 100%)",
                }} />

                <div style={{ padding: "14px 16px", display: "flex", alignItems: "center", gap: 14 }}>
                  <PauseIcon />
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 5 }}>
                      <span style={{
                        fontSize: 10, fontWeight: 900, letterSpacing: "0.18em", textTransform: "uppercase",
                        color: "#fbbf24",
                        textShadow: "0 0 12px rgba(251,191,36,0.5)",
                      }}>
                        TRADING PAUSED
                      </span>
                      <span style={{
                        fontSize: 8, padding: "1px 6px", borderRadius: 999,
                        background: "rgba(251,146,60,0.15)", border: "1px solid rgba(251,146,60,0.30)",
                        color: "#fb923c", fontWeight: 700, letterSpacing: "0.1em", textTransform: "uppercase",
                      }}>
                        BOT HALTED
                      </span>
                    </div>
                    <div style={{
                      fontSize: 11, color: "rgba(255,255,255,0.55)",
                      lineHeight: 1.55, fontWeight: 500,
                    }}>
                      {pauseReason}
                    </div>
                  </div>
                </div>
              </div>
            </div>
          )}

          {/* ── OFFLINE STATE ── */}
          {!d && (
            <div style={{ padding: "0 24px 20px" }}>
              <div style={{
                padding: "12px 16px", borderRadius: 14,
                border: "1px solid rgba(239,68,68,0.25)",
                background: "rgba(239,68,68,0.07)",
                textAlign: "center", fontSize: 11, fontWeight: 700,
                letterSpacing: "0.12em", textTransform: "uppercase", color: "#f87171",
              }}>
                Bot is not active — start BTCCRASHBOT to see live data
              </div>
            </div>
          )}

          {d && <div style={{ height: 6 }} />}
        </div>
      </section>
    </>
  );
}

export default BtcCrashCard;
