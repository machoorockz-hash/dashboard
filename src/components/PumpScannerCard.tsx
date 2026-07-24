import { useEffect, useRef, useState } from "react";
import { CoinIcon } from "./CoinIcon";

const API_BASE = import.meta.env.VITE_API_BASE ?? "";
const PUMP_KEY = import.meta.env.VITE_PUMP_KEY ?? "pump";
const POLL_MS = 5_000;
const STALE_MS = 10_000;

interface PumpSignal {
  symbol: string;
  price: number;
  timestamp: string;
  score?: number | null; // optional — server may omit it on older records
}

interface PumpData {
  active: boolean;
  lastHeartbeat: string | null;
  signals: PumpSignal[];
}

function toUAE(iso: string) {
  const d = new Date(iso);
  // Guard: invalid / missing timestamp — never let Intl throw and crash the tree
  if (!iso || isNaN(d.getTime())) return { date: "--/--/----", time: "--:-- --" };
  const date = new Intl.DateTimeFormat("en-GB", {
    timeZone: "Asia/Dubai",
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
  }).format(d);
  const time = new Intl.DateTimeFormat("en-US", {
    timeZone: "Asia/Dubai",
    hour: "2-digit",
    minute: "2-digit",
    hour12: true,
  }).format(d);
  return { date, time: time.toLowerCase() };
}

function formatPrice(p: number) {
  // Guard: non-number price (e.g. heartbeat row accidentally stored as signal)
  if (typeof p !== "number" || isNaN(p)) return "-";
  if (p >= 1) return p.toFixed(4);
  if (p >= 0.001) return p.toFixed(6);
  return p.toFixed(8);
}

function FlareBeamAnimation() {
  return (
    <div className="flex flex-col items-center gap-3">
      <div style={{ position: "relative", width: 62, height: 62 }}>
        {/* outer rings */}
        <svg width="62" height="62" viewBox="0 0 88 88" style={{ position: "absolute", inset: 0 }}>
          <circle
            className="fb-ring"
            cx="44" cy="44" r="40"
            fill="none"
            stroke="color-mix(in oklab, silver 30%, transparent)"
            strokeWidth="1"
            strokeDasharray="3 9"
          />
          <circle
            className="fb-ring"
            cx="44" cy="44" r="32"
            fill="none"
            stroke="color-mix(in oklab, silver 15%, transparent)"
            strokeWidth="0.8"
          />
        </svg>

        {/* rotating beam */}
        <svg width="62" height="62" viewBox="0 0 88 88" style={{ position: "absolute", inset: 0 }}>
          <defs>
            <linearGradient id="fb-beam-cg" x1="0%" y1="0%" x2="100%" y2="0%">
              <stop offset="0%" stopColor="color-mix(in oklab, silver 95%, white)" stopOpacity="0.7" />
              <stop offset="40%" stopColor="color-mix(in oklab, silver 80%, transparent)" stopOpacity="0.3" />
              <stop offset="100%" stopColor="color-mix(in oklab, silver 60%, transparent)" stopOpacity="0" />
            </linearGradient>
            <linearGradient id="fb-beam2-cg" x1="0%" y1="0%" x2="100%" y2="0%">
              <stop offset="0%" stopColor="color-mix(in oklab, silver 70%, white)" stopOpacity="0.2" />
              <stop offset="100%" stopColor="color-mix(in oklab, silver 50%, transparent)" stopOpacity="0" />
            </linearGradient>
          </defs>
          <g className="fb-spin">
            {/* wide soft sector */}
            <path d="M44,44 L84,36 L84,52 Z" fill="url(#fb-beam2-cg)" />
            {/* sharp ray */}
            <line
              x1="44" y1="44" x2="84" y2="44"
              stroke="url(#fb-beam-cg)"
              strokeWidth="1.5"
              strokeLinecap="round"
            />
          </g>
        </svg>

        {/* centre orb */}
        <div className="fb-orb" style={{
          position: "absolute", top: "50%", left: "50%",
          transform: "translate(-50%,-50%)",
          width: 8, height: 8, borderRadius: "50%",
          background: "radial-gradient(circle, white 0%, color-mix(in oklab, silver 90%, white) 40%, color-mix(in oklab, silver 80%, transparent) 100%)",
        }} />

        {/* crosshairs */}
        <svg width="62" height="62" viewBox="0 0 88 88" style={{ position: "absolute", inset: 0, opacity: 0.2 }}>
          <line x1="44" y1="2"  x2="44" y2="20" stroke="color-mix(in oklab, silver 80%, transparent)" strokeWidth="1" />
          <line x1="44" y1="68" x2="44" y2="86" stroke="color-mix(in oklab, silver 80%, transparent)" strokeWidth="1" />
          <line x1="2"  y1="44" x2="20" y2="44" stroke="color-mix(in oklab, silver 80%, transparent)" strokeWidth="1" />
          <line x1="68" y1="44" x2="86" y2="44" stroke="color-mix(in oklab, silver 80%, transparent)" strokeWidth="1" />
        </svg>
      </div>

      <div className="text-center">
        <div className="fb-blink text-[10px] font-black tracking-[0.22em] uppercase" style={{ color: "silver" }}>
          Scanning Markets
        </div>
        <div className="text-[9px] tracking-[0.15em] uppercase text-muted-foreground/45 mt-1">
          monitoring all USDT pairs
        </div>
      </div>
    </div>
  );
}

/** Returns the signal tier label and its matching color for a given score. */
function getSignalTier(sc: number | null): { label: string; color: string } | null {
  if (sc === null) return null;
  if (sc >= 90) return { label: "ELITE",  color: "#f97316" };
  if (sc >= 85) return { label: "STRONG", color: "#eab308" };
  if (sc >= 80) return { label: "SIGNAL", color: "#14b8a6" };
  return null;
}

export default function PumpScannerCard() {
  const [data, setData] = useState<PumpData | null>(null);
  const [stale, setStale] = useState(false);
  const [newKeys, setNewKeys] = useState<Set<string>>(new Set());
  const [latestKey, setLatestKey] = useState<string | null>(null);
  const seenRef = useRef<Set<string>>(new Set());
  const lastFetchRef = useRef<number>(0);

  useEffect(() => {
    let timer: ReturnType<typeof setTimeout>;

    async function fetchData() {
      try {
        const r = await fetch(`${API_BASE}/api/pump/data?key=${PUMP_KEY}`);
        const json: PumpData = await r.json();
        lastFetchRef.current = Date.now();
        setStale(false);

        const incoming = new Set<string>();
        let newestKey: string | null = null;

        json.signals.forEach((s, i) => {
          const k = `${s.symbol}-${s.timestamp}`;
          if (!seenRef.current.has(k)) {
            incoming.add(k);
            seenRef.current.add(k);
            if (i === 0) newestKey = k;
          }
        });

        if (incoming.size > 0) {
          setNewKeys(incoming);
          if (newestKey) {
            setLatestKey(newestKey);
          }
          setTimeout(() => setNewKeys(new Set()), 2000);
        }

        setData(json);
      } catch {
        if (Date.now() - lastFetchRef.current > STALE_MS) setStale(true);
      } finally {
        timer = setTimeout(fetchData, POLL_MS);
      }
    }

    void fetchData();
    return () => clearTimeout(timer);
  }, []);

  const active = !stale && data?.active;

  return (
    <section className="rounded-2xl border border-border bg-transparent p-4 shadow-sm flex flex-col gap-3">
      <style>{`
        @keyframes pump-slide-in {
          from { opacity: 0; transform: translateX(22px) scale(0.97); }
          to   { opacity: 1; transform: translateX(0) scale(1); }
        }
        @keyframes pump-latest-in {
          0%   { opacity: 0; transform: translateX(22px) scale(0.96); box-shadow: none; }
          40%  { opacity: 1; transform: translateX(0) scale(1.012); }
          60%  { transform: scale(1); }
          100% { transform: scale(1); }
        }
        @keyframes pump-glow-pulse {
          0%, 100% { box-shadow: 0 0 0px 0px color-mix(in oklab, var(--primary) 0%, transparent); }
          50%      { box-shadow: 0 0 8px 2px color-mix(in oklab, var(--primary) 14%, transparent); }
        }
        @keyframes pump-shimmer {
          0%   { background-position: -200% center; }
          100% { background-position: 200% center; }
        }
        .pump-new {
          animation: pump-slide-in 0.45s cubic-bezier(0.22,1,0.36,1) both;
        }
        .pump-latest {
          animation:
            pump-latest-in 0.5s cubic-bezier(0.22,1,0.36,1) both,
            pump-glow-pulse 1.8s ease-in-out 0.5s infinite;
        }
        .pump-latest-shimmer::after {
          content: "";
          position: absolute;
          inset: 0;
          border-radius: inherit;
          background: linear-gradient(
            105deg,
            transparent 30%,
            color-mix(in oklab, var(--primary) 18%, transparent) 50%,
            transparent 70%
          );
          background-size: 200% 100%;
          animation: pump-shimmer 1.4s ease-in-out 0.3s 2;
          pointer-events: none;
        }
        .pump-scroll {
          scrollbar-width: thin;
          scrollbar-color: color-mix(in oklab, var(--primary) 35%, transparent) transparent;
        }
        .pump-scroll::-webkit-scrollbar { width: 3px; }
        .pump-scroll::-webkit-scrollbar-track { background: transparent; border-radius: 9999px; }
        .pump-scroll::-webkit-scrollbar-thumb {
          background: color-mix(in oklab, var(--primary) 35%, transparent);
          border-radius: 9999px;
        }
        .pump-scroll::-webkit-scrollbar-thumb:hover {
          background: color-mix(in oklab, var(--primary) 65%, transparent);
        }
        @keyframes fb-rotate { from{transform:rotate(0deg)} to{transform:rotate(360deg)} }
        @keyframes fb-orb {
          0%,100% { box-shadow: 0 0 4px 2px color-mix(in oklab,silver 25%,transparent), 0 0 8px 3px color-mix(in oklab,silver 10%,transparent); }
          50%     { box-shadow: 0 0 6px 3px color-mix(in oklab,silver 35%,transparent), 0 0 14px 5px color-mix(in oklab,silver 15%,transparent); }
        }
        @keyframes fb-ring  { 0%,100%{opacity:.2} 50%{opacity:.5} }
        @keyframes fb-blink { 0%,100%{opacity:1}  50%{opacity:.3} }
        .fb-spin  { animation: fb-rotate 4s linear infinite; transform-origin: 44px 44px; }
        .fb-orb   { animation: fb-orb   2s ease-in-out infinite; }
        .fb-ring  { animation: fb-ring  2s ease-in-out infinite; }
        .fb-blink { animation: fb-blink 2s ease-in-out infinite; }
        @keyframes ca-trace {
          0%   { stroke-dashoffset: 120; opacity: 0.3; }
          40%  { stroke-dashoffset: 0;   opacity: 1; }
          80%  { stroke-dashoffset: 0;   opacity: 1; }
          100% { stroke-dashoffset: -120; opacity: 0.3; }
        }
        @keyframes ca-node {
          0%,100% { fill: rgba(0,255,180,0.2); }
          50%     { fill: rgba(0,255,180,0.9); filter: drop-shadow(0 0 3px #00ffb4); }
        }
        @keyframes ca-arrow-glow {
          0%,100% { filter: drop-shadow(0 0 3px rgba(0,255,180,0.7)) drop-shadow(0 0 7px rgba(0,255,180,0.3)); }
          50%     { filter: drop-shadow(0 0 6px rgba(0,255,180,1)) drop-shadow(0 0 14px rgba(0,255,180,0.5)); }
        }
        .ca-trace-1 { stroke-dasharray: 120; animation: ca-trace 2.8s ease-in-out infinite; }
        .ca-trace-2 { stroke-dasharray: 80;  animation: ca-trace 2.8s ease-in-out 0.5s infinite; }
        .ca-trace-3 { stroke-dasharray: 60;  animation: ca-trace 2.8s ease-in-out 1s infinite; }
        .ca-node-1  { animation: ca-node 1.8s ease-in-out infinite; }
        .ca-node-2  { animation: ca-node 1.8s ease-in-out 0.6s infinite; }
        .ca-node-3  { animation: ca-node 1.8s ease-in-out 1.2s infinite; }
        .ca-arrow   { animation: ca-arrow-glow 2s ease-in-out infinite; }

        /* ── Radar Sweep footer ── */
        @keyframes rs-spin { from{transform:rotate(0deg)} to{transform:rotate(360deg)} }
        @keyframes rs-ring { 0%,100%{opacity:0.15} 50%{opacity:0.45} }
        @keyframes rs-blip { 0%,100%{opacity:0.15;r:1.5} 50%{opacity:1;r:2.8} }
        @keyframes rs-label { 0%,100%{opacity:0.35} 50%{opacity:0.9} }
        .rs-spin { animation: rs-spin 3s linear infinite; transform-origin: 22px 22px; }
        .rs-ring { animation: rs-ring 2s ease-in-out infinite; }
        .rs-blip-1 { animation: rs-blip 2.1s ease-in-out 0.3s infinite; }
        .rs-blip-2 { animation: rs-blip 2.1s ease-in-out 0.9s infinite; }
        .rs-blip-3 { animation: rs-blip 2.1s ease-in-out 1.5s infinite; }
        .rs-sym    { animation: rs-label 2s ease-in-out var(--d,0s) infinite; }
      `}</style>

      {/* ── HEADER ── */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2.5">
          <div className="relative flex items-center justify-center h-8 w-8 rounded-xl border" style={{ borderColor: "rgba(0,255,180,0.25)", background: "linear-gradient(135deg, rgba(0,255,180,0.15) 0%, rgba(0,255,180,0.06) 50%, transparent 100%)" }}>
            <div className="absolute inset-0 rounded-xl" style={{ background: "radial-gradient(circle at top left, rgba(0,255,180,0.20), transparent 70%)" }} />
            <svg className="relative" width="18" height="18" viewBox="0 0 88 88">
              <path d="M14,70 L14,50 L30,50 L30,36" fill="none" stroke="rgba(0,255,180,0.55)" strokeWidth="5" strokeLinecap="round" strokeLinejoin="round" className="ca-trace-1" />
              <path d="M74,70 L74,54 L58,54 L58,36" fill="none" stroke="rgba(0,255,180,0.45)" strokeWidth="5" strokeLinecap="round" strokeLinejoin="round" className="ca-trace-2" />
              <path d="M44,74 L44,60" fill="none" stroke="rgba(0,255,180,0.50)" strokeWidth="5" strokeLinecap="round" className="ca-trace-3" />
              <circle cx="14" cy="70" r="5" className="ca-node-1" stroke="rgba(0,255,180,0.6)" strokeWidth="2" />
              <circle cx="74" cy="70" r="5" className="ca-node-2" stroke="rgba(0,255,180,0.6)" strokeWidth="2" />
              <circle cx="44" cy="74" r="5" className="ca-node-3" stroke="rgba(0,255,180,0.6)" strokeWidth="2" />
              <circle cx="30" cy="50" r="4" className="ca-node-2" stroke="rgba(0,255,180,0.5)" strokeWidth="2" />
              <circle cx="58" cy="54" r="4" className="ca-node-1" stroke="rgba(0,255,180,0.5)" strokeWidth="2" />
              <g className="ca-arrow">
                <rect x="38" y="36" width="12" height="28" rx="2" fill="url(#ca-arrow-grad)" />
                <polygon points="44,6 64,36 24,36" fill="url(#ca-head-grad)" />
              </g>
              <defs>
                <linearGradient id="ca-arrow-grad" x1="0%" y1="0%" x2="0%" y2="100%">
                  <stop offset="0%" stopColor="#00ffb4" stopOpacity="0.9" />
                  <stop offset="100%" stopColor="#00cc8f" stopOpacity="0.5" />
                </linearGradient>
                <linearGradient id="ca-head-grad" x1="0%" y1="0%" x2="0%" y2="100%">
                  <stop offset="0%" stopColor="#00ffb4" stopOpacity="1" />
                  <stop offset="100%" stopColor="#00dd99" stopOpacity="0.8" />
                </linearGradient>
              </defs>
            </svg>
          </div>
          <span style={{
            fontFamily: "Inter, ui-sans-serif, system-ui, sans-serif",
            fontSize: "13.2px",
            fontWeight: 900,
            letterSpacing: "0.12em",
            textTransform: "uppercase",
            background: "linear-gradient(90deg, rgba(255,255,255,0.92), rgba(255,255,255,0.5))",
            WebkitBackgroundClip: "text",
            WebkitTextFillColor: "transparent",
          }}>Pump Scanner</span>
        </div>
        <div className={`flex items-center gap-1.5 px-2.5 py-1 rounded-lg text-[10px] font-bold uppercase tracking-widest ${
          active
            ? "bg-emerald-500/10 text-emerald-400"
            : "bg-red-500/10 text-red-400"
        }`}>
          <span className={`h-1.5 w-1.5 rounded-full ${active ? "bg-emerald-400 animate-pulse" : "bg-red-400"}`} />
          {active ? "Live" : "Offline"}
        </div>
      </div>

      {/* ── BOT NOT ACTIVE ── */}
      {!active && (
        <div className="w-full text-center rounded-xl border border-red-500/30 bg-red-500/10 py-2.5">
          <span className="text-xs font-black tracking-widest uppercase text-red-400">
            BOT IS NOT ACTIVE
          </span>
        </div>
      )}

      {/* ── SIGNAL LIST ── */}
      {data && data.signals.length > 0 ? (
        <div className="pump-scroll flex flex-col gap-2 overflow-y-auto pr-2" style={{ maxHeight: "19rem" }}>
          {data.signals
            // Drop rows that are missing the minimum required fields (e.g. a heartbeat
            // payload accidentally stored by the server).
            .filter((sig) =>
              sig &&
              typeof sig.symbol === "string" && sig.symbol.length > 0 &&
              typeof sig.timestamp === "string" && sig.timestamp.length > 0
            )
            .map((sig) => {
            const k = `${sig.symbol}-${sig.timestamp}`;
            const { date, time } = toUAE(sig.timestamp);
            const isLatest = latestKey === k;
            const isNew = newKeys.has(k) && !isLatest;

            // Coerce score to a finite number; treat missing/null/NaN as null so
            // the badge shows "—" rather than silently hiding a valid 0.
            const rawScore = sig.score;
            const sc: number | null =
              rawScore != null && isFinite(Number(rawScore))
                ? Number(rawScore)
                : null;

            const tier = getSignalTier(sc);

            return (
              <div
                key={k}
                className={`relative flex items-center justify-between rounded-xl border px-3 py-2.5 shrink-0 overflow-hidden ${
                  isLatest
                    ? "pump-latest pump-latest-shimmer border-primary/50 bg-gradient-to-r from-primary/10 to-primary/5"
                    : isNew
                    ? "pump-new border-emerald-500/40 bg-emerald-500/[0.08]"
                    : "border-border bg-muted/20"
                }`}
              >
                {isLatest && (
                  <div className="absolute inset-x-0 top-0 h-px bg-gradient-to-r from-transparent via-primary/70 to-transparent" />
                )}
                <div className="flex items-center gap-2.5">
                  <div className="relative shrink-0">
                    <CoinIcon symbol={sig.symbol.replace("USDT", "")} size={32} />
                    {(isLatest || isNew) && (
                      <span className={`absolute -inset-0.5 rounded-full ring-2 animate-ping opacity-40 ${isLatest ? "ring-primary" : "ring-emerald-400"}`} />
                    )}
                  </div>
                  <div>
                    <div className="flex items-center gap-1.5">
                      <span className={`font-black text-sm tracking-wide ${isLatest ? "text-primary" : "text-foreground"}`}>
                        {sig.symbol.replace("USDT", "")}
                      </span>
                      <span className="text-muted-foreground font-normal text-xs">/USDT</span>
                      {isLatest && (
                        <span className="text-[8px] font-black uppercase tracking-widest px-1.5 py-0.5 rounded-md bg-primary/20 text-primary border border-primary/30">
                          NEW
                        </span>
                      )}
                      {tier && (
                        <div
                          className="px-1.5 rounded-md inline-flex items-center"
                          style={{
                            paddingTop: "2px",
                            paddingBottom: "2px",
                            background: `color-mix(in oklab, ${tier.color} 15%, transparent)`,
                            border: `1px solid color-mix(in oklab, ${tier.color} 40%, transparent)`,
                            lineHeight: 1,
                          }}
                        >
                          <span
                            className="text-[8px] font-black uppercase tracking-widest"
                            style={{
                              color: tier.color,
                              lineHeight: 1,
                              textShadow: `0 0 6px color-mix(in oklab, ${tier.color} 70%, transparent)`,
                            }}
                          >
                            {tier.label}
                          </span>
                        </div>
                      )}
                    </div>
                    <div className="text-[10px] text-muted-foreground tabular-nums mt-0.5">
                      {date} · {time}
                    </div>
                  </div>
                </div>
                <div className="flex flex-col items-end gap-1.5">
                  {/* Score badge */}
                  <div
                    className="flex items-center gap-1 px-2 py-0.5 rounded-lg"
                    style={{
                      background: sc !== null && sc >= 90
                        ? "linear-gradient(135deg,rgba(249,115,22,0.25),rgba(239,68,68,0.15))"
                        : sc !== null && sc >= 85
                        ? "linear-gradient(135deg,rgba(234,179,8,0.22),rgba(249,115,22,0.12))"
                        : "linear-gradient(135deg,rgba(20,184,166,0.20),rgba(16,185,129,0.10))",
                      border: sc !== null && sc >= 90
                        ? "1px solid rgba(249,115,22,0.45)"
                        : sc !== null && sc >= 85
                        ? "1px solid rgba(234,179,8,0.40)"
                        : "1px solid rgba(20,184,166,0.35)",
                    }}
                  >
                    <span
                      className="text-[10px] font-black tabular-nums leading-none"
                      style={{
                        color: sc !== null && sc >= 90 ? "#f97316"
                          : sc !== null && sc >= 85 ? "#eab308"
                          : "#14b8a6",
                        textShadow: sc !== null && sc >= 90
                          ? "0 0 8px rgba(249,115,22,0.7)"
                          : sc !== null && sc >= 85
                          ? "0 0 8px rgba(234,179,8,0.6)"
                          : "0 0 8px rgba(20,184,166,0.6)",
                      }}
                    >
                      {sc !== null ? sc.toFixed(1) : "—"}
                    </span>
                    <span className="text-[8px] font-bold uppercase tracking-widest" style={{ color: "rgba(255,255,255,0.35)" }}>/100</span>
                  </div>
                  {/* Price */}
                  <div className="text-right">
                    <div className={`font-black text-xs tabular-nums ${isLatest ? "text-primary" : "text-emerald-400"}`}>
                      ${formatPrice(sig.price)}
                    </div>
                    <div className="text-[9px] uppercase tracking-widest text-muted-foreground/60 mt-0.5">
                      price
                    </div>
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      ) : null}

      {/* ── SIGNAL COUNT FOOTER ── */}
      {data && data.signals.length > 0 && (
        <div className="text-[9px] uppercase tracking-widest text-muted-foreground/50 text-center">
          {data.signals.length} signal{data.signals.length !== 1 ? "s" : ""} · latest first
        </div>
      )}

      {/* ── RADAR SWEEP FOOTER ── */}
      <div className="flex items-center gap-3 px-2 pt-1 pb-0.5" style={{ borderTop: "1px solid rgba(0,255,180,0.07)" }}>
        {/* Radar orb */}
        <div style={{ position: "relative", width: 44, height: 44, flexShrink: 0 }}>
          <svg width="44" height="44" viewBox="0 0 44 44" style={{ position: "absolute", inset: 0 }}>
            <circle cx="22" cy="22" r="19" fill="none" stroke="rgba(0,255,180,0.15)" strokeWidth="0.8" strokeDasharray="2 6" className="rs-ring" />
            <circle cx="22" cy="22" r="13" fill="none" stroke="rgba(0,255,180,0.10)" strokeWidth="0.7" className="rs-ring" style={{ animationDelay: "0.5s" }} />
            <circle cx="22" cy="22" r="7"  fill="none" stroke="rgba(0,255,180,0.08)" strokeWidth="0.6" className="rs-ring" style={{ animationDelay: "1s" }} />
            {/* crosshair ticks */}
            <line x1="22" y1="2"  x2="22" y2="7"  stroke="rgba(0,255,180,0.2)" strokeWidth="0.6" />
            <line x1="22" y1="37" x2="22" y2="42" stroke="rgba(0,255,180,0.2)" strokeWidth="0.6" />
            <line x1="2"  y1="22" x2="7"  y2="22" stroke="rgba(0,255,180,0.2)" strokeWidth="0.6" />
            <line x1="37" y1="22" x2="42" y2="22" stroke="rgba(0,255,180,0.2)" strokeWidth="0.6" />
          </svg>
          {/* rotating beam layer */}
          <svg width="44" height="44" viewBox="0 0 44 44" style={{ position: "absolute", inset: 0 }}>
            <defs>
              <radialGradient id="rs-beam-grad" cx="0%" cy="50%" r="100%">
                <stop offset="0%"   stopColor="#00ffb4" stopOpacity="0.85" />
                <stop offset="100%" stopColor="#00ffb4" stopOpacity="0" />
              </radialGradient>
            </defs>
            <g className="rs-spin">
              <path d="M22,22 L41,22 A19,19,0,0,0,22,3 Z" fill="url(#rs-beam-grad)" opacity="0.35" />
              <line x1="22" y1="22" x2="41" y2="22" stroke="#00ffb4" strokeWidth="1.2" strokeLinecap="round" opacity="0.85" />
            </g>
          </svg>
          {/* blips */}
          <svg width="44" height="44" viewBox="0 0 44 44" style={{ position: "absolute", inset: 0 }}>
            <circle cx="31" cy="14" r="1.5" fill="#00ffb4" className="rs-blip-1" style={{ filter: "drop-shadow(0 0 3px rgba(0,255,180,0.9))" }} />
            <circle cx="16" cy="29" r="1.2" fill="#00ffb4" className="rs-blip-2" style={{ filter: "drop-shadow(0 0 3px rgba(0,255,180,0.9))" }} />
            <circle cx="28" cy="30" r="1.0" fill="#00ffb4" className="rs-blip-3" style={{ filter: "drop-shadow(0 0 3px rgba(0,255,180,0.9))" }} />
            {/* center dot */}
            <circle cx="22" cy="22" r="2" fill="none" stroke="rgba(0,255,180,0.7)" strokeWidth="1" />
            <circle cx="22" cy="22" r="0.8" fill="#00ffb4" />
          </svg>
        </div>

        {/* Scrolling pair labels */}
        <div style={{ flex: 1, overflow: "hidden" }}>
          <div style={{ display: "flex", gap: 8, alignItems: "center", flexWrap: "wrap" }}>
            {["BTC","ETH","SOL","BNB","ARB","WIF","PEPE","DOGE","OP","INJ"].map((sym, i) => (
              <span
                key={sym}
                className="rs-sym"
                style={{
                  "--d": `${i * 0.18}s`,
                  fontSize: 8,
                  fontFamily: "monospace",
                  fontWeight: 700,
                  letterSpacing: "0.1em",
                  color: "rgba(0,255,180,0.45)",
                } as React.CSSProperties}
              >
                {sym}
              </span>
            ))}
          </div>
          <div style={{ fontSize: 8, letterSpacing: "0.18em", textTransform: "uppercase", color: "rgba(255,255,255,0.18)", fontFamily: "monospace", marginTop: 3 }}>
            scanning all USDT pairs
          </div>
        </div>
      </div>

    </section>
  );
}
