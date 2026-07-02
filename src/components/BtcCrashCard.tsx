import { useEffect, useRef, useState } from "react";
import { CoinIcon } from "./CoinIcon";

const API_BASE = import.meta.env.VITE_API_BASE ?? "";

/* ─────────────────────────────────────────────────
   TYPES
───────────────────────────────────────────────── */
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

/* ─────────────────────────────────────────────────
   STAGE CONFIG  (teal primary theme)
───────────────────────────────────────────────── */
const STAGE: Record<string, { color: string; glow: string; border: string; bg: string; label: string; fullLabel: string }> = {
  SAFE:       { color: "#0dd9aa", glow: "rgba(13,217,170,0.22)",  border: "rgba(13,217,170,0.30)",  bg: "rgba(13,217,170,0.08)",  label: "SAFE",       fullLabel: "SAFE — OK TO TRADE ALTS" },
  WATCH:      { color: "#f5c542", glow: "rgba(245,197,66,0.22)",  border: "rgba(245,197,66,0.30)",  bg: "rgba(245,197,66,0.08)",  label: "WATCH",      fullLabel: "WATCH — BE SELECTIVE" },
  RISK:       { color: "#f97316", glow: "rgba(249,115,22,0.22)",  border: "rgba(249,115,22,0.30)",  bg: "rgba(249,115,22,0.08)",  label: "RISK",       fullLabel: "RISK — HOLD OFF NEW BUYS" },
  SELL_ALERT: { color: "#f87171", glow: "rgba(248,113,113,0.22)", border: "rgba(248,113,113,0.30)", bg: "rgba(248,113,113,0.08)", label: "ALERT",      fullLabel: "SELL ALERT — PAUSE BUYING" },
  DANGER:     { color: "#ef4444", glow: "rgba(239,68,68,0.28)",   border: "rgba(239,68,68,0.38)",   bg: "rgba(239,68,68,0.10)",   label: "DANGER",     fullLabel: "DANGER — CONSIDER SELLING" },
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

/* ─────────────────────────────────────────────────
   HELPERS
───────────────────────────────────────────────── */
function fmt2(n: number) {
  return n.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}
function fmtK(n: number) {
  if (n >= 1_000_000) return `$${(n / 1_000_000).toFixed(1)}M`;
  if (n >= 1_000)     return `$${(n / 1_000).toFixed(0)}K`;
  return `$${n.toFixed(0)}`;
}
function fmtFund(r: number) {
  return `${r >= 0 ? "+" : ""}${(r * 100).toFixed(4)}%`;
}
function timeSince(iso: string) {
  const s = Math.floor((Date.now() - new Date(iso).getTime()) / 1000);
  return s < 5 ? "just now" : s < 60 ? `${s}s ago` : `${Math.floor(s / 60)}m ${s % 60}s ago`;
}
function dropColor(pct: number) {
  if (pct >= 4) return "#ef4444";
  if (pct >= 2) return "#f97316";
  if (pct >= 1) return "#f5c542";
  return "#0dd9aa";
}

/* ─────────────────────────────────────────────────
   PRESSURE BARS  (vertical segments, like screenshot)
───────────────────────────────────────────────── */
function PressureBars({ pct, inactive }: { pct: number; inactive: boolean }) {
  const [rendered, setRendered] = useState(0);
  const color = inactive ? "rgba(239,68,68,0.2)" : dropColor(pct);
  const total = 10;
  const filled = inactive ? 0 : Math.round(Math.min(pct / 6, 1) * total);

  useEffect(() => {
    if (inactive) { setRendered(0); return; }
    setRendered(0);
    let i = 0;
    const step = () => {
      i++;
      setRendered(i);
      if (i < filled) requestAnimationFrame(step);
    };
    const t = setTimeout(() => requestAnimationFrame(step), 80);
    return () => clearTimeout(t);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [pct, inactive]);

  return (
    <div style={{ display: "flex", alignItems: "flex-end", gap: "2.5px", height: "20px" }}>
      {Array.from({ length: total }).map((_, i) => {
        const lit = i < rendered;
        const h = 8 + (i / (total - 1)) * 12; // bars get taller left→right
        return (
          <div
            key={i}
            style={{
              width: "5px",
              height: `${h}px`,
              borderRadius: "2px",
              background: lit ? color : "rgba(255,255,255,0.07)",
              boxShadow: lit ? `0 0 4px ${color}90` : "none",
              transition: "background 0.12s ease, box-shadow 0.12s ease",
            }}
          />
        );
      })}
    </div>
  );
}

/* ─────────────────────────────────────────────────
   LEVEL BADGE
───────────────────────────────────────────────── */
function LevelBadge({ level }: { level: string }) {
  const c = LVL_COLOR[level] ?? "#0dd9aa";
  return (
    <span style={{
      display: "inline-flex", alignItems: "center", gap: "4px",
      padding: "2px 7px", borderRadius: "4px",
      background: `${c}18`, border: `1px solid ${c}40`,
      color: c, fontSize: "8px", fontWeight: 900,
      letterSpacing: "0.1em", textTransform: "uppercase",
      flexShrink: 0,
    }}>
      {level}
    </span>
  );
}

/* ─────────────────────────────────────────────────
   MAIN
───────────────────────────────────────────────── */
export function BtcCrashCard() {
  const [snap, setSnap]         = useState<Snapshot | null>(null);
  const [age, setAge]           = useState("");
  const [price, setPrice]       = useState<number | null>(null);
  const [flash, setFlash]       = useState<"up" | "down" | null>(null);
  const [mounted, setMounted]   = useState(false);
  const prev                    = useRef<number | null>(null);

  useEffect(() => { setMounted(true); }, []);

  /* live BTC price */
  useEffect(() => {
    const ws = new WebSocket("wss://data-stream.binance.vision/ws/btcusdt@trade");
    ws.onmessage = (e) => {
      try {
        const p = parseFloat(JSON.parse(e.data).p);
        if (prev.current !== null && p !== prev.current)
          setFlash(p > prev.current ? "up" : "down");
        prev.current = p;
        setPrice(p);
      } catch {}
    };
    return () => ws.close();
  }, []);
  useEffect(() => {
    if (!flash) return;
    const t = setTimeout(() => setFlash(null), 600);
    return () => clearTimeout(t);
  }, [flash]);

  /* bot data */
  useEffect(() => {
    let alive = true;
    const go = async () => {
      try {
        const r = await fetch(`${API_BASE}/api/bot/data?key=btc`);
        if (r.ok && alive) setSnap(await r.json());
      } catch {}
    };
    go();
    const id = setInterval(go, 3000);
    return () => { alive = false; clearInterval(id); };
  }, []);
  useEffect(() => {
    if (!snap?.updatedAt) return;
    const id = setInterval(() => setAge(timeSince(snap.updatedAt!)), 1000);
    setAge(timeSince(snap.updatedAt));
    return () => clearInterval(id);
  }, [snap?.updatedAt]);

  /* derived */
  const d        = snap?.data;
  const stage    = d?.status ?? "SAFE";
  const cfg      = STAGE[stage] ?? STAGE.SAFE;
  const isPaused = d?.trade_mode === "Pause";

  const pauseReason = (() => {
    if (!d) return "";
    if (d.pause_reason?.trim()) return d.pause_reason.trim();
    const rows: [string, number][] = [
      ["1 min", d.drop_1m], ["5 min", d.drop_5m], ["15 min", d.drop_15m],
      ["1 hr",  d.drop_1h], ["4 hr",  d.drop_4h],
    ];
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

  const priceColor =
    flash === "up"   ? "#0dd9aa" :
    flash === "down" ? "#ef4444" : "#0dd9aa";

  const netColor = LVL_COLOR[whaleNetLvl] ?? "#0dd9aa";

  /* ── render ── */
  return (
    <>
      <style>{`
        @keyframes _p_blink  { 0%,100%{opacity:1} 50%{opacity:.15} }
        @keyframes _p_glow   { 0%,100%{box-shadow:0 0 8px 2px var(--gc)} 50%{box-shadow:0 0 18px 5px var(--gc)} }
        @keyframes _p_in     { from{opacity:0;transform:translateY(5px)} to{opacity:1;transform:none} }
        @keyframes _p_flash_up   { 0%{text-shadow:0 0 30px #0dd9aa,0 0 60px #0dd9aa80} 100%{text-shadow:none} }
        @keyframes _p_flash_down { 0%{text-shadow:0 0 30px #ef4444,0 0 60px #ef444480} 100%{text-shadow:none} }
        @keyframes _p_pricetick  { 0%{transform:scale(1.015)} 100%{transform:scale(1)} }
        @keyframes _p_pulse_ring { 0%{transform:scale(1);opacity:.6} 100%{transform:scale(1.6);opacity:0} }
        @keyframes _p_status_in  { from{opacity:0;transform:scale(.96)} to{opacity:1;transform:scale(1)} }

        ._p_dot_live {
          animation: _p_blink 1.4s ease-in-out infinite;
        }
        ._p_card_in {
          animation: _p_in 0.35s ease both;
        }
      `}</style>

      <section
        className="_p_card_in"
        style={{
          fontFamily: "'Inter', ui-sans-serif, system-ui, sans-serif",
          position: "relative",
          borderRadius: "18px",
          overflow: "hidden",
          /* glass card matching dashboard theme */
          background: "oklch(0.55 0.06 210 / 10%)",
          backdropFilter: "blur(24px) saturate(160%)",
          WebkitBackdropFilter: "blur(24px) saturate(160%)",
          border: `1px solid ${cfg.border}`,
          boxShadow: `0 0 0 1px rgba(255,255,255,0.04) inset, 0 4px 60px -16px ${cfg.glow}, 0 0 0 1px ${cfg.border} inset`,
          transition: "border-color 0.5s ease, box-shadow 0.5s ease",
          display: "flex",
          flexDirection: "column",
        }}
      >
        {/* top shimmer line */}
        <div style={{
          position: "absolute", top: 0, left: 0, right: 0, height: "1px",
          background: `linear-gradient(90deg, transparent 0%, ${cfg.color}80 50%, transparent 100%)`,
          pointerEvents: "none", zIndex: 5,
          transition: "background 0.5s ease",
        }} />

        {/* ambient glow orb */}
        <div style={{
          position: "absolute", top: "-50px", right: "-30px",
          width: "240px", height: "200px", borderRadius: "50%",
          background: `radial-gradient(ellipse, ${cfg.glow} 0%, transparent 70%)`,
          pointerEvents: "none", zIndex: 0,
          transition: "background 0.5s ease",
        }} />

        {/* ═══════════════════════════════
            HEADER
        ═══════════════════════════════ */}
        <div style={{
          position: "relative", zIndex: 2,
          display: "flex", alignItems: "center", justifyContent: "space-between",
          padding: "16px 18px 14px",
          flexWrap: "wrap", gap: "10px",
        }}>
          {/* Left: icon + title + live dot */}
          <div style={{ display: "flex", alignItems: "center", gap: "12px" }}>
            <div style={{ position: "relative", flexShrink: 0 }}>
              <CoinIcon symbol="BTC" size={40} />
              {/* pulse ring on icon */}
              {d && (
                <span style={{
                  position: "absolute", inset: "-3px", borderRadius: "50%",
                  border: `1.5px solid ${cfg.color}`,
                  animation: "_p_pulse_ring 2.2s ease-out infinite",
                }} />
              )}
            </div>
            <div>
              <div style={{ display: "flex", alignItems: "center", gap: "8px" }}>
                <span style={{
                  fontSize: "15px", fontWeight: 800,
                  color: "rgba(255,255,255,0.92)", letterSpacing: "-0.015em",
                }}>
                  BTC Crash Monitor
                </span>
                {/* LIVE badge */}
                <span style={{
                  display: "inline-flex", alignItems: "center", gap: "4px",
                  padding: "2px 8px", borderRadius: "999px",
                  background: "rgba(13,217,170,0.12)",
                  border: "1px solid rgba(13,217,170,0.35)",
                  fontSize: "9px", fontWeight: 900,
                  letterSpacing: "0.12em", color: "#0dd9aa",
                  textTransform: "uppercase",
                }}>
                  <span className="_p_dot_live" style={{
                    width: "5px", height: "5px", borderRadius: "50%",
                    background: "#0dd9aa",
                    boxShadow: "0 0 5px #0dd9aa",
                    display: "inline-block",
                  }} />
                  LIVE
                </span>
              </div>
              <div style={{
                fontSize: "10px", color: "rgba(255,255,255,0.28)",
                marginTop: "3px", fontWeight: 500,
                display: "flex", alignItems: "center", gap: "5px",
              }}>
                <span className="_p_dot_live" style={{
                  display: "inline-block", width: "5px", height: "5px",
                  borderRadius: "50%",
                  background: d ? cfg.color : "rgba(255,255,255,0.2)",
                  boxShadow: d ? `0 0 4px ${cfg.color}` : "none",
                }} />
                {d ? `updated ${age}` : "waiting for bot data…"}
              </div>
            </div>
          </div>

          {/* Right: status badge */}
          <div
            style={{
              display: "flex", flexDirection: "column", alignItems: "flex-end",
              padding: "7px 14px", borderRadius: "10px",
              background: cfg.bg,
              border: `1px solid ${cfg.border}`,
              boxShadow: `0 0 18px -4px ${cfg.glow}`,
              transition: "all 0.5s ease",
              animation: d ? "_p_status_in 0.3s ease both" : "none",
            }}
          >
            <div style={{
              fontSize: "11px", fontWeight: 900,
              letterSpacing: "0.1em", textTransform: "uppercase",
              color: cfg.color,
              display: "flex", alignItems: "center", gap: "6px",
            }}>
              <span style={{
                width: "6px", height: "6px", borderRadius: "50%",
                background: cfg.color,
                boxShadow: `0 0 6px ${cfg.color}`,
                animation: "_p_blink 1.6s ease-in-out infinite",
              }} />
              {d ? cfg.label : "OFFLINE"}
            </div>
            {d && (
              <div style={{
                fontSize: "8px", color: `${cfg.color}90`,
                marginTop: "1px", letterSpacing: "0.06em",
                textTransform: "uppercase", fontWeight: 600,
              }}>
                {cfg.fullLabel.split("—")[1]?.trim()}
              </div>
            )}
          </div>
        </div>

        {/* ═══════════════════════════════
            PRICE + QUICK STATS
        ═══════════════════════════════ */}
        <div style={{
          position: "relative", zIndex: 2,
          padding: "10px 18px 16px",
          borderBottom: "1px solid rgba(255,255,255,0.06)",
        }}>
          {/* Big price */}
          <div style={{
            display: "flex", alignItems: "center", gap: "12px",
            marginBottom: "14px",
          }}>
            <span style={{
              fontSize: "42px", fontWeight: 900,
              fontVariantNumeric: "tabular-nums",
              letterSpacing: "-0.04em", lineHeight: 1,
              color: priceColor,
              transition: "color 0.35s ease",
              animation: flash === "up" ? "_p_flash_up 0.6s ease both, _p_pricetick 0.25s ease both"
                       : flash === "down" ? "_p_flash_down 0.6s ease both, _p_pricetick 0.25s ease both"
                       : "none",
            }}>
              {price ? `$${fmt2(price)}` : "—"}
            </span>
            {/* trend arrow */}
            {d && (
              <svg width="20" height="20" viewBox="0 0 20 20" fill="none"
                style={{ transition: "transform 0.3s ease" }}
              >
                <path
                  d={flash === "down"
                    ? "M10 4 L16 14 L4 14 Z"
                    : "M10 16 L4 6 L16 6 Z"}
                  fill={flash === "down" ? "#ef4444" : "#0dd9aa"}
                  style={{ filter: `drop-shadow(0 0 4px ${flash === "down" ? "#ef4444" : "#0dd9aa"})` }}
                />
              </svg>
            )}
          </div>

          {/* Quick stats row: Speed | Volatility | Consec Drops | Vol Spike */}
          <div style={{ display: "flex", gap: "20px", flexWrap: "wrap" }}>
            {[
              {
                label: "SPEED",
                value: !d ? "—" : `${d.speed > 0 ? "+" : ""}${d.speed.toFixed(2)}%/min`,
                color: !d ? "rgba(255,255,255,0.2)"
                  : d.speed > 0 ? "#0dd9aa"
                  : d.speed < 0 ? "#ef4444"
                  : "rgba(255,255,255,0.4)",
              },
              {
                label: "VOLATILITY",
                value: !d ? "—" : `${d.volatility.toFixed(2)}%`,
                color: !d ? "rgba(255,255,255,0.2)"
                  : d.volatility >= 4 ? "#ef4444"
                  : d.volatility >= 2.5 ? "#f97316"
                  : "rgba(255,255,255,0.75)",
              },
              {
                label: "CONSEC DROPS",
                value: !d ? "—" : String(consec),
                color: !d ? "rgba(255,255,255,0.2)"
                  : consec >= 5 ? "#ef4444"
                  : consec >= 3 ? "#f97316"
                  : "rgba(255,255,255,0.75)",
              },
              {
                label: "↑ VOL SPIKE",
                value: !d ? "—" : volSpike ? "YES" : "NO",
                color: !d ? "rgba(255,255,255,0.2)"
                  : volSpike ? "#ef4444" : "#0dd9aa",
              },
            ].map(({ label, value, color }) => (
              <div key={label}>
                <div style={{
                  fontSize: "8px", fontWeight: 700, letterSpacing: "0.14em",
                  color: "rgba(255,255,255,0.25)", textTransform: "uppercase",
                  marginBottom: "3px",
                }}>{label}</div>
                <div style={{
                  fontSize: "13px", fontWeight: 800,
                  fontVariantNumeric: "tabular-nums", color,
                  letterSpacing: "-0.01em",
                }}>{value}</div>
              </div>
            ))}
          </div>
        </div>

        {/* ═══════════════════════════════
            PRESSURE / DROP TABLE
        ═══════════════════════════════ */}
        <div style={{ position: "relative", zIndex: 2, padding: "0" }}>
          {/* column headers */}
          <div style={{
            display: "grid",
            gridTemplateColumns: "34px 1fr 88px 64px",
            gap: "8px",
            padding: "10px 18px 6px",
            borderBottom: "1px solid rgba(255,255,255,0.04)",
          }}>
            {["", "PRESSURE", "PEAK", "DROP"].map((h, i) => (
              <span key={i} style={{
                fontSize: "8px", fontWeight: 700, letterSpacing: "0.14em",
                textTransform: "uppercase", color: "rgba(255,255,255,0.2)",
                textAlign: i >= 2 ? "right" : "left",
              }}>{h}</span>
            ))}
          </div>

          <div style={{ display: "flex", flexDirection: "column" }}>
            {TF_ROWS.map(({ t, dk, pk }, idx) => {
              const pct  = d ? (d[dk] as number) : 0;
              const peak = d ? (d[pk] as number) : null;
              const col  = d ? dropColor(pct) : "rgba(255,255,255,0.12)";
              const isLast = idx === TF_ROWS.length - 1;

              return (
                <div
                  key={t}
                  style={{
                    display: "grid",
                    gridTemplateColumns: "34px 1fr 88px 64px",
                    gap: "8px",
                    alignItems: "center",
                    padding: "9px 18px",
                    borderBottom: isLast ? "none" : "1px solid rgba(255,255,255,0.04)",
                    transition: "background 0.15s ease",
                  }}
                  onMouseEnter={e => (e.currentTarget.style.background = "rgba(255,255,255,0.025)")}
                  onMouseLeave={e => (e.currentTarget.style.background = "transparent")}
                >
                  {/* TF label */}
                  <span style={{
                    fontSize: "11px", fontWeight: 800,
                    color: "rgba(255,255,255,0.35)",
                    fontVariantNumeric: "tabular-nums",
                  }}>{t}</span>

                  {/* Pressure bars */}
                  <PressureBars pct={pct} inactive={!d} />

                  {/* Peak price */}
                  <span style={{
                    fontSize: "11px", fontWeight: 600,
                    fontVariantNumeric: "tabular-nums",
                    color: d ? "rgba(255,255,255,0.45)" : "rgba(255,255,255,0.12)",
                    textAlign: "right",
                  }}>
                    {d && peak ? `$${fmt2(peak)}` : "—"}
                  </span>

                  {/* Drop % */}
                  <span style={{
                    fontSize: "13px", fontWeight: 900,
                    fontVariantNumeric: "tabular-nums",
                    color: col,
                    textAlign: "right",
                    textShadow: d && pct >= 1 ? `0 0 10px ${col}70` : "none",
                  }}>
                    {d ? `-${pct.toFixed(2)}%` : "—"}
                  </span>
                </div>
              );
            })}
          </div>
        </div>

        {/* ═══════════════════════════════
            3-COL SIGNAL CARDS
            Whale Sells | Funding | Liquidations
        ═══════════════════════════════ */}
        <div style={{
          position: "relative", zIndex: 2,
          display: "grid", gridTemplateColumns: "1fr 1fr 1fr",
          gap: "8px",
          padding: "14px 14px",
          borderTop: "1px solid rgba(255,255,255,0.06)",
        }}>
          {/* ── Whale Sells ── */}
          {(() => {
            const col = !d ? "rgba(255,255,255,0.15)"
              : whaleCount >= 3 ? "#ef4444"
              : whaleCount >= 1 ? "#f97316"
              : "#0dd9aa";
            const lvl = !d ? "NORMAL" : whaleCount >= 3 ? "DANGER" : whaleCount >= 1 ? "WATCH" : "NORMAL";
            return (
              <div style={{
                borderRadius: "12px",
                border: "1px solid rgba(255,255,255,0.07)",
                background: "rgba(255,255,255,0.03)",
                padding: "12px",
                display: "flex", flexDirection: "column", gap: "5px",
              }}>
                <div style={{
                  display: "flex", alignItems: "center", justifyContent: "space-between",
                  marginBottom: "2px",
                }}>
                  <span style={{
                    fontSize: "8px", fontWeight: 800,
                    color: "rgba(255,255,255,0.3)", letterSpacing: "0.1em",
                    textTransform: "uppercase",
                  }}>≋ Whale Sells</span>
                  {d && <LevelBadge level={lvl} />}
                </div>
                <div style={{
                  fontSize: "26px", fontWeight: 900,
                  fontVariantNumeric: "tabular-nums",
                  color: col, lineHeight: 1,
                  textShadow: whaleCount >= 3 ? `0 0 14px ${col}80` : "none",
                }}>
                  {!d ? "—" : `${whaleCount} txn`}
                </div>
                {d && (
                  <div style={{
                    fontSize: "10px", color: "rgba(255,255,255,0.3)",
                    fontVariantNumeric: "tabular-nums",
                  }}>
                    {whaleUsd > 0 ? `${fmtK(whaleUsd)} total` : "$0 total"}
                  </div>
                )}
              </div>
            );
          })()}

          {/* ── Funding Rate ── */}
          {(() => {
            const col = !d ? "rgba(255,255,255,0.15)" : LVL_COLOR[fundingLvl] ?? "#0dd9aa";
            return (
              <div style={{
                borderRadius: "12px",
                border: "1px solid rgba(255,255,255,0.07)",
                background: "rgba(255,255,255,0.03)",
                padding: "12px",
                display: "flex", flexDirection: "column", gap: "5px",
              }}>
                <div style={{
                  display: "flex", alignItems: "center", justifyContent: "space-between",
                  marginBottom: "2px",
                }}>
                  <span style={{
                    fontSize: "8px", fontWeight: 800,
                    color: "rgba(255,255,255,0.3)", letterSpacing: "0.1em",
                    textTransform: "uppercase",
                  }}>↗ Funding</span>
                  {d && <LevelBadge level={fundingLvl} />}
                </div>
                <div style={{
                  fontSize: "22px", fontWeight: 900,
                  fontVariantNumeric: "tabular-nums",
                  color: col, lineHeight: 1,
                }}>
                  {!d ? "—" : fmtFund(funding)}
                </div>
              </div>
            );
          })()}

          {/* ── Liquidations ── */}
          {(() => {
            const col = !d ? "rgba(255,255,255,0.15)" : LVL_COLOR[liqLvl] ?? "#0dd9aa";
            return (
              <div style={{
                borderRadius: "12px",
                border: "1px solid rgba(255,255,255,0.07)",
                background: "rgba(255,255,255,0.03)",
                padding: "12px",
                display: "flex", flexDirection: "column", gap: "5px",
              }}>
                <div style={{
                  display: "flex", alignItems: "center", justifyContent: "space-between",
                  marginBottom: "2px",
                }}>
                  <span style={{
                    fontSize: "8px", fontWeight: 800,
                    color: "rgba(255,255,255,0.3)", letterSpacing: "0.1em",
                    textTransform: "uppercase",
                  }}>↯ Liquidations</span>
                  {d && <LevelBadge level={liqLvl} />}
                </div>
                <div style={{
                  fontSize: "22px", fontWeight: 900,
                  fontVariantNumeric: "tabular-nums",
                  color: col, lineHeight: 1,
                  textShadow: liqLvl === "DANGER" ? `0 0 14px ${col}80` : "none",
                }}>
                  {!d ? "—" : fmtK(liqUsd)}
                </div>
                {d && liqLargest > 0 && (
                  <div style={{
                    fontSize: "10px", color: "rgba(255,255,255,0.3)",
                    fontVariantNumeric: "tabular-nums",
                  }}>
                    largest {fmtK(liqLargest)}
                  </div>
                )}
              </div>
            );
          })()}
        </div>

        {/* ═══════════════════════════════
            WHALE NET FLOW — full width row
        ═══════════════════════════════ */}
        <div style={{
          position: "relative", zIndex: 2,
          display: "flex", alignItems: "center", justifyContent: "space-between",
          padding: "12px 18px",
          borderTop: "1px solid rgba(255,255,255,0.06)",
          flexWrap: "wrap", gap: "8px",
        }}>
          <div style={{
            display: "flex", alignItems: "center", gap: "8px",
          }}>
            <span style={{
              fontSize: "9px", fontWeight: 800,
              color: "rgba(255,255,255,0.3)", letterSpacing: "0.12em",
              textTransform: "uppercase",
            }}>
              $ Whale Net Flow
            </span>
          </div>

          <div style={{ display: "flex", alignItems: "center", gap: "10px" }}>
            {/* Buy vs Sell mini */}
            {d && (
              <div style={{ display: "flex", gap: "10px" }}>
                <span style={{ fontSize: "10px", color: "#0dd9aa", fontVariantNumeric: "tabular-nums", fontWeight: 600 }}>
                  B {fmtK(whaleBuy)}
                </span>
                <span style={{ color: "rgba(255,255,255,0.2)", fontSize: "10px" }}>·</span>
                <span style={{ fontSize: "10px", color: "#ef4444", fontVariantNumeric: "tabular-nums", fontWeight: 600 }}>
                  S {fmtK(whaleUsd)}
                </span>
              </div>
            )}

            {/* Net value */}
            <div style={{ display: "flex", alignItems: "center", gap: "6px" }}>
              <span style={{
                fontSize: "18px", fontWeight: 900,
                fontVariantNumeric: "tabular-nums",
                color: netColor,
                textShadow: whaleNetLvl !== "NORMAL" ? `0 0 12px ${netColor}80` : "none",
                letterSpacing: "-0.02em",
              }}>
                {!d ? "—" : `${whaleNet >= 0 ? "+" : "−"}${fmtK(Math.abs(whaleNet))}`}
              </span>
              {d && whaleNetLvl !== "NORMAL" && (
                <span style={{
                  fontSize: "8px", color: "rgba(255,255,255,0.35)",
                  fontWeight: 600, letterSpacing: "0.04em",
                }}>
                  ({whaleNet < 0 ? "SELL pressure" : "BUY pressure"})
                </span>
              )}
              {d && <LevelBadge level={whaleNetLvl} />}
            </div>
          </div>
        </div>

        {/* ═══════════════════════════════
            TRADING PAUSED BANNER
        ═══════════════════════════════ */}
        {isPaused && (
          <div style={{
            position: "relative", zIndex: 2,
            display: "flex", alignItems: "center", gap: "14px",
            margin: "0 14px 14px",
            padding: "14px 16px",
            borderRadius: "12px",
            border: "1px solid rgba(245,197,66,0.30)",
            background: "rgba(245,197,66,0.06)",
            animation: "_p_in 0.3s ease both",
          }}>
            {/* pause icon */}
            <div style={{
              width: "36px", height: "36px", borderRadius: "50%",
              background: "rgba(245,197,66,0.15)",
              border: "1.5px solid rgba(245,197,66,0.35)",
              display: "flex", alignItems: "center", justifyContent: "center",
              flexShrink: 0,
              boxShadow: "0 0 12px rgba(245,197,66,0.2)",
            }}>
              <svg width="14" height="14" viewBox="0 0 14 14" fill="#f5c542">
                <rect x="2" y="2" width="4" height="10" rx="1" />
                <rect x="8" y="2" width="4" height="10" rx="1" />
              </svg>
            </div>
            <div style={{ minWidth: 0 }}>
              <div style={{ display: "flex", alignItems: "center", gap: "8px", marginBottom: "4px" }}>
                <span style={{
                  fontSize: "10px", fontWeight: 900, color: "#f5c542",
                  letterSpacing: "0.1em", textTransform: "uppercase",
                }}>
                  Trading Paused
                </span>
                <span style={{
                  fontSize: "8px", fontWeight: 800,
                  padding: "2px 6px", borderRadius: "4px",
                  background: "rgba(245,197,66,0.15)",
                  border: "1px solid rgba(245,197,66,0.30)",
                  color: "#f5c542", letterSpacing: "0.08em",
                  textTransform: "uppercase",
                }}>
                  BOT HALTED
                </span>
              </div>
              <div style={{
                fontSize: "11px", color: "rgba(245,197,66,0.65)",
                lineHeight: 1.6, wordBreak: "break-word",
              }}>
                {pauseReason}
              </div>
            </div>
          </div>
        )}

        {/* bottom shimmer */}
        <div style={{
          height: "1px",
          background: `linear-gradient(90deg, transparent, ${cfg.color}30, transparent)`,
          transition: "background 0.5s ease",
        }} />
      </section>
    </>
  );
}
