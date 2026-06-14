import { useQuery } from "@tanstack/react-query";
import { useEffect, useMemo, useRef, useState } from "react";
import { Wallet as WalletIcon, TrendingUp, Target, Shield, Activity, Layers } from "lucide-react";
import { AppLayout } from "../components/AppLayout";
import { CoinIcon } from "../components/CoinIcon";
import { PriceChart } from "../components/PriceChart";
import { BtcCrashCard } from "../components/BtcCrashCard";
import PumpScannerCard from "../components/PumpScannerCard";
import { getAccount, getOpenOrders, getAllPrices, getMyTrades } from "../lib/binance";

const API_BASE = import.meta.env.VITE_API_BASE ?? "";

function fmt(n: number, max = 2, min = max) {
  return n.toLocaleString(undefined, { maximumFractionDigits: max, minimumFractionDigits: min });
}
function fmtPrice(p: number) {
  if (!isFinite(p)) return "…";
  if (p >= 1000) return fmt(p, 2);
  if (p >= 1) return fmt(p, 4);
  if (p >= 0.01) return fmt(p, 5);
  return fmt(p, 6);
}

function StepSegments({ step, total }: { step: number; total: number }) {
  return (
    <>
      <style>{`
        @keyframes dca-glow-breathe {
          0%, 100% {
            box-shadow:
              0 0 6px 1px color-mix(in oklab,var(--primary) 45%,transparent),
              0 0 18px 4px color-mix(in oklab,var(--primary) 22%,transparent),
              0 0 40px 8px color-mix(in oklab,var(--primary) 10%,transparent);
          }
          50% {
            box-shadow:
              0 0 12px 3px color-mix(in oklab,var(--primary) 75%,transparent),
              0 0 28px 8px color-mix(in oklab,var(--primary) 38%,transparent),
              0 0 55px 14px color-mix(in oklab,var(--primary) 18%,transparent);
          }
        }
        @keyframes dca-shimmer-sweep {
          0%   { transform: translateX(-180%) skewX(-15deg); opacity: 0; }
          15%  { opacity: 1; }
          85%  { opacity: 1; }
          100% { transform: translateX(280%) skewX(-15deg); opacity: 0; }
        }
        .dca-glow-breathe  { animation: dca-glow-breathe  2.2s ease-in-out infinite; }
        .dca-shimmer-sweep { animation: dca-shimmer-sweep 2.4s ease-in-out infinite; }
      `}</style>

      <div style={{ display: "flex", gap: "6px", alignItems: "center" }}>
        {Array.from({ length: total }).map((_, i) => {
          const filled   = i < step;
          const isActive = i === step - 1;
          const isPast   = filled && !isActive;

          return (
            <div key={i} style={{ flex: 1, display: "flex", flexDirection: "column", alignItems: "center", gap: "7px" }}>
              <div style={{ position: "relative", width: "100%", height: "7px" }}>
                <div
                  className={isActive ? "dca-glow-breathe" : ""}
                  style={{
                    position: "absolute",
                    inset: 0,
                    borderRadius: "999px",
                    background: isActive
                      ? "linear-gradient(90deg, color-mix(in oklab,var(--primary) 85%,white), var(--primary))"
                      : isPast
                      ? "linear-gradient(90deg, color-mix(in oklab,var(--primary) 55%,transparent), color-mix(in oklab,var(--primary) 68%,transparent))"
                      : "color-mix(in oklab,var(--primary) 9%,var(--card))",
                    transition: "background 0.5s ease",
                  }}
                />
                {isActive && (
                  <div style={{ position: "absolute", inset: 0, borderRadius: "999px", overflow: "hidden" }}>
                    <div
                      className="dca-shimmer-sweep"
                      style={{
                        position: "absolute",
                        top: 0, bottom: 0,
                        width: "40%",
                        background: "linear-gradient(90deg, transparent, rgba(255,255,255,0.50), transparent)",
                        borderRadius: "999px",
                      }}
                    />
                  </div>
                )}
              </div>
              <span style={{
                fontSize: "9px",
                fontWeight: 700,
                lineHeight: 1,
                transition: "color 0.4s",
                color: isActive
                  ? "var(--primary)"
                  : isPast
                  ? "color-mix(in oklab,var(--primary) 45%,var(--muted-foreground))"
                  : "color-mix(in oklab,var(--muted-foreground) 35%,transparent)",
                ...(isActive ? { filter: "drop-shadow(0 0 4px color-mix(in oklab,var(--primary) 70%,transparent))" } : {}),
              }}>
                {i + 1}
              </span>
            </div>
          );
        })}
      </div>
    </>
  );
}

interface DcaData {
  dca_step?: number;
  dca_total_steps?: number;
  status?: string;
}

function useDcaData() {
  const [data, setData] = useState<DcaData | null>(null);
  useEffect(() => {
    let alive = true;
    let timer: ReturnType<typeof setTimeout>;
    async function poll() {
      try {
        const r = await fetch(`${API_BASE}/api/bot/data?key=dca`);
        if (r.ok) {
          const json = await r.json();
          if (alive && json?.data) setData(json.data as DcaData);
        }
      } catch {}
      timer = setTimeout(poll, 3000);
    }
    poll();
    return () => { alive = false; clearTimeout(timer); };
  }, []);
  return data;
}

export default function Dashboard() {
  const account = useQuery({ queryKey: ["account"], queryFn: () => getAccount(), refetchInterval: 15_000 });
  const orders = useQuery({ queryKey: ["openOrders"], queryFn: () => getOpenOrders(), refetchInterval: 8_000 });
  const prices = useQuery({ queryKey: ["prices"], queryFn: () => getAllPrices(), refetchInterval: 5_000 });
  const dcaData = useDcaData();

  const allOrders = orders.data ?? [];
  const primary = allOrders[0];
  const sameSymbol = allOrders.filter((o) => o.symbol === primary?.symbol);
  const tpOrder = sameSymbol.find((o) => parseFloat(o.stopPrice || "0") === 0) ?? primary;
  const slOrder = sameSymbol.find((o) => parseFloat(o.stopPrice || "0") > 0);
  const orderSymbol = primary?.symbol;
  const orderBase = orderSymbol?.replace(/USDT$|BUSD$|FDUSD$|BTC$|ETH$/, "") || "";

  const trades = useQuery({
    queryKey: ["trades", orderSymbol],
    queryFn: () => getMyTrades({ data: { symbol: orderSymbol!, limit: 200 } }),
    enabled: !!orderSymbol,
    refetchInterval: 60_000,
  });

  const avgEntry = useMemo(() => {
    if (!trades.data || trades.data.length === 0) return 0;
    let cost = 0, qty = 0;
    for (const t of trades.data) {
      const p = parseFloat(t.price), q = parseFloat(t.qty);
      if (t.isBuyer) { cost += p * q; qty += q; }
      else if (qty > 0) {
        const ratio = Math.min(q, qty) / qty;
        cost = cost * (1 - ratio);
        qty -= Math.min(q, qty);
      }
    }
    return qty > 0 ? cost / qty : 0;
  }, [trades.data]);

  const [livePrice, setLivePrice] = useState<number | undefined>();
  const [flash, setFlash] = useState<"up" | "down" | null>(null);
  useEffect(() => {
    setLivePrice(undefined);
    if (!orderSymbol) return;
    const ws = new WebSocket(`wss://data-stream.binance.vision/ws/${orderSymbol.toLowerCase()}@trade`);
    ws.onmessage = (e) => {
      try {
        const d = JSON.parse(e.data);
        const p = parseFloat(d.p);
        setLivePrice((prev) => { if (prev !== undefined && p !== prev) setFlash(p > prev ? "up" : "down"); return p; });
      } catch {}
    };
    return () => ws.close();
  }, [orderSymbol]);
  useEffect(() => {
    if (!flash) return;
    const t = setTimeout(() => setFlash(null), 500);
    return () => clearTimeout(t);
  }, [flash]);

  const [chartSymbol, setChartSymbol] = useState<string>("BTCUSDT");
  useEffect(() => {
    if (orderSymbol) setChartSymbol(orderSymbol);
    else setChartSymbol("BTCUSDT");
  }, [orderSymbol]);

  const allAssets = useMemo(() => {
    if (!account.data || !prices.data) return [];
    return account.data.balances.map((b) => {
      const total = b.free + b.locked;
      const usd = b.asset === "USDT" ? total : total * (prices.data?.[`${b.asset}USDT`] ?? 0);
      return { ...b, total, usd };
    });
  }, [account.data, prices.data]);

  const walletAssets = useMemo(
    () => allAssets.filter((b) => b.usd >= 2).sort((a, b) => b.usd - a.usd),
    [allAssets],
  );

  const totalUsdt = allAssets.reduce((s, a) => s + a.usd, 0);

  const tpPrice = tpOrder ? parseFloat(tpOrder.price) : 0;
  const slPrice = slOrder ? (parseFloat(slOrder.stopPrice) || parseFloat(slOrder.price)) : 0;
  const orderQty = primary ? parseFloat(primary.origQty) : 0;
  const entry = avgEntry > 0 ? avgEntry : (primary ? parseFloat(primary.price) : 0);
  const side = primary?.side ?? "";
  const dirMult = side === "SELL" ? 1 : 1;
  const cur = livePrice ?? (orderSymbol ? prices.data?.[orderSymbol] : undefined);

  const pnlPct = cur && entry ? ((cur - entry) / entry) * 100 * dirMult : 0;
  const pnlUsd = cur && entry ? (cur - entry) * orderQty * dirMult : 0;
  const targetPct = tpPrice && entry ? ((tpPrice - entry) / entry) * 100 : 0;
  const stopPct = slPrice && entry ? ((slPrice - entry) / entry) * 100 : 0;
  const distToTpPct = cur && tpPrice ? ((tpPrice - cur) / cur) * 100 : 0;
  const distToSlPct = cur && slPrice ? ((cur - slPrice) / cur) * 100 : 0;
  // TP bar: fills as price moves toward tpPrice. Range = slPrice → tpPrice (or entry → tpPrice when no SL).
  const tpProgress = cur && tpPrice
    ? (slPrice && tpPrice !== slPrice
        ? Math.max(0, Math.min(1, (cur - slPrice) / (tpPrice - slPrice)))
        : entry && tpPrice !== entry
        ? Math.max(0, Math.min(1, (cur - entry) / (tpPrice - entry)))
        : 0)
    : 0;

  // SL bar: fills as price moves toward slPrice. Range = tpPrice → slPrice (or entry → slPrice when no TP).
  const slProgress = cur && slPrice
    ? (tpPrice && tpPrice !== slPrice
        ? Math.max(0, Math.min(1, (tpPrice - cur) / (tpPrice - slPrice)))
        : entry && entry !== slPrice
        ? Math.max(0, Math.min(1, (entry - cur) / (entry - slPrice)))
        : 0)
    : 0;

  const dcaStep = dcaData?.dca_step ?? 0;
  const dcaTotal = dcaData?.dca_total_steps ?? 6;
  const showDca = !!primary && dcaStep > 0 && dcaData?.status !== "COMPLETED";

  const chartLines = useMemo(() => {
    const out: Array<{ price: number; label: string; color: string }> = [];
    if (orderSymbol && chartSymbol === orderSymbol) {
      if (entry > 0) out.push({ price: entry, label: `Entry ${fmtPrice(entry)}`, color: "#a3b1c2" });
      if (tpPrice > 0) out.push({ price: tpPrice, label: `TP ${fmtPrice(tpPrice)}`, color: "#10b981" });
      if (slPrice > 0) out.push({ price: slPrice, label: `SL ${fmtPrice(slPrice)}`, color: "#ef4444" });
    }
    return out;
  }, [orderSymbol, chartSymbol, entry, tpPrice, slPrice]);

  return (
    <AppLayout>
      <div className="space-y-5">

        {/* ── WALLET ── */}
        <section className="glow-card rounded-2xl p-5 md:p-6 relative overflow-hidden border border-border bg-card">
          <div className="absolute inset-0 bg-[radial-gradient(circle_at_top_right,color-mix(in_oklab,var(--primary)_18%,transparent),transparent_60%)] pointer-events-none" />
          <div className="relative flex items-center gap-2 text-[11px] uppercase tracking-widest text-primary/80 font-bold">
            <span className="h-2 w-2 rounded-full bg-primary animate-pulse" />
            <WalletIcon className="h-3.5 w-3.5" />
            Wallet
          </div>
          <div className="relative mt-3">
            <style>{`
              @keyframes wallet-balance-shine {
                0%   { background-position: -200% center; }
                100% { background-position: 200% center; }
              }
              .wallet-balance-shine {
                background: linear-gradient(
                  105deg,
                  var(--foreground) 0%,
                  var(--foreground) 35%,
                  color-mix(in oklab, var(--primary) 60%, white) 50%,
                  var(--foreground) 65%,
                  var(--foreground) 100%
                );
                background-size: 200% auto;
                -webkit-background-clip: text;
                -webkit-text-fill-color: transparent;
                background-clip: text;
                animation: wallet-balance-shine 3.5s linear infinite;
              }
            `}</style>
            <span className="wallet-balance-shine text-4xl md:text-6xl font-black tracking-tight">
              ${account.isLoading ? "…" : fmt(totalUsdt)}
            </span>
          </div>
          {walletAssets.length > 0 && (
            <div className="relative mt-4 flex gap-2 overflow-x-auto pb-1 -mx-1 px-1">
              {walletAssets.slice(0, 10).map((b) => (
                <div key={b.asset} className="shrink-0 rounded-xl border border-border bg-card/60 px-3 py-2 flex items-center gap-2 min-w-[150px] hover:border-primary/40 transition-colors">
                  <CoinIcon symbol={b.asset} size={28} />
                  <div className="min-w-0">
                    <div className="text-xs font-bold truncate">{b.asset}</div>
                    <div className="text-[10px] text-muted-foreground tabular-nums">${fmt(b.usd)}</div>
                  </div>
                </div>
              ))}
            </div>
          )}
        </section>

        {/* ── ACTIVE TRADE ── */}
        <section className={`rounded-2xl border bg-card p-5 md:p-6 relative overflow-hidden transition-shadow ${primary ? "border-primary/30 shadow-[0_0_60px_-20px_rgba(94,234,212,0.55)]" : "border-border"}`}>
          {primary ? (
            <>
              <div className="pointer-events-none absolute inset-x-0 top-0 h-px bg-gradient-to-r from-transparent via-primary/70 to-transparent" />
              <div className="relative flex items-center justify-between gap-3 flex-wrap">
                <div className="flex items-center gap-3 min-w-0">
                  <div className="relative">
                    <CoinIcon symbol={orderBase} size={52} className="ring-2 ring-primary/40" />
                    <span className="absolute -inset-1 rounded-full ring-2 ring-primary/40 animate-ping opacity-30" />
                  </div>
                  <div className="min-w-0">
                    <div className="flex items-center gap-2 flex-wrap">
                      <h2 className="text-xl md:text-2xl font-black truncate">{primary.symbol}</h2>
                      <span className="text-[10px] font-bold px-2 py-0.5 rounded-md bg-primary/15 text-primary uppercase tracking-wider">{primary.type}</span>
                      <span className={`text-[10px] font-bold px-2 py-0.5 rounded-md uppercase tracking-wider ${primary.side === "SELL" ? "bg-bear/15 text-bear" : "bg-bull/15 text-bull"}`}>{primary.side}</span>
                    </div>
                    <div className="text-xs text-muted-foreground mt-1 flex items-center gap-1.5">
                      <span className="inline-block h-1.5 w-1.5 rounded-full bg-bull animate-pulse" />
                      Live · {fmt(orderQty, 4)} {orderBase}
                    </div>
                  </div>
                </div>
                <div className="text-right shrink-0">
                  <div className={`text-2xl md:text-4xl font-black tabular-nums ${pnlUsd >= 0 ? "text-bull" : "text-bear"}`}>
                    {pnlUsd >= 0 ? "+" : ""}${pnlUsd.toFixed(2)}
                  </div>
                  <div className={`text-xs font-bold ${pnlPct >= 0 ? "text-bull" : "text-bear"}`}>
                    {pnlPct >= 0 ? "▲" : "▼"} {Math.abs(pnlPct).toFixed(2)}%
                  </div>
                </div>
              </div>

              <div className={`relative mt-5 rounded-xl border bg-gradient-to-r from-primary/5 to-transparent px-4 py-3 flex items-center justify-between transition-all duration-300 ${flash === "up" ? "border-bull/60 bg-bull/10" : flash === "down" ? "border-bear/60 bg-bear/10" : "border-border"}`}>
                <span className="text-[10px] uppercase tracking-widest font-bold text-muted-foreground flex items-center gap-1.5">
                  <Activity className="h-3 w-3" /> Live price
                </span>
                <span className={`text-2xl md:text-3xl font-black tabular-nums transition-colors ${flash === "up" ? "text-bull" : flash === "down" ? "text-bear" : ""}`}>
                  ${cur ? fmtPrice(cur) : "…"}
                </span>
              </div>

              {/* ── DCA STEP ── */}
              {showDca && (
                <div
                  className="relative mt-4 rounded-xl overflow-hidden px-4 py-4"
                  style={{
                    background: "linear-gradient(135deg, color-mix(in oklab,var(--primary) 8%,var(--card)) 0%, color-mix(in oklab,var(--primary) 4%,var(--card)) 100%)",
                    border: "1px solid color-mix(in oklab,var(--primary) 28%,transparent)",
                    boxShadow: "inset 0 1px 0 color-mix(in oklab,var(--primary) 20%,transparent), 0 0 20px -8px color-mix(in oklab,var(--primary) 30%,transparent)",
                  }}
                >
                  <div
                    className="absolute inset-x-0 top-0 h-px pointer-events-none"
                    style={{ background: "linear-gradient(90deg, transparent, color-mix(in oklab,var(--primary) 60%,transparent), transparent)" }}
                  />
                  <div
                    className="absolute -top-4 -left-4 w-24 h-24 rounded-full pointer-events-none"
                    style={{ background: "radial-gradient(circle, color-mix(in oklab,var(--primary) 12%,transparent), transparent 70%)" }}
                  />

                  <div className="relative flex items-center justify-between mb-3">
                    <div className="flex items-center gap-1.5">
                      <Layers className="h-3.5 w-3.5" style={{ color: "var(--primary)" }} />
                      <span className="text-[10px] uppercase tracking-widest font-bold" style={{ color: "color-mix(in oklab,var(--primary) 80%,var(--muted-foreground))" }}>
                        DCA Step
                      </span>
                    </div>
                    <div className="flex items-baseline gap-1">
                      <span
                        className="text-2xl font-black tabular-nums leading-none"
                        style={{
                          color: "var(--primary)",
                          textShadow: "0 0 16px color-mix(in oklab,var(--primary) 70%,transparent)",
                          letterSpacing: "-0.02em",
                        }}
                      >
                        {dcaStep}
                      </span>
                      <span
                        className="text-base font-black leading-none"
                        style={{ color: "color-mix(in oklab,var(--muted-foreground) 50%,transparent)" }}
                      >
                        /{dcaTotal}
                      </span>
                    </div>
                  </div>

                  <StepSegments step={dcaStep} total={dcaTotal} />
                </div>
              )}

              <div className="relative mt-4 grid sm:grid-cols-2 gap-3">
                <ProgressTrack icon={<Target className="h-3.5 w-3.5" />} label="TAKE PROFIT"
                  fromLabel={`Entry $${fmtPrice(entry)}`} toLabel={tpPrice ? `TP $${fmtPrice(tpPrice)}` : "—"}
                  pct={tpProgress} rightValue={tpPrice ? `${targetPct >= 0 ? "+" : ""}${targetPct.toFixed(2)}%` : "—"}
                  hint={tpPrice && cur ? `${distToTpPct >= 0 ? "+" : ""}${distToTpPct.toFixed(2)}% to TP` : ""} color="bull" />
                <ProgressTrack icon={<Shield className="h-3.5 w-3.5" />} label="Stop loss"
                  fromLabel={`Entry $${fmtPrice(entry)}`} toLabel={slPrice ? `SL $${fmtPrice(slPrice)}` : "—"}
                  pct={slProgress} rightValue={slPrice ? `${stopPct.toFixed(2)}%` : "—"}
                  hint={slPrice && cur ? `${distToSlPct.toFixed(2)}% buffer` : ""} color="bear" />
              </div>

              <div className="relative mt-4 grid grid-cols-2 md:grid-cols-4 gap-2 text-xs">
                <Cell label="Entry (avg)" value={`$${fmtPrice(entry)}`} />
                <Cell label="Qty" value={`${fmt(orderQty, 4)} ${orderBase}`} />
                <Cell label="Take Profit" value={tpPrice ? `$${fmtPrice(tpPrice)}` : "—"} accent />
                <Cell label="Stop Loss" value={slPrice ? `$${fmtPrice(slPrice)}` : "—"} danger />
              </div>
            </>
          ) : (
            <div className="py-10 text-center">
              <TrendingUp className="h-10 w-10 mx-auto text-muted-foreground/40" />
              <h2 className="mt-3 text-xl font-black">No Active Trade</h2>
              <p className="text-sm text-muted-foreground mt-1">Place a limit or OCO order on Binance and it will appear here.</p>
            </div>
          )}
        </section>

        <BtcCrashCard />

        <PumpScannerCard />

        <PriceChart symbol={chartSymbol} interval="1m" height={500} searchable onSymbolChange={setChartSymbol} priceLines={chartLines} />
      </div>
    </AppLayout>
  );
}

function Cell({ label, value, accent, danger }: { label: string; value: string; accent?: boolean; danger?: boolean }) {
  return (
    <div className={`rounded-lg border px-3 py-2 ${danger ? "border-bear/30 bg-bear/10" : accent ? "border-bull/30 bg-bull/10" : "border-border bg-muted/30"}`}>
      <div className="text-[9px] uppercase tracking-widest font-bold text-muted-foreground">{label}</div>
      <div className={`text-sm font-black mt-0.5 truncate tabular-nums ${danger ? "text-bear" : accent ? "text-bull" : ""}`}>{value}</div>
    </div>
  );
}

function ProgressTrack({ icon, label, fromLabel, toLabel, pct, rightValue, hint, color }: {
  icon: React.ReactNode; label: string; fromLabel: string; toLabel: string;
  pct: number; rightValue: string; hint?: string; color: "bull" | "bear";
}) {
  const w = Math.max(2, Math.min(100, pct * 100));
  const isBull = color === "bull";

  // Animated counter — smoothly counts from old value to new value
  const [displayPct, setDisplayPct] = useState(w);
  const prevWRef = useRef(w);
  const timerRef = useRef<ReturnType<typeof setInterval> | null>(null);

  useEffect(() => {
    const start = prevWRef.current;
    const end = w;
    prevWRef.current = w;

    if (Math.abs(end - start) < 0.05) return;

    if (timerRef.current) clearInterval(timerRef.current);

    const STEPS = 28;
    const DURATION_MS = 700;
    let step = 0;

    timerRef.current = setInterval(() => {
      step++;
      // ease-out cubic
      const t = step / STEPS;
      const eased = 1 - Math.pow(1 - t, 3);
      const next = start + (end - start) * eased;
      setDisplayPct(next);
      if (step >= STEPS) {
        setDisplayPct(end);
        if (timerRef.current) clearInterval(timerRef.current);
      }
    }, DURATION_MS / STEPS);

    return () => { if (timerRef.current) clearInterval(timerRef.current); };
  }, [w]);

  // badge pops in when value changes
  const [popKey, setPopKey] = useState(0);
  const prevRounded = useRef(Math.round(w * 10));
  useEffect(() => {
    const next = Math.round(w * 10);
    if (next !== prevRounded.current) {
      prevRounded.current = next;
      setPopKey((k) => k + 1);
    }
  }, [w]);

  return (
    <div className="rounded-xl border border-border bg-muted/20 p-3 relative overflow-hidden">
      <style>{`
        @keyframes progress-glow-bull {
          0%, 100% {
            box-shadow:
              0 0 2px 0px color-mix(in oklab, var(--bull) 12%, transparent),
              0 0 4px 1px color-mix(in oklab, var(--bull) 5%, transparent);
          }
          50% {
            box-shadow:
              0 0 3px 1px color-mix(in oklab, var(--bull) 18%, transparent),
              0 0 6px 1px color-mix(in oklab, var(--bull) 8%, transparent);
          }
        }
        @keyframes progress-glow-bear {
          0%, 100% {
            box-shadow:
              0 0 2px 0px color-mix(in oklab, var(--bear) 12%, transparent),
              0 0 4px 1px color-mix(in oklab, var(--bear) 5%, transparent);
          }
          50% {
            box-shadow:
              0 0 3px 1px color-mix(in oklab, var(--bear) 18%, transparent),
              0 0 6px 1px color-mix(in oklab, var(--bear) 8%, transparent);
          }
        }
        @keyframes progress-shimmer {
          0%   { transform: translateX(-160%) skewX(-12deg); opacity: 0; }
          20%  { opacity: 0.6; }
          80%  { opacity: 0.6; }
          100% { transform: translateX(280%) skewX(-12deg); opacity: 0; }
        }
        @keyframes progress-tip-beat-bull {
          0%, 100% {
            transform: translateY(-50%) scale(1);
            box-shadow:
              0 0 2px 1px color-mix(in oklab, var(--bull) 20%, transparent),
              0 0 4px 1px color-mix(in oklab, var(--bull) 9%, transparent);
          }
          50% {
            transform: translateY(-50%) scale(1.15);
            box-shadow:
              0 0 3px 1px color-mix(in oklab, var(--bull) 28%, transparent),
              0 0 6px 2px color-mix(in oklab, var(--bull) 12%, transparent);
          }
        }
        @keyframes progress-tip-beat-bear {
          0%, 100% {
            transform: translateY(-50%) scale(1);
            box-shadow:
              0 0 2px 1px color-mix(in oklab, var(--bear) 20%, transparent),
              0 0 4px 1px color-mix(in oklab, var(--bear) 9%, transparent);
          }
          50% {
            transform: translateY(-50%) scale(1.15);
            box-shadow:
              0 0 3px 1px color-mix(in oklab, var(--bear) 28%, transparent),
              0 0 6px 2px color-mix(in oklab, var(--bear) 12%, transparent);
          }
        }
        @keyframes pct-badge-pop {
          0%   { transform: translateX(-50%) scale(0.75); opacity: 0; }
          60%  { transform: translateX(-50%) scale(1.12); opacity: 1; }
          100% { transform: translateX(-50%) scale(1);    opacity: 1; }
        }
        @keyframes pct-digit-up {
          0%   { transform: translateY(60%); opacity: 0; }
          100% { transform: translateY(0);   opacity: 1; }
        }
        .progress-bar-glow-bull { animation: progress-glow-bull 2s ease-in-out infinite; }
        .progress-bar-glow-bear { animation: progress-glow-bear 2s ease-in-out 0.4s infinite; }
        .progress-shimmer        { animation: progress-shimmer  2.4s ease-in-out infinite; }
        .progress-tip-bull       { animation: progress-tip-beat-bull 1.8s ease-in-out infinite; }
        .progress-tip-bear       { animation: progress-tip-beat-bear 1.8s ease-in-out 0.4s infinite; }
        .pct-badge-pop           { animation: pct-badge-pop 0.35s cubic-bezier(0.22,1,0.36,1) both; }
        .pct-digit-up            { animation: pct-digit-up 0.22s ease-out both; }
      `}</style>

      <div className="flex items-center justify-between text-[10px] uppercase tracking-widest font-bold text-muted-foreground">
        <span className="flex items-center gap-1.5">{icon}{label}</span>
        <span className={`text-sm font-black tabular-nums ${isBull ? "text-bull" : "text-bear"}`}>{rightValue}</span>
      </div>

      {/* Track — extra top padding to make room for the floating badge */}
      <div className="relative mt-5" style={{ paddingBottom: "2px" }}>
        <div className="relative h-2 rounded-full bg-muted/60" style={{ overflow: "visible" }}>

          {/* Filled bar */}
          <div
            className={`relative h-full rounded-full transition-[width] duration-700 overflow-hidden ${isBull ? "progress-bar-glow-bull" : "progress-bar-glow-bear"}`}
            style={{
              width: `${w}%`,
              background: isBull
                ? "linear-gradient(90deg, color-mix(in oklab, var(--bull) 55%, transparent) 0%, var(--bull) 100%)"
                : "linear-gradient(90deg, color-mix(in oklab, var(--bear) 55%, transparent) 0%, var(--bear) 100%)",
            }}
          >
            {/* Shimmer sweep */}
            <div
              className="progress-shimmer absolute inset-y-0 pointer-events-none"
              style={{
                width: "38%",
                background: "linear-gradient(90deg, transparent, rgba(255,255,255,0.42), transparent)",
                borderRadius: "999px",
              }}
            />
          </div>

          {/* Glowing tip dot */}
          {w > 3 && (
            <div
              className={isBull ? "progress-tip-bull" : "progress-tip-bear"}
              style={{
                position: "absolute",
                top: "50%",
                left: `calc(${w}% - 5px)`,
                width: "10px",
                height: "10px",
                borderRadius: "999px",
                background: isBull ? "var(--bull)" : "var(--bear)",
                zIndex: 10,
                pointerEvents: "none",
              }}
            />
          )}

          {/* ── Floating percentage badge above tip ── */}
          {w > 3 && (
            <div
              key={popKey}
              className="pct-badge-pop"
              style={{
                position: "absolute",
                top: "-26px",
                left: `${w}%`,
                transform: "translateX(-50%)",
                pointerEvents: "none",
                zIndex: 20,
              }}
            >
              {/* Badge pill */}
              <div
                style={{
                  display: "inline-flex",
                  alignItems: "center",
                  gap: "2px",
                  padding: "2px 6px",
                  borderRadius: "999px",
                  fontSize: "9px",
                  fontWeight: 900,
                  fontVariantNumeric: "tabular-nums",
                  letterSpacing: "0.01em",
                  lineHeight: 1,
                  whiteSpace: "nowrap",
                  background: isBull
                    ? "color-mix(in oklab, var(--bull) 18%, var(--card))"
                    : "color-mix(in oklab, var(--bear) 18%, var(--card))",
                  border: isBull
                    ? "1px solid color-mix(in oklab, var(--bull) 50%, transparent)"
                    : "1px solid color-mix(in oklab, var(--bear) 50%, transparent)",
                  color: isBull ? "var(--bull)" : "var(--bear)",
                  boxShadow: isBull
                    ? "0 0 2px 0px color-mix(in oklab, var(--bull) 10%, transparent)"
                    : "0 0 2px 0px color-mix(in oklab, var(--bear) 10%, transparent)",
                }}
              >
                <span key={`${popKey}-num`} className="pct-digit-up">
                  {displayPct.toFixed(1)}%
                </span>
              </div>
              {/* Connector line from badge to dot */}
              <div
                style={{
                  position: "absolute",
                  left: "50%",
                  transform: "translateX(-50%)",
                  top: "100%",
                  width: "1px",
                  height: "8px",
                  background: isBull
                    ? "linear-gradient(to bottom, color-mix(in oklab, var(--bull) 60%, transparent), transparent)"
                    : "linear-gradient(to bottom, color-mix(in oklab, var(--bear) 60%, transparent), transparent)",
                }}
              />
            </div>
          )}
        </div>
      </div>

      <div className="mt-2 flex items-center justify-between text-[10px] text-muted-foreground">
        <span className="truncate">{fromLabel}</span>
        <span className="truncate">{toLabel}</span>
      </div>
      {hint && <div className="mt-1 text-[10px] font-bold text-muted-foreground">{hint}</div>}
    </div>
  );
}
