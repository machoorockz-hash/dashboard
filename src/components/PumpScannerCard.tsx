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
}

interface PumpData {
  active: boolean;
  lastHeartbeat: string | null;
  signals: PumpSignal[];
}

function toUAE(iso: string) {
  const d = new Date(iso);
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
  if (p >= 1) return p.toFixed(4);
  if (p >= 0.001) return p.toFixed(6);
  return p.toFixed(8);
}

function FlareBeamAnimation() {
  return (
    <div className="flex flex-col items-center gap-3">
      <div style={{ position: "relative", width: 81, height: 81 }}>
        {/* outer rings */}
        <svg width="81" height="81" viewBox="0 0 88 88" style={{ position: "absolute", inset: 0 }}>
          <circle
            className="fb-ring"
            cx="44" cy="44" r="40"
            fill="none"
            stroke="color-mix(in oklab, var(--primary) 30%, transparent)"
            strokeWidth="1"
            strokeDasharray="3 9"
          />
          <circle
            className="fb-ring"
            cx="44" cy="44" r="32"
            fill="none"
            stroke="color-mix(in oklab, var(--primary) 15%, transparent)"
            strokeWidth="0.8"
          />
        </svg>

        {/* rotating beam */}
        <svg width="81" height="81" viewBox="0 0 88 88" style={{ position: "absolute", inset: 0 }}>
          <defs>
            <linearGradient id="fb-beam-cg" x1="0%" y1="0%" x2="100%" y2="0%">
              <stop offset="0%" stopColor="color-mix(in oklab, var(--primary) 95%, white)" stopOpacity="0.7" />
              <stop offset="40%" stopColor="color-mix(in oklab, var(--primary) 80%, transparent)" stopOpacity="0.3" />
              <stop offset="100%" stopColor="color-mix(in oklab, var(--primary) 60%, transparent)" stopOpacity="0" />
            </linearGradient>
            <linearGradient id="fb-beam2-cg" x1="0%" y1="0%" x2="100%" y2="0%">
              <stop offset="0%" stopColor="color-mix(in oklab, var(--primary) 70%, white)" stopOpacity="0.2" />
              <stop offset="100%" stopColor="color-mix(in oklab, var(--primary) 50%, transparent)" stopOpacity="0" />
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
          background: "radial-gradient(circle, white 0%, color-mix(in oklab, var(--primary) 90%, white) 40%, color-mix(in oklab, var(--primary) 80%, transparent) 100%)",
        }} />

        {/* crosshairs */}
        <svg width="81" height="81" viewBox="0 0 88 88" style={{ position: "absolute", inset: 0, opacity: 0.2 }}>
          <line x1="44" y1="2"  x2="44" y2="20" stroke="color-mix(in oklab, var(--primary) 80%, transparent)" strokeWidth="1" />
          <line x1="44" y1="68" x2="44" y2="86" stroke="color-mix(in oklab, var(--primary) 80%, transparent)" strokeWidth="1" />
          <line x1="2"  y1="44" x2="20" y2="44" stroke="color-mix(in oklab, var(--primary) 80%, transparent)" strokeWidth="1" />
          <line x1="68" y1="44" x2="86" y2="44" stroke="color-mix(in oklab, var(--primary) 80%, transparent)" strokeWidth="1" />
        </svg>
      </div>

      <div className="text-center">
        <div className="fb-blink text-[10px] font-black tracking-[0.22em] uppercase text-primary">
          Scanning Markets
        </div>
        <div className="text-[9px] tracking-[0.15em] uppercase text-muted-foreground/45 mt-1">
          monitoring all USDT pairs
        </div>
      </div>
    </div>
  );
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
          0%,100% { box-shadow: 0 0 4px 2px color-mix(in oklab,var(--primary) 25%,transparent), 0 0 8px 3px color-mix(in oklab,var(--primary) 10%,transparent); }
          50%     { box-shadow: 0 0 6px 3px color-mix(in oklab,var(--primary) 35%,transparent), 0 0 14px 5px color-mix(in oklab,var(--primary) 15%,transparent); }
        }
        @keyframes fb-ring  { 0%,100%{opacity:.2} 50%{opacity:.5} }
        @keyframes fb-blink { 0%,100%{opacity:1}  50%{opacity:.3} }
        .fb-spin  { animation: fb-rotate 4s linear infinite; transform-origin: 44px 44px; }
        .fb-orb   { animation: fb-orb   2s ease-in-out infinite; }
        .fb-ring  { animation: fb-ring  2s ease-in-out infinite; }
        .fb-blink { animation: fb-blink 2s ease-in-out infinite; }
      `}</style>

      {/* ── HEADER ── */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2.5">
          <div style={{ width: 40, height: 40, borderRadius: 12, overflow: "hidden", flexShrink: 0, position: "relative" }}>
            <div style={{ position: "absolute", top: 0, left: "50%", transform: "translateX(-50%) scale(0.494)", transformOrigin: "top center" }}>
              <FlareBeamAnimation />
            </div>
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
          {data.signals.map((sig) => {
            const k = `${sig.symbol}-${sig.timestamp}`;
            const { date, time } = toUAE(sig.timestamp);
            const isLatest = latestKey === k;
            const isNew = newKeys.has(k) && !isLatest;

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
                    </div>
                    <div className="text-[10px] text-muted-foreground tabular-nums mt-0.5">
                      {date} · {time}
                    </div>
                  </div>
                </div>
                <div className="text-right">
                  <div className={`font-black text-xs tabular-nums ${isLatest ? "text-primary" : "text-emerald-400"}`}>
                    ${formatPrice(sig.price)}
                  </div>
                  <div className="text-[9px] uppercase tracking-widest text-muted-foreground/60 mt-0.5">
                    price
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      ) : active ? (
        /* ── EMPTY STATE: Flare Beam animation when active but no signals yet ── */
        <div className="flex items-center justify-center py-4">
          <FlareBeamAnimation />
        </div>
      ) : null}

      {/* ── SIGNAL COUNT FOOTER ── */}
      {data && data.signals.length > 0 && (
        <div className="text-[9px] uppercase tracking-widest text-muted-foreground/50 text-center">
          {data.signals.length} signal{data.signals.length !== 1 ? "s" : ""} · latest first
        </div>
      )}
    </section>
  );
}
