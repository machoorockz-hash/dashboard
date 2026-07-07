import { useEffect, useState } from "react";
import { CoinIcon } from "./CoinIcon";
import { TrendingUp, TrendingDown, Target, Shield, DollarSign, Layers } from "lucide-react";

const API_BASE = import.meta.env.VITE_API_BASE ?? "";
const POLL_MS = 3_000;

interface DcaData {
  dca_symbol?: string;
  dca_step?: number;
  dca_total_steps?: number;
  dca_avg_price?: number;
  dca_current_price?: number;
  dca_pnl_pct?: number;
  dca_take_profit?: number;
  dca_stop_loss?: number;
  dca_usdt_spent?: number;
  status?: string;
}

interface Snapshot {
  key: string;
  updatedAt: string | null;
  data: DcaData | null;
}

function timeSince(iso: string) {
  const secs = Math.floor((Date.now() - new Date(iso).getTime()) / 1000);
  if (secs < 5) return "just now";
  if (secs < 60) return `${secs}s ago`;
  return `${Math.floor(secs / 60)}m ${secs % 60}s ago`;
}

function fmtPrice(p: number) {
  if (!p || !isFinite(p)) return "—";
  if (p >= 1000) return p.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 });
  if (p >= 1) return p.toFixed(4);
  if (p >= 0.01) return p.toFixed(5);
  return p.toFixed(6);
}

/* ─────────────────────────────────────────────────────────────────────────────
   CYBER CYLINDER COMPONENT
───────────────────────────────────────────────────────────────────────────── */

const MAGENTA = "#e040fb";
const CYAN    = "#00e5ff";
const TEAL    = "var(--primary)";
const tealMix = (pct: number) =>
  `color-mix(in oklab, var(--primary) ${pct}%, transparent)`;
const mgMix = (pct: number) =>
  `color-mix(in oklab, ${MAGENTA} ${pct}%, transparent)`;
const cyMix = (pct: number) =>
  `color-mix(in oklab, ${CYAN} ${pct}%, transparent)`;

type CylState = "completed" | "active" | "pending";

function CyberCylinder({ stepNum, state }: { stepNum: number; state: CylState }) {
  const isCompleted = state === "completed";
  const isActive    = state === "active";

  /* sizing */
  const W      = isActive ? 64 : 48;
  const BODY_H = isActive ? 100 : isCompleted ? 66 : 72;
  const EH     = Math.round(W * 0.24);   /* cap ellipse half-height */
  const totalH = BODY_H + EH * 2;

  /* cap colours */
  const capTopBg = isCompleted
    ? `radial-gradient(ellipse at 38% 32%, ${tealMix(75)}, ${tealMix(35)})`
    : isActive
    ? `radial-gradient(ellipse at 38% 32%, ${cyMix(75)}, ${mgMix(50)})`
    : `color-mix(in oklab, var(--muted-foreground) 6%, transparent)`;

  const capTopBorder = isCompleted
    ? `1.5px solid ${tealMix(55)}`
    : isActive
    ? `1.5px solid ${cyMix(70)}`
    : `1px solid color-mix(in oklab, var(--muted-foreground) 16%, transparent)`;

  const capTopShadow = isCompleted
    ? `0 0 14px ${tealMix(55)}, inset 0 2px 5px ${tealMix(30)}`
    : isActive
    ? `0 0 20px ${cyMix(75)}, 0 0 36px ${mgMix(40)}`
    : "none";

  const capBotBg = isCompleted
    ? `radial-gradient(ellipse at 38% 68%, ${tealMix(55)}, ${tealMix(22)})`
    : isActive
    ? `radial-gradient(ellipse at 38% 68%, ${mgMix(65)}, ${cyMix(30)})`
    : `color-mix(in oklab, var(--muted-foreground) 4%, transparent)`;

  const capBotBorder = isCompleted
    ? `1px solid ${tealMix(40)}`
    : isActive
    ? `1.5px solid ${mgMix(55)}`
    : `1px solid color-mix(in oklab, var(--muted-foreground) 10%, transparent)`;

  const capBotShadow = isCompleted
    ? `0 0 22px ${tealMix(65)}, 0 6px 18px ${tealMix(45)}`
    : isActive
    ? `0 0 28px ${mgMix(80)}, 0 6px 22px ${cyMix(55)}`
    : "none";

  /* bottom badge ring colours */
  const badgeBorder = isCompleted
    ? `1px solid ${tealMix(50)}`
    : isActive
    ? `2px solid ${cyMix(70)}`
    : `1px solid color-mix(in oklab, var(--muted-foreground) 18%, transparent)`;

  const badgeBg = isCompleted
    ? tealMix(18)
    : isActive
    ? mgMix(14)
    : "transparent";

  const badgeColor = isCompleted
    ? TEAL
    : isActive
    ? CYAN
    : "color-mix(in oklab, var(--muted-foreground) 38%, transparent)";

  const badgeShadow = isActive
    ? `0 0 9px ${cyMix(65)}`
    : isCompleted
    ? `0 0 5px ${tealMix(30)}`
    : "none";

  return (
    <div style={{ display: "flex", flexDirection: "column", alignItems: "center", gap: 6 }}>
      {/* "NOW" floating label — only on active */}
      <div style={{ height: 18, display: "flex", alignItems: "center", justifyContent: "center" }}>
        {isActive && (
          <span style={{
            fontSize: 9,
            fontWeight: 900,
            letterSpacing: "0.22em",
            textTransform: "uppercase",
            color: CYAN,
            animation: "cyl-now-pulse 1.2s ease-in-out infinite",
          }}>
            NOW
          </span>
        )}
      </div>

      {/* ── Main cylinder wrapper ── */}
      <div style={{ position: "relative", width: W, height: totalH, flexShrink: 0 }}>

        {/* Outer orbit rings — active only */}
        {isActive && (
          <>
            {/* Ring 1: tight dashed, clockwise */}
            <div style={{
              position: "absolute",
              inset: -10,
              borderRadius: "50%",
              border: `1.5px dashed ${mgMix(42)}`,
              animation: "cyl-ring-cw 3.8s linear infinite",
              pointerEvents: "none",
            }} />
            {/* Ring 2: wider, counter-clockwise */}
            <div style={{
              position: "absolute",
              inset: -18,
              borderRadius: "50%",
              border: `1px dashed ${cyMix(28)}`,
              animation: "cyl-ring-ccw 6.5s linear infinite",
              pointerEvents: "none",
            }} />
            {/* Ring 3: very faint widest */}
            <div style={{
              position: "absolute",
              inset: -26,
              borderRadius: "50%",
              border: `1px solid ${mgMix(10)}`,
              animation: "cyl-ring-cw 11s linear infinite",
              pointerEvents: "none",
            }} />
          </>
        )}

        {/* ── TOP CAP (ellipse) — z-index 3 so it sits on top of body ── */}
        <div style={{
          position: "absolute",
          top: 0,
          left: 0,
          right: 0,
          height: EH * 2,
          borderRadius: "50%",
          zIndex: 3,
          background: capTopBg,
          border: capTopBorder,
          boxShadow: capTopShadow,
        }} />

        {/* ── CYLINDER BODY ── */}
        <div style={{
          position: "absolute",
          top: EH,
          left: 0,
          right: 0,
          height: BODY_H,
          overflow: "hidden",
          zIndex: 2,
        }}>

          {/* Glass wall base */}
          <div style={{
            position: "absolute",
            inset: 0,
            background: isCompleted
              ? `linear-gradient(90deg, ${tealMix(14)} 0%, ${tealMix(6)} 50%, ${tealMix(18)} 100%)`
              : isActive
              ? `linear-gradient(90deg, ${mgMix(11)} 0%, ${cyMix(5)} 50%, ${mgMix(14)} 100%)`
              : "color-mix(in oklab, var(--muted-foreground) 3%, transparent)",
            backdropFilter: "blur(6px)",
          }} />

          {/* Left highlight strip */}
          <div style={{
            position: "absolute",
            left: 0, top: 0, bottom: 0,
            width: Math.max(3, W * 0.055),
            background: isCompleted
              ? `linear-gradient(180deg, ${tealMix(45)} 0%, ${tealMix(18)} 100%)`
              : isActive
              ? `linear-gradient(180deg, ${cyMix(55)} 0%, ${mgMix(28)} 100%)`
              : "color-mix(in oklab, var(--muted-foreground) 10%, transparent)",
          }} />

          {/* Right shadow strip */}
          <div style={{
            position: "absolute",
            right: 0, top: 0, bottom: 0,
            width: Math.max(3, W * 0.055),
            background: isCompleted
              ? `linear-gradient(180deg, ${tealMix(22)} 0%, ${tealMix(9)} 100%)`
              : isActive
              ? `linear-gradient(180deg, ${mgMix(28)} 0%, ${cyMix(14)} 100%)`
              : "color-mix(in oklab, var(--muted-foreground) 5%, transparent)",
          }} />

          {/* Left / right wall borders */}
          <div style={{
            position: "absolute",
            inset: 0,
            borderLeft: isCompleted
              ? `1.5px solid ${tealMix(50)}`
              : isActive
              ? `1.5px solid ${mgMix(60)}`
              : `1px solid color-mix(in oklab, var(--muted-foreground) 14%, transparent)`,
            borderRight: isCompleted
              ? `1.5px solid ${tealMix(28)}`
              : isActive
              ? `1.5px solid ${cyMix(38)}`
              : `1px solid color-mix(in oklab, var(--muted-foreground) 9%, transparent)`,
          }} />

          {/* ── ACTIVE: plasma core ── */}
          {isActive && (
            <>
              {/* Main plasma column */}
              <div style={{
                position: "absolute",
                inset: "8% 14%",
                borderRadius: "35%",
                background: `linear-gradient(0deg, ${MAGENTA} 0%, ${CYAN} 45%, ${MAGENTA} 100%)`,
                backgroundSize: "100% 250%",
                animation: "plasma-flow 1.35s ease-in-out infinite",
                filter: "blur(7px)",
                opacity: 0.62,
              }} />
              {/* Bright inner core spark */}
              <div style={{
                position: "absolute",
                inset: "22% 28%",
                borderRadius: "30%",
                background: `radial-gradient(ellipse, rgba(255,255,255,0.9) 0%, ${CYAN} 40%, transparent 70%)`,
                animation: "plasma-spark 0.85s ease-in-out infinite alternate",
                filter: "blur(3px)",
                opacity: 0.55,
              }} />
              {/* Horizontal circuit scan lines */}
              <div style={{
                position: "absolute",
                inset: 0,
                backgroundImage: `
                  repeating-linear-gradient(
                    0deg,
                    transparent,
                    transparent 7px,
                    ${cyMix(7)} 7px,
                    ${cyMix(7)} 8px
                  )
                `,
                opacity: 0.55,
                animation: "plasma-scan 2s linear infinite",
                backgroundSize: "100% 16px",
              }} />
              {/* Ambient radial bloom */}
              <div style={{
                position: "absolute",
                inset: "0%",
                background: `radial-gradient(ellipse at 50% 50%, ${cyMix(16)}, transparent 70%)`,
                animation: "plasma-bloom 1.6s ease-in-out infinite alternate",
              }} />
            </>
          )}

          {/* ── COMPLETED: inner teal glow bloom ── */}
          {isCompleted && (
            <div style={{
              position: "absolute",
              inset: "12% 18%",
              borderRadius: "30%",
              background: `radial-gradient(ellipse, ${tealMix(65)}, ${tealMix(22)}, transparent)`,
              animation: "cyl-glow-breathe 2.6s ease-in-out infinite",
              filter: "blur(5px)",
            }} />
          )}

          {/* ── Centre icon / number ── */}
          <div style={{
            position: "absolute",
            inset: 0,
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            zIndex: 4,
          }}>
            {isCompleted ? (
              <svg
                viewBox="0 0 14 14"
                width={15}
                height={15}
                fill="none"
                stroke={TEAL}
                strokeWidth="2.5"
                strokeLinecap="round"
                strokeLinejoin="round"
                style={{ filter: `drop-shadow(0 0 5px ${TEAL}) drop-shadow(0 0 10px ${tealMix(60)})` }}
              >
                <polyline points="2.5,7 5.5,10.5 11.5,3.5" />
              </svg>
            ) : isActive ? (
              <span style={{
                fontSize: 20,
                fontWeight: 900,
                color: "white",
                lineHeight: 1,
                animation: "plasma-num 1.4s ease-in-out infinite alternate",
                letterSpacing: "-0.02em",
              }}>
                {stepNum}
              </span>
            ) : (
              <span style={{
                fontSize: 12,
                fontWeight: 700,
                lineHeight: 1,
                color: "color-mix(in oklab, var(--muted-foreground) 32%, transparent)",
              }}>
                {stepNum}
              </span>
            )}
          </div>
        </div>

        {/* ── BOTTOM CAP (ellipse) — z-index 1, behind body walls but visible ── */}
        <div style={{
          position: "absolute",
          bottom: 0,
          left: 0,
          right: 0,
          height: EH * 2,
          borderRadius: "50%",
          zIndex: 1,
          background: capBotBg,
          border: capBotBorder,
          boxShadow: capBotShadow,
        }} />

        {/* ── Base floor glow ── */}
        {(isCompleted || isActive) && (
          <div style={{
            position: "absolute",
            bottom: -10,
            left: "5%",
            right: "5%",
            height: 10,
            borderRadius: "50%",
            background: isCompleted
              ? `radial-gradient(ellipse, ${tealMix(55)}, transparent)`
              : `radial-gradient(ellipse, ${mgMix(65)}, transparent)`,
            filter: "blur(5px)",
            animation: isActive
              ? "cyl-base-pulse 1.2s ease-in-out infinite"
              : "cyl-glow-breathe 2.6s ease-in-out infinite",
            zIndex: 0,
          }} />
        )}
      </div>

      {/* ── Bottom badge (step number ring + label) ── */}
      <div style={{ display: "flex", flexDirection: "column", alignItems: "center", gap: 3 }}>
        <div style={{
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          width: 20,
          height: 20,
          borderRadius: "50%",
          border: badgeBorder,
          background: badgeBg,
          boxShadow: badgeShadow,
          fontSize: 9,
          fontWeight: 800,
          color: badgeColor,
        }}>
          {isCompleted ? (
            <svg viewBox="0 0 10 10" width={9} height={9} fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round">
              <polyline points="1.5,5 4,8 8.5,2" />
            </svg>
          ) : stepNum}
        </div>
        <span style={{
          fontSize: 8,
          fontWeight: 700,
          letterSpacing: "0.07em",
          textTransform: "uppercase",
          color: isCompleted
            ? tealMix(58)
            : isActive
            ? cyMix(82)
            : "color-mix(in oklab, var(--muted-foreground) 28%, transparent)",
          textShadow: isActive ? `0 0 7px ${cyMix(70)}` : "none",
        }}>
          {isCompleted ? "done" : isActive ? "active" : `step ${stepNum}`}
        </span>
      </div>
    </div>
  );
}

/* ─────────────────────────────────────────────────────────────────────────────
   CYLINDER ROW — replaces old StepSegments
───────────────────────────────────────────────────────────────────────────── */
function CylinderRow({ step, total }: { step: number; total: number }) {
  return (
    <>
      <style>{`
        /* ── Plasma active animations ── */
        @keyframes plasma-flow {
          0%   { background-position: 50% 110%; }
          50%  { background-position: 50% -10%; }
          100% { background-position: 50% 110%; }
        }
        @keyframes plasma-spark {
          from { opacity: 0.28; transform: scale(0.78); }
          to   { opacity: 0.60; transform: scale(1.12); }
        }
        @keyframes plasma-scan {
          from { background-position: 0 0; }
          to   { background-position: 0 16px; }
        }
        @keyframes plasma-bloom {
          from { opacity: 0.4; }
          to   { opacity: 0.9; }
        }
        @keyframes plasma-num {
          from { text-shadow: 0 0 8px #00e5ff, 0 0 20px #e040fb; opacity: 0.88; }
          to   { text-shadow: 0 0 18px #00e5ff, 0 0 38px #e040fb, 0 0 55px #00e5ff; opacity: 1; }
        }

        /* ── "NOW" label ── */
        @keyframes cyl-now-pulse {
          0%, 100% { opacity: 0.68; letter-spacing: 0.22em; }
          50%       { opacity: 1;   letter-spacing: 0.28em;
                      text-shadow: 0 0 10px #00e5ff, 0 0 22px #e040fb; }
        }

        /* ── Orbit rings ── */
        @keyframes cyl-ring-cw  { to { transform: rotate(360deg);  } }
        @keyframes cyl-ring-ccw { to { transform: rotate(-360deg); } }

        /* ── Completed glow breathe ── */
        @keyframes cyl-glow-breathe {
          0%, 100% { opacity: 0.45; }
          50%       { opacity: 0.88; }
        }

        /* ── Active base floor pulse ── */
        @keyframes cyl-base-pulse {
          0%, 100% { opacity: 0.38; transform: scaleX(0.88); }
          50%       { opacity: 0.88; transform: scaleX(1.14); }
        }
      `}</style>

      {/* Platform base line */}
      <div style={{ position: "relative", padding: "22px 4px 10px" }}>
        {/* Recessed platform */}
        <div style={{
          position: "absolute",
          bottom: 30,
          left: "6%",
          right: "6%",
          height: 4,
          borderRadius: 2,
          background: "color-mix(in oklab, var(--muted-foreground) 7%, transparent)",
          backdropFilter: "blur(4px)",
        }} />

        <div style={{
          display: "flex",
          alignItems: "flex-end",
          justifyContent: "center",
          gap: 14,
          flexWrap: "wrap",
        }}>
          {Array.from({ length: total }).map((_, i) => {
            const state: CylState =
              i < step - 1 ? "completed" : i === step - 1 ? "active" : "pending";
            return <CyberCylinder key={i} stepNum={i + 1} state={state} />;
          })}
        </div>
      </div>
    </>
  );
}

/* ─────────────────────────────────────────────────────────────────────────────
   METRIC CELL — unchanged from original
───────────────────────────────────────────────────────────────────────────── */
function MetricCell({
  icon, label, value, accent, bull, bear,
}: {
  icon: React.ReactNode;
  label: string;
  value: string;
  accent?: boolean;
  bull?: boolean;
  bear?: boolean;
}) {
  const colorCls = bull
    ? "text-bull border-bull/20 bg-bull/5"
    : bear
    ? "text-bear border-bear/20 bg-bear/5"
    : accent
    ? "text-primary border-primary/20 bg-primary/5"
    : "text-foreground border-border bg-muted/20";
  const labelCls = bull
    ? "text-bull/60"
    : bear
    ? "text-bear/60"
    : accent
    ? "text-primary/60"
    : "text-muted-foreground";
  return (
    <div className={`rounded-xl border px-3 py-2.5 ${colorCls}`}>
      <div className={`flex items-center gap-1 text-[9px] uppercase tracking-widest font-bold mb-1 ${labelCls}`}>
        {icon}{label}
      </div>
      <div className="font-black text-xs tabular-nums truncate">{value}</div>
    </div>
  );
}

/* ─────────────────────────────────────────────────────────────────────────────
   MAIN CARD — data-fetching logic unchanged; only step visualisation swapped
───────────────────────────────────────────────────────────────────────────── */
export default function DcaStepCard() {
  const [snapshot, setSnapshot] = useState<Snapshot | null>(null);
  const [age, setAge] = useState<string>("");

  useEffect(() => {
    let alive = true;
    let timer: ReturnType<typeof setTimeout>;
    async function fetchData() {
      try {
        const r = await fetch(`${API_BASE}/api/bot/data?key=dca`);
        if (!r.ok) return;
        const json = (await r.json()) as Snapshot;
        if (alive) setSnapshot(json);
      } catch {}
      finally {
        timer = setTimeout(fetchData, POLL_MS);
      }
    }
    fetchData();
    return () => { alive = false; clearTimeout(timer); };
  }, []);

  useEffect(() => {
    if (!snapshot?.updatedAt) return;
    const id = setInterval(() => setAge(timeSince(snapshot.updatedAt!)), 1000);
    setAge(timeSince(snapshot.updatedAt));
    return () => clearInterval(id);
  }, [snapshot?.updatedAt]);

  const d = snapshot?.data;
  const step        = d?.dca_step ?? 0;
  const total       = d?.dca_total_steps ?? 6;
  const symbol      = d?.dca_symbol ?? "";
  const base        = symbol.replace(/USDT$|BUSD$|FDUSD$/, "");
  const pnl         = d?.dca_pnl_pct ?? 0;
  const isCompleted = d?.status === "COMPLETED";

  if (!snapshot?.updatedAt || isCompleted || step === 0) return null;

  return (
    <section className="rounded-2xl border border-primary/30 bg-card relative overflow-hidden flex flex-col gap-0 shadow-[0_0_40px_-15px_color-mix(in_oklab,var(--primary)_35%,transparent)]">
      <style>{`
        @keyframes dca-top-bar-pulse {
          0%, 100% { opacity: 0.4; }
          50%       { opacity: 0.9; }
        }
        @keyframes dca-shimmer {
          0%   { transform: translateX(-100%) skewX(-15deg); }
          100% { transform: translateX(400%)  skewX(-15deg); }
        }
        .dca-top-bar { animation: dca-top-bar-pulse 2s ease-in-out infinite; }
      `}</style>

      {/* Top glow bar */}
      <div className="pointer-events-none absolute inset-x-0 top-0 h-[2px] dca-top-bar bg-gradient-to-r from-transparent via-primary to-transparent" />
      {/* Ambient corner radial */}
      <div className="pointer-events-none absolute inset-0 bg-[radial-gradient(ellipse_at_top_left,color-mix(in_oklab,var(--primary)_10%,transparent),transparent_60%)]" />

      {/* ── HEADER ── */}
      <div className="relative px-5 pt-5 pb-4 border-b border-border/50">
        <div className="flex items-center justify-between gap-3 flex-wrap">
          <div className="flex items-center gap-3">
            <div className="relative flex items-center justify-center h-9 w-9 rounded-xl border border-primary/30 bg-gradient-to-br from-primary/25 via-primary/10 to-transparent shrink-0">
              <div className="absolute inset-0 rounded-xl bg-[radial-gradient(circle_at_top_left,color-mix(in_oklab,var(--primary)_30%,transparent),transparent_70%)]" />
              <Layers className="relative h-[18px] w-[18px] text-primary" strokeWidth={2.5} />
            </div>
            <div>
              <div className="flex items-center gap-2">
                <span className="font-black text-sm uppercase tracking-wide">DCA Trade Active</span>
                <span className="flex items-center gap-1 px-2 py-0.5 rounded-md bg-primary/15 border border-primary/30 text-[9px] font-black uppercase tracking-widest text-primary">
                  <span className="h-1.5 w-1.5 rounded-full bg-primary animate-pulse" />
                  Live
                </span>
              </div>
              <div className="text-[10px] text-muted-foreground mt-0.5">
                {snapshot?.updatedAt ? `updated ${age}` : "Waiting for bot…"}
              </div>
            </div>
          </div>

          {base && (
            <div className="flex items-center gap-2.5 shrink-0">
              <CoinIcon symbol={base} size={36} />
              <div>
                <div className="font-black text-base leading-none">{base}</div>
                <div className="text-[10px] text-muted-foreground mt-0.5">/USDT</div>
              </div>
            </div>
          )}
        </div>
      </div>

      {/* ── BODY ── */}
      <div className="relative px-5 py-5 flex flex-col gap-4">

        {/* PnL row */}
        <div className="flex items-center justify-between flex-wrap gap-3">
          <div>
            <div className="text-[9px] uppercase tracking-widest font-bold text-muted-foreground mb-1.5">DCA Step</div>
            <div className="flex items-baseline gap-2">
              <span
                className="text-5xl font-black tabular-nums text-primary leading-none"
                style={{ textShadow: "0 0 30px color-mix(in oklab, var(--primary) 50%, transparent)" }}
              >
                {step}
              </span>
              <span className="text-2xl font-black text-muted-foreground/50">/ {total}</span>
            </div>
          </div>

          <div className="text-right">
            <div className="text-[9px] uppercase tracking-widest font-bold text-muted-foreground mb-1">Unrealised PnL</div>
            <div className={`text-2xl font-black tabular-nums leading-none ${pnl >= 0 ? "text-bull" : "text-bear"}`}>
              {pnl >= 0 ? "+" : ""}{pnl.toFixed(2)}%
            </div>
            <div className={`flex items-center justify-end gap-1 mt-1 text-[10px] font-bold ${pnl >= 0 ? "text-bull/70" : "text-bear/70"}`}>
              {pnl >= 0 ? <TrendingUp className="h-3 w-3" /> : <TrendingDown className="h-3 w-3" />}
              {pnl >= 0 ? "Profit" : "Loss"}
            </div>
          </div>
        </div>

        {/* ── CYBER CYLINDER STEP VISUALISER ── */}
        <CylinderRow step={step} total={total} />

        {/* Metrics grid */}
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
          <MetricCell
            icon={<DollarSign className="h-3 w-3" />}
            label="Avg Entry"
            value={d?.dca_avg_price ? `$${fmtPrice(d.dca_avg_price)}` : "—"}
          />
          <MetricCell
            icon={<DollarSign className="h-3 w-3" />}
            label="Current"
            value={d?.dca_current_price ? `$${fmtPrice(d.dca_current_price)}` : "—"}
            accent
          />
          <MetricCell
            icon={<Target className="h-3 w-3" />}
            label="Take Profit"
            value={d?.dca_take_profit ? `$${fmtPrice(d.dca_take_profit)}` : "—"}
            bull
          />
          <MetricCell
            icon={<Shield className="h-3 w-3" />}
            label="Stop Loss"
            value={d?.dca_stop_loss ? `$${fmtPrice(d.dca_stop_loss)}` : "—"}
            bear
          />
        </div>

        {/* USDT spent */}
        {d?.dca_usdt_spent ? (
          <div className="flex items-center justify-between rounded-xl border border-border bg-muted/20 px-4 py-2.5">
            <span className="text-[10px] uppercase tracking-widest font-bold text-muted-foreground">USDT Invested</span>
            <span className="font-black text-sm tabular-nums">${d.dca_usdt_spent.toFixed(2)}</span>
          </div>
        ) : null}
      </div>
    </section>
  );
}
