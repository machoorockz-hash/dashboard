/**
 * BTC Crash Monitor — v3
 *
 * Drop-in replacement for BtcCrashCard.tsx.
 * Same props/exports/data interfaces.
 *
 * Requires: lucide-react, CoinIcon (already in your project)
 */
import { useEffect, useRef, useState } from "react";
import { ArrowUpRight, ArrowDownRight } from "lucide-react";
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

/* ── Badge ───────────────────────────────────────────────── */
function Badge({ label, color }: { label: string; color: string }) {
  const [r, g, b] = hexRgb(color);
  return (
    <span
      style={{
        display: "inline-flex", alignItems: "center",
        padding: "2px 8px",
        borderRadius: 4,
        background: `rgba(${r},${g},${b},0.18)`,
        border: `1px solid rgba(${r},${g},${b},0.38)`,
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

/* ── Status pill (top-right) ─────────────────────────────── */
function StatusPill({ stage, danger }: { stage: Stage; danger: boolean }) {
  const st = STAGE[stage];
  const [r, g, b] = hexRgb(st.hex);
  return (
    <div
      style={{
        display: "flex", flexDirection: "column", alignItems: "flex-end", gap: 4,
        padding: "8px 14px",
        borderRadius: 10,
        background: `rgba(${r},${g},${b},0.10)`,
        border: `1px solid rgba(${r},${g},${b},0.30)`,
        boxShadow: danger ? `0 0 20px -4px rgba(${r},${g},${b},0.35)` : undefined,
        transition: "all 0.6s ease",
        minWidth: 120,
      }}
    >
      <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
        <span
          style={{
            width: 7, height: 7, borderRadius: "50%",
            background: st.hex,
            boxShadow: `0 0 6px ${st.hex}`,
            animation: danger ? "btcv3_pulse 1.6s ease-in-out infinite" : undefined,
            flexShrink: 0,
          }}
        />
        <span style={{ color: st.hex, fontSize: 11, fontWeight: 900, letterSpacing: "0.12em", textTransform: "uppercase" }}>
          {st.label}
        </span>
      </div>
      <span style={{ color: `rgba(${r},${g},${b},0.50)`, fontSize: 9, fontWeight: 700, letterSpacing: "0.14em", textTransform: "uppercase" }}>
        {st.sub}
      </span>
    </div>
  );
}

/* ── Block pressure bar (retro terminal style) ───────────── */
function PressureBar({ pct, color }: { pct: number; color: string }) {
  const BLOCKS = 10;
  const filled = Math.round((pct / 100) * BLOCKS);
  const [r, g, b] = hexRgb(color);
  return (
    <div style={{ display: "flex", gap: 2, alignItems: "center" }}>
      {Array.from({ length: BLOCKS }).map((_, i) => (
        <div
          key={i}
          style={{
            width: 6,
            height: 14,
            borderRadius: 1,
            background: i < filled
              ? color
              : "rgba(255,255,255,0.07)",
            boxShadow: i < filled && i === filled - 1
              ? `0 0 6px rgba(${r},${g},${b},0.7)`
              : undefined,
            transition: "background 0.5s ease",
          }}
        />
      ))}
    </div>
  );
}

/* ── Market signal card ──────────────────────────────────── */
function SignalCard({
  icon, title, badgeLabel, badgeColor,
  primary, secondary,
}: {
  icon: string;
  title: string;
  badgeLabel?: string;
  badgeColor?: string;
  primary: string;
  secondary?: string;
}) {
  return (
    <div
      style={{
        flex: 1,
        padding: "12px 14px",
        borderRadius: 10,
        background: "rgba(255,255,255,0.03)",
        border: "1px solid rgba(255,255,255,0.08)",
        display: "flex",
        flexDirection: "column",
        gap: 6,
        minWidth: 0,
      }}
    >
      {/* Title row */}
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 6 }}>
        <div style={{ display: "flex", alignItems: "center", gap: 5 }}>
          <span style={{ fontSize: 11, opacity: 0.5 }}>{icon}</span>
          <span style={{ color: "rgba(255,255,255,0.38)", fontSize: 9, fontWeight: 800, letterSpacing: "0.16em", textTransform: "uppercase" }}>
            {title}
          </span>
        </div>
        {badgeLabel && badgeColor && (
          <Badge label={badgeLabel} color={badgeColor} />
        )}
      </div>
      {/* Value */}
      <div style={{ color: "rgba(255,255,255,0.92)", fontSize: 22, fontWeight: 900, letterSpacing: "-0.02em", lineHeight: 1, fontVariantNumeric: "tabular-nums" }}>
        {primary}
      </div>
      {secondary && (
        <div style={{ color: "rgba(255,255,255,0.30)", fontSize: 10, fontWeight: 600 }}>
          {secondary}
        </div>
      )}
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
  const isDanger = stage === "DANGER" || stage === "SELL_ALERT";
  const isPaused = d?.trade_mode === "Pause";

  const wCount     = d?.whale_count     ?? 0;
  const wUsd       = d?.whale_usd_total ?? 0;
  const wBuy       = d?.whale_buy_total ?? 0;
  const wNet       = d?.whale_net_flow  ?? 0;
  const wNetLvl    = d?.whale_net_flow_level ?? "NORMAL";
  const consec     = d?.consec_drops   ?? 0;
  const volSpike   = d?.vol_spike      ?? false;
  const funding    = d?.funding_rate   ?? 0;
  const fundLvl    = d?.funding_level  ?? "NORMAL";
  const liqUsd     = d?.liq_usd_60s   ?? 0;
  const liqLvl     = d?.liq_level     ?? "NORMAL";
  const liqLargest = d?.liq_largest   ?? 0;
  const maxDrop    = d ? Math.max(d.drop_1m, d.drop_5m, d.drop_15m, d.drop_1h, d.drop_4h) : 0;
  const netNeg     = wNet < 0;
  const netColor   = LVL_COLOR(wNetLvl);

  /* Pressure bar rows */
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
        @keyframes btcv3_price_up {
          0%   { color: #34d399; transform: translateY(-3px); }
          100% { color: #F7931A; transform: translateY(0); }
        }
        @keyframes btcv3_price_dn {
          0%   { color: #f87171; transform: translateY(3px); }
          100% { color: #F7931A; transform: translateY(0); }
        }
        @keyframes btcv3_pulse {
          0%, 100% { opacity: 1; transform: scale(1); }
          50%       { opacity: 0.4; transform: scale(0.7); }
        }
        @keyframes btcv3_fade_in {
          from { opacity: 0; transform: translateY(3px); }
          to   { opacity: 1; transform: translateY(0); }
        }
        .btcv3-price-up { animation: btcv3_price_up 0.65s cubic-bezier(0.22,1,0.36,1) both; }
        .btcv3-price-dn { animation: btcv3_price_dn 0.65s cubic-bezier(0.22,1,0.36,1) both; }
        .btcv3-fade-in  { animation: btcv3_fade_in  0.4s ease-out both; }
      `}</style>

      <div
        style={{
          background: "linear-gradient(170deg, #111318 0%, #0d0f13 100%)",
          border: "1px solid rgba(255,255,255,0.09)",
          borderRadius: 16,
          overflow: "hidden",
          boxShadow: "0 8px 48px -8px rgba(0,0,0,0.7), 0 1px 0 rgba(255,255,255,0.06) inset",
          fontFamily: "'Inter', 'SF Pro Display', system-ui, sans-serif",
        }}
      >

        {/* ════ HEADER ════ */}
        <div
          style={{
            display: "flex", alignItems: "center", justifyContent: "space-between",
            padding: "14px 18px",
            borderBottom: "1px solid rgba(255,255,255,0.07)",
            gap: 12,
          }}
        >
          {/* Left: icon + title + live */}
          <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
            <div
              style={{
                width: 42, height: 42, borderRadius: "50%",
                background: "linear-gradient(135deg, #f97316, #ea580c)",
                display: "flex", alignItems: "center", justifyContent: "center",
                boxShadow: "0 0 16px rgba(249,115,22,0.40)",
                flexShrink: 0,
              }}
            >
              <CoinIcon symbol="BTC" size={22} />
            </div>
            <div>
              <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 4 }}>
                <span style={{ color: "rgba(255,255,255,0.92)", fontSize: 15, fontWeight: 800, letterSpacing: "-0.01em" }}>
                  BTC Crash Monitor
                </span>
                {/* LIVE badge */}
                <span
                  style={{
                    padding: "2px 8px", borderRadius: 4,
                    background: "rgba(16,185,129,0.15)",
                    border: "1px solid rgba(16,185,129,0.35)",
                    color: "#10b981",
                    fontSize: 9, fontWeight: 900, letterSpacing: "0.16em", textTransform: "uppercase",
                  }}
                >
                  LIVE
                </span>
              </div>
              <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
                <span
                  style={{
                    width: 6, height: 6, borderRadius: "50%",
                    background: d ? "#f97316" : "rgba(255,255,255,0.20)",
                    boxShadow: d ? "0 0 6px #f97316" : undefined,
                    display: "inline-block",
                  }}
                />
                <span style={{ color: "rgba(255,255,255,0.30)", fontSize: 10, fontWeight: 600 }}>
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
            padding: "16px 18px 14px",
            borderBottom: "1px solid rgba(255,255,255,0.07)",
          }}
        >
          {/* Price */}
          <div
            className={flash === "up" ? "btcv3-price-up" : flash === "dn" ? "btcv3-price-dn" : ""}
            style={{
              fontSize: 44,
              fontWeight: 900,
              letterSpacing: "-0.03em",
              lineHeight: 1,
              fontVariantNumeric: "tabular-nums",
              marginBottom: 10,
              display: "flex", alignItems: "center", gap: 10,
              ...(flash
                ? {}
                : { color: "#F7931A", textShadow: "0 0 28px rgba(247,147,26,0.45)" }),
            }}
          >
            {price ? `$${f$(price)}` : "—"}
            {/* Trend arrow */}
            {flash === "up" && <ArrowUpRight size={24} style={{ color: "#34d399", flexShrink: 0 }} />}
            {flash === "dn" && <ArrowDownRight size={24} style={{ color: "#f87171", flexShrink: 0 }} />}
          </div>

          {/* Quick stats row */}
          <div style={{ display: "flex", alignItems: "flex-start", gap: 24, flexWrap: "wrap" }}>
            <div>
              <div style={{ color: "rgba(255,255,255,0.28)", fontSize: 8, fontWeight: 800, letterSpacing: "0.20em", textTransform: "uppercase", marginBottom: 3 }}>
                Speed
              </div>
              <div style={{
                color: !d ? "rgba(255,255,255,0.18)" : d.speed < -0.05 ? "#ef4444" : d.speed > 0.05 ? "#10b981" : "rgba(255,255,255,0.60)",
                fontSize: 13, fontWeight: 800, fontVariantNumeric: "tabular-nums",
              }}>
                {!d ? "—" : `${d.speed > 0 ? "+" : ""}${d.speed.toFixed(2)}%/min`}
              </div>
            </div>
            <div>
              <div style={{ color: "rgba(255,255,255,0.28)", fontSize: 8, fontWeight: 800, letterSpacing: "0.20em", textTransform: "uppercase", marginBottom: 3 }}>
                Volatility
              </div>
              <div style={{
                color: !d ? "rgba(255,255,255,0.18)" : d.volatility >= 4 ? "#ef4444" : d.volatility >= 2.5 ? "#f97316" : "rgba(255,255,255,0.60)",
                fontSize: 13, fontWeight: 800, fontVariantNumeric: "tabular-nums",
              }}>
                {!d ? "—" : `${d.volatility.toFixed(2)}%`}
              </div>
            </div>
            <div>
              <div style={{ color: "rgba(255,255,255,0.28)", fontSize: 8, fontWeight: 800, letterSpacing: "0.20em", textTransform: "uppercase", marginBottom: 3 }}>
                Consec Drops
              </div>
              <div style={{
                color: !d ? "rgba(255,255,255,0.18)" : consec >= 5 ? "#ef4444" : consec >= 3 ? "#f97316" : consec >= 1 ? "#f59e0b" : "rgba(255,255,255,0.60)",
                fontSize: 13, fontWeight: 800, fontVariantNumeric: "tabular-nums",
              }}>
                {!d ? "—" : consec}
              </div>
            </div>
            <div>
              <div style={{ color: "rgba(255,255,255,0.28)", fontSize: 8, fontWeight: 800, letterSpacing: "0.20em", textTransform: "uppercase", marginBottom: 3 }}>
                ⚡ Vol Spike
              </div>
              <div style={{
                color: !d ? "rgba(255,255,255,0.18)" : volSpike ? "#ef4444" : "rgba(255,255,255,0.40)",
                fontSize: 13, fontWeight: 900, letterSpacing: "0.04em",
              }}>
                {!d ? "—" : volSpike ? "YES" : "NO"}
              </div>
            </div>
          </div>
        </div>

        {/* ════ PRESSURE TABLE ════ */}
        <div style={{ borderBottom: "1px solid rgba(255,255,255,0.07)" }}>
          {/* Column headers */}
          <div
            style={{
              display: "grid",
              gridTemplateColumns: "36px 1fr 72px 60px",
              gap: 8,
              padding: "8px 18px 6px",
              borderBottom: "1px solid rgba(255,255,255,0.05)",
            }}
          >
            <div />
            <span style={{ color: "rgba(255,255,255,0.22)", fontSize: 8, fontWeight: 800, letterSpacing: "0.20em", textTransform: "uppercase" }}>
              Pressure
            </span>
            <span style={{ color: "rgba(255,255,255,0.22)", fontSize: 8, fontWeight: 800, letterSpacing: "0.20em", textTransform: "uppercase", textAlign: "right" }}>
              Peak
            </span>
            <span style={{ color: "rgba(255,255,255,0.22)", fontSize: 8, fontWeight: 800, letterSpacing: "0.20em", textTransform: "uppercase", textAlign: "right" }}>
              Drop
            </span>
          </div>

          {/* Rows */}
          {timeframes.map(({ label, pct, peak }) => {
            const c = DROP_COLOR(pct);
            const barPct = Math.min((pct / 6) * 100, 100);
            return (
              <div
                key={label}
                style={{
                  display: "grid",
                  gridTemplateColumns: "36px 1fr 72px 60px",
                  gap: 8,
                  alignItems: "center",
                  padding: "7px 18px",
                  borderBottom: "1px solid rgba(255,255,255,0.04)",
                }}
              >
                {/* Label */}
                <span style={{ color: "rgba(255,255,255,0.35)", fontSize: 10, fontWeight: 800, letterSpacing: "0.08em", textTransform: "uppercase" }}>
                  {label}
                </span>

                {/* Block bar */}
                <div style={{ display: "flex", alignItems: "center" }}>
                  {d
                    ? <PressureBar pct={barPct} color={c} />
                    : (
                      <div style={{ display: "flex", gap: 2 }}>
                        {Array.from({ length: 10 }).map((_, i) => (
                          <div key={i} style={{ width: 6, height: 14, borderRadius: 1, background: "rgba(255,255,255,0.06)" }} />
                        ))}
                      </div>
                    )
                  }
                </div>

                {/* Peak */}
                <span style={{
                  color: "rgba(255,255,255,0.35)",
                  fontSize: 11, fontWeight: 700,
                  fontVariantNumeric: "tabular-nums",
                  textAlign: "right",
                  letterSpacing: "-0.01em",
                }}>
                  {!d || peak === 0 ? "—" : `$${Math.round(peak).toLocaleString()}`}
                </span>

                {/* Drop */}
                <span style={{
                  color: !d ? "rgba(255,255,255,0.18)" : pct > 0 ? c : "rgba(255,255,255,0.22)",
                  fontSize: 13, fontWeight: 900,
                  fontVariantNumeric: "tabular-nums",
                  textAlign: "right",
                  letterSpacing: "-0.01em",
                  textShadow: pct >= 2 ? `0 0 10px ${c}88` : undefined,
                  transition: "color 0.4s ease",
                }}>
                  {!d ? "—" : pct > 0 ? `−${pct.toFixed(2)}%` : "—"}
                </span>
              </div>
            );
          })}
        </div>

        {/* ════ SIGNAL CARDS ════ */}
        <div
          style={{
            display: "flex", gap: 10, padding: "12px 14px",
            borderBottom: "1px solid rgba(255,255,255,0.07)",
          }}
        >
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
            padding: "11px 18px",
            borderBottom: "1px solid rgba(255,255,255,0.07)",
          }}
        >
          <div style={{ display: "flex", alignItems: "center", gap: 7 }}>
            <span style={{ color: "rgba(255,255,255,0.28)", fontSize: 11 }}>$</span>
            <span style={{ color: "rgba(255,255,255,0.30)", fontSize: 9, fontWeight: 800, letterSpacing: "0.18em", textTransform: "uppercase" }}>
              Whale Net Flow
            </span>
          </div>
          {!d ? (
            <span style={{ color: "rgba(255,255,255,0.16)", fontSize: 13, fontWeight: 800 }}>—</span>
          ) : (
            <div style={{ display: "flex", alignItems: "baseline", gap: 8 }}>
              <span style={{
                color: netColor,
                fontSize: 18, fontWeight: 900,
                letterSpacing: "-0.02em",
                fontVariantNumeric: "tabular-nums",
                textShadow: `0 0 14px ${netColor}66`,
              }}>
                {netNeg ? "−" : "+"}{fM(Math.abs(wNet))}
              </span>
              <span style={{ color: `${netColor}88`, fontSize: 9, fontWeight: 800, letterSpacing: "0.12em", textTransform: "uppercase" }}>
                {wNetLvl === "NORMAL" ? "Balanced" : netNeg ? "Sell pressure" : "Buy pressure"}
              </span>
            </div>
          )}
        </div>

        {/* ════ PAUSE BANNER ════ */}
        {isPaused && (
          <div
            className="btcv3-fade-in"
            style={{
              display: "flex", alignItems: "flex-start", gap: 14,
              padding: "14px 18px",
              background: "rgba(249,115,22,0.06)",
              borderTop: "1px solid rgba(249,115,22,0.16)",
            }}
          >
            {/* Pause icon circle */}
            <div
              style={{
                width: 38, height: 38, borderRadius: "50%", flexShrink: 0,
                background: "rgba(249,115,22,0.18)",
                border: "1px solid rgba(249,115,22,0.35)",
                display: "flex", alignItems: "center", justifyContent: "center",
                fontSize: 16,
                boxShadow: "0 0 14px rgba(249,115,22,0.25)",
              }}
            >
              ⏸
            </div>
            <div style={{ flex: 1, minWidth: 0 }}>
              <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 5 }}>
                <span style={{ color: "#f97316", fontSize: 11, fontWeight: 900, letterSpacing: "0.14em", textTransform: "uppercase" }}>
                  Trading Paused
                </span>
                <Badge label="Bot Halted" color="#f97316" />
              </div>
              <div style={{ color: "rgba(249,115,22,0.55)", fontSize: 11, fontWeight: 500, lineHeight: 1.5 }}>
                {pauseReason}
              </div>
            </div>
          </div>
        )}

        {/* ════ FOOTER ════ */}
        {!isPaused && (
          <div
            style={{
              display: "flex", alignItems: "center", justifyContent: "space-between",
              padding: "8px 18px",
              borderTop: "1px solid rgba(255,255,255,0.04)",
            }}
          >
            <span style={{ color: "rgba(255,255,255,0.12)", fontSize: 8, fontWeight: 600, letterSpacing: "0.18em", textTransform: "uppercase" }}>
              Binance · Live Feed
            </span>
            <span style={{ color: "rgba(255,255,255,0.12)", fontSize: 8, fontWeight: 600, letterSpacing: "0.18em", textTransform: "uppercase" }}>
              {d ? `Updated ${age}` : "Awaiting data"}
            </span>
          </div>
        )}

      </div>
    </>
  );
}
