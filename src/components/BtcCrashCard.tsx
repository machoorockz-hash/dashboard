import { useEffect, useRef, useState } from "react";
import { CoinIcon } from "./CoinIcon";

const API_BASE = import.meta.env.VITE_API_BASE ?? "";

/* ─────────────────────────────── types ─────────────────────────────── */
interface BotData {
  price: number;
  drop_1m: number; drop_5m: number; drop_15m: number; drop_1h: number; drop_4h: number;
  peak_1m: number; peak_5m: number; peak_15m: number; peak_1h: number; peak_4h: number;
  speed: number; volatility: number; status: string; trade_mode?: string;
  pause_reason?: string;
  whale_count?: number; whale_usd_total?: number; whale_buy_total?: number;
  whale_net_flow?: number; whale_net_flow_level?: string;
  consec_drops?: number; vol_spike?: boolean;
  funding_rate?: number; funding_level?: string;
  liq_usd_60s?: number; liq_level?: string; liq_largest?: number;
}
interface Snapshot { key: string; updatedAt: string | null; data: BotData | null; }

/* ─────────────────────────────── constants ──────────────────────────── */
const STATUS: Record<string, { color: string; dim: string; label: string; short: string }> = {
  SAFE:       { color: "#00e5a0", dim: "rgba(0,229,160,0.15)",  label: "SAFE — OK TO TRADE ALTS",    short: "SAFE" },
  WATCH:      { color: "#fbbf24", dim: "rgba(251,191,36,0.15)", label: "WATCH — BE SELECTIVE",        short: "WATCH" },
  RISK:       { color: "#fb923c", dim: "rgba(251,146,60,0.15)", label: "RISK — HOLD OFF NEW BUYS",    short: "RISK" },
  SELL_ALERT: { color: "#f87171", dim: "rgba(248,113,113,0.15)",label: "SELL ALERT — PAUSE BUYING",   short: "ALERT" },
  DANGER:     { color: "#ef4444", dim: "rgba(239,68,68,0.18)",  label: "DANGER — CONSIDER SELLING",  short: "DANGER" },
};

const TF = [
  { label: "1m",  dk: "drop_1m"  as keyof BotData, pk: "peak_1m"  as keyof BotData },
  { label: "5m",  dk: "drop_5m"  as keyof BotData, pk: "peak_5m"  as keyof BotData },
  { label: "15m", dk: "drop_15m" as keyof BotData, pk: "peak_15m" as keyof BotData },
  { label: "1h",  dk: "drop_1h"  as keyof BotData, pk: "peak_1h"  as keyof BotData },
  { label: "4h",  dk: "drop_4h"  as keyof BotData, pk: "peak_4h"  as keyof BotData },
];

const LVL_COLOR: Record<string, string> = {
  NORMAL: "#00e5a0", WATCH: "#fbbf24", RISK: "#fb923c", DANGER: "#ef4444",
};

/* ─────────────────────────────── helpers ────────────────────────────── */
function fmtPrice(p: number) {
  return p.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}
function fmtMoney(usd: number) {
  if (usd >= 1_000_000) return `$${(usd / 1_000_000).toFixed(1)}M`;
  if (usd >= 1_000)     return `$${(usd / 1_000).toFixed(0)}K`;
  return `$${usd.toFixed(0)}`;
}
function fmtFunding(r: number) {
  return `${r >= 0 ? "+" : ""}${(r * 100).toFixed(4)}%`;
}
function timeSince(iso: string) {
  const s = Math.floor((Date.now() - new Date(iso).getTime()) / 1000);
  if (s < 5) return "just now";
  if (s < 60) return `${s}s ago`;
  return `${Math.floor(s / 60)}m ${s % 60}s ago`;
}
function dropColor(pct: number) {
  if (pct >= 4) return "#ef4444";
  if (pct >= 2) return "#fb923c";
  if (pct >= 1) return "#fbbf24";
  return "#00e5a0";
}

/* ─────────────────────────────── sub-components ─────────────────────── */

/** Arc gauge — SVG semicircle showing how far into danger zone we are */
function StatusArc({ stage, active }: { stage: string; active: boolean }) {
  const cfg   = STATUS[stage] ?? STATUS.SAFE;
  const idx   = ["SAFE", "WATCH", "RISK", "SELL_ALERT", "DANGER"].indexOf(stage);
  const fill  = active ? Math.min((idx + 1) / 5, 1) : 0;

  const R = 54, CX = 64, CY = 64;
  const startAngle = 200, sweep = 140;
  const toRad = (deg: number) => (deg * Math.PI) / 180;
  const arc = (angle: number) => ({
    x: CX + R * Math.cos(toRad(angle)),
    y: CY + R * Math.sin(toRad(angle)),
  });

  const p1 = arc(startAngle);
  const p2 = arc(startAngle + sweep);
  const filled = arc(startAngle + sweep * fill);
  const bigArc = (a: number) => a > 180 ? 1 : 0;

  return (
    <svg width="128" height="96" viewBox="0 0 128 96" style={{ overflow: "visible" }}>
      <defs>
        <linearGradient id="arc-track" x1="0%" y1="0%" x2="100%" y2="0%">
          <stop offset="0%"   stopColor="#00e5a0" stopOpacity="0.18" />
          <stop offset="50%"  stopColor="#fbbf24" stopOpacity="0.18" />
          <stop offset="100%" stopColor="#ef4444" stopOpacity="0.18" />
        </linearGradient>
        <linearGradient id="arc-fill" x1="0%" y1="0%" x2="100%" y2="0%">
          <stop offset="0%"   stopColor="#00e5a0" />
          <stop offset="50%"  stopColor="#fbbf24" />
          <stop offset="100%" stopColor="#ef4444" />
        </linearGradient>
        <filter id="arc-glow">
          <feGaussianBlur stdDeviation="2.5" result="blur" />
          <feMerge><feMergeNode in="blur" /><feMergeNode in="SourceGraphic" /></feMerge>
        </filter>
      </defs>

      {/* track */}
      <path
        d={`M ${p1.x} ${p1.y} A ${R} ${R} 0 ${bigArc(sweep)} 1 ${p2.x} ${p2.y}`}
        fill="none" stroke="url(#arc-track)" strokeWidth="5" strokeLinecap="round"
      />

      {/* filled arc */}
      {fill > 0.01 && (
        <path
          d={`M ${p1.x} ${p1.y} A ${R} ${R} 0 ${bigArc(sweep * fill)} 1 ${filled.x} ${filled.y}`}
          fill="none" stroke="url(#arc-fill)" strokeWidth="5" strokeLinecap="round"
          filter="url(#arc-glow)"
        />
      )}

      {/* tip dot */}
      {fill > 0.01 && (
        <circle cx={filled.x} cy={filled.y} r="5" fill={cfg.color}
          style={{ filter: `drop-shadow(0 0 5px ${cfg.color})` }} />
      )}

      {/* center label */}
      <text x="64" y="58" textAnchor="middle" fontSize="13" fontWeight="900"
        fill={active ? cfg.color : "rgba(255,255,255,0.2)"}
        style={{ fontFamily: "inherit", letterSpacing: "0.06em", filter: active ? `drop-shadow(0 0 6px ${cfg.color}80)` : "none" }}>
        {active ? cfg.short : "OFFLINE"}
      </text>
      <text x="64" y="72" textAnchor="middle" fontSize="7.5" fontWeight="600"
        fill="rgba(255,255,255,0.25)"
        style={{ fontFamily: "inherit", letterSpacing: "0.1em", textTransform: "uppercase" }}>
        MARKET STATUS
      </text>
    </svg>
  );
}

/** Horizontal timeframe pill */
function TfPill({ label, pct, peak, inactive }: { label: string; pct: number; peak: number | null; inactive: boolean }) {
  const col = inactive ? "rgba(255,255,255,0.15)" : dropColor(pct);
  const bg  = inactive ? "rgba(255,255,255,0.03)" : `${col}12`;
  const bar = inactive ? 0 : Math.min(pct / 6, 1);

  return (
    <div style={{
      flex: "0 0 auto",
      width: "88px",
      borderRadius: "14px",
      border: `1px solid ${inactive ? "rgba(255,255,255,0.06)" : `${col}30`}`,
      background: bg,
      padding: "12px 10px",
      display: "flex", flexDirection: "column", gap: "5px",
      position: "relative", overflow: "hidden",
    }}>
      {/* fill bar at bottom */}
      <div style={{
        position: "absolute", bottom: 0, left: 0, right: 0, height: `${bar * 100}%`,
        background: `linear-gradient(to top, ${col}18, transparent)`,
        pointerEvents: "none",
        transition: "height 0.6s ease",
      }} />
      <span style={{
        fontSize: "9px", fontWeight: 800, letterSpacing: "0.12em",
        color: "rgba(255,255,255,0.35)", textTransform: "uppercase",
      }}>{label}</span>
      <span style={{
        fontSize: "15px", fontWeight: 900, fontVariantNumeric: "tabular-nums",
        lineHeight: 1, color: col,
        textShadow: inactive ? "none" : `0 0 10px ${col}60`,
      }}>
        {inactive ? "—" : `-${pct.toFixed(2)}%`}
      </span>
      <span style={{
        fontSize: "9px", fontVariantNumeric: "tabular-nums",
        color: "rgba(255,255,255,0.22)", fontWeight: 600,
      }}>
        {inactive || !peak ? "—" : `$${fmtPrice(peak)}`}
      </span>
    </div>
  );
}

/** Signal tile — used in the 3-col grid */
function SigTile({
  icon, label, value, sub, color, badge, pulse,
}: {
  icon: string; label: string; value: string;
  sub?: string; color?: string; badge?: string; pulse?: boolean;
}) {
  const col = color ?? "rgba(255,255,255,0.75)";
  return (
    <div style={{
      borderRadius: "14px",
      border: "1px solid rgba(255,255,255,0.06)",
      background: "rgba(255,255,255,0.03)",
      padding: "12px 12px 10px",
      display: "flex", flexDirection: "column", gap: "4px",
      position: "relative",
    }}>
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between" }}>
        <span style={{ fontSize: "14px" }}>{icon}</span>
        {badge && (
          <span style={{
            fontSize: "7px", fontWeight: 900, letterSpacing: "0.1em",
            padding: "2px 5px", borderRadius: "4px",
            background: `${col}18`, border: `1px solid ${col}35`,
            color: col, textTransform: "uppercase",
          }}>{badge}</span>
        )}
      </div>
      <div style={{
        fontSize: "9px", fontWeight: 700, letterSpacing: "0.1em",
        color: "rgba(255,255,255,0.28)", textTransform: "uppercase",
      }}>{label}</div>
      <div style={{
        fontSize: "18px", fontWeight: 900, fontVariantNumeric: "tabular-nums",
        lineHeight: 1.1, color: col,
        textShadow: pulse ? `0 0 12px ${col}80` : "none",
      }}>{value}</div>
      {sub && (
        <div style={{
          fontSize: "9px", fontVariantNumeric: "tabular-nums",
          color: "rgba(255,255,255,0.25)", fontWeight: 600,
        }}>{sub}</div>
      )}
    </div>
  );
}

/* ─────────────────────────────── main component ─────────────────────── */
export function BtcCrashCard() {
  const [snapshot, setSnapshot]   = useState<Snapshot | null>(null);
  const [age, setAge]             = useState("");
  const [livePrice, setLivePrice] = useState<number | null>(null);
  const [flash, setFlash]         = useState<"up" | "down" | null>(null);
  const prevPrice                 = useRef<number | null>(null);

  /* live price */
  useEffect(() => {
    const ws = new WebSocket("wss://data-stream.binance.vision/ws/btcusdt@trade");
    ws.onmessage = (e) => {
      try {
        const p = parseFloat(JSON.parse(e.data).p);
        if (prevPrice.current !== null && p !== prevPrice.current)
          setFlash(p > prevPrice.current ? "up" : "down");
        prevPrice.current = p;
        setLivePrice(p);
      } catch {}
    };
    return () => ws.close();
  }, []);

  useEffect(() => {
    if (!flash) return;
    const t = setTimeout(() => setFlash(null), 600);
    return () => clearTimeout(t);
  }, [flash]);

  /* bot polling */
  useEffect(() => {
    let alive = true;
    async function poll() {
      try {
        const r = await fetch(`${API_BASE}/api/bot/data?key=btc`);
        if (r.ok && alive) setSnapshot(await r.json());
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

  /* derived */
  const d            = snapshot?.data;
  const stage        = d?.status ?? "SAFE";
  const cfg          = STATUS[stage] ?? STATUS.SAFE;
  const isPaused     = d?.trade_mode === "Pause";

  const pauseReason: string = (() => {
    if (!d) return "";
    if (d.pause_reason?.trim()) return d.pause_reason.trim();
    const parts: string[] = [];
    const drops = [
      { l: "1m", v: d.drop_1m }, { l: "5m", v: d.drop_5m },
      { l: "15m", v: d.drop_15m }, { l: "1h", v: d.drop_1h }, { l: "4h", v: d.drop_4h },
    ];
    const worst = drops.reduce((a, b) => b.v > a.v ? b : a);
    if (worst.v >= 1) parts.push(`${worst.l} drop −${worst.v.toFixed(2)}%`);
    if ((d.consec_drops ?? 0) >= 3) parts.push(`${d.consec_drops} consecutive red mins`);
    if (d.vol_spike) parts.push("volume spike on red candle");
    if ((d.whale_count ?? 0) >= 3) parts.push(`${d.whale_count} whale sells`);
    return parts.length ? parts.join(" · ") : "Conditions elevated — await normalization";
  })();

  const whaleCount   = d?.whale_count       ?? 0;
  const whaleUsd     = d?.whale_usd_total   ?? 0;
  const whaleBuy     = d?.whale_buy_total   ?? 0;
  const whaleNet     = d?.whale_net_flow    ?? 0;
  const whaleNetLvl  = d?.whale_net_flow_level ?? "NORMAL";
  const consec       = d?.consec_drops      ?? 0;
  const volSpike     = d?.vol_spike         ?? false;
  const funding      = d?.funding_rate      ?? 0;
  const fundingLvl   = d?.funding_level     ?? "NORMAL";
  const liqUsd       = d?.liq_usd_60s       ?? 0;
  const liqLvl       = d?.liq_level         ?? "NORMAL";
  const liqLargest   = d?.liq_largest       ?? 0;

  const netAbs = Math.abs(whaleNet);
  const netDir = whaleNet >= 0 ? "▲" : "▼";

  const priceColor =
    flash === "up"   ? "#00e5a0" :
    flash === "down" ? "#ef4444" : "#F7931A";

  /* ────── render ────── */
  return (
    <>
      <style>{`
        @keyframes _cc_spin   { to { transform: rotate(360deg); } }
        @keyframes _cc_pulse  { 0%,100%{opacity:1} 50%{opacity:.35} }
        @keyframes _cc_glow   { 0%,100%{opacity:.7} 50%{opacity:1} }
        @keyframes _cc_scan   {
          0%   { top:-2px; opacity:0; }
          5%   { opacity:1; }
          95%  { opacity:1; }
          100% { top:100%; opacity:0; }
        }
        @keyframes _cc_shimmer {
          0%   { transform:translateX(-120%); }
          100% { transform:translateX(120%); }
        }
        @keyframes _cc_slide_down {
          from { opacity:0; transform:translateY(-8px); }
          to   { opacity:1; transform:translateY(0); }
        }
        ._cc_scan_line {
          position:absolute; left:0; right:0; height:1px; z-index:1;
          pointer-events:none;
          animation: _cc_scan 6s ease-in-out infinite;
        }
        ._cc_breathe { animation: _cc_glow 2.4s ease-in-out infinite; }
        ._cc_dot_blink { animation: _cc_pulse 1.4s ease-in-out infinite; }
        ._cc_paused_in { animation: _cc_slide_down 0.3s ease both; }
      `}</style>

      <div style={{
        position: "relative",
        borderRadius: "22px",
        overflow: "hidden",
        background: "linear-gradient(145deg, rgba(6,12,28,0.96) 0%, rgba(4,9,22,0.98) 100%)",
        backdropFilter: "blur(32px) saturate(180%)",
        WebkitBackdropFilter: "blur(32px) saturate(180%)",
        border: `1px solid ${cfg.color}28`,
        boxShadow: `0 0 0 1px rgba(255,255,255,0.04) inset, 0 8px 80px -20px ${cfg.dim}, 0 0 120px -60px ${cfg.dim}`,
      }}>

        {/* animated scan line */}
        <div className="_cc_scan_line"
          style={{ background: `linear-gradient(90deg, transparent, ${cfg.color}60, transparent)` }} />

        {/* top glow edge */}
        <div style={{
          position: "absolute", top: 0, left: 0, right: 0, height: "1px",
          background: `linear-gradient(90deg, transparent 0%, ${cfg.color}90 50%, transparent 100%)`,
          pointerEvents: "none", zIndex: 2,
        }} />

        {/* ambient glow orb behind everything */}
        <div className="_cc_breathe" style={{
          position: "absolute", top: "-60px", right: "-40px",
          width: "220px", height: "220px", borderRadius: "50%",
          background: `radial-gradient(circle, ${cfg.dim} 0%, transparent 70%)`,
          pointerEvents: "none", zIndex: 0,
        }} />

        {/* ══════════════════════════════════════════
            HEADER ROW
        ══════════════════════════════════════════ */}
        <div style={{
          position: "relative", zIndex: 3,
          display: "flex", alignItems: "center", justifyContent: "space-between",
          padding: "16px 20px 12px",
        }}>
          {/* left: icon + name + sync */}
          <div style={{ display: "flex", alignItems: "center", gap: "11px" }}>
            <div style={{ position: "relative", flexShrink: 0 }}>
              <CoinIcon symbol="BTC" size={38} />
              {/* spinning ring */}
              <div style={{
                position: "absolute", inset: "-5px", borderRadius: "50%",
                border: `1px dashed ${cfg.color}45`,
                animation: "_cc_spin 10s linear infinite",
              }} />
            </div>
            <div>
              <div style={{
                fontSize: "13px", fontWeight: 900, letterSpacing: "0.01em",
                color: "#e8f0fe", lineHeight: 1.2,
              }}>
                BTC Crash Monitor
              </div>
              <div style={{
                fontSize: "10px", color: "rgba(255,255,255,0.25)",
                marginTop: "2px", fontWeight: 500,
                display: "flex", alignItems: "center", gap: "5px",
              }}>
                <span className="_cc_dot_blink" style={{
                  width: "5px", height: "5px", borderRadius: "50%",
                  background: d ? cfg.color : "rgba(255,255,255,0.2)",
                  boxShadow: d ? `0 0 5px ${cfg.color}` : "none",
                  flexShrink: 0, display: "inline-block",
                }} />
                {d ? `synced ${age}` : "awaiting bot data"}
              </div>
            </div>
          </div>

          {/* right: corner status badge */}
          <div style={{
            padding: "5px 12px",
            borderRadius: "20px",
            background: `${cfg.color}14`,
            border: `1px solid ${cfg.color}40`,
            boxShadow: `0 0 16px -4px ${cfg.dim}`,
            color: cfg.color,
            fontSize: "9px", fontWeight: 900,
            letterSpacing: "0.12em", textTransform: "uppercase",
          }}>
            {d ? cfg.short : "OFFLINE"}
          </div>
        </div>

        {/* ══════════════════════════════════════════
            ARC + PRICE — side by side hero
        ══════════════════════════════════════════ */}
        <div style={{
          position: "relative", zIndex: 3,
          display: "flex", alignItems: "center",
          gap: "0",
          padding: "4px 20px 16px",
          borderBottom: "1px solid rgba(255,255,255,0.05)",
        }}>
          {/* Arc gauge */}
          <div style={{ flexShrink: 0 }}>
            <StatusArc stage={stage} active={!!d} />
          </div>

          {/* Price stack */}
          <div style={{ flex: 1, paddingLeft: "8px" }}>
            <div style={{
              fontSize: "9px", fontWeight: 700, letterSpacing: "0.14em",
              textTransform: "uppercase", color: "rgba(255,255,255,0.28)",
              marginBottom: "6px",
            }}>
              BTC / USDT · Live
            </div>
            <div style={{
              fontSize: livePrice ? "34px" : "34px",
              fontWeight: 900, lineHeight: 1,
              fontVariantNumeric: "tabular-nums",
              letterSpacing: "-0.03em",
              color: priceColor,
              transition: "color 0.35s ease",
              textShadow: `0 0 28px ${priceColor}55`,
              wordBreak: "break-all",
            }}>
              {livePrice ? `$${fmtPrice(livePrice)}` : "—"}
            </div>
            {/* speed + vol inline */}
            <div style={{
              display: "flex", gap: "14px", marginTop: "8px",
            }}>
              <div>
                <div style={{ fontSize: "8px", fontWeight: 700, letterSpacing: "0.1em", color: "rgba(255,255,255,0.22)", textTransform: "uppercase" }}>Speed 10s</div>
                <div style={{
                  fontSize: "13px", fontWeight: 900, fontVariantNumeric: "tabular-nums",
                  color: !d ? "rgba(255,255,255,0.2)" : d.speed > 0 ? "#00e5a0" : d.speed < 0 ? "#ef4444" : "rgba(255,255,255,0.4)",
                  textShadow: d && d.speed !== 0 ? `0 0 8px ${d.speed > 0 ? "#00e5a0" : "#ef4444"}60` : "none",
                }}>
                  {!d ? "—" : `${d.speed > 0 ? "+" : ""}${d.speed.toFixed(2)}%`}
                </div>
              </div>
              <div style={{ width: "1px", background: "rgba(255,255,255,0.07)", alignSelf: "stretch" }} />
              <div>
                <div style={{ fontSize: "8px", fontWeight: 700, letterSpacing: "0.1em", color: "rgba(255,255,255,0.22)", textTransform: "uppercase" }}>Volatility</div>
                <div style={{
                  fontSize: "13px", fontWeight: 900, fontVariantNumeric: "tabular-nums",
                  color: !d ? "rgba(255,255,255,0.2)" :
                    d.volatility >= 4 ? "#ef4444" :
                    d.volatility >= 2.5 ? "#fb923c" : "#00e5a0",
                }}>
                  {!d ? "—" : `${d.volatility.toFixed(2)}%`}
                </div>
              </div>
            </div>
          </div>
        </div>

        {/* ══════════════════════════════════════════
            STATUS LABEL STRIP
        ══════════════════════════════════════════ */}
        <div style={{
          position: "relative", zIndex: 3,
          margin: "12px 20px 0",
          borderRadius: "12px",
          padding: "10px 16px",
          background: `${cfg.color}10`,
          border: `1px solid ${cfg.color}25`,
          display: "flex", alignItems: "center", gap: "10px",
        }}>
          <div style={{
            width: "8px", height: "8px", borderRadius: "50%",
            background: d ? cfg.color : "rgba(255,255,255,0.2)",
            boxShadow: d ? `0 0 8px ${cfg.color}, 0 0 16px ${cfg.color}60` : "none",
            flexShrink: 0,
            animation: "_cc_dot_blink 1.6s ease-in-out infinite",
          }} />
          <span style={{
            fontSize: "10px", fontWeight: 800, letterSpacing: "0.08em",
            textTransform: "uppercase",
            color: d ? cfg.color : "rgba(255,255,255,0.25)",
          }}>
            {d ? cfg.label : "BOT IS NOT ACTIVE"}
          </span>
        </div>

        {/* ══════════════════════════════════════════
            TRADING PAUSED BANNER
        ══════════════════════════════════════════ */}
        {isPaused && (
          <div className="_cc_paused_in" style={{
            position: "relative", zIndex: 3,
            margin: "10px 20px 0",
            borderRadius: "12px",
            border: "1px solid rgba(251,191,36,0.3)",
            background: "rgba(251,191,36,0.07)",
            padding: "11px 14px",
            display: "flex", alignItems: "flex-start", gap: "10px",
          }}>
            <span style={{ fontSize: "16px", lineHeight: 1, marginTop: "1px", flexShrink: 0 }}>⏸</span>
            <div>
              <div style={{
                fontSize: "9px", fontWeight: 900, color: "#fbbf24",
                letterSpacing: "0.12em", textTransform: "uppercase", marginBottom: "4px",
              }}>Trading Paused</div>
              <div style={{ fontSize: "11px", color: "rgba(251,191,36,0.7)", lineHeight: 1.55 }}>
                {pauseReason}
              </div>
            </div>
          </div>
        )}

        {/* ══════════════════════════════════════════
            TIMEFRAME DROPS — horizontal scroll row
        ══════════════════════════════════════════ */}
        <div style={{ position: "relative", zIndex: 3, padding: "16px 20px 0" }}>
          <div style={{
            fontSize: "8px", fontWeight: 800, letterSpacing: "0.16em",
            textTransform: "uppercase", color: "rgba(255,255,255,0.22)",
            marginBottom: "10px",
          }}>
            Drop from Peak
          </div>
          <div style={{
            display: "flex", gap: "8px",
            overflowX: "auto", paddingBottom: "4px",
            scrollbarWidth: "none",
          }}>
            {TF.map(({ label, dk, pk }) => {
              const pct  = d ? (d[dk] as number) : 0;
              const peak = d ? (d[pk] as number) : null;
              return (
                <TfPill key={label} label={label} pct={pct} peak={peak} inactive={!d} />
              );
            })}
          </div>
        </div>

        {/* ══════════════════════════════════════════
            MARKET SIGNALS — 3-col tile grid
        ══════════════════════════════════════════ */}
        <div style={{ position: "relative", zIndex: 3, padding: "16px 20px 20px" }}>
          <div style={{
            fontSize: "8px", fontWeight: 800, letterSpacing: "0.16em",
            textTransform: "uppercase", color: "rgba(255,255,255,0.22)",
            marginBottom: "10px",
          }}>
            Market Signals
          </div>
          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr", gap: "8px" }}>

            {/* Liquidations */}
            <SigTile
              icon="💥" label="Liq · 60s"
              value={!d ? "—" : fmtMoney(liqUsd)}
              sub={d && liqLargest > 0 ? `Lrg ${fmtMoney(liqLargest)}` : undefined}
              color={!d ? "rgba(255,255,255,0.2)" : LVL_COLOR[liqLvl] ?? "#00e5a0"}
              badge={d ? liqLvl : undefined}
              pulse={liqLvl === "DANGER"}
            />

            {/* Funding */}
            <SigTile
              icon="💸" label="Funding"
              value={!d ? "—" : fmtFunding(funding)}
              color={!d ? "rgba(255,255,255,0.2)" : LVL_COLOR[fundingLvl] ?? "#00e5a0"}
              badge={d ? fundingLvl : undefined}
            />

            {/* Vol Spike */}
            <SigTile
              icon="🌊" label="Vol Spike"
              value={!d ? "—" : volSpike ? "SPIKE" : "Normal"}
              color={!d ? "rgba(255,255,255,0.2)" : volSpike ? "#ef4444" : "#00e5a0"}
              pulse={volSpike}
            />

            {/* Whale Sells */}
            <SigTile
              icon="🐋" label="Whale Sells"
              value={!d ? "—" : String(whaleCount)}
              sub={d && whaleUsd > 0 ? fmtMoney(whaleUsd) : undefined}
              color={!d ? "rgba(255,255,255,0.2)" : whaleCount >= 3 ? "#ef4444" : whaleCount >= 1 ? "#fb923c" : "#00e5a0"}
              badge={whaleCount >= 3 ? "ALERT" : undefined}
              pulse={whaleCount >= 3}
            />

            {/* Bleed Minutes */}
            <SigTile
              icon="📉" label="Bleed Mins"
              value={!d ? "—" : String(consec)}
              color={!d ? "rgba(255,255,255,0.2)" : consec >= 5 ? "#ef4444" : consec >= 3 ? "#fb923c" : consec >= 1 ? "#fbbf24" : "#00e5a0"}
              badge={consec >= 5 ? "BLEED" : undefined}
              pulse={consec >= 5}
            />

            {/* Net Whale Flow */}
            <SigTile
              icon="🌊" label="Net Flow"
              value={!d ? "—" : `${netDir}${fmtMoney(netAbs)}`}
              sub={d ? `B ${fmtMoney(whaleBuy)} · S ${fmtMoney(whaleUsd)}` : undefined}
              color={!d ? "rgba(255,255,255,0.2)" : LVL_COLOR[whaleNetLvl] ?? "#00e5a0"}
              badge={d ? whaleNetLvl : undefined}
            />

          </div>
        </div>

      </div>
    </>
  );
}
