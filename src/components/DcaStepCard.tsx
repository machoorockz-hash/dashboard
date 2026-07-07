import { useEffect, useState } from "react";
import { CoinIcon } from "./CoinIcon";
import { Layers, TrendingUp, TrendingDown, Target, Shield, DollarSign } from "lucide-react";

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

function StepSegments({ step, total }: { step: number; total: number }) {
  return (
    <div className="flex items-center gap-1.5">
      {Array.from({ length: total }).map((_, i) => {
        const filled = i < step;
        const isLast = i === step - 1;
        return (
          <div
            key={i}
            className={`relative h-2 rounded-full transition-all duration-700 flex-1 ${
              filled
                ? isLast
                  ? "bg-primary shadow-[0_0_8px_2px_color-mix(in_oklab,var(--primary)_60%,transparent)]"
                  : "bg-primary/70"
                : "bg-muted/50"
            }`}
          >
            {isLast && (
              <span className="absolute inset-0 rounded-full bg-primary/40 animate-ping opacity-75" />
            )}
          </div>
        );
      })}
    </div>
  );
}

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
  const step = d?.dca_step ?? 0;
  const total = d?.dca_total_steps ?? 6;
  const symbol = d?.dca_symbol ?? "";
  const base = symbol.replace(/USDT$|BUSD$|FDUSD$/, "");
  const pnl = d?.dca_pnl_pct ?? 0;
  const isCompleted = d?.status === "COMPLETED";

  if (!snapshot?.updatedAt || isCompleted || step === 0) return null;

  return (
    <section className="rounded-2xl border border-primary/30 bg-card relative overflow-hidden flex flex-col gap-0 shadow-[0_0_40px_-15px_color-mix(in_oklab,var(--primary)_35%,transparent)]">
      <style>{`
        @keyframes dca-shimmer {
          0%   { transform: translateX(-100%) skewX(-15deg); }
          100% { transform: translateX(400%) skewX(-15deg); }
        }
        @keyframes dca-glow-pulse {
          0%, 100% { opacity: 0.4; }
          50%       { opacity: 0.9; }
        }
        .dca-top-bar { animation: dca-glow-pulse 2s ease-in-out infinite; }
      `}</style>

      <div className="pointer-events-none absolute inset-x-0 top-0 h-[2px] dca-top-bar bg-gradient-to-r from-transparent via-primary to-transparent" />
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

        {/* Step number + PnL row */}
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

        {/* Step bar */}
        <div className="flex flex-col gap-1.5">
          <div className="flex items-center justify-between text-[9px] uppercase tracking-widest font-bold text-muted-foreground/60">
            <span>Step 1</span>
            <span>Step {total}</span>
          </div>
          <StepSegments step={step} total={total} />
          <div className="text-[9px] text-muted-foreground/60 tabular-nums">
            {step} of {total} DCA steps executed
          </div>
        </div>

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
  const labelCls = bull ? "text-bull/60" : bear ? "text-bear/60" : accent ? "text-primary/60" : "text-muted-foreground";
  return (
    <div className={`rounded-xl border px-3 py-2.5 ${colorCls}`}>
      <div className={`flex items-center gap-1 text-[9px] uppercase tracking-widest font-bold mb-1 ${labelCls}`}>
        {icon}{label}
      </div>
      <div className="font-black text-xs tabular-nums truncate">{value}</div>
    </div>
  );
}
