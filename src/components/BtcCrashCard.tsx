import { useEffect, useRef, useState } from "react";
import { CoinIcon } from "./CoinIcon";

const API_BASE = import.meta.env.VITE_API_BASE ?? "";

/* ─────────────────────────────────────────
   TYPES
───────────────────────────────────────── */
interface BotData {
  price: number;
  drop_1m: number; drop_5m: number; drop_15m: number;
  drop_1h: number; drop_4h: number;
  peak_1m: number; peak_5m: number; peak_15m: number;
  peak_1h: number; peak_4h: number;
  speed: number; volatility: number; status: string;
  trade_mode?: string; pause_reason?: string;
  whale_count?: number; whale_usd_total?: number; whale_buy_total?: number;
  whale_net_flow?: number; whale_net_flow_level?: string;
  consec_drops?: number; vol_spike?: boolean;
  funding_rate?: number; funding_level?: string;
  liq_usd_60s?: number; liq_level?: string; liq_largest?: number;
}
interface Snapshot { key: string; updatedAt: string | null; data: BotData | null; }

/* ─────────────────────────────────────────
   STAGE / LEVEL MAPS
───────────────────────────────────────── */
const STAGE: Record<string, { color: string; colorDim: string; glow: string; border: string; label: string; sub: string }> = {
  SAFE:       { color: "#0dd9aa", colorDim: "rgba(13,217,170,0.55)",  glow: "rgba(13,217,170,0.20)",  border: "rgba(13,217,170,0.28)",  label: "SAFE",  sub: "OK TO TRADE ALTS" },
  WATCH:      { color: "#f5c542", colorDim: "rgba(245,197,66,0.55)",  glow: "rgba(245,197,66,0.20)",  border: "rgba(245,197,66,0.28)",  label: "WATCH", sub: "BE SELECTIVE" },
  RISK:       { color: "#f97316", colorDim: "rgba(249,115,22,0.55)",  glow: "rgba(249,115,22,0.20)",  border: "rgba(249,115,22,0.28)",  label: "RISK",  sub: "HOLD OFF NEW BUYS" },
  SELL_ALERT: { color: "#f87171", colorDim: "rgba(248,113,113,0.55)", glow: "rgba(248,113,113,0.20)", border: "rgba(248,113,113,0.28)", label: "ALERT", sub: "PAUSE BUYING" },
  DANGER:     { color: "#ef4444", colorDim: "rgba(239,68,68,0.60)",   glow: "rgba(239,68,68,0.25)",   border: "rgba(239,68,68,0.35)",   label: "DANGER",sub: "CONSIDER SELLING" },
};

const LVL_COLOR: Record<string, string> = {
  NORMAL: "#0dd9aa", WATCH: "#f5c542", RISK: "#f97316", DANGER: "#ef4444",
};

const TF_ROWS = [
  { t: "1m",  dk: "drop_1m"  as keyof BotData, pk: "peak_1m"  as keyof BotData },
  { t: "5m",  dk: "drop_5m"  as keyof BotData, pk: "peak_5m"  as keyof BotData },
  { t: "15m", dk: "drop_15m" as keyof BotData, pk: "peak_15m" as keyof BotData },
  { t: "1h",  dk: "drop_1h"  as keyof BotData, pk: "peak_1h"  as keyof BotData },
  { t: "4h",  dk: "drop_4h"  as keyof BotData, pk: "peak_4h"  as keyof BotData },
];

/* ─────────────────────────────────────────
   HELPERS
───────────────────────────────────────── */
const fmt2   = (n: number) => n.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 });
const fmtK   = (n: number) => n >= 1e6 ? `$${(n/1e6).toFixed(1)}M` : n >= 1e3 ? `$${(n/1e3).toFixed(0)}K` : `$${n.toFixed(0)}`;
const fmtFnd = (r: number) => `${r >= 0 ? "+" : ""}${(r * 100).toFixed(4)}%`;
const since  = (iso: string) => {
  const s = Math.floor((Date.now() - new Date(iso).getTime()) / 1000);
  return s < 5 ? "just now" : s < 60 ? `${s}s ago` : `${Math.floor(s/60)}m ${s%60}s ago`;
};
const dropCol = (p: number) => p >= 4 ? "#ef4444" : p >= 2 ? "#f97316" : p >= 1 ? "#f5c542" : "#0dd9aa";

/* ─────────────────────────────────────────
   ANIMATED PRESSURE BARS
───────────────────────────────────────── */
function PressureBars({ pct, inactive }: { pct: number; inactive: boolean }) {
  const [lit, setLit] = useState(0);
  const col   = inactive ? "rgba(255,255,255,0.06)" : dropCol(pct);
  const total = 12;
  const target = inactive ? 0 : Math.round(Math.min(pct / 6, 1) * total);

  useEffect(() => {
    setLit(0);
    if (inactive || target === 0) return;
    let i = 0;
    const tick = () => { i++; setLit(i); if (i < target) setTimeout(() => requestAnimationFrame(tick), 40); };
    const t = setTimeout(() => requestAnimationFrame(tick), 100);
    return () => clearTimeout(t);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [pct, inactive]);

  return (
    <div style={{ display: "flex", alignItems: "flex-end", gap: "2px", height: "22px" }}>
      {Array.from({ length: total }).map((_, i) => {
        const filled = i < lit;
        const h = 7 + (i / (total - 1)) * 15;
        const opacity = filled ? (0.55 + (i / total) * 0.45) : 1;
        return (
          <div key={i} style={{
            width: "5px", height: `${h}px`, borderRadius: "2px",
            background: filled ? col : "rgba(255,255,255,0.06)",
            opacity,
            boxShadow: filled && i >= lit - 1 ? `0 0 6px 1px ${col}` : filled ? `0 0 3px ${col}60` : "none",
            transition: "background 0.1s, box-shadow 0.1s",
          }} />
        );
      })}
    </div>
  );
}

/* ─────────────────────────────────────────
   LEVEL BADGE
───────────────────────────────────────── */
function LvlBadge({ level }: { level: string }) {
  const c = LVL_COLOR[level] ?? "#0dd9aa";
  return (
    <span style={{
      display: "inline-flex", alignItems: "center",
      padding: "2px 8px", borderRadius: "5px",
      background: `${c}16`, border: `1px solid ${c}38`,
      color: c, fontSize: "8px", fontWeight: 900,
      letterSpacing: "0.12em", textTransform: "uppercase",
      flexShrink: 0,
      boxShadow: `0 0 8px -2px ${c}40`,
    }}>
      {level}
    </span>
  );
}

/* ─────────────────────────────────────────
   SIGNAL CARD
───────────────────────────────────────── */
function SigCard({
  icon, title, value, sub, lvlColor, level, danger,
}: {
  icon: string; title: string; value: string;
  sub?: string; lvlColor: string; level?: string; danger?: boolean;
}) {
  const [hov, setHov] = useState(false);
  return (
    <div
      onMouseEnter={() => setHov(true)}
      onMouseLeave={() => setHov(false)}
      style={{
        position: "relative", overflow: "hidden",
        borderRadius: "14px",
        border: `1px solid ${hov ? lvlColor + "40" : "rgba(255,255,255,0.07)"}`,
        background: hov
          ? `linear-gradient(145deg, ${lvlColor}10, rgba(255,255,255,0.03))`
          : `linear-gradient(145deg, rgba(255,255,255,0.045), rgba(255,255,255,0.02))`,
        padding: "14px 12px",
        display: "flex", flexDirection: "column", gap: "6px",
        transition: "border-color 0.25s, background 0.25s, box-shadow 0.25s, transform 0.2s",
        boxShadow: hov ? `0 4px 24px -8px ${lvlColor}50, 0 0 0 1px ${lvlColor}20` : "none",
        transform: hov ? "translateY(-2px)" : "none",
        backdropFilter: "blur(12px)",
        cursor: "default",
      }}
    >
      {/* shimmer on hover */}
      {hov && (
        <div style={{
          position: "absolute", inset: 0, pointerEvents: "none",
          background: `linear-gradient(105deg, transparent 35%, ${lvlColor}12 50%, transparent 65%)`,
          animation: "_bc_shimmer 0.7s ease both",
        }} />
      )}

      {/* danger glow top edge */}
      {danger && (
        <div style={{
          position: "absolute", top: 0, left: "15%", right: "15%", height: "1px",
          background: `linear-gradient(90deg, transparent, ${lvlColor}90, transparent)`,
          animation: "_bc_edge_pulse 2s ease-in-out infinite",
        }} />
      )}

      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between" }}>
        <span style={{
          fontSize: "9px", fontWeight: 800, letterSpacing: "0.12em",
          color: "rgba(255,255,255,0.28)", textTransform: "uppercase",
        }}>
          {icon} {title}
        </span>
        {level && <LvlBadge level={level} />}
      </div>

      <div style={{
        fontSize: "28px", fontWeight: 900, lineHeight: 1,
        fontVariantNumeric: "tabular-nums", letterSpacing: "-0.02em",
        color: lvlColor,
        textShadow: danger ? `0 0 20px ${lvlColor}70, 0 0 40px ${lvlColor}30` : `0 0 12px ${lvlColor}40`,
      }}>
        {value}
      </div>

      {sub && (
        <div style={{
          fontSize: "10px", color: "rgba(255,255,255,0.28)",
          fontVariantNumeric: "tabular-nums", fontWeight: 500,
        }}>{sub}</div>
      )}
    </div>
  );
}

/* ─────────────────────────────────────────
   MAIN COMPONENT
───────────────────────────────────────── */
export function BtcCrashCard() {
  const [snap, setSnap]       = useState<Snapshot | null>(null);
  const [age, setAge]         = useState("");
  const [price, setPrice]     = useState<number | null>(null);
  const [flash, setFlash]     = useState<"up" | "down" | null>(null);
  const prev                  = useRef<number | null>(null);

  /* WebSocket live price */
  useEffect(() => {
    const ws = new WebSocket("wss://data-stream.binance.vision/ws/btcusdt@trade");
    ws.onmessage = (e) => {
      try {
        const p = parseFloat(JSON.parse(e.data).p);
        if (prev.current !== null && p !== prev.current) setFlash(p > prev.current ? "up" : "down");
        prev.current = p;
        setPrice(p);
      } catch {}
    };
    return () => ws.close();
  }, []);
  useEffect(() => { if (!flash) return; const t = setTimeout(() => setFlash(null), 700); return () => clearTimeout(t); }, [flash]);

  /* Bot polling */
  useEffect(() => {
    let alive = true;
    const go = async () => {
      try { const r = await fetch(`${API_BASE}/api/bot/data?key=btc`); if (r.ok && alive) setSnap(await r.json()); } catch {}
    };
    go(); const id = setInterval(go, 3000); return () => { alive = false; clearInterval(id); };
  }, []);
  useEffect(() => {
    if (!snap?.updatedAt) return;
    const id = setInterval(() => setAge(since(snap.updatedAt!)), 1000);
    setAge(since(snap.updatedAt));
    return () => clearInterval(id);
  }, [snap?.updatedAt]);

  /* Derived */
  const d          = snap?.data;
  const stage      = d?.status ?? "SAFE";
  const cfg        = STAGE[stage] ?? STAGE.SAFE;
  const isPaused   = d?.trade_mode === "Pause";

  const pauseReason = (() => {
    if (!d) return "";
    if (d.pause_reason?.trim()) return d.pause_reason.trim();
    const rows: [string, number][] = [["1m", d.drop_1m], ["5m", d.drop_5m], ["15m", d.drop_15m], ["1h", d.drop_1h], ["4h", d.drop_4h]];
    const worst = rows.reduce((a, b) => b[1] > a[1] ? b : a);
    const parts: string[] = [];
    if (worst[1] >= 1) parts.push(`BTC ${worst[0]} drop: −${worst[1].toFixed(2)}%`);
    if ((d.consec_drops ?? 0) >= 3) parts.push(`${d.consec_drops} consecutive down-minutes`);
    if (d.vol_spike) parts.push("volume spike on red candle");
    if ((d.whale_count ?? 0) >= 3) parts.push(`${d.whale_count} whale sells in 60s`);
    return parts.length ? parts.join(" · ") : "Conditions elevated — await normalization";
  })();

  const whaleCount  = d?.whale_count       ?? 0;
  const whaleUsd    = d?.whale_usd_total   ?? 0;
  const whaleBuy    = d?.whale_buy_total   ?? 0;
  const whaleNet    = d?.whale_net_flow    ?? 0;
  const whaleNetLvl = d?.whale_net_flow_level ?? "NORMAL";
  const consec      = d?.consec_drops      ?? 0;
  const volSpike    = d?.vol_spike         ?? false;
  const funding     = d?.funding_rate      ?? 0;
  const fundingLvl  = d?.funding_level     ?? "NORMAL";
  const liqUsd      = d?.liq_usd_60s       ?? 0;
  const liqLvl      = d?.liq_level         ?? "NORMAL";
  const liqLargest  = d?.liq_largest       ?? 0;

  const priceColor = flash === "up" ? "#0dd9aa" : flash === "down" ? "#ef4444" : "#0dd9aa";
  const netColor   = LVL_COLOR[whaleNetLvl] ?? "#0dd9aa";

  /* ── RENDER ── */
  return (
    <>
      <style>{`
        @keyframes _bc_blink       { 0%,100%{opacity:1} 50%{opacity:.1} }
        @keyframes _bc_breathe     { 0%,100%{opacity:.6} 50%{opacity:1} }
        @keyframes _bc_price_flash { 0%{filter:brightness(1.6)} 100%{filter:brightness(1)} }
        @keyframes _bc_price_tick  { 0%{transform:scale(1.008)} 100%{transform:scale(1)} }
        @keyframes _bc_ring_expand { 0%{transform:scale(1);opacity:.5} 100%{transform:scale(1.75);opacity:0} }
        @keyframes _bc_slide_in    { from{opacity:0;transform:translateY(8px)} to{opacity:1;transform:none} }
        @keyframes _bc_shimmer     { from{opacity:0} 40%{opacity:1} to{opacity:0} }
        @keyframes _bc_edge_pulse  { 0%,100%{opacity:.5} 50%{opacity:1} }
        @keyframes _bc_grad_spin   {
          0%   { background-position: 0% 50%; }
          50%  { background-position: 100% 50%; }
          100% { background-position: 0% 50%; }
        }
        @keyframes _bc_count_up    { from{opacity:0;transform:translateY(4px)} to{opacity:1;transform:none} }
      `}</style>

      <section style={{
        position: "relative",
        fontFamily: "'Inter', ui-sans-serif, system-ui, sans-serif",
        borderRadius: "20px",
        overflow: "hidden",
        /* layered glass */
        background: `
          linear-gradient(160deg, rgba(13,217,170,0.04) 0%, transparent 40%),
          oklch(0.55 0.06 210 / 11%)
        `,
        backdropFilter: "blur(28px) saturate(180%) brightness(1.05)",
        WebkitBackdropFilter: "blur(28px) saturate(180%) brightness(1.05)",
        border: `1px solid ${cfg.border}`,
        boxShadow: `
          0 0 0 1px rgba(255,255,255,0.06) inset,
          0 1px 0 0 rgba(255,255,255,0.1) inset,
          0 8px 80px -20px ${cfg.glow},
          0 0 160px -60px ${cfg.glow}
        `,
        transition: "border-color 0.5s ease, box-shadow 0.6s ease",
        display: "flex",
        flexDirection: "column",
      }}>

        {/* ── subtle dot-grid texture overlay ── */}
        <div aria-hidden style={{
          position: "absolute", inset: 0, pointerEvents: "none", zIndex: 0,
          backgroundImage: `radial-gradient(circle, rgba(255,255,255,0.04) 1px, transparent 1px)`,
          backgroundSize: "20px 20px",
          maskImage: "radial-gradient(ellipse 80% 80% at 50% 50%, black 30%, transparent 100%)",
        }} />

        {/* ── top gradient glow line ── */}
        <div aria-hidden style={{
          position: "absolute", top: 0, left: 0, right: 0, height: "2px",
          background: `linear-gradient(90deg, transparent 0%, ${cfg.color}90 30%, ${cfg.color} 50%, ${cfg.color}90 70%, transparent 100%)`,
          boxShadow: `0 0 12px 2px ${cfg.color}60`,
          zIndex: 5, pointerEvents: "none",
          transition: "background 0.5s, box-shadow 0.5s",
        }} />

        {/* ── ambient orb ── */}
        <div aria-hidden className="a" style={{
          position: "absolute", top: "-80px", right: "-60px",
          width: "300px", height: "280px", borderRadius: "50%",
          background: `radial-gradient(ellipse at center, ${cfg.glow} 0%, transparent 70%)`,
          pointerEvents: "none", zIndex: 0,
          animation: "_bc_breathe 3s ease-in-out infinite",
          transition: "background 0.6s ease",
        }} />
        {/* secondary orb — bottom left */}
        <div aria-hidden style={{
          position: "absolute", bottom: "-60px", left: "-40px",
          width: "200px", height: "180px", borderRadius: "50%",
          background: `radial-gradient(ellipse at center, rgba(13,217,170,0.08) 0%, transparent 70%)`,
          pointerEvents: "none", zIndex: 0,
        }} />

        {/* ══════════════════════════════════
            HEADER
        ══════════════════════════════════ */}
        <div style={{
          position: "relative", zIndex: 2,
          display: "flex", alignItems: "center", justifyContent: "space-between",
          padding: "18px 20px 14px",
          flexWrap: "wrap", gap: "12px",
          borderBottom: "1px solid rgba(255,255,255,0.055)",
        }}>
          {/* Icon + title */}
          <div style={{ display: "flex", alignItems: "center", gap: "13px" }}>
            <div style={{ position: "relative", flexShrink: 0 }}>
              <CoinIcon symbol="BTC" size={42} />
              {/* ring pulse */}
              {d && <span style={{
                position: "absolute", inset: "-4px", borderRadius: "50%",
                border: `1.5px solid ${cfg.color}60`,
                animation: "_bc_ring_expand 2.5s ease-out infinite",
              }} />}
              {/* static ring */}
              <span style={{
                position: "absolute", inset: "-2px", borderRadius: "50%",
                border: `1px solid ${cfg.color}30`,
                pointerEvents: "none",
              }} />
            </div>

            <div>
              <div style={{ display: "flex", alignItems: "center", gap: "9px", marginBottom: "3px" }}>
                <span style={{
                  fontSize: "15px", fontWeight: 800,
                  background: `linear-gradient(90deg, rgba(255,255,255,0.95), rgba(255,255,255,0.65))`,
                  WebkitBackgroundClip: "text", WebkitTextFillColor: "transparent",
                  backgroundClip: "text", letterSpacing: "-0.015em",
                }}>
                  BTC Crash Monitor
                </span>
                {/* LIVE chip */}
                <span style={{
                  display: "inline-flex", alignItems: "center", gap: "5px",
                  padding: "3px 9px", borderRadius: "999px",
                  background: "rgba(13,217,170,0.1)",
                  border: "1px solid rgba(13,217,170,0.32)",
                  boxShadow: "0 0 10px -2px rgba(13,217,170,0.3)",
                  fontSize: "8px", fontWeight: 900, letterSpacing: "0.14em",
                  color: "#0dd9aa", textTransform: "uppercase",
                }}>
                  <span style={{
                    width: "5px", height: "5px", borderRadius: "50%",
                    background: "#0dd9aa", boxShadow: "0 0 5px #0dd9aa",
                    animation: "_bc_blink 1.5s ease-in-out infinite",
                    display: "inline-block",
                  }} />
                  LIVE
                </span>
              </div>
              <div style={{
                fontSize: "10px", color: "rgba(255,255,255,0.25)",
                fontWeight: 500, letterSpacing: "0.01em",
              }}>
                {d ? `updated ${age}` : "waiting for bot data…"}
              </div>
            </div>
          </div>

          {/* Status badge — right */}
          <div style={{
            padding: "8px 16px",
            borderRadius: "12px",
            background: `linear-gradient(135deg, ${cfg.color}18, ${cfg.color}08)`,
            border: `1px solid ${cfg.border}`,
            boxShadow: `0 0 20px -4px ${cfg.glow}, inset 0 1px 0 ${cfg.color}20`,
            display: "flex", flexDirection: "column", alignItems: "center",
            minWidth: "80px",
            transition: "all 0.5s ease",
          }}>
            <div style={{
              display: "flex", alignItems: "center", gap: "6px",
              fontSize: "12px", fontWeight: 900,
              letterSpacing: "0.1em", color: cfg.color,
              textShadow: `0 0 12px ${cfg.color}80`,
              textTransform: "uppercase",
            }}>
              <span style={{
                width: "6px", height: "6px", borderRadius: "50%",
                background: cfg.color, boxShadow: `0 0 8px ${cfg.color}`,
                animation: "_bc_blink 1.8s ease-in-out infinite",
              }} />
              {d ? cfg.label : "OFFLINE"}
            </div>
            {d && (
              <div style={{
                fontSize: "7px", fontWeight: 700, marginTop: "2px",
                color: `${cfg.color}80`, letterSpacing: "0.1em", textTransform: "uppercase",
              }}>
                {cfg.sub}
              </div>
            )}
          </div>
        </div>

        {/* ══════════════════════════════════
            PRICE HERO
        ══════════════════════════════════ */}
        <div style={{
          position: "relative", zIndex: 2,
          padding: "20px 20px 18px",
          borderBottom: "1px solid rgba(255,255,255,0.05)",
          background: "linear-gradient(180deg, rgba(255,255,255,0.018) 0%, transparent 100%)",
        }}>
          <div style={{
            fontSize: "9px", fontWeight: 700, letterSpacing: "0.18em",
            textTransform: "uppercase", color: "rgba(255,255,255,0.22)",
            marginBottom: "8px",
          }}>
            Bitcoin · Live Price
          </div>

          {/* Price row */}
          <div style={{ display: "flex", alignItems: "center", gap: "14px", marginBottom: "18px" }}>
            <span
              key={flash}
              style={{
                fontSize: "50px", fontWeight: 900, lineHeight: 1,
                fontVariantNumeric: "tabular-nums", letterSpacing: "-0.04em",
                color: priceColor,
                transition: "color 0.4s ease",
                textShadow: flash
                  ? `0 0 40px ${priceColor}80, 0 0 80px ${priceColor}30`
                  : `0 0 20px ${priceColor}30`,
                animation: flash ? "_bc_price_flash 0.7s ease both, _bc_price_tick 0.25s ease both" : "none",
              }}
            >
              {price ? `$${fmt2(price)}` : "—"}
            </span>

            {/* trend arrow */}
            <div style={{
              display: "flex", flexDirection: "column", alignItems: "center",
              opacity: flash ? 1 : 0.25, transition: "opacity 0.4s",
            }}>
              <svg width="16" height="24" viewBox="0 0 16 24" fill="none">
                <path
                  d={flash === "down" ? "M8 20 L2 10 L14 10 Z" : "M8 4 L14 14 L2 14 Z"}
                  fill={flash === "down" ? "#ef4444" : "#0dd9aa"}
                  style={{ filter: `drop-shadow(0 0 6px ${flash === "down" ? "#ef4444" : "#0dd9aa"})` }}
                />
              </svg>
            </div>
          </div>

          {/* Quick stats — 4 columns */}
          <div style={{
            display: "grid", gridTemplateColumns: "repeat(4,1fr)",
            gap: "0",
            borderRadius: "12px",
            border: "1px solid rgba(255,255,255,0.06)",
            overflow: "hidden",
            background: "rgba(0,0,0,0.2)",
          }}>
            {[
              {
                label: "SPEED",
                value: !d ? "—" : `${d.speed > 0 ? "+" : ""}${d.speed.toFixed(2)}%`,
                unit: "/min",
                color: !d ? "rgba(255,255,255,0.18)" : d.speed > 0 ? "#0dd9aa" : d.speed < 0 ? "#ef4444" : "rgba(255,255,255,0.4)",
              },
              {
                label: "VOLATILITY",
                value: !d ? "—" : `${d.volatility.toFixed(2)}%`,
                color: !d ? "rgba(255,255,255,0.18)" : (d.volatility >= 4 ? "#ef4444" : d.volatility >= 2.5 ? "#f97316" : "rgba(255,255,255,0.75)"),
              },
              {
                label: "CONSEC DROPS",
                value: !d ? "—" : String(consec),
                color: !d ? "rgba(255,255,255,0.18)" : (consec >= 5 ? "#ef4444" : consec >= 3 ? "#f97316" : "rgba(255,255,255,0.75)"),
              },
              {
                label: "↑ VOL SPIKE",
                value: !d ? "—" : volSpike ? "YES" : "NO",
                color: !d ? "rgba(255,255,255,0.18)" : volSpike ? "#ef4444" : "#0dd9aa",
              },
            ].map(({ label, value, unit, color }, i, arr) => (
              <div key={label} style={{
                padding: "10px 12px",
                borderLeft: i > 0 ? "1px solid rgba(255,255,255,0.05)" : "none",
              }}>
                <div style={{
                  fontSize: "7.5px", fontWeight: 700, letterSpacing: "0.14em",
                  textTransform: "uppercase", color: "rgba(255,255,255,0.22)",
                  marginBottom: "4px",
                }}>{label}</div>
                <div style={{
                  fontSize: "14px", fontWeight: 900,
                  fontVariantNumeric: "tabular-nums", color,
                  letterSpacing: "-0.01em",
                  textShadow: color !== "rgba(255,255,255,0.18)" && color !== "rgba(255,255,255,0.75)" && color !== "rgba(255,255,255,0.4)"
                    ? `0 0 10px ${color}60` : "none",
                }}>
                  {value}
                  {unit && <span style={{ fontSize: "9px", fontWeight: 600, color: `${color}80`, marginLeft: "1px" }}>{unit}</span>}
                </div>
              </div>
            ))}
          </div>
        </div>

        {/* ══════════════════════════════════
            PRESSURE / DROP TABLE
        ══════════════════════════════════ */}
        <div style={{ position: "relative", zIndex: 2 }}>
          {/* Header row */}
          <div style={{
            display: "grid", gridTemplateColumns: "36px 1fr 90px 68px",
            padding: "10px 20px 6px",
            gap: "8px",
          }}>
            {["", "PRESSURE", "PEAK", "DROP"].map((h, i) => (
              <span key={i} style={{
                fontSize: "7.5px", fontWeight: 700, letterSpacing: "0.15em",
                textTransform: "uppercase", color: "rgba(255,255,255,0.18)",
                textAlign: i >= 2 ? "right" : "left",
              }}>{h}</span>
            ))}
          </div>

          {TF_ROWS.map(({ t, dk, pk }, idx) => {
            const pct  = d ? (d[dk] as number) : 0;
            const peak = d ? (d[pk] as number) : null;
            const col  = d ? dropCol(pct) : "rgba(255,255,255,0.1)";
            return (
              <div
                key={t}
                style={{
                  display: "grid", gridTemplateColumns: "36px 1fr 90px 68px",
                  gap: "8px", alignItems: "center",
                  padding: "8px 20px",
                  borderTop: "1px solid rgba(255,255,255,0.038)",
                  transition: "background 0.15s",
                  cursor: "default",
                }}
                onMouseEnter={e => (e.currentTarget.style.background = "rgba(255,255,255,0.025)")}
                onMouseLeave={e => (e.currentTarget.style.background = "transparent")}
              >
                <span style={{
                  fontSize: "11px", fontWeight: 800, letterSpacing: "0.01em",
                  color: "rgba(255,255,255,0.35)", fontVariantNumeric: "tabular-nums",
                }}>{t}</span>

                <PressureBars pct={pct} inactive={!d} />

                <span style={{
                  fontSize: "11px", fontWeight: 500, fontVariantNumeric: "tabular-nums",
                  color: d ? "rgba(255,255,255,0.4)" : "rgba(255,255,255,0.1)",
                  textAlign: "right",
                }}>
                  {d && peak ? `$${fmt2(peak)}` : "—"}
                </span>

                <span style={{
                  fontSize: "14px", fontWeight: 900, fontVariantNumeric: "tabular-nums",
                  color: col, textAlign: "right",
                  textShadow: d && pct >= 1 ? `0 0 12px ${col}80` : "none",
                  letterSpacing: "-0.01em",
                }}>
                  {d ? `-${pct.toFixed(2)}%` : "—"}
                </span>
              </div>
            );
          })}
        </div>

        {/* ══════════════════════════════════
            3-COL SIGNAL CARDS
        ══════════════════════════════════ */}
        <div style={{
          position: "relative", zIndex: 2,
          display: "grid", gridTemplateColumns: "1fr 1fr 1fr",
          gap: "8px", padding: "14px 14px 0",
          borderTop: "1px solid rgba(255,255,255,0.055)",
        }}>
          {/* Whale Sells */}
          {(() => {
            const lvl = !d ? "NORMAL" : whaleCount >= 3 ? "DANGER" : whaleCount >= 1 ? "WATCH" : "NORMAL";
            const col = LVL_COLOR[lvl];
            return (
              <SigCard
                icon="≋" title="Whale Sells"
                value={!d ? "—" : `${whaleCount} txn`}
                sub={d ? (whaleUsd > 0 ? `${fmtK(whaleUsd)} total` : "$0 total") : undefined}
                lvlColor={col} level={d ? lvl : undefined}
                danger={lvl === "DANGER" || lvl === "RISK"}
              />
            );
          })()}

          {/* Funding */}
          <SigCard
            icon="↗" title="Funding"
            value={!d ? "—" : fmtFnd(funding)}
            lvlColor={LVL_COLOR[fundingLvl]}
            level={d ? fundingLvl : undefined}
            danger={fundingLvl === "DANGER"}
          />

          {/* Liquidations */}
          <SigCard
            icon="↯" title="Liquidations"
            value={!d ? "—" : fmtK(liqUsd)}
            sub={d && liqLargest > 0 ? `largest ${fmtK(liqLargest)}` : undefined}
            lvlColor={LVL_COLOR[liqLvl]}
            level={d ? liqLvl : undefined}
            danger={liqLvl === "DANGER"}
          />
        </div>

        {/* ══════════════════════════════════
            WHALE NET FLOW — full-width
        ══════════════════════════════════ */}
        <div style={{
          position: "relative", zIndex: 2,
          margin: "12px 14px",
          padding: "13px 16px",
          borderRadius: "14px",
          background: `linear-gradient(135deg, ${netColor}08, rgba(255,255,255,0.025))`,
          border: `1px solid ${netColor}25`,
          boxShadow: `0 0 20px -8px ${netColor}40`,
          display: "flex", alignItems: "center", justifyContent: "space-between",
          flexWrap: "wrap", gap: "10px",
          transition: "all 0.4s ease",
        }}>
          <div style={{ display: "flex", alignItems: "center", gap: "8px" }}>
            <span style={{
              fontSize: "9px", fontWeight: 800, letterSpacing: "0.14em",
              textTransform: "uppercase", color: "rgba(255,255,255,0.28)",
            }}>
              $ Whale Net Flow
            </span>
            {/* B vs S small pills */}
            {d && (
              <div style={{ display: "flex", gap: "6px" }}>
                <span style={{
                  fontSize: "9px", fontWeight: 600, fontVariantNumeric: "tabular-nums",
                  padding: "1px 6px", borderRadius: "4px",
                  background: "rgba(13,217,170,0.1)", color: "#0dd9aa",
                }}>B {fmtK(whaleBuy)}</span>
                <span style={{
                  fontSize: "9px", fontWeight: 600, fontVariantNumeric: "tabular-nums",
                  padding: "1px 6px", borderRadius: "4px",
                  background: "rgba(239,68,68,0.1)", color: "#ef4444",
                }}>S {fmtK(whaleUsd)}</span>
              </div>
            )}
          </div>

          <div style={{ display: "flex", alignItems: "center", gap: "10px" }}>
            <span style={{
              fontSize: "22px", fontWeight: 900, fontVariantNumeric: "tabular-nums",
              letterSpacing: "-0.02em", color: netColor,
              textShadow: `0 0 20px ${netColor}70, 0 0 40px ${netColor}30`,
            }}>
              {!d ? "—" : `${whaleNet >= 0 ? "+" : "−"}${fmtK(Math.abs(whaleNet))}`}
            </span>
            {d && whaleNet !== 0 && (
              <span style={{
                fontSize: "9px", fontWeight: 600,
                color: "rgba(255,255,255,0.3)", letterSpacing: "0.04em",
              }}>
                {whaleNet < 0 ? "SELL pressure" : "BUY pressure"}
              </span>
            )}
            {d && <LvlBadge level={whaleNetLvl} />}
          </div>
        </div>

        {/* ══════════════════════════════════
            TRADING PAUSED BANNER
        ══════════════════════════════════ */}
        {isPaused && (
          <div style={{
            position: "relative", zIndex: 2,
            margin: "0 14px 14px",
            padding: "14px 16px",
            borderRadius: "14px",
            background: "linear-gradient(135deg, rgba(245,197,66,0.1), rgba(245,197,66,0.04))",
            border: "1px solid rgba(245,197,66,0.28)",
            boxShadow: "0 0 24px -8px rgba(245,197,66,0.3), inset 0 1px 0 rgba(245,197,66,0.15)",
            display: "flex", alignItems: "center", gap: "14px",
            animation: "_bc_slide_in 0.35s ease both",
          }}>
            {/* pause icon circle */}
            <div style={{
              width: "40px", height: "40px", borderRadius: "50%",
              background: "linear-gradient(135deg, rgba(245,197,66,0.2), rgba(245,197,66,0.08))",
              border: "1.5px solid rgba(245,197,66,0.40)",
              boxShadow: "0 0 16px rgba(245,197,66,0.25)",
              display: "flex", alignItems: "center", justifyContent: "center",
              flexShrink: 0,
            }}>
              <svg width="14" height="14" viewBox="0 0 14 14" fill="#f5c542">
                <rect x="2" y="2" width="3.5" height="10" rx="1.2" />
                <rect x="8.5" y="2" width="3.5" height="10" rx="1.2" />
              </svg>
            </div>

            <div style={{ minWidth: 0 }}>
              <div style={{ display: "flex", alignItems: "center", gap: "8px", marginBottom: "5px" }}>
                <span style={{
                  fontSize: "11px", fontWeight: 900, color: "#f5c542",
                  letterSpacing: "0.08em", textTransform: "uppercase",
                  textShadow: "0 0 10px rgba(245,197,66,0.5)",
                }}>
                  Trading Paused
                </span>
                <span style={{
                  padding: "2px 7px", borderRadius: "4px",
                  background: "rgba(245,197,66,0.15)",
                  border: "1px solid rgba(245,197,66,0.35)",
                  fontSize: "7px", fontWeight: 900,
                  color: "#f5c542", letterSpacing: "0.12em",
                  textTransform: "uppercase",
                }}>
                  BOT HALTED
                </span>
              </div>
              <div style={{
                fontSize: "11px", lineHeight: 1.6,
                color: "rgba(245,197,66,0.6)", wordBreak: "break-word",
              }}>
                {pauseReason}
              </div>
            </div>
          </div>
        )}

        {/* ── bottom glow line ── */}
        <div aria-hidden style={{
          height: "1px",
          background: `linear-gradient(90deg, transparent, ${cfg.color}25, transparent)`,
          transition: "background 0.5s",
        }} />
      </section>
    </>
  );
}
