/**
 * BTC Crash Monitor — Obsidian Edition
 *
 * Drop-in replacement for BtcCrashCard.tsx.
 * Same props/exports/data interfaces — completely new premium visual design.
 *
 * Requires: lucide-react, CoinIcon (already in your project)
 */
import { useEffect, useRef, useState } from "react";
import { TrendingDown, Activity, ArrowUpRight, ArrowDownRight, Minus } from "lucide-react";
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
  SAFE:       { hex: "#10b981", label: "SAFE",       sub: "OK TO TRADE ALTS",   severity: 0 },
  WATCH:      { hex: "#f59e0b", label: "WATCH",      sub: "BE SELECTIVE",        severity: 1 },
  RISK:       { hex: "#f97316", label: "RISK",       sub: "HOLD OFF NEW BUYS",  severity: 2 },
  SELL_ALERT: { hex: "#ef4444", label: "SELL ALERT", sub: "PAUSE BUYING",        severity: 3 },
  DANGER:     { hex: "#dc2626", label: "DANGER",     sub: "CONSIDER SELLING",    severity: 4 },
} as const;
type Stage = keyof typeof STAGE;

const DROP_COLOR  = (p: number) => p >= 4 ? "#ef4444" : p >= 2 ? "#f97316" : p >= 1 ? "#f59e0b" : "#10b981";
const LVL_COLOR   = (l: string) => ({ NORMAL: "#10b981", WATCH: "#f59e0b", RISK: "#f97316", DANGER: "#ef4444" } as Record<string, string>)[l] ?? "#10b981";

/* ── Utils ───────────────────────────────────────────────── */
const f$  = (p: number) => p.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 });
const fM  = (u: number) => u >= 1e6 ? `$${(u / 1e6).toFixed(2)}M` : u >= 1e3 ? `$${(u / 1e3).toFixed(1)}K` : `$${u.toFixed(0)}`;
const fFn = (r: number) => `${r >= 0 ? "+" : ""}${(r * 100).toFixed(4)}%`;
const ago = (iso: string) => {
  const s = Math.floor((Date.now() - new Date(iso).getTime()) / 1e3);
  return s < 5 ? "just now" : s < 60 ? `${s}s ago` : `${Math.floor(s / 60)}m ${s % 60}s ago`;
};

function hexRgb(hex: string): [number, number, number] {
  const m = hex.slice(1).match(/.{2}/g)!;
  return [parseInt(m[0], 16), parseInt(m[1], 16), parseInt(m[2], 16)];
}

/* ── Divider ─────────────────────────────────────────────── */
const Divider = () => (
  <div style={{ height: 1, background: "rgba(255,255,255,0.055)", margin: "0" }} />
);

/* ── Status pill ─────────────────────────────────────────── */
function StatusPill({ stage, sub, danger }: { stage: Stage; sub: string; danger: boolean }) {
  const st  = STAGE[stage];
  const [r, g, b] = hexRgb(st.hex);
  return (
    <div className="flex flex-col items-end gap-1.5">
      {/* Main badge */}
      <div
        className="flex items-center gap-2 px-3.5 py-2 rounded-xl"
        style={{
          background: `rgba(${r},${g},${b},0.10)`,
          border: `1px solid rgba(${r},${g},${b},0.28)`,
          boxShadow: danger
            ? `0 0 0 1px rgba(${r},${g},${b},0.15), 0 0 20px -4px rgba(${r},${g},${b},0.40)`
            : `0 0 0 1px rgba(${r},${g},${b},0.08)`,
          transition: "all 0.6s ease",
        }}
      >
        {/* Pulsing dot — only on danger */}
        <span
          className="inline-block rounded-full shrink-0"
          style={{
            width: 7,
            height: 7,
            background: st.hex,
            boxShadow: `0 0 8px ${st.hex}`,
            animation: danger ? "btcp_pulse 1.6s ease-in-out infinite" : undefined,
          }}
        />
        <span
          className="text-[11px] font-black tracking-[0.14em] uppercase leading-none"
          style={{ color: st.hex, letterSpacing: "0.12em" }}
        >
          {st.label}
        </span>
      </div>
      {/* Sub label */}
      <span
        className="text-[9px] font-semibold uppercase tracking-[0.16em] leading-none"
        style={{ color: `rgba(${r},${g},${b},0.45)` }}
      >
        {sub}
      </span>
    </div>
  );
}

/* ── Stat cell ───────────────────────────────────────────── */
function StatCell({
  label, value, sub, color = "#ffffff", dim = false,
}: {
  label: string; value: string; sub?: string; color?: string; dim?: boolean;
}) {
  const [r, g, b] = hexRgb(color === "#ffffff" ? "#888888" : color);
  return (
    <div className="flex flex-col gap-1">
      <span
        className="text-[9px] font-semibold uppercase tracking-[0.18em]"
        style={{ color: "rgba(255,255,255,0.30)" }}
      >
        {label}
      </span>
      <span
        className="text-[22px] font-black tabular-nums leading-none"
        style={{
          color: dim ? "rgba(255,255,255,0.18)" : color,
          textShadow: (!dim && color !== "#ffffff")
            ? `0 0 18px rgba(${r},${g},${b},0.50)`
            : undefined,
          letterSpacing: "-0.02em",
          transition: "color 0.4s ease, text-shadow 0.4s ease",
        }}
      >
        {value}
      </span>
      {sub && (
        <span
          className="text-[9px] font-semibold leading-none"
          style={{ color: `rgba(${r},${g},${b},0.45)` }}
        >
          {sub}
        </span>
      )}
    </div>
  );
}

/* ── Drop timeline ───────────────────────────────────────── */
function DropTimeline({ drops }: { drops: { label: string; pct: number }[] }) {
  const max = 6;
  return (
    <div className="flex flex-col gap-2.5">
      {drops.map(({ label, pct }) => {
        const c = DROP_COLOR(pct);
        const [r, g, b] = hexRgb(c);
        const w = pct > 0 ? Math.min((pct / max) * 100, 100) : 0;
        return (
          <div key={label} className="flex items-center gap-3">
            <span
              className="text-[9px] font-black uppercase tracking-[0.12em] shrink-0"
              style={{ color: "rgba(255,255,255,0.28)", width: 24 }}
            >
              {label}
            </span>
            {/* Track */}
            <div
              className="flex-1 rounded-full overflow-hidden"
              style={{ height: 4, background: "rgba(255,255,255,0.05)" }}
            >
              <div
                className="h-full rounded-full"
                style={{
                  width: `${w}%`,
                  background: pct > 0
                    ? `linear-gradient(90deg, rgba(${r},${g},${b},0.6), ${c})`
                    : "transparent",
                  boxShadow: pct >= 1 ? `0 0 8px rgba(${r},${g},${b},0.55)` : undefined,
                  transition: "width 1s cubic-bezier(0.22,1,0.36,1)",
                }}
              />
            </div>
            <span
              className="text-[10px] font-black tabular-nums shrink-0"
              style={{
                color: pct > 0 ? c : "rgba(255,255,255,0.15)",
                textShadow: pct >= 2 ? `0 0 8px rgba(${r},${g},${b},0.70)` : undefined,
                width: 44,
                textAlign: "right",
              }}
            >
              {pct > 0 ? `−${pct.toFixed(2)}%` : "—"}
            </span>
          </div>
        );
      })}
    </div>
  );
}

/* ── Signal row ──────────────────────────────────────────── */
function SignalRow({
  icon, label, value, badge, dim = false, alert = false,
}: {
  icon: React.ReactNode;
  label: string;
  value: string;
  badge?: string;
  dim?: boolean;
  alert?: boolean;
}) {
  const badgeColor = badge ? LVL_COLOR(badge) : "#10b981";
  const [br, bg, bb] = hexRgb(badgeColor);
  return (
    <div
      className="flex items-center justify-between gap-3 px-4 py-3 rounded-xl"
      style={{
        background: alert
          ? "rgba(239,68,68,0.06)"
          : "rgba(255,255,255,0.025)",
        border: alert
          ? "1px solid rgba(239,68,68,0.18)"
          : "1px solid rgba(255,255,255,0.055)",
        transition: "all 0.4s ease",
      }}
    >
      <div className="flex items-center gap-3 min-w-0">
        <span style={{ color: alert ? "#ef4444" : "rgba(255,255,255,0.22)", flexShrink: 0 }}>
          {icon}
        </span>
        <div className="min-w-0">
          <div
            className="text-[9px] font-semibold uppercase tracking-[0.16em] mb-0.5"
            style={{ color: "rgba(255,255,255,0.28)" }}
          >
            {label}
          </div>
          <div
            className="text-[15px] font-black tabular-nums leading-none"
            style={{
              color: dim ? "rgba(255,255,255,0.18)" : (alert ? "#ef4444" : "rgba(255,255,255,0.88)"),
            }}
          >
            {value}
          </div>
        </div>
      </div>
      {badge && (
        <span
          className="text-[8px] font-black uppercase tracking-[0.16em] px-2.5 py-1 rounded-lg shrink-0"
          style={{
            color: badgeColor,
            background: `rgba(${br},${bg},${bb},0.12)`,
            border: `1px solid rgba(${br},${bg},${bb},0.24)`,
          }}
        >
          {badge}
        </span>
      )}
    </div>
  );
}

/* ── Whale flow row ──────────────────────────────────────── */
function WhaleFlowRow({
  buys, sells, net, netLvl, dim,
}: {
  buys: string; sells: string; net: string; netLvl: string; dim: boolean;
}) {
  const items = [
    { label: "Buys",  value: buys,  color: "#10b981" },
    { label: "Sells", value: sells, color: "#ef4444" },
    { label: "Net",   value: net,   color: LVL_COLOR(netLvl) },
  ];
  return (
    <div
      className="rounded-xl overflow-hidden"
      style={{ border: "1px solid rgba(255,255,255,0.055)" }}
    >
      {/* Header */}
      <div
        className="flex items-center justify-between px-4 py-2.5"
        style={{ background: "rgba(255,255,255,0.025)", borderBottom: "1px solid rgba(255,255,255,0.055)" }}
      >
        <span className="text-[9px] font-semibold uppercase tracking-[0.18em]" style={{ color: "rgba(255,255,255,0.28)" }}>
          Net Whale Flow · 60s
        </span>
        {!dim && (
          <span
            className="text-[8px] font-black uppercase tracking-[0.14em] px-2 py-0.5 rounded-md"
            style={{
              color: LVL_COLOR(netLvl),
              background: `rgba(${hexRgb(LVL_COLOR(netLvl)).join(",")},0.12)`,
              border: `1px solid rgba(${hexRgb(LVL_COLOR(netLvl)).join(",")},0.22)`,
            }}
          >
            {netLvl}
          </span>
        )}
      </div>
      {/* Columns */}
      <div className="grid grid-cols-3">
        {items.map(({ label, value, color }, i) => {
          const [r, g, b] = hexRgb(color);
          return (
            <div
              key={label}
              className="flex flex-col items-center py-3 px-2"
              style={{
                borderRight: i < 2 ? "1px solid rgba(255,255,255,0.055)" : undefined,
              }}
            >
              <span className="text-[8px] font-semibold uppercase tracking-[0.16em] mb-1.5" style={{ color: "rgba(255,255,255,0.28)" }}>
                {label}
              </span>
              <span
                className="text-[13px] font-black tabular-nums leading-none"
                style={{
                  color: dim ? "rgba(255,255,255,0.18)" : color,
                  textShadow: !dim ? `0 0 12px rgba(${r},${g},${b},0.50)` : undefined,
                }}
              >
                {dim ? "—" : value}
              </span>
            </div>
          );
        })}
      </div>
    </div>
  );
}

/* ── Section header ──────────────────────────────────────── */
function SectionLabel({ children }: { children: React.ReactNode }) {
  return (
    <div className="flex items-center gap-2 px-5 py-2.5" style={{ borderBottom: "1px solid rgba(255,255,255,0.055)" }}>
      <span className="text-[8px] font-black uppercase tracking-[0.24em]" style={{ color: "rgba(255,255,255,0.22)" }}>
        {children}
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
  const isDanger = stage === "DANGER" || stage === "SELL_ALERT";
  const isPaused = d?.trade_mode === "Pause";

  const wCount     = d?.whale_count    ?? 0;
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
  const netNeg     = wNet < 0;
  const maxDrop    = d ? Math.max(d.drop_1m, d.drop_5m, d.drop_15m, d.drop_1h, d.drop_4h) : 0;

  const drops = [
    { label: "1m",  pct: d?.drop_1m  ?? 0 },
    { label: "5m",  pct: d?.drop_5m  ?? 0 },
    { label: "15m", pct: d?.drop_15m ?? 0 },
    { label: "1h",  pct: d?.drop_1h  ?? 0 },
    { label: "4h",  pct: d?.drop_4h  ?? 0 },
  ];

  const speedColor  = !d ? "#555" : d.speed > 0.05 ? "#10b981" : d.speed < -0.05 ? "#ef4444" : "#888";
  const volColor    = !d ? "#555" : d.volatility >= 4 ? "#ef4444" : d.volatility >= 2.5 ? "#f97316" : "#10b981";
  const whaleColor  = !d ? "#555" : wCount >= 3 ? "#ef4444" : wCount >= 1 ? "#f97316" : "#10b981";
  const consecColor = !d ? "#555" : consec >= 5 ? "#ef4444" : consec >= 3 ? "#f97316" : consec >= 1 ? "#f59e0b" : "#10b981";

  const consecSub = !d ? undefined
    : consec >= 5 ? "Slow bleed"
    : consec >= 3 ? "Sustained"
    : consec >= 1 ? "Downtrend"
    : "Stable";

  const pauseReason = (() => {
    if (!d) return "";
    if (d.pause_reason?.trim()) return d.pause_reason.trim();
    const parts: string[] = [];
    drops.forEach(({ label, pct }) => { if (pct >= 1) parts.push(`${label} −${pct.toFixed(2)}%`); });
    if (consec >= 3) parts.push(`${consec} bleed mins`);
    if (volSpike)    parts.push("vol spike");
    if (wCount >= 3) parts.push(`${wCount} whale sells`);
    return parts.join("  ·  ") || "Conditions elevated — awaiting normalization";
  })();

  const [r, g, b] = hexRgb(st.hex);

  return (
    <>
      <style>{`
        @keyframes btcp_price_up {
          0%   { color: #34d399; transform: translateY(-3px); }
          100% { color: #F7931A; transform: translateY(0); }
        }
        @keyframes btcp_price_dn {
          0%   { color: #f87171; transform: translateY(3px); }
          100% { color: #F7931A; transform: translateY(0); }
        }
        @keyframes btcp_pulse {
          0%, 100% { opacity: 1; transform: scale(1); }
          50%       { opacity: 0.5; transform: scale(0.75); }
        }
        @keyframes btcp_fade_in {
          from { opacity: 0; transform: translateY(4px); }
          to   { opacity: 1; transform: translateY(0); }
        }
        .btcp-price-up { animation: btcp_price_up 0.65s cubic-bezier(0.22,1,0.36,1) both; }
        .btcp-price-dn { animation: btcp_price_dn 0.65s cubic-bezier(0.22,1,0.36,1) both; }
        .btcp-fade-in  { animation: btcp_fade_in  0.4s ease-out both; }
      `}</style>

      {/* ═══ CARD SHELL ═══ */}
      <div
        style={{
          background: "linear-gradient(160deg, #0d0f14 0%, #0a0c10 60%, #0d0f14 100%)",
          border: `1px solid rgba(${r},${g},${b},0.18)`,
          borderRadius: 20,
          boxShadow: `
            0 0 0 1px rgba(255,255,255,0.04),
            0 1px 0 0 rgba(255,255,255,0.07) inset,
            0 8px 48px -12px rgba(0,0,0,0.7),
            0 0 40px -20px rgba(${r},${g},${b},0.25)
          `,
          overflow: "hidden",
          transition: "border-color 0.7s ease, box-shadow 0.7s ease",
          position: "relative",
        }}
      >
        {/* Subtle top-right ambient glow */}
        <div
          style={{
            position: "absolute", top: -80, right: -80,
            width: 240, height: 240, borderRadius: "50%",
            background: `radial-gradient(circle, rgba(${r},${g},${b},0.07) 0%, transparent 70%)`,
            pointerEvents: "none",
            transition: "background 0.7s ease",
          }}
        />

        {/* ════ HEADER ════ */}
        <div
          className="flex items-start justify-between gap-4 px-5 pt-5 pb-4"
          style={{ borderBottom: "1px solid rgba(255,255,255,0.055)" }}
        >
          {/* Left: coin + price */}
          <div className="flex flex-col gap-2 min-w-0">
            {/* Top row: icon + label */}
            <div className="flex items-center gap-2">
              <CoinIcon symbol="BTC" size={18} />
              <span
                className="text-[9px] font-black uppercase tracking-[0.22em]"
                style={{ color: "rgba(255,255,255,0.28)" }}
              >
                BTC / USDT · Crash Monitor
              </span>
            </div>

            {/* Price */}
            <div
              className={`font-black tabular-nums leading-none ${
                flash === "up" ? "btcp-price-up" : flash === "dn" ? "btcp-price-dn" : ""
              }`}
              style={{
                fontSize: 44,
                letterSpacing: "-0.03em",
                ...(flash
                  ? {}
                  : { color: "#F7931A", textShadow: "0 0 24px rgba(247,147,26,0.40)" }),
              }}
            >
              {price ? `$${f$(price)}` : "—"}
            </div>

            {/* Status row */}
            <div className="flex items-center gap-2 mt-0.5">
              {flash === "up" && (
                <span className="flex items-center gap-0.5 text-[11px] font-black text-emerald-400">
                  <ArrowUpRight size={12} />up
                </span>
              )}
              {flash === "dn" && (
                <span className="flex items-center gap-0.5 text-[11px] font-black text-red-400">
                  <ArrowDownRight size={12} />dn
                </span>
              )}
              {!flash && (
                <span className="flex items-center gap-0.5 text-[11px] font-black opacity-0">
                  <Minus size={12} />
                </span>
              )}
              {/* Live indicator */}
              <span
                className="inline-block rounded-full"
                style={{
                  width: 6, height: 6,
                  background: d ? "#10b981" : "rgba(255,255,255,0.14)",
                  boxShadow: d ? "0 0 6px #10b981" : undefined,
                }}
              />
              <span
                className="text-[9px] font-semibold uppercase tracking-[0.16em]"
                style={{ color: "rgba(255,255,255,0.25)" }}
              >
                {d ? age : "offline"}
              </span>
            </div>
          </div>

          {/* Right: status badge */}
          <StatusPill stage={stage} sub={st.sub} danger={isDanger} />
        </div>

        {/* ════ PAUSE BANNER ════ */}
        {isPaused && (
          <div
            className="btcp-fade-in px-5 py-3 flex items-start gap-3"
            style={{
              background: "rgba(245,158,11,0.06)",
              borderBottom: "1px solid rgba(245,158,11,0.14)",
            }}
          >
            <span style={{ color: "#f59e0b", flexShrink: 0, marginTop: 1 }}>⏸</span>
            <div>
              <div
                className="text-[9px] font-black uppercase tracking-[0.18em] mb-1"
                style={{ color: "#f59e0b" }}
              >
                Trading Paused
              </div>
              <div
                className="text-[11px] font-medium leading-relaxed"
                style={{ color: "rgba(245,158,11,0.55)" }}
              >
                {pauseReason}
              </div>
            </div>
          </div>
        )}

        {/* ════ DROP TIMELINE ════ */}
        <div>
          <SectionLabel>
            <TrendingDown size={10} className="inline mr-1.5 opacity-60" />
            Drop from Peak
            {d && (
              <span
                className="ml-3 font-black"
                style={{ color: DROP_COLOR(maxDrop) }}
              >
                Max −{maxDrop.toFixed(2)}%
              </span>
            )}
          </SectionLabel>
          <div className="px-5 py-4">
            {d
              ? <DropTimeline drops={drops} />
              : (
                <div
                  className="text-[10px] font-semibold uppercase tracking-widest text-center py-3"
                  style={{ color: "rgba(255,255,255,0.10)" }}
                >
                  No data
                </div>
              )
            }
          </div>
        </div>

        <Divider />

        {/* ════ CORE METRICS (2 × 2) ════ */}
        <div className="grid grid-cols-2" style={{ borderBottom: "1px solid rgba(255,255,255,0.055)" }}>
          {/* Speed */}
          <div className="px-5 py-4" style={{ borderRight: "1px solid rgba(255,255,255,0.055)" }}>
            <StatCell
              label="Speed · 10s"
              value={!d ? "—" : `${d.speed > 0 ? "+" : ""}${d.speed.toFixed(2)}%`}
              color={speedColor}
              dim={!d}
            />
          </div>
          {/* Volatility */}
          <div className="px-5 py-4">
            <StatCell
              label="Volatility · 10s"
              value={!d ? "—" : `${d.volatility.toFixed(2)}%`}
              color={volColor}
              dim={!d}
            />
          </div>
          {/* Whale sells */}
          <div
            className="px-5 py-4"
            style={{
              borderRight: "1px solid rgba(255,255,255,0.055)",
              borderTop: "1px solid rgba(255,255,255,0.055)",
            }}
          >
            <StatCell
              label="Whale Sells · 60s"
              value={!d ? "—" : `${wCount}`}
              sub={d ? (wCount >= 3 ? `Cluster · ${fM(wUsd)}` : wUsd > 0 ? fM(wUsd) : "$0") : undefined}
              color={whaleColor}
              dim={!d}
            />
          </div>
          {/* Bleed minutes */}
          <div
            className="px-5 py-4"
            style={{ borderTop: "1px solid rgba(255,255,255,0.055)" }}
          >
            <StatCell
              label="Bleed Minutes"
              value={!d ? "—" : `${consec}`}
              sub={consecSub}
              color={consecColor}
              dim={!d}
            />
          </div>
        </div>

        {/* ════ MARKET SIGNALS ════ */}
        <div>
          <SectionLabel>Market Signals</SectionLabel>
          <div className="px-4 py-3 flex flex-col gap-2">

            {/* Liquidations */}
            <SignalRow
              icon={<Activity size={14} />}
              label="Liquidations · 60s"
              value={
                !d
                  ? "—"
                  : liqLargest > 0
                  ? `${fM(liqUsd)}  ·  Lrg ${fM(liqLargest)}`
                  : fM(liqUsd)
              }
              badge={d ? liqLvl : undefined}
              dim={!d}
              alert={liqLvl === "DANGER" && !!d}
            />

            {/* Funding rate */}
            <SignalRow
              icon={<Activity size={14} />}
              label="Funding Rate"
              value={!d ? "—" : fFn(funding)}
              badge={d ? fundLvl : undefined}
              dim={!d}
              alert={fundLvl === "DANGER" && !!d}
            />

            {/* Vol spike */}
            <SignalRow
              icon={<Activity size={14} />}
              label="Vol Spike · Red Candle"
              value={!d ? "—" : volSpike ? "SPIKE" : "Normal"}
              dim={!d}
              alert={!!d && volSpike}
            />

          </div>
        </div>

        <Divider />

        {/* ════ WHALE FLOW ════ */}
        <div className="px-4 py-3">
          <WhaleFlowRow
            buys={fM(wBuy)}
            sells={fM(wUsd)}
            net={`${netNeg ? "▼" : "▲"} ${fM(Math.abs(wNet))}`}
            netLvl={wNetLvl}
            dim={!d}
          />
        </div>

        {/* ════ FOOTER ════ */}
        <div
          className="flex items-center justify-between px-5 py-3"
          style={{ borderTop: "1px solid rgba(255,255,255,0.04)" }}
        >
          <span
            className="text-[8px] font-semibold uppercase tracking-[0.2em]"
            style={{ color: "rgba(255,255,255,0.14)" }}
          >
            Binance · Live Feed
          </span>
          <span
            className="text-[8px] font-semibold uppercase tracking-[0.2em]"
            style={{ color: "rgba(255,255,255,0.14)" }}
          >
            {d ? `Updated ${age}` : "Awaiting data"}
          </span>
        </div>

      </div>
    </>
  );
}
