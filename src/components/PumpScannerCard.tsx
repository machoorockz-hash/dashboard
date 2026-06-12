import { useEffect, useRef, useState } from "react";

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
        json.signals.forEach((s) => {
          const k = `${s.symbol}-${s.timestamp}`;
          if (!seenRef.current.has(k)) {
            incoming.add(k);
            seenRef.current.add(k);
          }
        });

        if (incoming.size > 0) {
          setNewKeys(incoming);
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
          from { opacity: 0; transform: translateX(18px); }
          to   { opacity: 1; transform: translateX(0); }
        }
        .pump-new { animation: pump-slide-in 0.45s cubic-bezier(0.22,1,0.36,1) both; }
      `}</style>

      {/* ── HEADER ── */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <span className="text-base">🚀</span>
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
        <div className="flex flex-col gap-2 max-h-80 overflow-y-auto pr-0.5">
          {data.signals.map((sig) => {
            const k = `${sig.symbol}-${sig.timestamp}`;
            const { date, time } = toUAE(sig.timestamp);
            const isNew = newKeys.has(k);
            return (
              <div
                key={k}
                className={`flex items-center justify-between rounded-xl border px-3 py-2.5 ${
                  isNew
                    ? "pump-new border-emerald-500/40 bg-emerald-500/8"
                    : "border-border bg-muted/20"
                }`}
              >
                <div className="flex items-center gap-2.5">
                  <div className={`h-2 w-2 rounded-full shrink-0 ${isNew ? "bg-emerald-400 animate-pulse" : "bg-muted-foreground/30"}`} />
                  <div>
                    <div className="font-black text-sm tracking-wide text-foreground">
                      {sig.symbol.replace("USDT", "")}<span className="text-muted-foreground font-normal text-xs">/USDT</span>
                    </div>
                    <div className="text-[10px] text-muted-foreground tabular-nums mt-0.5">
                      {date} · {time}
                    </div>
                  </div>
                </div>
                <div className="text-right">
                  <div className="font-black text-xs tabular-nums text-emerald-400">
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
          <span className="text-2xl">🔍</span>
          <span className="text-xs text-muted-foreground text-center">
            Scanning markets…<br />No pumps detected yet
          </span>
        </div>
      ) : null}

      {/* ── SIGNAL COUNT FOOTER ── */}
      {data && data.signals.length > 0 && (
        <div className="text-[9px] uppercase tracking-widest text-muted-foreground/50 text-center">
          {data.signals.length} signal{data.signals.length !== 1 ? "s" : ""} · last 24h
        </div>
      )}
    </section>
  );
}
