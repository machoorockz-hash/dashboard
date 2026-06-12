import { useEffect, useRef, useState } from "react";
import { TrendingUp } from "lucide-react";

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
    <section className="rounded-2xl border border-border bg-card p-4 shadow-sm flex flex-col gap-3">
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
          50%      { box-shadow: 0 0 18px 4px color-mix(in oklab, var(--primary) 28%, transparent); }
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
        .pump-icon-wrap {
          animation: pump-icon-glow 2.5s ease-in-out infinite;
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
      `}</style>

      {/* ── HEADER ── */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2.5">
          <div className="relative flex items-center justify-center h-8 w-8 rounded-xl border border-primary/30 bg-gradient-to-br from-primary/25 via-primary/10 to-transparent">
            <div className="absolute inset-0 rounded-xl bg-[radial-gradient(circle_at_top_left,color-mix(in_oklab,var(--primary)_30%,transparent),transparent_70%)]" />
            <TrendingUp className="relative h-4 w-4 text-primary drop-shadow-[0_0_4px_color-mix(in_oklab,var(--primary)_80%,transparent)]" strokeWidth={2.5} />
          </div>
          <span className="font-black text-sm tracking-wide uppercase">Pump Scanner</span>
        </div>
        <div className={`flex items-center gap-1.5 px-2.5 py-1 rounded-lg border text-[10px] font-bold uppercase tracking-widest ${
          active
            ? "bg-emerald-500/10 text-emerald-400 border-emerald-500/30"
            : "bg-red-500/10 text-red-400 border-red-500/30"
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
                  <div className={`h-2 w-2 rounded-full shrink-0 ${
                    isLatest ? "bg-primary animate-pulse" : isNew ? "bg-emerald-400 animate-pulse" : "bg-muted-foreground/30"
                  }`} />
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
        <div className="flex flex-col items-center justify-center py-6 gap-2">
          <div className="flex items-center justify-center h-10 w-10 rounded-xl bg-gradient-to-br from-primary/20 to-primary/5 border border-primary/20">
            <TrendingUp className="h-5 w-5 text-primary/60" />
          </div>
          <span className="text-xs text-muted-foreground text-center">
            Scanning markets…<br />No pumps detected yet
          </span>
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
