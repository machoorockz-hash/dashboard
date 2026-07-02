/**
 * BTC Crash Monitor — v4 (Premium)
 *
 * Drop-in replacement for BtcCrashCard.tsx.
 * Same props / exports / data interfaces as v3.
 *
 * Requires: lucide-react, CoinIcon (already in your project)
 */
import { useEffect, useRef, useState, type ReactNode } from "react";
import { ArrowUpRight, ArrowDownRight, TrendingDown, TrendingUp, Minus } from "lucide-react";
import { CoinIcon } from "./CoinIcon";

const API_BASE = import.meta.env.VITE_API_BASE ?? "";

/* ── Types ──────────────────────────────────────────────── */
interface BotData {
  price: number;
  drop_1m: number; drop_5m: number; drop_15m: number; drop_1h: number; drop_4h: number;
  peak_1m: number; peak_5m: number; peak_15m: number; peak_1h: number; peak_4h: number;
  speed: number; volatility: number; status: string;
  trade_mode?: string; pause_reason?: string;
  whale_count?: number; whale_usd_total?: number; whale_buy_total?: number;
  whale_net_flow?: number; whale_net_flow_level?: string; consec_drops?: number;
  vol_spike?: boolean; funding_rate?: number; funding_level?: string;
  liq_usd_60s?: number; liq_level?: string; liq_largest?: number;
}
interface Snapshot { key: string; updatedAt: string | null; data: BotData | null; }

/* ── Stage config ───────────────────────────────────────── */
const STAGE = {
  SAFE:       { hex: "#10b981", label: "SAFE",       sub: "OK TO TRADE ALTS"  },
  WATCH:      { hex: "#f59e0b", label: "WATCH",      sub: "BE SELECTIVE"      },
  RISK:       { hex: "#f97316", label: "RISK",       sub: "HOLD OFF NEW BUYS" },
  SELL_ALERT: { hex: "#ef4444", label: "SELL ALERT", sub: "PAUSE BUYING"      },
  DANGER:     { hex: "#dc2626", label: "DANGER",     sub: "CONSIDER SELLING"  },
} as const;
type Stage = keyof typeof STAGE;

const DROP_COLOR = (p: number) =>
  p >= 4 ? "#ef4444" : p >= 2 ? "#f97316" : p >= 1 ? "#f59e0b" : "#10b981";
const LVL_COLOR = (l: string) =>
  ({ NORMAL: "#10b981", WATCH: "#f59e0b", RISK: "#f97316", DANGER: "#ef4444" } as Record<string, string>)[l] ?? "#10b981";

/* ── Utils ───────────────────────────────────────────────── */
const f$  = (p: number) => p.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 });
const fM  = (u: number) => u >= 1e6 ? `$${(u / 1e6).toFixed(1)}M` : u >= 1e3 ? `$${(u / 1e3).toFixed(1)}K` : `$${u.toFixed(0)}`;
const fFn = (r: number) => `${r >= 0 ? "+" : ""}${(r * 100).toFixed(4)}%`;
const ago = (iso: string) => {
  const s = Math.floor((Date.now() - new Date(iso).getTime()) / 1e3);
  return s < 5 ? "just now" : s < 60 ? `${s}s ago` : `${Math.floor(s / 60)}m ${s % 60}s ago`;
};
function hexRgb(hex: string): [number, number, number] {
  const m = hex.slice(1).match(/.{2}/g)!;
  return [parseInt(m[0], 16), parseInt(m[1], 16), parseInt(m[2], 16)];
}

/* ── Section label ───────────────────────────────────────── */
function SectionLabel({ children }: { children: React.ReactNode }) {
  return (
    <span style={{
      color: "rgba(255,255,255,0.18)",
      fontSize: 8,
      fontWeight: 800,
      letterSpacing: "0.22em",
      textTransform: "uppercase",
    }}>
      {children}
    </span>
  );
}

/* ── Badge ───────────────────────────────────────────────── */
function Badge({ label, color }: { label: string; color: string }) {
  const [r, g, b] = hexRgb(color);
  return (
    <span
      style={{
        display: "inline-flex", alignItems: "center",
        padding: "2px 7px",
        borderRadius: 4,
        background: `rgba(${r},${g},${b},0.14)`,
        border: `1px solid rgba(${r},${g},${b},0.32)`,
        color,
        fontSize: 9,
        fontWeight: 900,
        letterSpacing: "0.14em",
        textTransform: "uppercase",
        lineHeight: 1.6,
      }}
    >
      {label}
    </span>
  );
}

/* ── Status pill ─────────────────────────────────────────── */
function StatusPill({ stage, danger }: { stage: Stage; danger: boolean }) {
  const st = STAGE[stage];
  const [r, g, b] = hexRgb(st.hex);
  return (
    <div
      style={{
        display: "flex", flexDirection: "column", alignItems: "flex-end", gap: 4,
        padding: "9px 14px",
        borderRadius: 12,
        background: `rgba(${r},${g},${b},0.08)`,
        border: `1px solid rgba(${r},${g},${b},${danger ? "0.40" : "0.22"})`,
        boxShadow: danger
          ? `0 0 24px -4px rgba(${r},${g},${b},0.45), inset 0 1px 0 rgba(${r},${g},${b},0.10)`
          : `inset 0 1px 0 rgba(${r},${g},${b},0.06)`,
        transition: "all 0.5s ease",
        minWidth: 124,
      }}
    >
      <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
        <span
          style={{
            width: 7, height: 7, borderRadius: "50%",
            background: st.hex,
            boxShadow: `0 0 8px ${st.hex}, 0 0 16px ${st.hex}44`,
            animation: danger ? "btcv4_dot_pulse 1.4s ease-in-out infinite" : undefined,
            flexShrink: 0,
          }}
        />
        <span style={{
          color: st.hex,
          fontSize: 11, fontWeight: 900, letterSpacing: "0.13em", textTransform: "uppercase",
        }}>
          {st.label}
        </span>
      </div>
      <span style={{
        color: `rgba(${r},${g},${b},0.45)`,
        fontSize: 9, fontWeight: 700, letterSpacing: "0.14em", textTransform: "uppercase",
      }}>
        {st.sub}
      </span>
    </div>
  );
}

/* ── Gradient pressure bar ───────────────────────────────── */
function PressureBar({ pct, color }: { pct: number; color: string }) {
  const BLOCKS = 10;
  const filled = Math.round((pct / 100) * BLOCKS);
  const [r, g, b] = hexRgb(color);
  return (
    <div style={{ display: "flex", gap: 2.5, alignItems: "center" }}>
      {Array.from({ length: BLOCKS }).map((_, i) => {
        const isFilled = i < filled;
        const isLead   = isFilled && i === filled - 1;
        const progress = isFilled ? (i + 1) / BLOCKS : 0;
        // gradient: start dimmer, get brighter toward the lead block
        const alpha    = isFilled ? 0.35 + progress * 0.65 : 0;
        return (
          <div
            key={i}
            style={{
              width: 7,
              height: 16,
              borderRadius: 2,
              background: isFilled
                ? `rgba(${r},${g},${b},${alpha.toFixed(2)})`
                : "rgba(255,255,255,0.05)",
              boxShadow: isLead
                ? `0 0 8px rgba(${r},${g},${b},0.85), 0 0 3px rgba(${r},${g},${b},0.5)`
                : undefined,
              transition: "background 0.4s ease, box-shadow 0.4s ease",
            }}
          />
        );
      })}
    </div>
  );
}

/* ── Signal card ─────────────────────────────────────────── */
function SignalCard({
  icon, title, badgeLabel, badgeColor,
  primary, secondary,
}: {
  icon: React.ReactNode;
  title: string;
  badgeLabel?: string;
  badgeColor?: string;
  primary: string;
  secondary?: string;
}) {
  const [r, g, b] = badgeColor ? hexRgb(badgeColor) : [255, 255, 255];
  return (
    <div
      style={{
        flex: 1,
        padding: "11px 13px",
        borderRadius: 12,
        background: "rgba(255,255,255,0.025)",
        border: "1px solid rgba(255,255,255,0.07)",
        borderTop: badgeColor
          ? `1px solid rgba(${r},${g},${b},0.28)`
          : "1px solid rgba(255,255,255,0.07)",
        display: "flex",
        flexDirection: "column",
        gap: 7,
        minWidth: 0,
        boxShadow: badgeColor
          ? `inset 0 1px 0 rgba(${r},${g},${b},0.08)`
          : "none",
        transition: "border-color 0.5s ease, box-shadow 0.5s ease",
      }}
    >
      {/* Title row */}
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 4 }}>
        <div style={{ display: "flex", alignItems: "center", gap: 5 }}>
          <span style={{ fontSize: 10, opacity: 0.4, lineHeight: 1 }}>{icon}</span>
          <SectionLabel>{title}</SectionLabel>
        </div>
        {badgeLabel && badgeColor && <Badge label={badgeLabel} color={badgeColor} />}
      </div>
      {/* Value */}
      <div style={{
        color: "rgba(255,255,255,0.90)",
        fontSize: 21, fontWeight: 900,
        letterSpacing: "-0.025em", lineHeight: 1,
        fontVariantNumeric: "tabular-nums",
      }}>
        {primary}
      </div>
      {secondary && (
        <div style={{ color: "rgba(255,255,255,0.25)", fontSize: 10, fontWeight: 600 }}>
          {secondary}
        </div>
      )}
    </div>
  );
}

/* ── Quick stat cell ─────────────────────────────────────── */
function QuickStat({ label, value, color }: { label: string; value: string; color: string }) {
  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 4 }}>
      <SectionLabel>{label}</SectionLabel>
      <span style={{
        color,
        fontSize: 13, fontWeight: 800,
        fontVariantNumeric: "tabular-nums",
        letterSpacing: "-0.01em",
        transition: "color 0.4s ease",
      }}>
        {value}
      </span>
    </div>
  );
}

/* ── Main component ─────────────────────────────────────── */
export function BtcCrashCard() {
  const [snap,  setSnap]  = useState<Snapshot | null>(null);
  const [age,   setAge]   = useState("");
  const [price, setPrice] = useState<number | null>(null);
  const [flash, setFlash] = useState<"up" | "dn" | null>(null);
  const prevRef = useRef<number | null>(null);

  /* WebSocket live price */
  useEffect(() => {
    const ws = new WebSocket("wss://data-stream.binance.vision/ws/btcusdt@trade");
    ws.onmessage = (e) => {
      try {
        const p = parseFloat(JSON.parse(e.data).p);
        setFlash(prevRef.current !== null ? (p > prevRef.current! ? "up" : "dn") : null);
        prevRef.current = p;
        setPrice(p);
      } catch {}
    };
    return () => ws.close();
  }, []);
  useEffect(() => {
    if (!flash) return;
    const t = setTimeout(() => setFlash(null), 700);
    return () => clearTimeout(t);
  }, [flash]);

  /* Bot poll */
  useEffect(() => {
    let ok = true;
    const poll = async () => {
      try {
        const res = await fetch(`${API_BASE}/api/bot/data?key=btc`);
        if (res.ok && ok) setSnap(await res.json());
      } catch {}
    };
    poll();
    const id = setInterval(poll, 3000);
    return () => { ok = false; clearInterval(id); };
  }, []);

  /* Age ticker */
  useEffect(() => {
    if (!snap?.updatedAt) return;
    const id = setInterval(() => setAge(ago(snap.updatedAt!)), 1000);
    setAge(ago(snap.updatedAt));
    return () => clearInterval(id);
  }, [snap?.updatedAt]);

  const d        = snap?.data;
  const stage    = (d?.status ?? "SAFE") as Stage;
  const st       = STAGE[stage] ?? STAGE.SAFE;
  const [sr, sg, sb] = hexRgb(st.hex);
  const isDanger = stage === "DANGER" || stage === "SELL_ALERT";
  const isPaused = d?.trade_mode === "Pause";

  const wCount     = d?.whale_count     ?? 0;
  const wUsd       = d?.whale_usd_total ?? 0;
  const wNet       = d?.whale_net_flow  ?? 0;
  const wNetLvl    = d?.whale_net_flow_level ?? "NORMAL";
  const consec     = d?.consec_drops   ?? 0;
  const volSpike   = d?.vol_spike      ?? false;
  const funding    = d?.funding_rate   ?? 0;
  const fundLvl    = d?.funding_level  ?? "NORMAL";
  const liqUsd     = d?.liq_usd_60s   ?? 0;
  const liqLvl     = d?.liq_level     ?? "NORMAL";
  const liqLargest = d?.liq_largest   ?? 0;
  const netNeg     = wNet < 0;
  const netColor   = LVL_COLOR(wNetLvl);
  const [nr, ng, nb] = hexRgb(netColor);

  const timeframes = [
    { label: "1m",  pct: d?.drop_1m  ?? 0, peak: d?.peak_1m  ?? 0 },
    { label: "5m",  pct: d?.drop_5m  ?? 0, peak: d?.peak_5m  ?? 0 },
    { label: "15m", pct: d?.drop_15m ?? 0, peak: d?.peak_15m ?? 0 },
    { label: "1h",  pct: d?.drop_1h  ?? 0, peak: d?.peak_1h  ?? 0 },
    { label: "4h",  pct: d?.drop_4h  ?? 0, peak: d?.peak_4h  ?? 0 },
  ];

  const pauseReason = (() => {
    if (!d) return "";
    if (d.pause_reason?.trim()) return d.pause_reason.trim();
    const parts: string[] = [];
    timeframes.forEach(({ label, pct }) => { if (pct >= 1) parts.push(`${label} drop: −${pct.toFixed(2)}%`); });
    if (consec >= 3) parts.push(`${consec} consecutive down-minutes`);
    if (volSpike)    parts.push("volume spike on red candle");
    if (wCount >= 3) parts.push(`${wCount} whale sell transactions`);
    return parts.join(" · ") || "Conditions elevated — awaiting normalization";
  })();

  return (
    <>
      <style>{`
        @keyframes btcv4_price_up {
          0%   { color: #34d399; text-shadow: 0 0 24px #34d39966; transform: translateY(-4px); }
          100% { color: #F7931A; text-shadow: 0 0 32px rgba(247,147,26,0.50); transform: translateY(0); }
        }
        @keyframes btcv4_price_dn {
          0%   { color: #f87171; text-shadow: 0 0 24px #f8717166; transform: translateY(4px); }
          100% { color: #F7931A; text-shadow: 0 0 32px rgba(247,147,26,0.50); transform: translateY(0); }
        }
        @keyframes btcv4_dot_pulse {
          0%, 100% { opacity: 1;   transform: scale(1);   }
          50%       { opacity: 0.3; transform: scale(0.6); }
        }
        @keyframes btcv4_fade_in {
          from { opacity: 0; transform: translateY(4px); }
          to   { opacity: 1; transform: translateY(0); }
        }
        @keyframes btcv4_pause_pulse {
          0%, 100% { opacity: 0.06; }
          50%       { opacity: 0.12; }
        }
        .btcv4-price-up { animation: btcv4_price_up 0.65s cubic-bezier(0.22,1,0.36,1) both; }
        .btcv4-price-dn { animation: btcv4_price_dn 0.65s cubic-bezier(0.22,1,0.36,1) both; }
        .btcv4-fade-in  { animation: btcv4_fade_in  0.45s cubic-bezier(0.22,1,0.36,1) both; }
      `}</style>

      <div
        style={{
          /* Deep premium base */
          background: "linear-gradient(170deg, #0f1015 0%, #090a0e 60%, #0b0c12 100%)",
          borderRadius: 18,
          overflow: "hidden",
          position: "relative",
          fontFamily: "'Inter', 'SF Pro Display', system-ui, sans-serif",
          /* Layered shadow: soft ambient + sharp edge */
          boxShadow: `
            0 0 0 1px rgba(255,255,255,0.07),
            0 4px 6px -2px rgba(0,0,0,0.6),
            0 16px 48px -8px rgba(0,0,0,0.80),
            inset 0 1px 0 rgba(255,255,255,0.06)
          `,
        }}
      >

        {/* ════ TOP ACCENT LINE — stage-colored gradient ════ */}
        <div
          style={{
            height: 2,
            background: `linear-gradient(90deg,
              transparent 0%,
              rgba(${sr},${sg},${sb},0.55) 30%,
              rgba(${sr},${sg},${sb},0.90) 50%,
              rgba(${sr},${sg},${sb},0.55) 70%,
              transparent 100%)`,
            transition: "background 0.8s ease",
          }}
        />

        {/* ════ HEADER ════ */}
        <div
          style={{
            display: "flex", alignItems: "center", justifyContent: "space-between",
            padding: "13px 18px",
            borderBottom: "1px solid rgba(255,255,255,0.06)",
            gap: 12,
          }}
        >
          {/* Left: BTC icon + title */}
          <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
            <div
              style={{
                width: 44, height: 44, borderRadius: "50%", flexShrink: 0,
                background: "linear-gradient(140deg, #fb923c 0%, #ea580c 60%, #c2410c 100%)",
                display: "flex", alignItems: "center", justifyContent: "center",
                boxShadow: "0 0 20px rgba(249,115,22,0.45), 0 0 6px rgba(249,115,22,0.25), inset 0 1px 0 rgba(255,200,120,0.25)",
              }}
            >
              <CoinIcon symbol="BTC" size={22} />
            </div>

            <div>
              <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 4 }}>
                <span style={{
                  color: "rgba(255,255,255,0.94)",
                  fontSize: 15, fontWeight: 800, letterSpacing: "-0.02em",
                }}>
                  BTC Crash Monitor
                </span>
                {/* LIVE badge */}
                <span style={{
                  padding: "2px 7px", borderRadius: 4,
                  background: "rgba(16,185,129,0.12)",
                  border: "1px solid rgba(16,185,129,0.30)",
                  color: "#10b981",
                  fontSize: 9, fontWeight: 900, letterSpacing: "0.16em", textTransform: "uppercase",
                }}>
                  LIVE
                </span>
              </div>
              <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
                <span style={{
                  width: 6, height: 6, borderRadius: "50%", display: "inline-block",
                  background: d ? "#f97316" : "rgba(255,255,255,0.15)",
                  boxShadow: d ? "0 0 8px #f97316, 0 0 14px #f9731655" : undefined,
                  animation: d ? "btcv4_dot_pulse 2s ease-in-out infinite" : undefined,
                }} />
                <span style={{ color: "rgba(255,255,255,0.28)", fontSize: 10, fontWeight: 600 }}>
                  {d ? `updated ${age}` : "offline"}
                </span>
              </div>
            </div>
          </div>

          {/* Right: status pill */}
          <StatusPill stage={stage} danger={isDanger} />
        </div>

        {/* ════ PRICE BLOCK ════ */}
        <div
          style={{
            padding: "18px 18px 16px",
            borderBottom: "1px solid rgba(255,255,255,0.06)",
            position: "relative",
            overflow: "hidden",
          }}
        >
          {/* Subtle amber haze behind price */}
          <div style={{
            position: "absolute", top: 0, left: 0, right: 0, bottom: 0,
            background: "radial-gradient(ellipse 60% 100% at 0% 50%, rgba(247,147,26,0.06) 0%, transparent 70%)",
            pointerEvents: "none",
          }} />

          {/* Price row */}
          <div
            className={flash === "up" ? "btcv4-price-up" : flash === "dn" ? "btcv4-price-dn" : ""}
            style={{
              fontSize: 46,
              fontWeight: 900,
              letterSpacing: "-0.035em",
              lineHeight: 1,
              fontVariantNumeric: "tabular-nums",
              marginBottom: 12,
              display: "flex", alignItems: "center", gap: 10,
              position: "relative",
              ...(flash
                ? {}
                : { color: "#F7931A", textShadow: "0 0 36px rgba(247,147,26,0.50), 0 0 12px rgba(247,147,26,0.20)" }),
            }}
          >
            {price ? `$${f$(price)}` : "—"}
            {flash === "up" && <ArrowUpRight size={26} style={{ color: "#34d399", flexShrink: 0, filter: "drop-shadow(0 0 6px #34d39988)" }} />}
            {flash === "dn" && <ArrowDownRight size={26} style={{ color: "#f87171", flexShrink: 0, filter: "drop-shadow(0 0 6px #f8717188)" }} />}
          </div>

          {/* Quick stats row */}
          <div style={{ display: "flex", alignItems: "flex-start", gap: 28, flexWrap: "wrap" }}>
            <QuickStat
              label="Speed"
              value={!d ? "—" : `${d.speed > 0 ? "+" : ""}${d.speed.toFixed(2)}%/min`}
              color={!d ? "rgba(255,255,255,0.16)" : d.speed < -0.05 ? "#ef4444" : d.speed > 0.05 ? "#10b981" : "rgba(255,255,255,0.55)"}
            />
            <QuickStat
              label="Volatility"
              value={!d ? "—" : `${d.volatility.toFixed(2)}%`}
              color={!d ? "rgba(255,255,255,0.16)" : d.volatility >= 4 ? "#ef4444" : d.volatility >= 2.5 ? "#f97316" : "rgba(255,255,255,0.55)"}
            />
            <QuickStat
              label="Consec Drops"
              value={!d ? "—" : String(consec)}
              color={!d ? "rgba(255,255,255,0.16)" : consec >= 5 ? "#ef4444" : consec >= 3 ? "#f97316" : consec >= 1 ? "#f59e0b" : "rgba(255,255,255,0.55)"}
            />
            <QuickStat
              label="⚡ Vol Spike"
              value={!d ? "—" : volSpike ? "YES" : "NO"}
              color={!d ? "rgba(255,255,255,0.16)" : volSpike ? "#ef4444" : "rgba(255,255,255,0.35)"}
            />
          </div>
        </div>

        {/* ════ PRESSURE TABLE ════ */}
        <div style={{ borderBottom: "1px solid rgba(255,255,255,0.06)" }}>
          {/* Column headers */}
          <div style={{
            display: "grid",
            gridTemplateColumns: "38px 1fr 76px 64px",
            gap: 8,
            padding: "9px 18px 7px",
            borderBottom: "1px solid rgba(255,255,255,0.04)",
          }}>
            <div />
            <SectionLabel>Pressure</SectionLabel>
            <span style={{ color: "rgba(255,255,255,0.18)", fontSize: 8, fontWeight: 800, letterSpacing: "0.22em", textTransform: "uppercase", textAlign: "right" }}>
              Peak
            </span>
            <span style={{ color: "rgba(255,255,255,0.18)", fontSize: 8, fontWeight: 800, letterSpacing: "0.22em", textTransform: "uppercase", textAlign: "right" }}>
              Drop
            </span>
          </div>

          {timeframes.map(({ label, pct, peak }, idx) => {
            const c      = DROP_COLOR(pct);
            const barPct = Math.min((pct / 6) * 100, 100);
            const [cr, cg, cb] = hexRgb(c);
            return (
              <div
                key={label}
                style={{
                  display: "grid",
                  gridTemplateColumns: "38px 1fr 76px 64px",
                  gap: 8,
                  alignItems: "center",
                  padding: "8px 18px",
                  background: idx % 2 === 0 ? "rgba(255,255,255,0.012)" : "transparent",
                  borderBottom: "1px solid rgba(255,255,255,0.035)",
                  transition: "background 0.4s ease",
                }}
              >
                <span style={{
                  color: "rgba(255,255,255,0.32)",
                  fontSize: 10, fontWeight: 800, letterSpacing: "0.08em", textTransform: "uppercase",
                }}>
                  {label}
                </span>

                <div style={{ display: "flex", alignItems: "center" }}>
                  {d
                    ? <PressureBar pct={barPct} color={c} />
                    : (
                      <div style={{ display: "flex", gap: 2.5 }}>
                        {Array.from({ length: 10 }).map((_, i) => (
                          <div key={i} style={{ width: 7, height: 16, borderRadius: 2, background: "rgba(255,255,255,0.04)" }} />
                        ))}
                      </div>
                    )
                  }
                </div>

                <span style={{
                  color: "rgba(255,255,255,0.28)",
                  fontSize: 11, fontWeight: 700,
                  fontVariantNumeric: "tabular-nums",
                  textAlign: "right",
                  letterSpacing: "-0.01em",
                }}>
                  {!d || peak === 0 ? "—" : `$${Math.round(peak).toLocaleString()}`}
                </span>

                <span style={{
                  color: !d ? "rgba(255,255,255,0.16)" : pct > 0 ? c : "rgba(255,255,255,0.20)",
                  fontSize: 13, fontWeight: 900,
                  fontVariantNumeric: "tabular-nums",
                  textAlign: "right",
                  letterSpacing: "-0.01em",
                  textShadow: pct >= 2 ? `0 0 12px rgba(${cr},${cg},${cb},0.70)` : undefined,
                  transition: "color 0.4s ease, text-shadow 0.4s ease",
                }}>
                  {!d ? "—" : pct > 0 ? `−${pct.toFixed(2)}%` : "—"}
                </span>
              </div>
            );
          })}
        </div>

        {/* ════ SIGNAL CARDS ════ */}
        <div style={{
          display: "flex", gap: 8, padding: "12px 14px",
          borderBottom: "1px solid rgba(255,255,255,0.06)",
        }}>
          <SignalCard
            icon="≡"
            title="Whale Sells"
            badgeLabel={d ? (wCount >= 3 ? "DANGER" : wCount >= 1 ? "WATCH" : "NORMAL") : undefined}
            badgeColor={d ? (wCount >= 3 ? "#ef4444" : wCount >= 1 ? "#f59e0b" : "#10b981") : undefined}
            primary={!d ? "—" : `${wCount} txn`}
            secondary={d && wUsd > 0 ? `${fM(wUsd)} total` : d ? "$0 total" : undefined}
          />
          <SignalCard
            icon="↗"
            title="Funding"
            badgeLabel={d ? fundLvl : undefined}
            badgeColor={d ? LVL_COLOR(fundLvl) : undefined}
            primary={!d ? "—" : fFn(funding)}
          />
          <SignalCard
            icon="⚡"
            title="Liquidations"
            badgeLabel={d ? liqLvl : undefined}
            badgeColor={d ? LVL_COLOR(liqLvl) : undefined}
            primary={!d ? "—" : fM(liqUsd)}
            secondary={d && liqLargest > 0 ? `largest ${fM(liqLargest)}` : undefined}
          />
        </div>

        {/* ════ WHALE NET FLOW ════ */}
        <div
          style={{
            display: "flex", alignItems: "center", justifyContent: "space-between",
            padding: "12px 18px",
            borderBottom: "1px solid rgba(255,255,255,0.06)",
            borderLeft: `3px solid rgba(${nr},${ng},${nb},0.55)`,
            background: `linear-gradient(90deg, rgba(${nr},${ng},${nb},0.04) 0%, transparent 40%)`,
            transition: "border-color 0.5s ease, background 0.5s ease",
          }}
        >
          <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
            {!d ? (
              <Minus size={12} style={{ color: "rgba(255,255,255,0.20)" }} />
            ) : netNeg ? (
              <TrendingDown size={13} style={{ color: netColor, filter: `drop-shadow(0 0 4px ${netColor}88)` }} />
            ) : (
              <TrendingUp size={13} style={{ color: netColor, filter: `drop-shadow(0 0 4px ${netColor}88)` }} />
            )}
            <SectionLabel>Whale Net Flow</SectionLabel>
          </div>

          {!d ? (
            <span style={{ color: "rgba(255,255,255,0.14)", fontSize: 14, fontWeight: 800 }}>—</span>
          ) : (
            <div style={{ display: "flex", alignItems: "baseline", gap: 8 }}>
              <span style={{
                color: netColor,
                fontSize: 19, fontWeight: 900,
                letterSpacing: "-0.025em",
                fontVariantNumeric: "tabular-nums",
                textShadow: `0 0 16px rgba(${nr},${ng},${nb},0.60)`,
              }}>
                {netNeg ? "−" : "+"}{fM(Math.abs(wNet))}
              </span>
              <span style={{
                color: `rgba(${nr},${ng},${nb},0.55)`,
                fontSize: 9, fontWeight: 800, letterSpacing: "0.14em", textTransform: "uppercase",
              }}>
                {wNetLvl === "NORMAL" ? "Balanced" : netNeg ? "Sell pressure" : "Buy pressure"}
              </span>
            </div>
          )}
        </div>

        {/* ════ PAUSE BANNER ════ */}
        {isPaused && (
          <div
            className="btcv4-fade-in"
            style={{
              position: "relative",
              display: "flex", alignItems: "flex-start", gap: 14,
              padding: "16px 18px",
              overflow: "hidden",
            }}
          >
            {/* Pulsing amber background wash */}
            <div style={{
              position: "absolute", inset: 0,
              background: "rgba(249,115,22,0.07)",
              animation: "btcv4_pause_pulse 2s ease-in-out infinite",
              pointerEvents: "none",
            }} />
            {/* Top amber border */}
            <div style={{
              position: "absolute", top: 0, left: 0, right: 0,
              height: 1,
              background: "linear-gradient(90deg, transparent, rgba(249,115,22,0.70), transparent)",
            }} />

            {/* Pause icon */}
            <div style={{
              width: 42, height: 42, borderRadius: "50%", flexShrink: 0,
              background: "linear-gradient(140deg, rgba(249,115,22,0.22), rgba(249,115,22,0.10))",
              border: "1px solid rgba(249,115,22,0.40)",
              display: "flex", alignItems: "center", justifyContent: "center",
              fontSize: 17,
              boxShadow: "0 0 18px rgba(249,115,22,0.35), inset 0 1px 0 rgba(255,200,100,0.15)",
              position: "relative",
            }}>
              ⏸
            </div>

            <div style={{ flex: 1, minWidth: 0, position: "relative" }}>
              <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 6 }}>
                <span style={{
                  color: "#f97316",
                  fontSize: 11, fontWeight: 900, letterSpacing: "0.16em", textTransform: "uppercase",
                }}>
                  Trading Paused
                </span>
                <Badge label="Bot Halted" color="#f97316" />
              </div>
              <div style={{
                color: "rgba(249,115,22,0.50)",
                fontSize: 11, fontWeight: 500, lineHeight: 1.6,
              }}>
                {pauseReason}
              </div>
            </div>
          </div>
        )}

        {/* ════ FOOTER ════ */}
        {!isPaused && (
          <div style={{
            display: "flex", alignItems: "center", justifyContent: "space-between",
            padding: "8px 18px",
            borderTop: "1px solid rgba(255,255,255,0.04)",
            background: "rgba(0,0,0,0.15)",
          }}>
            <span style={{
              color: "rgba(255,255,255,0.10)",
              fontSize: 8, fontWeight: 700, letterSpacing: "0.20em", textTransform: "uppercase",
            }}>
              Binance · Live Feed
            </span>
            <span style={{
              color: "rgba(255,255,255,0.10)",
              fontSize: 8, fontWeight: 700, letterSpacing: "0.20em", textTransform: "uppercase",
            }}>
              {d ? `Updated ${age}` : "Awaiting data"}
            </span>
          </div>
        )}

      </div>
    </>
  );
}
